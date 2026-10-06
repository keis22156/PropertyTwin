import SwiftUI

struct WebsiteAgencySettingsView: View {
    @State private var fields: [String: String] = [:]
    @State private var conflict: String?
    @State private var message: String?
    @State private var syncing = false
    @FocusState private var focused: String?
    private let agency = [("name", "Nom de l’agence"), ("email", "Email de l’agence"), ("phone", "Téléphone"), ("website", "Site HTTPS"), ("address", "Adresse"), ("color", "Couleur de marque (#5865e9)"), ("logo", "URL HTTPS du logo")]
    private let presenter = [("agentName", "Nom complet"), ("agentEmail", "Email de l’interlocuteur"), ("agentPhone", "Téléphone de l’interlocuteur"), ("agentPhoto", "URL HTTPS du portrait")]

    var body: some View {
        Form {
            Section {
                Text("Ces informations sont partagées avec le dashboard, sans compte utilisateur. Les mini-sites utilisant l’identité de l’agence suivent vos modifications.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section("Votre agence") { inputs(agency) }
            Section("Votre interlocuteur") { inputs(presenter) }
            if let conflict {
                Section("Modification simultanée") {
                    Text("Une information a changé dans l’app et sur le web : " + label(conflict))
                    Button("Conserver la version de l’app") { Task { await synchronize(choice: true) } }
                    Button("Conserver la version du dashboard") { Task { await synchronize(choice: false) } }
                }.disabled(syncing)
            }
            Section {
                Button(syncing ? "Synchronisation…" : "Synchroniser maintenant") { Task { await synchronize() } }
                    .disabled(syncing)
                Text("Les changements hors ligne restent sur l’app et seront envoyés à la prochaine connexion.")
                    .font(.caption).foregroundStyle(.secondary)
                if let message { Text(message).foregroundStyle(.secondary) }
            }
        }
        .navigationTitle("Coordonnées de l’agence")
        .onAppear { reload() }
        .task {
            while !Task.isCancelled {
                if focused == nil && !syncing { reload() }
                do { try await Task.sleep(for: .seconds(10)) } catch { break }
            }
        }
    }

    @ViewBuilder private func inputs(_ values: [(String, String)]) -> some View {
        ForEach(values, id: \.0) { key,title in
            TextField(title, text: Binding(get: { fields[key] ?? "" }, set: { value in
                fields[key] = value
                UserDefaults.standard.set(value, forKey: WebsiteWorkspaceSyncService.keys[key]!)
            }))
            .textInputAutocapitalization(key.contains("Email") || key == "email" || ["website", "logo", "agentPhoto"].contains(key) ? .never : .words)
            .autocorrectionDisabled()
            .focused($focused, equals: key)
        }
    }

    private func label(_ value: String) -> String {
        let key = value.replacingOccurrences(of: "workspace.", with: "")
        return (agency + presenter).first { $0.0 == key }?.1 ?? "Identité partagée"
    }

    private func reload() {
        fields = WebsiteWorkspaceSyncService.localValues(.standard)
        conflict = UserDefaults.standard.string(forKey: "buyerWebsiteWorkspaceConflict")
    }

    @MainActor private func synchronize(choice: Bool? = nil) async {
        syncing = true; message = nil; focused = nil
        defer { syncing = false; reload() }
        do {
            let service = try BuyerWebsiteService()
            if let choice { try await WebsiteWorkspaceSyncService().resolve(service: service, keepLocal: choice) }
            else { try await WebsiteWorkspaceSyncService().synchronize(service: service) }
            message = "Identité synchronisée avec le dashboard."
        } catch { message = error.localizedDescription }
    }
}
