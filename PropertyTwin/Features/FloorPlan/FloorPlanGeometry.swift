import CoreGraphics
import Foundation
import simd

struct PlanPoint: Hashable {
    let x: CGFloat
    let y: CGFloat
}

struct PlanSegment: Identifiable, Hashable {
    let id: UUID
    let kind: SurfaceKind
    let start: PlanPoint
    let end: PlanPoint
    let length: CGFloat
}

struct PlanBounds: Equatable {
    let minX: CGFloat
    let minY: CGFloat
    let maxX: CGFloat
    let maxY: CGFloat

    var width: CGFloat { max(maxX - minX, 0.001) }
    var height: CGFloat { max(maxY - minY, 0.001) }
}

enum FloorPlanGeometry {
    static func segment(for surface: SurfaceGeometry) -> PlanSegment {
        let matrix = surface.transform.matrix
        let center = SIMD3<Float>(matrix.columns.3.x, matrix.columns.3.y, matrix.columns.3.z)
        let axisValue = SIMD3<Float>(matrix.columns.0.x, matrix.columns.0.y, matrix.columns.0.z)
        let axis = simd_length(axisValue) > 0 ? simd_normalize(axisValue) : SIMD3<Float>(1, 0, 0)
        let half = axis * (surface.width / 2)
        return PlanSegment(
            id: surface.id,
            kind: surface.kind,
            start: PlanPoint(x: CGFloat(center.x - half.x), y: CGFloat(center.z - half.z)),
            end: PlanPoint(x: CGFloat(center.x + half.x), y: CGFloat(center.z + half.z)),
            length: CGFloat(surface.width)
        )
    }

    static func bounds(for segments: [PlanSegment]) -> PlanBounds? {
        let points = segments.flatMap { [$0.start, $0.end] }
        guard let first = points.first else { return nil }
        return PlanBounds(
            minX: points.map(\.x).min() ?? first.x,
            minY: points.map(\.y).min() ?? first.y,
            maxX: points.map(\.x).max() ?? first.x,
            maxY: points.map(\.y).max() ?? first.y
        )
    }

    static func transform(point: PlanPoint, bounds: PlanBounds, canvas: CGSize, padding: CGFloat = 36) -> CGPoint {
        let available = CGSize(width: max(canvas.width - padding * 2, 1), height: max(canvas.height - padding * 2, 1))
        let scale = min(available.width / bounds.width, available.height / bounds.height)
        let drawn = CGSize(width: bounds.width * scale, height: bounds.height * scale)
        let origin = CGPoint(x: (canvas.width - drawn.width) / 2, y: (canvas.height - drawn.height) / 2)
        return CGPoint(
            x: origin.x + (point.x - bounds.minX) * scale,
            y: origin.y + (bounds.maxY - point.y) * scale
        )
    }

    static func metersToPixels(_ meters: CGFloat, bounds: PlanBounds, canvas: CGSize, padding: CGFloat = 36) -> CGFloat {
        let available = CGSize(width: max(canvas.width - padding * 2, 1), height: max(canvas.height - padding * 2, 1))
        return meters * min(available.width / bounds.width, available.height / bounds.height)
    }

    static func polygonArea(_ corners: [[Float]]) -> Double? {
        guard corners.count >= 3, corners.allSatisfy({ $0.count >= 2 }) else { return nil }
        var twiceArea = 0.0
        for index in corners.indices {
            let next = corners[(index + 1) % corners.count]
            twiceArea += Double(corners[index][0] * next[1] - next[0] * corners[index][1])
        }
        let area = abs(twiceArea) / 2
        return area.isFinite && area > 0 ? area : nil
    }
}
