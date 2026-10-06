import Foundation
import RealityKit
import Msplat

enum ApplePhotogrammetryError: LocalizedError {
    case unsupported
    case insufficientImages
    case captureUnavailable
    case cancelled
    case reconstructionFailed(String)

    var errorDescription: String? {
        switch self {
        case .unsupported:
            "La reconstruction photogrammétrique Apple n’est pas prise en charge par cet appareil."
        case .insufficientImages:
            "Apple exige davantage de vues recouvrantes. Effectuez un nouveau scan lent et complet."
        case .captureUnavailable:
            "Les images spatiales du scan sont introuvables."
        case .cancelled:
            "La reconstruction Apple a été annulée."
        case .reconstructionFailed(let reason):
            "RealityKit n’a pas pu reconstruire cette pièce : \(reason)"
        }
    }
}

actor ApplePhotogrammetryReconstructionService {
    static var isSupported: Bool {
        PhotogrammetrySession.isSupported
    }

    func reconstruct(
        manifestPath: String,
        roomID: UUID,
        progress: @escaping @Sendable (Double) async -> Void
    ) async throws -> String {
        guard PhotogrammetrySession.isSupported else {
            throw ApplePhotogrammetryError.unsupported
        }

        let storage = SpatialCaptureStorageService()
        guard let manifest = storage.manifest(relativePath: manifestPath),
              manifest.frames.count >= 20,
              let inputDirectory = storage.inputDirectory(relativeManifestPath: manifestPath) else {
            throw manifestPath.isEmpty
                ? ApplePhotogrammetryError.captureUnavailable
                : ApplePhotogrammetryError.insufficientImages
        }

        let relativePath = "\(roomID.uuidString)-photoreal.usdz"
        let outputURL = try reconstructionDirectory.appendingPathComponent(relativePath)
        try? FileManager.default.removeItem(at: outputURL)

        var configuration = PhotogrammetrySession.Configuration()
        configuration.sampleOrdering = .sequential
        configuration.featureSensitivity = .high
        let session = try PhotogrammetrySession(input: inputDirectory, configuration: configuration)
        let request = PhotogrammetrySession.Request.modelFile(
            url: outputURL,
            detail: .reduced,
            geometry: nil
        )
        try session.process(requests: [request])

        for try await output in session.outputs {
            switch output {
            case .requestProgress(_, let fraction):
                await progress(fraction)
            case .requestComplete(_, let result):
                if case .modelFile(let url) = result {
                    await progress(1)
                    return url.lastPathComponent
                }
            case .requestError(_, let error):
                throw ApplePhotogrammetryError.reconstructionFailed(error.localizedDescription)
            case .processingCancelled:
                throw ApplePhotogrammetryError.cancelled
            case .invalidSample(_, let reason):
                print("Photogrammetry invalid sample: \(reason)")
            default:
                continue
            }
        }

        throw ApplePhotogrammetryError.reconstructionFailed("aucun modèle n’a été produit")
    }

    nonisolated func modelURL(relativePath: String) -> URL? {
        guard !relativePath.isEmpty,
              let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            return nil
        }
        return root
            .appendingPathComponent("PropertyTwin/Photogrammetry", isDirectory: true)
            .appendingPathComponent(relativePath)
    }

    private var reconstructionDirectory: URL {
        get throws {
            guard let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
                throw ApplePhotogrammetryError.captureUnavailable
            }
            let directory = root.appendingPathComponent("PropertyTwin/Photogrammetry", isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            return directory
        }
    }
}
