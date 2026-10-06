import SwiftData
import SwiftUI

struct DashboardView: View {
    @Query(filter: #Predicate<Property> { !$0.isTrashed }, sort: \Property.updatedAt, order: .reverse) private var properties: [Property]
    @Query(sort: \PropertyPhoto.createdAt, order: .reverse) private var photos: [PropertyPhoto]
    @Query(sort: \AnalyticsEvent.timestamp, order: .reverse) private var allEvents: [AnalyticsEvent]
    @Query(sort: \BuyerLead.createdAt, order: .reverse) private var allLeads: [BuyerLead]

    private var activeIDs: Set<UUID> { Set(properties.map(\.id)) }
    private var events: [AnalyticsEvent] { allEvents.filter { activeIDs.contains($0.propertyID) } }
    private var leads: [BuyerLead] { allLeads.filter { activeIDs.contains($0.propertyID) } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: PropertyTwinSpacing.section) {
                    hero
                    metrics
                    if let recent = properties.first { continueSection(recent) }
                    recentProperties
                    activity
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 30)
            }
            .background(PTAppBackground())
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Bonjour,").font(.subheadline.weight(.semibold)).foregroundStyle(.white.opacity(0.78))
                    Text("Votre portefeuille")
                        .font(.system(.largeTitle, design: .rounded, weight: .bold))
                        .foregroundStyle(.white)
                    Text("PropertyTwin")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.88))
                }
                Spacer()
                Image(systemName: "building.2.crop.circle.fill")
                    .font(.system(size: 55, weight: .light))
                    .foregroundStyle(.white.opacity(0.92))
            }
            Text("Capturez, valorisez et partagez chaque espace.")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.78))
        }
        .padding(24)
        .background(PropertyTwinColors.heroGradient, in: RoundedRectangle(cornerRadius: 28))
        .overlay(alignment: .topTrailing) {
            Circle().fill(.white.opacity(0.10)).frame(width: 130).offset(x: 35, y: -45)
        }
        .clipShape(RoundedRectangle(cornerRadius: 28))
        .shadow(color: PropertyTwinColors.primary.opacity(0.22), radius: 24, y: 12)
        .padding(.top, 14)
    }

    private var metrics: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 12) {
                metric("\(properties.count)", "Biens actifs", "building.2.fill", PropertyTwinColors.primary)
                metric("\(properties.reduce(0) { $0 + $1.rooms.count })", "Scans réalisés", "viewfinder", PropertyTwinColors.mint)
                metric("\(events.filter { $0.type == .propertyViewed }.count)", "Visites numériques", "eye.fill", PropertyTwinColors.violet)
                metric("\(leads.count)", "Leads générés", "person.2.fill", PropertyTwinColors.coral)
            }
        }
        .scrollIndicators(.hidden)
    }

    private func metric(_ value: String, _ label: String, _ symbol: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 11) {
            Image(systemName: symbol)
                .font(.headline)
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(tint.gradient, in: RoundedRectangle(cornerRadius: 11))
            Text(value).font(PropertyTwinTypography.metric)
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(width: 128, alignment: .leading)
        .ptCard(padding: 16)
        .overlay(alignment: .topTrailing) {
            Circle().fill(tint.opacity(0.12)).frame(width: 54).offset(x: 14, y: -14)
        }
        .clipShape(RoundedRectangle(cornerRadius: PropertyTwinRadius.card))
    }

    private func continueSection(_ property: Property) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            PTSectionHeader(title: "Continuer")
            NavigationLink {
                PropertyOverviewView(property: property)
            } label: {
                HStack(spacing: 14) {
                    StoredImageView(relativePath: property.primaryPhoto(in: photos)?.thumbnailRelativePath)
                        .frame(width: 76, height: 76)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    VStack(alignment: .leading, spacing: 5) {
                        Text(property.name).font(.headline)
                        Text("\(property.rooms.count) pièce\(property.rooms.count == 1 ? "" : "s") capturée\(property.rooms.count == 1 ? "" : "s")")
                            .font(.caption).foregroundStyle(.secondary)
                        if let progress = property.scanProgress {
                            ProgressView(value: progress).tint(PropertyTwinColors.primary)
                        }
                    }
                    Spacer()
                    Image(systemName: "arrow.up.right").foregroundStyle(.secondary)
                }
                .ptCard(padding: 16)
            }
            .buttonStyle(.plain)
        }
    }

    private var recentProperties: some View {
        VStack(alignment: .leading, spacing: 14) {
            PTSectionHeader(title: "Propriétés récentes")
            if properties.isEmpty {
                ContentUnavailableView("Votre premier espace commence ici.", systemImage: "building.2.crop.circle")
                    .ptCard()
            } else {
                ForEach(properties.prefix(3)) { property in
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
                }
            }
        }
    }

    private var activity: some View {
        VStack(alignment: .leading, spacing: 14) {
            PTSectionHeader(title: "Activité")
            if events.isEmpty && leads.isEmpty {
                Text("Les interactions réelles de vos acheteurs apparaîtront ici.")
                    .font(.subheadline).foregroundStyle(.secondary).ptCard()
            } else {
                ForEach(Array(events.prefix(3))) { event in
                    HStack(spacing: 12) {
                        Image(systemName: icon(for: event.type))
                            .foregroundStyle(PropertyTwinColors.primary)
                            .frame(width: 36, height: 36)
                            .background(PropertyTwinColors.primarySoft, in: Circle())
                        VStack(alignment: .leading) {
                            Text(label(for: event.type)).font(.subheadline.weight(.semibold))
                            Text(event.timestamp, format: .relative(presentation: .named)).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    .ptCard(padding: 14)
                }
            }
        }
    }

    private func icon(for type: AnalyticsEventType) -> String {
        switch type {
        case .propertyViewed: "eye"
        case .planOpened: "map"
        case .threeDOpened: "cube"
        case .designStudioOpened, .transformationViewed: "wand.and.stars"
        case .leadSubmitted: "person.crop.circle.badge.checkmark"
        case .offerIntentSubmitted: "eurosign.circle"
        default: "arrow.trianglehead.2.clockwise"
        }
    }

    private func label(for type: AnalyticsEventType) -> String {
        switch type {
        case .propertyViewed: "Un bien a été consulté"
        case .planOpened: "Un plan a été ouvert"
        case .threeDOpened: "Une visite 3D a démarré"
        case .designStudioOpened: "Le Design Studio a été exploré"
        case .transformationViewed: "Une transformation a été regardée"
        case .leadSubmitted: "Nouvelle demande d’information"
        case .offerIntentSubmitted: "Nouvelle intention d’offre"
        case .photoViewed: "Une photo a été consultée"
        case .returnedVisitor: "Un visiteur est revenu"
        }
    }
}
