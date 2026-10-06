import SwiftUI
import UIKit

struct SpatialPhotoReconstructionView: View {
    let manifestPath: String

    @State private var manifest: SpatialCaptureManifest?
    @State private var selectedIndex = 0
    @State private var isImmersive = false

    var body: some View {
        Group {
            if let manifest, !manifest.frames.isEmpty {
                VStack(spacing: 14) {
                    hero(manifest)
                    poseStrip(manifest)
                    reconstructionNotice
                }
            } else {
                ContentUnavailableView(
                    "Reconstruction indisponible",
                    systemImage: "viewfinder.circle",
                    description: Text("Aucune image spatiale exploitable n’est associée à cette pièce.")
                )
            }
        }
        .task(id: manifestPath) {
            manifest = await Task.detached(priority: .utility) {
                SpatialCaptureStorageService().manifest(relativePath: manifestPath)
            }.value
        }
        .fullScreenCover(isPresented: $isImmersive) {
            if let manifest {
                SpatialImmersiveViewer(manifest: manifest, selectedIndex: $selectedIndex)
            }
        }
    }

    private func hero(_ manifest: SpatialCaptureManifest) -> some View {
        ZStack(alignment: .bottom) {
            SpatialPhotoFrameView(frame: manifest.frames[selectedIndex])
                .frame(maxWidth: .infinity)
                .aspectRatio(4 / 5, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))

            VStack(spacing: 10) {
                HStack {
                    Label("Vue spatiale réelle", systemImage: "camera.aperture")
                    Spacer()
                    Text("\(selectedIndex + 1) / \(manifest.frames.count)")
                }
                .font(.caption.weight(.semibold))

                Button {
                    isImmersive = true
                } label: {
                    Label("Entrer dans la pièce", systemImage: "viewfinder")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle())
                .accessibilityHint("Ouvre la visite plein écran depuis le point de vue sélectionné")
            }
            .padding(14)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .padding(10)
        }
    }

    private func poseStrip(_ manifest: SpatialCaptureManifest) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Points de vue")
                    .font(.headline)
                Spacer()
                Label("Poses ARKit", systemImage: "move.3d")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            ScrollView(.horizontal) {
                LazyHStack(spacing: 9) {
                    ForEach(Array(manifest.frames.enumerated()), id: \.offset) { index, frame in
                        Button {
                            withAnimation(.snappy) {
                                selectedIndex = index
                            }
                        } label: {
                            SpatialPhotoFrameView(frame: frame)
                                .frame(width: 76, height: 98)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .overlay {
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .stroke(
                                            index == selectedIndex ? PropertyTwinColors.primary : .clear,
                                            lineWidth: 3
                                        )
                                }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Point de vue \(index + 1)")
                    }
                }
            }
            .scrollIndicators(.hidden)

            SpatialPoseMap(frames: manifest.frames, selectedIndex: selectedIndex)
                .frame(height: 94)
                .accessibilityLabel("Trajectoire réelle de capture dans la pièce")
        }
        .ptCard()
    }

    private var reconstructionNotice: some View {
        Label(
            "Les images et positions sont réelles. La géométrie reste celle de RoomPlan ; aucun détail visuel n’est inventé.",
            systemImage: "checkmark.seal"
        )
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 4)
    }
}

