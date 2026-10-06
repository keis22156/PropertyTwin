import Foundation
import Observation

enum FeatureFlag: String, CaseIterable {
    case aiDesign, buyerPersonalization, renovationEstimate, financing, multiRoom, analytics
}

@MainActor @Observable
final class FeatureFlagService {
    private(set) var enabled: Set<FeatureFlag> = [.renovationEstimate, .financing, .multiRoom, .analytics]

    func isEnabled(_ flag: FeatureFlag) -> Bool { enabled.contains(flag) }
    func set(_ flag: FeatureFlag, enabled value: Bool) {
        if value { enabled.insert(flag) } else { enabled.remove(flag) }
    }
}
