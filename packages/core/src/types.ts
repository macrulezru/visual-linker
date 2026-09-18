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
}

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
   * default look (a CSS-driven width bump via `.vl-connection--active`).
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
  /** Fired at the end of every render pass with every connection's/port's resolved geometry — drives Vue's HTML overlay for connection labels and custom port content. */
  layout: { connections: ConnectionLayout[]; ports: PortLayout[] }
}
