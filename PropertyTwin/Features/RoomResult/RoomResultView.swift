import RoomPlan
import SwiftData
import SwiftUI
import UIKit

struct RoomResultView: View {
    let capturedRoom: CapturedRoom
    let geometry: RoomGeometry
    let usdzPath: String
    let roomName: String
    let roomType: RoomType
    let property: Property
    let scanCampaignID: UUID
    let floorLevel: Int
    let spatialFrames: [SpatialCaptureFrame]
    let onSaved: () -> Void
    let onRetry: () -> Void

    @Environment(\.modelContext) private var modelContext
    @State private var selection = 0
    @State private var errorMessage: String?
    private let storage = ScanStorageService()

    private var area: Double? { RoomPlanService.area(from: geometry) }

    var body: some View {
        VStack(spacing: 16) {
            header
            Picker("Présentation", selection: $selection) {
                Text("Plan").tag(0)
                Text("3D").tag(1)
                Text("Visuel").tag(2)
                Text("Détails").tag(3)
            }
            .pickerStyle(.segmented)
            content
            actions
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .background(PTStyle.background.ignoresSafeArea())
        .alert("Sauvegarde impossible", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(roomName).font(.title2.bold())
                Text("Scan terminé · \(floorLevel.propertyTwinFloorLabel)").foregroundStyle(.secondary)
            }
            Spacer()
            if let area {
                Text(area, format: .number.precision(.fractionLength(1)))
                    .font(.title2.bold())
                + Text(" m²").font(.callout)
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch selection {
        case 0:
            FloorPlanView(geometry: geometry)
                .ptCard()
        case 1:
            if let url = storage.url(for: usdzPath) {
                QuickLookView(url: url)
                    .clipShape(RoundedRectangle(cornerRadius: 22))
            } else {
                ContentUnavailableView("Modèle 3D indisponible", systemImage: "cube.transparent")
            }
        case 2:
            resultVisualPreview
        default:
            details
        }
    }

    private var resultVisualPreview: some View {
        Group {
            if let frame = spatialFrames.first, let image = UIImage(data: frame.jpegData) {
                ZStack(alignment: .bottomLeading) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .clipped()

                    Label("\\(spatialFrames.count) vues réelles capturées", systemImage: "camera.aperture")
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 14)
                        .frame(height: 42)
                        .background(.ultraThinMaterial, in: Capsule())
                        .padding(14)
                }
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            } else {
                ContentUnavailableView(
                    "Capture visuelle indisponible",
                    systemImage: "camera.viewfinder",
                    description: Text("Effectuez un nouveau scan sur un appareil LiDAR pour créer la visite photo spatiale.")
                )
            }
        }
    }

    private var details: some View {
        ScrollView {
            VStack(spacing: 0) {
                detail("Surface", area.map { $0.formatted(.number.precision(.fractionLength(1))) + " m²" } ?? "Non déterminée")
                detail("Murs", "\(geometry.walls.count)")
                detail("Portes", "\(geometry.doors.count)")
                detail("Fenêtres", "\(geometry.windows.count)")
                detail("Images spatiales", spatialFrames.isEmpty ? "Non capturées" : "\(spatialFrames.count)")
                detail("Hauteur principale", geometry.mainHeight.map { $0.formatted(.number.precision(.fractionLength(2))) + " m" } ?? "Non déterminée")
                if !geometry.objects.isEmpty {
                    detail("Objets détectés", geometry.objects.map(\.category).joined(separator: ", "))
                }
                detail("Qualité du scan", qualityDescription)
            }
            .ptCard()
        }
    }

    private var qualityDescription: String {
        let confidences = geometry.allSurfaces.map(\.confidence)
        guard !confidences.isEmpty else { return "Non déterminée" }
        let counts = Dictionary(grouping: confidences, by: { $0 }).mapValues(\.count)
        return counts.max(by: { $0.value < $1.value })?.key ?? "Non déterminée"
    }

    private func detail(_ title: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).foregroundStyle(.secondary)
            Spacer()
            Text(value).fontWeight(.medium).multilineTextAlignment(.trailing)
        }
        .padding(.vertical, 14)
    }

    private var actions: some View {
        VStack(spacing: 8) {
            Button("Valider la pièce", action: save)
                .buttonStyle(PrimaryButtonStyle())
            Button("Recommencer", action: onRetry)
                .font(.headline)
                .frame(minHeight: 44)
        }
        .padding(.bottom, 8)
    }

    private func rebuildStructureIfPossible() {
        let campaignRooms = property.rooms.filter {
            $0.scanCampaignID == scanCampaignID && $0.floorLevel == floorLevel
        }
        let roomData = campaignRooms.compactMap(\.capturedRoomData)
        let roomCount = campaignRooms.count
        guard roomData.count >= 2 else { return }
        Task {
            do {
                let result = try await PropertyStructureService.build(from: roomData, propertyID: scanCampaignID)
                let currentCount = property.rooms.count {
                    $0.scanCampaignID == scanCampaignID && $0.floorLevel == floorLevel
                }
                guard currentCount == roomCount else { return }
                let archive = FloorStructureArchive(
                    floorLevel: floorLevel,
                    campaignID: scanCampaignID,
                    roomCount: roomCount,
                    geometry: result.geometry,
                    usdzRelativePath: result.relativeUSDZPath,
                    updatedAt: .now
                )
                try property.saveFloorStructure(archive)
                property.structureGeometryData = try JSONEncoder().encode(result.geometry)
                property.structureUSDZRelativePath = result.relativeUSDZPath
                property.structureCampaignID = scanCampaignID
                property.structureBuildMessage = "\(roomCount) pièces assemblées par RoomPlan au \(floorLevel.propertyTwinFloorLabel.lowercased())."
                property.updatedAt = .now
                try modelContext.save()
            } catch {
                property.structureBuildMessage = "Assemblage impossible : les pièces ne partagent pas un espace AR compatible. Scannez-les à nouveau dans une seule campagne, sans fermer le scanner."
                try? modelContext.save()
                print("StructureBuilder: \(error.localizedDescription)")
            }
        }
    }

    private func save() {
        do {
            let encodedRoom = try JSONEncoder().encode(capturedRoom)
            let room = try ScannedRoom(
                name: roomName,
                type: roomType,
                area: area,
                usdzRelativePath: usdzPath,
                geometry: geometry,
                capturedRoomData: encodedRoom,
                scanCampaignID: scanCampaignID,
                floorLevel: floorLevel
            )
            if let manifestPath = try SpatialCaptureStorageService().store(spatialFrames, roomID: room.id) {
                room.visualCaptureManifestPath = manifestPath
                room.visualFrameCount = spatialFrames.count
            }
            if let heroFrame = spatialFrames.first {
                let paths = try ImageStorageService().store(heroFrame.jpegData)
                let photo = PropertyPhoto(
                    propertyID: property.id,
                    roomID: room.id,
                    originalRelativePath: paths.original,
                    thumbnailRelativePath: paths.thumbnail,
                    isPrimary: property.rooms.isEmpty
                )
                modelContext.insert(photo)
            }
            room.property = property
            property.rooms.append(room)
            property.updatedAt = .now
            modelContext.insert(room)
            try modelContext.save()
            rebuildStructureIfPossible()
            onSaved()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
