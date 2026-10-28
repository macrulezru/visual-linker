import { VLFixedSideEnum } from './enums'
import type { FixedSide } from './types'
import { angleDeg, type Point } from './geometry'
import { DEFAULT_STUB } from './params'

type Axis = 'x' | 'y'

function sideAxis(side: FixedSide): Axis {
  return side === VLFixedSideEnum.LEFT || side === VLFixedSideEnum.RIGHT ? 'x' : 'y'
}

/** +1 if this side's outward normal points toward increasing x/y, -1 otherwise. */
function sideSign(side: FixedSide): 1 | -1 {
  return side === VLFixedSideEnum.RIGHT || side === VLFixedSideEnum.BOTTOM ? 1 : -1
}

/**
 * The perpendicular direction a trunk segment must turn to reach `towards`
 * once it's peeling off a shared branch point — e.g. a vertical trunk
 * (top/bottom) can only branch left or right, never continue vertically
 * (that's reserved for whichever sibling is `isNearest`, see `computeBranchInfo`).
 */
function perpendicularSideToward(trunkSide: FixedSide, from: Point, towards: Point): FixedSide {
  if (sideAxis(trunkSide) === 'y') return towards.x >= from.x ? VLFixedSideEnum.RIGHT : VLFixedSideEnum.LEFT
  return towards.y >= from.y ? VLFixedSideEnum.BOTTOM : VLFixedSideEnum.TOP
}

/**
 * Builds the polyline (before corner-rounding) connecting two directed
 * points: `from` must leave along `fromSide`'s normal, `to` must be entered
 * along `toSide`'s normal (i.e. approached from that side, moving opposite
 * to its normal). The route never doubles back through the block it leaves
 * or enters:
 * - Same point / already aligned on the shared axis → a single straight segment.
 * - Perpendicular axes, target ahead of the exit and approachable from its side → one 90° bend ("L").
 * - Opposite sides facing each other → two bends at the midpoint ("Z"/"S").
 * - Same side on both ends (right→right) → a trunk that runs outside both blocks ("C").
 * - Anything else (target behind the exit, entered from the far side) → goes out a `stub` (default 20px), around, and in ("S" with 4 bends).
 */
export function orthogonalPoints(
  from: Point,
  fromSide: FixedSide,
  to: Point,
  toSide: FixedSide,
  stub: number = DEFAULT_STUB,
): Point[] {
  const fromAxis = sideAxis(fromSide)
  const toAxis = sideAxis(toSide)
  const fs = sideSign(fromSide)
  const ts = sideSign(toSide)

  if (fromAxis === toAxis) {
    const horizontal = fromAxis === 'x'
    // p / q: the coordinate along the routing axis and the one across it
    const [p, q]: ['x' | 'y', 'x' | 'y'] = horizontal ? ['x', 'y'] : ['y', 'x']
    const at = (along: number, across: number): Point =>
      horizontal ? { x: along, y: across } : { x: across, y: along }

    const facingAhead = fs !== ts && (to[p] - from[p]) * fs > -0.5
    if (facingAhead && Math.abs(from[q] - to[q]) < 0.5) return [from, to]
    if (facingAhead) {
      const mid = (from[p] + to[p]) / 2
      return [from, at(mid, from[q]), at(mid, to[q]), to]
    }
    if (fs === ts) {
      // both ends on the same side: the trunk runs beyond whichever block sticks out further
      const trunk = fs > 0 ? Math.max(from[p], to[p]) + stub : Math.min(from[p], to[p]) - stub
      return [from, at(trunk, from[q]), at(trunk, to[q]), to]
    }
    // facing sides, but the target lies behind the exit: out, across, back in
    const outFrom = from[p] + fs * stub
    const outTo = to[p] + ts * stub
    const mid = (from[q] + to[q]) / 2
    return [from, at(outFrom, from[q]), at(outFrom, mid), at(outTo, mid), at(outTo, to[q]), to]
  }

  const horizontalFirst = fromAxis === 'x'
  // the exit runs along `a` (the from side's axis), the entry along `b`
  const [a, b]: ['x' | 'y', 'x' | 'y'] = horizontalFirst ? ['x', 'y'] : ['y', 'x']
  const at = (va: number, vb: number): Point => (horizontalFirst ? { x: va, y: vb } : { x: vb, y: va })
  if ((to[a] - from[a]) * fs > 0.5 && (from[b] - to[b]) * ts > 0.5) return [from, at(to[a], from[b]), to]
  // target behind the exit or approached from its far side: step out, then reach the entry's stub
  const exit = from[a] + fs * stub
  const entry = to[b] + ts * stub
  return [from, at(exit, from[b]), at(exit, entry), at(to[a], entry), to]
}

/**
 * Hops over crossing lines: where a horizontal segment crosses another
 * connection's vertical one it bulges into a small semicircle instead of
 * running straight through. `bySegment` maps a segment index of the polyline
 * (segment i runs from point i to point i + 1) to the x coordinates to hop at.
 */
