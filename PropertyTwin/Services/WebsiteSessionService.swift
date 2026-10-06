import Foundation

/// Mobile sessions use the same SaaS identity. Database credentials never enter the app.
@MainActor
final class WebsiteSessionService {
    static let shared = WebsiteSessionService()
    private let account: String
    private let session: URLSession
    private var refreshTask: Task<State, Error>?

    init(account: String = "propertyTwinSaaSSession", session: URLSession = .shared) {
        self.account = account; self.session = session
    }

    func clear() {
        refreshTask?.cancel(); refreshTask = nil
        SecureCredentialStore.remove(account: account)
    }

    struct State: Codable {
        let origin: String
        var accessToken: String
        var refreshToken: String
        var expiresAt: Date
        var agencyID: String
        var agencyName: String
        var email: String
    }

    func state(for origin: URL) -> State? {
        guard let value = SecureCredentialStore.read(account: account),
              let data = value.data(using: .utf8),
              let state = try? JSONDecoder().decode(State.self, from: data),
              state.origin == canonical(origin) else { return nil }
        return state
    }

    func signIn(origin: URL, email: String, password: String, defaults: UserDefaults = .standard) async throws -> State {
        refreshTask?.cancel(); refreshTask = nil
        let response = try await call(origin, "login", body: ["email": email, "password": password])
        var state = try tokens(response, origin: origin)
        let profile = try await call(origin, "me", access: state.accessToken)
        let memberships = profile["memberships"] as? [[String: Any]] ?? []
        let boundAgency = defaults.string(forKey: "buyerWebsiteBoundAgency") ?? ""
        let boundOrigin = defaults.string(forKey: "buyerWebsiteBoundOrigin") ?? ""
        if !boundOrigin.isEmpty && boundOrigin != canonical(origin) {
            throw BuyerWebsiteService.Failure.response("Ce téléphone est lié à un autre serveur. Reconnectez son serveur initial pour conserver l’identité des dossiers.")
        }
        let membership = memberships.first { $0["agency_id"] as? String == boundAgency } ?? (boundAgency.isEmpty ? memberships.first : nil)
        guard let membership, let agencyID = membership["agency_id"] as? String else {
            throw BuyerWebsiteService.Failure.response(boundAgency.isEmpty ? "Créez votre agence depuis le SaaS avant de connecter l’app." : "Ce téléphone contient les dossiers d’une autre agence. Connectez un membre de l’agence initiale.")
        }
        state.agencyID = agencyID
        state.agencyName = (membership["agencies"] as? [String: Any])?["name"] as? String ?? "Agence"
        state.email = (profile["user"] as? [String: Any])?["email"] as? String ?? email
        try save(state)
        defaults.set(agencyID, forKey: "buyerWebsiteBoundAgency")
        defaults.set(canonical(origin), forKey: "buyerWebsiteBoundOrigin")
        return state
    }

    func credentials(for origin: URL) async throws -> (token: String, agency: String)? {
        guard let current = state(for: origin) else { return nil }
        if current.expiresAt.timeIntervalSinceNow > 60 { return (current.accessToken, current.agencyID) }
        if let task = refreshTask {
            let refreshed = try await task.value
            guard refreshed.origin == canonical(origin) else { throw BuyerWebsiteService.Failure.configuration }
            return (refreshed.accessToken, refreshed.agencyID)
        }
        let task = Task { @MainActor in
            let response = try await self.call(origin, "refresh", body: ["refresh_token": current.refreshToken])
            var refreshed = try self.tokens(response, origin: origin)
            refreshed.agencyID = current.agencyID; refreshed.agencyName = current.agencyName; refreshed.email = current.email
            try Task.checkCancellation()
            try self.save(refreshed)
            return refreshed
        }
        refreshTask = task
        defer { refreshTask = nil }
        let refreshed = try await task.value
        return (refreshed.accessToken, refreshed.agencyID)
    }

    private func save(_ state: State) throws {
        try SecureCredentialStore.save(String(decoding: JSONEncoder().encode(state), as: UTF8.self), account: account)
    }

    private func tokens(_ response: [String: Any], origin: URL) throws -> State {
        guard let access = response["access_token"] as? String, !access.isEmpty,
              let refresh = response["refresh_token"] as? String, !refresh.isEmpty,
              let expires = response["expires_in"] as? Double, expires > 0 else {
            throw BuyerWebsiteService.Failure.response("La connexion n’a pas renvoyé de session valide.")
        }
        return State(origin: canonical(origin), accessToken: access, refreshToken: refresh, expiresAt: Date().addingTimeInterval(expires), agencyID: "", agencyName: "", email: "")
    }

    private func canonical(_ origin: URL) -> String {
        guard var parts = URLComponents(url: origin, resolvingAgainstBaseURL: false) else { return origin.absoluteString }
        parts.path = ""; if parts.port == 443 { parts.port = nil }
        return parts.string ?? origin.absoluteString
    }

    private func call(_ origin: URL, _ action: String, body: [String: String]? = nil, access: String? = nil) async throws -> [String: Any] {
        guard origin.scheme == "https", origin.host != nil, origin.user == nil, origin.password == nil,
              origin.query == nil, origin.fragment == nil, origin.path.isEmpty || origin.path == "/" else {
            throw BuyerWebsiteService.Failure.configuration
        }
        var request = URLRequest(url: origin.appendingPathComponent("api/mobile/" + action))
        request.httpMethod = body == nil ? "GET" : "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let access { request.setValue("Bearer " + access, forHTTPHeaderField: "Authorization") }
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await session.data(for: request)
        let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            throw BuyerWebsiteService.Failure.response(value["message"] as? String ?? "Connexion indisponible. Réessayez.")
        }
        return value
    }
}
