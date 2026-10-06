import SwiftUI
import SwiftData

struct WebsiteConnectionView: View {
    @Environment(\.modelContext) private var context
    @AppStorage("buyerWebsiteOrigin") private var origin = ""
    @AppStorage("buyerWebsiteSyncStatus") private var status = "En attente de connexion"
    @State private var token = ""
    @State private var connectedAgency = ""
    @State private var email = ""
    @State private var password = ""
    @State private var legacyMode = true
    @State private var connecting = false
    @State private var message: String?

    var body: some View {
        Form {
            Section("Un espace commun") {
                Text("L’app et le dashboard utilisent le même serveur et la même base. En local, connectez-les par clé sans créer de compte. L’app conserve une copie hors ligne.")
                Text("Un bien ajouté dans l’app apparaît automatiquement en brouillon sur le site. Le mini-site client est préparé au moment du partage.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section("Votre serveur") {
                TextField("Adresse du serveur", text: $origin)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                if legacyMode {
                    SecureField("Clé du serveur local", text: $token)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                } else {
                    TextField("Email du compte SaaS", text: $email)
                        .keyboardType(.emailAddress).textContentType(.username)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField("Mot de passe", text: $password).textContentType(.password)
                }
                Button(connecting ? "Connexion en cours…" : "Connecter et synchroniser") { Task { await connect() } }
                    .disabled(connecting || origin.isEmpty || (legacyMode ? token.isEmpty : email.isEmpty || password.isEmpty))
                Toggle("Connexion par clé (serveur local)", isOn: $legacyMode)
                Text("Depuis le dashboard, « Connecter l’iPhone » crée un lien temporaire. Pour les tests Xcode, le serveur local HTTP est accepté sur le même Wi-Fi. La clé reste dans le Trousseau.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Section("Identité de l’agence") {
                if !connectedAgency.isEmpty { Label(connectedAgency, systemImage: "building.2") }
                NavigationLink("Coordonnées et identité partagées") { WebsiteAgencySettingsView() }
            }
            Section("Synchronisation") {
                Text(status)
                Text("Actualisation automatique lorsque l’app est ouverte. Les modifications hors ligne sont envoyées à la prochaine connexion.")
                    .font(.footnote).foregroundStyle(.secondary)
                if let message { Text(message).foregroundStyle(.secondary) }
            }
        }
        .navigationTitle("App & site web")
        .onAppear {
            token = SecureCredentialStore.read(account: "buyerWebsiteAgentToken") ?? ""
            if let url = URL(string: origin), let session = WebsiteSessionService.shared.state(for: url) { email = session.email; connectedAgency = session.agencyName; legacyMode = false }
        }
    }

    @MainActor private func connect() async {
        connecting = true; message = nil
        defer { connecting = false }
        do {
            if legacyMode {
                guard let url = URL(string: origin) else { throw BuyerWebsiteService.Failure.configuration }
                try await WebsiteLocalConnectionService.connect(origin: url, token: token)
            } else {
                guard let url = URL(string: origin) else { throw BuyerWebsiteService.Failure.configuration }
                let session = try await WebsiteSessionService.shared.signIn(origin: url, email: email, password: password)
                password = ""; connectedAgency = session.agencyName
                message = "Connecté à " + session.agencyName
            }
            try await WebsiteSyncService.shared.synchronize(context: context)
            status = "Synchronisé"
            message = "Vos biens sont accessibles depuis l’app et le dashboard."
        } catch { status = error.localizedDescription; message = error.localizedDescription }
    }
}
