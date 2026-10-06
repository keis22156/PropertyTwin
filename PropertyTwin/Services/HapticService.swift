import UIKit

@MainActor
enum HapticService {
    static func scanStarted() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    static func scanFinished() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }
}
