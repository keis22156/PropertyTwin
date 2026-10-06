import ARKit
import CoreImage
import Foundation
import ImageIO
import simd

struct SpatialCaptureFrame: Sendable {
    let jpegData: Data
    let cameraTransform: CodableTransform
    let intrinsics: [Float]
    let imageWidth: Int
    let imageHeight: Int
    let timestamp: TimeInterval
    let lidarPoints: [SpatialLidarPoint]
}

struct SpatialLidarPoint: Sendable {
    let position: SIMD3<Float>
    let red: UInt8
    let green: UInt8
    let blue: UInt8
}

struct SpatialCaptureManifest: Codable, Sendable {
    struct Frame: Codable, Sendable {
        let imageRelativePath: String
        let cameraTransform: CodableTransform
        let intrinsics: [Float]
        let imageWidth: Int
        let imageHeight: Int
        let timestamp: TimeInterval
    }

    let roomID: UUID
    let createdAt: Date
    let frames: [Frame]
    let lidarPointCloudRelativePath: String?
}

enum SpatialCaptureError: LocalizedError {
    case applicationSupportUnavailable
    case imageConversionFailed

    var errorDescription: String? {
        switch self {
        case .applicationSupportUnavailable: "Le dossier de capture visuelle est indisponible."
        case .imageConversionFailed: "Une image caméra n’a pas pu être préparée."
        }
    }
}

final class SpatialFrameSampler {
    private let context = CIContext(options: [.cacheIntermediates: false])
    private var lastTransform: simd_float4x4?
    private var lastTimestamp: TimeInterval = 0

