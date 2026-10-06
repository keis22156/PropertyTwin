import Foundation

@MainActor
enum WebsiteLocalConnectionService {
    static func connect(origin: URL, token: String, defaults: UserDefaults = .standard) async throws {
        guard WebsiteConnectionPolicy.accepts(origin), !token.isEmpty else { throw BuyerWebsiteService.Failure.configuration }
        let canonical = WebsiteConnectionPolicy.canonical(origin)
        let bound = defaults.string(forKey: "buyerWebsiteBoundOrigin") ?? ""
        guard bound.isEmpty || canonical == bound else {
            throw BuyerWebsiteService.Failure.response("Ce téléphone est lié à un autre serveur. Reconnectez son serveur initial pour conserver ses dossiers.")
        }
        guard (defaults.string(forKey: "buyerWebsiteBoundAgency") ?? "").isEmpty else {
            throw BuyerWebsiteService.Failure.response("Ce téléphone est lié à une agence SaaS. Reconnectez son compte depuis Profil → App & site web.")
        }
        let service = try BuyerWebsiteService(origin: origin, credential: token, defaults: defaults, session: .shared)
        _ = try await service.request("connection")
        try SecureCredentialStore.save(token, account: "buyerWebsiteAgentToken")
        defaults.set(canonical, forKey: "buyerWebsiteOrigin")
        defaults.set(canonical, forKey: "buyerWebsiteBoundOrigin")
    }

    static func pair(_ link: URL) async throws {
        guard link.scheme == "propertytwin", link.host == "connect",
              let components = URLComponents(url: link, resolvingAgainstBaseURL: false),
              let rawOrigin = components.queryItems?.first(where: { $0.name == "origin" })?.value,
              let origin = URL(string: rawOrigin), WebsiteConnectionPolicy.accepts(origin),
              let code = components.queryItems?.first(where: { $0.name == "code" })?.value, !code.isEmpty else {
            throw BuyerWebsiteService.Failure.configuration
        }
        let bound = UserDefaults.standard.string(forKey: "buyerWebsiteBoundOrigin") ?? ""
        guard bound.isEmpty || bound == WebsiteConnectionPolicy.canonical(origin),
              (UserDefaults.standard.string(forKey: "buyerWebsiteBoundAgency") ?? "").isEmpty else {
            throw BuyerWebsiteService.Failure.response("Le lien appartient à un autre espace. Vos dossiers restent liés au serveur initial.")
        }
        var request = URLRequest(url: origin.appendingPathComponent("api/mobile/pair"))
        request.httpMethod = "POST"; request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["code": code])
        let (data, response) = try await URLSession.shared.data(for: request)
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard let http = response as? HTTPURLResponse, http.statusCode == 200, let token = object["token"] as? String else {
            throw BuyerWebsiteService.Failure.response(object["message"] as? String ?? "Le lien n’a pas abouti. Vérifiez le Wi-Fi et le serveur sur le Mac.")
        }
        try await connect(origin: origin, token: token)
    }
}
