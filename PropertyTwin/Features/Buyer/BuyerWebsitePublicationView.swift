import SwiftUI
import SwiftData
import CoreImage.CIFilterBuiltins

struct BuyerWebsitePublicationView: View {
    let property: Property
    let photos: [PropertyPhoto]
    @Environment(\.modelContext) private var context
    @AppStorage("buyerWebsiteOrigin") private var origin = ""
    @AppStorage("buyerWebsiteAgencyName") private var agency = ""
    @AppStorage("agentFirstName") private var agentName = ""
    @AppStorage("buyerWebsiteSyncStatus") private var syncStatus = "En attente de connexion"
    @State private var conflict: String?
    @State private var token = ""
    @State private var showingShare = false
    @State private var publishing = false
    @State private var visits: [BuyerWebsiteVisit] = []
    @State private var result: URL?
    @State private var message: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Mini-site du logement") {
                    Text(property.name).font(.headline)
                    Text("L’app et le dashboard synchronisent ce dossier automatiquement. Préparer le partage génère son mini-site et son lien client.")
                        .font(.footnote).foregroundStyle(.secondary)
                    TextField("Nom de l’agence", text: $agency)
                    TextField("Prénom de l’agent", text: $agentName)
                }
                Section("Connexion au site") {
                    Text(syncStatus).font(.caption).foregroundStyle(.secondary)
                    TextField("https://votre-site.example", text: $origin)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField("Jeton agent du serveur", text: $token)
                    Button("Connecter l’app et le dashboard") { Task { await connect() } }
                        .disabled(publishing)
                    Text("Le jeton est conservé dans le Trousseau iOS. Utilisez l’adresse du même serveur que le dashboard. Les tests Xcode acceptent aussi son adresse HTTP locale sur le même Wi-Fi.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section {
                    Button(publishing ? "Préparation du lien…" : "Partager au client") {
                        Task { await publish() }
                    }
                    .disabled(publishing || photos.isEmpty)
                    if photos.isEmpty { Text("Ajoutez une photo au bien pour publier.").foregroundStyle(.secondary) }
                    if let message { Text(message).foregroundStyle(.secondary) }
                }
                if let conflict {
                    Section("Modification simultanée") {
                        Text("\(conflictLabel(conflict)) diffère entre l’app et le dashboard.")
                        Button("Conserver la version de l’app") { Task { await resolveConflict(keepLocal: true) } }
                        Button("Conserver la version du dashboard") { Task { await resolveConflict(keepLocal: false) } }
                    }
                }
                Section("Activité des visiteurs") {
                    Button("Actualiser l’activité") { Task { await refreshActivity() } }
                    ForEach(visits) { visit in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(visit.name).font(.headline)
                            Text("\(visit.visits) visites · \(Int(visit.duration) / 60) min \(Int(visit.duration) % 60) s")
                                .font(.subheadline)
                            ForEach(Array(visit.events.enumerated()), id: \.offset) { _, event in
                                Text(eventLabel(event.type) + " · " + event.at).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                if let result {
                    Section("Votre visite continue") {
                        if let qr = qrImage(result.absoluteString) {
                            Image(uiImage: qr).interpolation(.none).resizable().scaledToFit().frame(height: 220)
                                .accessibilityLabel("QR code du mini-site du logement")
                        }
                        Link("Ouvrir le mini-site", destination: result)
                        ShareLink(item: result, subject: Text(property.name), message: Text("Retrouvez les photos de votre visite et imaginez les possibilités de ce logement.")) {
                            Label("Envoyer PropertyTwin", systemImage: "square.and.arrow.up")
                        }
                    }
                }
            }
            .sheet(isPresented: $showingShare) {
                if let result { WebsiteClientShareSheet(url: result, title: property.name) }
            }
            .navigationTitle("Buyer Experience")
            .onAppear { conflict = UserDefaults.standard.string(forKey: "buyerWebsiteConflict." + property.id.uuidString); token = SecureCredentialStore.read(account: "buyerWebsiteAgentToken") ?? "" }
            .task {
                while !Task.isCancelled {
                    if (try? BuyerWebsiteService()) != nil { await refreshActivity(); conflict = UserDefaults.standard.string(forKey: "buyerWebsiteConflict." + property.id.uuidString) }
                    do { try await Task.sleep(for: .seconds(10)) }
                    catch { break }
                }
            }
        }
    }

    private func conflictLabel(_ field: String) -> String {
        ["title": "Le nom du bien", "location": "L’adresse", "description": "La description", "price": "Le prix", "surface": "La surface", "roomsCount": "Le nombre de pièces", "floor": "L’étage", "listingType": "Le type de bien", "rooms": "Les pièces et photos", "agency": "L’identité de l’agence", "agent": "Les coordonnées de l’agent", "floorplan": "Le plan", "model3d": "Le modèle 3D"][field] ?? "Une information du bien"
    }

    @MainActor private func connect() async {
        publishing = true; message = nil
        defer { publishing = false }
        do {
            guard let url = URL(string: origin) else { throw BuyerWebsiteService.Failure.configuration }
            try await WebsiteLocalConnectionService.connect(origin: url, token: token)
            try await WebsiteSyncService.shared.synchronize(context: context)
            message = "L’app et le dashboard sont connectés. La synchronisation est automatique."
        } catch { message = error.localizedDescription }
    }

    @MainActor private func publish() async {
        publishing = true; message = nil
        defer { publishing = false }
        do {
            try SecureCredentialStore.save(token, account: "buyerWebsiteAgentToken")
            result = try await BuyerWebsiteService().publish(property: property, photos: photos, agencyName: agency, agentName: agentName)
            try context.save()
            showingShare = true
            await refreshActivity()
        } catch { message = error.localizedDescription }
    }

    @MainActor private func resolveConflict(keepLocal: Bool) async {
        publishing = true
        defer { publishing = false }
        do {
            let service = try BuyerWebsiteService()
            try await service.resolveConflict(property: property, keepLocal: keepLocal)
            _ = try await service.publish(property: property, photos: photos, agencyName: agency, agentName: agentName, sharing: false)
            try context.save()
            conflict = nil; message = "Votre choix a été synchronisé."
        } catch {
            message = error.localizedDescription
            conflict = UserDefaults.standard.string(forKey: "buyerWebsiteConflict." + property.id.uuidString)
        }
    }

    @MainActor private func refreshActivity() async {
        do { visits = try await BuyerWebsiteService().activity(property: property) }
        catch { message = error.localizedDescription }
    }

    private func eventLabel(_ type: String) -> String {
        ["mini_site_open": "Mini-site ouvert", "property_return_visit": "Nouvelle visite", "gallery_open": "Galerie consultée",
         "photo_view": "Photo consultée", "room_view": "Pièce consultée", "floorplan_open": "Plan ouvert", "3d_open": "3D ouverte",
         "ai_studio_open": "Studio ouvert", "ai_generation": "Transformation créée", "variant_saved": "Version sauvegardée",
         "contact_clicked": "Contact ouvert", "visit_requested": "Visite demandée", "interest_submitted": "Intérêt exprimé",
         "session_duration": "Temps de visite"][type] ?? type
    }

    private func qrImage(_ value: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(value.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 8, y: 8)),
              let image = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: image)
    }
}

private struct WebsiteClientShareSheet: UIViewControllerRepresentable {
    let url: URL
    let title: String
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: ["Retrouvez les photos de votre visite de \(title) et imaginez ses possibilités d’aménagement.", url], applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
