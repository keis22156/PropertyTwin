import SwiftData
import SwiftUI

struct PropertiesView: View {
    @Environment(\.modelContext) private var context
    @State private var removalError: String?
    @Query(filter: #Predicate<Property> { !$0.isTrashed }, sort: \Property.updatedAt, order: .reverse) private var properties: [Property]
    @Query(sort: \PropertyPhoto.createdAt, order: .reverse) private var photos: [PropertyPhoto]
    @Query(sort: \AnalyticsEvent.timestamp, order: .reverse) private var events: [AnalyticsEvent]
    @State private var showingCreation = false
    @State private var createdProperty: Property?
    @State private var searchText = ""

    private var filteredProperties: [Property] {
        guard !searchText.isEmpty else { return properties }
        return properties.filter {
            $0.name.localizedStandardContains(searchText)
                || $0.address.localizedStandardContains(searchText)
                || $0.city.localizedStandardContains(searchText)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 20) {
                    PTPageHeader(
                        eyebrow: "Portfolio",
                        title: "Vos propriétés",
                        subtitle: "Tous vos jumeaux numériques, de la capture à la mise en marché."
                    )
                    HStack {
                        searchBar
                        NavigationLink { PropertyTrashView() } label: {
                            Image(systemName: "trash").font(.title3).padding(12)
                        }.accessibilityLabel("Corbeille des biens")
                    }
                    if filteredProperties.isEmpty {
                        emptyState
                    } else {
                        portfolioSummary
                        ForEach(filteredProperties) { property in
                            NavigationLink {
                                PropertyOverviewView(property: property)
                            } label: {
                                PremiumPropertyCard(
                                    property: property,
                                    primaryPhotoPath: property.primaryPhoto(in: photos)?.thumbnailRelativePath,
                                    analytics: AnalyticsAggregator.summary(events: events, propertyID: property.id)
                                )
                            }
                            .buttonStyle(.plain)
                            .contextMenu {
                                Button("Mettre à la corbeille", systemImage: "trash", role: .destructive) {
                                    property.isTrashed = true
                                    do { try context.save() } catch { property.isTrashed = false; removalError = error.localizedDescription }
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 14)
                .padding(.bottom, 112)
            }
            .background(PTAppBackground())
            .toolbar(.hidden, for: .navigationBar)
            .overlay(alignment: .bottomTrailing) {
                Button {
                    HapticService.selection()
                    showingCreation = true
                } label: {
                    Label("Nouveau bien", systemImage: "plus")
                        .font(.headline)
                        .padding(.horizontal, 19)
                        .frame(height: 54)
                }
                .buttonStyle(PrimaryButtonStyle(compact: true))
                .padding(.trailing, 20)
                .padding(.bottom, 92)
                .accessibilityHint("Ouvre le formulaire de création d’un bien")
            }
            .alert("Corbeille", isPresented: .constant(removalError != nil)) {
                Button("OK") { removalError = nil }
            } message: { Text(removalError ?? "") }
            .sheet(isPresented: $showingCreation) {
                CreatePropertyView { createdProperty = $0 }
            }
            .navigationDestination(item: $createdProperty) { property in
                PropertyOverviewView(property: property)
            }
        }
    }

    private var searchBar: some View {
        HStack(spacing: 11) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField("Rechercher un bien", text: $searchText)
                .textInputAutocapitalization(.words)
            if !searchText.isEmpty {
                Button {
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
                .accessibilityLabel("Effacer la recherche")
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 50)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 17, style: .continuous)
                .stroke(PropertyTwinColors.separator)
        }
    }

    private var portfolioSummary: some View {
        HStack(spacing: 0) {
            summaryMetric(value: "\(properties.count)", label: "biens")
            Divider().frame(height: 34)
            summaryMetric(value: "\(properties.reduce(0) { $0 + $1.rooms.count })", label: "espaces")
            Divider().frame(height: 34)
            summaryMetric(value: "\(properties.filter { $0.status == .published }.count)", label: "publiés")
        }
        .padding(.vertical, 17)
        .ptCard(padding: 0)
    }

    private func summaryMetric(value: String, label: String) -> some View {
        VStack(spacing: 3) {
            Text(value).font(.title3.bold())
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private var emptyState: some View {
        if searchText.isEmpty {
            PTEmptyState(
                symbol: "building.2.fill",
                title: "Votre portfolio commence ici",
                message: "Créez un bien, puis capturez ses pièces avec le LiDAR."
            )
        } else {
            PTEmptyState(
                symbol: "magnifyingglass",
                title: "Aucun résultat",
                message: "Essayez un nom, une adresse ou une ville différente."
            )
        }
    }
}

struct ScannerHubView: View {
    @Query(filter: #Predicate<Property> { !$0.isTrashed }, sort: \Property.updatedAt, order: .reverse) private var properties: [Property]
    @State private var propertyToScan: Property?
    @State private var showingCreation = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    scannerHero
                    PTSectionHeader(title: "Choisir un bien")
                    if properties.isEmpty {
                        PTEmptyState(
                            symbol: "building.2.fill",
                            title: "Créez d’abord un bien",
                            message: "Le scan sera automatiquement classé dans sa fiche."
                        )
                    } else {
                        ForEach(properties) { property in
                            Button {
                                HapticService.selection()
                                propertyToScan = property
                            } label: {
                                propertyRow(property)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    Button("Créer un nouveau bien") { showingCreation = true }
                        .buttonStyle(SecondaryButtonStyle())
                }
                .padding(.horizontal, 18)
                .padding(.top, 14)
                .padding(.bottom, 112)
            }
            .background(PTAppBackground())
            .toolbar(.hidden, for: .navigationBar)
            .fullScreenCover(item: $propertyToScan) { RoomScanFlowView(property: $0) }
            .sheet(isPresented: $showingCreation) {
                CreatePropertyView { propertyToScan = $0 }
            }
        }
    }

    private var scannerHero: some View {
        ZStack(alignment: .bottomLeading) {
            PropertyTwinColors.heroGradient
            Circle()
                .fill(.white.opacity(0.12))
                .frame(width: 190)
                .offset(x: 180, y: -70)
            VStack(alignment: .leading, spacing: 14) {
                PTIconTile(symbol: "viewfinder", tint: .white.opacity(0.24), size: 58)
                Text("Capture spatiale")
                    .font(.system(.largeTitle, design: .rounded, weight: .bold))
                Text("Choisissez un bien. PropertyTwin vous guide ensuite pièce par pièce et étage par étage.")
                    .font(.body)
                    .foregroundStyle(.white.opacity(0.82))
            }
            .foregroundStyle(.white)
            .padding(24)
        }
        .frame(minHeight: 245)
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .shadow(color: PropertyTwinColors.primary.opacity(0.24), radius: 25, y: 14)
    }

    private func propertyRow(_ property: Property) -> some View {
        HStack(spacing: 15) {
            PTIconTile(
                symbol: property.type == .house ? "house.fill" : "building.2.fill",
                tint: PropertyTwinColors.mint
            )
            VStack(alignment: .leading, spacing: 5) {
                Text(property.name).font(.headline)
                Text("\(property.rooms.count) pièce\(property.rooms.count == 1 ? "" : "s") · \(Set(property.rooms.map(\.floorLevel)).count) niveau\(Set(property.rooms.map(\.floorLevel)).count == 1 ? "" : "x")")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption.bold())
                .foregroundStyle(.tertiary)
        }
        .ptCard(padding: 16)
    }
}
