import SwiftUI

struct FloorPlanView: View {
    let geometry: RoomGeometry
    var compact = false
    var showDimensions = true
    var showFurniture = true
    var showNames = true
    @State private var scale: CGFloat = 1
    @State private var steadyScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var steadyOffset: CGSize = .zero

    private var segments: [PlanSegment] {
        (geometry.walls + geometry.doors + geometry.windows + geometry.openings).map(FloorPlanGeometry.segment)
    }

    var body: some View {
        GeometryReader { proxy in
            Canvas { context, size in
                draw(in: &context, size: size)
            }
            .background(Color.white)
            .scaleEffect(scale)
            .offset(offset)
            .gesture(compact ? nil : magnifyGesture)
            .simultaneousGesture(compact ? nil : dragGesture)
            .clipShape(RoundedRectangle(cornerRadius: compact ? 14 : 22))
            .overlay(alignment: .bottomTrailing) {
                if !compact {
                    Button {
                        withAnimation(.snappy) {
                            scale = 1
                            steadyScale = 1
                            offset = .zero
                            steadyOffset = .zero
                        }
                    } label: {
                        Image(systemName: "scope")
                            .frame(width: 44, height: 44)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .accessibilityLabel("Recentrer le plan")
                    .padding()
                }
            }
        }
        .aspectRatio(compact ? 1.45 : nil, contentMode: .fit)
    }

    private var magnifyGesture: some Gesture {
        MagnifyGesture()
            .onChanged { scale = min(max(steadyScale * $0.magnification, 0.7), 5) }
            .onEnded { _ in steadyScale = scale }
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                offset = CGSize(width: steadyOffset.width + value.translation.width, height: steadyOffset.height + value.translation.height)
            }
            .onEnded { _ in steadyOffset = offset }
    }

    private func draw(in context: inout GraphicsContext, size: CGSize) {
        guard let bounds = FloorPlanGeometry.bounds(for: segments) else {
            context.draw(Text("Plan indisponible").font(.callout).foregroundStyle(.secondary), at: CGPoint(x: size.width / 2, y: size.height / 2))
            return
        }
        if !compact && showFurniture {
            drawObjects(in: &context, size: size, bounds: bounds)
        }
        for segment in segments {
            let start = FloorPlanGeometry.transform(point: segment.start, bounds: bounds, canvas: size)
            let end = FloorPlanGeometry.transform(point: segment.end, bounds: bounds, canvas: size)
            var path = Path()
            path.move(to: start)
            path.addLine(to: end)
            let color: Color
            let width: CGFloat
            switch segment.kind {
            case .wall: color = PTStyle.ink; width = compact ? 4 : 7
            case .window: color = .cyan; width = compact ? 3 : 6
            case .door: color = PTStyle.blue; width = compact ? 3 : 5
            case .opening: color = Color.gray.opacity(0.45); width = compact ? 2 : 4
            case .floor: color = .clear; width = 0
            }
            context.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: width, lineCap: .square))
            if !compact && showDimensions && segment.kind == .wall {
                let midpoint = CGPoint(x: (start.x + end.x) / 2, y: (start.y + end.y) / 2)
                let label = Text(segment.length, format: .number.precision(.fractionLength(2))) + Text(" m")
                context.draw(label.font(.caption2).foregroundStyle(.secondary), at: CGPoint(x: midpoint.x, y: midpoint.y - 12))
            }
        }
        if !compact && showNames {
            for section in geometry.sections where section.center.count >= 3 {
                let point = FloorPlanGeometry.transform(
                    point: PlanPoint(x: CGFloat(section.center[0]), y: CGFloat(section.center[2])),
                    bounds: bounds,
                    canvas: size
                )
                context.draw(Text(section.label.capitalized).font(.caption.weight(.semibold)), at: point)
            }
        }
    }

    private func drawObjects(in context: inout GraphicsContext, size: CGSize, bounds: PlanBounds) {
        for object in geometry.objects where object.dimensions.count >= 3 {
            let matrix = object.transform.matrix
            let center = PlanPoint(x: CGFloat(matrix.columns.3.x), y: CGFloat(matrix.columns.3.z))
            let point = FloorPlanGeometry.transform(point: center, bounds: bounds, canvas: size)
            let width = FloorPlanGeometry.metersToPixels(CGFloat(object.dimensions[0]), bounds: bounds, canvas: size)
            let depth = FloorPlanGeometry.metersToPixels(CGFloat(object.dimensions[2]), bounds: bounds, canvas: size)
            let rect = CGRect(x: point.x - width / 2, y: point.y - depth / 2, width: width, height: depth)
            context.fill(Path(roundedRect: rect, cornerRadius: 3), with: .color(PropertyTwinColors.primary.opacity(0.1)))
            context.stroke(Path(roundedRect: rect, cornerRadius: 3), with: .color(PropertyTwinColors.primary.opacity(0.3)), lineWidth: 1)
        }
    }
}
