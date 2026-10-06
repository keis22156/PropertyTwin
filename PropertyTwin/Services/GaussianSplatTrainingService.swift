import CoreGraphics
import Foundation
import ImageIO
import Msplat
import simd

struct GaussianTrainingResult: Sendable {
    let spzRelativePath: String
    let plyRelativePath: String
    let previewJPEG: Data?
    let checkpointRelativePath: String
    let splatCount: Int
    let downscaleFactor: Float
}

enum GaussianSplatError: LocalizedError {
    case insufficientFrames(Int)
    case inadequateCoverage
    case lidarUnavailable
    case geometryUnavailable
    case datasetInvalid
    case storageUnavailable
    case thermalLimit

    var errorDescription: String? {
        switch self {
        case .insufficientFrames(let count):
            "Seulement \(count) images exploitables. Un minimum de 30 vues suivies précisément est nécessaire."
        case .inadequateCoverage:
            "Les images sont trop proches ou trop similaires. Refaites le tour complet de la pièce en visant aussi les angles."
        case .lidarUnavailable:
            "Ce scan ne contient pas de nuage RGB‑D LiDAR. Effectuez un nouveau scan avec la capture Gaussian activée."
        case .geometryUnavailable:
            "La géométrie RoomPlan nécessaire pour initialiser les splats est indisponible."
        case .datasetInvalid:
            "Le dataset ARKit/COLMAP généré est invalide."
        case .storageUnavailable:
            "Le stockage local du modèle Gaussian Splat est indisponible."
        case .thermalLimit:
            "L’iPhone est trop chaud pour poursuivre l’entraînement Ultra. Laissez-le refroidir puis relancez."
        }
    }
}

