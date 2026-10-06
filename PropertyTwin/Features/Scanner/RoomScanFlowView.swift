import ARKit
import RoomPlan
import SwiftUI

struct RoomScanFlowView: View {
    enum Phase {
        case selection, onboarding, scanning, processing, result
    }

    let property: Property
    @Environment(\.dismiss) private var dismiss
    @State private var phase: Phase = .selection
    @State private var roomType: RoomType = .livingRoom
    @State private var customName = ""
    @State private var shouldStop = false
    @State private var isFinishing = false
    @State private var capturedRoom: CapturedRoom?
    @State private var geometry: RoomGeometry?
    @State private var usdzPath = ""
    @State private var spatialFrames: [SpatialCaptureFrame] = []
    @State private var errorMessage: String?
    @State private var cameraDenied = false
    @State private var sharedARSession: ARSession?
    @State private var scanCampaignID = UUID()
    @State private var selectedFloor = 0
    @State private var didInitializeFloor = false
    @State private var liveWalls = 0
    @State private var liveOpenings = 0
    @State private var liveObjects = 0
    @State private var liveImageCount = 0
    @State private var liveImagePoses: [CodableTransform] = []
    @State private var liveLidarPointCount = 0

    private var campaignRoomCount: Int {
        property.rooms.count {
            $0.scanCampaignID == scanCampaignID && $0.floorLevel == selectedFloor
        }
    }

    private var roomName: String {
        let trimmed = customName.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? roomType.rawValue : trimmed
    }

    var body: some View {
        Group {
            switch phase {
            case .selection:
                selectionView
            case .onboarding:
                onboardingView
            case .scanning:
                scannerView
            case .processing:
                processingView
            case .result:
                if let capturedRoom, let geometry {
                    RoomResultView(
                        capturedRoom: capturedRoom,
                        geometry: geometry,
                        usdzPath: usdzPath,
                        roomName: roomName,
                        roomType: roomType,
                        property: property,
                        scanCampaignID: scanCampaignID,
                        floorLevel: selectedFloor,
                        spatialFrames: spatialFrames,
                        onSaved: roomSaved,
                        onRetry: retry
                    )
                }
            }
        }
        .animation(.easeInOut(duration: 0.22), value: phase)
        .onAppear {
            guard !didInitializeFloor else { return }
            selectedFloor = property.floor ?? 0
            didInitializeFloor = true
        }
        .onChange(of: selectedFloor) { oldFloor, newFloor in
            guard didInitializeFloor, oldFloor != newFloor else { return }
            sharedARSession?.pause()
            sharedARSession = nil
            scanCampaignID = UUID()
        }
        .onDisappear { sharedARSession?.pause() }
        .alert("PropertyTwin", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: { Text(errorMessage ?? "") }
    }

    private var selectionView: some View {
        NavigationStack {
            ScrollView {
                if campaignRoomCount > 0 {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(PropertyTwinColors.success)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(campaignRoomCount) pièce\(campaignRoomCount == 1 ? "" : "s") dans la même campagne")
                                .font(.headline)
                            Text("Gardez ce scanner ouvert et passez directement à la pièce suivante pour conserver le même repère spatial.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .ptCard(padding: 16)
                    .padding(.bottom, 12)
                }
                VStack(alignment: .leading, spacing: 10) {
                    Text("Étage").font(.headline)
                    HStack {
                        Button { selectedFloor -= 1 } label: {
                            Image(systemName: "minus").frame(width: 44, height: 44)
                        }
                        Spacer()
                        VStack(spacing: 2) {
                            Text(selectedFloor.propertyTwinFloorLabel).font(.headline)
                            Text("Les pièces seront assemblées uniquement à ce niveau.")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                        .multilineTextAlignment(.center)
                        Spacer()
                        Button { selectedFloor += 1 } label: {
                            Image(systemName: "plus").frame(width: 44, height: 44)
                        }
                    }
                    .foregroundStyle(PropertyTwinColors.primary)
                    .padding(10)
                    .background(PropertyTwinColors.surface, in: RoundedRectangle(cornerRadius: 18))
                }
                .padding(.bottom, 14)

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    ForEach(RoomType.allCases) { type in
                        Button {
                            roomType = type
                            HapticService.selection()
                        } label: {
                            VStack(spacing: 10) {
                                Image(systemName: type.symbol).font(.title2)
                                Text(type.rawValue).font(.subheadline.weight(.semibold))
                            }
                            .foregroundStyle(roomType == type ? .white : PTStyle.ink)
                            .frame(maxWidth: .infinity, minHeight: 94)
                            .background(roomType == type ? PTStyle.blue : .white, in: RoundedRectangle(cornerRadius: 18))
                            .shadow(color: .black.opacity(0.04), radius: 10, y: 4)
                        }
                        .accessibilityAddTraits(roomType == type ? .isSelected : [])
                    }
                }
                TextField("Nom personnalisé (facultatif)", text: $customName)
                    .padding(16)
                    .background(.white, in: RoundedRectangle(cornerRadius: 16))
                    .padding(.top, 8)
                Button("Continuer") { phase = .onboarding }
                    .buttonStyle(PrimaryButtonStyle())
                    .padding(.top, 12)
                if campaignRoomCount >= 2 {
                    Button("Terminer le logement") { closeFlow() }
                        .buttonStyle(SecondaryButtonStyle())
                }
            }
            .padding(20)
            .background(PTStyle.background.ignoresSafeArea())
            .navigationTitle("Quelle pièce scannez-vous ?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer", systemImage: "xmark") { closeFlow() }
                }
            }
        }
    }

