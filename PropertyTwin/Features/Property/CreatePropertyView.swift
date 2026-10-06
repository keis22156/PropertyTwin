import SwiftData
import SwiftUI

struct CreatePropertyView: View {
    var onCreated: (Property) -> Void = { _ in }
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @State private var step = 0
    @State private var name = ""
    @State private var address = ""
    @State private var city = ""
    @State private var postalCode = ""
    @State private var type: PropertyType = .apartment
    @State private var area = ""
    @State private var roomCount = ""
    @State private var floor = ""
    @State private var price = ""
    @State private var description = ""
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                progress
                Form {
                    if step == 0 { addressStep }
                    else if step == 1 { informationStep }
                    else { summaryStep }
                }
                .scrollContentBackground(.hidden)
                .background(PropertyTwinColors.background)
                controls
            }
            .background(PropertyTwinColors.background)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer", systemImage: "xmark") { dismiss() }
                }
            }
            .alert("Création impossible", isPresented: .constant(errorMessage != nil)) {
                Button("OK") { errorMessage = nil }
            } message: { Text(errorMessage ?? "") }
        }
    }

    private var progress: some View {
        HStack(spacing: 8) {
            ForEach(0..<3, id: \.self) { index in
                Capsule()
                    .fill(index <= step ? PropertyTwinColors.primary : PropertyTwinColors.separator)
                    .frame(height: 4)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private var addressStep: some View {
        Section {
            TextField("Nom du bien", text: $name)
                .textContentType(.name)
            TextField("Adresse", text: $address)
                .textContentType(.fullStreetAddress)
            TextField("Code postal", text: $postalCode)
                .keyboardType(.numbersAndPunctuation)
            TextField("Ville", text: $city)
                .textContentType(.addressCity)
        } header: {
            Text("Localisation")
        } footer: {
            Text("La recherche d’adresse Apple pourra être connectée sans modifier le modèle de données.")
        }
    }

    private var informationStep: some View {
        Group {
            Section("Informations") {
                Picker("Type", selection: $type) {
                    ForEach(PropertyType.allCases) { Text($0.rawValue).tag($0) }
                }
                TextField("Surface annoncée (m²)", text: $area).keyboardType(.decimalPad)
                TextField("Nombre de pièces", text: $roomCount).keyboardType(.numberPad)
                TextField("Étage", text: $floor).keyboardType(.numbersAndPunctuation)
                TextField("Prix (€)", text: $price).keyboardType(.decimalPad)
            }
            Section("Présentation") {
                TextField("Description facultative", text: $description, axis: .vertical)
                    .lineLimit(4...8)
            }
        }
    }

    private var summaryStep: some View {
        Group {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    Image(systemName: "viewfinder.circle.fill")
                        .font(.system(size: 46))
                        .foregroundStyle(PropertyTwinColors.primary)
                    Text("Prêt à créer le jumeau numérique").font(.title2.bold())
                    Text("Le bien sera créé en brouillon. Vous pourrez ensuite scanner plusieurs pièces avec RoomPlan.")
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 12)
            }
            Section("Récapitulatif") {
                LabeledContent("Bien", value: name)
                LabeledContent("Adresse", value: [address, postalCode, city].filter { !$0.isEmpty }.joined(separator: ", "))
                LabeledContent("Type", value: type.rawValue)
                if let value = Double(area.replacingOccurrences(of: ",", with: ".")) {
                    LabeledContent("Surface annoncée", value: value.formatted() + " m²")
                }
            }
        }
    }

    private var controls: some View {
        HStack(spacing: 12) {
            if step > 0 {
                Button("Retour") { withAnimation(PropertyTwinAnimation.spring) { step -= 1 } }
                    .buttonStyle(SecondaryButtonStyle())
            }
            Button(step == 2 ? "Créer le jumeau numérique" : "Continuer") {
                if step < 2 {
                    withAnimation(PropertyTwinAnimation.spring) { step += 1 }
                } else {
                    create()
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(step == 0 && (name.trimmingCharacters(in: .whitespaces).isEmpty || address.trimmingCharacters(in: .whitespaces).isEmpty))
        }
        .padding(20)
        .background(.ultraThinMaterial)
    }

    private var title: String {
        switch step {
        case 0: "Adresse"
        case 1: "Informations"
        default: "Créer le bien"
        }
    }

    private func create() {
        let property = Property(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            address: address.trimmingCharacters(in: .whitespacesAndNewlines),
            type: type,
            city: city.trimmingCharacters(in: .whitespacesAndNewlines),
            postalCode: postalCode.trimmingCharacters(in: .whitespacesAndNewlines),
            announcedArea: Double(area.replacingOccurrences(of: ",", with: ".")),
            expectedRoomCount: Int(roomCount),
            floor: Int(floor),
            price: Double(price.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ",", with: ".")),
            description: description
        )
        modelContext.insert(property)
        do {
            try modelContext.save()
            onCreated(property)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
