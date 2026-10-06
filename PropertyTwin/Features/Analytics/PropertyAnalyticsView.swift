import SwiftData
import SwiftUI

struct PropertyAnalyticsView: View {
    let property: Property
    @Query(sort: \AnalyticsEvent.timestamp, order: .reverse) private var allEvents: [AnalyticsEvent]
    @Query(sort: \BuyerLead.createdAt, order: .reverse) private var allLeads: [BuyerLead]
    @Query(sort: \OfferIntent.createdAt, order: .reverse) private var allOffers: [OfferIntent]

    private var events: [AnalyticsEvent] { allEvents.filter { $0.propertyID == property.id } }
    private var leads: [BuyerLead] { allLeads.filter { $0.propertyID == property.id } }
    private var offers: [OfferIntent] { allOffers.filter { $0.propertyID == property.id } }
    private var summary: AnalyticsSummary { AnalyticsAggregator.summary(events: events, propertyID: property.id) }

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            Text("Analytics").font(PropertyTwinTypography.hero)
            metrics
            insights
            eventBreakdown
        }
    }

    private var metrics: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            metric("\(summary.views)", "Vues", "eye")
            metric("\(summary.planOpens)", "Plans consultés", "map")
            metric("\(summary.threeDOpens)", "3D ouverte", "cube")
            metric("\(summary.designOpens)", "Design Studio", "wand.and.stars")
            metric("\(leads.count)", "Leads", "person.2")
            metric("\(offers.count)", "Intentions d’offre", "eurosign.circle")
        }
    }

    private func metric(_ value: String, _ title: String, _ symbol: String) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Image(systemName: symbol).foregroundStyle(PropertyTwinColors.primary)
            Text(value).font(PropertyTwinTypography.metric)
            Text(title).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .ptCard(padding: 16)
    }

    @ViewBuilder private var insights: some View {
        VStack(alignment: .leading, spacing: 14) {
            PTSectionHeader(title: "Ce que les acheteurs regardent")
            if summary.roomAttention.isEmpty {
                Text("Pas encore assez d’interactions réelles pour produire des insights.")
                    .font(.subheadline).foregroundStyle(.secondary).ptCard()
            } else {
                let total = summary.roomAttention.values.reduce(0, +)
                ForEach(summary.roomAttention.sorted(by: { $0.value > $1.value }), id: \.key) { roomID, count in
                    if let room = property.rooms.first(where: { $0.id == roomID }) {
                        HStack {
                            Text(room.name)
                            Spacer()
                            Text(Double(count) / Double(max(total, 1)), format: .percent.precision(.fractionLength(0)))
                        }
                        ProgressView(value: Double(count), total: Double(max(total, 1)))
                    }
                }
            }
        }
    }

    private var eventBreakdown: some View {
        VStack(alignment: .leading, spacing: 14) {
            PTSectionHeader(title: "Événements locaux")
            if events.isEmpty {
                Text("Aucun événement enregistré.").foregroundStyle(.secondary)
            } else {
                ForEach(AnalyticsEventType.allCases, id: \.rawValue) { type in
                    let count = events.count { $0.type == type }
                    if count > 0 {
                        LabeledContent(type.rawValue, value: "\(count)")
                            .padding(.vertical, 4)
                    }
                }
            }
            Text("Les chiffres reflètent uniquement les événements réellement enregistrés sur cet appareil.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .ptCard()
    }
}
