import { afterEach, describe, expect, it } from 'vitest'
import { findJumps, type JumpPath } from '../src/jumps'
import { createVisualLinker, type VisualLinker } from '../src/visual-linker'
import type { BlockDescriptor, ConnectionDescriptor, VisualLinkerConfig } from '../src/types'

function rectOf(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON() {},
  }
}

interface Scene {
  container: HTMLElement
  engine: VisualLinker
  blocks: BlockDescriptor[]
  rects: Map<string, DOMRect>
}

function createScene(
  count: number,
  config: VisualLinkerConfig = {},
  place?: (index: number) => { left: number; top: number },
): Scene {
  const container = document.createElement('div')
  container.getBoundingClientRect = () => rectOf(0, 0, 1200, 900)
  document.body.appendChild(container)
  const rects = new Map<string, DOMRect>()
  const blocks: BlockDescriptor[] = []
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div')
    const { left, top } = place ? place(i) : { left: (i % 10) * 110, top: Math.floor(i / 10) * 60 }
    const rect = rectOf(left, top, 90, 36)
    rects.set(`b${i}`, rect)
    el.getBoundingClientRect = () => rects.get(`b${i}`)!
    container.appendChild(el)
    blocks.push({ id: `b${i}`, el })
  }
  const engine = createVisualLinker(container, { ports: { show: false }, ...config })
  engine.setBlocks(blocks)
  return { container, engine, blocks, rects }
}

