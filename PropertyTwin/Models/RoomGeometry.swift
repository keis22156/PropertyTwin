import Foundation
import simd

enum SurfaceKind: String, Codable {
    case wall, door, window, opening, floor
}

struct CodableTransform: Codable, Hashable {
    let values: [Float]

    init(_ matrix: simd_float4x4) {
        values = [
            matrix.columns.0.x, matrix.columns.0.y, matrix.columns.0.z, matrix.columns.0.w,
            matrix.columns.1.x, matrix.columns.1.y, matrix.columns.1.z, matrix.columns.1.w,
            matrix.columns.2.x, matrix.columns.2.y, matrix.columns.2.z, matrix.columns.2.w,
            matrix.columns.3.x, matrix.columns.3.y, matrix.columns.3.z, matrix.columns.3.w
        ]
    }

    var matrix: simd_float4x4 {
        guard values.count == 16 else { return matrix_identity_float4x4 }
        return simd_float4x4(
            SIMD4(values[0], values[1], values[2], values[3]),
            SIMD4(values[4], values[5], values[6], values[7]),
            SIMD4(values[8], values[9], values[10], values[11]),
            SIMD4(values[12], values[13], values[14], values[15])
        )
    }
}

struct SurfaceGeometry: Codable, Identifiable, Hashable {
    let id: UUID
    let kind: SurfaceKind
    let width: Float
    let height: Float
    let depth: Float
    let transform: CodableTransform
    let confidence: String
    let parentIdentifier: UUID?
    let polygonCorners: [[Float]]
    let isOpen: Bool?
}

struct ObjectGeometry: Codable, Identifiable, Hashable {
    let id: UUID
    let category: String
    let dimensions: [Float]
    let transform: CodableTransform
    let confidence: String
    let parentIdentifier: UUID?
}

struct RoomSectionGeometry: Codable, Hashable {
    let label: String
    let center: [Float]
}

struct RoomGeometry: Codable, Hashable {
    let roomIdentifier: UUID
    let walls: [SurfaceGeometry]
    let doors: [SurfaceGeometry]
    let windows: [SurfaceGeometry]
    let openings: [SurfaceGeometry]
    let floors: [SurfaceGeometry]
    let objects: [ObjectGeometry]
    let sections: [RoomSectionGeometry]

    var allSurfaces: [SurfaceGeometry] { walls + doors + windows + openings + floors }
    var mainHeight: Double? {
        let heights = walls.map { Double($0.height) }.filter { $0 > 0 }
        guard !heights.isEmpty else { return nil }
        return heights.sorted()[heights.count / 2]
    }
}
