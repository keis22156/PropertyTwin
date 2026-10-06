import SwiftData
import SwiftUI

struct ContentView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.scenePhase) private var scenePhase
    @State private var pendingConnection: URL?
    @State private var connectionMessage: String?
    @State private var websiteSync = WebsiteSyncService.shared
    var body: some View {
        AppRootView()
            .onOpenURL { link in
                guard link.scheme == "propertytwin" else { return }
                pendingConnection = link
            }
            .confirmationDialog("Connecter le serveur", isPresented: Binding(get: { pendingConnection != nil }, set: { if !$0 { pendingConnection = nil } }), titleVisibility: .visible) {
                Button("Connecter et synchroniser") {
                    guard let link = pendingConnection else { return }
                    pendingConnection = nil
                    Task { await connect(link) }
                }
                Button("Annuler", role: .cancel) { pendingConnection = nil }
            } message: {
                Text("Les biens de l’app et du dashboard seront partagés avec \(connectionOrigin).")
            }
            .alert("App & site web", isPresented: Binding(get: { connectionMessage != nil }, set: { if !$0 { connectionMessage = nil } })) {
                Button("OK") { connectionMessage = nil }
            } message: { Text(connectionMessage ?? "") }
            .task(id: scenePhase) {
                guard scenePhase == .active else { return }
                while !Task.isCancelled {
                    if (try? BuyerWebsiteService()) != nil {
                        do {
                            try await websiteSync.synchronize(context: context)
                            UserDefaults.standard.set("Synchronisé", forKey: "buyerWebsiteSyncStatus")
                        } catch {
                            UserDefaults.standard.set(error.localizedDescription, forKey: "buyerWebsiteSyncStatus")
                        }
                    }
                    do { try await Task.sleep(for: .seconds(10)) } catch { break }
                }
            }
    }

    private var connectionOrigin: String {
        guard let link = pendingConnection else { return "le serveur" }
        return URLComponents(url: link, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "origin" })?.value ?? "le serveur"
    }

    @MainActor private func connect(_ link: URL) async {
        do {
            try await WebsiteLocalConnectionService.pair(link)
            try await websiteSync.synchronize(context: context)
            UserDefaults.standard.set("Synchronisé", forKey: "buyerWebsiteSyncStatus")
            connectionMessage = "App et dashboard connectés. Vos biens sont synchronisés sur le serveur commun."
        } catch {
            UserDefaults.standard.set(error.localizedDescription, forKey: "buyerWebsiteSyncStatus")
            connectionMessage = error.localizedDescription
        }
    }
}

#Preview {
    ContentView()
        .modelContainer(
            for: [
                Property.self, ScannedRoom.self, PropertyPhoto.self,
                DesignVariant.self, BuyerLead.self, OfferIntent.self,
                AnalyticsEvent.self, FurnitureMeasurement.self
            ],
            inMemory: true
        )
}
