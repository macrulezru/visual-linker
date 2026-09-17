import { VLFixedSideEnum } from './enums'
import type { FixedSide } from './types'
import type { Point } from './geometry'

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
 * to its normal). Three cases:
 * - Same point / already aligned on the shared axis → a single straight segment.
 * - Perpendicular axes (one horizontal, one vertical) → one 90° bend ("L").
 * - Same axis, not aligned → two bends at the midpoint between them ("Z"/"S"),
 *   so the path leaves and arrives correctly oriented on both ends.
 */
export function orthogonalPoints(from: Point, fromSide: FixedSide, to: Point, toSide: FixedSide): Point[] {
  const fromAxis = sideAxis(fromSide)
  const toAxis = sideAxis(toSide)

  if (fromAxis === toAxis) {
    if (fromAxis === 'x' && Math.abs(from.y - to.y) < 0.5) return [from, to]
    if (fromAxis === 'y' && Math.abs(from.x - to.x) < 0.5) return [from, to]
    if (fromAxis === 'x') {
      const midX = (from.x + to.x) / 2
      return [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to]
    }
    const midY = (from.y + to.y) / 2
    return [from, { x: from.x, y: midY }, { x: to.x, y: midY }, to]
  }

  if (fromAxis === 'x') return [from, { x: to.x, y: from.y }, to]
  return [from, { x: from.x, y: to.y }, to]
}

/** Converts a straight-segment polyline into an SVG path with each interior corner rounded to `radius` (clamped to half the shorter adjoining segment). */
export function roundedPolylinePath(points: Point[], radius: number): string {
  if (points.length < 2) return ''
  if (points.length === 2 || radius <= 0.5) {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  }

  const parts = [`M ${points[0]!.x} ${points[0]!.y}`]
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!
    const corner = points[i]!
    const next = points[i + 1]!

    const inLength = Math.max(Math.hypot(corner.x - prev.x, corner.y - prev.y), 0.0001)
    const outLength = Math.max(Math.hypot(next.x - corner.x, next.y - corner.y), 0.0001)
    const r = Math.min(radius, inLength / 2, outLength / 2)

    const start = {
      x: corner.x - ((corner.x - prev.x) * r) / inLength,
      y: corner.y - ((corner.y - prev.y) * r) / inLength,
    }
    const end = {
      x: corner.x + ((next.x - corner.x) * r) / outLength,
      y: corner.y + ((next.y - corner.y) * r) / outLength,
    }

    parts.push(`L ${start.x} ${start.y}`, `Q ${corner.x} ${corner.y} ${end.x} ${end.y}`)
  }
  const last = points[points.length - 1]!
  parts.push(`L ${last.x} ${last.y}`)
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
    for (const member of members) {
      const distance = (member.otherPoint[axis] - anchor[axis]) * sign
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestId = member.connectionId
      }
      maxReach = Math.min(maxReach, member.maxReach)
    }
    const reach = Math.min(Math.max(nearestDistance, 0), maxReach)
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
): string {
  const startPoint = fromBranch ? fromBranch.branchPoint : from
  const startSide =
    fromBranch && !fromBranch.isNearest ? perpendicularSideToward(fromSide, fromBranch.branchPoint, to) : fromSide
  const endPoint = toBranch ? toBranch.branchPoint : to
  const endSide = toBranch && !toBranch.isNearest ? perpendicularSideToward(toSide, toBranch.branchPoint, from) : toSide

  const middle = orthogonalPoints(startPoint, startSide, endPoint, endSide)

  const points: Point[] = [from]
  if (fromBranch) points.push(fromBranch.branchPoint)
  points.push(...middle.slice(1, -1))
  if (toBranch) points.push(toBranch.branchPoint)
  points.push(to)

  return roundedPolylinePath(dedupeConsecutive(points), cornerRadius)
}
