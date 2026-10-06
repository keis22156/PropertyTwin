import Foundation
import Testing
import SwiftData
@testable import PropertyTwin

private final class SyncProtocol: URLProtocol, @unchecked Sendable {
    static var handler: ((URLRequest) throws -> (Int, [String: Any]))?
    static var asyncHandler: (@MainActor (URLRequest) async throws -> (Int, [String: Any]))?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "sync.example.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        if let handler = Self.asyncHandler {
            Task { @MainActor in
                do { let result = try await handler(request); deliver(result) }
                catch { client?.urlProtocol(self, didFailWithError: error) }
            }
        } else {
            do { deliver(try Self.handler!(request)) }
            catch { client?.urlProtocol(self, didFailWithError: error) }
        }
    }
    private func deliver(_ result: (Int, [String: Any])) {
        do {
            let (status, body) = result
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: try JSONSerialization.data(withJSONObject: body))
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

@Suite(.serialized)
@MainActor
struct WebsiteSyncTests {
    @Test func localDevelopmentConnectionRejectsPublicHTTPAndAcceptsLAN() {
        #expect(WebsiteConnectionPolicy.accepts(URL(string: "https://studio.example.test")!))
        #expect(!WebsiteConnectionPolicy.accepts(URL(string: "http://studio.example.test")!))
        #expect(!WebsiteConnectionPolicy.accepts(URL(string: "http://8.8.8.8")!))
        #expect(!WebsiteConnectionPolicy.accepts(URL(string: "http://192.168.1.3/path")!))
        #expect(!WebsiteConnectionPolicy.accepts(URL(string: "https://name:secret@example.test")!))
        #if DEBUG
        #expect(WebsiteConnectionPolicy.accepts(URL(string: "http://192.168.1.3:3000")!))
        #expect(WebsiteConnectionPolicy.accepts(URL(string: "http://10.0.0.5:3000")!))
        #expect(WebsiteConnectionPolicy.accepts(URL(string: "http://mac.local:3000")!))
        #endif
        #expect(WebsiteConnectionPolicy.canonical(URL(string: "http://192.168.1.3:80/")!) == "http://192.168.1.3")
    }

    private func payload(_ request: URLRequest) throws -> [String: Any] {
        let data: Data
        if let body = request.httpBody { data = body }
        else if let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var collected = Data(), bytes = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable { let count = stream.read(&bytes, maxLength: bytes.count); if count <= 0 { break }; collected.append(contentsOf: bytes.prefix(count)) }
            data = collected
        } else { data = Data("{}".utf8) }
        return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
    }

    @Test func remoteEditsAreAppliedWithoutBeingSentBack() async throws {
        let suite = "WebsiteSyncTests." + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite); SyncProtocol.handler = nil }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [SyncProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let service = try BuyerWebsiteService(origin: URL(string: "https://sync.example.test")!, credential: "test-only", defaults: defaults, session: session)
        let property = Property(name: "Version app", type: .apartment, price: 100_000)
        var remote: [String: Any] = ["slug": "stable-bien", "title": property.name, "description": "", "location": "", "address": "", "city": "", "postalCode": "", "listingType": "Appartement", "price": 100_000, "rooms": [], "agency": ["phone": "0123456789", "logo": "https://example.com/logo.png"], "agent": ["email": "sophie@example.com"], "privacy": "Unlisted", "status": "Draft", "credits": 23]
        defaults.set(remote, forKey: "buyerWebsiteRemote." + property.id.uuidString)
        var bodies: [[String: Any]] = []
        SyncProtocol.handler = { request in
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer test-only")
            #expect(request.url?.path == "/api/agent/sync")
            let body = try self.payload(request); bodies.append(body)
            return (200, ["property": remote])
        }
        _ = try await service.publish(property: property, photos: [], agencyName: "", agentName: "", sharing: false)
        remote["title"] = "Version dashboard"; remote["price"] = 150_000
        _ = try await service.publish(property: property, photos: [], agencyName: "", agentName: "", sharing: false)
        #expect(property.name == "Version dashboard")
        #expect(property.price == 150_000)
        #expect((bodies[1]["patch"] as? [String: Any])?.isEmpty == true)
        property.listingDescription = "Nouvelle description locale"
        _ = try await service.publish(property: property, photos: [], agencyName: "", agentName: "", sharing: false)
        let patch = bodies[2]["patch"] as? [String: Any]
        #expect(patch?["description"] as? String == "Nouvelle description locale")
        #expect(patch?["title"] == nil)
        #expect(patch?["price"] == nil)
        #expect(patch?["credits"] == nil)
        #expect((remote["agency"] as? [String: Any])?["phone"] as? String == "0123456789")
        #expect((bodies[0]["patch"] as? [String: Any])?["agency"] == nil || ((bodies[0]["patch"] as? [String: Any])?["agency"] as? [String: Any])?["phone"] as? String == "0123456789")
        #expect(bodies[2]["slug"] as? String == "stable-bien")
        #expect((bodies[2]["baseline"] as? [String: Any])?["price"] as? Int == 150_000)
    }
    @Test func propertyEditsDuringSendSurviveAndKeepConflictBaselines() async throws {
        let suite = "WebsiteInFlightTests." + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite); SyncProtocol.asyncHandler = nil }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [SyncProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let service = try BuyerWebsiteService(origin: URL(string: "https://sync.example.test")!, credential: "test-only", defaults: defaults, session: session)
        let property = Property(name: "Initial", type: .apartment, price: 100_000)
        var remote: [String: Any] = ["slug": "race-bien", "title": "Initial", "description": "", "address": "", "city": "", "postalCode": "", "location": "", "listingType": "Appartement", "price": 100_000, "rooms": [], "agency": [:], "agent": [:], "status": "Draft"]
        var duringSend: (() -> Void)?
        var patches: [[String: Any]] = []
        SyncProtocol.asyncHandler = { request in
            let body = try self.payload(request)
            let patch = body["patch"] as? [String: Any] ?? [:]
            let baseline = body["baseline"] as? [String: Any] ?? [:]
            patches.append(patch)
            for (field,value) in patch where !BuyerWebsiteService.equalJSON(remote[field] ?? NSNull(), baseline[field] ?? NSNull()) && !BuyerWebsiteService.equalJSON(remote[field] ?? NSNull(), value) && body["slug"] != nil {
                return (409, ["field": field])
            }
            for (field,value) in patch { remote[field] = value is NSNull ? nil : value }
            duringSend?(); duringSend = nil
            return (200, ["property": remote])
        }
        _ = try await service.publish(property: property, photos: [], agencyName: "", agentName: "", sharing: false)
        property.name = "Sent title"
        duringSend = { property.name = "Newer title"; property.price = nil; property.city = "Lyon" }
        _ = try await service.publish(property: property, photos: [], agencyName: "", agentName: "", sharing: false)
        #expect(property.name == "Newer title")
        #expect(property.price == nil)
        #expect(property.city == "Lyon")
        #expect(remote["title"] as? String == "Sent title")
        _ = try await service.publish(property: property, photos: [], agencyName: "", agentName: "", sharing: false)
        #expect(remote["title"] as? String == "Newer title")
        #expect(remote["price"] == nil)
        #expect(remote["city"] as? String == "Lyon")
        #expect(patches.last?["price"] is NSNull)
        remote["description"] = "Web concurrent description"
        remote["price"] = 125_000
        duringSend = { property.listingDescription = "App concurrent description" }
        _ = try await service.publish(property: property, photos: [], agencyName: "", agentName: "", sharing: false)
        #expect(property.listingDescription == "App concurrent description")
        #expect(property.price == 125_000)
        do {
            _ = try await service.publish(property: property, photos: [], agencyName: "", agentName: "", sharing: false)
            Issue.record("Concurrent changes must conflict at the next cycle")
        } catch BuyerWebsiteService.Failure.conflict(let field) { #expect(field == "description") }
        #expect(remote["description"] as? String == "Web concurrent description")
    }

    @Test func sharedWorkspaceCreatesAndImportsWithoutAccountsOrDuplicates() async throws {
        let suite = "WebsiteWorkspaceTests." + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite); SyncProtocol.handler = nil }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [SyncProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let service = try BuyerWebsiteService(origin: URL(string: "https://sync.example.test")!, credential: "workspace-key", defaults: defaults, session: session)
        let schema = Schema([Property.self, ScannedRoom.self, PropertyPhoto.self, BuyerLead.self, OfferIntent.self, FurnitureMeasurement.self, DesignVariant.self, AnalyticsEvent.self, BuyerInteraction.self, Agency.self, UserProfile.self])
        let container = try ModelContainer(for: schema, configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        let context = ModelContext(container)
        let local = Property(name: "Créé sur iPhone", type: .house, city: "Lyon", description: "Description conservée après sauvegarde")
        context.insert(local)
        let offer = OfferIntent(propertyID: local.id, amount: 220_000, financing: .cash)
        context.insert(offer)
        let agency = Agency(name: "Agence partagée", phone: "0123456789")
        let profile = UserProfile(firstName: "Sophie", lastName: "Martin")
        profile.agencyID = agency.id
        context.insert(agency); context.insert(profile)
        try context.save()
        var properties: [[String: Any]] = [["slug": "web-created", "title": "Créé sur le dashboard", "description": "", "location": "Paris", "address": "", "city": "Paris", "postalCode": "75016", "listingType": "Commerce", "rooms": [], "agency": ["name": "Agence du web", "phone": "0987654321"], "agent": ["name": "Agent du web", "firstName": "Agent"], "status": "Draft"]]
        var records: [[String: Any]] = [["id": "web-measurement", "slug": "web-created", "kind": "measurement", "data": ["name": "Canapé", "widthCM": 210, "depthCM": 90, "heightCM": 80]]]
        var lastPatches: [[String: Any]] = []
        SyncProtocol.handler = { request in
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer workspace-key")
            let body = try self.payload(request)
            switch request.url!.lastPathComponent {
            case "sync-workspace": return (200, ["workspace": [:]])
            case "workspace": return (200, ["workspace": [:]])
            case "sync-feed": return (200, ["properties": properties])
            case "sync":
                let patch = body["patch"] as? [String: Any] ?? [:]
                lastPatches.append(patch)
                let index: Int
                if let found = properties.firstIndex(where: { $0["slug"] as? String == body["slug"] as? String || $0["syncKey"] as? String == body["clientKey"] as? String }) { index = found }
                else { properties.append(["slug": "app-created", "syncKey": body["clientKey"]!, "status": "Draft"]); index = properties.count - 1 }
                for (key,value) in patch { properties[index][key] = value is NSNull ? nil : value }
                return (200, ["property": properties[index]])
            case "removal":
                let index = properties.firstIndex { $0["slug"] as? String == body["slug"] as? String }!
                if !BuyerWebsiteService.equalJSON(properties[index], body["baseline"] ?? [:]) { return (409, ["field": "removal", "message": "Changed since last read"]) }
                if body["removed"] as? Bool == true { properties[index]["deletedAt"] = "2026-10-05T18:00:00Z" }
                else { properties[index].removeValue(forKey: "deletedAt") }
                return (200, ["property": properties[index]])
            case "activity": return (200, ["leads": [], "sessions": []])
            case "records": return (200, ["records": records])
            case "sync-record":
                let index: Int
                if let found = records.firstIndex(where: { $0["id"] as? String == body["id"] as? String || $0["clientKey"] as? String == body["clientKey"] as? String }) { index = found }
                else { records.append(["id": "app-record-" + (body["kind"] as? String ?? ""), "slug": body["slug"]!, "kind": body["kind"]!, "clientKey": body["clientKey"]!, "data": [:]]); index = records.count - 1 }
                var data = records[index]["data"] as? [String: Any] ?? [:]
                data.merge(body["patch"] as? [String: Any] ?? [:]) { _,new in new }
                records[index]["data"] = data
                return (200, ["record": records[index]])
            default: Issue.record("Unexpected endpoint: \(request.url!.path)"); return (404, [:])
            }
        }
        let worker = WebsiteSyncService()
        try await worker.synchronize(context: context, using: service)
        #expect(local.listingDescription == "Description conservée après sauvegarde")
        #expect(properties.count == 2)
        #expect(properties.first { $0["slug"] as? String == "app-created" }?["title"] as? String == "Créé sur iPhone")
        #expect(try context.fetchCount(FetchDescriptor<Property>()) == 2)
        #expect(try context.fetchCount(FetchDescriptor<FurnitureMeasurement>()) == 1)
        let remoteIndex = properties.firstIndex { $0["slug"] as? String == "app-created" }!
        properties[remoteIndex]["title"] = "Titre édité sur le web"
        properties[remoteIndex]["status"] = "Archived"
        let offerIndex = records.firstIndex { $0["kind"] as? String == "offer" }!
        records[offerIndex]["data"] = ["amount": 230_000, "financing": "Comptant", "message": "Négocié sur le web"]
        local.city = "Ville modifiée sur l’app"
        lastPatches.removeAll()
        try await worker.synchronize(context: context, using: service)
        #expect(local.name == "Titre édité sur le web")
        #expect(local.status == .archived)
        #expect(try context.fetch(FetchDescriptor<Property>()).first { $0.name == "Créé sur le dashboard" }?.type == .retail)
        #expect(properties[remoteIndex]["city"] as? String == "Ville modifiée sur l’app")
        #expect(offer.amount == 230_000)
        #expect(offer.message == "Négocié sur le web")
        #expect(try context.fetchCount(FetchDescriptor<Property>()) == 2)
        #expect(try context.fetchCount(FetchDescriptor<OfferIntent>()) == 1)
        #expect(try context.fetchCount(FetchDescriptor<FurnitureMeasurement>()) == 1)
        lastPatches.removeAll()
        try await worker.synchronize(context: context, using: service)
        #expect(lastPatches.allSatisfy { $0.isEmpty }, "Repeated patch fields: \(lastPatches.map { Array($0.keys).sorted() })")
        #expect(records.count == 4)
        #expect(profile.agencyID == agency.id)
        #expect((properties.first { $0["slug"] as? String == "web-created" }?["agency"] as? [String: Any])?["name"] as? String == "Agence du web")
        local.city = "Édité juste avant le retrait"
        try await worker.synchronize(context: context, using: service)
        local.isTrashed = true
        try await worker.synchronize(context: context, using: service)
        #expect(properties[remoteIndex]["deletedAt"] != nil)
        try await worker.synchronize(context: context, using: service)
        #expect(local.isTrashed)
        let webIndex = properties.firstIndex { $0["slug"] as? String == "web-created" }!
        properties[webIndex]["deletedAt"] = "2026-10-05T19:00:00Z"
        try await worker.synchronize(context: context, using: service)
        let imported = try context.fetch(FetchDescriptor<Property>()).first { $0.id != local.id }!
        #expect(imported.isTrashed)
        #expect(try context.fetchCount(FetchDescriptor<Property>()) == 2)
        local.isTrashed = false
        try await worker.synchronize(context: context, using: service)
        #expect(properties[remoteIndex]["deletedAt"] == nil)
        properties[webIndex].removeValue(forKey: "deletedAt")
        try await worker.synchronize(context: context, using: service)
        #expect(!imported.isTrashed)
        #expect(imported.name == "Créé sur le dashboard")
        #expect(try context.fetchCount(FetchDescriptor<Property>()) == 2)
        #expect(try context.fetchCount(FetchDescriptor<OfferIntent>()) == 1)
    }

    @Test func workspaceSettingsImportMergeClearAndResolveConflicts() async throws {
        let suite = "WebsiteIdentityTests." + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite); SyncProtocol.handler = nil }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [SyncProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let service = try BuyerWebsiteService(origin: URL(string: "https://sync.example.test")!, credential: "workspace-key", defaults: defaults, session: session)
        var remote: [String: String] = ["name": "Agence du web", "phone": "0123456789", "agentName": "Sophie Martin", "color": "#5865e9"]
        var patches: [[String: String]] = []
        var editDuringRequest: (String, String)?
        SyncProtocol.handler = { request in
            if request.url!.lastPathComponent == "workspace" { return (200, ["workspace": remote]) }
            #expect(request.url!.lastPathComponent == "sync-workspace")
            let body = try self.payload(request),patch = body["patch"] as? [String: String] ?? [:],baseline = body["baseline"] as? [String: String] ?? [:]
            patches.append(patch)
            for (field,value) in patch where (remote[field] ?? "") != (baseline[field] ?? "") && (remote[field] ?? "") != value { return (409, ["field": "workspace." + field]) }
            remote.merge(patch) { _,new in new }
            if let (field,value) = editDuringRequest { defaults.set(value, forKey: WebsiteWorkspaceSyncService.keys[field]!); editDuringRequest = nil }
            return (200, ["workspace": remote])
        }
        let sync = WebsiteWorkspaceSyncService()
        try await sync.synchronize(service: service)
        #expect(defaults.string(forKey: "buyerWebsiteAgencyName") == "Agence du web")
        #expect(defaults.string(forKey: "agentFirstName") == "Sophie Martin")
        #expect(patches[0].isEmpty)
        defaults.set("0999999999", forKey: WebsiteWorkspaceSyncService.keys["phone"]!)
        remote["color"] = "#334455"
        try await sync.synchronize(service: service)
        #expect(remote["phone"] == "0999999999")
        #expect(patches[1] == ["phone": "0999999999"])
        #expect(defaults.string(forKey: WebsiteWorkspaceSyncService.keys["color"]!) == "#334455")
        defaults.set("", forKey: WebsiteWorkspaceSyncService.keys["phone"]!)
        try await sync.synchronize(service: service)
        #expect(remote["phone"] == "")
        defaults.set("Nom app", forKey: "buyerWebsiteAgencyName");remote["name"] = "Nom web"
        do { try await sync.synchronize(service: service); Issue.record("A simultaneous change must not be overwritten") } catch {}
        #expect(remote["name"] == "Nom web")
        #expect(defaults.string(forKey: "buyerWebsiteWorkspaceConflict") == "workspace.name")
        try await sync.resolve(service: service, keepLocal: false)
        #expect(defaults.string(forKey: "buyerWebsiteAgencyName") == "Nom web")
        defaults.set("Nom app choisi", forKey: "buyerWebsiteAgencyName");remote["name"] = "Autre nom web"
        do { try await sync.synchronize(service: service) } catch {}
        try await sync.resolve(service: service, keepLocal: true)
        #expect(remote["name"] == "Nom app choisi")
        #expect(defaults.string(forKey: "buyerWebsiteWorkspaceConflict") == nil)
        defaults.set("Nom envoyé", forKey: "buyerWebsiteAgencyName")
        editDuringRequest = ("name", "Nom saisi pendant l’envoi")
        try await sync.synchronize(service: service)
        #expect(defaults.string(forKey: "buyerWebsiteAgencyName") == "Nom saisi pendant l’envoi")
        #expect(remote["name"] == "Nom envoyé")
        try await sync.synchronize(service: service)
        #expect(remote["name"] == "Nom saisi pendant l’envoi")
        remote["phone"] = "Téléphone web récent"
        editDuringRequest = ("phone", "Téléphone app saisi pendant l’envoi")
        try await sync.synchronize(service: service)
        #expect(defaults.string(forKey: WebsiteWorkspaceSyncService.keys["phone"]!) == "Téléphone app saisi pendant l’envoi")
        do { try await sync.synchronize(service: service) } catch {}
        #expect(defaults.string(forKey: "buyerWebsiteWorkspaceConflict") == "workspace.phone")
        #expect(remote["phone"] == "Téléphone web récent")
        try await sync.resolve(service: service, keepLocal: false)
        #expect(defaults.string(forKey: WebsiteWorkspaceSyncService.keys["phone"]!) == "Téléphone web récent")
    }

    @Test func saasSessionUsesTheSameAgencyAndRefreshesFromKeychain() async throws {
        let suite = "WebsiteSessionTests." + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        let account = suite + ".credentials"
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [SyncProtocol.self]
        let session = URLSession(configuration: configuration)
        let service = WebsiteSessionService(account: account, session: session)
        defer { service.clear(); session.invalidateAndCancel(); defaults.removePersistentDomain(forName: suite); SyncProtocol.handler = nil }
        let origin = URL(string: "https://sync.example.test/")!
        var refreshCount = 0
        SyncProtocol.handler = { request in
            switch request.url!.path {
            case "/api/mobile/login":
                let loginBody = try self.payload(request)
                #expect(loginBody["email"] as? String == "agent@example.test")
                return (200, ["access_token": "initial-access", "refresh_token": "initial-refresh", "expires_in": 1])
            case "/api/mobile/me":
                #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer initial-access")
                return (200, ["user": ["email": "agent@example.test"], "memberships": [["agency_id": "agency-a", "agencies": ["name": "Agence A"]]]])
            case "/api/mobile/refresh":
                refreshCount += 1
                let refreshBody = try self.payload(request)
                #expect(refreshBody["refresh_token"] as? String == "initial-refresh")
                return (200, ["access_token": "refreshed-access", "refresh_token": "refreshed-refresh", "expires_in": 3600])
            default: return (404, [:])
            }
        }
        let connected = try await service.signIn(origin: origin, email: "agent@example.test", password: "test-password", defaults: defaults)
        #expect(connected.agencyID == "agency-a")
        #expect(defaults.string(forKey: "buyerWebsiteBoundAgency") == "agency-a")
        #expect(defaults.string(forKey: "buyerWebsiteAccessToken") == nil)
        async let first = service.credentials(for: origin)
        async let second = service.credentials(for: origin)
        let credentials = try await (first, second)
        #expect(credentials.0?.token == "refreshed-access")
        #expect(credentials.1?.agency == "agency-a")
        #expect(refreshCount == 1)
        #expect(service.state(for: URL(string: "https://sync.example.test")!)?.accessToken == "refreshed-access")
        defaults.set("other-agency", forKey: "buyerWebsiteBoundAgency")
        do {
            _ = try await service.signIn(origin: origin, email: "agent@example.test", password: "test-password", defaults: defaults)
            Issue.record("A device with existing agency dossiers must not switch agencies silently")
        } catch {}
        #expect(service.state(for: origin)?.agencyID == "agency-a")
    }

}
