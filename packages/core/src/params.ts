import { VLConnectionCurveEnum } from './enums'
import type { ConnectionCurve } from './types'

/**
 * Every default value used by the engine, gathered in one place. Each one is
 * independently overridable per-connection or per-instance wherever the
 * public API exposes it (`ConnectionStyle` / `VisualLinkerConfig`) — this
 * file only holds what applies when nothing else was specified, so tuning
 * the "out of the box" feel never means hunting through geometry/markers/
 * svg-layer/visual-linker for a magic number.
 */

// --- Curve geometry (geometry.ts: bezierPath / exitDirection) ---
// Mirrored as ConnectionStyle.curvature/curveMinReach/curveMaxReach/
// curveAngleBlend/curveAngleMaxOffset and VisualLinkerConfig.lines.bezier

/** Control-point reach as a fraction of the distance between endpoints, before the min/max clamp. */
export const DEFAULT_CURVATURE = 0.5
/** Floor on control-point reach, in px, regardless of distance. */
export const DEFAULT_CURVE_MIN_REACH = 24
/** Ceiling on control-point reach, in px, regardless of distance — the main "how bowed can it get" knob for long connections. */
export const DEFAULT_CURVE_MAX_REACH = 160
/** How far (0..1) the exit/entry angle leans toward the other endpoint, as a fraction of its raw gap from the side's strict normal. */
export const DEFAULT_CURVE_ANGLE_BLEND = 0.55
/** Absolute ceiling, in degrees, on that lean regardless of the blend factor. */
export const DEFAULT_CURVE_ANGLE_MAX_OFFSET_DEG = 30

// --- Orthogonal routing (orthogonal.ts: curve: 'smoothstep') ---

/** Corner radius, in px, for smoothstep's rounded 90° bends and branch points. */
export const DEFAULT_CORNER_RADIUS = 8
/**
 * Ceiling, in px, on how far a shared trunk extends before splitting at a
 * branch point (only relevant for a group of 2+ connections sharing a port —
 * a solo connection never branches at all, so this never affects it). Without
 * a cap, "branch at the nearest sibling's own coordinate" can stretch the
 * trunk all the way to a shared target column when siblings tie along that
 * axis, making unrelated port groups visually merge into what looks like one
 * continuous line.
 */
export const DEFAULT_MAX_TRUNK_REACH = 48

// --- Engine-wide behavior (visual-linker.ts: VisualLinkerConfig fallbacks) ---

export const DEFAULT_CURVE_TYPE: ConnectionCurve = VLConnectionCurveEnum.BEZIER
/** Renders a small circle marker at each resolved port when a connection doesn't request its own start/endMarker. */
export const DEFAULT_SHOW_PORTS = true
/** Whether a block can be dragged by pointer unless overridden per-block. */
export const DEFAULT_DRAGGABLE = false
/** Position along a port's side, or along a default (unspecified) port's own border, 0..1 (0.5 = center). */
export const DEFAULT_PORT_OFFSET = 0.5
/** `PortSpreadOptions.gap` default — px between neighbouring virtual ports of a spread port side. */
export const DEFAULT_PORT_SPREAD_GAP = 16
/** `PortSpreadOptions.padding` default — px kept clear between the outermost virtual ports and the block corners. */
export const DEFAULT_PORT_SPREAD_PADDING = 8

// --- Markers (markers.ts) ---
// Each has a matching VisualLinkerConfig.markers.sizes field
// (visual-linker.ts) for an instance-wide override, on top of the existing
// per-connection MarkerConfig.size.

/** Default marker size for the built-in 'circle' shape, as a multiple of the connection's current stroke width. */
export const DEFAULT_CIRCLE_MARKER_SIZE = 6
/** Default marker size for the built-in 'square' shape, as a multiple of the connection's current stroke width. */
export const DEFAULT_SQUARE_MARKER_SIZE = 6
/** Default marker size for the built-in 'diamond' shape, as a multiple of the connection's current stroke width. */
export const DEFAULT_DIAMOND_MARKER_SIZE = 6
/** Default marker size for 'arrow', as a multiple of the connection's current stroke width. */
export const DEFAULT_ARROW_MARKER_SIZE = 6
/** Side length of the square viewBox every built-in marker shape is drawn in. */
export const MARKER_VIEWBOX = 20
/** The arrow's tip sits this many viewBox units in from the marker's trailing edge (not flush with it). */
export const ARROW_TIP_INSET = 1
/** Length of each of the arrow's two chevron arms, in viewBox units. */
export const ARROW_ARM_LENGTH = 10
/** Half the vertical opening between the arrow's two arms, in viewBox units. */
export const ARROW_HALF_SPAN = 6
/** Stroke width of the arrow's chevron lines, in viewBox units (scales with the rest of the marker). */
export const ARROW_STROKE_WIDTH = 3
/** Radius of the built-in 'circle' marker, in viewBox units. */
export const CIRCLE_MARKER_RADIUS = 6
/** Inset from the viewBox edge for the built-in 'square' marker (on all four sides). */
export const SQUARE_MARKER_INSET = 4
/** Inset from the viewBox edge for the built-in 'diamond' marker's four points. */
export const DIAMOND_MARKER_INSET = 2
/** Outline width, in viewBox units, for a built-in circle/square/diamond marker whose `strokeColor` is set but `strokeWidth` isn't. */
export const DEFAULT_MARKER_STROKE_WIDTH = 1

