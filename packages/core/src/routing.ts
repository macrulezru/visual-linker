import { VLFixedSideEnum } from './enums'
import type { Point } from './geometry'
import type { FixedSide } from './types'

export interface ObstacleRect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface RouteOptions {
  /** Clearance kept between the route and every obstacle, px. */
  padding: number
  /** Length of the straight run leaving/entering a block before the route may turn, px. */
  stub?: number
  /** Cost of a turn, in px of extra path — higher means fewer bends at the price of longer detours. */
  bendPenalty?: number
  /** Gives up (returns `null`) when the search grid would have more nodes than this. */
  maxNodes?: number
}

const DEFAULT_STUB = 16
const DEFAULT_BEND_PENALTY = 24
const DEFAULT_MAX_NODES = 6000
/** Cost per px of travel, per px away from the start–end chord: far too small to change which route is shortest, only to break ties between equally short ones. */
const CHORD_TIE_BREAK = 0.0005
const EPSILON = 0.01

// Directions as indices: 0 right, 1 down, 2 left, 3 up (screen coordinates).
const DIR_X = [1, 0, -1, 0] as const
const DIR_Y = [0, 1, 0, -1] as const

function outwardDirection(side: FixedSide): number {
  switch (side) {
    case VLFixedSideEnum.RIGHT:
      return 0
    case VLFixedSideEnum.BOTTOM:
      return 1
    case VLFixedSideEnum.LEFT:
      return 2
    default:
      return 3
  }
}

export function inflate(rect: ObstacleRect, by: number): ObstacleRect {
  return { left: rect.left - by, top: rect.top - by, right: rect.right + by, bottom: rect.bottom + by }
}

function insideStrictly(x: number, y: number, rect: ObstacleRect): boolean {
  return x > rect.left + EPSILON && x < rect.right - EPSILON && y > rect.top + EPSILON && y < rect.bottom - EPSILON
}

/**
 * Whether a segment passes through a rect's interior — merely touching its
 * boundary is fine. Horizontal and vertical segments (all a route is made of)
 * are tested exactly; anything slanted falls back to its bounding box.
 */
function segmentHitsRect(a: Point, b: Point, rect: ObstacleRect): boolean {
  const overlapX =
    Math.max(Math.min(a.x, b.x), rect.left + EPSILON) < Math.min(Math.max(a.x, b.x), rect.right - EPSILON)
  const overlapY =
    Math.max(Math.min(a.y, b.y), rect.top + EPSILON) < Math.min(Math.max(a.y, b.y), rect.bottom - EPSILON)
  if (Math.abs(a.y - b.y) < EPSILON) return overlapX && a.y > rect.top + EPSILON && a.y < rect.bottom - EPSILON
  if (Math.abs(a.x - b.x) < EPSILON) return overlapY && a.x > rect.left + EPSILON && a.x < rect.right - EPSILON
  return overlapX && overlapY
}

/** True when no segment of the polyline passes through any of the rects. */
export function pathIsClear(points: readonly Point[], rects: readonly ObstacleRect[]): boolean {
  for (let i = 1; i < points.length; i++) {
    for (const rect of rects) {
      if (segmentHitsRect(points[i - 1]!, points[i]!, rect)) return false
    }
  }
  return true
}

/** Drops duplicate points and the middle point of any three collinear ones. */
export function simplifyPolyline(points: readonly Point[]): Point[] {
  const result: Point[] = []
  for (const point of points) {
    const last = result[result.length - 1]
    if (last && Math.abs(last.x - point.x) < EPSILON && Math.abs(last.y - point.y) < EPSILON) continue
    result.push(point)
    while (result.length >= 3) {
      const [a, b, c] = result.slice(-3) as [Point, Point, Point]
      const collinear =
        (Math.abs(a.x - b.x) < EPSILON && Math.abs(b.x - c.x) < EPSILON) ||
        (Math.abs(a.y - b.y) < EPSILON && Math.abs(b.y - c.y) < EPSILON)
      if (!collinear) break
      result.splice(result.length - 2, 1)
    }
  }
  return result
}

