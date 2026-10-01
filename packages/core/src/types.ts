import { VLConnectionCurveEnum, VLMarkerShapeEnum, VLFixedSideEnum, VLOrientEnum } from './enums'
import type { Point } from './geometry'

export type FixedSide = VLFixedSideEnum.TOP | VLFixedSideEnum.RIGHT | VLFixedSideEnum.BOTTOM | VLFixedSideEnum.LEFT
export type PortSide = FixedSide | VLFixedSideEnum.AUTO

export interface PortDescriptor {
  id: string
  /** CSS selector or element inside block.el. Omitted => the port sits on the block's own border. */
  target?: string | HTMLElement
  /**
   * default 'auto' — resolved from the other endpoint's position each render,
   * picking whichever side best faces it. A `FixedSide[]` narrows that choice
   * to a subset (e.g. `['left', 'right']` to rule out top/bottom exits entirely).
   */
  side?: PortSide | FixedSide[]
  /** Position along the side, 0..1 (0.5 = center). Ignored when `anchorBlockId` is set. default 0.5 */
  offset?: number
  /**
   * Renders this port's connector point on another registered block's border
   * instead of `target`'s own — useful when `target` is a child nested well
   * inside a container (e.g. a row inside a group block) but the connection
   * should visually leave from the container's own edge instead. The point
   * still tracks `target`'s actual position, projected onto the anchor
   * block's border (clamped to it), so siblings anchored to the same block
   * keep their relative order instead of collapsing to one spot. Side
   * resolution (including 'auto') is based on the anchor block, not `target`.
   * Ignored when `anchorEl` is also set.
   */
  anchorBlockId?: string
  /**
   * Like `anchorBlockId`, but anchors directly to a given element instead of
   * a registered block's own `el` — for anchoring to an element that isn't
   * (or isn't yet) one of the engine's registered blocks. Takes precedence
   * over `anchorBlockId` when both are set.
   */
  anchorEl?: HTMLElement
  /** Overrides the block's `portSpread` for this port only. `false` turns spreading off here even when the block enables it. */
  spread?: PortSpread
}

/**
 * Spreading of connections that share one port side: instead of all meeting
 * at one point, each gets its own "virtual port" along that side, `gap` px
 * apart, centered on the port's own point and ordered by where each
 * connection's other end is (so lines don't cross). If the row of virtual
 * ports wouldn't fit inside the side minus `padding` at both ends, the gap
 * shrinks until it does. Works the same on horizontal and vertical sides.
 */
export interface PortSpreadOptions {
  /** Distance between neighbouring virtual ports, px. default 16 */
  gap?: number
  /** Minimum distance from the outermost virtual ports to the side's ends (the block's corners), px. default 8 */
  padding?: number
}

/** `true` spreads with the defaults, an object tunes it, `false` explicitly disables an inherited setting. */
export type PortSpread = boolean | PortSpreadOptions

