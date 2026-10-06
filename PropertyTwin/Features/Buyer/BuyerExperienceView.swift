import SwiftData
import SwiftUI

private enum BuyerSection: String, CaseIterable, Identifiable {
    case visit = "Visiter"
    case plan = "Plan"
    case imagine = "Imaginer"
    case budget = "Budget"
    case about = "À propos"
    var id: String { rawValue }
}

struct BuyerExperienceView: View {
    let property: Property
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \PropertyPhoto.createdAt, order: .reverse) private var photos: [PropertyPhoto]
    @Query(sort: \DesignVariant.createdAt, order: .reverse) private var variants: [DesignVariant]
    @State private var section: BuyerSection = .visit
    @State private var showingLead = false
    @State private var showingOffer = false
    @State private var showingWebsitePublication = false

    private var propertyPhotos: [PropertyPhoto] { photos.filter { $0.propertyID == property.id } }
    private var propertyVariants: [DesignVariant] { variants.filter { $0.propertyID == property.id } }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    header
                    sectionPicker
                    sectionContent
                }
                .padding(.bottom, 110)
            }
            .background(PropertyTwinColors.background)
            contactBar
        }
        .background(PropertyTwinColors.background.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Partager") { showingWebsitePublication = true } } }
        .sheet(isPresented: $showingWebsitePublication) { BuyerWebsitePublicationView(property: property, photos: propertyPhotos) }
        .sheet(isPresented: $showingLead) { LeadCaptureView(property: property) }
        .sheet(isPresented: $showingOffer) { OfferIntentView(property: property) }
        .onAppear { record(.propertyViewed) }
        .onChange(of: section) { _, value in
            switch value {
            case .plan: record(.planOpened)
            case .imagine: record(.designStudioOpened)
            default: break
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 18) {
            StoredImageView(relativePath: property.primaryPhoto(in: propertyPhotos)?.originalRelativePath)
                .frame(height: 280)
                .clipShape(RoundedRectangle(cornerRadius: 0))
                .overlay(alignment: .bottomLeading) {
                    LinearGradient(colors: [.clear, .black.opacity(0.58)], startPoint: .center, endPoint: .bottom)
                        .overlay(alignment: .bottomLeading) {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(property.name).font(.largeTitle.bold()).foregroundStyle(.white)
                                Text([property.address, property.city].filter { !$0.isEmpty }.joined(separator: " · "))
                                    .foregroundStyle(.white.opacity(0.86))
                            }
                            .padding(22)
                        }
                }
            HStack(spacing: 18) {
                if let area = property.displayArea { metric(area.formatted(.number.precision(.fractionLength(0))) + " m²", "Surface") }
                if let rooms = property.expectedRoomCount { metric("\(rooms)", "Pièces") }
                if let price = property.price { metric(price.formatted(.currency(code: "EUR").precision(.fractionLength(0))), "Prix") }
            }
            .padding(.horizontal, 20)
        }
    }

    private func metric(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value).font(.headline)
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }

    private var sectionPicker: some View {
        ScrollView(.horizontal) {
            HStack {
                ForEach(BuyerSection.allCases) { item in
                    Button(item.rawValue) { withAnimation(PropertyTwinAnimation.spring) { section = item } }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(section == item ? .white : PropertyTwinColors.ink)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .background(section == item ? PropertyTwinColors.primary : PropertyTwinColors.surface, in: Capsule())
                }
            }
            .padding(.horizontal, 20)
        }
        .scrollIndicators(.hidden)
    }

    @ViewBuilder private var sectionContent: some View {
        switch section {
        case .visit: visitSection
        case .plan: planSection
        case .imagine: imagineSection
        case .budget: BuyerBudgetView(property: property)
        case .about: aboutSection
        }
    }

    private var visitSection: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Explorez ce logement").font(PropertyTwinTypography.hero)
            if propertyPhotos.isEmpty {
                ContentUnavailableView("Photos à venir", systemImage: "photo.on.rectangle")
                    .ptCard()
            } else {
                ScrollView(.horizontal) {
                    HStack(spacing: 12) {
                        ForEach(propertyPhotos) { photo in
                            StoredImageView(relativePath: photo.thumbnailRelativePath)
                                .frame(width: 280, height: 195)
                                .clipShape(RoundedRectangle(cornerRadius: 20))
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }
            if !property.structureUSDZRelativePath.isEmpty,
               let url = ScanStorageService().url(for: property.structureUSDZRelativePath) {
                NavigationLink {
                    QuickLookView(url: url).ignoresSafeArea()
                        .onAppear { record(.threeDOpened) }
                } label: {
                    Label("Ouvrir la visite 3D complète", systemImage: "cube.transparent")
                }
                .buttonStyle(PrimaryButtonStyle())
            } else if let room = property.rooms.first {
                NavigationLink {
                    SavedRoomView(room: room).onAppear { record(.threeDOpened, roomID: room.id) }
                } label: {
                    Label("Explorer une pièce en 3D", systemImage: "cube")
                }
                .buttonStyle(SecondaryButtonStyle())
            }
        }
        .padding(.horizontal, 20)
    }

    @ViewBuilder private var planSection: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Comprendre l’espace").font(PropertyTwinTypography.hero)
            if let geometry = property.structureGeometry {
                FloorPlanView(geometry: geometry).frame(height: 480).ptCard()
            } else if property.rooms.isEmpty {
                ContentUnavailableView("Plan indisponible", systemImage: "map")
                    .ptCard()
            } else {
                Text("Les pièces sont disponibles individuellement. RoomPlan n’a pas encore validé de structure globale cohérente.")
                    .font(.callout).foregroundStyle(.secondary).ptCard()
                ForEach(property.rooms) { room in
                    if let geometry = room.geometry {
                        VStack(alignment: .leading) {
                            Text(room.name).font(.headline)
                            FloorPlanView(geometry: geometry, compact: true)
                        }
                        .ptCard()
                    }
                }
            }
        }
        .padding(.horizontal, 20)
    }

    private var imagineSection: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Et si cet appartement devenait vraiment le vôtre ?")
                .font(PropertyTwinTypography.hero)
            Text("Découvrez uniquement les transformations réellement préparées par l’agence.")
                .foregroundStyle(.secondary)
            if propertyVariants.isEmpty {
                ContentUnavailableView(
                    "Aucune transformation publiée",
                    systemImage: "wand.and.stars",
                    description: Text("Les avant/après apparaîtront ici lorsqu’un provider IA aura produit de vraies variantes.")
                )
                .ptCard()
            } else {
                ForEach(propertyVariants) { variant in
                    VariantPresentationView(variant: variant, original: originalPhoto(for: variant.roomID))
                        .onAppear { record(.transformationViewed, roomID: variant.roomID) }
                }
            }
        }
        .padding(.horizontal, 20)
    }

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("À propos du bien").font(PropertyTwinTypography.hero)
            Text(property.listingDescription.isEmpty ? "La description détaillée sera ajoutée par l’agence." : property.listingDescription)
                .foregroundStyle(.secondary)
            VStack(spacing: 14) {
                LabeledContent("Type", value: property.type.rawValue)
                if let floor = property.floor { LabeledContent("Étage", value: "\(floor)") }
                LabeledContent("Pièces capturées", value: "\(property.rooms.count)")
            }
            .ptCard()
            Button("Transmettre mon intention d’offre") { showingOffer = true }
                .buttonStyle(SecondaryButtonStyle())
            Text("Cette démarche transmet une intention et ne constitue pas une offre contractuelle définitive.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding(.horizontal, 20)
    }

    private var contactBar: some View {
        Button { showingLead = true } label: {
            Label("Je suis intéressé", systemImage: "message.fill")
        }
        .buttonStyle(PrimaryButtonStyle())
        .padding(16)
        .background(.ultraThinMaterial)
    }

    private func originalPhoto(for roomID: UUID) -> PropertyPhoto? {
        propertyPhotos.first { $0.roomID == roomID }
    }

    private func record(_ type: AnalyticsEventType, roomID: UUID? = nil) {
        modelContext.insert(AnalyticsEvent(type: type, propertyID: property.id, roomID: roomID))
        try? modelContext.save()
    }
}

