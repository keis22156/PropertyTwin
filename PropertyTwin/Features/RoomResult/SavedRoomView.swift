import SwiftUI
import UIKit

struct SavedRoomView: View {
    let room: ScannedRoom
    @State private var selection = 0
    private let storage = ScanStorageService()

    var body: some View {
        VStack(spacing: 16) {
            Picker("Présentation", selection: $selection) {
                Text("Plan").tag(0)
                Text("3D").tag(1)
                Text("Visuel").tag(2)
                Text("Détails").tag(3)
            }
            .pickerStyle(.segmented)

            if let geometry = room.geometry {
                switch selection {
                case 0:
                    FloorPlanView(geometry: geometry).ptCard()
                case 1:
                    if let url = storage.url(for: room.usdzRelativePath) {
                        QuickLookView(url: url)
                            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    }
                case 2:
                    ApplePhotorealRoomView(room: room)
                default:
                    details(geometry)
                }
            } else {
                ContentUnavailableView("Données indisponibles", systemImage: "exclamationmark.triangle")
            }
        }
        .padding(20)
        .background(PTAppBackground())
        .navigationTitle(room.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func details(_ geometry: RoomGeometry) -> some View {
        List {
            LabeledContent("Étage", value: room.floorLevel.propertyTwinFloorLabel)
            LabeledContent("Surface", value: room.area.map { $0.formatted(.number.precision(.fractionLength(1))) + " m²" } ?? "Non déterminée")
            LabeledContent("Murs", value: "\(geometry.walls.count)")
            LabeledContent("Portes", value: "\(geometry.doors.count)")
            LabeledContent("Fenêtres", value: "\(geometry.windows.count)")
            LabeledContent("Images spatiales", value: "\(room.visualFrameCount)")
        }
        .scrollContentBackground(.hidden)
    }
}

private struct SpatialCaptureGalleryView: View {
    let manifestPath: String

    private var manifest: SpatialCaptureManifest? {
        SpatialCaptureStorageService().manifest(relativePath: manifestPath)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 7) {
                    Label("Capture visuelle spatiale", systemImage: "camera.metering.multispot")
                        .font(.title2.bold())
                    Text("Images réelles synchronisées avec les poses AR. Elles servent de base à Design Studio et à une future reconstruction photoréaliste.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .ptCard()

                if let manifest {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        ForEach(Array(manifest.frames.enumerated()), id: \.offset) { index, frame in
                            SpatialFrameThumbnail(relativePath: frame.imageRelativePath)
                                .aspectRatio(3 / 4, contentMode: .fit)
                                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                .overlay(alignment: .bottomLeading) {
                                    Text("#\(index + 1)")
                                        .font(.caption2.bold())
                                        .padding(7)
                                        .background(.ultraThinMaterial, in: Capsule())
                                        .padding(8)
                                }
                        }
                    }
                } else {
                    ContentUnavailableView("Capture indisponible", systemImage: "photo.on.rectangle.angled")
                }
            }
        }
    }
}

private struct SpatialFrameThumbnail: View {
    let relativePath: String
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                ZStack {
                    PropertyTwinColors.primarySoft
                    ProgressView()
                }
            }
        }
        .clipped()
        .task(id: relativePath) {
            image = await Task.detached(priority: .utility) {
                guard let url = SpatialCaptureStorageService().imageURL(relativePath: relativePath),
                      let data = try? Data(contentsOf: url) else { return nil }
                return UIImage(data: data)
            }.value
        }
    }
}
