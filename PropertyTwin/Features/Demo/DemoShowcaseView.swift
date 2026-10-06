import SwiftUI

struct DemoShowcaseView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                PTStatusBadge(title: "DÉMO — données fictives", color: PropertyTwinColors.warning)
                VStack(alignment: .leading, spacing: 8) {
                    Text("Appartement Victor Hugo").font(PropertyTwinTypography.hero)
                    Text("Paris 16e").foregroundStyle(.secondary)
                    HStack {
                        Label("72 m²", systemImage: "square.dashed")
                        Label("3 pièces", systemImage: "door.left.hand.open")
                        Spacer()
                        Text("895 000 €").font(.headline)
                    }
                }
                .ptCard()
                demoVisual
                VStack(alignment: .leading, spacing: 12) {
                    Text("Séquence de démonstration").font(PropertyTwinTypography.title)
                    demoStep("1", "Salon scanné", "Plan et 3D RoomPlan")
                    demoStep("2", "Design Studio", "Avant / après")
                    demoStep("3", "Buyer View", "Budget et prise de contact")
                }
                .ptCard()
                Text("Cette démonstration ne crée aucun scan, lead, montant ou événement dans vos données réelles.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .padding(20)
        }
        .background(PropertyTwinColors.background)
        .navigationTitle("Mode Démo")
    }

    private var demoVisual: some View {
        ZStack {
            PropertyTwinColors.primarySoft
            Path { path in
                path.move(to: CGPoint(x: 45, y: 55)); path.addLine(to: CGPoint(x: 280, y: 55))
                path.addLine(to: CGPoint(x: 280, y: 210)); path.addLine(to: CGPoint(x: 45, y: 210)); path.closeSubpath()
                path.move(to: CGPoint(x: 170, y: 55)); path.addLine(to: CGPoint(x: 170, y: 135))
                path.move(to: CGPoint(x: 170, y: 160)); path.addLine(to: CGPoint(x: 170, y: 210))
            }
            .stroke(PropertyTwinColors.ink, style: StrokeStyle(lineWidth: 7, lineCap: .square))
        }
        .frame(height: 265)
        .clipShape(RoundedRectangle(cornerRadius: 24))
    }

    private func demoStep(_ number: String, _ title: String, _ subtitle: String) -> some View {
        HStack {
            Text(number).font(.headline).foregroundStyle(.white)
                .frame(width: 34, height: 34).background(PropertyTwinColors.primary, in: Circle())
            VStack(alignment: .leading) {
                Text(title).font(.headline)
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}
