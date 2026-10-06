import SwiftData
import SwiftUI

@main
struct PropertyTwinApp: App {
    private let modelContainer: ModelContainer = {
        do {
            return try ModelContainer(
                for: Property.self,
                ScannedRoom.self,
                UserProfile.self,
                Agency.self,
                PropertyPhoto.self,
                DesignVariant.self,
                BuyerLead.self,
                OfferIntent.self,
                AnalyticsEvent.self,
                BuyerInteraction.self,
                FurnitureMeasurement.self
            )
        } catch {
            fatalError("Impossible d’initialiser le stockage local: \(error)")
        }
    }()

    var body: some Scene {
        WindowGroup { ContentView() }
            .modelContainer(modelContainer)
    }
}
