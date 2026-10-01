import { afterEach, describe, expect, it } from 'vitest'
import { findJumps, resolveJumpRadius, type JumpPath } from '../src/jumps'
import { roundedPolylinePath } from '../src/orthogonal'
import { createVisualLinker, type VisualLinker } from '../src/visual-linker'
import { VLConnectionCurveEnum } from '../src/enums'
import type { Point } from '../src/geometry'

const p = (x: number, y: number): Point => ({ x, y })
const path = (id: string, points: Point[], jumpRadius: number | null = 5, cornerRadius = 0): JumpPath => ({
  id,
  points,
  jumpRadius,
  cornerRadius,
})

describe('resolveJumpRadius', () => {
  it('is off unless enabled; own beats the default, `false` opts out, an object sets the radius', () => {
    expect(resolveJumpRadius(undefined, undefined)).toBeNull()
    expect(resolveJumpRadius(undefined, true)).toBe(5)
    expect(resolveJumpRadius(false, true)).toBeNull()
    expect(resolveJumpRadius({ radius: 8 }, undefined)).toBe(8)
    expect(resolveJumpRadius({ radius: 0 }, true)).toBeNull()
  })
})

describe('findJumps', () => {
  const horizontal = path('h', [p(0, 50), p(200, 50)])
  const vertical = path('v', [p(100, 0), p(100, 100)], null)

  it('hops the horizontal line over the vertical one at the crossing x', () => {
    expect([...findJumps([horizontal, vertical])]).toEqual([['h', new Map([[0, [100]]])]])
  })

  it('never makes the vertical line hop, even if it asked to — the horizontal one does', () => {
    const both = [horizontal, { ...vertical, jumpRadius: 5 }]
    const jumps = findJumps(both)
    expect(jumps.has('v')).toBe(false)
    expect(jumps.get('h')!.get(0)).toEqual([100])
  })

  it('a line not asking to hop is hopped over by others but does not hop itself', () => {
    expect(findJumps([{ ...horizontal, jumpRadius: null }, vertical]).size).toBe(0)
  })

  it('ignores self-crossings, collinear overlaps, T-junctions and crossings too near a bend', () => {
    const selfCrossing = path('s', [p(0, 50), p(200, 50), p(200, 80), p(100, 80), p(100, 0)])
    expect(findJumps([selfCrossing]).size).toBe(0)

    const parallel = path('p', [p(50, 50), p(150, 50)], null) // runs along `horizontal`, not across it
    expect(findJumps([horizontal, parallel]).size).toBe(0)

    const tJunction = path('t', [p(100, 50), p(100, 100)], null) // starts on the line
    expect(findJumps([horizontal, tJunction]).size).toBe(0)

    const nearTheEnd = path('n', [p(3, 0), p(3, 100)], null) // 3px from the line's end: no room for a 5px hop
    expect(findJumps([horizontal, nearTheEnd]).size).toBe(0)

    const rounded = path('r', [p(0, 50), p(200, 50)], 5, 10) // corner radius eats the margin: 100 is fine, 12 is not
    expect(
      findJumps([rounded, path('a', [p(100, 0), p(100, 100)], null)])
        .get('r')!
        .get(0),
    ).toEqual([100])
    expect(findJumps([rounded, path('b', [p(12, 0), p(12, 100)], null)]).size).toBe(0)
  })

  it('drops hops that would overlap, and finds every crossing along a long stretch', () => {
    const rows = [path('h', [p(0, 50), p(400, 50)])]
    const verticals = [100, 200, 203, 300].map((x, i) => path(`v${i}`, [p(x, 0), p(x, 100)], null))
    expect(
      findJumps([...rows, ...verticals])
        .get('h')!
        .get(0),
    ).toEqual([100, 200, 300]) // 203 is within one hop width of 200
  })

  it('works on any segment of a longer polyline (keyed by segment index) and in both directions', () => {
    const l = path('l', [p(0, 0), p(0, 50), p(200, 50)]) // segment 1 is the horizontal one
    expect(
      findJumps([l, path('v', [p(60, 0), p(60, 100)], null)])
        .get('l')!
        .get(1),
    ).toEqual([60])
    const leftward = path('w', [p(200, 50), p(0, 50)])
    expect(
      findJumps([leftward, path('v', [p(60, 0), p(60, 100)], null)])
        .get('w')!
        .get(0),
    ).toEqual([60])
  })
})

