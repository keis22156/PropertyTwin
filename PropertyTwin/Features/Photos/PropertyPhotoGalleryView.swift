import PhotosUI
import SwiftData
import SwiftUI

struct PropertyPhotoGalleryView: View {
    let property: Property
    var room: ScannedRoom?
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \PropertyPhoto.createdAt, order: .reverse) private var allPhotos: [PropertyPhoto]
    @State private var selection: [PhotosPickerItem] = []
    @State private var errorMessage: String?
    private let storage = ImageStorageService()

    private var photos: [PropertyPhoto] {
        allPhotos.filter { $0.propertyID == property.id && (room == nil || $0.roomID == room?.id) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(room?.name ?? "Galerie photos").font(PropertyTwinTypography.title)
                    Text("\(photos.count) photo\(photos.count == 1 ? "" : "s")")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                PhotosPicker(selection: $selection, maxSelectionCount: 12, matching: .images) {
                    Label("Ajouter", systemImage: "plus")
                }
                .buttonStyle(.borderedProminent)
                .tint(PropertyTwinColors.primary)
            }
            if photos.isEmpty {
                ContentUnavailableView(
                    "Aucune photo",
                    systemImage: "photo.on.rectangle.angled",
                    description: Text("Ajoutez des photos réelles du bien ou de chaque pièce.")
                )
                .frame(maxWidth: .infinity)
                .ptCard()
            } else {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(photos) { photo in
                        photoCell(photo)
                    }
                }
            }
        }
        .onChange(of: selection) { _, newValue in
            Task { await importItems(newValue); selection = [] }
        }
        .alert("Photo non enregistrée", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: { Text(errorMessage ?? "") }
    }

    private func photoCell(_ photo: PropertyPhoto) -> some View {
        StoredImageView(relativePath: photo.thumbnailRelativePath)
            .aspectRatio(1.25, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(alignment: .topLeading) {
                if photo.isPrimary {
                    PTStatusBadge(title: "Principale", color: PropertyTwinColors.success).padding(8)
                }
            }
            .contextMenu {
                Button("Définir comme principale", systemImage: "star") { setPrimary(photo) }
                Button("Supprimer", systemImage: "trash", role: .destructive) { remove(photo) }
            }
            .accessibilityLabel(photo.isPrimary ? "Photo principale" : "Photo du bien")
    }

    private func importItems(_ items: [PhotosPickerItem]) async {
        for item in items {
            do {
                guard let data = try await item.loadTransferable(type: Data.self) else { continue }
                let paths = try await Task.detached(priority: .userInitiated) {
                    try ImageStorageService().store(data)
                }.value
                let photo = PropertyPhoto(
                    propertyID: property.id,
                    roomID: room?.id,
                    originalRelativePath: paths.original,
                    thumbnailRelativePath: paths.thumbnail,
                    isPrimary: allPhotos.allSatisfy { $0.propertyID != property.id }
                )
                modelContext.insert(photo)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
        try? modelContext.save()
    }

    private func setPrimary(_ photo: PropertyPhoto) {
        for item in allPhotos where item.propertyID == property.id { item.isPrimary = item.id == photo.id }
        try? modelContext.save()
    }

    private func remove(_ photo: PropertyPhoto) {
        storage.remove([photo.originalRelativePath, photo.thumbnailRelativePath])
        modelContext.delete(photo)
        try? modelContext.save()
    }
}