actor GaussianSplatTrainingService {
    func makeRenderSession(
        roomID: UUID,
        checkpointRelativePath: String,
        manifestPath: String,
        geometry: RoomGeometry,
        downscaleFactor: Float
    ) throws -> GaussianSplatRenderSession {
        guard !checkpointRelativePath.isEmpty else {
            throw GaussianSplatError.datasetInvalid
        }
        let datasetURL = try datasetDirectory.appendingPathComponent(roomID.uuidString, isDirectory: true)
        let checkpointURL = try outputDirectory.appendingPathComponent(checkpointRelativePath)
        guard FileManager.default.fileExists(atPath: checkpointURL.path) else {
            throw GaussianSplatError.datasetInvalid
        }
        guard let manifest = SpatialCaptureStorageService().manifest(relativePath: manifestPath) else {
            throw GaussianSplatError.datasetInvalid
        }
        return GaussianSplatRenderSession(
            datasetURL: datasetURL,
            checkpointURL: checkpointURL,
            manifest: manifest,
            geometry: geometry,
            downscaleFactor: downscaleFactor
        )
    }

    func train(
        manifestPath: String,
        geometry: RoomGeometry,
        roomID: UUID,
        iterations: Int = 15_000,
        progress: @escaping @Sendable (Double, Int) async -> Void
    ) async throws -> GaussianTrainingResult {
        let spatialStorage = SpatialCaptureStorageService()
        guard let manifest = spatialStorage.manifest(relativePath: manifestPath),
              manifest.frames.count >= 30 else {
            let count = spatialStorage.manifest(relativePath: manifestPath)?.frames.count ?? 0
            throw GaussianSplatError.insufficientFrames(count)
        }
        guard Self.hasReliableCoverage(manifest.frames) else {
            throw GaussianSplatError.inadequateCoverage
        }
        guard let lidarPath = manifest.lidarPointCloudRelativePath,
              let lidarURL = spatialStorage.imageURL(relativePath: lidarPath),
              FileManager.default.fileExists(atPath: lidarURL.path) else {
            throw GaussianSplatError.lidarUnavailable
        }
        guard !geometry.walls.isEmpty else {
            throw GaussianSplatError.geometryUnavailable
        }

        await progress(0.01, 0)
        let datasetURL = try makeDataset(
            manifest: manifest,
            geometry: geometry,
            spatialStorage: spatialStorage,
            roomID: roomID
        )
        await progress(0.03, 0)
        let downscaleFactor: Float = ProcessInfo.processInfo.physicalMemory >= 7_000_000_000 ? 1.25 : 1.65
        let dataset = GaussianDataset(path: datasetURL.path, downscaleFactor: downscaleFactor)
        guard dataset.numTrain >= 30 else {
            throw GaussianSplatError.datasetInvalid
        }

        var config = TrainingConfig()
        config.iterations = Int32(iterations)
        config.shDegree = 3
        config.shDegreeInterval = 1_500
        config.numDownscales = 3
        config.resolutionSchedule = 2_500
        config.refineEvery = 100
        config.warmupLength = 600
        config.densifyGradThresh = 0.00012
        config.densifySizeThresh = 0.008
        config.stopScreenSizeAt = 9_000
        config.stopDensifyAt = 9_000
        config.bgColor = (0.92, 0.92, 0.92)

        let trainer = GaussianTrainer(dataset: dataset, config: config)
        await progress(0.05, trainer.splatCount)
        var latestStats: TrainingStats?
        for step in 0..<iterations {
            if ProcessInfo.processInfo.thermalState == .critical {
                throw GaussianSplatError.thermalLimit
            }
            latestStats = trainer.step()
            if step.isMultiple(of: 20) || step == iterations - 1 {
                let trainingFraction = Double(step + 1) / Double(iterations)
                await progress(0.05 + trainingFraction * 0.95, latestStats?.splatCount ?? 0)
                if ProcessInfo.processInfo.thermalState == .serious {
                    try await Task.sleep(for: .milliseconds(120))
                } else {
                    await Task.yield()
                }
            }
        }

        let directory = try outputDirectory
        let spzName = "\(roomID.uuidString).spz"
        let plyName = "\(roomID.uuidString).ply"
        trainer.exportSpz(to: directory.appendingPathComponent(spzName).path)
        trainer.exportPly(to: directory.appendingPathComponent(plyName).path)
        let checkpointName = "\(roomID.uuidString).msplat-checkpoint"
        trainer.saveCheckpoint(to: directory.appendingPathComponent(checkpointName).path)

        let preview = trainer.render(cameraIndex: 0)
        let previewJPEG = Self.jpeg(from: preview)
        msplatSync()

        return GaussianTrainingResult(
            spzRelativePath: spzName,
            plyRelativePath: plyName,
            previewJPEG: previewJPEG,
            checkpointRelativePath: checkpointName,
            splatCount: latestStats?.splatCount ?? trainer.splatCount,
            downscaleFactor: downscaleFactor
        )
    }

    private static func hasReliableCoverage(_ frames: [SpatialCaptureManifest.Frame]) -> Bool {
        let positions = frames.map {
            SIMD3<Float>(
                $0.cameraTransform.matrix.columns.3.x,
                $0.cameraTransform.matrix.columns.3.y,
                $0.cameraTransform.matrix.columns.3.z
            )
        }
        guard let first = positions.first else { return false }
        var minimum = first
        var maximum = first
        var travelled: Float = 0
        for index in positions.indices {
            minimum = simd.min(minimum, positions[index])
            maximum = simd.max(maximum, positions[index])
            if index > positions.startIndex {
                travelled += simd_distance(positions[index - 1], positions[index])
            }
        }
        let horizontalSpan = simd_length(SIMD2(maximum.x - minimum.x, maximum.z - minimum.z))
        return horizontalSpan >= 0.75 && travelled >= 1.8
    }

    nonisolated func modelURL(relativePath: String) -> URL? {
        guard !relativePath.isEmpty,
              let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            return nil
        }
        return root.appendingPathComponent("PropertyTwin/GaussianSplats", isDirectory: true)
            .appendingPathComponent(relativePath)
    }

    private func makeDataset(
        manifest: SpatialCaptureManifest,
        geometry: RoomGeometry,
        spatialStorage: SpatialCaptureStorageService,
        roomID: UUID
    ) throws -> URL {
        let root = try datasetDirectory.appendingPathComponent(roomID.uuidString, isDirectory: true)
        let sparse = root.appendingPathComponent("sparse/0", isDirectory: true)
        let images = root.appendingPathComponent("images", isDirectory: true)
        try FileManager.default.createDirectory(at: sparse, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: images, withIntermediateDirectories: true)

        var cameras = "# CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[]\n"
        var imageRecords = "# IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME\n"
        var cameraIDs: [CameraSignature: Int] = [:]

        for (index, frame) in manifest.frames.enumerated() {
            guard let source = spatialStorage.imageURL(relativePath: frame.imageRelativePath) else { continue }
            let imageName = String(format: "frame-%04d.jpg", index)
            let destination = images.appendingPathComponent(imageName)
            if FileManager.default.fileExists(atPath: destination.path) {
                try FileManager.default.removeItem(at: destination)
            }
            try FileManager.default.copyItem(at: source, to: destination)

            let intrinsics = frame.intrinsics
            guard intrinsics.count >= 9 else { continue }
            let signature = CameraSignature(
                width: frame.imageWidth,
                height: frame.imageHeight,
                fx: intrinsics[0],
                fy: intrinsics[4],
                cx: intrinsics[6],
                cy: intrinsics[7]
            )
            let cameraID: Int
            if let existing = cameraIDs[signature] {
                cameraID = existing
            } else {
                cameraID = cameraIDs.count + 1
                cameraIDs[signature] = cameraID
                cameras += "\(cameraID) PINHOLE \(signature.width) \(signature.height) \(signature.fx) \(signature.fy) \(signature.cx) \(signature.cy)\n"
            }

            let pose = Self.colmapWorldToCamera(from: frame.cameraTransform.matrix)
            imageRecords += "\(index + 1) \(pose.q.real) \(pose.q.imag.x) \(pose.q.imag.y) \(pose.q.imag.z) \(pose.t.x) \(pose.t.y) \(pose.t.z) \(cameraID) \(imageName)\n\n"
        }

        try cameras.write(to: sparse.appendingPathComponent("cameras.txt"), atomically: true, encoding: .utf8)
        try imageRecords.write(to: sparse.appendingPathComponent("images.txt"), atomically: true, encoding: .utf8)
        if let lidarPath = manifest.lidarPointCloudRelativePath,
           let lidarURL = spatialStorage.imageURL(relativePath: lidarPath),
           FileManager.default.fileExists(atPath: lidarURL.path) {
            let destination = sparse.appendingPathComponent("points3D.ply")
            if FileManager.default.fileExists(atPath: destination.path) {
                try FileManager.default.removeItem(at: destination)
            }
            try FileManager.default.copyItem(at: lidarURL, to: destination)
            try? FileManager.default.removeItem(at: sparse.appendingPathComponent("points3D.txt"))
        } else {
            // Compatibility fallback for scans captured before RGB-D support.
            try Self.seedPoints(from: geometry).write(
                to: sparse.appendingPathComponent("points3D.txt"),
                atomically: true,
                encoding: .utf8
            )
            try? FileManager.default.removeItem(at: sparse.appendingPathComponent("points3D.ply"))
        }
        return root
    }

    private static func colmapWorldToCamera(
        from arCameraToWorld: simd_float4x4
    ) -> (q: simd_quatf, t: SIMD3<Float>) {
        let flip = simd_float3x3(
            SIMD3(1, 0, 0),
            SIMD3(0, -1, 0),
            SIMD3(0, 0, -1)
        )
        let arRotation = simd_float3x3(
            SIMD3(arCameraToWorld.columns.0.x, arCameraToWorld.columns.0.y, arCameraToWorld.columns.0.z),
            SIMD3(arCameraToWorld.columns.1.x, arCameraToWorld.columns.1.y, arCameraToWorld.columns.1.z),
            SIMD3(arCameraToWorld.columns.2.x, arCameraToWorld.columns.2.y, arCameraToWorld.columns.2.z)
        )
        let cameraToWorldOpenCV = arRotation * flip
        let worldToCamera = cameraToWorldOpenCV.transpose
        let center = SIMD3(
            arCameraToWorld.columns.3.x,
            arCameraToWorld.columns.3.y,
            arCameraToWorld.columns.3.z
        )
        return (simd_normalize(simd_quatf(worldToCamera)), -(worldToCamera * center))
    }

    private static func seedPoints(from geometry: RoomGeometry) -> String {
        var result = "# POINT3D_ID, X, Y, Z, R, G, B, ERROR, TRACK[]\n"
        var identifier = 1

        for surface in geometry.walls + geometry.floors {
            let transform = surface.transform.matrix
            let columns = max(Int(ceil(surface.width / 0.18)), 2)
            let rows = max(Int(ceil(max(surface.height, 0.2) / 0.18)), 2)
            for column in 0...columns {
                for row in 0...rows {
                    let u = Float(column) / Float(columns) - 0.5
                    let v = Float(row) / Float(rows) - 0.5
                    let local: SIMD4<Float>
                    if surface.kind == .floor {
                        local = SIMD4(u * surface.width, 0, v * max(surface.height, surface.depth), 1)
                    } else {
                        local = SIMD4(u * surface.width, v * surface.height, 0, 1)
                    }
                    let world = transform * local
                    result += "\(identifier) \(world.x) \(world.y) \(world.z) 190 190 190 0\n"
                    identifier += 1
                }
            }
        }
        return result
    }

    fileprivate static func jpeg(from pixels: PixelData) -> Data? {
        guard pixels.width > 0, pixels.height > 0 else { return nil }
        let bytes = pixels.pixels.map { UInt8(max(0, min(255, Int($0 * 255)))) }
        guard let provider = CGDataProvider(data: Data(bytes) as CFData),
              let image = CGImage(
                width: pixels.width,
                height: pixels.height,
                bitsPerComponent: 8,
                bitsPerPixel: 24,
                bytesPerRow: pixels.width * 3,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
                provider: provider,
                decode: nil,
                shouldInterpolate: true,
                intent: .defaultIntent
              ) else { return nil }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, "public.jpeg" as CFString, 1, nil) else {
            return nil
        }
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }

    private var datasetDirectory: URL {
        get throws {
            guard let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
                throw GaussianSplatError.storageUnavailable
            }
            let directory = root.appendingPathComponent("PropertyTwin/GaussianDatasets", isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            return directory
        }
    }

    private var outputDirectory: URL {
        get throws {
            guard let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
                throw GaussianSplatError.storageUnavailable
            }
            let directory = root.appendingPathComponent("PropertyTwin/GaussianSplats", isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            return directory
        }
    }
}