    private var onboardingView: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 26) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Scanner \(roomName.lowercased())")
                        .font(.largeTitle.bold())
                    Text("PropertyTwin utilise le LiDAR de votre iPhone pour comprendre la géométrie de la pièce.")
                        .foregroundStyle(.secondary)
                    if let expected = property.expectedRoomCount {
                        PTStatusBadge(title: "Pièce \(min(property.rooms.count + 1, expected)) sur \(expected)")
                    }
                }
                VStack(spacing: 14) {
                    tip("figure.walk.motion", "Déplacez-vous lentement")
                    tip("square.dashed", "Montrez chaque mur")
                    tip("door.left.hand.open", "Capturez portes et fenêtres")
                    if campaignRoomCount > 0 {
                        tip("point.topleft.down.to.point.bottomright.curvepath", "Commencez depuis le passage vers la pièce précédente")
                    }
                }
                Text("Pour un meilleur résultat, faites le tour complet de la pièce.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                Spacer()
                if !RoomPlanService.isSupported {
                    Label("Cet appareil ne prend pas en charge le scan spatial PropertyTwin.", systemImage: "iphone.slash")
                        .font(.headline)
                    Text("Un iPhone ou iPad compatible LiDAR est nécessaire.")
                        .foregroundStyle(.secondary)
                }
                Button("Commencer le scan") {
                    Task { await startScan() }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!RoomPlanService.isSupported)
            }
            .padding(24)
            .background(PTStyle.background.ignoresSafeArea())
            .navigationBarBackButtonHidden()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Retour", systemImage: "chevron.left") { phase = .selection }
                }
            }
            .alert("Caméra inaccessible", isPresented: $cameraDenied) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("Autorisez la caméra dans Réglages pour utiliser RoomPlan.")
            }
        }
    }

    private func tip(_ symbol: String, _ text: String) -> some View {
        HStack(spacing: 16) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(PTStyle.blue)
                .frame(width: 48, height: 48)
                .background(PTStyle.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
            Text(text).font(.headline)
            Spacer()
        }
        .ptCard()
    }

    private var scannerView: some View {
        ZStack {
            RoomCaptureRepresentable(
                arSession: sharedARSession,
                onProcessed: process,
                onError: {
                    isFinishing = false
                    shouldStop = false
                    errorMessage = $0.localizedDescription
                    phase = .onboarding
                },
                onUpdate: updateProgress,
                onSpatialFrame: registerSpatialFrame,
                shouldStop: $shouldStop
            )
            .ignoresSafeArea()

            VStack {
                HStack {
                    Button { closeFlow() } label: {
                        Image(systemName: "xmark")
                            .frame(width: 44, height: 44)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    Spacer()
                    VStack(spacing: 2) {
                        Text(roomName).font(.headline)
                        Text("Scan en cours").font(.caption).foregroundStyle(.secondary)
                        Text("\(liveWalls) murs · \(liveOpenings) ouvertures · \(liveObjects) objets")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Label("\(liveImageCount) images · \(liveLidarPointCount.formatted()) points LiDAR", systemImage: liveImageCount > 0 ? "camera.fill" : "camera")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(liveImageCount > 0 ? PropertyTwinColors.success : PropertyTwinColors.primary)
                            .contentTransition(.numericText())
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 9)
                    .background(.ultraThinMaterial, in: Capsule())
                    Spacer()
                    Color.clear.frame(width: 44)
                }
                .padding()
                Spacer()
                if !liveImagePoses.isEmpty {
                    LiveSpatialCaptureMap(poses: liveImagePoses)
                        .frame(width: 150, height: 100)
                        .padding(10)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .overlay(alignment: .topTrailing) {
                            Image(systemName: "camera.fill")
                                .font(.caption)
                                .foregroundStyle(PropertyTwinColors.success)
                                .padding(8)
                        }
                        .padding(.bottom, 10)
                        .accessibilityLabel("Trajectoire des \(liveImageCount) images spatiales capturées")
                }
                if isFinishing {
                    HStack(spacing: 12) {
                        ProgressView()
                        Text("Finalisation du scan…").font(.headline)
                    }
                    .padding(18)
                    .frame(maxWidth: .infinity)
                    .background(.ultraThinMaterial)
                } else {
                    Button("Terminer") {
                        isFinishing = true
                        shouldStop = true
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .padding(20)
                    .background(.ultraThinMaterial)
                }
            }
        }
        .tint(PTStyle.blue)
    }

    private var processingView: some View {
        VStack(spacing: 18) {
            ProgressView().controlSize(.large)
            Text("Création de votre jumeau spatial…").font(.headline)
            Text("Analyse de la géométrie et export du modèle 3D.")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(PTStyle.background)
    }

    private func startScan() async {
        guard await RoomPlanService.requestCameraAccess() else {
            cameraDenied = true
            return
        }
        if sharedARSession == nil {
            scanCampaignID = UUID()
            let session = ARSession()
            let configuration = ARWorldTrackingConfiguration()
            if ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) {
                configuration.frameSemantics.insert(.smoothedSceneDepth)
            } else if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
                configuration.frameSemantics.insert(.sceneDepth)
            }
            session.run(configuration)
            sharedARSession = session
        }
        liveWalls = 0
        liveOpenings = 0
        liveObjects = 0
        liveImageCount = 0
        liveImagePoses = []
        liveLidarPointCount = 0
        shouldStop = false
        phase = .scanning
    }

    private func updateProgress(_ room: CapturedRoom) {
        liveWalls = room.walls.count
        liveOpenings = room.doors.count + room.windows.count + room.openings.count
        liveObjects = room.objects.count
    }

    private func registerSpatialFrame(_ frame: SpatialCaptureFrame, count: Int) {
        liveImageCount = count
        liveLidarPointCount += frame.lidarPoints.count
        liveImagePoses.append(frame.cameraTransform)
        if liveImagePoses.count > 120 {
            liveImagePoses.removeFirst(liveImagePoses.count - 120)
        }
    }

    private func process(_ room: CapturedRoom, frames: [SpatialCaptureFrame]) {
        phase = .processing
        spatialFrames = frames
        let scanID = UUID()
        Task {
            do {
                let result = try await Task.detached(priority: .userInitiated) {
                    let geometry = RoomPlanService.geometry(from: room)
                    let path = try ScanStorageService().export(room, id: scanID)
                    return (geometry, path)
                }.value
                capturedRoom = room
                geometry = result.0
                usdzPath = result.1
                phase = .result
            } catch {
                errorMessage = error.localizedDescription
                phase = .onboarding
            }
        }
    }

    private func roomSaved() {
        capturedRoom = nil
        geometry = nil
        usdzPath = ""
        spatialFrames = []
        customName = ""
        shouldStop = false
        isFinishing = false
        phase = .selection
    }

    private func closeFlow() {
        sharedARSession?.pause()
        dismiss()
    }

    private func retry() {
        if !usdzPath.isEmpty {
            ScanStorageService().remove(relativePath: usdzPath)
        }
        capturedRoom = nil
        geometry = nil
        usdzPath = ""
        shouldStop = false
        isFinishing = false
        phase = .onboarding
    }
}