describe('roundedPolylinePath with jumps', () => {
  it('draws unchanged paths exactly as before when there are no jumps', () => {
    const points = [p(0, 0), p(100, 0), p(100, 50)]
    expect(roundedPolylinePath(points, 0)).toBe('M 0 0 L 100 0 L 100 50')
    expect(roundedPolylinePath(points, 10)).toBe('M 0 0 L 90 0 Q 100 0 100 10 L 100 50')
    expect(roundedPolylinePath([p(0, 0), p(10, 0)], 10)).toBe('M 0 0 L 10 0')
  })

  it('inserts a semicircle bulging up at each hop, in either direction of travel', () => {
    const right = roundedPolylinePath([p(0, 50), p(200, 50)], 0, { radius: 5, bySegment: new Map([[0, [100]]]) })
    expect(right).toBe('M 0 50 L 95 50 A 5 5 0 0 1 105 50 L 200 50')
    const left = roundedPolylinePath([p(200, 50), p(0, 50)], 0, { radius: 5, bySegment: new Map([[0, [100]]]) })
    expect(left).toBe('M 200 50 L 105 50 A 5 5 0 0 0 95 50 L 0 50')
  })

  it('puts the hops on the right segment of a rounded path, and skips ones that do not fit the straight run', () => {
    const points = [p(0, 0), p(0, 50), p(200, 50), p(200, 100)]
    const d = roundedPolylinePath(points, 10, { radius: 5, bySegment: new Map([[1, [100, 195]]]) })
    expect(d).toContain('L 95 50 A 5 5 0 0 1 105 50')
    expect(d).not.toContain('195') // 195 is inside the corner's rounded zone, not on the straight run
  })
})

describe('jumps in the engine', () => {
  let engine: VisualLinker | undefined
  afterEach(() => {
    engine?.destroy()
    document.body.innerHTML = ''
  })

  /** Two same-direction connections whose smoothstep routes cross: a horizontal run and a vertical one. */
  function setup(options: Parameters<typeof createVisualLinker>[1], styles: [object, object] = [{}, {}]) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const make = (id: string, left: number, top: number) => {
      const el = document.createElement('div')
      el.getBoundingClientRect = () => new DOMRect(left, top, 100, 40)
      container.appendChild(el)
      return { id, el }
    }
    engine = createVisualLinker(container, { showPorts: false, ...options })
    engine.setBlocks([make('a', 0, 130), make('b', 400, 130), make('c', 200, 0), make('d', 200, 260)])
    const smooth = { curve: VLConnectionCurveEnum.SMOOTHSTEP, cornerRadius: 0 }
    engine.setConnections([
      { id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' }, style: { ...smooth, ...styles[0] } },
      { id: 'cd', from: { blockId: 'c' }, to: { blockId: 'd' }, style: { ...smooth, ...styles[1] } },
    ])
    return Object.fromEntries(
      [...container.querySelectorAll('path.vl-connection')].map((el, i) => [['ab', 'cd'][i]!, el.getAttribute('d')!]),
    )
  }

  it('draws plain crossings by default', () => {
    const d = setup({})
    expect(d.ab).not.toContain('A')
    expect(d.cd).not.toContain('A')
  })

  it('hops the horizontal line over the vertical one when enabled — and only that line', () => {
    const d = setup({ jumps: true })
    expect(d.ab).toContain('A 5 5 0 0 1 255 150') // a 5px hop centered on x=250, the middle of c and d
    expect(d.cd).not.toContain('A')
  })

  it('takes a custom radius, and a connection can opt out', () => {
    expect(setup({ jumps: { radius: 8 } }).ab).toContain('A 8 8 0 0 1 258 150')
    engine!.destroy()
    expect(setup({ jumps: true }, [{ jumps: false }, {}]).ab).not.toContain('A')
    engine!.destroy()
    expect(setup({}, [{ jumps: true }, {}]).ab).toContain('A 5 5')
  })
})
