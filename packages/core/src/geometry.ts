import {
  DEFAULT_CURVATURE,
  DEFAULT_CURVE_ANGLE_BLEND,
  DEFAULT_CURVE_ANGLE_MAX_OFFSET_DEG,
  DEFAULT_CURVE_MAX_REACH,
  DEFAULT_CURVE_MIN_REACH,
  DEFAULT_PORT_OFFSET,
} from './params'
import { VLFixedSideEnum } from './enums'
import type { FixedSide } from './types'

export interface Point {
  x: number
  y: number
}

const NORMALS: Record<FixedSide, Point> = {
  [VLFixedSideEnum.TOP]: { x: 0, y: -1 },
  [VLFixedSideEnum.RIGHT]: { x: 1, y: 0 },
  [VLFixedSideEnum.BOTTOM]: { x: 0, y: 1 },
  [VLFixedSideEnum.LEFT]: { x: -1, y: 0 },
}

const ALL_SIDES: readonly FixedSide[] = [
  VLFixedSideEnum.TOP,
  VLFixedSideEnum.RIGHT,
  VLFixedSideEnum.BOTTOM,
  VLFixedSideEnum.LEFT,
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Every knob affecting a bezier connection's shape — all overridable per
 * connection (`ConnectionStyle`) or instance-wide (`VisualLinkerOptions`),
 * since what reads as "too straight" or "too curvy" depends entirely on a
 * given diagram's block spacing and density; one hardcoded feel can't fit
 * every layout.
 */
export interface CurveGeometryOptions {
  /** Control-point reach as a fraction of the distance between endpoints, before the min/max clamp. default 0.5 */
  curvature: number
  /** Floor on control-point reach, in px, regardless of distance. default 24 */
  minReach: number
  /** Ceiling on control-point reach, in px, regardless of distance. default 160 */
  maxReach: number
  /**
   * How far (0..1) the exit/entry angle leans toward the other endpoint, as a
   * fraction of its raw gap from the side's strict normal. 0 = always exactly
   * perpendicular to the border (can look kinked at the target); 1 = fully
   * aligns to the target (loses all curvature on an already-near-aligned
   * connection). default 0.55
   */
  angleBlend: number
  /** Absolute ceiling, in radians, on that lean regardless of `angleBlend` — mainly relevant with a narrowed `side` candidate list, where the raw gap can exceed the ~45° a full 4-side 'auto' pick ever produces. default 30° */
  maxAngleOffsetRad: number
}

export const DEFAULT_CURVE_GEOMETRY: CurveGeometryOptions = {
  curvature: DEFAULT_CURVATURE,
  minReach: DEFAULT_CURVE_MIN_REACH,
  maxReach: DEFAULT_CURVE_MAX_REACH,
  angleBlend: DEFAULT_CURVE_ANGLE_BLEND,
  maxAngleOffsetRad: (DEFAULT_CURVE_ANGLE_MAX_OFFSET_DEG * Math.PI) / 180,
}

function angleOf(vector: Point): number {
  return Math.atan2(vector.y, vector.x)
}

/** Wraps an angle difference to (-π, π], so a 350° "delta" reads as -10°, not a near-full turn. */
function wrapAngle(radians: number): number {
  const twoPi = Math.PI * 2
  const wrapped = ((radians + Math.PI) % twoPi) - Math.PI
  return wrapped <= -Math.PI ? wrapped + twoPi : wrapped
}

/**
 * The direction a connection actually leaves `from` through `side`: the
 * side's strict normal (perpendicular to the block's border), rotated a
 * fraction of the way toward wherever `to` really is (`angleBlend`, capped by
 * `maxAngleOffsetRad`). A line whose target sits well off to one side of the
 * port no longer has to snap to dead-on perpendicular right at the border and
 * then bend sharply to compensate — it leaves at a gentler, more natural
 * angle, and since the arrow marker's `orient="auto"` follows this exact
 * tangent, the arrowhead tilts to match instead of looking bolted on at a
 * mismatched angle. Never fully aligning to `to` (angleBlend < 1) keeps a
 * visible bow in the curve even on a long, mostly-diagonal connection.
 */
export function exitDirection(
  side: FixedSide,
  from: Point,
  to: Point,
  angleBlend: number = DEFAULT_CURVE_GEOMETRY.angleBlend,
  maxAngleOffsetRad: number = DEFAULT_CURVE_GEOMETRY.maxAngleOffsetRad,
): Point {
  const cardinalAngle = angleOf(NORMALS[side])
  const towardOtherAngle = angleOf({ x: to.x - from.x, y: to.y - from.y })
  const rawDelta = wrapAngle(towardOtherAngle - cardinalAngle)
  const delta = clamp(rawDelta * angleBlend, -maxAngleOffsetRad, maxAngleOffsetRad)
  const finalAngle = cardinalAngle + delta
  return { x: Math.cos(finalAngle), y: Math.sin(finalAngle) }
}

/**
 * Picks whichever `candidates` side's outward normal best faces `to` (highest
 * dot product with the direction to it) — i.e. the side the connection would
 * leave through most directly. With all four sides available this reduces to
 * comparing the dominant axis of travel; a narrower `candidates` list (e.g.
 * `['left', 'right']`) rules the others out even when they'd otherwise win.
 */
export function resolveAutoSide(from: Point, to: Point, candidates: readonly FixedSide[] = ALL_SIDES): FixedSide {
  const options = candidates.length > 0 ? candidates : ALL_SIDES
  const dx = to.x - from.x
  const dy = to.y - from.y

  let best = options[0]!
  let bestScore = -Infinity
  for (const side of options) {
    const normal = NORMALS[side]
    const score = normal.x * dx + normal.y * dy
    if (score > bestScore) {
      bestScore = score
      best = side
    }
  }
  return best
}

/** Point on a rect's edge for the given side, offset 0..1 along that edge (0.5 = center). */
export function sidePoint(rect: DOMRect, side: FixedSide, offset: number = DEFAULT_PORT_OFFSET): Point {
  switch (side) {
    case VLFixedSideEnum.TOP:
      return { x: rect.left + rect.width * offset, y: rect.top }
    case VLFixedSideEnum.BOTTOM:
      return { x: rect.left + rect.width * offset, y: rect.top + rect.height }
    case VLFixedSideEnum.LEFT:
      return { x: rect.left, y: rect.top + rect.height * offset }
    case VLFixedSideEnum.RIGHT:
      return { x: rect.left + rect.width, y: rect.top + rect.height * offset }
  }
}

/**
 * Point on `anchorRect`'s edge for the given side, positioned to align with
 * wherever `targetRect` actually sits along that edge (clamped to the
 * anchor's own span). Used when a port's connector should visually sit on a
 * different block's border than the element it's logically attached to
 * (`PortDescriptor.anchorBlockId`), while still preserving that element's
 * real position relative to any siblings anchored to the same border.
 */
export function projectedSidePoint(anchorRect: DOMRect, side: FixedSide, targetRect: DOMRect): Point {
  const targetCenter = { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 }
  switch (side) {
    case VLFixedSideEnum.TOP:
      return { x: clamp(targetCenter.x, anchorRect.left, anchorRect.right), y: anchorRect.top }
    case VLFixedSideEnum.BOTTOM:
      return { x: clamp(targetCenter.x, anchorRect.left, anchorRect.right), y: anchorRect.top + anchorRect.height }
    case VLFixedSideEnum.LEFT:
      return { x: anchorRect.left, y: clamp(targetCenter.y, anchorRect.top, anchorRect.bottom) }
    case VLFixedSideEnum.RIGHT:
      return { x: anchorRect.left + anchorRect.width, y: clamp(targetCenter.y, anchorRect.top, anchorRect.bottom) }
  }
}

/**
 * Cubic bezier `d` attribute. Control points are pulled out along each
 * endpoint's angle-biased exit direction (see `exitDirection`), so connections
 * sharing one port naturally fan out toward their own target instead of
 * overlapping past the anchor, and each one leaves/arrives at an angle that
 * favors its actual target over a rigidly perpendicular border crossing.
 */
export function bezierPath(
  from: Point,
  fromSide: FixedSide,
  to: Point,
  toSide: FixedSide,
  geometry: CurveGeometryOptions = DEFAULT_CURVE_GEOMETRY,
): string {
  const distance = Math.max(Math.hypot(to.x - from.x, to.y - from.y), 1)
  const reach = clamp(distance * geometry.curvature, geometry.minReach, geometry.maxReach)
  const fromDir = exitDirection(fromSide, from, to, geometry.angleBlend, geometry.maxAngleOffsetRad)
  const toDir = exitDirection(toSide, to, from, geometry.angleBlend, geometry.maxAngleOffsetRad)
  const c1 = { x: from.x + fromDir.x * reach, y: from.y + fromDir.y * reach }
  const c2 = { x: to.x + toDir.x * reach, y: to.y + toDir.y * reach }
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`
}

export function straightPath(from: Point, to: Point): string {
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
}
