import SwiftUI
import UIKit

struct GaussianSplatViewer: View {
    let roomID: UUID
    let checkpointRelativePath: String
    let manifestPath: String
    let geometry: RoomGeometry
    let downscaleFactor: Float
    let fallbackImageData: Data?

    @Environment(\.dismiss) private var dismiss
    @State private var session: GaussianSplatRenderSession?
    @State private var image: UIImage?
    @State private var isRendering = true
    @State private var errorMessage: String?
    @State private var yaw: Float = 0
    @State private var pitch: Float = 0
    @State private var walkForward: Float = 0
    @State private var walkRight: Float = 0
    @State private var gestureYaw: Float = 0
    @State private var gesturePitch: Float = 0
    @State private var gestureDolly: Float = 0
    @State private var renderGeneration = 0

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .gesture(navigationGesture)
                    .simultaneousGesture(zoomGesture)
            } else if let fallbackImageData, let fallback = UIImage(data: fallbackImageData) {
                Image(uiImage: fallback)
                    .resizable()
                    .scaledToFit()
                    .opacity(isRendering ? 0.62 : 1)
            }

            if isRendering {
                ProgressView()
                    .controlSize(.large)
                    .tint(.white)
                    .padding(22)
                    .background(.black.opacity(0.45), in: Circle())
            }

            VStack {
                toolbar
                Spacer()
                controls
            }
        }
        .task {
            await prepare()
        }
        .task(id: renderGeneration) {
            guard renderGeneration > 0 else { return }
            await render()
        }
        .alert("Viewer 3D indisponible", isPresented: .constant(errorMessage != nil)) {
            Button("Fermer") {
                errorMessage = nil
                dismiss()
            }
        } message: {
            Text(errorMessage ?? "")
        }
        .statusBarHidden()
    }

    private var toolbar: some View {
        HStack {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .frame(width: 44, height: 44)
                    .background(.ultraThinMaterial, in: Circle())
            }
            .accessibilityLabel("Fermer le modèle 3D")

            Spacer()

            Label("GAUSSIAN SPLAT · METAL", systemImage: "sparkles.rectangle.stack")
                .font(.caption.weight(.bold))
                .tracking(0.8)
                .padding(.horizontal, 14)
                .frame(height: 40)
                .background(.ultraThinMaterial, in: Capsule())

            Spacer()

            Button {
                reset()
            } label: {
                Image(systemName: "viewfinder")
                    .frame(width: 44, height: 44)
                    .background(.ultraThinMaterial, in: Circle())
            }
            .accessibilityLabel("Recentrer la vue")
        }
        .foregroundStyle(.white)
        .padding()
    }

    private var controls: some View {
        VStack(spacing: 12) {
            Text("Glissez pour regarder · pincez pour avancer")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.72))

            HStack(spacing: 12) {
                controlButton("arrow.left", label: "Faire un pas à gauche") {
                    walkRight -= 0.10
                }
                controlButton("arrow.up", label: "Avancer") {
                    walkForward += 0.10
                }
                controlButton("arrow.down", label: "Reculer") {
                    walkForward -= 0.10
                }
                controlButton("arrow.right", label: "Faire un pas à droite") {
                    walkRight += 0.10
                }
            }
        }
        .padding(14)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .foregroundStyle(.white)
        .padding()
    }

    private func controlButton(
        _ symbol: String,
        label: String,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            action()
            requestRender()
        } label: {
            Image(systemName: symbol)
                .frame(width: 48, height: 44)
                .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
        }
        .accessibilityLabel(label)
        .disabled(isRendering)
    }

    private var navigationGesture: some Gesture {
        DragGesture(minimumDistance: 4)
            .onChanged { value in
                gestureYaw = Float(value.translation.width) * -0.004
                gesturePitch = Float(value.translation.height) * -0.003
            }
            .onEnded { _ in
                yaw += gestureYaw
                pitch = min(max(pitch + gesturePitch, -.pi / 3), .pi / 3)
                gestureYaw = 0
                gesturePitch = 0
                requestRender()
            }
    }

    private var zoomGesture: some Gesture {
        MagnifyGesture()
            .onChanged { value in
                gestureDolly = Float(value.magnification - 1) * 0.6
            }
            .onEnded { _ in
                walkForward = min(max(walkForward + gestureDolly, -1.5), 1.5)
                gestureDolly = 0
                requestRender()
            }
    }

    private func prepare() async {
        do {
            session = try await GaussianSplatTrainingService().makeRenderSession(
                roomID: roomID,
                checkpointRelativePath: checkpointRelativePath,
                manifestPath: manifestPath,
                geometry: geometry,
                downscaleFactor: downscaleFactor
            )
            requestRender()
        } catch {
            isRendering = false
            errorMessage = error.localizedDescription
        }
    }

    private func render() async {
        guard let session else { return }
        isRendering = true
        let data = await session.render(
            yaw: yaw,
            pitch: pitch,
            walkForward: walkForward,
            walkRight: walkRight
        )
        if let data, let renderedImage = UIImage(data: data) {
            image = renderedImage
        } else {
            errorMessage = "Le moteur Metal n’a pas produit d’image pour cette position."
        }
        isRendering = false
    }

    private func requestRender() {
        renderGeneration += 1
    }

    private func reset() {
        yaw = 0
        pitch = 0
        walkForward = 0
        walkRight = 0
        requestRender()
        HapticService.selection()
    }
}
