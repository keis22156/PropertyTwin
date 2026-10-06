import SwiftUI

struct ProfileView: View {
    @AppStorage("agentFirstName") private var firstName = ""
    @AppStorage("demoModeEnabled") private var demoMode = false
    @AppStorage("aiBackendEndpoint") private var aiBackendEndpoint = ""
    @State private var huggingFaceToken = ""
    @State private var credentialMessage: String?
    @State private var flags = FeatureFlagService()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    profileHero
                    settingsCard(title: "Votre espace", symbol: "person.crop.circle.fill", tint: PropertyTwinColors.primary) {
                        TextField("Votre nom", text: $firstName)
                            .textFieldStyle(.plain)
                            .padding(14)
                            .background(PropertyTwinColors.elevatedSurface, in: RoundedRectangle(cornerRadius: 14))
                        Label("Données et scans stockés localement", systemImage: "iphone.gen3")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    settingsCard(title: "App & site web", symbol: "arrow.triangle.2.circlepath", tint: PropertyTwinColors.primary) {
                        NavigationLink("Coordonnées et identité de l’agence") { WebsiteAgencySettingsView() }
                        NavigationLink("Connecter le même espace au dashboard") { WebsiteConnectionView() }
                        Text("Le même compte agence relie l’app au SaaS. Les biens se synchronisent automatiquement avec votre serveur.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    aiCard
                    settingsCard(title: "Fonctionnalités", symbol: "slider.horizontal.3", tint: PropertyTwinColors.mint) {
                        featureToggle("Design IA", flag: .aiDesign)
                        featureToggle("Personnalisation acheteur", flag: .buyerPersonalization)
                        featureToggle("Estimation rénovation", flag: .renovationEstimate)
                        featureToggle("Financement", flag: .financing)
                        featureToggle("Analytics locaux", flag: .analytics)
                    }
                    settingsCard(title: "Présentation", symbol: "play.rectangle.fill", tint: PropertyTwinColors.coral) {
                        Toggle("Mode Démo", isOn: $demoMode)
                        Text("Toujours séparé de vos logements et scans réels.")
                            .font(.footnote).foregroundStyle(.secondary)
                        if demoMode {
                            NavigationLink("Ouvrir la démonstration") { DemoShowcaseView() }
                                .font(.headline)
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 160)
            }
            .background(PTAppBackground())
            .navigationTitle("Profil")
            .onAppear {
                huggingFaceToken = SecureCredentialStore.read(account: "huggingFaceToken") ?? ""
            }
            .alert("Configuration IA", isPresented: .constant(credentialMessage != nil)) {
                Button("OK") { credentialMessage = nil }
            } message: {
                Text(credentialMessage ?? "")
            }
        }
    }

    private var profileHero: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle().fill(PropertyTwinColors.heroGradient)
                Text(firstName.first.map(String.init)?.uppercased() ?? "P")
                    .font(.title.bold()).foregroundStyle(.white)
            }
            .frame(width: 62, height: 62)
            VStack(alignment: .leading, spacing: 4) {
                Text(firstName.isEmpty ? "Bienvenue" : firstName)
                    .font(PropertyTwinTypography.title)
                Text("Votre studio immobilier augmenté")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.top, 8)
    }

    private var aiCard: some View {
        settingsCard(title: "Studio IA", symbol: "wand.and.stars.inverse", tint: PropertyTwinColors.violet) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(ImageGenerationService.live.providerName).font(.headline)
                    Text("Essai avec crédits gratuits Hugging Face")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                PTStatusBadge(
                    title: ImageGenerationService.live.isConfigured ? "Prête" : "À configurer",
                    color: ImageGenerationService.live.isConfigured ? PropertyTwinColors.success : PropertyTwinColors.warning
                )
            }

            SecureField("Jeton Hugging Face hf_…", text: $huggingFaceToken)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(14)
                .background(PropertyTwinColors.elevatedSurface, in: RoundedRectangle(cornerRadius: 14))

            if let tokenURL = URL(string: "https://huggingface.co/settings/tokens") {
                Link(destination: tokenURL) {
                    Label("Créer mon jeton gratuit", systemImage: "arrow.up.right.square")
                        .font(.headline)
                }
                .accessibilityHint("Ouvre la page officielle Hugging Face dans Safari")
            }

            HStack {
                Button("Connecter l’IA") { saveTrialToken() }
                    .buttonStyle(PrimaryButtonStyle(compact: true))
                if !huggingFaceToken.isEmpty {
                    Button("Retirer", role: .destructive) {
                        SecureCredentialStore.remove(account: "huggingFaceToken")
                        huggingFaceToken = ""
                        credentialMessage = "Jeton retiré."
                    }
                    .font(.subheadline.weight(.semibold))
                }
            }

            Text("Le jeton reste dans le Trousseau iOS. Une photo envoyée au fournisseur quitte l’appareil. Les crédits gratuits sont limités.")
                .font(.footnote).foregroundStyle(.secondary)

            Divider()

            TextField("Backend HTTPS de production (optionnel)", text: $aiBackendEndpoint)
                .textInputAutocapitalization(.never)
                .keyboardType(.URL)
                .padding(14)
                .background(PropertyTwinColors.elevatedSurface, in: RoundedRectangle(cornerRadius: 14))
            Text("Lorsqu’il est renseigné, le backend sécurisé est prioritaire sur le fournisseur d’essai.")
                .font(.footnote).foregroundStyle(.secondary)
        }
    }

    private func settingsCard<Content: View>(
        title: String,
        symbol: String,
        tint: Color,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Label(title, systemImage: symbol)
                .font(.headline)
                .foregroundStyle(tint)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .ptCard()
    }

    private func featureToggle(_ title: String, flag: FeatureFlag) -> some View {
        Toggle(title, isOn: binding(flag))
            .tint(PropertyTwinColors.primary)
    }

    private func saveTrialToken() {
        let trimmed = huggingFaceToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix("hf_") else {
            credentialMessage = "Le jeton doit commencer par « hf_ »."
            return
        }
        do {
            try SecureCredentialStore.save(trimmed, account: "huggingFaceToken")
            huggingFaceToken = trimmed
            credentialMessage = "IA d’essai activée. Vous pouvez générer une transformation depuis Design Studio."
        } catch {
            credentialMessage = error.localizedDescription
        }
    }

    private func binding(_ flag: FeatureFlag) -> Binding<Bool> {
        Binding(get: { flags.isEnabled(flag) }, set: { flags.set(flag, enabled: $0) })
    }
}
