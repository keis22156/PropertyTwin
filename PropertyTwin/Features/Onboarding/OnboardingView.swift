import SwiftUI

struct AppRootView: View {
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false

    var body: some View {
        if hasCompletedOnboarding {
            MainTabView()
        } else {
            OnboardingView { hasCompletedOnboarding = true }
        }
    }
}

struct OnboardingView: View {
    struct Page: Identifiable {
        let id: Int
        let eyebrow: String
        let title: String
        let message: String
        let symbol: String
        let tint: Color
    }

    let onComplete: () -> Void
    @State private var page = 0

    private let pages = [
        Page(id: 0, eyebrow: "CAPTURER", title: "Le réel, précisément.", message: "Le LiDAR transforme chaque pièce en géométrie, plan et modèle 3D.", symbol: "viewfinder", tint: PropertyTwinColors.primary),
        Page(id: 1, eyebrow: "IMAGINER", title: "Révélez le potentiel.", message: "Meublez et rénovez une vraie photo sans masquer les données du scan.", symbol: "wand.and.stars", tint: PropertyTwinColors.violet),
        Page(id: 2, eyebrow: "CONVAINCRE", title: "Faites-le ressentir.", message: "Offrez à chaque acheteur une visite claire, immersive et personnelle.", symbol: "heart.text.square.fill", tint: PropertyTwinColors.coral)
    ]

    var body: some View {
        ZStack {
            PTAppBackground()
            VStack(spacing: 0) {
                topBar
                TabView(selection: $page) {
                    ForEach(pages) { item in
                        OnboardingPageView(page: item).tag(item.id)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                bottomControls
            }
        }
        .tint(PropertyTwinColors.primary)
    }

    private var topBar: some View {
        HStack {
            HStack(spacing: 9) {
                Image(systemName: "square.3.layers.3d.top.filled")
                    .foregroundStyle(PropertyTwinColors.primary)
                Text("PropertyTwin").font(.headline)
            }
            Spacer()
            Button("Passer", action: onComplete)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 22)
        .padding(.top, 12)
    }

    private var bottomControls: some View {
        VStack(spacing: 18) {
            HStack(spacing: 7) {
                ForEach(pages) { item in
                    Capsule()
                        .fill(item.id == page ? PropertyTwinColors.primary : PropertyTwinColors.separator)
                        .frame(width: item.id == page ? 28 : 7, height: 7)
                }
            }
            .animation(PropertyTwinAnimation.spring, value: page)

            Button {
                if page == pages.count - 1 {
                    HapticService.scanFinished()
                    onComplete()
                } else {
                    HapticService.selection()
                    withAnimation(PropertyTwinAnimation.spring) { page += 1 }
                }
            } label: {
                HStack {
                    Text(page == pages.count - 1 ? "Créer mon premier jumeau" : "Continuer")
                    Spacer()
                    Image(systemName: page == pages.count - 1 ? "sparkles" : "arrow.right")
                }
            }
            .buttonStyle(PrimaryButtonStyle())
        }
        .padding(.horizontal, 22)
        .padding(.bottom, 20)
    }
}

private struct OnboardingPageView: View {
    let page: OnboardingView.Page

    var body: some View {
        VStack(spacing: 30) {
            Spacer(minLength: 20)
            spatialVisual
            VStack(spacing: 12) {
                Text(page.eyebrow)
                    .font(.caption.weight(.bold))
                    .tracking(1.8)
                    .foregroundStyle(page.tint)
                Text(page.title)
                    .font(.system(.largeTitle, design: .rounded, weight: .bold))
                    .multilineTextAlignment(.center)
                Text(page.message)
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
            }
            .padding(.horizontal, 26)
            Spacer()
        }
    }

    private var spatialVisual: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 50, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [page.tint.opacity(0.18), page.tint.opacity(0.045)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 280, height: 280)
            ForEach(0..<3, id: \.self) { index in
                RoundedRectangle(cornerRadius: 33, style: .continuous)
                    .stroke(page.tint.opacity(0.18 + Double(index) * 0.09), lineWidth: 1.5)
                    .frame(width: 205 - CGFloat(index * 26), height: 205 - CGFloat(index * 26))
                    .rotationEffect(.degrees(Double(index * 9 - 8)))
            }
            Circle()
                .fill(page.tint.gradient)
                .frame(width: 100, height: 100)
                .shadow(color: page.tint.opacity(0.32), radius: 25, y: 12)
            Image(systemName: page.symbol)
                .font(.system(size: 42, weight: .medium))
                .foregroundStyle(.white)
        }
        .accessibilityHidden(true)
    }
}
