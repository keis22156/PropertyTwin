import Foundation

/// Presentation settings for the one shared server workspace; no user accounts.
@MainActor
struct WebsiteWorkspaceSyncService {
    static let keys: [String: String] = [
        "name": "buyerWebsiteAgencyName", "agentName": "agentFirstName",
        "logo": "buyerWebsiteWorkspaceField.logo", "color": "buyerWebsiteWorkspaceField.color",
        "email": "buyerWebsiteWorkspaceField.email", "phone": "buyerWebsiteWorkspaceField.phone",
        "website": "buyerWebsiteWorkspaceField.website", "address": "buyerWebsiteWorkspaceField.address",
        "agentPhoto": "buyerWebsiteWorkspaceField.agentPhoto", "agentEmail": "buyerWebsiteWorkspaceField.agentEmail",
        "agentPhone": "buyerWebsiteWorkspaceField.agentPhone"
    ]

    static func localValues(_ defaults: UserDefaults) -> [String: String] {
        keys.mapValues { defaults.string(forKey: $0) ?? "" }
    }

    func synchronize(service: BuyerWebsiteService) async throws {
        let defaults = service.defaults
        let prefix = "buyerWebsiteWorkspace." + service.origin.absoluteString
        let previous = defaults.dictionary(forKey: prefix + ".local")
        let initial = Self.localValues(defaults)
        let initialRemote = defaults.dictionary(forKey: prefix + ".remote") ?? [:]
        var patch: [String: String] = [:]
        for (field,value) in initial {
            if previous == nil && value.isEmpty { continue }
            if value != (previous?[field] as? String ?? "") { patch[field] = value }
        }
        let result: [String: Any]
        do {
            result = try await service.request("sync-workspace", body: ["patch": patch, "baseline": initialRemote])
        } catch BuyerWebsiteService.Failure.conflict(let field) {
            defaults.set(field, forKey: "buyerWebsiteWorkspaceConflict")
            throw BuyerWebsiteService.Failure.response("Les paramètres de l’agence ont changé dans l’app et sur le web. Choisissez la version à conserver dans Coordonnées de l’agence.")
        }
        guard let workspace = result["workspace"] as? [String: Any] else { throw BuyerWebsiteService.Failure.response("Les paramètres de l’agence sont indisponibles.") }
        var acceptedRemote = workspace
        var acceptedLocal = initial
        for (field,key) in Self.keys {
            let remoteValue = workspace[field] as? String ?? ""
            let current = defaults.string(forKey: key) ?? ""
            if current == initial[field] {
                defaults.set(remoteValue, forKey: key)
                acceptedLocal[field] = remoteValue
            } else if patch[field] != nil {
                // Acknowledge the sent value, keeping edits typed while the request was in flight.
                acceptedLocal[field] = remoteValue
            } else {
                // Keep the original baseline to detect overlap with a simultaneous web edit.
                acceptedRemote[field] = initialRemote[field]
            }
        }
        defaults.set(acceptedRemote, forKey: prefix + ".remote")
        defaults.set(acceptedLocal, forKey: prefix + ".local")
        defaults.set(workspace, forKey: "buyerWebsiteWorkspace")
        defaults.removeObject(forKey: "buyerWebsiteWorkspaceConflict")
    }

    func resolve(service: BuyerWebsiteService, keepLocal: Bool) async throws {
        let defaults = service.defaults
        guard let conflict = defaults.string(forKey: "buyerWebsiteWorkspaceConflict"), conflict.hasPrefix("workspace.") else { return }
        let field = String(conflict.dropFirst("workspace.".count))
        let result = try await service.request("workspace")
        guard let remote = result["workspace"] as? [String: Any], let key = Self.keys[field] else { throw BuyerWebsiteService.Failure.response("Paramètre indisponible.") }
        let prefix = "buyerWebsiteWorkspace." + service.origin.absoluteString
        var baseline = defaults.dictionary(forKey: prefix + ".remote") ?? [:]
        baseline[field] = remote[field]
        defaults.set(baseline, forKey: prefix + ".remote")
        if !keepLocal {
            let value = remote[field] as? String ?? ""
            defaults.set(value, forKey: key)
            var previous = defaults.dictionary(forKey: prefix + ".local") ?? [:]
            previous[field] = value
            defaults.set(previous, forKey: prefix + ".local")
        }
        try await synchronize(service: service)
    }
}