/** A binary min-heap of `[priority, value]` pairs. */
class MinHeap {
  private items: [number, number][] = []
  get size() {
    return this.items.length
  }
  push(priority: number, value: number) {
    const items = this.items
    items.push([priority, value])
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (items[parent]![0] <= items[i]![0]) break
      ;[items[parent], items[i]] = [items[i]!, items[parent]!]
      i = parent
    }
  }
  pop(): [number, number] {
    const items = this.items
    const top = items[0]!
    const last = items.pop()!
    if (items.length > 0) {
      items[0] = last
      let i = 0
      for (;;) {
        const left = 2 * i + 1
        const right = left + 1
        let smallest = i
        if (left < items.length && items[left]![0] < items[smallest]![0]) smallest = left
        if (right < items.length && items[right]![0] < items[smallest]![0]) smallest = right
        if (smallest === i) break
        ;[items[smallest], items[i]] = [items[i]!, items[smallest]!]
        i = smallest
      }
    }
    return top
  }
}

function uniqueSorted(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  const result: number[] = []
  for (const value of sorted) {
    if (result.length === 0 || value - result[result.length - 1]! > EPSILON) result.push(value)
  }
  return result
}

/**
 * Routes an orthogonal path from `start` (leaving along `startSide`'s normal)
 * to `end` (entered against `endSide`'s normal) around `obstacles`, each kept
 * `padding` clear. A* over the grid formed by the obstacles' padded edges and
 * the endpoints, with a penalty per turn so routes stay simple. When the full
 * padding and stub leave no way out — an obstacle closer to an endpoint than
 * they allow — both shrink step by step before giving up. Returns the
 * polyline including `start` and `end`, or `null` when there is no route (or
 * the grid is too large) — callers then fall back to the unrouted path.
 */
export function routeAroundObstacles(
  start: Point,
  startSide: FixedSide,
  end: Point,
  endSide: FixedSide,
  obstacles: readonly ObstacleRect[],
  options: RouteOptions,
): Point[] | null {
  const stub = options.stub ?? DEFAULT_STUB
  // From the comfortable setup to a cramped one: halve the padding, then shorten
  // the straight run out of / into the blocks, then both down to slivers.
  const attempts: [number, number][] = [
    [options.padding, stub],
    [options.padding / 2, stub],
    [options.padding / 2, stub / 2],
    [Math.min(options.padding, 2), stub / 4],
  ]
  for (const [padding, attemptStub] of attempts) {
    const route = searchRoute(start, startSide, end, endSide, obstacles, { ...options, padding, stub: attemptStub })
    if (route) return route
  }
  return null
}