private struct VariantPresentationView: View {
    let variant: DesignVariant
    let original: PropertyPhoto?
    @State private var reveal: CGFloat = 0.5

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(variant.title).font(.title3.bold())
            ZStack {
                StoredImageView(relativePath: original?.thumbnailRelativePath)
                StoredImageView(relativePath: variant.imageRelativePath)
                    .mask(alignment: .leading) {
                        GeometryReader { proxy in Rectangle().frame(width: proxy.size.width * reveal) }
                    }
                GeometryReader { proxy in
                    Rectangle().fill(.white).frame(width: 2).offset(x: proxy.size.width * reveal)
                }
            }
            .frame(height: 245)
            .clipShape(RoundedRectangle(cornerRadius: 20))
            Slider(value: $reveal, in: 0...1)
                .accessibilityLabel("Comparer avant et après")
        }
        .ptCard()
    }
}

private struct LeadCaptureView: View {
    let property: Property
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var message = ""
    @State private var action: LeadAction = .visit

    var body: some View {
        NavigationStack {
            Form {
                Section("Votre demande") {
                    Picker("Type", selection: $action) {
                        ForEach(LeadAction.allCases) { Text($0.rawValue).tag($0) }
                    }
                }
                Section("Coordonnées") {
                    TextField("Prénom", text: $firstName)
                    TextField("Nom", text: $lastName)
                    TextField("Email", text: $email).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                    TextField("Téléphone", text: $phone).keyboardType(.phonePad)
                    TextField("Message", text: $message, axis: .vertical).lineLimit(3...6)
                }
                Section {
                    Button("Envoyer ma demande", action: submit)
                        .buttonStyle(PrimaryButtonStyle())
                        .listRowInsets(EdgeInsets())
                        .disabled(firstName.isEmpty || email.isEmpty)
                }
            }
            .navigationTitle("Je suis intéressé")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } } }
        }
    }

    private func submit() {
        context.insert(BuyerLead(propertyID: property.id, firstName: firstName, lastName: lastName, email: email, phone: phone, message: message, action: action))
        context.insert(AnalyticsEvent(type: .leadSubmitted, propertyID: property.id))
        try? context.save()
        dismiss()
    }
}