// --- SVG default look (svg-layer.ts: DEFAULT_STYLE CSS custom-property fallbacks) ---
// Each has a matching `--vl-*` CSS variable a consumer can override from outside
// without touching these — see TECH_SPEC.md §7. The DEFAULT_PORT_* constants
// are also each mirrored by a VisualLinkerConfig.ports field
// (visual-linker.ts), for a typed JS-level override instead of plain CSS.

export const DEFAULT_LINE_COLOR = '#2e8b57'
export const DEFAULT_LINE_WIDTH = 1.5
/** Added to the resolved stroke width while `.vl-connection--active` (hover/highlight) applies and no per-connection `hoverStyle.width` overrides it. */
export const ACTIVE_LINE_WIDTH_BUMP = 1.5
/** Halo color around a selected or keyboard-focused connection (`--vl-selected-color` / `--vl-focus-color` override it from CSS). */
export const DEFAULT_SELECTION_COLOR = '#1f6feb'
/** Width of the invisible, easier-to-hover stroke laid under every connection's visible line. */
export const HIT_AREA_STROKE_WIDTH = 16
export const DEFAULT_PORT_FILL = '#fff'
export const DEFAULT_PORT_STROKE_COLOR = DEFAULT_LINE_COLOR
export const DEFAULT_PORT_STROKE_WIDTH = 1.5
export const DEFAULT_PORT_RADIUS = 4
/** `stroke-dasharray` applied when a connection's `dashed` (or `hover.dashed`) is true. */
export const DASH_PATTERN = '6 4'

// --- Animated flow along a connection (flow.ts / svg-layer.ts) ---

/** Pattern speed, px per second. */
export const DEFAULT_FLOW_SPEED = 60
export const DEFAULT_FLOW_DASH = 8
export const DEFAULT_FLOW_GAP = 14
/** Gap between dots for `shape: 'dots'` (the dash itself is `FLOW_DOT_LENGTH` — a round cap makes the circle). */
export const DEFAULT_FLOW_DOT_GAP = 12
export const FLOW_DOT_LENGTH = 0.01
/** Tint mode (no explicit `color`): the line underneath is dimmed to this opacity so the moving pattern, in the line's own color, stands out. */
export const FLOW_TINT_BASE_OPACITY = 0.35
/** Same, while the connection is hovered or selected. */
export const FLOW_TINT_BASE_OPACITY_ACTIVE = 0.7
/** With an explicit flow `color` the pattern is a highlight on the line: its width as a fraction of the line's own (dashes)… */
export const FLOW_WIDTH_RATIO = 0.6
/** …and for dots, with a floor so they stay visible on thin lines. */
export const FLOW_DOT_WIDTH_RATIO = 1.2
export const FLOW_DOT_MIN_WIDTH = 2.5
/** Tint-mode dots: a bit wider than the line so they read as beads on it. */
export const FLOW_TINT_DOT_WIDTH_RATIO = 1.6
export const FLOW_TINT_DOT_MIN_WIDTH = 3

// --- Connection labels (path-sampling.ts / svg-layer.ts) ---

/** How far from the endpoint a `'start'`/`'end'` label sits, px along the path (capped at half the path). */
export const LABEL_END_INSET = 24
/** Horizontal/vertical padding around a built-in text label, px. */
export const LABEL_PADDING_X = 6
export const LABEL_PADDING_Y = 3
export const LABEL_FONT_SIZE = 11
/** Used to size a built-in label when text can't be measured (no layout engine). */
export const LABEL_FALLBACK_CHAR_WIDTH = 6.4

// --- Obstacle avoidance for 'smoothstep' (routing.ts / visual-linker.ts) ---

/** Default clearance kept between a routed line and every other block, px. */
export const DEFAULT_OBSTACLE_PADDING = 12
/** Only blocks within this many px of a connection's bounding box are considered obstacles for it — keeps the search small on big diagrams. */
export const ROUTE_REGION_MARGIN = 240

// --- Line jumps / bridges at crossings (jumps.ts) ---

/** Radius of the semicircular hop a line makes over a line it crosses, px. */
export const DEFAULT_JUMP_RADIUS = 5
