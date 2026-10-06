import Foundation
import SwiftData

enum PropertyType: String, Codable, CaseIterable, Identifiable {
    case apartment = "Appartement"
    case house = "Maison"
    case office = "Bureau"
    case land = "Terrain"
    case retail = "Commerce"
    case building = "Immeuble"
    case other = "Autre"
    var id: String { rawValue }
}

enum PropertyStatus: String, Codable, CaseIterable, Identifiable {
    case draft = "Brouillon"
    case ready = "Prêt"
    case published = "Publié"
    case archived = "Archivé"
    var id: String { rawValue }
}

struct FloorStructureArchive: Codable, Identifiable {
    var id: Int { floorLevel }
    let floorLevel: Int
    let campaignID: UUID
    let roomCount: Int
    let geometry: RoomGeometry
    let usdzRelativePath: String
    let updatedAt: Date
}

enum RoomType: String, Codable, CaseIterable, Identifiable {
    case livingRoom = "Salon"
    case kitchen = "Cuisine"
    case bedroom = "Chambre"
    case diningRoom = "Salle à manger"
    case bathroom = "Salle de bain"
    case office = "Bureau"
    case entrance = "Entrée"
    case hallway = "Couloir"
    case closet = "Dressing"
    case other = "Autre"
    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .livingRoom: "sofa"
        case .kitchen: "cooktop"
        case .bedroom: "bed.double"
        case .diningRoom: "fork.knife"
        case .bathroom: "shower"
        case .office: "desktopcomputer"
        case .entrance: "door.left.hand.open"
        case .hallway: "arrow.left.and.right"
        case .closet: "cabinet"
        case .other: "square.dashed"
        }
    }
}

@Model
final class Property {
    @Attribute(.unique) var id: UUID
    var name: String
    var address: String
    var city: String = ""
    var postalCode: String = ""
    var typeRawValue: String
    var statusRawValue: String = PropertyStatus.draft.rawValue
    // Soft removal must not shadow PersistentModel.isDeleted (framework lifecycle).
    @Attribute(originalName: "isDeleted") var isTrashed: Bool = false
    var announcedArea: Double?
    var expectedRoomCount: Int?
    var floor: Int?
    var price: Double?
    @Attribute(originalName: "propertyDescription") var listingDescription: String = ""
    var createdAt: Date
    var updatedAt: Date
    var structureUSDZRelativePath: String = ""
    var structureCampaignID: UUID?
    var structureBuildMessage: String = ""
    @Attribute(.externalStorage) var structureGeometryData: Data?
    @Attribute(.externalStorage) var floorStructuresData: Data?
    var shareSlug: String = UUID().uuidString.lowercased()
    @Relationship(deleteRule: .cascade, inverse: \ScannedRoom.property)
    var rooms: [ScannedRoom]

    var type: PropertyType {
        get { PropertyType(rawValue: typeRawValue) ?? .other }
        set { typeRawValue = newValue.rawValue }
    }

    var status: PropertyStatus {
        get { PropertyStatus(rawValue: statusRawValue) ?? .draft }
        set { statusRawValue = newValue.rawValue }
    }

    var knownArea: Double? {
        let floorAreas = floorStructures.compactMap { RoomPlanService.area(from: $0.geometry) }
        if !floorAreas.isEmpty {
            return floorAreas.reduce(0, +)
        }
        if let structureGeometry,
           let value = RoomPlanService.area(from: structureGeometry) {
            return value
        }
        let values = rooms.compactMap(\.area)
        return values.isEmpty ? nil : values.reduce(0, +)
    }

    var displayArea: Double? { knownArea ?? announcedArea }
    var scanProgress: Double? {
        guard let expectedRoomCount, expectedRoomCount > 0 else { return nil }
        return min(Double(rooms.count) / Double(expectedRoomCount), 1)
    }
    var structureGeometry: RoomGeometry? {
        guard let structureGeometryData else { return nil }
        return try? JSONDecoder().decode(RoomGeometry.self, from: structureGeometryData)
    }

    var floorStructures: [FloorStructureArchive] {
        guard let floorStructuresData else { return [] }
        return (try? JSONDecoder().decode([FloorStructureArchive].self, from: floorStructuresData)) ?? []
    }

    func structure(for floorLevel: Int) -> FloorStructureArchive? {
        floorStructures.first { $0.floorLevel == floorLevel }
    }

