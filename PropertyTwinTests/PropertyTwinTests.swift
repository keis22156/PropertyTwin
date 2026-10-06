import CoreGraphics
import Foundation
import simd
import SwiftData
import Testing
@testable import PropertyTwin

struct FloorPlanGeometryTests {
    @Test func horizontalWall() {
        let segment = FloorPlanGeometry.segment(for: surface(width: 4))
        #expect(isClose(segment.start.x, -2))
        #expect(isClose(segment.end.x, 2))
        #expect(isClose(segment.start.y, 0))
    }

    @Test func verticalWall() {
        let segment = FloorPlanGeometry.segment(for: surface(width: 4, yaw: .pi / 2))
        #expect(isClose(segment.start.x, 0))
        #expect(isClose(abs(segment.start.y), 2))
        #expect(isClose(abs(segment.end.y), 2))
    }

    @Test func inclinedWallPreservesLength() {
        let segment = FloorPlanGeometry.segment(for: surface(width: 5, yaw: .pi / 4))
        let distance = hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y)
        #expect(isClose(distance, 5))
        #expect(!isClose(segment.start.x, segment.end.x))
        #expect(!isClose(segment.start.y, segment.end.y))
    }

    @Test func boundingBoxIncludesEveryEndpoint() {
        let segments = [
            PlanSegment(id: UUID(), kind: .wall, start: .init(x: -2, y: 1), end: .init(x: 4, y: 1), length: 6),
            PlanSegment(id: UUID(), kind: .wall, start: .init(x: 4, y: -3), end: .init(x: 4, y: 5), length: 8)
        ]
        #expect(FloorPlanGeometry.bounds(for: segments) == PlanBounds(minX: -2, minY: -3, maxX: 4, maxY: 5))
    }

    @Test func normalizationCentersAndFlipsVerticalAxis() {
        let bounds = PlanBounds(minX: 0, minY: 0, maxX: 4, maxY: 2)
        let origin = FloorPlanGeometry.transform(point: .init(x: 0, y: 0), bounds: bounds, canvas: .init(width: 200, height: 120), padding: 20)
        let opposite = FloorPlanGeometry.transform(point: .init(x: 4, y: 2), bounds: bounds, canvas: .init(width: 200, height: 120), padding: 20)
        #expect(isClose(origin.x, 20))
        #expect(isClose(origin.y, 100))
        #expect(isClose(opposite.x, 180))
        #expect(isClose(opposite.y, 20))
    }

    @Test func meterToPixelScalingUsesLimitingDimension() {
        let bounds = PlanBounds(minX: 0, minY: 0, maxX: 4, maxY: 2)
        #expect(isClose(FloorPlanGeometry.metersToPixels(1, bounds: bounds, canvas: .init(width: 200, height: 200), padding: 20), 40))
    }

    @Test func polygonAreaSupportsIrregularFloor() {
        #expect(FloorPlanGeometry.polygonArea([[0, 0], [4, 0], [4, 2], [2, 3], [0, 2]]) == 10)
    }

    private func surface(width: Float, yaw: Float = 0) -> SurfaceGeometry {
        var transform = matrix_identity_float4x4
        transform.columns.0 = SIMD4<Float>(cos(yaw), 0, -sin(yaw), 0)
        transform.columns.2 = SIMD4<Float>(sin(yaw), 0, cos(yaw), 0)
        return SurfaceGeometry(
            id: UUID(), kind: .wall, width: width, height: 2.5, depth: 0,
            transform: CodableTransform(transform), confidence: "Élevée",
            parentIdentifier: nil, polygonCorners: [], isOpen: nil
        )
    }

    private func isClose(_ lhs: CGFloat, _ rhs: CGFloat, tolerance: CGFloat = 0.001) -> Bool {
        abs(lhs - rhs) < tolerance
    }
}

@MainActor
struct RepositoryTests {
    @Test func localPropertyRepositoryPersistsProperty() throws {
        let configuration = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: Property.self, ScannedRoom.self, configurations: configuration)
        let repository = LocalPropertyRepository(context: container.mainContext)
        try repository.add(Property(name: "Test", address: "1 rue Test", type: .apartment))
        let fetched = try repository.properties()
        #expect(fetched.count == 1)
        #expect(fetched.first?.name == "Test")
    }
}