private struct OfferIntentView: View {
    let property: Property
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @State private var amount = ""
    @State private var financing: FinancingStatus = .confirm
    @State private var message = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Bien") {
                    LabeledContent("Prix affiché", value: property.price?.formatted(.currency(code: "EUR").precision(.fractionLength(0))) ?? "Non renseigné")
                }
                Section("Votre intention") {
                    TextField("Montant (€)", text: $amount).keyboardType(.decimalPad)
                    Picker("Financement", selection: $financing) {
                        ForEach(FinancingStatus.allCases) { Text($0.rawValue).tag($0) }
                    }
                    TextField("Message facultatif", text: $message, axis: .vertical)
                }
                Section {
                    Button("Transmettre mon intention d’offre", action: submit)
                        .buttonStyle(PrimaryButtonStyle())
                        .listRowInsets(EdgeInsets())
                        .disabled(Double(amount.replacingOccurrences(of: " ", with: "")) == nil)
                    Text("Cette transmission n’est pas une offre contractuelle définitive.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Faire une offre")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } } }
        }
    }

    private func submit() {
        guard let value = Double(amount.replacingOccurrences(of: " ", with: "")) else { return }
        context.insert(OfferIntent(propertyID: property.id, amount: value, financing: financing, message: message))
        context.insert(AnalyticsEvent(type: .offerIntentSubmitted, propertyID: property.id))
        context.insert(BuyerLead(propertyID: property.id, firstName: "Acheteur", lastName: "", email: "", phone: "", message: message, action: .offerIntent, engagement: .highlyEngaged))
        try? context.save()
        dismiss()
    }
}