    func sample(_ frame: ARFrame) -> SpatialCaptureFrame? {
        // Gaussian reconstruction is extremely sensitive to wrong poses.
        // Never persist a frame while ARKit is initializing, relocalizing or
        // reporting insufficient visual features.
        guard case .normal = frame.camera.trackingState else { return nil }
        guard shouldCapture(frame.camera.transform, timestamp: frame.timestamp) else { return nil }
        let image = CIImage(cvPixelBuffer: frame.capturedImage)
            .oriented(.right)
        let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)
        let cgImage = context.createCGImage(image, from: image.extent)
        guard let jpeg = context.jpegRepresentation(
            of: image,
            colorSpace: colorSpace ?? CGColorSpaceCreateDeviceRGB(),
            options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.94]
        ) else { return nil }

        lastTransform = frame.camera.transform
        lastTimestamp = frame.timestamp
        let resolution = frame.camera.imageResolution
        return SpatialCaptureFrame(
            jpegData: jpeg,
            cameraTransform: CodableTransform(frame.camera.viewMatrix(for: .portrait).inverse),
            intrinsics: Self.orientedIntrinsics(
                frame.camera.intrinsics,
                originalHeight: Float(resolution.height)
            ),
            imageWidth: Int(resolution.height),
            imageHeight: Int(resolution.width),
            timestamp: frame.timestamp,
            lidarPoints: Self.lidarPoints(from: frame, orientedImage: cgImage)
        )
    }

    private static func lidarPoints(from frame: ARFrame, orientedImage: CGImage?) -> [SpatialLidarPoint] {
        guard let depth = frame.smoothedSceneDepth ?? frame.sceneDepth,
              let orientedImage else { return [] }
        let depthMap = depth.depthMap
        let confidenceMap = depth.confidenceMap
        CVPixelBufferLockBaseAddress(depthMap, .readOnly)
        if let confidenceMap { CVPixelBufferLockBaseAddress(confidenceMap, .readOnly) }
        defer {
            CVPixelBufferUnlockBaseAddress(depthMap, .readOnly)
            if let confidenceMap { CVPixelBufferUnlockBaseAddress(confidenceMap, .readOnly) }
        }
        guard let depthBase = CVPixelBufferGetBaseAddress(depthMap) else { return [] }

        let width = CVPixelBufferGetWidth(depthMap)
        let height = CVPixelBufferGetHeight(depthMap)
        let depthStride = CVPixelBufferGetBytesPerRow(depthMap) / MemoryLayout<Float32>.stride
        let depthValues = depthBase.assumingMemoryBound(to: Float32.self)
        let confidenceBase = confidenceMap.flatMap(CVPixelBufferGetBaseAddress)?.assumingMemoryBound(to: UInt8.self)
        let confidenceStride = confidenceMap.map { CVPixelBufferGetBytesPerRow($0) } ?? 0
        let cameraResolution = frame.camera.imageResolution
        let scaleX = Float(width) / Float(cameraResolution.width)
        let scaleY = Float(height) / Float(cameraResolution.height)
        let intrinsics = frame.camera.intrinsics
        let fx = intrinsics.columns.0.x * scaleX
        let fy = intrinsics.columns.1.y * scaleY
        let cx = intrinsics.columns.2.x * scaleX
        let cy = intrinsics.columns.2.y * scaleY
        guard fx > 0, fy > 0,
              let rgba = rgbaBytes(from: orientedImage) else { return [] }

        var points: [SpatialLidarPoint] = []
        points.reserveCapacity((width / 6) * (height / 6))
        for v in stride(from: 2, to: height - 2, by: 6) {
            for u in stride(from: 2, to: width - 2, by: 6) {
                let confidence = confidenceBase.map { $0[v * confidenceStride + u] } ?? 2
                guard confidence >= 1 else { continue }
                let distance = depthValues[v * depthStride + u]
                guard distance.isFinite, distance > 0.25, distance < 6 else { continue }
                let cameraPoint = SIMD4<Float>(
                    (Float(u) - cx) * distance / fx,
                    -(Float(v) - cy) * distance / fy,
                    -distance,
                    1
                )
                let world = frame.camera.transform * cameraPoint

                // The stored image is rotated 90° clockwise from the depth map.
                let imageX = min(max(Int((1 - Float(v) / Float(height)) * Float(orientedImage.width)), 0), orientedImage.width - 1)
                let imageY = min(max(Int(Float(u) / Float(width) * Float(orientedImage.height)), 0), orientedImage.height - 1)
                let colorIndex = (imageY * orientedImage.width + imageX) * 4
                points.append(SpatialLidarPoint(
                    position: SIMD3(world.x, world.y, world.z),
                    red: rgba[colorIndex],
                    green: rgba[colorIndex + 1],
                    blue: rgba[colorIndex + 2]
                ))
            }
        }
        return points
    }

    private static func rgbaBytes(from image: CGImage) -> [UInt8]? {
        var bytes = [UInt8](repeating: 0, count: image.width * image.height * 4)
        guard let context = CGContext(
            data: &bytes,
            width: image.width,
            height: image.height,
            bitsPerComponent: 8,
            bytesPerRow: image.width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        return bytes
    }

    private func shouldCapture(_ transform: simd_float4x4, timestamp: TimeInterval) -> Bool {
        guard timestamp - lastTimestamp >= 0.42 else { return false }
        guard let lastTransform else { return true }

        let currentPosition = SIMD3<Float>(transform.columns.3.x, transform.columns.3.y, transform.columns.3.z)
        let previousPosition = SIMD3<Float>(lastTransform.columns.3.x, lastTransform.columns.3.y, lastTransform.columns.3.z)
        let distance = simd_distance(currentPosition, previousPosition)

        let currentForward = simd_normalize(SIMD3<Float>(-transform.columns.2.x, -transform.columns.2.y, -transform.columns.2.z))
        let previousForward = simd_normalize(SIMD3<Float>(-lastTransform.columns.2.x, -lastTransform.columns.2.y, -lastTransform.columns.2.z))
        let rotation = acos(min(max(simd_dot(currentForward, previousForward), -1), 1))
        return distance >= 0.16 || rotation >= .pi / 18
    }

    private static func orientedIntrinsics(
        _ matrix: simd_float3x3,
        originalHeight: Float
    ) -> [Float] {
        let focalX = matrix.columns.0.x
        let focalY = matrix.columns.1.y
        let centerX = matrix.columns.2.x
        let centerY = matrix.columns.2.y

        // The stored JPEG is rotated 90° clockwise from ARKit’s sensor buffer.
        // Rotate the calibration matrix into the exact same pixel coordinate system.
        return [
            focalY, 0, 0,
            0, focalX, 0,
            originalHeight - 1 - centerY, centerX, 1
        ]
    }
}

