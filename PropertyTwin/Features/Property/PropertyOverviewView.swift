import SwiftData
import SwiftUI

enum PropertyOverviewTab: String, CaseIterable, Identifiable {
    case overview = "Aperçu"
    case plan = "Plan"
    case threeD = "3D"
    case photos = "Photos"
    case design = "Imaginer"
    case buyer = "Vue acheteur"
    case analytics = "Performances"
    var id: String { rawValue }
}

struct PropertyOverviewView: View {
    @Environment(\.dismiss) private var dismiss
    let property: Property
    @Query(sort: \PropertyPhoto.createdAt, order: .reverse) private var photos: [PropertyPhoto]
    @State private var tab: PropertyOverviewTab = .overview
    @State private var showingScan = false

    private var propertyPhotos: [PropertyPhoto] { photos.filter { $0.propertyID == property.id } }
    private var floorLevels: [Int] { Array(Set(property.rooms.map(\.floorLevel))).sorted() }

    var body: some View {
        VStack(spacing: 0) {
            tabBar
            ScrollView {
                tabContent.padding(20)
            }
            .background(.ultraThinMaterial)
        }
        .background(PropertyTwinColors.background.ignoresSafeArea())
        .navigationTitle(property.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                ShareLink(item: shareText) { Image(systemName: "square.and.arrow.up") }
                    .accessibilityLabel("Partager le bien")
            }
        }
        .onChange(of: property.isTrashed) { _, removed in if removed { dismiss() } }
        .fullScreenCover(isPresented: $showingScan) { RoomScanFlowView(property: property) }
    }

    private var tabBar: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 6) {
                ForEach(PropertyOverviewTab.allCases) { item in
                    Button(item.rawValue) {
                        withAnimation(PropertyTwinAnimation.spring) { tab = item }
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(tab == item ? .white : PropertyTwinColors.secondaryText)
                    .padding(.horizontal, 15).padding(.vertical, 10)
                    .background(
                        tab == item ? AnyShapeStyle(PropertyTwinColors.heroGradient) : AnyShapeStyle(PropertyTwinColors.surface),
                        in: Capsule()
                    )
                    .shadow(color: tab == item ? PropertyTwinColors.primary.opacity(0.18) : .clear, radius: 8, y: 4)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
        }
        .scrollIndicators(.hidden)
        .background(PropertyTwinColors.background)
    }

    @ViewBuilder private var tabContent: some View {
        switch tab {
        case .overview: overviewContent
        case .plan: PropertyPlanView(property: property)
        case .threeD: PropertyThreeDView(property: property)
        case .photos: PropertyPhotoGalleryView(property: property)
        case .design: DesignStudioView(property: property)
        case .buyer: BuyerExperienceView(property: property)
        case .analytics: PropertyAnalyticsView(property: property)
        }
    }

    private var overviewContent: some View {
        VStack(alignment: .leading, spacing: 28) {
            hero
            scanProgress
            rooms
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 0) {
            StoredImageView(relativePath: property.primaryPhoto(in: propertyPhotos)?.originalRelativePath)
                .frame(height: 230)
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(property.name).font(PropertyTwinTypography.title)
                        Text([property.address, property.city].filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    Spacer()
                    PTStatusBadge(title: property.status.rawValue)
                }
                HStack(spacing: 20) {
                    if let price = property.price { metric(price.formatted(.currency(code: "EUR").precision(.fractionLength(0))), "Prix") }
                    if let area = property.displayArea { metric(area.formatted(.number.precision(.fractionLength(1))) + " m²", "Surface") }
                    metric("\(property.rooms.count)", "Scans")
                }
            }
            .padding(20)
        }
        .background(PropertyTwinColors.surface, in: RoundedRectangle(cornerRadius: PropertyTwinRadius.card))
        .clipShape(RoundedRectangle(cornerRadius: PropertyTwinRadius.card))
    }

    private func metric(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.headline)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
    }

    private var scanProgress: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack {
                Text("Jumeau numérique").font(.headline)
                Spacer()
                if property.structureGeometry != nil {
                    PTStatusBadge(title: "Structure fusionnée", color: PropertyTwinColors.success)
                } else if property.rooms.count > 1 {
                    PTStatusBadge(title: "Pièces individuelles", color: PropertyTwinColors.warning)
                }
            }
            if !property.structureBuildMessage.isEmpty {
                Text(property.structureBuildMessage)
                    .font(.caption)
                    .foregroundStyle(property.structureGeometry == nil ? PropertyTwinColors.warning : .secondary)
            }
            if let expected = property.expectedRoomCount {
                ProgressView(value: min(Double(property.rooms.count) / Double(max(expected, 1)), 1))
                Text("\(property.rooms.count) / \(expected) pièces scannées")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                Text("\(property.rooms.count) pièce\(property.rooms.count == 1 ? "" : "s") scannée\(property.rooms.count == 1 ? "" : "s")")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Button {
                showingScan = true
            } label: {
                Label(property.rooms.isEmpty ? "Scanner la première pièce" : "Scanner la pièce suivante", systemImage: "viewfinder")
            }
            .buttonStyle(PrimaryButtonStyle())
        }
        .ptCard()
    }

    private var rooms: some View {
        VStack(alignment: .leading, spacing: 14) {
            PTSectionHeader(title: "Pièces")
            if property.rooms.isEmpty {
                ContentUnavailableView("Aucune pièce", systemImage: "door.left.hand.open").ptCard()
            } else {
                ForEach(floorLevels, id: \.self) { floorLevel in
                    VStack(alignment: .leading, spacing: 10) {
                        Label(floorLevel.propertyTwinFloorLabel, systemImage: "square.3.layers.3d")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(PropertyTwinColors.primary)
                        ForEach(property.rooms.filter { $0.floorLevel == floorLevel }.sorted(by: { $0.createdAt > $1.createdAt })) { room in
                            NavigationLink { SavedRoomView(room: room) } label: { roomRow(room) }
                                .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private func roomRow(_ room: ScannedRoom) -> some View {
        HStack(spacing: 14) {
            if let geometry = room.geometry {
                FloorPlanView(geometry: geometry, compact: true).frame(width: 82, height: 72)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(room.name).font(.headline)
                Text(room.floorLevel.propertyTwinFloorLabel)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(PropertyTwinColors.primary)
                Text(room.area.map { $0.formatted(.number.precision(.fractionLength(1))) + " m²" } ?? "Surface non déterminée")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(.tertiary)
        }
        .ptCard(padding: 15)
    }

    private var shareText: String {
        "Découvrez \(property.name) dans PropertyTwin. Aperçu local — publication web à connecter."
    }
}

struct PropertyPlanView: View {
    let property: Property
    @State private var dimensions = true
    @State private var furniture = true
    @State private var names = true
    @State private var selectedFloor: Int?

    private var selectedArchive: FloorStructureArchive? {
        let floor = selectedFloor ?? property.floorStructures.first?.floorLevel
        return property.floorStructures.first { $0.floorLevel == floor }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Text("Plan du logement").font(PropertyTwinTypography.hero)
                Spacer()
                Menu("Affichage", systemImage: "slider.horizontal.3") {
                    Toggle("Dimensions", isOn: $dimensions)
                    Toggle("Mobilier détecté", isOn: $furniture)
                    Toggle("Noms", isOn: $names)
                }
            }
            if property.floorStructures.count > 1 {
                Picker("Étage", selection: Binding(
                    get: { selectedFloor ?? property.floorStructures.first?.floorLevel ?? 0 },
                    set: { selectedFloor = $0 }
                )) {
                    ForEach(property.floorStructures) { archive in
                        Text(archive.floorLevel.propertyTwinFloorLabel).tag(archive.floorLevel)
                    }
                }
                .pickerStyle(.menu)
                .padding(14)
                .background(PropertyTwinColors.surface, in: RoundedRectangle(cornerRadius: 16))
            }
            if let archive = selectedArchive {
                Label(archive.floorLevel.propertyTwinFloorLabel, systemImage: "square.3.layers.3d")
                    .font(.headline)
                    .foregroundStyle(PropertyTwinColors.primary)
                FloorPlanView(geometry: archive.geometry, showDimensions: dimensions, showFurniture: furniture, showNames: names)
                    .frame(height: 520).ptCard()
                if let area = RoomPlanService.area(from: archive.geometry) {
                    Label(area.formatted(.number.precision(.fractionLength(1))) + " m² mesurés", systemImage: "square.dashed")
                        .font(.headline)
                }
            } else if let geometry = property.structureGeometry {
                FloorPlanView(geometry: geometry, showDimensions: dimensions, showFurniture: furniture, showNames: names)
                    .frame(height: 520).ptCard()
            } else if property.rooms.isEmpty {
                ContentUnavailableView("Plan indisponible", systemImage: "map").ptCard()
            } else {
                Text("Structure globale non validée par RoomPlan. Les plans restent séparés pour éviter d’inventer leur position.")
                    .font(.callout).foregroundStyle(.secondary).ptCard()
                ForEach(property.rooms) { room in
                    if let geometry = room.geometry {
                        VStack(alignment: .leading) {
                            Text(room.name).font(.headline)
                            FloorPlanView(geometry: geometry, compact: true)
                        }.ptCard()
                    }
                }
            }
        }
    }
}

struct PropertyThreeDView: View {
    let property: Property
    @State private var selectedFloor: Int?

    private var selectedArchive: FloorStructureArchive? {
        let floor = selectedFloor ?? property.floorStructures.first?.floorLevel
        return property.floorStructures.first { $0.floorLevel == floor }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Visite 3D").font(PropertyTwinTypography.hero)
            if property.floorStructures.count > 1 {
                Picker("Étage", selection: Binding(
                    get: { selectedFloor ?? property.floorStructures.first?.floorLevel ?? 0 },
                    set: { selectedFloor = $0 }
                )) {
                    ForEach(property.floorStructures) { archive in
                        Text(archive.floorLevel.propertyTwinFloorLabel).tag(archive.floorLevel)
                    }
                }
                .pickerStyle(.segmented)
            }
            if let archive = selectedArchive,
               let url = ScanStorageService().url(for: archive.usdzRelativePath) {
                Label(archive.floorLevel.propertyTwinFloorLabel, systemImage: "square.3.layers.3d")
                    .font(.headline)
                QuickLookView(url: url).frame(height: 600).clipShape(RoundedRectangle(cornerRadius: 22))
            } else if !property.structureUSDZRelativePath.isEmpty,
                      let url = ScanStorageService().url(for: property.structureUSDZRelativePath) {
                QuickLookView(url: url).frame(height: 600).clipShape(RoundedRectangle(cornerRadius: 22))
            } else if property.rooms.isEmpty {
                ContentUnavailableView("Modèle 3D indisponible", systemImage: "cube.transparent").ptCard()
            } else {
                Text("La structure globale n’est pas disponible. Ouvrez le modèle RoomPlan réel d’une pièce.")
                    .foregroundStyle(.secondary)
                ForEach(property.rooms) { room in
                    NavigationLink { SavedRoomView(room: room) } label: {
                        Label("\(room.name) · \(room.floorLevel.propertyTwinFloorLabel)", systemImage: "cube")
                            .frame(maxWidth: .infinity, alignment: .leading).ptCard()
                    }.buttonStyle(.plain)
                }
            }
        }
    }
}
