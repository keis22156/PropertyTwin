import Foundation
import RoomPlan

enum StructureBuildState: Equatable {
    case unavailable
    case ready
    case incompatible
}

struct StructureBuildResult: Sendable {
    let geometry: RoomGeometry
    let relativeUSDZPath: String
}

enum PropertyStructureService {
    static func build(from roomData: [Data], propertyID: UUID) async throws -> StructureBuildResult {
        let decoder = JSONDecoder()
        let rooms = try roomData.map { try decoder.decode(CapturedRoom.self, from: $0) }
        guard rooms.count >= 2 else { throw StructureBuildError.notEnoughRooms }
        let structure = try await StructureBuilder(options: []).capturedStructure(from: rooms)
        let geometry = combinedGeometry(from: structure)
        let path = try ScanStorageService().export(structure, id: propertyID)
        return StructureBuildResult(geometry: geometry, relativeUSDZPath: path)
    }

    private static func combinedGeometry(from structure: CapturedStructure) -> RoomGeometry {
        let roomGeometries = structure.rooms.map(RoomPlanService.geometry)
        return RoomGeometry(
            roomIdentifier: structure.identifier,
            walls: roomGeometries.flatMap(\.walls),
            doors: roomGeometries.flatMap(\.doors),
            windows: roomGeometries.flatMap(\.windows),
            openings: roomGeometries.flatMap(\.openings),
            floors: roomGeometries.flatMap(\.floors),
            objects: roomGeometries.flatMap(\.objects),
            sections: roomGeometries.flatMap(\.sections)
        )
    }
}

enum StructureBuildError: LocalizedError {
    case notEnoughRooms
    var errorDescription: String? { "Deux pièces compatibles au minimum sont nécessaires." }
}
