import Foundation
import SwiftData

@MainActor protocol PropertyRepository {
    func properties() throws -> [Property]
    func add(_ property: Property) throws
    func save() throws
}

@MainActor protocol RoomRepository {
    func rooms(propertyID: UUID) throws -> [ScannedRoom]
    func add(_ room: ScannedRoom, to property: Property) throws
}

@MainActor protocol LeadRepository {
    func leads(propertyID: UUID?) throws -> [BuyerLead]
    func add(_ lead: BuyerLead) throws
}

@MainActor protocol AnalyticsRepository {
    func events(propertyID: UUID?) throws -> [AnalyticsEvent]
    func record(_ event: AnalyticsEvent) throws
}

@MainActor final class LocalPropertyRepository: PropertyRepository {
    private let context: ModelContext
    init(context: ModelContext) { self.context = context }
    func properties() throws -> [Property] {
        let descriptor = FetchDescriptor<Property>(predicate: #Predicate { !$0.isTrashed }, sortBy: [SortDescriptor(\.updatedAt, order: .reverse)])
        return try context.fetch(descriptor)
    }
    func add(_ property: Property) throws { context.insert(property); try context.save() }
    func save() throws { try context.save() }
}

@MainActor final class LocalRoomRepository: RoomRepository {
    private let context: ModelContext
    init(context: ModelContext) { self.context = context }
    func rooms(propertyID: UUID) throws -> [ScannedRoom] {
        let descriptor = FetchDescriptor<ScannedRoom>(
            predicate: #Predicate { $0.property?.id == propertyID },
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return try context.fetch(descriptor)
    }
    func add(_ room: ScannedRoom, to property: Property) throws {
        room.property = property; property.rooms.append(room); property.updatedAt = .now
        context.insert(room); try context.save()
    }
}

@MainActor final class LocalLeadRepository: LeadRepository {
    private let context: ModelContext
    init(context: ModelContext) { self.context = context }
    func leads(propertyID: UUID? = nil) throws -> [BuyerLead] {
        let all = try context.fetch(FetchDescriptor<BuyerLead>(sortBy: [SortDescriptor(\.createdAt, order: .reverse)]))
        guard let propertyID else { return all }
        return all.filter { $0.propertyID == propertyID }
    }
    func add(_ lead: BuyerLead) throws { context.insert(lead); try context.save() }
}

@MainActor final class LocalAnalyticsRepository: AnalyticsRepository {
    private let context: ModelContext
    init(context: ModelContext) { self.context = context }
    func events(propertyID: UUID? = nil) throws -> [AnalyticsEvent] {
        let all = try context.fetch(FetchDescriptor<AnalyticsEvent>(sortBy: [SortDescriptor(\.timestamp, order: .reverse)]))
        guard let propertyID else { return all }
        return all.filter { $0.propertyID == propertyID }
    }
    func record(_ event: AnalyticsEvent) throws { context.insert(event); try context.save() }
}