private struct LiveSpatialCaptureMap: View {
    let poses: [CodableTransform]

    var body: some View {
        Canvas { context, size in
            let points = normalizedPoints(in: size)
            guard let first = points.first else { return }

            var trail = Path()
            trail.move(to: first)
            for point in points.dropFirst() {
                trail.addLine(to: point)
            }
            context.stroke(
                trail,
                with: .color(PropertyTwinColors.primary.opacity(0.55)),
                style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round)
            )
        }
        .padding(12)
        .overlay(alignment: .bottomLeading) {
            Text("CAPTURE PHOTO · DIRECT")
                .font(.system(size: 8, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(.secondary)
                .padding(8)
        }
    }

    private func normalizedPoints(in size: CGSize) -> [CGPoint] {
        let positions = poses.map {
            SIMD2<Float>($0.matrix.columns.3.x, $0.matrix.columns.3.z)
        }
        guard let minX = positions.map(\.x).min(),
              let maxX = positions.map(\.x).max(),
              let minY = positions.map(\.y).min(),
              let maxY = positions.map(\.y).max() else {
            return []
        }

        let spanX = max(maxX - minX, 0.3)
        let spanY = max(maxY - minY, 0.3)
        return positions.map {
            CGPoint(
                x: CGFloat(($0.x - minX) / spanX) * max(size.width, 1),
                y: CGFloat(($0.y - minY) / spanY) * max(size.height, 1)
            )
        }
    }
}