/** Inset, in px, from each edge of the reference box a `DragBounds` box is measured against — e.g. `{ top: 16 }` shrinks just the top edge by 16px. Unset edges default to 0 (flush with the reference box). */
export interface DragBoundsInset {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

/**
 * Confines a draggable block's position to a box, clamped so the block's own
 * rect never leaves it (rather than just its reference point):
 * - `'container'` — the engine's own container element.
 * - `HTMLElement` — an arbitrary element's box (e.g. a dedicated drop-zone
 *   div elsewhere in the layout, not necessarily the container itself).
 * - `DragBoundsInset` — the container's own box, shrunk by these paddings.
 *
 * Set instance-wide via `VisualLinkerOptions.dragBounds`, or per block via
 * `BlockDescriptor.dragBounds` (wins when both are set). Unset on both =>
 * unconstrained, the pre-existing behavior.
 */
export type DragBounds = 'container' | HTMLElement | DragBoundsInset

export interface BlockDescriptor {
  id: string
  el: HTMLElement
  /** Explicit ports. Omitted => connections anchor to the block's own border with side: 'auto'. */
  ports?: PortDescriptor[]
  /** Overrides the instance-level `draggable` option for this block. */
  draggable?: boolean
  /** CSS selector, or an element inside `el`, for the drag handle. Omitted => the whole block starts a drag. */
  dragHandle?: string | HTMLElement
  /** Overrides the instance-level `dragBounds` option for this block. */
  dragBounds?: DragBounds
  /** Spreads connections sharing a port side of this block into separate virtual ports — see `PortSpreadOptions`. Overrides `defaultPortSpread`; a port's own `spread` overrides this. */
  portSpread?: PortSpread
}

export type ConnectionCurve =
  VLConnectionCurveEnum.BEZIER | VLConnectionCurveEnum.STRAIGHT | VLConnectionCurveEnum.SMOOTHSTEP

export type MarkerShape =
  VLMarkerShapeEnum.CIRCLE | VLMarkerShapeEnum.SQUARE | VLMarkerShapeEnum.DIAMOND | VLMarkerShapeEnum.ARROW

export interface MarkerConfig {
  /** Built-in shape. Ignored when `svg` is set. default 'circle' */
  shape?: MarkerShape
  /** Marker size, as a multiple of the connection's current stroke width (so it scales with a thicker/hovered line). default 4, or 6 for 'arrow' */
  size?: number
  /** Fill color for a built-in shape (ignored by `'arrow'`, which has no fill — see `strokeColor`). default follows the connection's own `color`. */
  color?: string
  /**
   * Outline color for a built-in `'circle'`/`'square'`/`'diamond'` shape —
   * unset by default (no outline), matching a plain filled marker. Also the
   * knob behind the built-in port dot's own outline: see
   * `VisualLinkerOptions.defaultPortStrokeColor` for its instance-wide default.
   * Has no effect on `'arrow'`, which already uses `color` as its one stroke.
   */
  strokeColor?: string
  /** Outline width, in the marker's own viewBox units (scales with `size` like everything else in the marker). Ignored when `strokeColor` is unset. default 1 */
  strokeWidth?: number
  /** CSS class added to the marker's root SVG element, for full custom styling via external CSS. */
  className?: string
  /**
   * Raw inner SVG markup for a fully custom marker (overrides `shape`), drawn in a
   * `0 0 20 20` viewBox centered on the connection endpoint, e.g. `'<path d="M2,2 L18,18" />'`.
   * Inserted as-is — only pass markup you trust, never unsanitized user input.
   */
  svg?: string
  /** 'auto' rotates the marker to follow the line's direction (used by the built-in 'arrow'); 'fixed' keeps it upright. default follows `shape` */
  orient?: VLOrientEnum.AUTO | VLOrientEnum.FIXED
  /**
   * Also draws an arrowhead on the line right before this shape, its tip
   * touching the shape's outer edge (outline included) — a port dot and a
   * direction arrow in one. `true`, or `MarkerArrowConfig` to tune it.
   * Forces `orient: 'auto'` so the arrow follows the line. Ignored when
   * `shape` is `'arrow'` itself.
   */
  arrow?: boolean | MarkerArrowConfig
}

export interface MarkerArrowConfig {
  /** default follows the connection's own `color` (not the shape's fill) */
  color?: string
  /**
   * Extra space between the arrow's tip and the shape's edge, in the
   * marker's 20-unit viewBox. For a custom `svg` marker (whose edge can't be
   * measured) this is the distance from the endpoint itself. default 0
   */
  gap?: number
}

export interface ConnectionStyle {
  curve?: ConnectionCurve
  color?: string
  width?: number
  dashed?: boolean
  /** Control-point reach as a fraction of the distance between endpoints, before the min/max reach clamp. default 0.5 (or the instance's `defaultCurvature`) */
  curvature?: number
  /** Floor on control-point reach, in px, regardless of distance. default 24 (or the instance's `defaultCurveMinReach`) */
  curveMinReach?: number
  /** Ceiling on control-point reach, in px, regardless of distance — the main "how bowed can it get" knob for long connections. default 160 (or the instance's `defaultCurveMaxReach`) */
  curveMaxReach?: number
  /** How far (0..1) the exit/entry angle leans toward the other endpoint instead of staying perpendicular to the border; 0 disables the lean entirely, 1 fully aligns to the target (flattens an already-near-aligned connection). default 0.55 (or the instance's `defaultCurveAngleBlend`) */
  curveAngleBlend?: number
  /** Absolute ceiling, in degrees, on that lean regardless of `curveAngleBlend`. default 30 (or the instance's `defaultCurveAngleMaxOffset`) */
  curveAngleMaxOffset?: number
  /**
   * Corner radius, in px, for `curve: 'smoothstep'`'s rounded 90° bends —
   * including the rounded branch point where connections sharing a port
   * split off a common trunk (see `VisualLinkerOptions.defaultCornerRadius`).
   * default 8
   */
  cornerRadius?: number
  /**
   * For `curve: 'smoothstep'` only, and only when this connection shares a
   * port+side with at least one sibling: caps how far their shared trunk
   * extends before splitting. When siblings tie on the trunk axis (e.g. two
   * targets in the same column), an uncapped trunk would stretch all the way
   * to that shared column; capping it keeps each port's fan-out visually
   * distinct instead of merging into neighboring ports' lines. Has no effect
   * on a connection with no sibling (nothing to branch from). When siblings
   * disagree, the group uses the smallest of their `maxTrunkReach` values.
   * default 48 (or the instance's `defaultMaxTrunkReach`)
   */
  maxTrunkReach?: number
  /**
   * Marker at the connection's start point. Shorthand for `{ shape }`.
   * `false` suppresses the built-in port dot at this end WITHOUT drawing any
   * native marker either, leaving a bare point — for when a Vue `#marker`
   * slot (or nothing at all) should be the only thing rendered there, instead
   * of layering under it the way an unset `startMarker` normally would.
   */
  startMarker?: MarkerShape | MarkerConfig | false
  /** Marker at the connection's end point — `'arrow'` shows the connection's direction. `false` behaves like `startMarker: false` (see there). */
  endMarker?: MarkerShape | MarkerConfig | false
  /**
   * Overrides applied while this connection is hovered or highlighted (see
   * `connection:mouseenter`/hovering an incident block) — each field falls back to
   * the base value above when omitted. Omitting `hoverStyle` entirely keeps the
   * default look: a width bump (via `.vl-connection--active`, or inline when
   * the connection has an explicit `width`).
   */
  hoverStyle?: {
    color?: string
    width?: number
    dashed?: boolean
    /**
     * Overrides `startMarker`/`endMarker`'s `size` while hovered, on top of
     * (not instead of) the automatic strokeWidth-linked growth every marker
     * already gets for free when `width` bumps up the line. Has no effect on
     * an endpoint with no `startMarker`/`endMarker` set at all (the built-in
     * port dot doesn't resize on hover).
     */
    markerSize?: number
  }
  /**
   * Overrides applied while this connection is selected (see
   * `VisualLinkerOptions.selectable`) — same fields as `hoverStyle`, layered
   * between the base style and `hoverStyle` (hover wins while both apply).
   * Omitted => the default selected look: the same width bump a hover gets,
   * plus a halo (`--vl-selected-color`).
   */
  selectedStyle?: NonNullable<ConnectionStyle['hoverStyle']>
  /**
   * Animates a pattern along the line, from `from` towards `to` — dashes or
   * dots that show direction and "live" traffic. `true` takes the defaults, an
   * object tunes them, `false` turns off a `defaultAnimated`. Drawn as a
   * separate overlay on top of the line (so it composes with `dashed`,
   * `hoverStyle` and markers), CSS-only, and disabled for users who prefer
   * reduced motion. default off (or the instance's `defaultAnimated`)
   */
  animated?: boolean | ConnectionFlow
  /** Route this `smoothstep` connection around other blocks (overrides the instance's `avoidObstacles`). */
  avoidObstacles?: boolean
  /** Hop over the lines this `smoothstep` connection crosses (overrides the instance's `jumps`; `false` opts out). See `VisualLinkerOptions.jumps`. */
  jumps?: JumpsOption
}

/** `true` for the default hop (radius 5px), or `{ radius }`. */
export type JumpsOption = boolean | { radius?: number }

export interface ConnectionFlow {
  /** Pattern speed, px per second. default 60 */
  speed?: number
  /** `'forward'` runs from `from` to `to`. default 'forward' */
  direction?: 'forward' | 'backward'
  /** `'dashes'` (default) or round `'dots'`. */
  shape?: 'dashes' | 'dots'
  /** Dash length, px (ignored for dots). default 8 */
  dash?: number
  /** Distance between dashes/dots, px. default 14 (12 for dots) */
  gap?: number
  /**
   * Pattern color. Unset (the default) = "tint" mode: the pattern takes the
   * line's own color and the line underneath is dimmed, so it works on any
   * background. Set = drawn in this color over the unchanged line (pick one
   * that contrasts with it).
   */
  color?: string
  /** Stroke width, px. default: the line's width in tint mode; 60% of it (dots 120%, at least 2.5px) with an explicit `color` */
  width?: number
}

export interface ConnectionEndpoint {
  blockId: string
  portId?: string
}

export interface ConnectionDescriptor {
  id: string
  from: ConnectionEndpoint
  to: ConnectionEndpoint
  style?: ConnectionStyle
  /** Accessible name of the line (`aria-label`). default: "Connection: {from block id} → {to block id}" */
  ariaLabel?: string
  /**
   * Labels placed along the line — any number, anywhere on it. A label with
   * `text` is drawn by the library itself (an SVG pill); one without is
   * positioned for you in the `layout` event (and rendered by the Vue
   * `#connection-label` slot). Omit `labels` entirely to keep the single
   * `#connection-label` slot at the line's midpoint.
   */
  labels?: ConnectionLabel[]
}

export interface ConnectionLabel {
  /** Unique within the connection. */
  id: string
  /**
   * Where along the line: `'start'`/`'end'` sit a short distance in from that
   * endpoint (clear of its marker), `'middle'` halfway, a number is a fraction
   * of the line's length (0..1).
   */
  position: 'start' | 'middle' | 'end' | number
  /** Distance from the line, px, along its normal — positive is to the right of the direction of travel (below a rightward line). default 0 */
  offset?: number
  /** Text for a library-drawn label. Without it the label is just a position for your own content. */
  text?: string
  /** CSS class added to a library-drawn label's `<g>` (style the pill via `.vl-label-bg` / `.vl-label-text`). */
  className?: string
  /** Rotate the label to follow the line (kept upright, never upside down). default false */
  rotate?: boolean
}

/** A resolved label position for the current render — see `ConnectionLayout.labels`. */
export interface LabelLayout {
  id: string
  /** Where to center the label (the line's point plus `offset` along the normal). */
  point: Point
  /** Degrees, direction of travel along the line at that point. */
  angle: number
  /** Degrees to rotate the label by: the upright version of `angle` when `rotate` is set, else 0. */
  rotation: number
  text?: string
  className?: string
}

export interface VisualLinkerOptions {
  /** default 'bezier' */
  defaultCurve?: ConnectionCurve
  /** Instance-wide default for `ConnectionStyle.curvature`, overridable per connection. default 0.5 */
  defaultCurvature?: number
  /** Instance-wide default for `ConnectionStyle.curveMinReach`, overridable per connection. default 24 */
  defaultCurveMinReach?: number
  /** Instance-wide default for `ConnectionStyle.curveMaxReach`, overridable per connection. default 160 */
  defaultCurveMaxReach?: number
  /** Instance-wide default for `ConnectionStyle.curveAngleBlend`, overridable per connection. default 0.55 */
  defaultCurveAngleBlend?: number
  /** Instance-wide default for `ConnectionStyle.curveAngleMaxOffset` (degrees), overridable per connection. default 30 */
  defaultCurveAngleMaxOffset?: number
  /** Instance-wide default for `ConnectionStyle.cornerRadius`, overridable per connection. default 8 */
  defaultCornerRadius?: number
  /** Instance-wide default for `ConnectionStyle.maxTrunkReach`, overridable per connection. default 48 */
  defaultMaxTrunkReach?: number
  /** Renders a small circle marker at each resolved port. default true */
  showPorts?: boolean
  /** Instance-wide radius, in px, of the built-in port dot (`showPorts`). default 4 */
  defaultPortRadius?: number
  /** Instance-wide fill color of the built-in port dot. default '#fff' */
  defaultPortColor?: string
  /** Instance-wide outline color of the built-in port dot. default follows `--vl-line-color` */
  defaultPortStrokeColor?: string
  /** Instance-wide outline width, in px, of the built-in port dot. default 1.5 */
  defaultPortStrokeWidth?: number
  /**
   * Instance-wide default for `MarkerConfig.size` on a `'circle'`-shaped
   * marker (built-in or via the `'circle'` shorthand), overridable per
   * connection via `startMarker`/`endMarker`. A multiple of the connection's
   * current stroke width, like `size` itself. default 6
   */
  defaultCircleMarkerSize?: number
  /** Instance-wide default for `MarkerConfig.size` on a `'square'`-shaped marker, overridable per connection. default 6 */
  defaultSquareMarkerSize?: number
  /** Instance-wide default for `MarkerConfig.size` on a `'diamond'`-shaped marker, overridable per connection. default 6 */
  defaultDiamondMarkerSize?: number
  /** Instance-wide default for `MarkerConfig.size` on an `'arrow'`-shaped marker, overridable per connection. default 6 */
  defaultArrowMarkerSize?: number
  /** Lets every block be dragged by pointer unless overridden per-block. default false */
  draggable?: boolean
  /**
   * Snaps every draggable block's absolute page position to a shared px grid
   * while dragging (like a design tool's grid), rather than the raw pointer
   * delta — so blocks moved independently still land on the same lines.
   * Omitted or 0 disables snapping entirely (free movement). default undefined
   */
  dragGridSize?: number
  /** Instance-wide default for `BlockDescriptor.dragBounds`, overridable per block. default undefined (unconstrained) */
  dragBounds?: DragBounds
  /** Instance-wide default for `BlockDescriptor.portSpread`, overridable per block and per port. default undefined (connections share one point) */
  defaultPortSpread?: PortSpread
  /**
   * What to do with a connection end whose port sits inside a clipping
   * ancestor (an `overflow: auto/hidden/scroll/clip` element between the
   * port's element and the container) but has been scrolled out of view:
   * `'pin'` (`true`, the default) pulls that end to the edge of the visible
   * area — the line "continues off-screen" — and drops its marker and port dot;
   * `'hide'` hides the whole connection; `false` ignores clipping entirely
   * (the line is drawn all the way to the invisible block, over whatever lies there).
   */
  clipToScrollParents?: boolean | 'pin' | 'hide'
  /**
   * Makes connections selectable and keyboard-operable: each becomes a
   * focusable button (Tab order = `connections` order); click or Enter/Space
   * selects it (Ctrl/Cmd/Shift-click or the same keys toggle it within a
   * multi-selection); Escape or a click anywhere else clears the selection;
   * Delete/Backspace emits `connection:delete-request` — the library never
   * removes data itself. Selection changes emit `connection:selectionchange`;
   * `setSelectedConnections()` sets it programmatically (controlled use).
   * default false
   */
  selectable?: boolean
  /** Instance-wide default for `ConnectionStyle.animated`, overridable per connection (`animated: false` opts one out). default off */
  defaultAnimated?: boolean | ConnectionFlow
  /**
   * Routes `curve: 'smoothstep'` connections around the other blocks instead of
   * through them (A* over the blocks' padded edges, fewest turns first).
   * Blocks that are an endpoint of the connection — or contain/are contained
   * by one — are not obstacles. A connection whose plain route is already
   * clear is left exactly as it was; when no route exists the plain one is
   * kept. Only blocks within ~240px of a connection are considered. default false
   */
  avoidObstacles?: boolean
  /** Clearance kept between a routed line and every other block, px. default 12 */
  obstaclePadding?: number
  /**
   * Draws a small semicircular hop where a `smoothstep` line crosses another
   * connection's line, like on electrical schematics — the line with the
   * horizontal stretch hops over the vertical one. Lines running along each
   * other (a shared trunk), T-junctions and crossings too close to a bend are
   * not hopped. Overridable per connection via `ConnectionStyle.jumps`.
   * default false
   */
  jumps?: JumpsOption
}

/** A connection's resolved geometry for the current render — for positioning arbitrary overlay content (e.g. a label or a custom marker) without re-deriving the curve math. */
export interface ConnectionLayout {
  id: string
  from: Point
  to: Point
  /** The point at the middle of the connection's actual drawn path (curve-aware — not just the from/to midpoint). */
  mid: Point
  /** Degrees, direction of travel along the path at `from` — matches what a native SVG `marker-start` with `orient="auto"` would compute. */
  fromAngle: number
  /** Degrees, direction of travel along the path arriving at `to` — matches what a native SVG `marker-end` with `orient="auto"` would compute. */
  toAngle: number
  /** Every `ConnectionDescriptor.labels` entry, resolved to a position on the line (empty without `labels`). */
  labels: LabelLayout[]
  /** True when `from` was pulled to the edge of a clipping ancestor (see `clipToScrollParents`) — the real port is out of view, so a custom marker there should not be drawn. */
  fromClipped?: boolean
  /** Same as `fromClipped`, for `to`. */
  toClipped?: boolean
}

/**
 * A resolved port's position for the current render — for positioning custom
 * `#port` slot content instead of (or, with `showPorts`, alongside) the
 * built-in dot. Excludes any endpoint that has an explicit `startMarker`/
 * `endMarker`, matching the dot's own suppression rule. Deduped by physical
 * point rather than `(blockId, portId)`: an `'auto'`-side port can resolve to
 * a different point per connection, and each distinct point gets its own entry.
 */
export interface PortLayout {
  /** Stable key for list rendering — `{blockId}:{roundedX}:{roundedY}`. */
  key: string
  blockId: string
  portId?: string
  point: Point
}

export interface VisualLinkerEventMap {
  'block:dragstart': { blockId: string }
  'block:drag': { blockId: string; x: number; y: number }
  'block:dragend': { blockId: string; x: number; y: number }
  'block:mouseenter': { blockId: string }
  'block:mouseleave': { blockId: string }
  'connection:click': { connection: ConnectionDescriptor }
  'connection:mouseenter': { connection: ConnectionDescriptor }
  'connection:mouseleave': { connection: ConnectionDescriptor }
  /** The set of selected connections changed (`selectable` mode) — fired for user input only, not for `setSelectedConnections()`. */
  'connection:selectionchange': { selectedIds: string[] }
  /** Delete/Backspace pressed on a focused connection: the selected ones (or just the focused one when it isn't selected). Nothing is removed — the app decides. */
  'connection:delete-request': { connections: ConnectionDescriptor[] }
  /** Fired at the end of every render pass with every connection's/port's resolved geometry — drives Vue's HTML overlay for connection labels and custom port content. */
  layout: { connections: ConnectionLayout[]; ports: PortLayout[] }
}
