import { VLConnectionCurveEnum, VLMarkerShapeEnum, VLFixedSideEnum, VLOrientEnum } from './enums'

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
  /** Position along the side, 0..1 (0.5 = center). default 0.5 */
  offset?: number
}

export interface BlockDescriptor {
  id: string
  el: HTMLElement
  /** Explicit ports. Omitted => connections anchor to the block's own border with side: 'auto'. */
  ports?: PortDescriptor[]
  /** Overrides the instance-level `draggable` option for this block. */
  draggable?: boolean
  /** CSS selector for the drag handle within `el`. Omitted => the whole block starts a drag. */
  dragHandle?: string
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
  /** Fill color for a built-in shape. default follows the connection's own `color`. */
  color?: string
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
  /** Marker at the connection's start point. Shorthand for `{ shape }`. */
  startMarker?: MarkerShape | MarkerConfig
  /** Marker at the connection's end point — `'arrow'` shows the connection's direction. */
  endMarker?: MarkerShape | MarkerConfig
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
  /** Lets every block be dragged by pointer unless overridden per-block. default false */
  draggable?: boolean
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
}
