import Foundation
import SwiftData

@Model final class UserProfile {
    @Attribute(.unique) var id: UUID
    var firstName: String
    var lastName: String
    var email: String
    var agencyID: UUID?
    init(firstName: String = "", lastName: String = "", email: String = "") {
        id = UUID(); self.firstName = firstName; self.lastName = lastName; self.email = email
    }
}

@Model final class Agency {
    @Attribute(.unique) var id: UUID
    var name: String
    var logoRelativePath: String?
    var phone: String
    var email: String
    var website: String
    var brandHex: String
    var address: String
    init(name: String, phone: String = "", email: String = "", website: String = "", brandHex: String = "#2563EB", address: String = "") {
        id = UUID(); self.name = name; self.phone = phone; self.email = email
        self.website = website; self.brandHex = brandHex; self.address = address
    }
}

@Model final class PropertyPhoto {
    @Attribute(.unique) var id: UUID
    var propertyID: UUID
    var roomID: UUID?
    var originalRelativePath: String
    var thumbnailRelativePath: String
    var isPrimary: Bool
    var createdAt: Date
    init(propertyID: UUID, roomID: UUID? = nil, originalRelativePath: String, thumbnailRelativePath: String, isPrimary: Bool = false) {
        id = UUID(); self.propertyID = propertyID; self.roomID = roomID
        self.originalRelativePath = originalRelativePath; self.thumbnailRelativePath = thumbnailRelativePath
        self.isPrimary = isPrimary; createdAt = .now
    }
}

enum DesignAction: String, Codable, CaseIterable, Identifiable {
    case furnish = "Meubler"
    case renovate = "Rénover"
    case floor = "Changer le sol"
    case walls = "Changer les murs"
    case style = "Changer le style"
    case empty = "Vider la pièce"
    var id: String { rawValue }
}

@Model final class DesignVariant {
    @Attribute(.unique) var id: UUID
    var propertyID: UUID
    var roomID: UUID
    var sourcePhotoID: UUID?
    var title: String
    var style: String
    var prompt: String
    var imageRelativePath: String
    var isFavorite: Bool
    var createdAt: Date
    init(propertyID: UUID, roomID: UUID, title: String, style: String, prompt: String, imageRelativePath: String) {
        id = UUID(); self.propertyID = propertyID; self.roomID = roomID; self.title = title
        self.style = style; self.prompt = prompt; self.imageRelativePath = imageRelativePath
        isFavorite = false; createdAt = .now
    }
}

enum RenovationLevel: String, Codable, CaseIterable, Identifiable {
    case light = "Légère"
    case standard = "Standard"
    case premium = "Premium"
    var id: String { rawValue }
}

struct RenovationScenario: Codable, Identifiable, Hashable {
    var id = UUID()
    var level: RenovationLevel
    var elements: Set<RenovationElement>
    var area: Double
}

enum RenovationElement: String, Codable, CaseIterable, Identifiable {
    case floors = "Sol"
    case walls = "Murs"
    case kitchen = "Cuisine"
    case bathroom = "Salle de bain"
    case lighting = "Éclairage"
    case furniture = "Mobilier"
    var id: String { rawValue }
}

struct RenovationEstimate: Codable, Equatable {
    let low: Double
    let high: Double
    let assumptions: [String]
}

enum LeadAction: String, Codable, CaseIterable, Identifiable {
    case visit = "Demande de visite"
    case question = "Question"
    case offerIntent = "Intention d’offre"
    var id: String { rawValue }
}

enum EngagementLevel: String, Codable {
    case new = "Nouveau"
    case engaged = "Engagé"
    case highlyEngaged = "Très engagé"
}

@Model final class BuyerLead {
    @Attribute(.unique) var id: UUID
    var propertyID: UUID
    var firstName: String
    var lastName: String
    var email: String
    var phone: String
    var message: String
    var actionRawValue: String
    var engagementRawValue: String
    var createdAt: Date
    var action: LeadAction { LeadAction(rawValue: actionRawValue) ?? .question }
    var engagement: EngagementLevel { EngagementLevel(rawValue: engagementRawValue) ?? .new }
    init(propertyID: UUID, firstName: String, lastName: String, email: String, phone: String, message: String, action: LeadAction, engagement: EngagementLevel = .new) {
        id = UUID(); self.propertyID = propertyID; self.firstName = firstName; self.lastName = lastName
        self.email = email; self.phone = phone; self.message = message
        actionRawValue = action.rawValue; engagementRawValue = engagement.rawValue; createdAt = .now
    }
}

enum FinancingStatus: String, Codable, CaseIterable, Identifiable {
    case cash = "Comptant"
    case credit = "Crédit"
    case approved = "Déjà validé"
    case confirm = "À confirmer"
    var id: String { rawValue }
}

@Model final class OfferIntent {
    @Attribute(.unique) var id: UUID
    var propertyID: UUID
    var amount: Double
    var financingRawValue: String
    var message: String
    var createdAt: Date
    init(propertyID: UUID, amount: Double, financing: FinancingStatus, message: String = "") {
        id = UUID(); self.propertyID = propertyID; self.amount = amount
        financingRawValue = financing.rawValue; self.message = message; createdAt = .now
    }
}

enum AnalyticsEventType: String, Codable, CaseIterable {
    case propertyViewed, photoViewed, planOpened, threeDOpened, designStudioOpened
    case transformationViewed, leadSubmitted, offerIntentSubmitted, returnedVisitor
}

@Model final class AnalyticsEvent {
    @Attribute(.unique) var id: UUID
    var typeRawValue: String
    var propertyID: UUID
    var roomID: UUID?
    var timestamp: Date
    @Attribute(.externalStorage) var metadataData: Data
    var type: AnalyticsEventType { AnalyticsEventType(rawValue: typeRawValue) ?? .propertyViewed }
    var metadata: [String: String] { (try? JSONDecoder().decode([String: String].self, from: metadataData)) ?? [:] }
    init(type: AnalyticsEventType, propertyID: UUID, roomID: UUID? = nil, metadata: [String: String] = [:]) {
        id = UUID(); typeRawValue = type.rawValue; self.propertyID = propertyID
        self.roomID = roomID; timestamp = .now
        metadataData = (try? JSONEncoder().encode(metadata)) ?? Data()
    }
}

@Model final class BuyerInteraction {
    @Attribute(.unique) var id: UUID
    var propertyID: UUID
    var sessionID: UUID
    var eventRawValue: String
    var createdAt: Date
    init(propertyID: UUID, sessionID: UUID, event: AnalyticsEventType) {
        id = UUID(); self.propertyID = propertyID; self.sessionID = sessionID
        eventRawValue = event.rawValue; createdAt = .now
    }
}

@Model final class FurnitureMeasurement {
    @Attribute(.unique) var id: UUID
    var propertyID: UUID
    var roomID: UUID?
    var name: String
    var widthCM: Double
    var depthCM: Double
    var heightCM: Double
    var createdAt: Date
    init(propertyID: UUID, roomID: UUID?, name: String, widthCM: Double, depthCM: Double, heightCM: Double) {
        id = UUID(); self.propertyID = propertyID; self.roomID = roomID; self.name = name
        self.widthCM = widthCM; self.depthCM = depthCM; self.heightCM = heightCM; createdAt = .now
    }
}