export interface PathJumps {
  radius: number
  bySegment: ReadonlyMap<number, readonly number[]>
}

/** Emits the arcs along one straight run, in the direction of travel (the bulge always faces up). */
function appendJumps(parts: string[], from: Point, to: Point, xs: readonly number[] | undefined, radius: number) {
  if (!xs || radius <= 0 || Math.abs(from.y - to.y) > 0.01) return
  const direction = to.x >= from.x ? 1 : -1
  const ordered = [...xs].sort((a, b) => (a - b) * direction)
  let lastEnd = from.x
  for (const x of ordered) {
    const before = x - direction * radius
    const after = x + direction * radius
    // Only arcs that fit inside this run and clear the previous one.
    if ((before - lastEnd) * direction < 0 || (to.x - after) * direction < 0) continue
    parts.push(`L ${before} ${from.y}`, `A ${radius} ${radius} 0 0 ${direction > 0 ? 1 : 0} ${after} ${from.y}`)
    lastEnd = after
  }
}

/** Converts a straight-segment polyline into an SVG path with each interior corner rounded to `radius` (clamped to half the shorter adjoining segment), optionally hopping over crossings (`jumps`). */
export function roundedPolylinePath(points: Point[], radius: number, jumps?: PathJumps): string {
  if (points.length < 2) return ''
  const parts = [`M ${points[0]!.x} ${points[0]!.y}`]
  let cursor = points[0]!
  const rounded = points.length > 2 && radius > 0.5

  const runTo = (to: Point, segment: number) => {
    appendJumps(parts, cursor, to, jumps?.bySegment.get(segment), jumps?.radius ?? 0)
    parts.push(`L ${to.x} ${to.y}`)
    cursor = to
  }

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!
    const corner = points[i]!
    if (!rounded) {
      runTo(corner, i - 1)
      continue
    }
    const next = points[i + 1]!

    const inLength = Math.max(Math.hypot(corner.x - prev.x, corner.y - prev.y), 0.0001)
    const outLength = Math.max(Math.hypot(next.x - corner.x, next.y - corner.y), 0.0001)
    const r = Math.min(radius, inLength / 2, outLength / 2)

    const startOfCurve = {
      x: corner.x - ((corner.x - prev.x) * r) / inLength,
      y: corner.y - ((corner.y - prev.y) * r) / inLength,
    }
    const endOfCurve = {
      x: corner.x + ((next.x - corner.x) * r) / outLength,
      y: corner.y + ((next.y - corner.y) * r) / outLength,
    }

    runTo(startOfCurve, i - 1)
    parts.push(`Q ${corner.x} ${corner.y} ${endOfCurve.x} ${endOfCurve.y}`)
    cursor = endOfCurve
  }
  runTo(points[points.length - 1]!, points.length - 2)
  return parts.join(' ')
}

export interface BranchInfo {
  branchPoint: Point
  /** Whether this connection continues straight through the branch point (true for exactly one member per group — the one whose own target is closest along the trunk). */
  isNearest: boolean
}

interface BranchEntry {
  connectionId: string
  blockId: string
  portId: string | undefined
  point: Point
  side: FixedSide
  /** The connection's other endpoint — used only to measure distance along the trunk axis, to pick which sibling is nearest. */
  otherPoint: Point
  /** This connection's own `maxTrunkReach`; the group uses the smallest among its members. */
  maxReach: number
  /** This connection's own `stub`; the group uses the largest among its members as the branch point's minimum reach. */
  stub?: number
}

/**
 * Groups connections that share the exact same physical port *and* resolved
 * side (a real fan-out/fan-in, not just a coincidental shared coordinate),
 * and for every group of 2+, picks the branch point where their trunk
 * splits: the point along the shared normal closest to any one sibling's own
 * target, capped at the group's `maxTrunkReach` (the smallest among its
 * members) so that e.g. two targets tying in the same column don't stretch
 * the trunk all the way out to it — see `ConnectionStyle.maxTrunkReach`.
 * The nearest sibling is `isNearest` (continues past the branch point using
 * its original side, gaining an extra bend of its own only if the cap left
 * it short of its target); every other sibling peels off sideways starting
 * at that same point — see `perpendicularSideToward`, used by the caller
 * once it has this map.
 */
