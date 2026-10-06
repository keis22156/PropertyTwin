import Foundation
import RoomPlan

enum ScanStorageError: LocalizedError {
    case applicationSupportUnavailable
    case exportFailed(Error)

    var errorDescription: String? {
        switch self {
        case .applicationSupportUnavailable: "Le dossier de sauvegarde est indisponible."
        case .exportFailed: "L’export du modèle 3D a échoué."
        }
    }
}

struct ScanStorageService {
    private let fileManager = FileManager.default

    private var scansDirectory: URL {
        get throws {
            guard let root = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
                throw ScanStorageError.applicationSupportUnavailable
            }
            let directory = root.appendingPathComponent("PropertyTwin/Scans", isDirectory: true)
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
            return directory
        }
    }

    func export(_ room: CapturedRoom, id: UUID) throws -> String {
        let fileName = "room-\(id.uuidString).usdz"
        let url = try scansDirectory.appendingPathComponent(fileName)
        do {
            try room.export(to: url, exportOptions: .mesh)
            return fileName
        } catch {
            throw ScanStorageError.exportFailed(error)
        }
    }

    func export(_ structure: CapturedStructure, id: UUID) throws -> String {
        let fileName = "structure-\(id.uuidString).usdz"
        let url = try scansDirectory.appendingPathComponent(fileName)
        do {
            try structure.export(to: url, exportOptions: .mesh)
            return fileName
        } catch {
            throw ScanStorageError.exportFailed(error)
        }
    }

    func url(for relativePath: String) -> URL? {
        try? scansDirectory.appendingPathComponent(relativePath)
    }

    func remove(relativePath: String) {
        guard let url = url(for: relativePath) else { return }
        try? fileManager.removeItem(at: url)
    }
}
