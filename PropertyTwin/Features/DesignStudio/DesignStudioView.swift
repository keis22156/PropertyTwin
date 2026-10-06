import SwiftData
import SwiftUI

struct DesignStudioView: View {
    let property: Property
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \PropertyPhoto.createdAt, order: .reverse) private var photos: [PropertyPhoto]
    @Query(sort: \DesignVariant.createdAt, order: .reverse) private var allVariants: [DesignVariant]
    @State private var selectedRoomID: UUID?
    @State private var action: DesignAction = .furnish
    @State private var style: ImageGenerationStyle = .contemporary
    @State private var prompt = ""
    @State private var isGenerating = false
    @State private var message: String?
    @State private var showingUploadConsent = false
    @AppStorage("aiExternalUploadConsent") private var externalUploadConsent = false
    private var generation: ImageGenerationService { .live }

    private var selectedRoom: ScannedRoom? {
        property.rooms.first { $0.id == selectedRoomID } ?? property.rooms.first
    }
    private var sourcePhoto: PropertyPhoto? {
        guard let roomID = selectedRoom?.id else { return nil }
        return photos.first { $0.propertyID == property.id && $0.roomID == roomID }
    }
    private var variants: [DesignVariant] {
        guard let roomID = selectedRoom?.id else { return [] }
        return allVariants.filter { $0.propertyID == property.id && $0.roomID == roomID }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            header
            if property.rooms.isEmpty {
                ContentUnavailableView("Scannez d’abord une pièce", systemImage: "viewfinder")
                    .ptCard()
            } else {
                roomPicker
                actionGrid
                stylePicker
                promptField
                sourcePreview
                generateButton
                variantsSection
            }
        }
        .alert("Design Studio", isPresented: .constant(message != nil)) {
            Button("OK") { message = nil }
        } message: { Text(message ?? "") }
        .confirmationDialog(
            "Envoyer cette photo au fournisseur IA ?",
            isPresented: $showingUploadConsent,
            titleVisibility: .visible
        ) {
            Button("Autoriser et générer") {
                externalUploadConsent = true
                Task { await generate() }
            }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("La photo quitte l’appareil pour être transformée. N’envoyez aucune photo contenant des données personnelles.")
        }
    }

    private var header: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(
                colors: [PropertyTwinColors.violet, PropertyTwinColors.primary],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Circle().fill(.white.opacity(0.12)).frame(width: 160).offset(x: 210, y: -70)
            VStack(alignment: .leading, spacing: 12) {
                PTIconTile(symbol: "wand.and.stars", tint: .white.opacity(0.22), size: 54)
                Text("Imaginez autrement.")
                    .font(.system(.largeTitle, design: .rounded, weight: .bold))
                Text("Transformez une vraie photo tout en préservant l’architecture de la pièce.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.82))
                PTStatusBadge(
                    title: generation.isConfigured ? generation.providerName : "IA à connecter",
                    color: generation.isConfigured ? PropertyTwinColors.mint : PropertyTwinColors.warning
                )
            }
            .foregroundStyle(.white)
            .padding(22)
        }
        .frame(minHeight: 250)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .shadow(color: PropertyTwinColors.violet.opacity(0.22), radius: 22, y: 12)
    }

    private var roomPicker: some View {
        Picker("Pièce", selection: Binding(
            get: { selectedRoom?.id },
            set: { selectedRoomID = $0 }
        )) {
            ForEach(property.rooms) { room in Text(room.name).tag(Optional(room.id)) }
        }
        .pickerStyle(.menu)
        .padding(14)
        .background(PropertyTwinColors.surface, in: RoundedRectangle(cornerRadius: 16))
    }

    private var actionGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            ForEach(DesignAction.allCases) { item in
                Button {
                    action = item
                    HapticService.selection()
                } label: {
                    VStack(spacing: 9) {
                        Image(systemName: actionSymbol(item))
                            .font(.title3.weight(.semibold))
                        Text(item.rawValue)
                            .font(.caption.weight(.semibold))
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity, minHeight: 78)
                    .foregroundStyle(action == item ? .white : PropertyTwinColors.ink)
                    .background(
                        action == item ? AnyShapeStyle(PropertyTwinColors.heroGradient) : AnyShapeStyle(PropertyTwinColors.surface),
                        in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                    )
                    .shadow(color: action == item ? PropertyTwinColors.primary.opacity(0.18) : .black.opacity(0.025), radius: 10, y: 5)
                }
            }
        }
    }

    private var stylePicker: some View {
        ScrollView(.horizontal) {
            HStack {
                ForEach(ImageGenerationStyle.allCases) { item in
                    Button(item.rawValue) { style = item }
                        .buttonStyle(.bordered)
                        .tint(style == item ? PropertyTwinColors.primary : .secondary)
                }
            }
        }
        .scrollIndicators(.hidden)
    }

    private var promptField: some View {
        TextField("Décrivez ce que vous voulez voir…", text: $prompt, axis: .vertical)
            .lineLimit(2...5)
            .padding(16)
            .background(PropertyTwinColors.surface, in: RoundedRectangle(cornerRadius: 16))
    }

    @ViewBuilder private var sourcePreview: some View {
        if let sourcePhoto {
            VStack(alignment: .leading, spacing: 8) {
                Text("Photo originale").font(.headline)
                StoredImageView(relativePath: sourcePhoto.thumbnailRelativePath)
                    .aspectRatio(1.45, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
            }
        } else {
            Label("Ajoutez une photo à cette pièce avant de lancer une transformation.", systemImage: "photo.badge.plus")
                .foregroundStyle(.secondary)
                .ptCard()
        }
    }

    private var generateButton: some View {
        Button {
            if externalUploadConsent {
                Task { await generate() }
            } else {
                showingUploadConsent = true
            }
        } label: {
            if isGenerating {
                ProgressView().tint(.white)
            } else {
                Label("Générer une transformation", systemImage: "wand.and.stars")
            }
        }
        .buttonStyle(PrimaryButtonStyle())
        .disabled(sourcePhoto == nil || isGenerating)
    }

    @ViewBuilder private var variantsSection: some View {
        if !variants.isEmpty {
            PTSectionHeader(title: "Variantes")
            ForEach(variants) { variant in
                VStack(alignment: .leading, spacing: 10) {
                    StoredImageView(relativePath: variant.imageRelativePath)
                        .aspectRatio(1.45, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 18))
                    HStack {
                        VStack(alignment: .leading) {
                            Text(variant.title).font(.headline)
                            Text(variant.style).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button {
                            variant.isFavorite.toggle(); try? modelContext.save()
                        } label: {
                            Image(systemName: variant.isFavorite ? "heart.fill" : "heart")
                        }
                    }
                }
                .ptCard()
            }
        }
    }

    private func actionSymbol(_ item: DesignAction) -> String {
        switch item {
        case .furnish: "sofa.fill"
        case .renovate: "hammer.fill"
        case .floor: "square.grid.3x3.fill"
        case .walls: "paintbrush.fill"
        case .style: "sparkles"
        case .empty: "rectangle.dashed"
        }
    }

    private func generate() async {
        guard generation.isConfigured else {
            message = ImageGenerationError.notConfigured.localizedDescription
            return
        }
        guard let sourcePhoto, let room = selectedRoom else { return }
        isGenerating = true
        defer { isGenerating = false }
        do {
            let source = try ImageStorageService().data(for: sourcePhoto.originalRelativePath)
            let request = ImageGenerationRequest(
                sourceImageData: source,
                action: action,
                style: style.rawValue,
                prompt: prompt
            )
            let generated = try await generation.generate(request)
            let paths = try ImageStorageService().store(generated)
            let variant = DesignVariant(
                propertyID: property.id,
                roomID: room.id,
                title: action.rawValue,
                style: style.rawValue,
                prompt: prompt,
                imageRelativePath: paths.original
            )
            modelContext.insert(variant)
            modelContext.insert(AnalyticsEvent(type: .transformationViewed, propertyID: property.id, roomID: room.id))
            try modelContext.save()
        } catch {
            message = error.localizedDescription
        }
    }
}
