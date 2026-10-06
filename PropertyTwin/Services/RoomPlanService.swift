import AVFoundation
import Foundation
import RoomPlan

enum RoomScanError: LocalizedError {
    case unsupported
    case cameraDenied
    case cancelled
    case processingFailed(Error)

    var errorDescription: String? {
        switch self {
        case .unsupported: "Cet appareil ne prend pas en charge le scan spatial PropertyTwin."
        case .cameraDenied: "L’accès à la caméra est nécessaire pour scanner une pièce."
        case .cancelled: "Le scan a été annulé."
        case .processingFailed: "Le traitement du scan a échoué."
        }
    }
}

enum RoomPlanService {
    static var isSupported: Bool {
#if targetEnvironment(simulator)
        false
#else
        RoomCaptureSession.isSupported
#endif
    }

    static func requestCameraAccess() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: true
        case .notDetermined: await AVCaptureDevice.requestAccess(for: .video)
        default: false
        }
    }

    static func geometry(from room: CapturedRoom) -> RoomGeometry {
        RoomGeometry(
            roomIdentifier: room.identifier,
            walls: room.walls.map { surface($0, kind: .wall) },
            doors: room.doors.map { surface($0, kind: .door) },
            windows: room.windows.map { surface($0, kind: .window) },
            openings: room.openings.map { surface($0, kind: .opening) },
            floors: room.floors.map { surface($0, kind: .floor) },
            objects: room.objects.map {
                ObjectGeometry(
                    id: $0.identifier,
                    category: String(describing: $0.category),
                    dimensions: [$0.dimensions.x, $0.dimensions.y, $0.dimensions.z],
                    transform: CodableTransform($0.transform),
                    confidence: confidence($0.confidence),
                    parentIdentifier: $0.parentIdentifier
                )
            },
            sections: room.sections.map {
                RoomSectionGeometry(
                    label: String(describing: $0.label),
                    center: [$0.center.x, $0.center.y, $0.center.z]
                )
            }
        )
    }

    static func area(from geometry: RoomGeometry) -> Double? {
        let values = geometry.floors.compactMap { FloorPlanGeometry.polygonArea($0.polygonCorners) }
        guard !values.isEmpty else { return nil }
        return values.reduce(0, +)
    }

    private static func surface(_ value: CapturedRoom.Surface, kind: SurfaceKind) -> SurfaceGeometry {
        let isOpen: Bool?
        if case let .door(open) = value.category {
            isOpen = open
        } else {
            isOpen = nil
        }
        return SurfaceGeometry(
            id: value.identifier,
            kind: kind,
            width: value.dimensions.x,
            height: value.dimensions.y,
            depth: value.dimensions.z,
            transform: CodableTransform(value.transform),
            confidence: confidence(value.confidence),
            parentIdentifier: value.parentIdentifier,
            polygonCorners: value.polygonCorners.map { [$0.x, $0.y] },
            isOpen: isOpen
        )
    }

    private static func confidence(_ value: CapturedRoom.Confidence) -> String {
        switch value {
        case .high: "Élevée"
        case .medium: "Moyenne"
        case .low: "Faible"
        @unknown default: "Inconnue"
        }
    }
}
