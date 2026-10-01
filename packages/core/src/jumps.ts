import type { Point } from './geometry'
import { DEFAULT_JUMP_RADIUS } from './params'
import type { JumpsOption } from './types'

/** `style.jumps ?? options.jumps` → the hop radius in px, or `null` when off (`false` at either level switches it off). */
export function resolveJumpRadius(own: JumpsOption | undefined, fallback: JumpsOption | undefined): number | null {
  const value = own ?? fallback
  if (!value) return null
  const radius = value === true ? DEFAULT_JUMP_RADIUS : (value.radius ?? DEFAULT_JUMP_RADIUS)
  return radius > 0 ? radius : null
}

export interface JumpPath {
  id: string
  /** The polyline the path is drawn from (before corner rounding). */
  points: readonly Point[]
  /** Hop radius when this path hops over crossings, `null` when it doesn't (it can still be hopped *over*). */
  jumpRadius: number | null
  /** The path's corner-rounding radius — crossings too close to a corner would land on the curve, so they are skipped. */
  cornerRadius: number
}

interface Segment {
  pathIndex: number
  index: number
  /** Fixed coordinate (y of a horizontal segment, x of a vertical one). */
  at: number
  from: number
  to: number
}

const ALIGNED = 0.5
const CLEARANCE = 1

function segmentsOf(paths: readonly JumpPath[]) {
  const horizontal: Segment[] = []
  const vertical: Segment[] = []
  paths.forEach((path, pathIndex) => {
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1]!
      const b = path.points[i]!
      if (Math.abs(a.y - b.y) < ALIGNED && Math.abs(a.x - b.x) >= ALIGNED) {
        horizontal.push({ pathIndex, index: i - 1, at: a.y, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) })
      } else if (Math.abs(a.x - b.x) < ALIGNED && Math.abs(a.y - b.y) >= ALIGNED) {
        vertical.push({ pathIndex, index: i - 1, at: a.x, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y) })
      }
    }
  })
  return { horizontal, vertical }
}

/**
 * Where each hopping path crosses someone else's vertical segment: a map from
 * path id to `segment index → x coordinates to hop at`. The horizontal
 * segment is the one that hops (the usual convention on schematics). Not
 * counted: crossings with a path itself; collinear overlaps (shared trunks
 * of a fan-out run along each other, they don't cross); T-junctions and
 * anything within a hop radius plus corner radius of a segment's end, where
 * the line is curving or the hop wouldn't fit; and hops closer to each other
 * than their own width (the second is dropped).
 */
export function findJumps(paths: readonly JumpPath[]): Map<string, Map<number, number[]>> {
  const result = new Map<string, Map<number, number[]>>()
  const { horizontal, vertical } = segmentsOf(paths)

  for (const h of horizontal) {
    const path = paths[h.pathIndex]!
    const radius = path.jumpRadius
    if (radius === null) continue
    const room = radius + path.cornerRadius + CLEARANCE

    const xs: number[] = []
    for (const v of vertical) {
      if (v.pathIndex === h.pathIndex) continue
      const other = paths[v.pathIndex]!
      if (v.at < h.from + room || v.at > h.to - room) continue
      if (h.at < v.from + other.cornerRadius + CLEARANCE || h.at > v.to - other.cornerRadius - CLEARANCE) continue
      xs.push(v.at)
    }
    if (xs.length === 0) continue

    xs.sort((a, b) => a - b)
    const spaced = xs.filter((x, i) => i === 0 || x - xs[i - 1]! > 2 * radius + CLEARANCE)
    let bySegment = result.get(path.id)
    if (!bySegment) result.set(path.id, (bySegment = new Map()))
    bySegment.set(h.index, [...(bySegment.get(h.index) ?? []), ...spaced])
  }
  return result
}