export function computeBranchInfo(entries: BranchEntry[]): Map<string, BranchInfo> {
  const groups = new Map<string, BranchEntry[]>()
  for (const entry of entries) {
    const key = `${entry.blockId}:${entry.portId ?? '__default__'}:${entry.side}`
    const list = groups.get(key)
    if (list) list.push(entry)
    else groups.set(key, [entry])
  }

  const result = new Map<string, BranchInfo>()
  for (const members of groups.values()) {
    if (members.length < 2) continue

    const anchor = members[0]!.point
    const axis = sideAxis(members[0]!.side)
    const sign = sideSign(members[0]!.side)

    let nearestId = members[0]!.connectionId
    let nearestDistance = Infinity
    let maxReach = Infinity
    let stub = 0
    for (const member of members) {
      const distance = (member.otherPoint[axis] - anchor[axis]) * sign
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestId = member.connectionId
      }
      maxReach = Math.min(maxReach, member.maxReach)
      stub = Math.max(stub, member.stub ?? DEFAULT_STUB)
    }
    // at least `stub` out of the block: a branch point on the port itself would send the peeling siblings along the block's own edge
    const reach = Math.min(Math.max(nearestDistance, stub), Math.max(maxReach, stub))
    const branchPoint =
      axis === 'x' ? { x: anchor.x + reach * sign, y: anchor.y } : { x: anchor.x, y: anchor.y + reach * sign }

    for (const member of members) {
      result.set(member.connectionId, { branchPoint, isNearest: member.connectionId === nearestId })
    }
  }
  return result
}

function dedupeConsecutive(points: Point[]): Point[] {
  const result: Point[] = []
  for (const point of points) {
    const last = result[result.length - 1]
    if (!last || Math.abs(last.x - point.x) > 0.01 || Math.abs(last.y - point.y) > 0.01) result.push(point)
  }
  return result
}

/**
 * Re-routes the stretch between a connection's (branch-adjusted) endpoints.
 * Gets the plain orthogonal route and may return a different one — e.g. one
 * that goes around other blocks (see `routeAroundObstacles`).
 */
export type MiddleRouter = (
  start: Point,
  startSide: FixedSide,
  end: Point,
  endSide: FixedSide,
  plain: Point[],
) => Point[]

/** The raw (pre-rounding) polyline a `smoothstep` connection follows — shared by `smoothstepPath` and `polylineMidpoint`. */
export function smoothstepPoints(
  from: Point,
  fromSide: FixedSide,
  to: Point,
  toSide: FixedSide,
  fromBranch: BranchInfo | undefined,
  toBranch: BranchInfo | undefined,
  routeMiddle?: MiddleRouter,
  stub: number = DEFAULT_STUB,
): Point[] {
  const startPoint = fromBranch ? fromBranch.branchPoint : from
  const startSide =
    fromBranch && !fromBranch.isNearest ? perpendicularSideToward(fromSide, fromBranch.branchPoint, to) : fromSide
  const endPoint = toBranch ? toBranch.branchPoint : to
  const endSide = toBranch && !toBranch.isNearest ? perpendicularSideToward(toSide, toBranch.branchPoint, from) : toSide

  const plain = orthogonalPoints(startPoint, startSide, endPoint, endSide, stub)
  const middle = routeMiddle ? routeMiddle(startPoint, startSide, endPoint, endSide, plain) : plain

  const points: Point[] = [from]
  if (fromBranch) points.push(fromBranch.branchPoint)
  points.push(...middle.slice(1, -1))
  if (toBranch) points.push(toBranch.branchPoint)
  points.push(to)

  return dedupeConsecutive(points)
}

/**
 * The full `smoothstep` connection path: a shared, rounded trunk-and-branch
 * at each end that has one (per `computeBranchInfo`'s grouping), an ordinary
 * rounded orthogonal connector in between.
 */
export function smoothstepPath(
  from: Point,
  fromSide: FixedSide,
  to: Point,
  toSide: FixedSide,
  fromBranch: BranchInfo | undefined,
  toBranch: BranchInfo | undefined,
  cornerRadius: number,
  stub: number = DEFAULT_STUB,
): string {
  return roundedPolylinePath(
    smoothstepPoints(from, fromSide, to, toSide, fromBranch, toBranch, undefined, stub),
    cornerRadius,
  )
}

/** The point at half the polyline's total arc length — for positioning a label/tooltip along a `smoothstep` connection. */
export function polylineMidpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]!

  const segmentLengths = points.slice(1).map((point, i) => Math.hypot(point.x - points[i]!.x, point.y - points[i]!.y))
  const half = segmentLengths.reduce((sum, length) => sum + length, 0) / 2

  let covered = 0
  for (let i = 0; i < segmentLengths.length; i++) {
    const segmentLength = segmentLengths[i]!
    if (covered + segmentLength >= half || i === segmentLengths.length - 1) {
      const t = segmentLength > 0 ? (half - covered) / segmentLength : 0
      const a = points[i]!
      const b = points[i + 1]!
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    covered += segmentLength
  }
  return points[points.length - 1]!
}

/** The direction of travel (degrees) along the first and last segments of a polyline — the `smoothstep` counterpart to `bezierTangentAngles`. */
export function polylineTangentAngles(points: Point[]): { fromAngle: number; toAngle: number } {
  if (points.length < 2) return { fromAngle: 0, toAngle: 0 }
  const first = points[0]!
  const second = points[1]!
  const last = points[points.length - 1]!
  const secondToLast = points[points.length - 2]!
  return {
    fromAngle: angleDeg({ x: second.x - first.x, y: second.y - first.y }),
    toAngle: angleDeg({ x: last.x - secondToLast.x, y: last.y - secondToLast.y }),
  }
}