struct SpatialCaptureStorageService {
    private let fileManager = FileManager.default

    func store(_ frames: [SpatialCaptureFrame], roomID: UUID) throws -> String? {
        guard !frames.isEmpty else { return nil }
        let directory = try captureDirectory.appendingPathComponent(roomID.uuidString, isDirectory: true)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)

        var manifestFrames: [SpatialCaptureManifest.Frame] = []
        for (index, frame) in frames.enumerated() {
            let name = String(format: "frame-%03d.jpg", index)
            try frame.jpegData.write(to: directory.appendingPathComponent(name), options: .atomic)
            manifestFrames.append(.init(
                imageRelativePath: "\(roomID.uuidString)/\(name)",
                cameraTransform: frame.cameraTransform,
                intrinsics: frame.intrinsics,
                imageWidth: frame.imageWidth,
                imageHeight: frame.imageHeight,
                timestamp: frame.timestamp
            ))
        }

        let manifestName = "\(roomID.uuidString)/manifest.json"
        let pointCloudName = try storeLidarPointCloud(
            frames.flatMap(\.lidarPoints),
            directory: directory,
            roomID: roomID
        )
        let manifest = SpatialCaptureManifest(
            roomID: roomID,
            createdAt: .now,
            frames: manifestFrames,
            lidarPointCloudRelativePath: pointCloudName
        )
        try JSONEncoder().encode(manifest).write(
            to: try captureDirectory.appendingPathComponent(manifestName),
            options: .atomic
        )
        return manifestName
    }

    private func storeLidarPointCloud(
        _ points: [SpatialLidarPoint],
        directory: URL,
        roomID: UUID
    ) throws -> String? {
        guard points.count >= 500 else { return nil }
        let header = "ply\nformat binary_little_endian 1.0\nelement vertex \(points.count)\n" +
            "property float x\nproperty float y\nproperty float z\n" +
            "property uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n"
        var ply = Data(header.utf8)
        ply.reserveCapacity(ply.count + points.count * 15)
        for point in points {
            for value in [point.position.x, point.position.y, point.position.z] {
                var bits = value.bitPattern.littleEndian
                withUnsafeBytes(of: &bits) { ply.append(contentsOf: $0) }
            }
            ply.append(point.red)
            ply.append(point.green)
            ply.append(point.blue)
        }
        let fileName = "lidar-seed.ply"
        try ply.write(to: directory.appendingPathComponent(fileName), options: .atomic)
        return "\(roomID.uuidString)/\(fileName)"
    }

    func manifest(relativePath: String) -> SpatialCaptureManifest? {
        guard let data = try? Data(contentsOf: try captureDirectory.appendingPathComponent(relativePath)) else {
            return nil
        }
        return try? JSONDecoder().decode(SpatialCaptureManifest.self, from: data)
    }

    func imageURL(relativePath: String) -> URL? {
        try? captureDirectory.appendingPathComponent(relativePath)
    }

    func inputDirectory(relativeManifestPath: String) -> URL? {
        guard !relativeManifestPath.isEmpty else { return nil }
        return try? captureDirectory
            .appendingPathComponent(relativeManifestPath)
            .deletingLastPathComponent()
    }

    private var captureDirectory: URL {
        get throws {
            guard let root = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
                throw SpatialCaptureError.applicationSupportUnavailable
            }
            let directory = root.appendingPathComponent("PropertyTwin/SpatialCaptures", isDirectory: true)
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
            return directory
        }
    }
}

protocol SpatialReconstructionProvider: Sendable {
    var isConfigured: Bool { get }
    func reconstruct(manifest: SpatialCaptureManifest) async throws -> URL
}