    func saveFloorStructure(_ archive: FloorStructureArchive) throws {
        var structures = floorStructures.filter { $0.floorLevel != archive.floorLevel }
        structures.append(archive)
        floorStructuresData = try JSONEncoder().encode(structures.sorted { $0.floorLevel < $1.floorLevel })
    }

    init(
        name: String,
        address: String = "",
        type: PropertyType,
        city: String = "",
        postalCode: String = "",
        announcedArea: Double? = nil,
        expectedRoomCount: Int? = nil,
        floor: Int? = nil,
        price: Double? = nil,
        description: String = ""
    ) {
        id = UUID()
        self.name = name
        self.address = address
        self.city = city
        self.postalCode = postalCode
        typeRawValue = type.rawValue
        self.announcedArea = announcedArea
        self.expectedRoomCount = expectedRoomCount
        self.floor = floor
        self.price = price
        listingDescription = description
        createdAt = .now
        updatedAt = .now
        rooms = []
    }
}

@Model
final class ScannedRoom {
    @Attribute(.unique) var id: UUID
    var name: String
    var typeRawValue: String
    var createdAt: Date
    var area: Double?
    var usdzRelativePath: String
    @Attribute(.externalStorage) var geometryData: Data
    @Attribute(.externalStorage) var capturedRoomData: Data?
    var scanCampaignID: UUID?
    var floorLevel: Int = 0
    var visualCaptureManifestPath: String = ""
    var visualFrameCount: Int = 0
    var photogrammetryUSDZRelativePath: String = ""
    var gaussianSplatSPZRelativePath: String = ""
    var gaussianSplatPLYRelativePath: String = ""
    var gaussianSplatCount: Int = 0
    var gaussianSplatCheckpointRelativePath: String = ""
    var gaussianSplatDownscaleFactor: Float = 2
    @Attribute(.externalStorage) var gaussianSplatPreviewData: Data?
    var property: Property?

    var type: RoomType {
        get { RoomType(rawValue: typeRawValue) ?? .other }
        set { typeRawValue = newValue.rawValue }
    }

    var geometry: RoomGeometry? {
        try? JSONDecoder().decode(RoomGeometry.self, from: geometryData)
    }

    init(
        name: String,
        type: RoomType,
        area: Double?,
        usdzRelativePath: String,
        geometry: RoomGeometry,
        capturedRoomData: Data? = nil,
        scanCampaignID: UUID? = nil,
        floorLevel: Int = 0,
        visualCaptureManifestPath: String = "",
        visualFrameCount: Int = 0,
        photogrammetryUSDZRelativePath: String = "",
        gaussianSplatSPZRelativePath: String = "",
        gaussianSplatPLYRelativePath: String = "",
        gaussianSplatCount: Int = 0,
        gaussianSplatCheckpointRelativePath: String = "",
        gaussianSplatDownscaleFactor: Float = 2,
        gaussianSplatPreviewData: Data? = nil
    ) throws {
        id = UUID()
        self.name = name
        typeRawValue = type.rawValue
        createdAt = .now
        self.area = area
        self.usdzRelativePath = usdzRelativePath
        geometryData = try JSONEncoder().encode(geometry)
        self.capturedRoomData = capturedRoomData
        self.scanCampaignID = scanCampaignID
        self.floorLevel = floorLevel
        self.visualCaptureManifestPath = visualCaptureManifestPath
        self.visualFrameCount = visualFrameCount
        self.photogrammetryUSDZRelativePath = photogrammetryUSDZRelativePath
        self.gaussianSplatSPZRelativePath = gaussianSplatSPZRelativePath
        self.gaussianSplatPLYRelativePath = gaussianSplatPLYRelativePath
        self.gaussianSplatCount = gaussianSplatCount
        self.gaussianSplatCheckpointRelativePath = gaussianSplatCheckpointRelativePath
        self.gaussianSplatDownscaleFactor = gaussianSplatDownscaleFactor
        self.gaussianSplatPreviewData = gaussianSplatPreviewData
    }
}

extension Int {
    var propertyTwinFloorLabel: String {
        switch self {
        case ...(-2): "Sous-sol \(abs(self))"
        case -1: "Sous-sol"
        case 0: "Rez-de-chaussée"
        case 1: "1er étage"
        default: "\(self)e étage"
        }
    }
}
