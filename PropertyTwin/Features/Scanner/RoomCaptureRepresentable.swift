import ARKit
import RoomPlan
import SwiftUI

struct RoomCaptureRepresentable: UIViewRepresentable {
    let arSession: ARSession?
    let onProcessed: (CapturedRoom, [SpatialCaptureFrame]) -> Void
    let onError: (Error) -> Void
    let onUpdate: (CapturedRoom) -> Void
    let onSpatialFrame: (SpatialCaptureFrame, Int) -> Void
    let onCoverageUpdate: ([CGPoint]) -> Void
    @Binding var shouldStop: Bool

    init(
        arSession: ARSession? = nil,
        onProcessed: @escaping (CapturedRoom, [SpatialCaptureFrame]) -> Void,
        onError: @escaping (Error) -> Void,
        onUpdate: @escaping (CapturedRoom) -> Void = { _ in },
        onSpatialFrame: @escaping (SpatialCaptureFrame, Int) -> Void = { _, _ in },
        onCoverageUpdate: @escaping ([CGPoint]) -> Void = { _ in },
        shouldStop: Binding<Bool>
    ) {
        self.arSession = arSession
        self.onProcessed = onProcessed
        self.onError = onError
        self.onUpdate = onUpdate
        self.onSpatialFrame = onSpatialFrame
        self.onCoverageUpdate = onCoverageUpdate
        _shouldStop = shouldStop
    }

    func makeCoordinator() -> RoomCaptureCoordinator {
        RoomCaptureCoordinator(
            onProcessed: onProcessed,
            onError: onError,
            onUpdate: onUpdate,
            onSpatialFrame: onSpatialFrame,
            onCoverageUpdate: onCoverageUpdate
        )
    }

    func makeUIView(context: Context) -> RoomCaptureView {
        let view: RoomCaptureView
        if let arSession {
            view = RoomCaptureView(frame: .zero, arSession: arSession)
        } else {
            view = RoomCaptureView(frame: .zero)
        }
        view.delegate = context.coordinator
        view.captureSession.run(configuration: .init())
        context.coordinator.startSampling(session: view.captureSession, view: view)
        HapticService.scanStarted()
        return view
    }

    func updateUIView(_ uiView: RoomCaptureView, context: Context) {
        if shouldStop && !context.coordinator.hasStopped {
            context.coordinator.hasStopped = true
            context.coordinator.stopSampling()
            uiView.captureSession.stop(pauseARSession: arSession == nil)
        }
    }

    static func dismantleUIView(_ uiView: RoomCaptureView, coordinator: RoomCaptureCoordinator) {
        coordinator.stopSampling()
        if !coordinator.hasStopped {
            coordinator.hasStopped = true
            uiView.captureSession.stop(pauseARSession: false)
        }
    }
}

@MainActor
final class RoomCaptureCoordinator: NSObject, RoomCaptureViewDelegate {
    var hasStopped = false
    private let onProcessed: (CapturedRoom, [SpatialCaptureFrame]) -> Void
    private let onError: (Error) -> Void
    private let onUpdate: (CapturedRoom) -> Void
    private let onSpatialFrame: (SpatialCaptureFrame, Int) -> Void
    private let onCoverageUpdate: ([CGPoint]) -> Void
    private let frameSampler = SpatialFrameSampler()
    private var spatialFrames: [SpatialCaptureFrame] = []
    private var samplingTimer: Timer?
    private var coverageVoxels: [CoverageVoxel: SIMD3<Float>] = [:]

    init(onProcessed: @escaping (CapturedRoom, [SpatialCaptureFrame]) -> Void, onError: @escaping (Error) -> Void, onUpdate: @escaping (CapturedRoom) -> Void, onSpatialFrame: @escaping (SpatialCaptureFrame, Int) -> Void, onCoverageUpdate: @escaping ([CGPoint]) -> Void) {
        self.onProcessed = onProcessed
        self.onError = onError
        self.onUpdate = onUpdate
        self.onSpatialFrame = onSpatialFrame
        self.onCoverageUpdate = onCoverageUpdate
        super.init()
    }

    required init?(coder: NSCoder) {
        onProcessed = { _, _ in }
        onError = { _ in }
        onUpdate = { _ in }
        onSpatialFrame = { _, _ in }
        onCoverageUpdate = { _ in }
        super.init()
    }

    func encode(with coder: NSCoder) {}

    func startSampling(session: RoomCaptureSession, view: RoomCaptureView) {
        stopSampling()
        samplingTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self, weak session, weak view] _ in
            MainActor.assumeIsolated {
                guard let self, let session, let view,
                      let frame = session.arSession.currentFrame else { return }
                if self.spatialFrames.count < 120,
                   let sample = self.frameSampler.sample(frame) {
                    self.spatialFrames.append(sample)
                    self.integrateCoverage(sample.lidarPoints)
                    self.onSpatialFrame(sample, self.spatialFrames.count)
                    HapticService.selection()
                }
                self.publishCoverage(frame: frame, viewportSize: view.bounds.size)
            }
        }
    }

    func stopSampling() {
        samplingTimer?.invalidate()
        samplingTimer = nil
    }

    func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
        onUpdate(room)
    }

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
        if let error {
            onError(error)
            return false
        }
        return true
    }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        if let error {
            onError(error)
        } else {
            HapticService.scanFinished()
            onProcessed(processedResult, spatialFrames)
        }
    }

    private func integrateCoverage(_ points: [SpatialLidarPoint]) {
        for point in points {
            let voxel = CoverageVoxel(position: point.position, cellSize: 0.075)
            coverageVoxels[voxel] = point.position
        }
    }

    private func publishCoverage(frame: ARFrame, viewportSize: CGSize) {
        guard viewportSize.width > 0, viewportSize.height > 0 else { return }
        let viewMatrix = frame.camera.viewMatrix(for: .portrait)
        let visible = coverageVoxels.values.lazy.compactMap { world -> CGPoint? in
            let camera = viewMatrix * SIMD4<Float>(world.x, world.y, world.z, 1)
            guard camera.z < -0.15 else { return nil }
            let point = frame.camera.projectPoint(world, orientation: .portrait, viewportSize: viewportSize)
            guard point.x >= 0, point.y >= 0,
                  point.x <= viewportSize.width, point.y <= viewportSize.height else { return nil }
            return point
        }
        // Limit UI work while retaining an even spatial sample of the cloud.
        let strideValue = max(visible.count / 1_400, 1)
        onCoverageUpdate(visible.enumerated().compactMap { index, point in
            index.isMultiple(of: strideValue) ? point : nil
        })
    }
}

private struct CoverageVoxel: Hashable {
    let x: Int
    let y: Int
    let z: Int

    init(position: SIMD3<Float>, cellSize: Float) {
        x = Int(floor(position.x / cellSize))
        y = Int(floor(position.y / cellSize))
        z = Int(floor(position.z / cellSize))
    }
}
