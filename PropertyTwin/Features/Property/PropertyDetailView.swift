import SwiftUI

struct PropertyDetailView: View {
    let property: Property
    @State private var showingScan = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                summary
                rooms
            }
            .padding(20)
        }
        .background(PTStyle.background.ignoresSafeArea())
        .navigationTitle(property.name)
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            Button {
                showingScan = true
            } label: {
                Label("Scanner une pièce", systemImage: "plus")
            }
            .buttonStyle(PrimaryButtonStyle())
            .padding(20)
            .background(.ultraThinMaterial)
        }
        .fullScreenCover(isPresented: $showingScan) {
            RoomScanFlowView(property: property)
        }
    }

    private var summary: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !property.address.isEmpty {
                Label(property.address, systemImage: "mappin.and.ellipse")
                    .foregroundStyle(.secondary)
            }
            HStack {
                metric("\(property.rooms.count)", label: "Pièces")
                Divider()
                metric(property.knownArea.map { $0.formatted(.number.precision(.fractionLength(1))) + " m²" } ?? "—", label: "Surface connue")
            }
            .frame(height: 54)
        }
        .ptCard()
    }

    private var rooms: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Pièces").font(.title2.bold())
            if property.rooms.isEmpty {
                ContentUnavailableView(
                    "Aucune pièce scannée",
                    systemImage: "viewfinder",
                    description: Text("Scannez une première pièce pour créer son jumeau spatial.")
                )
                .frame(maxWidth: .infinity)
                .ptCard()
            } else {
                ForEach(property.rooms.sorted(by: { $0.createdAt > $1.createdAt })) { room in
                    NavigationLink {
                        SavedRoomView(room: room)
                    } label: {
                        RoomCard(room: room)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func metric(_ value: String, label: String) -> some View {
        VStack(alignment: .leading) {
            Text(value).font(.title3.bold())
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct RoomCard: View {
    let room: ScannedRoom

    var body: some View {
        HStack(spacing: 16) {
            if let geometry = room.geometry {
                FloorPlanView(geometry: geometry, compact: true)
                    .frame(width: 82, height: 72)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(room.name).font(.headline).foregroundStyle(PTStyle.ink)
                Text(room.area.map { $0.formatted(.number.precision(.fractionLength(1))) + " m²" } ?? "Surface non déterminée")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Label("Scan terminé", systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.green)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(.tertiary)
        }
        .ptCard()
    }
}
