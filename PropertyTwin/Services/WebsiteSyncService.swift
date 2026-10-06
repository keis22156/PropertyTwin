import Foundation
import SwiftData

/// One worker per active app scene. Local edits are retried after reconnecting.
@MainActor
final class WebsiteSyncService {
    static let shared = WebsiteSyncService()
    private var running = false

    func synchronize(context: ModelContext, using configuredService: BuyerWebsiteService? = nil) async throws {
        guard !running else { return }
        running = true
        defer { running = false }
        let service = try configuredService ?? BuyerWebsiteService()
        let defaults = service.defaults
        var failures: [String] = []
        do { try await WebsiteWorkspaceSyncService().synchronize(service: service) }
        catch { failures.append("Identité de l’agence : " + error.localizedDescription) }
        let feed = try await service.request("sync-feed")
        let remoteProperties = feed["properties"] as? [[String: Any]] ?? []
        var localProperties = try context.fetch(FetchDescriptor<Property>())
        for remote in remoteProperties {
            guard let slug = remote["slug"] as? String else { continue }
            if remote["deletedAt"] == nil && !localProperties.contains(where: { defaults.string(forKey: "buyerWebsiteSlug." + $0.id.uuidString) == slug }) {
                let property = Property(name: remote["title"] as? String ?? "Bien", type: .other)
                service.applyDetails(remote, to: property)
                context.insert(property)
                defaults.set(slug, forKey: "buyerWebsiteSlug." + property.id.uuidString)
                defaults.set(remote, forKey: "buyerWebsiteRemote." + property.id.uuidString)
                // Baseline core fields prevents a fresh import from overwriting its source.
                var projection: [String: Any] = [:]
                for field in ["title", "location", "address", "city", "postalCode", "description", "price", "surface", "roomsCount", "floor", "listingType"] {
                    projection[field] = remote[field]
                }
                projection["agency"] = remote["agency"] ?? [:]
                projection["agent"] = remote["agent"] ?? [:]
                projection["rooms"] = []
                defaults.set(projection, forKey: "buyerWebsiteLocal." + property.id.uuidString)
                defaults.set(["agency": defaults.string(forKey: "buyerWebsiteAgencyName") ?? "", "agent": defaults.string(forKey: "agentFirstName") ?? ""], forKey: "buyerWebsiteBrandingLocal." + property.id.uuidString)
                localProperties.append(property)
            }
        }
        var photos = try context.fetch(FetchDescriptor<PropertyPhoto>())
        for property in localProperties {
            let suffix = property.id.uuidString
            let removalKey = "buyerWebsiteRemovalLocal." + suffix
            let remoteKey = "buyerWebsiteRemote." + suffix
            if let slug = defaults.string(forKey: "buyerWebsiteSlug." + suffix),
               let remote = remoteProperties.first(where: { $0["slug"] as? String == slug }) {
                let priorRemoval = defaults.bool(forKey: removalKey)
                let remoteRemoved = remote["deletedAt"] != nil
                do {
                    if property.isTrashed != priorRemoval && property.isTrashed != remoteRemoved {
                        let baseline = defaults.dictionary(forKey: "buyerWebsiteRemovalRemote." + suffix) ?? defaults.dictionary(forKey: remoteKey) ?? [:]
                        let result = try await service.request("removal", body: ["slug": slug, "removed": property.isTrashed, "baseline": baseline])
                        defaults.set(result["property"], forKey: "buyerWebsiteRemovalRemote." + suffix)
                    } else {
                        if property.isTrashed == priorRemoval { property.isTrashed = remoteRemoved }
                        defaults.set(remote, forKey: "buyerWebsiteRemovalRemote." + suffix)
                    }
                    defaults.set(property.isTrashed, forKey: removalKey)
                } catch BuyerWebsiteService.Failure.conflict(_) {
                    failures.append(property.name + " : le dossier a changé sur le web. Annulez son retrait depuis la corbeille, synchronisez-le puis recommencez.")
                    continue
                } catch {
                    failures.append(property.name + " : " + error.localizedDescription)
                    continue
                }
            }
            if property.isTrashed { continue }
            if let conflict = defaults.string(forKey: "buyerWebsiteConflict." + property.id.uuidString) {
                failures.append(property.name + " : conflit sur " + conflict)
                continue
            }
            do {
            if let slug = defaults.string(forKey: "buyerWebsiteSlug." + property.id.uuidString),
               let remote = remoteProperties.first(where: { $0["slug"] as? String == slug }) {
                if defaults.dictionary(forKey: "buyerWebsiteRemote." + property.id.uuidString) == nil {
                    defaults.set(remote, forKey: "buyerWebsiteRemote." + property.id.uuidString)
                }
                let previous = defaults.dictionary(forKey: "buyerWebsiteLocal." + property.id.uuidString)
                let remoteScans = remote["scans"] as? [[String: Any]] ?? []
                let priorScans = previous?["scans"] as? [[String: Any]] ?? []
                let existingScans = property.rooms.compactMap { room -> [String: Any]? in
                    guard let id = defaults.string(forKey: "buyerWebsiteRoom." + property.id.uuidString + "." + room.id.uuidString) else { return nil }
                    var result: [String: Any] = ["room": id, "geometry": room.geometryData.base64EncodedString(), "floorLevel": room.floorLevel, "type": room.typeRawValue]
                    if let area = room.area { result["area"] = area }; return result
                }
                let priorComparable = priorScans.map { scan in scan.filter { ["room", "geometry", "floorLevel", "type", "area"].contains($0.key) } }
                if existingScans.count == property.rooms.count && BuyerWebsiteService.equalJSON(existingScans.sorted { ($0["room"] as? String ?? "") < ($1["room"] as? String ?? "") }, priorComparable.sorted { ($0["room"] as? String ?? "") < ($1["room"] as? String ?? "") }) {
                    let desiredIDs = Set(remoteScans.compactMap { $0["room"] as? String })
                    for room in property.rooms where !desiredIDs.contains(defaults.string(forKey: "buyerWebsiteRoom." + property.id.uuidString + "." + room.id.uuidString) ?? "") {
                        property.rooms.removeAll { $0.id == room.id }; context.delete(room)
                    }
                    for scan in remoteScans {
                        guard let id = scan["room"] as? String, let encoded = scan["geometry"] as? String,
                              let data = Data(base64Encoded: encoded), let geometry = try? JSONDecoder().decode(RoomGeometry.self, from: data) else { continue }
                        let name = (remote["rooms"] as? [[String: Any]])?.first { $0["id"] as? String == id }?["name"] as? String ?? "Pièce"
                        let room: ScannedRoom
                        if let existing = property.rooms.first(where: { defaults.string(forKey: "buyerWebsiteRoom." + property.id.uuidString + "." + $0.id.uuidString) == id }) {
                            room = existing; room.geometryData = data; room.name = name; room.area = scan["area"] as? Double
                            room.typeRawValue = scan["type"] as? String ?? RoomType.other.rawValue
                        } else {
                            room = try ScannedRoom(name: name, type: RoomType(rawValue: scan["type"] as? String ?? "") ?? .other, area: scan["area"] as? Double, usdzRelativePath: "", geometry: geometry)
                            room.property = property; property.rooms.append(room); context.insert(room)
                            defaults.set(id, forKey: "buyerWebsiteRoom." + property.id.uuidString + "." + room.id.uuidString)
                        }
                        room.floorLevel = scan["floorLevel"] as? Int ?? 0
                        if let path = scan["model"] as? String, defaults.string(forKey: "buyerWebsiteScanModel." + room.id.uuidString) != path,
                           let url = URL(string: path, relativeTo: service.origin)?.absoluteURL {
                            let (data, response) = try await service.download(url)
                            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode), data.count <= 50_000_000 else { throw BuyerWebsiteService.Failure.response("Le modèle de la pièce ne peut pas être importé.") }
                            let filename = "synced-" + room.id.uuidString + ".usdz"
                            guard let localURL = ScanStorageService().url(for: filename) else { throw BuyerWebsiteService.Failure.response("Stockage du scan indisponible.") }
                            try data.write(to: localURL, options: .atomic); room.usdzRelativePath = filename
                            defaults.set(path, forKey: "buyerWebsiteScanModel." + room.id.uuidString)
                        }
                    }
                }
                // Import media only before local photo edits; simultaneous room edits are rejected by /sync.
                let knownURLs = Set(photos.filter { $0.propertyID == property.id }.compactMap { defaults.string(forKey: "buyerWebsitePhotoURL." + $0.id.uuidString) })
                let remoteRooms = remote["rooms"] as? [[String: Any]] ?? []
                let previousRooms = previous?["rooms"] as? [[String: Any]] ?? []
                let previousURLs = Set(previousRooms.flatMap { $0["photos"] as? [String] ?? [] })
                if knownURLs == previousURLs {
                    let desiredURLs = Set(remoteRooms.flatMap { $0["photos"] as? [String] ?? [] })
                    for photo in photos.filter({ $0.propertyID == property.id }) {
                        if let url = defaults.string(forKey: "buyerWebsitePhotoURL." + photo.id.uuidString), !desiredURLs.contains(url) {
                            context.delete(photo); photos.removeAll { $0.id == photo.id }
                        }
                    }
                    for room in remoteRooms {
                        guard let roomID = room["id"] as? String else { continue }
                        defaults.set(room["name"], forKey: "buyerWebsiteRoomName." + roomID)
                        for (order, path) in (room["photos"] as? [String] ?? []).enumerated() {
                            if let existing = photos.first(where: { $0.propertyID == property.id && defaults.string(forKey: "buyerWebsitePhotoURL." + $0.id.uuidString) == path }) {
                                defaults.set(roomID, forKey: "buyerWebsitePhotoRoom." + existing.id.uuidString)
                                defaults.set(order, forKey: "buyerWebsitePhotoOrder." + existing.id.uuidString)
                                existing.isPrimary = remote["hero"] as? String == path
                                existing.roomID = property.rooms.first { defaults.string(forKey: "buyerWebsiteRoom." + property.id.uuidString + "." + $0.id.uuidString) == roomID }?.id
                                continue
                            }
                            guard let url = URL(string: path, relativeTo: service.origin)?.absoluteURL else { continue }
                            let (data, response) = try await service.download(url)
                            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode), data.count <= 8_000_000 else {
                                throw BuyerWebsiteService.Failure.response("Une photo du dashboard ne peut pas être importée.")
                            }
                            let stored = try ImageStorageService().store(data)
                            let photo = PropertyPhoto(propertyID: property.id, originalRelativePath: stored.original, thumbnailRelativePath: stored.thumbnail, isPrimary: remote["hero"] as? String == path)
                            defaults.set(path, forKey: "buyerWebsitePhotoURL." + photo.id.uuidString)
                            defaults.set(order, forKey: "buyerWebsitePhotoOrder." + photo.id.uuidString)
                            defaults.set(roomID, forKey: "buyerWebsitePhotoRoom." + photo.id.uuidString)
                            photo.roomID = property.rooms.first { defaults.string(forKey: "buyerWebsiteRoom." + property.id.uuidString + "." + $0.id.uuidString) == roomID }?.id
                            context.insert(photo); photos.append(photo)
                        }
                    }
                    // Set the imported rooms baseline using the same stable ordering as the uploader.
                    var baseline = previous ?? [:]
                    baseline["rooms"] = remoteRooms.sorted { ($0["id"] as? String ?? "") < ($1["id"] as? String ?? "") }
                    defaults.set(baseline, forKey: "buyerWebsiteLocal." + property.id.uuidString)
                }
            }
            _ = try await service.publish(property: property, photos: photos,
                agencyName: defaults.string(forKey: "buyerWebsiteAgencyName") ?? "",
                agentName: defaults.string(forKey: "agentFirstName") ?? "", sharing: false)
            if let latest = defaults.dictionary(forKey: remoteKey) { defaults.set(latest, forKey: "buyerWebsiteRemovalRemote." + suffix) }
            } catch {
                failures.append(property.name + " : " + error.localizedDescription)
            }
        }
        try context.save()
        do { try await WebsiteLeadSyncService().synchronize(service: service, context: context) }
        catch { failures.append("Contacts : " + error.localizedDescription) }
        do { try await WebsiteBusinessSyncService().synchronize(service: service, context: context) }
        catch { failures.append("Données complémentaires : " + error.localizedDescription) }
        if !failures.isEmpty { throw BuyerWebsiteService.Failure.response(failures.joined(separator: "\n")) }
    }
}
