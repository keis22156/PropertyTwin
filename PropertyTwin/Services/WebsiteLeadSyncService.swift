import Foundation
import SwiftData

@MainActor
struct WebsiteLeadSyncService {
    func synchronize(service: BuyerWebsiteService, context: ModelContext) async throws {
        let defaults = service.defaults
        let properties = try context.fetch(FetchDescriptor<Property>()).filter { !$0.isTrashed }
        var leads = try context.fetch(FetchDescriptor<BuyerLead>())
        for lead in leads {
            guard let property = properties.first(where: { $0.id == lead.propertyID }),
                  let slug = defaults.string(forKey: "buyerWebsiteSlug." + property.id.uuidString) else { continue }
            let prefix = "buyerWebsiteLead." + lead.id.uuidString
            let previous = defaults.dictionary(forKey: prefix + ".local") ?? [:]
            let baseline = defaults.dictionary(forKey: prefix + ".remote") ?? [:]
            let fields: [String: Any] = ["name": [lead.firstName, lead.lastName].filter { !$0.isEmpty }.joined(separator: " "),
                "email": lead.email, "phone": lead.phone, "message": lead.message,
                "kind": lead.action == .visit ? "visit" : lead.action == .offerIntent ? "interest" : "question",
                "engagement": lead.engagementRawValue]
            var patch: [String: Any] = [:]
            for (field, value) in fields where !BuyerWebsiteService.equalJSON(value, previous[field] ?? NSNull()) { patch[field] = value }
            var request: [String: Any] = ["clientKey": defaults.string(forKey: prefix + ".key") ?? UUID().uuidString.lowercased(), "slug": slug, "patch": patch, "baseline": baseline]
            defaults.set(request["clientKey"], forKey: prefix + ".key")
            if let id = defaults.string(forKey: prefix + ".id") { request["id"] = id }
            let result = try await service.request("sync-lead", body: request)
            guard let remote = result["lead"] as? [String: Any], let id = remote["id"] as? String else { continue }
            defaults.set(id, forKey: prefix + ".id")
            apply(remote, to: lead)
            defaults.set(remote, forKey: prefix + ".remote")
            var accepted = fields
            for key in fields.keys { accepted[key] = remote[key] }
            accepted["name"] = [lead.firstName, lead.lastName].filter { !$0.isEmpty }.joined(separator: " ")
            accepted["kind"] = lead.action == .visit ? "visit" : lead.action == .offerIntent ? "interest" : "question"
            defaults.set(accepted, forKey: prefix + ".local")
        }
        let activity = try await service.request("activity")
        for remote in activity["leads"] as? [[String: Any]] ?? [] {
            guard let id = remote["id"] as? String, let slug = remote["slug"] as? String,
                  let property = properties.first(where: { defaults.string(forKey: "buyerWebsiteSlug." + $0.id.uuidString) == slug }) else { continue }
            if leads.contains(where: { defaults.string(forKey: "buyerWebsiteLead." + $0.id.uuidString + ".id") == id }) { continue }
            let lead = BuyerLead(propertyID: property.id, firstName: "", lastName: "", email: "", phone: "", message: "", action: .question)
            apply(remote, to: lead); context.insert(lead); leads.append(lead)
            let prefix = "buyerWebsiteLead." + lead.id.uuidString
            defaults.set(id, forKey: prefix + ".id")
            defaults.set(remote, forKey: prefix + ".remote")
            let fields: [String: Any] = ["name": remote["name"] ?? "", "email": lead.email, "phone": lead.phone, "message": lead.message,
                "kind": lead.action == .visit ? "visit" : lead.action == .offerIntent ? "interest" : "question", "engagement": lead.engagementRawValue]
            defaults.set(fields, forKey: prefix + ".local")
        }
        try context.save()
    }

    private func apply(_ remote: [String: Any], to lead: BuyerLead) {
        let name = (remote["name"] as? String ?? "").split(separator: " ", maxSplits: 1)
        lead.firstName = name.first.map(String.init) ?? ""
        lead.lastName = name.count > 1 ? String(name[1]) : ""
        lead.email = remote["email"] as? String ?? ""
        lead.phone = remote["phone"] as? String ?? ""
        lead.message = remote["message"] as? String ?? ""
        let kind = remote["kind"] as? String ?? "question"
        lead.actionRawValue = (kind == "visit" ? LeadAction.visit : kind == "interest" ? .offerIntent : .question).rawValue
        lead.engagementRawValue = remote["engagement"] as? String ?? EngagementLevel.new.rawValue
    }
}
