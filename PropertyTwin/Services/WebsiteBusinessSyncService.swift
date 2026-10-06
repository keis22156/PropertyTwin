import Foundation
import SwiftData

@MainActor
struct WebsiteBusinessSyncService {
    private struct Record {
        let id: UUID
        let propertyID: UUID
        let kind: String
        let fields: [String: Any]
        let apply: ([String: Any]) async throws -> Void
    }

    func synchronize(service: BuyerWebsiteService, context: ModelContext) async throws {
        let defaults = service.defaults
        let properties = try context.fetch(FetchDescriptor<Property>()).filter { !$0.isTrashed }
        let propertyIDs = Set(properties.map(\.id))
        let offers = try context.fetch(FetchDescriptor<OfferIntent>()).filter { propertyIDs.contains($0.propertyID) }
        let measurements = try context.fetch(FetchDescriptor<FurnitureMeasurement>()).filter { propertyIDs.contains($0.propertyID) }
        func roomID(_ value: Any?, propertyID: UUID) -> UUID? {
            guard let key = value as? String else { return nil }
            return properties.first(where: { $0.id == propertyID })?.rooms.first { defaults.string(forKey: "buyerWebsiteRoom." + propertyID.uuidString + "." + $0.id.uuidString) == key }?.id
        }
        func sourcePhotoID(_ value: Any?, propertyID: UUID) throws -> UUID? {
            guard let key = value as? String else { return nil }
            return try context.fetch(FetchDescriptor<PropertyPhoto>()).first { $0.propertyID == propertyID && defaults.string(forKey: "buyerWebsitePhotoURL." + $0.id.uuidString) == key }?.id
        }
        var records: [Record] = []
        for offer in offers {
            records.append(Record(id: offer.id, propertyID: offer.propertyID, kind: "offer", fields: ["amount": offer.amount, "financing": offer.financingRawValue, "message": offer.message], apply: { data in
                offer.amount = data["amount"] as? Double ?? offer.amount
                offer.financingRawValue = data["financing"] as? String ?? offer.financingRawValue
                offer.message = data["message"] as? String ?? offer.message
            }))
        }
        for item in measurements {
            var fields: [String: Any] = ["name": item.name, "widthCM": item.widthCM, "depthCM": item.depthCM, "heightCM": item.heightCM]
            if let id = item.roomID, let room = defaults.string(forKey: "buyerWebsiteRoom." + item.propertyID.uuidString + "." + id.uuidString) { fields["room"] = room }
            records.append(Record(id: item.id, propertyID: item.propertyID, kind: "measurement", fields: fields, apply: { data in
                item.name = data["name"] as? String ?? item.name
                item.roomID = roomID(data["room"], propertyID: item.propertyID)
                item.widthCM = data["widthCM"] as? Double ?? item.widthCM
                item.depthCM = data["depthCM"] as? Double ?? item.depthCM
                item.heightCM = data["heightCM"] as? Double ?? item.heightCM
            }))
        }
        for variant in try context.fetch(FetchDescriptor<DesignVariant>()).filter({ propertyIDs.contains($0.propertyID) }) {
            let prefix = "buyerWebsiteRecord." + variant.id.uuidString
            let image: String
            if defaults.string(forKey: prefix + ".imagePath") == variant.imageRelativePath,
               let url = defaults.string(forKey: prefix + ".imageURL") { image = url }
            else {
                let uploaded = try await service.cachedUpload(ImageStorageService().data(for: variant.imageRelativePath), type: "image/jpeg")
                guard let url = uploaded["url"] as? String else { continue }; image = url
                defaults.set(image, forKey: prefix + ".imageURL"); defaults.set(variant.imageRelativePath, forKey: prefix + ".imagePath")
            }
            guard let room = defaults.string(forKey: "buyerWebsiteRoom." + variant.propertyID.uuidString + "." + variant.roomID.uuidString) else { continue }
            var fields: [String: Any] = ["title": variant.title, "style": variant.style, "prompt": variant.prompt, "image": image, "isFavorite": variant.isFavorite, "room": room]
            if let id = variant.sourcePhotoID, let source = defaults.string(forKey: "buyerWebsitePhotoURL." + id.uuidString) { fields["sourcePhoto"] = source }
            records.append(Record(id: variant.id, propertyID: variant.propertyID, kind: "variant", fields: fields, apply: { data in
                variant.title = data["title"] as? String ?? variant.title
                variant.style = data["style"] as? String ?? variant.style
                variant.prompt = data["prompt"] as? String ?? variant.prompt
                variant.isFavorite = data["isFavorite"] as? Bool ?? variant.isFavorite
                if let room = properties.first(where: { $0.id == variant.propertyID })?.rooms.first(where: { defaults.string(forKey: "buyerWebsiteRoom." + variant.propertyID.uuidString + "." + $0.id.uuidString) == data["room"] as? String }) { variant.roomID = room.id }
                variant.sourcePhotoID = try sourcePhotoID(data["sourcePhoto"], propertyID: variant.propertyID)
                if let path = data["image"] as? String, path != image, let url = URL(string: path, relativeTo: service.origin)?.absoluteURL {
                    let (bytes,response) = try await service.download(url)
                    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode), bytes.count <= 8_000_000 else { throw BuyerWebsiteService.Failure.response("Variante distante indisponible.") }
                    let stored = try ImageStorageService().store(bytes); variant.imageRelativePath = stored.original
                    defaults.set(path, forKey: prefix + ".imageURL"); defaults.set(stored.original, forKey: prefix + ".imagePath")
                }
            }))
        }
        for event in try context.fetch(FetchDescriptor<AnalyticsEvent>()).filter({ propertyIDs.contains($0.propertyID) }) {
            var fields: [String: Any] = ["type": event.typeRawValue, "timestamp": ISO8601DateFormatter().string(from: event.timestamp), "metadata": event.metadataData.base64EncodedString()]
            if let id = event.roomID, let room = defaults.string(forKey: "buyerWebsiteRoom." + event.propertyID.uuidString + "." + id.uuidString) { fields["room"] = room }
            records.append(Record(id: event.id, propertyID: event.propertyID, kind: "event", fields: fields, apply: { data in
                event.typeRawValue = data["type"] as? String ?? event.typeRawValue
                event.roomID = roomID(data["room"], propertyID: event.propertyID)
                if let value = data["timestamp"] as? String, let date = ISO8601DateFormatter().date(from: value) { event.timestamp = date }
                if let encoded = data["metadata"] as? String, let bytes = Data(base64Encoded: encoded) { event.metadataData = bytes }
            }))
        }
        for interaction in try context.fetch(FetchDescriptor<BuyerInteraction>()).filter({ propertyIDs.contains($0.propertyID) }) {
            let fields: [String: Any] = ["event": interaction.eventRawValue, "session": interaction.sessionID.uuidString, "timestamp": ISO8601DateFormatter().string(from: interaction.createdAt)]
            records.append(Record(id: interaction.id, propertyID: interaction.propertyID, kind: "interaction", fields: fields, apply: { data in
                interaction.eventRawValue = data["event"] as? String ?? interaction.eventRawValue
                if let value = data["session"] as? String, let id = UUID(uuidString: value) { interaction.sessionID = id }
                if let value = data["timestamp"] as? String, let date = ISO8601DateFormatter().date(from: value) { interaction.createdAt = date }
            }))
        }
        if let sharedProperty = properties.first {
            for agency in try context.fetch(FetchDescriptor<Agency>()) {
                records.append(Record(id: agency.id, propertyID: sharedProperty.id, kind: "agency", fields: ["name": agency.name, "email": agency.email, "phone": agency.phone, "website": agency.website, "brandHex": agency.brandHex, "address": agency.address], apply: { data in
                    agency.name = data["name"] as? String ?? agency.name
                    agency.email = data["email"] as? String ?? agency.email
                    agency.phone = data["phone"] as? String ?? agency.phone
                    agency.website = data["website"] as? String ?? agency.website
                    agency.brandHex = data["brandHex"] as? String ?? agency.brandHex
                    agency.address = data["address"] as? String ?? agency.address
                }))
            }
            for profile in try context.fetch(FetchDescriptor<UserProfile>()) {
                var fields: [String: Any] = ["firstName": profile.firstName, "lastName": profile.lastName, "email": profile.email]
                if let id = profile.agencyID, let key = defaults.string(forKey: "buyerWebsiteRecord." + id.uuidString + ".id") { fields["agency"] = key }
                records.append(Record(id: profile.id, propertyID: sharedProperty.id, kind: "profile", fields: fields, apply: { data in
                    profile.firstName = data["firstName"] as? String ?? profile.firstName
                    profile.lastName = data["lastName"] as? String ?? profile.lastName
                    profile.email = data["email"] as? String ?? profile.email
                }))
            }
        }
        for record in records {
            guard let property = properties.first(where: { $0.id == record.propertyID }), let slug = defaults.string(forKey: "buyerWebsiteSlug." + property.id.uuidString) else { continue }
            let prefix = "buyerWebsiteRecord." + record.id.uuidString
            let prior = defaults.dictionary(forKey: prefix + ".local") ?? [:]
            var fields = record.fields
            if record.kind == "profile", let profile = try context.fetch(FetchDescriptor<UserProfile>()).first(where: { $0.id == record.id }),
               let agencyID = profile.agencyID, let key = defaults.string(forKey: "buyerWebsiteRecord." + agencyID.uuidString + ".id") { fields["agency"] = key }
            var patch: [String: Any] = [:]
            for (key,value) in fields where !BuyerWebsiteService.equalJSON(value,prior[key] ?? NSNull()) { patch[key] = value }
            for key in ["room", "sourcePhoto", "agency"] where prior[key] != nil && fields[key] == nil { patch[key] = NSNull() }
            var body: [String: Any] = ["kind": record.kind, "slug": slug, "clientKey": defaults.string(forKey: prefix + ".key") ?? UUID().uuidString.lowercased(), "patch": patch, "baseline": defaults.dictionary(forKey: prefix + ".remote") ?? [:]]
            defaults.set(body["clientKey"], forKey: prefix + ".key")
            if let id = defaults.string(forKey: prefix + ".id") { body["id"] = id }
            let result = try await service.request("sync-record", body: body)
            guard let remote = result["record"] as? [String: Any], let id = remote["id"] as? String, let data = remote["data"] as? [String: Any] else { continue }
            try await record.apply(data)
            defaults.set(id, forKey: prefix + ".id"); defaults.set(data, forKey: prefix + ".remote"); defaults.set(data, forKey: prefix + ".local")
        }
        let feed = try await service.request("records")
        for remote in feed["records"] as? [[String: Any]] ?? [] {
            guard let id = remote["id"] as? String, let slug = remote["slug"] as? String, let data = remote["data"] as? [String: Any],
                  let property = properties.first(where: { defaults.string(forKey: "buyerWebsiteSlug." + $0.id.uuidString) == slug }) ?? (["agency", "profile"].contains(remote["kind"] as? String ?? "") ? properties.first : nil),
                  !records.contains(where: { defaults.string(forKey: "buyerWebsiteRecord." + $0.id.uuidString + ".id") == id }) else { continue }
            let localID: UUID
            if remote["kind"] as? String == "offer" {
                let item = OfferIntent(propertyID: property.id, amount: data["amount"] as? Double ?? 0, financing: FinancingStatus(rawValue: data["financing"] as? String ?? "") ?? .confirm, message: data["message"] as? String ?? "")
                context.insert(item); localID = item.id
            } else if remote["kind"] as? String == "measurement" {
                let room = property.rooms.first { defaults.string(forKey: "buyerWebsiteRoom." + property.id.uuidString + "." + $0.id.uuidString) == data["room"] as? String }
                let item = FurnitureMeasurement(propertyID: property.id, roomID: room?.id, name: data["name"] as? String ?? "Mobilier", widthCM: data["widthCM"] as? Double ?? 0, depthCM: data["depthCM"] as? Double ?? 0, heightCM: data["heightCM"] as? Double ?? 0)
                context.insert(item); localID = item.id
            } else if remote["kind"] as? String == "variant" {
                guard let room = property.rooms.first(where: { defaults.string(forKey: "buyerWebsiteRoom." + property.id.uuidString + "." + $0.id.uuidString) == data["room"] as? String }),
                      let path = data["image"] as? String, let url = URL(string: path, relativeTo: service.origin)?.absoluteURL else { continue }
                let (bytes,response) = try await service.download(url)
                guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode), bytes.count <= 8_000_000 else { throw BuyerWebsiteService.Failure.response("Variante distante indisponible.") }
                let stored = try ImageStorageService().store(bytes)
                let item = DesignVariant(propertyID: property.id, roomID: room.id, title: data["title"] as? String ?? "Ma version", style: data["style"] as? String ?? "", prompt: data["prompt"] as? String ?? "", imageRelativePath: stored.original)
                item.isFavorite = data["isFavorite"] as? Bool ?? false
                item.sourcePhotoID = try sourcePhotoID(data["sourcePhoto"], propertyID: property.id)
                context.insert(item); localID = item.id
                defaults.set(path, forKey: "buyerWebsiteRecord." + item.id.uuidString + ".imageURL")
                defaults.set(stored.original, forKey: "buyerWebsiteRecord." + item.id.uuidString + ".imagePath")
            } else if remote["kind"] as? String == "event" {
                let item = AnalyticsEvent(type: AnalyticsEventType(rawValue: data["type"] as? String ?? "") ?? .propertyViewed, propertyID: property.id)
                item.roomID = roomID(data["room"], propertyID: property.id)
                if let encoded = data["metadata"] as? String, let bytes = Data(base64Encoded: encoded) { item.metadataData = bytes }
                if let value = data["timestamp"] as? String, let date = ISO8601DateFormatter().date(from: value) { item.timestamp = date }
                context.insert(item); localID = item.id
            } else if remote["kind"] as? String == "interaction" {
                let item = BuyerInteraction(propertyID: property.id, sessionID: UUID(uuidString: data["session"] as? String ?? "") ?? UUID(), event: AnalyticsEventType(rawValue: data["event"] as? String ?? "") ?? .propertyViewed)
                if let value = data["timestamp"] as? String, let date = ISO8601DateFormatter().date(from: value) { item.createdAt = date }
                context.insert(item); localID = item.id
            } else if remote["kind"] as? String == "agency" {
                let item = Agency(name: data["name"] as? String ?? "Agence", phone: data["phone"] as? String ?? "", email: data["email"] as? String ?? "", website: data["website"] as? String ?? "", brandHex: data["brandHex"] as? String ?? "#2563EB", address: data["address"] as? String ?? "")
                context.insert(item); localID = item.id
            } else if remote["kind"] as? String == "profile" {
                let item = UserProfile(firstName: data["firstName"] as? String ?? "", lastName: data["lastName"] as? String ?? "", email: data["email"] as? String ?? "")
                context.insert(item); localID = item.id
            } else { continue }
            let prefix = "buyerWebsiteRecord." + localID.uuidString
            defaults.set(id, forKey: prefix + ".id"); defaults.set(data, forKey: prefix + ".remote"); defaults.set(data, forKey: prefix + ".local")
        }
        // Resolve agency links after both imported collections exist, regardless of feed order.
        let agencies = try context.fetch(FetchDescriptor<Agency>())
        for profile in try context.fetch(FetchDescriptor<UserProfile>()) {
            if let remote = defaults.dictionary(forKey: "buyerWebsiteRecord." + profile.id.uuidString + ".remote") {
                if let key = remote["agency"] as? String { profile.agencyID = agencies.first { defaults.string(forKey: "buyerWebsiteRecord." + $0.id.uuidString + ".id") == key }?.id }
                else { profile.agencyID = nil }
            }
        }
        try context.save()
    }
}
