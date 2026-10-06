import Foundation
import SwiftUI
import CryptoKit

/// Publishes only photos explicitly selected for the property. Credentials stay in Keychain.
@MainActor
struct BuyerWebsiteService {
    enum Failure: LocalizedError {
        case configuration, noPhotos, response(String), conflict(String)
        var errorDescription: String? {
            switch self {
            case .configuration: "Connectez l’app au serveur depuis Profil → App & site web, ou utilisez le lien du dashboard."
            case .noPhotos: "Ajoutez au moins une photo au bien avant publication."
            case .response(let message): message
            case .conflict(let field): "Le champ \(field) a été modifié dans l’app et sur le web. Choisissez la version à conserver."
            }
        }
    }

    let origin: URL
    let credential: String
    let defaults: UserDefaults
    private let session: URLSession

    init() throws {
        let defaults = UserDefaults.standard
        guard let url = URL(string: defaults.string(forKey: "buyerWebsiteOrigin") ?? ""),
              WebsiteConnectionPolicy.accepts(url),
              let token = WebsiteSessionService.shared.state(for: url)?.accessToken ?? SecureCredentialStore.read(account: "buyerWebsiteAgentToken"), !token.isEmpty else {
            throw Failure.configuration
        }
        let bound = defaults.string(forKey: "buyerWebsiteBoundOrigin") ?? ""
        guard bound.isEmpty || bound == WebsiteConnectionPolicy.canonical(url) else {
            throw Failure.response("Ce téléphone est lié à un autre serveur. Reconnectez son serveur initial pour conserver ses dossiers.")
        }
        origin = url; credential = token; self.defaults = defaults; session = .shared
    }

    init(origin: URL, credential: String, defaults: UserDefaults, session: URLSession) throws {
        guard WebsiteConnectionPolicy.accepts(origin), !credential.isEmpty else {
            throw Failure.configuration
        }
        self.origin = origin; self.credential = credential; self.defaults = defaults; self.session = session
    }

