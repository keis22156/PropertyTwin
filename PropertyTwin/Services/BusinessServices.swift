import Foundation

struct RenovationRate: Sendable {
    let lowPerSquareMeter: Double
    let highPerSquareMeter: Double
}

struct RenovationEstimateService: Sendable {
    var rates: [RenovationLevel: RenovationRate] = [
        .light: .init(lowPerSquareMeter: 280, highPerSquareMeter: 420),
        .standard: .init(lowPerSquareMeter: 650, highPerSquareMeter: 950),
        .premium: .init(lowPerSquareMeter: 1_100, highPerSquareMeter: 1_600)
    ]

    func estimate(_ scenario: RenovationScenario) -> RenovationEstimate? {
        guard scenario.area > 0, let rate = rates[scenario.level], !scenario.elements.isEmpty else { return nil }
        let scopeFactor = min(1, 0.35 + Double(scenario.elements.count) * 0.13)
        return RenovationEstimate(
            low: scenario.area * rate.lowPerSquareMeter * scopeFactor,
            high: scenario.area * rate.highPerSquareMeter * scopeFactor,
            assumptions: [
                "\(scenario.area.formatted(.number.precision(.fractionLength(1)))) m²",
                scenario.level.rawValue,
                scenario.elements.map(\.rawValue).sorted().joined(separator: ", "),
                "Barèmes indicatifs configurables, hors étude technique."
            ]
        )
    }
}

struct FinancingInput: Equatable {
    let propertyPrice: Double
    let downPayment: Double
    let durationYears: Int
    let annualRatePercent: Double
    let renovationBudget: Double
}

struct FinancingResult: Equatable {
    let borrowedAmount: Double
    let monthlyPayment: Double
    let totalCost: Double
}

enum FinancingCalculator {
    static func calculate(_ input: FinancingInput) -> FinancingResult? {
        let principal = input.propertyPrice + input.renovationBudget - input.downPayment
        guard principal > 0, input.durationYears > 0, input.annualRatePercent >= 0 else { return nil }
        let months = Double(input.durationYears * 12)
        let monthlyRate = input.annualRatePercent / 100 / 12
        let payment: Double
        if monthlyRate == 0 {
            payment = principal / months
        } else {
            payment = principal * monthlyRate / (1 - pow(1 + monthlyRate, -months))
        }
        return FinancingResult(borrowedAmount: principal, monthlyPayment: payment, totalCost: payment * months - principal)
    }
}

struct AnalyticsSummary: Equatable {
    var views = 0
    var planOpens = 0
    var threeDOpens = 0
    var designOpens = 0
    var leads = 0
    var offerIntents = 0
    var roomAttention: [UUID: Int] = [:]
}

enum AnalyticsAggregator {
    static func summary(events: [AnalyticsEvent], propertyID: UUID) -> AnalyticsSummary {
        var value = AnalyticsSummary()
        for event in events where event.propertyID == propertyID {
            switch event.type {
            case .propertyViewed: value.views += 1
            case .planOpened: value.planOpens += 1
            case .threeDOpened: value.threeDOpens += 1
            case .designStudioOpened: value.designOpens += 1
            case .leadSubmitted: value.leads += 1
            case .offerIntentSubmitted: value.offerIntents += 1
            default: break
            }
            if let roomID = event.roomID { value.roomAttention[roomID, default: 0] += 1 }
        }
        return value
    }
}
