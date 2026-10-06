import SwiftData
import SwiftUI

struct PropertyTrashView: View {
    @Environment(\.modelContext) private var context
    @Query(filter: #Predicate<Property> { $0.isTrashed }, sort: \Property.updatedAt, order: .reverse)
    private var properties: [Property]
    @AppStorage("buyerWebsiteSyncStatus") private var syncStatus = "En attente de connexion"
    @State private var error: String?

    var body: some View {
        List {
            Section {
                Text("Ces dossiers restent conservés. Leur restauration remet le même bien dans l’app et le dashboard.")
                    .foregroundStyle(.secondary)
                Text(syncStatus).font(.caption).foregroundStyle(.secondary)
            }
            Section("Biens retirés") {
                if properties.isEmpty { Text("Votre corbeille est vide.").foregroundStyle(.secondary) }
                ForEach(properties) { property in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(property.name).font(.headline)
                        Text([property.address, property.city].filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.caption).foregroundStyle(.secondary)
                        Button("Restaurer le bien", systemImage: "arrow.uturn.backward") {
                            property.isTrashed = false
                            do { try context.save() } catch { property.isTrashed = true; self.error = error.localizedDescription }
                        }
                    }.padding(.vertical, 8)
                }
            }
        }
        .navigationTitle("Corbeille")
        .alert("Restauration", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "") }
    }
}