actor GaussianSplatRenderSession {
    private let dataset: GaussianDataset
    private let trainer: GaussianTrainer
    private let initialPose: [Float]
    private let navigationPolygon: [SIMD2<Float>]

    init(
        datasetURL: URL,
        checkpointURL: URL,
        manifest: SpatialCaptureManifest,
        geometry: RoomGeometry,
        downscaleFactor: Float
    ) {
        dataset = GaussianDataset(path: datasetURL.path, downscaleFactor: downscaleFactor)
        var config = TrainingConfig()
        config.iterations = 15_000
        config.shDegree = 3
        config.shDegreeInterval = 1_500
        config.numDownscales = 3
        config.resolutionSchedule = 2_500
        config.refineEvery = 100
        config.warmupLength = 600
        config.densifyGradThresh = 0.00012
        config.densifySizeThresh = 0.008
        config.stopScreenSizeAt = 9_000
        config.stopDensifyAt = 9_000
        config.bgColor = (0.92, 0.92, 0.92)
        trainer = GaussianTrainer(dataset: dataset, config: config)
        _ = trainer.loadCheckpoint(from: checkpointURL.path)
        initialPose = dataset.cameraPose(at: 0)
        navigationPolygon = Self.makeNavigationPolygon(manifest: manifest, geometry: geometry)
    }

    func render(yaw: Float, pitch: Float, walkForward: Float, walkRight: Float) -> Data? {
        var pose = Self.matrix(fromRowMajor: initialPose)
        let origin = SIMD3<Float>(pose.columns.3.x, pose.columns.3.y, pose.columns.3.z)
        let baseRight = SIMD3<Float>(pose.columns.0.x, 0, pose.columns.0.z)
        let baseForward = -SIMD3<Float>(pose.columns.2.x, 0, pose.columns.2.z)
        let rotation = simd_float4x4(simd_quatf(angle: yaw, axis: SIMD3(0, 1, 0)))
            * simd_float4x4(simd_quatf(angle: pitch, axis: SIMD3(1, 0, 0)))
        pose = pose * rotation
        var position = origin
            + simd_normalize(baseRight) * walkRight
            + simd_normalize(baseForward) * walkForward
        let proposed = SIMD2<Float>(position.x, position.z)
        if !navigationPolygon.isEmpty && !Self.contains(proposed, polygon: navigationPolygon) {
            let safe = Self.lastInsidePoint(from: SIMD2(origin.x, origin.z), to: proposed, polygon: navigationPolygon)
            position.x = safe.x
            position.z = safe.y
        }
        // Walking mode intentionally keeps the physical capture height.
        position.y = origin.y
        pose.columns.3 = SIMD4(position.x, position.y, position.z, 1)
        return GaussianSplatTrainingService.jpeg(
            from: trainer.renderFromPose(camToWorld: Self.rowMajor(from: pose))
        )
    }

    private static func makeNavigationPolygon(
        manifest: SpatialCaptureManifest,
        geometry: RoomGeometry
    ) -> [SIMD2<Float>] {
        let cameraPositions = manifest.frames.map {
            SIMD3<Float>(
                $0.cameraTransform.matrix.columns.3.x,
                $0.cameraTransform.matrix.columns.3.y,
                $0.cameraTransform.matrix.columns.3.z
            )
        }
        guard !cameraPositions.isEmpty else { return [] }
        let mean = cameraPositions.reduce(SIMD3<Float>.zero, +) / Float(cameraPositions.count)
        let scale = 1 / max(cameraPositions.map {
            let centered = $0 - mean
            return max(abs(centered.x), abs(centered.y), abs(centered.z))
        }.max() ?? 1, 0.01)

        var worldPoints: [SIMD2<Float>] = []
        for floor in geometry.floors where floor.polygonCorners.count >= 3 {
            let transform = floor.transform.matrix
            worldPoints.append(contentsOf: floor.polygonCorners.compactMap { corner in
                guard corner.count >= 2 else { return nil }
                let world = transform * SIMD4<Float>(corner[0], corner[1], 0, 1)
                return SIMD2(world.x, world.z)
            })
        }
        if worldPoints.count < 3 {
            for wall in geometry.walls {
                let transform = wall.transform.matrix
                for x in [-wall.width / 2, wall.width / 2] {
                    let world = transform * SIMD4<Float>(x, 0, 0, 1)
                    worldPoints.append(SIMD2(world.x, world.z))
                }
            }
        }
        let normalized = worldPoints.map {
            SIMD2(($0.x - mean.x) * scale, ($0.y - mean.z) * scale)
        }
        return convexHull(normalized)
    }

    private static func convexHull(_ points: [SIMD2<Float>]) -> [SIMD2<Float>] {
        let unique = Array(Set(points.map { "\($0.x),\($0.y)" })).compactMap { value -> SIMD2<Float>? in
            let parts = value.split(separator: ",").compactMap { Float($0) }
            return parts.count == 2 ? SIMD2(parts[0], parts[1]) : nil
        }.sorted { $0.x == $1.x ? $0.y < $1.y : $0.x < $1.x }
        guard unique.count > 2 else { return unique }
        func cross(_ o: SIMD2<Float>, _ a: SIMD2<Float>, _ b: SIMD2<Float>) -> Float {
            (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
        }
        var lower: [SIMD2<Float>] = []
        for point in unique {
            while lower.count >= 2 && cross(lower[lower.count - 2], lower[lower.count - 1], point) <= 0 {
                lower.removeLast()
            }
            lower.append(point)
        }
        var upper: [SIMD2<Float>] = []
        for point in unique.reversed() {
            while upper.count >= 2 && cross(upper[upper.count - 2], upper[upper.count - 1], point) <= 0 {
                upper.removeLast()
            }
            upper.append(point)
        }
        return Array(lower.dropLast() + upper.dropLast())
    }

    private static func contains(_ point: SIMD2<Float>, polygon: [SIMD2<Float>]) -> Bool {
        guard polygon.count >= 3 else { return true }
        var inside = false
        var previous = polygon.last!
        for current in polygon {
            if ((current.y > point.y) != (previous.y > point.y)) &&
                point.x < (previous.x - current.x) * (point.y - current.y) /
                (previous.y - current.y + Float.ulpOfOne) + current.x {
                inside.toggle()
            }
            previous = current
        }
        return inside
    }

    private static func lastInsidePoint(
        from start: SIMD2<Float>,
        to end: SIMD2<Float>,
        polygon: [SIMD2<Float>]
    ) -> SIMD2<Float> {
        guard contains(start, polygon: polygon) else { return start }
        var low: Float = 0
        var high: Float = 1
        for _ in 0..<12 {
            let middle = (low + high) / 2
            let candidate = start + (end - start) * middle
            if contains(candidate, polygon: polygon) { low = middle } else { high = middle }
        }
        return start + (end - start) * max(low - 0.02, 0)
    }

    private static func matrix(fromRowMajor values: [Float]) -> simd_float4x4 {
        guard values.count == 16 else { return matrix_identity_float4x4 }
        return simd_float4x4(rows: [
            SIMD4(values[0], values[1], values[2], values[3]),
            SIMD4(values[4], values[5], values[6], values[7]),
            SIMD4(values[8], values[9], values[10], values[11]),
            SIMD4(values[12], values[13], values[14], values[15])
        ])
    }

    private static func rowMajor(from matrix: simd_float4x4) -> [Float] {
        let transpose = matrix.transpose
        return [
            transpose.columns.0.x, transpose.columns.0.y, transpose.columns.0.z, transpose.columns.0.w,
            transpose.columns.1.x, transpose.columns.1.y, transpose.columns.1.z, transpose.columns.1.w,
            transpose.columns.2.x, transpose.columns.2.y, transpose.columns.2.z, transpose.columns.2.w,
            transpose.columns.3.x, transpose.columns.3.y, transpose.columns.3.z, transpose.columns.3.w
        ]
    }
}

private struct CameraSignature: Hashable {
    let width: Int
    let height: Int
    let fx: Float
    let fy: Float
    let cx: Float
    let cy: Float
}
