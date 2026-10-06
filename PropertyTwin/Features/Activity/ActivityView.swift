import SwiftData
import SwiftUI

struct ActivityView: View {
    @Query(sort: \BuyerLead.createdAt, order: .reverse) private var allLeads: [BuyerLead]
    @Query(sort: \AnalyticsEvent.timestamp, order: .reverse) private var allEvents: [AnalyticsEvent]

    @Query(filter: #Predicate<Property> { !$0.isTrashed }) private var properties: [Property]
    private var activeIDs: Set<UUID> { Set(properties.map(\.id)) }
    private var events: [AnalyticsEvent] { allEvents.filter { activeIDs.contains($0.propertyID) } }
    private var leads: [BuyerLead] { allLeads.filter { activeIDs.contains($0.propertyID) } }

    var body: some View {
        NavigationStack {
            List {
                Section("Leads") {
                    if leads.isEmpty {
                        Text("Aucun lead réel pour le moment.").foregroundStyle(.secondary)
                    }
                    ForEach(leads) { lead in
                        NavigationLink {
                            LeadDetailView(lead: lead)
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text([lead.firstName, lead.lastName].joined(separator: " ")).font(.headline)
                                    Text(lead.action.rawValue).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                PTStatusBadge(title: lead.engagement.rawValue, color: engagementColor(lead.engagement))
                            }
                        }
                    }
                }
                Section("Interactions") {
                    if events.isEmpty {
                        Text("Les événements locaux apparaîtront ici.").foregroundStyle(.secondary)
                    }
                    ForEach(events.prefix(30)) { event in
                        LabeledContent(event.type.rawValue, value: event.timestamp.formatted(.relative(presentation: .named)))
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(PropertyTwinColors.background)
            .navigationTitle("Activité")
        }
    }

    private func engagementColor(_ level: EngagementLevel) -> Color {
        switch level {
        case .new: .secondary
        case .engaged: PropertyTwinColors.primary
        case .highlyEngaged: PropertyTwinColors.success
        }
    }
}

private struct LeadDetailView: View {
    let lead: BuyerLead
    var body: some View {
        List {
            Section("Contact") {
                LabeledContent("Nom", value: "\(lead.firstName) \(lead.lastName)")
                LabeledContent("Email", value: lead.email)
                LabeledContent("Téléphone", value: lead.phone)
            }
            Section("Demande") {
                LabeledContent("Action", value: lead.action.rawValue)
                Text(lead.message.isEmpty ? "Aucun message" : lead.message)
            }
            Section {
                Text("Le niveau d’engagement résume uniquement les interactions observées. Il ne prédit pas l’intention d’achat.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Lead")
    }
}