function link(i: number, from: number, to: number, extra: Partial<ConnectionDescriptor> = {}): ConnectionDescriptor {
  return { id: `c${i}`, from: { blockId: `b${from}` }, to: { blockId: `b${to}` }, ...extra }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('batch and stats', () => {
  it('turns 100 calls into one render pass', () => {
    const { engine } = createScene(20)
    let layouts = 0
    engine.on('layout', () => layouts++)
    engine.batch(() => {
      for (let i = 0; i < 100; i++) engine.addConnection(link(i, i % 10, 10 + (i % 10)))
    })
    expect(layouts).toBe(1)
    expect(engine.getStats().connections).toBe(100)
    expect(engine.getStats().rendered).toBe(100)
    engine.destroy()
  })

  it('renders once even when blocks, connections and config change together, and nests', () => {
    const { engine, blocks } = createScene(10)
    let layouts = 0
    engine.on('layout', () => layouts++)
    engine.batch(() => {
      engine.setBlocks(blocks)
      engine.setConnections([link(0, 0, 5)])
      engine.setConfig({ lines: { width: 3 } })
      engine.batch(() => engine.removeConnection('c0'))
      expect(layouts).toBe(0)
    })
    expect(layouts).toBe(1)
    engine.destroy()
  })

  it('reports counters without touching the DOM', () => {
    const { engine, container } = createScene(10)
    engine.setConnections([link(0, 0, 5), link(1, 1, 6)])
    const stats = engine.getStats()
    expect(stats).toMatchObject({ blocks: 10, connections: 2, rendered: 2, culled: 0, proxied: 0 })
    expect(stats.lastRenderMs).toBeGreaterThanOrEqual(0)
    expect(stats.medianRenderMs).toBeGreaterThanOrEqual(0)
    expect(container.querySelectorAll('path.vl-connection')).toHaveLength(2)
    engine.destroy()
  })
})

describe('incremental rendering', () => {
  it('rewrites one connection when only its style changes', () => {
    const { engine } = createScene(60)
    const list = Array.from({ length: 300 }, (_, i) => link(i, i % 30, 30 + ((i * 7) % 30)))
    engine.setConnections(list)
    expect(engine.getStats().rendered).toBe(300)

    engine.setConnections(list.map((item, i) => (i === 5 ? { ...item, style: { color: '#f00' } } : { ...item })))
    expect(engine.getStats().rendered).toBe(1)

    engine.refresh()
    expect(engine.getStats().rendered).toBe(0)
    engine.destroy()
  })

  it('picks up a connection mutated in place after addConnection() or refresh()', () => {
    const { engine, container } = createScene(20)
    const connection = link(0, 0, 10, { style: { color: '#111111' } })
    engine.setConnections([connection])
    const path = container.querySelector('path.vl-connection') as SVGPathElement
    expect(path.style.stroke).toBe('#111111')

    connection.style!.color = '#222222'
    engine.addConnection(connection)
    expect(path.style.stroke).toBe('#222222')

    connection.style!.color = '#333333'
    engine.refresh()
    expect(path.style.stroke).toBe('#333333')
    engine.destroy()
  })

  it('treats a structurally equal style as unchanged', () => {
    const { engine } = createScene(20)
    engine.setConnections([link(0, 0, 10, { style: { color: '#0a0', dashed: true } })])
    engine.setConnections([link(0, 0, 10, { style: { color: '#0a0', dashed: true } })])
    expect(engine.getStats().rendered).toBe(0)
    engine.destroy()
  })

  it('redraws only the connections touching a block that moved', () => {
    const scene = createScene(40)
    scene.engine.setConnections(Array.from({ length: 30 }, (_, i) => link(i, i % 10, 20 + (i % 10))))
    scene.rects.set('b0', rectOf(5, 500, 90, 36))
    scene.engine.refresh()
    const touching = 30 / 10
    expect(scene.engine.getStats().rendered).toBe(touching)
    scene.engine.destroy()
  })
})

describe('observed elements', () => {
  it('observes only the blocks that have connections', () => {
    const { engine } = createScene(50)
    expect(engine.getStats().observedElements).toBe(1)
    engine.setConnections([link(0, 0, 10), link(1, 0, 11)])
    expect(engine.getStats().observedElements).toBe(4)
    engine.removeConnection('c1')
    expect(engine.getStats().observedElements).toBe(3)
    engine.setConnections([])
    expect(engine.getStats().observedElements).toBe(1)
    engine.destroy()
  })
})

describe('fallback ends', () => {
  it('draws to the first registered fallback and marks the connection proxied', () => {
    const scene = createScene(6, { lines: { proxied: { dashed: true, opacity: 0.5 } } })
    scene.engine.setBlocks(scene.blocks.filter((block) => block.id !== 'b3'))
    let layout: { proxied?: object; to: { x: number; y: number } } | undefined
    scene.engine.on('layout', (payload) => (layout = payload.connections[0]))
    scene.engine.setConnections([
      {
        id: 'row',
        from: { blockId: 'b0' },
        to: { blockId: 'b3', fallback: ['gone', 'b4', 'b5'] },
      },
    ])
    const path = scene.container.querySelector('path.vl-connection') as SVGPathElement
    expect(path).not.toBeNull()
    expect(path.style.strokeDasharray).not.toBe('')
    expect(path.style.strokeOpacity).toBe('0.5')
    expect(layout!.proxied).toEqual({ to: true })
    expect(scene.engine.getStats().proxied).toBe(1)

    const b4 = scene.rects.get('b4')!
    expect(Math.abs(layout!.to.x - b4.left)).toBeLessThan(2 + 0 * b4.width)
    scene.engine.destroy()
  })

  it('skips the connection when nothing in the chain is registered', () => {
    const scene = createScene(4)
    scene.engine.setConnections([
      { id: 'row', from: { blockId: 'b0' }, to: { blockId: 'x1', fallback: ['x2'] } },
      { id: 'plain', from: { blockId: 'b0' }, to: { blockId: 'x1' } },
    ])
    expect(scene.container.querySelectorAll('path.vl-connection')).toHaveLength(0)
    scene.engine.destroy()
  })

  it('keeps a registered end untouched and not proxied', () => {
    const scene = createScene(4)
    scene.engine.setConnections([{ id: 'ok', from: { blockId: 'b0' }, to: { blockId: 'b2', fallback: ['b3'] } }])
    expect(scene.engine.getStats().proxied).toBe(0)
    scene.engine.destroy()
  })

  it('moves to the fallback when the primary end is scrolled out of its scroller', () => {
    const container = document.createElement('div')
    container.getBoundingClientRect = () => rectOf(0, 0, 800, 600)
    document.body.appendChild(container)
    const scroller = document.createElement('div')
    scroller.style.overflow = 'auto'
    scroller.getBoundingClientRect = () => rectOf(0, 0, 200, 100)
    container.appendChild(scroller)
    const mk = (parent: HTMLElement, left: number, top: number) => {
      const el = document.createElement('div')
      el.getBoundingClientRect = () => rectOf(left, top, 100, 20)
      parent.appendChild(el)
      return el
    }
    const group = mk(scroller, 0, 10)
    const hidden = mk(scroller, 0, 400)
    const target = mk(container, 500, 40)
    const engine = createVisualLinker(container, { ports: { show: false } })
    engine.setBlocks([
      { id: 'group', el: group },
      { id: 'hidden', el: hidden },
      { id: 'target', el: target },
    ])
    engine.setConnections([
      { id: 'a', from: { blockId: 'hidden', fallback: ['group'] }, to: { blockId: 'target' } },
      { id: 'b', from: { blockId: 'hidden' }, to: { blockId: 'target' } },
    ])
    let layouts: { id: string; proxied?: object; fromClipped?: boolean }[] = []
    engine.on('layout', (payload) => (layouts = payload.connections))
    engine.refresh()
    expect(layouts.find((item) => item.id === 'a')).toMatchObject({ proxied: { from: true } })
    expect(layouts.find((item) => item.id === 'b')).toMatchObject({ fromClipped: true })
    engine.destroy()
  })
})

describe('culling', () => {
  it('does not draw connections that are far outside the visible area, and brings them back', () => {
    const scene = createScene(6, { performance: { cull: true } }, (i) =>
      i < 3 ? { left: 100 * i, top: 10 } : { left: 100 * (i - 3), top: 9000 },
    )
    scene.engine.setConnections([link(0, 0, 1), link(1, 3, 4), link(2, 4, 5)])
    expect(scene.container.querySelectorAll('path.vl-connection')).toHaveLength(1)
    expect(scene.engine.getStats()).toMatchObject({ culled: 2, rendered: 1 })

    scene.rects.set('b3', rectOf(0, 100, 90, 36))
    scene.engine.refresh()
    expect(scene.container.querySelectorAll('path.vl-connection')).toHaveLength(2)
    expect(scene.engine.getStats().culled).toBe(1)
    scene.engine.destroy()
  })

  it('keeps a long line that crosses the visible area although both ends lie outside it', () => {
    const scene = createScene(2, { performance: { cull: { margin: 0 } } }, (i) =>
      i === 0 ? { left: -3000, top: 100 } : { left: 5000, top: 100 },
    )
    scene.engine.setConnections([link(0, 0, 1)])
    expect(scene.engine.getStats().culled).toBe(0)
    scene.engine.destroy()
  })

  it('draws everything when culling is off', () => {
    const scene = createScene(4, {}, (i) => ({ left: 100 * i, top: 9000 }))
    scene.engine.setConnections([link(0, 0, 1), link(1, 2, 3)])
    expect(scene.container.querySelectorAll('path.vl-connection')).toHaveLength(2)
    expect(scene.engine.getStats().culled).toBe(0)
    scene.engine.destroy()
  })
})

describe('expensive modes', () => {
  function hopScene(config: VisualLinkerConfig) {
    const places = [
      { left: 0, top: 0 },
      { left: 600, top: 0 },
      { left: 300, top: -300 },
      { left: 300, top: 200 },
    ]
    const scene = createScene(4, { ports: { show: false }, ...config }, (i) => places[i]!)
    const style = { curve: 'smoothstep' as const, jumps: true }
    scene.engine.setConnections([link(0, 0, 1, { style }), link(1, 2, 3, { style })])
    return scene
  }

  const dOf = (scene: Scene, id: string) =>
    (scene.container.querySelectorAll('path.vl-connection')[id === 'c0' ? 0 : 1] as SVGPathElement).getAttribute('d')!

  it('hops over a crossing by default', () => {
    const scene = hopScene({})
    expect(dOf(scene, 'c0')).toContain('A')
    scene.engine.destroy()
  })

  it('stops hopping once more connections want it than maxConnectionsForJumps', () => {
    const scene = hopScene({ performance: { maxConnectionsForJumps: 1 } })
    expect(dOf(scene, 'c0')).not.toContain('A')
    scene.engine.destroy()
  })
})

describe('line jumps lookup', () => {
  function seeded(seed: number) {
    let state = seed >>> 0
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0
      return state / 4294967296
    }
  }

  function bruteForce(paths: readonly JumpPath[]) {
    const result = new Map<string, Map<number, number[]>>()
    const segs = paths.map((path) => {
      const horizontal: { index: number; at: number; from: number; to: number }[] = []
      const vertical: { index: number; at: number; from: number; to: number }[] = []
      for (let i = 1; i < path.points.length; i++) {
        const a = path.points[i - 1]!
        const b = path.points[i]!
        if (Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) >= 0.5) {
          horizontal.push({ index: i - 1, at: a.y, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) })
        } else if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) >= 0.5) {
          vertical.push({ index: i - 1, at: a.x, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y) })
        }
      }
      return { horizontal, vertical }
    })
    paths.forEach((path, pi) => {
      if (path.jumpRadius === null) return
      const room = path.jumpRadius + path.cornerRadius + 1
      for (const h of segs[pi]!.horizontal) {
        const xs: number[] = []
        paths.forEach((other, oi) => {
          if (oi === pi) return
          for (const v of segs[oi]!.vertical) {
            if (v.at < h.from + room || v.at > h.to - room) continue
            if (h.at < v.from + other.cornerRadius + 1 || h.at > v.to - other.cornerRadius - 1) continue
            xs.push(v.at)
          }
        })
        if (xs.length === 0) continue
        xs.sort((a, b) => a - b)
        const spaced = xs.filter((x, i) => i === 0 || x - xs[i - 1]! > 2 * path.jumpRadius! + 1)
        let by = result.get(path.id)
        if (!by) result.set(path.id, (by = new Map()))
        by.set(h.index, [...(by.get(h.index) ?? []), ...spaced])
      }
    })
    return result
  }

  it('finds exactly the same crossings as an exhaustive scan', () => {
    const random = seeded(7)
    const paths: JumpPath[] = Array.from({ length: 60 }, (_, i) => {
      const x0 = Math.round(random() * 800)
      const y0 = Math.round(random() * 600)
      const x1 = Math.round(random() * 800)
      const y1 = Math.round(random() * 600)
      const mid = Math.round(random() * 800)
      return {
        id: `p${i}`,
        points: [
          { x: x0, y: y0 },
          { x: mid, y: y0 },
          { x: mid, y: y1 },
          { x: x1, y: y1 },
        ],
        jumpRadius: random() < 0.8 ? 5 : null,
        cornerRadius: 8,
      }
    })
    const expected = bruteForce(paths)
    const actual = findJumps(paths)
    expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort())
    for (const [id, segments] of expected) {
      expect([...actual.get(id)!.entries()].sort()).toEqual([...segments.entries()].sort())
    }
  })
})
