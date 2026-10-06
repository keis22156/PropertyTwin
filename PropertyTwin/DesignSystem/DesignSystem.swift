import SwiftUI
import UIKit

enum PropertyTwinColors {
    static let background = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.055, green: 0.063, blue: 0.075, alpha: 1)
            : UIColor(red: 0.972, green: 0.968, blue: 0.957, alpha: 1)
    })
    static let surface = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.095, green: 0.105, blue: 0.125, alpha: 1)
            : .white
    })
    static let elevatedSurface = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.13, green: 0.14, blue: 0.165, alpha: 1)
            : UIColor(red: 0.985, green: 0.988, blue: 0.995, alpha: 1)
    })
    static let chrome = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.11, green: 0.12, blue: 0.15, alpha: 0.94)
            : UIColor(white: 1, alpha: 0.90)
    })
    static let primary = Color(red: 0.145, green: 0.365, blue: 0.82)
    static let primarySoft = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.12, green: 0.22, blue: 0.39, alpha: 1)
            : UIColor(red: 0.91, green: 0.94, blue: 1, alpha: 1)
    })
    static let ink = Color.primary
    static let secondaryText = Color.secondary
    static let separator = Color.primary.opacity(0.08)
    static let success = Color(red: 0.12, green: 0.62, blue: 0.43)
    static let warning = Color(red: 0.94, green: 0.57, blue: 0.12)
    static let coral = Color(red: 0.96, green: 0.36, blue: 0.32)
    static let mint = Color(red: 0.08, green: 0.66, blue: 0.58)
    static let violet = Color(red: 0.48, green: 0.35, blue: 0.92)
    static let sky = Color(red: 0.18, green: 0.64, blue: 0.96)
    static let heroGradient = LinearGradient(
        colors: [primary, Color(red: 0.22, green: 0.55, blue: 0.97), violet],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

enum PropertyTwinSpacing {
    static let xSmall: CGFloat = 6
    static let small: CGFloat = 10
    static let medium: CGFloat = 16
    static let large: CGFloat = 22
    static let xLarge: CGFloat = 30
    static let section: CGFloat = 38
}

enum PropertyTwinRadius {
    static let small: CGFloat = 12
    static let medium: CGFloat = 17
    static let card: CGFloat = 22
    static let large: CGFloat = 28
}

enum PropertyTwinAnimation {
    static let quick = Animation.easeOut(duration: 0.18)
    static let spring = Animation.spring(response: 0.42, dampingFraction: 0.84)
}

enum PropertyTwinTypography {
    static let hero = Font.system(.largeTitle, design: .rounded, weight: .bold)
    static let title = Font.system(.title2, design: .rounded, weight: .bold)
    static let cardTitle = Font.system(.headline, design: .rounded, weight: .semibold)
    static let metric = Font.system(.title2, design: .rounded, weight: .bold)
}

enum PTStyle {
    static let blue = PropertyTwinColors.primary
    static let ink = PropertyTwinColors.ink
    static let background = PropertyTwinColors.background
    static let secondaryText = PropertyTwinColors.secondaryText
    static let radius = PropertyTwinRadius.card
}

struct PrimaryButtonStyle: ButtonStyle {
    var compact = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: compact ? nil : .infinity)
            .frame(minHeight: compact ? 46 : 54)
            .padding(.horizontal, compact ? 18 : 0)
            .foregroundStyle(.white)
            .background(PropertyTwinColors.heroGradient.opacity(configuration.isPressed ? 0.82 : 1), in: RoundedRectangle(cornerRadius: PropertyTwinRadius.medium))
            .shadow(color: PropertyTwinColors.primary.opacity(0.22), radius: 12, y: 6)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(PropertyTwinAnimation.quick, value: configuration.isPressed)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 52)
            .foregroundStyle(PropertyTwinColors.ink)
            .background(PropertyTwinColors.elevatedSurface, in: RoundedRectangle(cornerRadius: PropertyTwinRadius.medium))
            .overlay {
                RoundedRectangle(cornerRadius: PropertyTwinRadius.medium)
                    .stroke(PropertyTwinColors.separator)
            }
            .opacity(configuration.isPressed ? 0.75 : 1)
    }
}

struct PTAppBackground: View {
    var body: some View {
        ZStack {
            PropertyTwinColors.background
            Circle()
                .fill(PropertyTwinColors.sky.opacity(0.10))
                .frame(width: 330)
                .blur(radius: 55)
                .offset(x: 150, y: -300)
            Circle()
                .fill(PropertyTwinColors.coral.opacity(0.07))
                .frame(width: 280)
                .blur(radius: 60)
                .offset(x: -170, y: 280)
        }
        .ignoresSafeArea()
    }
}

struct PTCardModifier: ViewModifier {
    var padding: CGFloat = PropertyTwinSpacing.large
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(PropertyTwinColors.surface, in: RoundedRectangle(cornerRadius: PropertyTwinRadius.card, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: PropertyTwinRadius.card, style: .continuous)
                    .stroke(.white.opacity(0.48), lineWidth: 0.8)
            }
            .shadow(color: PropertyTwinColors.primary.opacity(0.045), radius: 24, y: 10)
            .shadow(color: .black.opacity(0.035), radius: 6, y: 2)
    }
}

struct PTIconTile: View {
    let symbol: String
    var tint = PropertyTwinColors.primary
    var size: CGFloat = 44

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.4, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(
                LinearGradient(
                    colors: [tint.opacity(0.78), tint],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: size * 0.31, style: .continuous)
            )
            .shadow(color: tint.opacity(0.24), radius: 10, y: 5)
    }
}

struct PTPageHeader: View {
    let eyebrow: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(eyebrow.uppercased())
                .font(.caption.weight(.bold))
                .tracking(1.4)
                .foregroundStyle(PropertyTwinColors.primary)
            Text(title)
                .font(.system(.largeTitle, design: .rounded, weight: .bold))
                .foregroundStyle(PropertyTwinColors.ink)
            Text(subtitle)
                .font(.body)
                .foregroundStyle(PropertyTwinColors.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct PTEmptyState: View {
    let symbol: String
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 15) {
            PTIconTile(symbol: symbol, tint: PropertyTwinColors.violet, size: 58)
            Text(title).font(.title3.bold())
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .ptCard()
    }
}

struct PTStatusBadge: View {
    let title: String
    var color = PropertyTwinColors.primary
    var body: some View {
        Text(title)
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .foregroundStyle(color)
            .background(color.opacity(0.12), in: Capsule())
    }
}

struct PTSectionHeader: View {
    let title: String
    var action: String?
    var onAction: (() -> Void)?
    var body: some View {
        HStack {
            Text(title).font(PropertyTwinTypography.title)
            Spacer()
            if let action, let onAction {
                Button(action, action: onAction).font(.subheadline.weight(.semibold))
            }
        }
    }
}

extension View {
    func ptCard(padding: CGFloat = PropertyTwinSpacing.large) -> some View {
        modifier(PTCardModifier(padding: padding))
    }
}
