import SwiftData
import SwiftUI
import UIKit

struct ApplePhotorealRoomView: View {
    @Bindable var room: ScannedRoom
    @Environment(\.modelContext) private var modelContext
    @State private var gaussianProgress: Double?
    @State private var liveSplatCount = 0
    @State private var photogrammetryProgress: Double?
    @State private var errorMessage: String?
    @State private var showsGaussianViewer = false

    private let photogrammetryService = ApplePhotogrammetryReconstructionService()
    private let gaussianService = GaussianSplatTrainingService()

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                gaussianCard

                if room.gaussianSplatSPZRelativePath.isEmpty {
                    SpatialPhotoReconstructionView(manifestPath: room.visualCaptureManifestPath)
                }

                photogrammetryCard
            }
        }
        .fullScreenCover(isPresented: $showsGaussianViewer) {
            if let geometry = room.geometry {
                GaussianSplatViewer(
                    roomID: room.id,
                    checkpointRelativePath: room.gaussianSplatCheckpointRelativePath,
                    manifestPath: room.visualCaptureManifestPath,
                    geometry: geometry,
                    downscaleFactor: room.gaussianSplatDownscaleFactor,
                    fallbackImageData: room.gaussianSplatPreviewData
                )
            } else {
                ContentUnavailableView(
                    "Navigation indisponible",
                    systemImage: "exclamationmark.triangle",
                    description: Text("La géométrie RoomPlan de cette pièce est indisponible.")
                )
            }
        }
        .alert("Reconstruction impossible", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private var gaussianCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                PTIconTile(symbol: "sparkles.rectangle.stack", tint: PropertyTwinColors.primary)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Gaussian Splat 3D")
                        .font(.title3.bold())
                    Text("Moteur Ultra · RGB‑D LiDAR · 15 000 itérations Metal.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            if let data = room.gaussianSplatPreviewData,
               let image = UIImage(data: data) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity)
                    .background(.black)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                HStack {
                    Label("Modèle SPZ prêt", systemImage: "checkmark.seal.fill")
                        .foregroundStyle(PropertyTwinColors.success)
                    Spacer()
                    Text("\(room.gaussianSplatCount.formatted()) splats")
                        .foregroundStyle(.secondary)
                }
                .font(.caption.weight(.semibold))

                if !room.gaussianSplatCheckpointRelativePath.isEmpty {
                    Button {
                        showsGaussianViewer = true
                    } label: {
                        Label("Explorer en 3D", systemImage: "move.3d")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                } else {
                    Label("Réentraînez ce modèle pour activer la navigation 3D.", systemImage: "arrow.clockwise")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else {
                Text("Les poses ARKit, les optiques réelles et la géométrie RoomPlan initialisent le modèle. Les images du scan optimisent ensuite couleur, opacité et détails.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if let gaussianProgress {
                VStack(spacing: 7) {
                    ProgressView(value: gaussianProgress)
                        .tint(PropertyTwinColors.primary)
                    HStack {
                        Text("Entraînement Ultra Metal")
                        Spacer()
                        Text("\(gaussianProgress, format: .percent.precision(.fractionLength(0))) · \(liveSplatCount.formatted()) splats")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }

            Button {
                trainGaussianSplat()
            } label: {
                Label(
                    gaussianProgress == nil
                        ? (room.gaussianSplatSPZRelativePath.isEmpty ? "Créer le modèle Ultra" : "Réentraîner en Ultra")
                        : "Entraînement en cours",
                    systemImage: "waveform.path.ecg.rectangle"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(gaussianProgress != nil || room.visualFrameCount < 30)
            .accessibilityHint("Nécessite au moins vingt images spatiales issues du scan")

            if room.visualFrameCount < 30 {
                Label(
                    "\(room.visualFrameCount)/30 images fiables — rescanner lentement la pièce",
                    systemImage: "exclamationmark.triangle"
                )
                .font(.caption)
                .foregroundStyle(.orange)
            }
        }
        .ptCard()
    }

    private var photogrammetryCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            DisclosureGroup {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Cette méthode Apple produit un maillage texturé classique. Elle reste disponible comme export secondaire, mais le Gaussian Splat est recommandé pour le rendu.")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if let modelURL {
                        QuickLookView(url: modelURL)
                            .frame(height: 300)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    } else {
                        if let photogrammetryProgress {
                            ProgressView(value: photogrammetryProgress)
                        }
                        Button("Créer le maillage RealityKit") {
                            reconstructPhotogrammetry()
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        .disabled(
                            photogrammetryProgress != nil ||
                            !ApplePhotogrammetryReconstructionService.isSupported
                        )
                    }
                }
                .padding(.top, 10)
            } label: {
                Label("Maillage photogrammétrique classique", systemImage: "cube.transparent")
                    .font(.headline)
            }
        }
        .ptCard()
    }

    private var modelURL: URL? {
        photogrammetryService.modelURL(relativePath: room.photogrammetryUSDZRelativePath)
    }

    private func trainGaussianSplat() {
        guard let geometry = room.geometry else {
            errorMessage = GaussianSplatError.geometryUnavailable.localizedDescription
            return
        }

        gaussianProgress = 0
        liveSplatCount = 0
        errorMessage = nil

        Task {
            do {
                let result = try await gaussianService.train(
                    manifestPath: room.visualCaptureManifestPath,
                    geometry: geometry,
                    roomID: room.id
                ) { fraction, splatCount in
                    await MainActor.run {
                        gaussianProgress = fraction
                        liveSplatCount = splatCount
                    }
                }

                room.gaussianSplatSPZRelativePath = result.spzRelativePath
                room.gaussianSplatPLYRelativePath = result.plyRelativePath
                room.gaussianSplatCount = result.splatCount
                room.gaussianSplatCheckpointRelativePath = result.checkpointRelativePath
                room.gaussianSplatDownscaleFactor = result.downscaleFactor
                room.gaussianSplatPreviewData = result.previewJPEG
                try modelContext.save()
                gaussianProgress = nil
                HapticService.scanFinished()
            } catch {
                gaussianProgress = nil
                errorMessage = error.localizedDescription
            }
        }
    }

    private func reconstructPhotogrammetry() {
        photogrammetryProgress = 0
        errorMessage = nil

        Task {
            do {
                let relativePath = try await photogrammetryService.reconstruct(
                    manifestPath: room.visualCaptureManifestPath,
                    roomID: room.id
                ) { fraction in
                    await MainActor.run {
                        photogrammetryProgress = fraction
                    }
                }
                room.photogrammetryUSDZRelativePath = relativePath
                try modelContext.save()
                photogrammetryProgress = nil
                HapticService.scanFinished()
            } catch {
                photogrammetryProgress = nil
                errorMessage = error.localizedDescription
            }
        }
    }
}