    func request(_ endpoint: String, body: [String: Any]? = nil) async throws -> [String: Any] {
        var request = URLRequest(url: origin.appendingPathComponent("api/agent/" + endpoint))
        request.httpMethod = body == nil ? "GET" : "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let mobile = try await WebsiteSessionService.shared.credentials(for: origin)
        request.setValue("Bearer " + (mobile?.token ?? credential), forHTTPHeaderField: "Authorization")
        if let agency = mobile?.agency { request.setValue(agency, forHTTPHeaderField: "X-PropertyTwin-Agency") }
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        request.timeoutInterval = 120
        let (data, response) = try await session.data(for: request)
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        if let http = response as? HTTPURLResponse, http.statusCode == 409, let field = object["field"] as? String {
            throw Failure.conflict(field)
        }
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            throw Failure.response(object["message"] as? String ?? "Le site est indisponible. Réessayez plus tard.")
        }
        return object
    }

    func publish(property: Property, photos: [PropertyPhoto], agencyName: String, agentName: String, sharing: Bool = true) async throws -> URL {
        if property.isTrashed { throw Failure.response("Restaurez le bien depuis la corbeille avant de le modifier ou de le partager.") }
        let selected = photos.filter { $0.propertyID == property.id }
        if sharing && selected.isEmpty { throw Failure.noPhotos }
        if sharing { try await WebsiteWorkspaceSyncService().synchronize(service: self) }
        let initialDetails = Self.localDetails(property)
        let initialStatus = property.status
        var rooms: [[String: Any]] = []
        // Opaque room keys preserve links without exposing SwiftData UUIDs.
        let groups = Dictionary(grouping: selected) { photo -> String in
            if let remoteRoom = defaults.string(forKey: "buyerWebsitePhotoRoom." + photo.id.uuidString) { return remoteRoom }
            let key = "buyerWebsiteRoom." + property.id.uuidString + "." + (photo.roomID?.uuidString ?? "gallery")
            let publicRoomID = defaults.string(forKey: key) ?? UUID().uuidString.lowercased()
            defaults.set(publicRoomID, forKey: key)
            return publicRoomID
        }
        for publicRoomID in groups.keys.sorted() {
            let photos = groups[publicRoomID]!.sorted {
                let left = defaults.object(forKey: "buyerWebsitePhotoOrder." + $0.id.uuidString) as? Int ?? Int.max
                let right = defaults.object(forKey: "buyerWebsitePhotoOrder." + $1.id.uuidString) as? Int ?? Int.max
                return left == right ? $0.createdAt < $1.createdAt : left < right
            }
            var urls: [String] = []
            for photo in photos {
                let data = try ImageStorageService().data(for: photo.originalRelativePath)
                let result: [String: Any]
                if let existing = defaults.string(forKey: "buyerWebsitePhotoURL." + photo.id.uuidString) {
                    result = ["url": existing]
                } else { result = try await cachedUpload(data, type: "image/jpeg") }
                guard let url = result["url"] as? String else { throw Failure.response("L’import de la photo a échoué.") }
                urls.append(url)
                defaults.set(url, forKey: "buyerWebsitePhotoURL." + photo.id.uuidString)
            }
            let name = property.rooms.first { $0.id == photos.first?.roomID }?.name ?? defaults.string(forKey: "buyerWebsiteRoomName." + publicRoomID) ?? "Le logement"
            let remote = defaults.dictionary(forKey: "buyerWebsiteRemote." + property.id.uuidString)
            var room = (remote?["rooms"] as? [[String: Any]])?.first { $0["id"] as? String == publicRoomID } ?? [:]
            room["id"] = publicRoomID; room["name"] = name; room["photos"] = urls
            rooms.append(room)
        }
        for scanned in property.rooms {
            let key = "buyerWebsiteRoom." + property.id.uuidString + "." + scanned.id.uuidString
            let id = defaults.string(forKey: key) ?? UUID().uuidString.lowercased()
            defaults.set(id, forKey: key)
            if !rooms.contains(where: { $0["id"] as? String == id }) {
                rooms.append(["id": id, "name": scanned.name, "photos": []])
            }
        }
        // Photo-only rooms imported from the dashboard have no native RoomPlan geometry.
        let remoteRooms = (defaults.dictionary(forKey: "buyerWebsiteRemote." + property.id.uuidString)?["rooms"] as? [[String: Any]]) ?? []
        let priorScans = (defaults.dictionary(forKey: "buyerWebsiteLocal." + property.id.uuidString)?["scans"] as? [[String: Any]]) ?? []
        for room in remoteRooms where (room["photos"] as? [String] ?? []).isEmpty {
            guard let id = room["id"] as? String, !rooms.contains(where: { $0["id"] as? String == id }),
                  !priorScans.contains(where: { $0["room"] as? String == id }) else { continue }
            rooms.append(room)
        }
        rooms.sort { ($0["id"] as? String ?? "") < ($1["id"] as? String ?? "") }
        let previousRemote = defaults.dictionary(forKey: "buyerWebsiteRemote." + property.id.uuidString) ?? [:]
        let brandingMode = previousRemote["brandingMode"] as? String ?? (previousRemote.isEmpty ? "workspace" : "custom")
        var agency = previousRemote["agency"] as? [String: Any] ?? [:]
        var agent = previousRemote["agent"] as? [String: Any] ?? [:]
        let brandingKey = "buyerWebsiteBrandingLocal." + property.id.uuidString
        let previousBranding = defaults.dictionary(forKey: brandingKey)
        if brandingMode != "custom" && previousBranding?["agency"] as? String != agencyName {
            if agencyName.isEmpty { agency.removeValue(forKey: "name") } else { agency["name"] = agencyName }
        }
        if brandingMode != "custom" && previousBranding?["agent"] as? String != agentName {
            if agentName.isEmpty { agent.removeValue(forKey: "name"); agent.removeValue(forKey: "firstName") }
            else { agent["name"] = agentName; agent["firstName"] = agentName.components(separatedBy: " ").first ?? agentName }
        }
        var body: [String: Any] = [
            "title": property.name, "location": [property.address, property.city].filter { !$0.isEmpty }.joined(separator: " · "),
            "description": property.listingDescription, "rooms": rooms, "address": property.address, "city": property.city, "postalCode": property.postalCode,
            "agency": agency, "agent": agent, "brandingMode": brandingMode,
            "listingType": property.type.rawValue
        ]
        if let primary = selected.first(where: { $0.isPrimary }), let path = defaults.string(forKey: "buyerWebsitePhotoURL." + primary.id.uuidString) { body["hero"] = path }
        var scans: [[String: Any]] = []
        for scanned in property.rooms {
            let key = "buyerWebsiteRoom." + property.id.uuidString + "." + scanned.id.uuidString
            guard let id = defaults.string(forKey: key) else { continue }
            var scan: [String: Any] = ["room": id, "geometry": scanned.geometryData.base64EncodedString(), "type": scanned.typeRawValue, "floorLevel": scanned.floorLevel]
            if let area = scanned.area { scan["area"] = area }
            if !scanned.usdzRelativePath.isEmpty, let url = ScanStorageService().url(for: scanned.usdzRelativePath) {
                let result = try await cachedUpload(Data(contentsOf: url), type: "model/vnd.usdz+zip")
                scan["model"] = result["url"]
            }
            scans.append(scan)
        }
        if !scans.isEmpty { body["scans"] = scans.sorted { ($0["room"] as? String ?? "") < ($1["room"] as? String ?? "") } }
        if let value = property.price { body["price"] = value }
        if let value = property.displayArea { body["surface"] = value }
        if let value = property.expectedRoomCount { body["roomsCount"] = value }
        if let value = property.floor { body["floor"] = value }
        if let geometry = property.structureGeometry, !geometry.walls.isEmpty {
            let renderer = ImageRenderer(content: FloorPlanView(geometry: geometry, compact: true, showDimensions: false).frame(width: 1200, height: 900))
            renderer.scale = 1
            if let image = renderer.uiImage, let data = image.pngData() {
                let uploaded = try await cachedUpload(data, type: "image/png")
                if let path = uploaded["url"] as? String { body["floorplan"] = ["image": path] }
            }
        }
        if !property.structureUSDZRelativePath.isEmpty,
           let url = ScanStorageService().url(for: property.structureUSDZRelativePath) {
            let data = try Data(contentsOf: url)
            let uploaded = try await cachedUpload(data, type: "model/vnd.usdz+zip")
            if let path = uploaded["url"] as? String { body["model3d"] = path }
        }
        // Use one snapshot even when media uploads allow edits before the sync request.
        for field in Self.detailFields { body[field] = initialDetails[field] }
        let key = "buyerWebsiteSlug." + property.id.uuidString
        let localKey = "buyerWebsiteLocal." + property.id.uuidString
        let remoteKey = "buyerWebsiteRemote." + property.id.uuidString
        let previous = defaults.dictionary(forKey: localKey) ?? [:]
        let baseline = defaults.dictionary(forKey: remoteKey) ?? [:]
        var patch: [String: Any] = [:]
        for field in Set(body.keys).union(previous.keys) {
            let value = body[field] ?? NSNull()
            if !Self.equalJSON(value, previous[field] ?? NSNull()) { patch[field] = value }
        }
        var syncBody: [String: Any] = ["clientKey": property.shareSlug, "patch": patch, "baseline": baseline]
        if let slug = defaults.string(forKey: key) { syncBody["slug"] = slug }
        defaults.set(body, forKey: "buyerWebsitePending." + property.id.uuidString)
        let result: [String: Any]
        do { result = try await request("sync", body: syncBody) }
        catch Failure.conflict(let field) {
            defaults.set(field, forKey: "buyerWebsiteConflict." + property.id.uuidString)
            throw Failure.conflict(field)
        }
        defaults.removeObject(forKey: "buyerWebsiteConflict." + property.id.uuidString)
        guard let remote = result["property"] as? [String: Any], let slug = remote["slug"] as? String else {
            throw Failure.response("La synchronisation n’a pas retourné le dossier.")
        }
        defaults.set(slug, forKey: key)
        defaults.set(body, forKey: localKey)
        let currentDetails = Self.localDetails(property)
        var changed = Set(Self.detailFields.filter { !Self.equalJSON(currentDetails[$0] ?? NSNull(), initialDetails[$0] ?? NSNull()) })
        // Address and its display location represent the same native fields.
        let addressFields: Set<String> = ["location", "address", "city", "postalCode"]
        if !changed.isDisjoint(with: addressFields) { changed.formUnion(addressFields) }
        var safeRemote = remote
        var acceptedRemote = remote
        var accepted = body
        for field in Self.detailFields {
            if changed.contains(field) {
                safeRemote[field] = currentDetails[field] ?? NSNull()
                if patch[field] == nil { acceptedRemote[field] = baseline[field] }
            } else { accepted[field] = remote[field] }
        }
        let currentStatus = property.status
        applyDetails(safeRemote, to: property)
        if currentStatus != initialStatus { property.status = currentStatus }
        defaults.set(acceptedRemote, forKey: remoteKey)
        // Acknowledge sent values, keeping newer edits pending for the next cycle.
        accepted["agency"] = remote["agency"] ?? [:]
        accepted["agent"] = remote["agent"] ?? [:]
        defaults.set(accepted, forKey: localKey)
        defaults.set(["agency": agencyName, "agent": agentName], forKey: brandingKey)
        if sharing {
            let prepared = try await request("prepare-share", body: ["slug": slug])
            if let latest = prepared["property"] as? [String: Any] {
                var preparedBaseline = latest
                let afterSharing = Self.localDetails(property)
                for field in Self.detailFields where !Self.equalJSON(afterSharing[field] ?? NSNull(), accepted[field] ?? NSNull()) {
                    preparedBaseline[field] = acceptedRemote[field]
                }
                defaults.set(preparedBaseline, forKey: remoteKey)
                defaults.set(latest, forKey: "buyerWebsiteRemovalRemote." + property.id.uuidString)
            }
            property.status = .published
        }
        return origin.appendingPathComponent("p/" + slug)
    }
    func resolveConflict(property: Property, keepLocal: Bool) async throws {
        let suffix = property.id.uuidString
        guard let field = defaults.string(forKey: "buyerWebsiteConflict." + suffix),
              let slug = defaults.string(forKey: "buyerWebsiteSlug." + suffix) else { return }
        let result = try await request("sync", body: ["clientKey": property.shareSlug, "slug": slug, "patch": [:]])
        guard let remote = result["property"] as? [String: Any] else { throw Failure.response("Le dossier web est indisponible.") }
        var baseline = defaults.dictionary(forKey: "buyerWebsiteRemote." + suffix) ?? [:]
        baseline[field] = remote[field]
        defaults.set(baseline, forKey: "buyerWebsiteRemote." + suffix)
        if !keepLocal {
            var previous = defaults.dictionary(forKey: "buyerWebsiteLocal." + suffix) ?? [:]
            let pending = defaults.dictionary(forKey: "buyerWebsitePending." + suffix) ?? [:]
            previous[field] = pending[field]
            defaults.set(previous, forKey: "buyerWebsiteLocal." + suffix)
        }
        defaults.removeObject(forKey: "buyerWebsiteConflict." + suffix)
    }

    func download(_ url: URL) async throws -> (Data, URLResponse) {
        try await session.data(from: url)
    }

    func cachedUpload(_ data: Data, type: String) async throws -> [String: Any] {
        let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        let key = "buyerWebsiteUpload." + origin.absoluteString + "." + hash
        if let url = defaults.string(forKey: key) { return ["url": url] }
        let result = try await request("upload", body: ["type": type, "base64": data.base64EncodedString()])
        if let url = result["url"] as? String { defaults.set(url, forKey: key) }
        return result
    }

    static func equalJSON(_ a: Any, _ b: Any) -> Bool {
        guard let left = try? JSONSerialization.data(withJSONObject: a, options: [.sortedKeys, .fragmentsAllowed]),
              let right = try? JSONSerialization.data(withJSONObject: b, options: [.sortedKeys, .fragmentsAllowed]) else { return false }
        return left == right
    }

    private static let detailFields = ["title", "location", "address", "city", "postalCode", "description", "price", "surface", "roomsCount", "floor", "listingType"]

    private static func localDetails(_ property: Property) -> [String: Any] {
        var values: [String: Any] = [
            "title": property.name, "description": property.listingDescription,
            "location": [property.address, property.city].filter { !$0.isEmpty }.joined(separator: " · "),
            "address": property.address, "city": property.city, "postalCode": property.postalCode,
            "listingType": property.type.rawValue
        ]
        values["price"] = property.price; values["surface"] = property.displayArea
        values["roomsCount"] = property.expectedRoomCount; values["floor"] = property.floor
        return values
    }

    func applyDetails(_ remote: [String: Any], to property: Property) {
        property.name = remote["title"] as? String ?? property.name
        property.listingDescription = remote["description"] as? String ?? ""
        if remote["address"] != nil || remote["city"] != nil {
            property.address = remote["address"] as? String ?? ""
            property.city = remote["city"] as? String ?? ""
            property.postalCode = remote["postalCode"] as? String ?? ""
        } else {
            let location = remote["location"] as? String ?? ""
            if location != [property.address, property.city].filter({ !$0.isEmpty }).joined(separator: " · ") {
                property.address = location; property.city = ""
            }
        }
        if let status = remote["status"] as? String {
            switch status {
            case "Published", "Unlisted": property.status = .published
            case "Archived": property.status = .archived
            case "Draft": if property.status != .ready { property.status = .draft }
            default: break
            }
        }
        property.price = remote["price"] as? Double
        property.announcedArea = remote["surface"] as? Double
        property.expectedRoomCount = remote["roomsCount"] as? Int
        property.floor = remote["floor"] as? Int
        if let type = remote["listingType"] as? String, let mapped = PropertyType(rawValue: type) { property.type = mapped }
    }

    func activity(property: Property) async throws -> [BuyerWebsiteVisit] {
        guard let slug = defaults.string(forKey: "buyerWebsiteSlug." + property.id.uuidString) else { return [] }
        let result = try await request("activity", body: [:])
        let sessions = result["sessions"] as? [[String: Any]] ?? []
        return sessions.filter { $0["slug"] as? String == slug }.map { item in
            let lead = item["lead"] as? [String: Any]
            let events = item["events"] as? [[String: Any]] ?? []
            let duration = events.reduce(0.0) { $0 + ($1["duration"] as? Double ?? 0) }
            return BuyerWebsiteVisit(id: item["id"] as? String ?? UUID().uuidString,
                name: lead?["name"] as? String ?? "Visiteur anonyme", visits: item["visits"] as? Int ?? 0,
                duration: duration, events: events.map { BuyerWebsiteVisit.Event(type: $0["type"] as? String ?? "", at: $0["at"] as? String ?? "") })
        }
    }

}

struct BuyerWebsiteVisit: Identifiable {
    let id: String
    let name: String
    let visits: Int
    let duration: Double
    let events: [Event]
    struct Event { let type: String; let at: String }
}
