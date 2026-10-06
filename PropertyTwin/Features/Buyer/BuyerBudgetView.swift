import SwiftData
import SwiftUI

struct BuyerBudgetView: View {
    let property: Property
    @State private var renovationLevel: RenovationLevel = .standard
    @State private var renovationElements: Set<RenovationElement> = [.floors, .walls]
    @State private var downPayment = ""
    @State private var duration = 20
    @State private var rate = "3.5"
    @State private var works = ""
    @State private var furnitureName = "Canapé"
    @State private var furnitureWidth = ""
    @State private var furnitureDepth = ""
    @State private var furnitureHeight = ""

    private var area: Double? { property.displayArea }
    private var estimate: RenovationEstimate? {
        guard let area else { return nil }
        return RenovationEstimateService().estimate(.init(level: renovationLevel, elements: renovationElements, area: area))
    }
    private var financing: FinancingResult? {
        guard let price = property.price else { return nil }
        return FinancingCalculator.calculate(.init(
            propertyPrice: price,
            downPayment: Double(downPayment.replacingOccurrences(of: " ", with: "")) ?? 0,
            durationYears: duration,
            annualRatePercent: Double(rate.replacingOccurrences(of: ",", with: ".")) ?? 0,
            renovationBudget: Double(works.replacingOccurrences(of: " ", with: "")) ?? 0
        ))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            renovation
            financingSection
            furnitureSection
        }
        .padding(.horizontal, 20)
    }

    private var renovation: some View {
        VStack(alignment: .leading, spacing: 15) {
            Text("Budget rénovation").font(PropertyTwinTypography.hero)
            PTStatusBadge(title: "Estimation indicative", color: PropertyTwinColors.warning)
            Picker("Niveau", selection: $renovationLevel) {
                ForEach(RenovationLevel.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())]) {
                ForEach(RenovationElement.allCases) { element in
                    Button {
                        if renovationElements.contains(element) { renovationElements.remove(element) }
                        else { renovationElements.insert(element) }
                    } label: {
                        HStack {
                            Image(systemName: renovationElements.contains(element) ? "checkmark.circle.fill" : "circle")
                            Text(element.rawValue)
                            Spacer()
                        }
                        .font(.subheadline)
                        .foregroundStyle(renovationElements.contains(element) ? PropertyTwinColors.primary : .secondary)
                        .padding(12)
                        .background(PropertyTwinColors.surface, in: RoundedRectangle(cornerRadius: 13))
                    }
                }
            }
            if let estimate {
                VStack(alignment: .leading, spacing: 9) {
                    Text("Fourchette indicative").font(.caption).foregroundStyle(.secondary)
                    Text(estimate.low, format: .currency(code: "EUR").precision(.fractionLength(0)))
                    + Text(" – ")
                    + Text(estimate.high, format: .currency(code: "EUR").precision(.fractionLength(0)))
                    ForEach(estimate.assumptions, id: \.self) { Text("• " + $0).font(.caption).foregroundStyle(.secondary) }
                }
                .ptCard()
            } else {
                Text("La surface et au moins un poste sont nécessaires pour calculer une estimation.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private var financingSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Simulation de financement").font(PropertyTwinTypography.title)
            VStack {
                TextField("Apport (€)", text: $downPayment).keyboardType(.decimalPad)
                Divider()
                Picker("Durée", selection: $duration) {
                    ForEach([10, 15, 20, 25, 30], id: \.self) { Text("\($0) ans").tag($0) }
                }
                Divider()
                TextField("Taux annuel (%)", text: $rate).keyboardType(.decimalPad)
                Divider()
                TextField("Travaux (€)", text: $works).keyboardType(.decimalPad)
            }
            .ptCard()
            if let financing {
                VStack(spacing: 13) {
                    LabeledContent("Montant emprunté", value: financing.borrowedAmount.formatted(.currency(code: "EUR").precision(.fractionLength(0))))
                    LabeledContent("Mensualité estimée", value: financing.monthlyPayment.formatted(.currency(code: "EUR").precision(.fractionLength(0))) + "/mois")
                    LabeledContent("Coût total indicatif", value: financing.totalCost.formatted(.currency(code: "EUR").precision(.fractionLength(0))))
                }
                .ptCard()
            }
            Text("Simulation non contractuelle, hors assurance et frais annexes.")
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    private var furnitureSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Est-ce que mon meuble rentre ?").font(PropertyTwinTypography.title)
            TextField("Meuble", text: $furnitureName)
                .padding(14).background(PropertyTwinColors.surface, in: RoundedRectangle(cornerRadius: 14))
            HStack {
                dimensionField("Largeur", text: $furnitureWidth)
                dimensionField("Profondeur", text: $furnitureDepth)
                dimensionField("Hauteur", text: $furnitureHeight)
            }
            if furnitureDimensionsAreValid {
                Label(compatibilityMessage, systemImage: "ruler")
                    .font(.subheadline)
                    .ptCard()
                Text("Vérification complémentaire recommandée : ce contrôle ne tient pas compte des circulations, portes, obstacles ni du placement exact.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func dimensionField(_ label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            TextField("cm", text: text).keyboardType(.decimalPad)
        }
        .padding(12)
        .background(PropertyTwinColors.surface, in: RoundedRectangle(cornerRadius: 14))
    }

    private var furnitureDimensionsAreValid: Bool {
        [furnitureWidth, furnitureDepth, furnitureHeight].allSatisfy { (Double($0) ?? 0) > 0 }
    }

    private var compatibilityMessage: String {
        guard let width = Double(furnitureWidth), let depth = Double(furnitureDepth),
              let largestFloor = property.rooms.compactMap(\.geometry).flatMap(\.floors)
                .max(by: { $0.width * $0.depth < $1.width * $1.depth }) else {
            return "Géométrie insuffisante pour vérifier les dimensions."
        }
        let fits = width / 100 <= Double(max(largestFloor.width, largestFloor.depth))
            && depth / 100 <= Double(min(largestFloor.width, largestFloor.depth))
        return fits ? "Dimensions compatibles avec l’enveloppe mesurée de cet espace." : "Ces dimensions dépassent l’enveloppe de sol mesurée."
    }
}
