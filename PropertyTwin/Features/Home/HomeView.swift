import SwiftData
import SwiftUI

struct HomeView: View {
    @Query(filter: #Predicate<Property> { !$0.isTrashed }, sort: \Property.updatedAt, order: .reverse) private var properties: [Property]
    @State private var showingCreation = false
    @State private var showingCreatedProperty = false
    @State private var createdProperty: Property?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    header
                    hero
                    propertiesSection
                }
                .padding(20)
            }
            .background(PTStyle.background.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $showingCreation) {
                CreatePropertyView { property in
                    createdProperty = property
                    showingCreatedProperty = true
                }
                .presentationDetents([.large])
            }
            .navigationDestination(isPresented: $showingCreatedProperty) {
                if let createdProperty {
                    PropertyDetailView(property: createdProperty)
                }
            }
        }
        .tint(PTStyle.blue)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("PropertyTwin")
                .font(.largeTitle.bold())
                .foregroundStyle(PTStyle.ink)
            Text("Capturez. Visualisez. Transformez.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(.top, 12)
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 18) {
            Image(systemName: "viewfinder.rectangular")
                .font(.system(size: 28, weight: .medium))
                .foregroundStyle(PTStyle.blue)
                .frame(width: 58, height: 58)
                .background(PTStyle.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 17))
            VStack(alignment: .leading, spacing: 7) {
                Text("Scanner un nouveau logement")
                    .font(.title3.bold())
                    .foregroundStyle(PTStyle.ink)
                Text("Créez un modèle spatial précis avec votre iPhone.")
                    .foregroundStyle(.secondary)
            }
            Button("Nouveau scan") { showingCreation = true }
                .buttonStyle(PrimaryButtonStyle())
        }
        .ptCard()
    }

    private var propertiesSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Mes logements")
                .font(.title2.bold())
                .foregroundStyle(PTStyle.ink)
            if properties.isEmpty {
                VStack(spacing: 15) {
                    Image(systemName: "house.and.flag")
                        .font(.system(size: 28))
                        .foregroundStyle(PTStyle.blue)
                    Text("Votre premier espace commence ici.")
                        .font(.headline)
                    Button("Créer un logement") { showingCreation = true }
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .ptCard()
            } else {
                ForEach(properties) { property in
                    NavigationLink {
                        PropertyDetailView(property: property)
                    } label: {
                        PropertyCard(property: property)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

private struct PropertyCard: View {
    let property: Property

    var body: some View {
        HStack(spacing: 16) {
            Group {
                if let geometry = property.rooms.first?.geometry {
                    FloorPlanView(geometry: geometry, compact: true)
                } else {
                    Image(systemName: "building.2")
                        .font(.title2)
                        .foregroundStyle(PTStyle.blue)
                }
            }
            .frame(width: 78, height: 78)
            .background(PTStyle.background, in: RoundedRectangle(cornerRadius: 15))
            VStack(alignment: .leading, spacing: 5) {
                Text(property.name).font(.headline).foregroundStyle(PTStyle.ink)
                if !property.address.isEmpty {
                    Text(property.address).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Text("\(property.rooms.count) pièce\(property.rooms.count > 1 ? "s" : "")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let area = property.knownArea {
                    Text(area, format: .number.precision(.fractionLength(1))) + Text(" m²")
                }
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(.tertiary)
        }
        .ptCard()
    }
}