private struct SpatialImmersiveViewer: View {
    let manifest: SpatialCaptureManifest
    @Binding var selectedIndex: Int
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var drag: CGSize = .zero

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            SpatialPhotoFrameView(frame: manifest.frames[selectedIndex])
                .scaledToFill()
                .scaleEffect(scale)
                .offset(drag)
                .rotation3DEffect(
                    .degrees(Double(drag.width / 90)),
                    axis: (x: 0, y: 1, z: 0),
                    perspective: 0.3
                )
                .ignoresSafeArea()
                .gesture(
                    MagnifyGesture()
                        .onChanged { value in scale = min(max(lastScale * value.magnification, 1), 4) }
                        .onEnded { _ in lastScale = scale }
                )
                .simultaneousGesture(
                    DragGesture()
                        .onChanged { value in
                            drag = CGSize(
                                width: value.translation.width / max(scale, 1),
                                height: value.translation.height / max(scale, 1)
                            )
                        }
                        .onEnded { value in
                            if scale <= 1.05, abs(value.translation.width) > 70 {
                                advance(value.translation.width < 0 ? 1 : -1)
                            }
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) {
                                drag = .zero
                            }
                        }
                )

            VStack {
                HStack {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.headline)
                            .frame(width: 44, height: 44)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .accessibilityLabel("Fermer la visite")

                    Spacer()

                    Text("VUE \(selectedIndex + 1) · \(manifest.frames.count)")
                        .font(.caption.weight(.bold))
                        .tracking(1)
                        .padding(.horizontal, 13)
                        .frame(height: 38)
                        .background(.ultraThinMaterial, in: Capsule())
                }
                .foregroundStyle(.white)
                .padding()

                Spacer()

                HStack(spacing: 18) {
                    navigationButton(symbol: "chevron.left", direction: -1)
                    VStack(spacing: 3) {
                        Text("Visite photo spatiale")
                            .font(.headline)
                        Text("Glissez pour changer de position · pincez pour zoomer")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.72))
                    }
                    .multilineTextAlignment(.center)
                    navigationButton(symbol: "chevron.right", direction: 1)
                }
                .foregroundStyle(.white)
                .padding(14)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                .padding()
            }
        }
        .statusBarHidden()
    }

    private func navigationButton(symbol: String, direction: Int) -> some View {
        Button {
            advance(direction)
        } label: {
            Image(systemName: symbol)
                .frame(width: 44, height: 44)
                .background(.white.opacity(0.14), in: Circle())
        }
        .disabled(
            direction < 0 ? selectedIndex == 0 : selectedIndex == manifest.frames.count - 1
        )
        .opacity(
            (direction < 0 ? selectedIndex == 0 : selectedIndex == manifest.frames.count - 1) ? 0.35 : 1
        )
    }

    private func advance(_ direction: Int) {
        let next = min(max(selectedIndex + direction, 0), manifest.frames.count - 1)
        guard next != selectedIndex else { return }
        withAnimation(.smooth(duration: 0.28)) {
            selectedIndex = next
            scale = 1
            lastScale = 1
            drag = .zero
        }
        HapticService.selection()
    }
}

private struct SpatialPoseMap: View {
    let frames: [SpatialCaptureManifest.Frame]
    let selectedIndex: Int

    var body: some View {
        Canvas { context, size in
            let points = normalizedPoints(size: size)
            guard !points.isEmpty else { return }

            var path = Path()
            path.move(to: points[0])
            for point in points.dropFirst() {
                path.addLine(to: point)
            }
            context.stroke(
                path,
                with: .color(PropertyTwinColors.primary.opacity(0.32)),
                style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round, dash: [4, 5])
            )

            for (index, point) in points.enumerated() {
                let selected = index == selectedIndex
                let rect = CGRect(
                    x: point.x - (selected ? 7 : 4),
                    y: point.y - (selected ? 7 : 4),
                    width: selected ? 14 : 8,
                    height: selected ? 14 : 8
                )
                context.fill(
                    Path(ellipseIn: rect),
                    with: .color(selected ? PropertyTwinColors.primary : PropertyTwinColors.primary.opacity(0.38))
                )
            }
        }
        .padding(8)
        .background(PropertyTwinColors.primarySoft.opacity(0.45), in: RoundedRectangle(cornerRadius: 16))
    }

    private func normalizedPoints(size: CGSize) -> [CGPoint] {
        let raw = frames.map { frame -> SIMD2<Float> in
            let matrix = frame.cameraTransform.matrix
            return SIMD2(matrix.columns.3.x, matrix.columns.3.z)
        }
        guard let minX = raw.map(\.x).min(),
              let maxX = raw.map(\.x).max(),
              let minY = raw.map(\.y).min(),
              let maxY = raw.map(\.y).max() else { return [] }

        let spanX = max(maxX - minX, 0.25)
        let spanY = max(maxY - minY, 0.25)
        return raw.map {
            CGPoint(
                x: 10 + CGFloat(($0.x - minX) / spanX) * max(size.width - 20, 1),
                y: 10 + CGFloat(($0.y - minY) / spanY) * max(size.height - 20, 1)
            )
        }
    }
}

private struct SpatialPhotoFrameView: View {
    let frame: SpatialCaptureManifest.Frame
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
            } else {
                ZStack {
                    Color.black.opacity(0.92)
                    ProgressView().tint(.white)
                }
            }
        }
        .task(id: frame.imageRelativePath) {
            image = await Task.detached(priority: .userInitiated) {
                guard let url = SpatialCaptureStorageService().imageURL(relativePath: frame.imageRelativePath),
                      let data = try? Data(contentsOf: url) else { return nil }
                return UIImage(data: data)
            }.value
        }
    }
}
