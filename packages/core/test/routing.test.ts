import { describe, expect, it } from 'vitest'
import { createRouteCache, inflate, pathIsClear, routeAroundObstacles, simplifyPolyline } from '../src/routing'
import { createVisualLinker } from '../src/visual-linker'
import { VLConnectionCurveEnum, VLFixedSideEnum } from '../src/enums'
import type { Point } from '../src/geometry'

const { LEFT, RIGHT, TOP, BOTTOM } = VLFixedSideEnum

const isOrthogonal = (points: Point[]) =>
  points.every((p, i) => i === 0 || Math.abs(p.x - points[i - 1]!.x) < 0.01 || Math.abs(p.y - points[i - 1]!.y) < 0.01)

const length = (points: Point[]) =>
  points.reduce((sum, p, i) => (i === 0 ? 0 : sum + Math.hypot(p.x - points[i - 1]!.x, p.y - points[i - 1]!.y)), 0)

describe('polyline helpers', () => {
  it('detects segments crossing a rect interior, but not ones merely touching its edge', () => {
    const rect = { left: 10, top: 10, right: 20, bottom: 20 }
    expect(
      pathIsClear(
        [
          { x: 0, y: 15 },
          { x: 30, y: 15 },
        ],
        [rect],
      ),
    ).toBe(false)
    expect(
      pathIsClear(
        [
          { x: 0, y: 10 },
          { x: 30, y: 10 },
        ],
        [rect],
      ),
    ).toBe(true) // runs along the top edge
    expect(
      pathIsClear(
        [
          { x: 15, y: 0 },
          { x: 15, y: 9 },
        ],
        [rect],
      ),
    ).toBe(true)
    expect(inflate(rect, 2)).toEqual({ left: 8, top: 8, right: 22, bottom: 22 })
  })

  it('removes duplicates and collinear middle points', () => {
    expect(
      simplifyPolyline([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 8 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
    ])
  })
})

describe('routeAroundObstacles', () => {
  const start = { x: 0, y: 50 }
  const end = { x: 300, y: 50 }
  const wall = { left: 100, top: 20, right: 200, bottom: 80 }

  it('goes around an obstacle sitting on the direct line, with clearance, orthogonally, ends intact', () => {
    const route = routeAroundObstacles(start, RIGHT, end, LEFT, [wall], { padding: 10 })!
    expect(route).not.toBeNull()
    expect(route[0]).toEqual(start)
    expect(route.at(-1)).toEqual(end)
    expect(isOrthogonal(route)).toBe(true)
    expect(pathIsClear(route, [inflate(wall, 10)])).toBe(true)
    expect(length(route)).toBeGreaterThan(300)
  })

  it('hugs the obstacle: turns off the direct line just before it and back onto it just after (regression: the return used to happen anywhere past it)', () => {
    // The padded wall spans x 90..210. Every route "down, along, up" is equally short; only the hugging one is wanted.
    const route = routeAroundObstacles(start, RIGHT, end, LEFT, [wall], { padding: 10 })!
    const turnXs = route.filter((point, i) => i > 0 && i < route.length - 1).map((point) => point.x)
    expect(Math.min(...turnXs)).toBe(90)
    expect(Math.max(...turnXs)).toBe(210)
    expect(route).toHaveLength(6) // start, 4 corners, end
  })

  it('leaves along the start side and enters against the end side', () => {
    const route = routeAroundObstacles(start, RIGHT, end, LEFT, [wall], { padding: 10 })!
    expect(route[1]!.y).toBe(route[0]!.y) // first run is horizontal, heading right
    expect(route[1]!.x).toBeGreaterThan(route[0]!.x)
    expect(route.at(-2)!.y).toBe(route.at(-1)!.y) // last run is horizontal, heading right into the end block
    expect(route.at(-2)!.x).toBeLessThan(route.at(-1)!.x)
  })

  it('works vertically too (top/bottom sides)', () => {
    const route = routeAroundObstacles(
      { x: 50, y: 0 },
      BOTTOM,
      { x: 50, y: 300 },
      TOP,
      [{ left: 20, top: 100, right: 80, bottom: 200 }],
      {
        padding: 8,
      },
    )!
    expect(route).not.toBeNull()
    expect(isOrthogonal(route)).toBe(true)
    expect(pathIsClear(route, [inflate({ left: 20, top: 100, right: 80, bottom: 200 }, 8)])).toBe(true)
    expect(route[1]!.x).toBe(50)
  })

  it('threads between several obstacles, preferring fewer turns', () => {
    const rects = [
      { left: 60, top: 0, right: 100, bottom: 70 },
      { left: 160, top: 30, right: 200, bottom: 100 },
    ]
    const route = routeAroundObstacles(start, RIGHT, end, LEFT, rects, { padding: 6 })!
    expect(
      pathIsClear(
        route,
        rects.map((rect) => inflate(rect, 6)),
      ),
    ).toBe(true)
    expect(route.length).toBeLessThanOrEqual(8)
  })

  it('returns null when an obstacle sits right in the exit/entry stub, or the grid would be too big', () => {
    // Start (50,50) leaves right, 16px out — straight into this obstacle.
    const inFront = { left: 55, top: 30, right: 200, bottom: 70 }
    expect(routeAroundObstacles({ x: 50, y: 50 }, RIGHT, end, LEFT, [inFront], { padding: 4 })).toBeNull()
    expect(routeAroundObstacles(start, RIGHT, end, LEFT, [wall], { padding: 10, maxNodes: 4 })).toBeNull()
  })

  it('caches by input, so an identical request returns the same route object', () => {
    const cache = createRouteCache()
    const a = cache.route(start, RIGHT, end, LEFT, [wall], { padding: 10 })
    const b = cache.route(start, RIGHT, end, LEFT, [wall], { padding: 10 })
    expect(b).toBe(a)
    expect(cache.route(start, RIGHT, end, LEFT, [{ ...wall, top: 22 }], { padding: 10 })).not.toBe(a)
  })
})

describe('avoidObstacles in the engine', () => {
  const NUM = /-?\d+(?:\.\d+)?/g
  const wall = { left: 140, top: 0, right: 240, bottom: 100 } // between a (0..100) and b (300..400), same row

  function setup(options: Parameters<typeof createVisualLinker>[1], style: object = {}, wallRect = wall) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const make = (id: string, rect: { left: number; top: number; right: number; bottom: number }) => {
      const el = document.createElement('div')
      el.getBoundingClientRect = () => new DOMRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top)
      container.appendChild(el)
      return { id, el }
    }
    const engine = createVisualLinker(container, { showPorts: false, ...options })
    engine.setBlocks([
      make('a', { left: 0, top: 30, right: 100, bottom: 70 }),
      make('b', { left: 300, top: 30, right: 400, bottom: 70 }),
      make('wall', wallRect),
    ])
    engine.setConnections([
      {
        id: 'ab',
        from: { blockId: 'a' },
        to: { blockId: 'b' },
        style: { curve: VLConnectionCurveEnum.SMOOTHSTEP, cornerRadius: 0, ...style },
      },
    ])
    const d = container.querySelector('path.vl-connection')!.getAttribute('d')!
    const nums = (d.match(NUM) ?? []).map(Number)
    const points = Array.from({ length: nums.length / 2 }, (_, i) => ({ x: nums[2 * i]!, y: nums[2 * i + 1]! }))
    return { engine, points, d }
  }

  it('runs straight through the block in the way by default', () => {
    const { engine, points } = setup({})
    expect(pathIsClear(points, [wall])).toBe(false)
    engine.destroy()
  })

  it('detours around it with avoidObstacles, keeping the padding, and per-connection false opts out', () => {
    const on = setup({ avoidObstacles: true, obstaclePadding: 10 })
    expect(pathIsClear(on.points, [inflate(wall, 10)])).toBe(true)
    expect(on.points[0]).toEqual({ x: 100, y: 50 })
    expect(on.points.at(-1)).toEqual({ x: 300, y: 50 })
    on.engine.destroy()

    const off = setup({ avoidObstacles: true }, { avoidObstacles: false })
    expect(pathIsClear(off.points, [wall])).toBe(false)
    off.engine.destroy()

    const perConnection = setup({}, { avoidObstacles: true })
    expect(pathIsClear(perConnection.points, [wall])).toBe(true)
    perConnection.engine.destroy()
  })

  it('leaves a connection whose plain route is already clear exactly as it was', () => {
    const farAway = { left: 120, top: 400, right: 220, bottom: 500 }
    const without = setup({}, {}, farAway)
    const withAvoidance = setup({ avoidObstacles: true }, {}, farAway)
    expect(withAvoidance.d).toBe(without.d)
    without.engine.destroy()
    withAvoidance.engine.destroy()
  })

  it('shrinks the padding when a block sits closer to an endpoint than the padding allows, still clearing the block itself', () => {
    const tight = { left: 110, top: 0, right: 220, bottom: 100 } // 10px off a's edge: the 16px exit stub ends inside a 10px pad
    const { engine, points } = setup({ avoidObstacles: true, obstaclePadding: 10 }, {}, tight)
    expect(pathIsClear(points, [tight])).toBe(true)
    expect(points.at(-1)).toEqual({ x: 300, y: 50 })
    engine.destroy()
  })

  it('falls back to the plain route when no detour exists (the wall swallows the exit stub)', () => {
    const swallowing = { left: 105, top: -500, right: 500, bottom: 500 } // right in front of a's right side
    const { engine, d } = setup({ avoidObstacles: true }, {}, swallowing)
    const plain = setup({}, {}, swallowing)
    expect(d).toBe(plain.d)
    engine.destroy()
    plain.engine.destroy()
  })
})
