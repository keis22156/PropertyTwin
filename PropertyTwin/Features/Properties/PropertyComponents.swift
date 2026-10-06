import SwiftData
import SwiftUI
import UIKit

struct StoredImageView: View {
    let relativePath: String?
    var contentMode: ContentMode = .fill
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().aspectRatio(contentMode: contentMode)
            } else {
                ZStack {
                    PropertyTwinColors.primarySoft
                    Image(systemName: "building.2.crop.circle")
                        .font(.system(size: 34, weight: .light))
                        .foregroundStyle(PropertyTwinColors.primary)
                }
            }
        }
        .clipped()
        .task(id: relativePath) {
            guard let relativePath else { image = nil; return }
            image = await Task.detached(priority: .utility) {
                guard let url = ImageStorageService().url(for: relativePath),
                      let data = try? Data(contentsOf: url) else { return nil }
                return UIImage(data: data)
            }.value
        }
    }
}

struct PremiumPropertyCard: View {
    let property: Property
    let primaryPhotoPath: String?
    var analytics: AnalyticsSummary = .init()

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            StoredImageView(relativePath: primaryPhotoPath)
                .frame(height: 184)
                .overlay(alignment: .topLeading) {
                    PTStatusBadge(title: property.status.rawValue, color: statusColor)
                        .padding(14)
                }
            VStack(alignment: .leading, spacing: 13) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(property.name).font(PropertyTwinTypography.cardTitle)
                        Text(location).font(.subheadline).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if let price = property.price {
                        Text(price, format: .currency(code: "EUR").precision(.fractionLength(0)))
                            .font(.subheadline.weight(.bold))
                    }
                }
                HStack(spacing: 14) {
                    if let area = property.displayArea {
                        Label(area.formatted(.number.precision(.fractionLength(0))) + " m²", systemImage: "square.dashed")
                    }
                    if let rooms = property.expectedRoomCount {
                        Label("\(rooms) pièces", systemImage: "door.left.hand.open")
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                if analytics.views + analytics.designOpens + analytics.leads > 0 {
                    Divider()
                    HStack {
                        Label("\(analytics.views) vues", systemImage: "eye")
                        Spacer()
                        Label("\(analytics.designOpens) interactions", systemImage: "wand.and.stars")
                        Spacer()
                        Label("\(analytics.leads) leads", systemImage: "person.crop.circle.badge.checkmark")
                    }
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                }
            }
            .padding(18)
        }
        .background(PropertyTwinColors.surface, in: RoundedRectangle(cornerRadius: PropertyTwinRadius.card))
        .clipShape(RoundedRectangle(cornerRadius: PropertyTwinRadius.card))
        .shadow(color: .black.opacity(0.055), radius: 20, y: 8)
    }

    private var location: String {
        [property.address, property.city].filter { !$0.isEmpty }.joined(separator: " · ")
    }
    private var statusColor: Color {
        switch property.status {
        case .draft, .archived: .secondary
        case .ready: PropertyTwinColors.warning
        case .published: PropertyTwinColors.success
        }
    }
}

extension Property {
    func primaryPhoto(in photos: [PropertyPhoto]) -> PropertyPhoto? {
        let matches = photos.filter { $0.propertyID == id }
        return matches.first(where: \.isPrimary) ?? matches.first
    }
}