struct BusinessServiceTests {
    @Test func financingUsesAmortizedLoanFormula() {
        let result = FinancingCalculator.calculate(.init(propertyPrice: 500_000, downPayment: 100_000, durationYears: 20, annualRatePercent: 3, renovationBudget: 20_000))
        #expect(result?.borrowedAmount == 420_000)
        #expect(result?.monthlyPayment ?? 0 > 2_000)
        #expect(result?.totalCost ?? 0 > 0)
    }

    @Test func zeroRateFinancingIsSupported() {
        let result = FinancingCalculator.calculate(.init(propertyPrice: 120_000, downPayment: 0, durationYears: 10, annualRatePercent: 0, renovationBudget: 0))
        #expect(result?.monthlyPayment == 1_000)
        #expect(result?.totalCost == 0)
    }

    @Test func renovationEstimateExplainsAssumptions() {
        let estimate = RenovationEstimateService().estimate(.init(level: .standard, elements: [.floors, .walls], area: 50))
        #expect(estimate != nil)
        #expect((estimate?.high ?? 0) > (estimate?.low ?? 0))
        #expect(estimate?.assumptions.isEmpty == false)
    }

    @Test func backendProviderRequiresHTTPS() throws {
        let insecure = try #require(URL(string: "http://example.com/generate"))
        let secure = try #require(URL(string: "https://example.com/generate"))
        #expect(BackendImageProvider(endpoint: insecure).isConfigured == false)
        #expect(BackendImageProvider(endpoint: secure).isConfigured)
    }


    @Test func floorLabelsAreUnambiguous() {
        #expect((-1).propertyTwinFloorLabel == "Sous-sol")
        #expect(0.propertyTwinFloorLabel == "Rez-de-chaussée")
        #expect(1.propertyTwinFloorLabel == "1er étage")
        #expect(3.propertyTwinFloorLabel == "3e étage")
    }

    @Test func floorStructureArchiveReplacesOnlyItsOwnLevel() throws {
        let property = Property(name: "Maison", type: .house)
        let ground = FloorStructureArchive(
            floorLevel: 0,
            campaignID: UUID(),
            roomCount: 2,
            geometry: emptyGeometry(),
            usdzRelativePath: "ground.usdz",
            updatedAt: .now
        )
        let first = FloorStructureArchive(
            floorLevel: 1,
            campaignID: UUID(),
            roomCount: 3,
            geometry: emptyGeometry(),
            usdzRelativePath: "first.usdz",
            updatedAt: .now
        )
        try property.saveFloorStructure(ground)
        try property.saveFloorStructure(first)

        var replacement = ground
        replacement = FloorStructureArchive(
            floorLevel: 0,
            campaignID: UUID(),
            roomCount: 4,
            geometry: emptyGeometry(),
            usdzRelativePath: "ground-v2.usdz",
            updatedAt: .now
        )
        try property.saveFloorStructure(replacement)

        #expect(property.floorStructures.count == 2)
        #expect(property.structure(for: 0)?.roomCount == 4)
        #expect(property.structure(for: 1)?.roomCount == 3)
    }

    private func emptyGeometry() -> RoomGeometry {
        RoomGeometry(
            roomIdentifier: UUID(),
            walls: [],
            doors: [],
            windows: [],
            openings: [],
            floors: [],
            objects: [],
            sections: []
        )
    }

    @Test func analyticsAggregationUsesOnlyMatchingProperty() {
        let firstID = UUID()
        let secondID = UUID()
        let roomID = UUID()
        let events = [
            AnalyticsEvent(type: .propertyViewed, propertyID: firstID),
            AnalyticsEvent(type: .planOpened, propertyID: firstID, roomID: roomID),
            AnalyticsEvent(type: .propertyViewed, propertyID: secondID)
        ]
        let summary = AnalyticsAggregator.summary(events: events, propertyID: firstID)
        #expect(summary.views == 1)
        #expect(summary.planOpens == 1)
        #expect(summary.roomAttention[roomID] == 1)
    }
}
