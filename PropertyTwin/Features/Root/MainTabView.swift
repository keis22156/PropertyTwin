import SwiftData
import SwiftUI

struct MainTabView: View {
    @State private var selection: AppTab = .home

    var body: some View {
        TabView(selection: $selection) {
            DashboardView().tag(AppTab.home)
            PropertiesView().tag(AppTab.properties)
            ScannerHubView().tag(AppTab.scanner)
            ActivityView().tag(AppTab.activity)
            ProfileView().tag(AppTab.profile)
        }
        .toolbar(.hidden, for: .tabBar)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            PTTabBar(selection: $selection)
        }
        .tint(PropertyTwinColors.primary)
    }
}

private enum AppTab: Int, CaseIterable, Identifiable {
    case home
    case properties
    case scanner
    case activity
    case profile

    var id: Int { rawValue }
    var title: String {
        switch self {
        case .home: "Accueil"
        case .properties: "Biens"
        case .scanner: "Scanner"
        case .activity: "Activité"
        case .profile: "Profil"
        }
    }
    var symbol: String {
        switch self {
        case .home: "house.fill"
        case .properties: "building.2.fill"
        case .scanner: "viewfinder"
        case .activity: "chart.xyaxis.line"
        case .profile: "person.crop.circle.fill"
        }
    }
}

private struct PTTabBar: View {
    @Binding var selection: AppTab
    var body: some View {
        HStack(alignment: .bottom, spacing: 4) {
            ForEach(AppTab.allCases) { tab in
                Button {
                    HapticService.selection()
                    withAnimation(PropertyTwinAnimation.spring) { selection = tab }
                } label: {
                    if tab == .scanner {
                        scannerItem
                    } else {
                        standardItem(tab)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tab.title)
                .accessibilityAddTraits(selection == tab ? .isSelected : [])
            }
        }
        .padding(.horizontal, 10)
        .padding(.top, 9)
        .padding(.bottom, 7)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Divider().opacity(0.35) }
    }

    private func standardItem(_ tab: AppTab) -> some View {
        VStack(spacing: 5) {
            ZStack {
                if selection == tab {
                    Capsule()
                        .fill(PropertyTwinColors.primarySoft)
                        .frame(width: 46, height: 30)
                }
                Image(systemName: tab.symbol)
                    .font(.system(size: 18, weight: .semibold))
            }
            Text(tab.title)
                .font(.system(size: 10, weight: selection == tab ? .bold : .medium))
        }
        .foregroundStyle(selection == tab ? PropertyTwinColors.primary : PropertyTwinColors.secondaryText)
        .frame(maxWidth: .infinity, minHeight: 48)
    }

    private var scannerItem: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .fill(PropertyTwinColors.heroGradient)
                    .frame(width: 52, height: 52)
                    .shadow(color: PropertyTwinColors.primary.opacity(0.28), radius: 14, y: 7)
                Image(systemName: "viewfinder")
                    .font(.system(size: 23, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .offset(y: -8)
            Text("Scanner")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(selection == .scanner ? PropertyTwinColors.primary : PropertyTwinColors.secondaryText)
                .offset(y: -6)
        }
        .frame(maxWidth: .infinity, minHeight: 48)
    }
}