function searchRoute(
  start: Point,
  startSide: FixedSide,
  end: Point,
  endSide: FixedSide,
  obstacles: readonly ObstacleRect[],
  options: RouteOptions,
): Point[] | null {
  const stub = options.stub ?? DEFAULT_STUB
  const bend = options.bendPenalty ?? DEFAULT_BEND_PENALTY
  const rects = obstacles.map((rect) => inflate(rect, options.padding))

  const startDir = outwardDirection(startSide)
  const endNormalDir = outwardDirection(endSide)
  const finalDir = (endNormalDir + 2) % 4 // the last move runs into the end block, against its normal
  const s1 = { x: start.x + DIR_X[startDir]! * stub, y: start.y + DIR_Y[startDir]! * stub }
  const e1 = { x: end.x + DIR_X[endNormalDir]! * stub, y: end.y + DIR_Y[endNormalDir]! * stub }

  const xs = uniqueSorted([s1.x, e1.x, ...rects.flatMap((rect) => [rect.left, rect.right])])
  const ys = uniqueSorted([s1.y, e1.y, ...rects.flatMap((rect) => [rect.top, rect.bottom])])
  const nx = xs.length
  const ny = ys.length
  if (nx * ny > (options.maxNodes ?? DEFAULT_MAX_NODES)) return null

  const indexOf = (values: number[], value: number) => {
    let lo = 0
    let hi = values.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (Math.abs(values[mid]! - value) <= EPSILON) return mid
      if (values[mid]! < value) lo = mid + 1
      else hi = mid - 1
    }
    return -1
  }

  const blockedAt = (x: number, y: number) => rects.some((rect) => insideStrictly(x, y, rect))
  const si = indexOf(xs, s1.x)
  const sj = indexOf(ys, s1.y)
  const ei = indexOf(xs, e1.x)
  const ej = indexOf(ys, e1.y)
  if (blockedAt(s1.x, s1.y) || blockedAt(e1.x, e1.y)) return null
  if (si === ei && sj === ej) return simplifyPolyline([start, s1, end])

  const stateOf = (i: number, j: number, dir: number) => (i * ny + j) * 4 + dir
  const cost = new Float64Array(nx * ny * 4).fill(Infinity)
  const cameFrom = new Int32Array(nx * ny * 4).fill(-1)
  const heap = new MinHeap()
  const chordX = e1.x - s1.x
  const chordY = e1.y - s1.y
  const chordLength = Math.hypot(chordX, chordY)
  const chordDistance = (x: number, y: number) =>
    chordLength < EPSILON ? 0 : Math.abs((x - s1.x) * chordY - (y - s1.y) * chordX) / chordLength
  const heuristic = (i: number, j: number) => Math.abs(xs[i]! - xs[ei]!) + Math.abs(ys[j]! - ys[ej]!)

  const first = stateOf(si, sj, startDir)
  cost[first] = 0
  heap.push(heuristic(si, sj), first)

  let goal = -1
  while (heap.size > 0) {
    const [, state] = heap.pop()
    const dir = state % 4
    const node = (state - dir) / 4
    const j = node % ny
    const i = (node - j) / ny
    if (i === ei && j === ej) {
      goal = state
      break
    }
    const g = cost[state]!
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (dir + 2) % 4) continue // no U-turns
      const ni = i + DIR_X[nd]!
      const nj = j + DIR_Y[nd]!
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue
      const x2 = xs[ni]!
      const y2 = ys[nj]!
      if (blockedAt(x2, y2) || blockedAt((xs[i]! + x2) / 2, (ys[j]! + y2) / 2)) continue

      const step = Math.abs(x2 - xs[i]!) + Math.abs(y2 - ys[j]!)
      // Travel away from the start–end chord costs a hair more, so of several
      // equally short routes the one that leaves the direct line as late and
      // rejoins it as early as possible — hugging the obstacle — wins.
      const offChord = chordDistance((xs[i]! + x2) / 2, (ys[j]! + y2) / 2)
      let next = g + step * (1 + CHORD_TIE_BREAK * offChord) + (nd !== dir ? bend : 0)
      // Arriving at the goal in the wrong direction costs the turn into the end stub.
      if (ni === ei && nj === ej && nd !== finalDir) next += bend
      const nextState = stateOf(ni, nj, nd)
      if (next < cost[nextState]!) {
        cost[nextState] = next
        cameFrom[nextState] = state
        heap.push(next + heuristic(ni, nj), nextState)
      }
    }
  }
  if (goal < 0) return null

  const nodes: Point[] = []
  for (let state = goal; state >= 0; state = cameFrom[state]!) {
    const node = (state - (state % 4)) / 4
    const j = node % ny
    nodes.push({ x: xs[(node - j) / ny]!, y: ys[j]! })
  }
  nodes.reverse()
  return simplifyPolyline([start, ...nodes, end])
}

/** Remembers routes by their inputs, so a frame where only unrelated blocks moved costs nothing. */
export function createRouteCache(limit = 400) {
  const entries = new Map<string, Point[] | null>()
  return {
    route(
      start: Point,
      startSide: FixedSide,
      end: Point,
      endSide: FixedSide,
      obstacles: readonly ObstacleRect[],
      options: RouteOptions,
    ): Point[] | null {
      const round = (n: number) => Math.round(n * 2) / 2
      const key = [
        round(start.x),
        round(start.y),
        startSide,
        round(end.x),
        round(end.y),
        endSide,
        options.padding,
        options.stub ?? '',
        options.bendPenalty ?? '',
        ...obstacles.map((rect) => `${round(rect.left)},${round(rect.top)},${round(rect.right)},${round(rect.bottom)}`),
      ].join('|')
      if (entries.has(key)) return entries.get(key)!
      const result = routeAroundObstacles(start, startSide, end, endSide, obstacles, options)
      if (entries.size >= limit) entries.clear()
      entries.set(key, result)
      return result
    },
  }
}
