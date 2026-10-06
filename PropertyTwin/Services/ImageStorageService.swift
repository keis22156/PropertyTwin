import Foundation
import UIKit

enum ImageStorageError: LocalizedError {
    case invalidImage
    case unavailableDirectory
    var errorDescription: String? {
        switch self {
        case .invalidImage: "Cette image ne peut pas être enregistrée."
        case .unavailableDirectory: "Le stockage des images est indisponible."
        }
    }
}

struct StoredImagePaths: Sendable {
    let original: String
    let thumbnail: String
}

struct ImageStorageService: Sendable {
    func store(_ data: Data, id: UUID = UUID()) throws -> StoredImagePaths {
        guard let image = UIImage(data: data) else { throw ImageStorageError.invalidImage }
        let directory = try imagesDirectory()
        let originalName = "image-\(id.uuidString).jpg"
        let thumbnailName = "thumb-\(id.uuidString).jpg"
        guard let original = image.preparingForDisplay()?.jpegData(compressionQuality: 0.84),
              let thumbnailImage = image.preparingThumbnail(of: CGSize(width: 600, height: 420)),
              let thumbnail = thumbnailImage.jpegData(compressionQuality: 0.72) else {
            throw ImageStorageError.invalidImage
        }
        try original.write(to: directory.appendingPathComponent(originalName), options: .atomic)
        try thumbnail.write(to: directory.appendingPathComponent(thumbnailName), options: .atomic)
        return StoredImagePaths(original: originalName, thumbnail: thumbnailName)
    }

    func url(for relativePath: String) -> URL? {
        try? imagesDirectory().appendingPathComponent(relativePath)
    }

    func data(for relativePath: String) throws -> Data {
        try Data(contentsOf: imagesDirectory().appendingPathComponent(relativePath))
    }

    func remove(_ relativePaths: [String]) {
        guard let directory = try? imagesDirectory() else { return }
        for path in relativePaths { try? FileManager.default.removeItem(at: directory.appendingPathComponent(path)) }
    }

    private func imagesDirectory() throws -> URL {
        guard let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            throw ImageStorageError.unavailableDirectory
        }
        let directory = root.appendingPathComponent("PropertyTwin/Images", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }
}
