import { describe, expect, it } from 'vitest'
import { clampToRect, clippingAncestors, visibleRect } from '../src/clipping'
import { mergeConfig } from '../src/config'
import { createVisualLinker } from '../src/visual-linker'

function rectOf(el: HTMLElement, left: number, top: number, width: number, height: number) {
  el.getBoundingClientRect = () => new DOMRect(left, top, width, height)
}

describe('clipping helpers', () => {
  it('finds clipping ancestors innermost-first, stopping at the container, and reads per-axis overflow', () => {
    const container = document.createElement('div')
    const outer = document.createElement('div')
    const scroller = document.createElement('div')
    const plain = document.createElement('div')
    const el = document.createElement('div')
    container.append(outer)
    outer.style.overflow = 'hidden' // above the container's child, still inside it
    outer.append(scroller)
    scroller.style.overflowY = 'auto'
    scroller.append(plain)
    plain.append(el)
    document.body.append(container)

    const chain = clippingAncestors(el, container)
    expect(chain.map((a) => a.el)).toEqual([scroller, outer])
    expect(chain[0]).toMatchObject({ x: false, y: true })
    expect(chain[1]).toMatchObject({ x: true, y: true })
    // Anything above the container is never part of the chain.
    expect(clippingAncestors(el, outer).map((a) => a.el)).toEqual([scroller])
    container.remove()
  })

  it('intersects the ancestors per axis, and returns null when nothing clips', () => {
    expect(visibleRect([])).toBeNull()
    const a = document.createElement('div')
    const b = document.createElement('div')
    rectOf(a, 0, 0, 100, 100)
    rectOf(b, 20, -50, 500, 80)
    expect(
      visibleRect([
        { el: a, x: true, y: true },
        { el: b, x: false, y: true },
      ]),
    ).toEqual({ left: 0, top: 0, right: 100, bottom: 30 })
  })

  it('clamps a point into the rect, flagging only a real move', () => {
    const rect = { left: 0, top: 0, right: 100, bottom: 50 }
    expect(clampToRect({ x: 40, y: 20 }, rect)).toEqual({ point: { x: 40, y: 20 }, clipped: false })
    expect(clampToRect({ x: 100.5, y: 20 }, rect).clipped).toBe(false) // within tolerance of the edge
    expect(clampToRect({ x: 150, y: -30 }, rect)).toEqual({ point: { x: 100, y: 0 }, clipped: true })
  })
})

describe('clipToScrollParents', () => {
  /** A scrolling list (visible window y 100..200) holding a row, linked to a block outside it. */
  function setup(options: Parameters<typeof createVisualLinker>[1], rowTop: number) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    rectOf(container, 0, 0, 800, 600)

    const list = document.createElement('div')
    list.style.overflowY = 'auto'
    rectOf(list, 0, 100, 200, 100)
    const row = document.createElement('div')
    rectOf(row, 0, rowTop, 200, 30)
    list.append(row)
    container.append(list)

    const outside = document.createElement('div')
    rectOf(outside, 500, 140, 100, 40)
    container.append(outside)

    const engine = createVisualLinker(container, mergeConfig({ ports: { show: false } }, options))
    let layout: { from: { x: number; y: number }; fromClipped?: boolean } | undefined
    engine.on('layout', ({ connections }) => (layout = connections[0]))
    engine.setBlocks([
      { id: 'list', el: list, ports: [{ id: 'row', target: row, side: 'right' as never }] },
      { id: 'outside', el: outside },
    ])
    engine.setConnections([{ id: 'c', from: { blockId: 'list', portId: 'row' }, to: { blockId: 'outside' } }])
    const path = container.querySelector('path.vl-connection') as SVGPathElement | null
    return { engine, layout: () => layout, path, container }
  }

  it('leaves a visible port alone', () => {
    const { engine, layout } = setup({}, 130)
    expect(layout()!.fromClipped).toBe(false)
    expect(layout()!.from.y).toBe(145)
    engine.destroy()
  })

  it("pins a port scrolled out of its scroller to the visible edge, and drops that end's marker", () => {
    const { engine, layout, path } = setup({}, 300) // row far below the window
    expect(layout()!.fromClipped).toBe(true)
    expect(layout()!.from.y).toBe(200) // the scroller's bottom edge, not the row's y
    expect(path!.style.markerStart).toBe('')
    engine.destroy()
  })

  it("'hide' drops the whole connection, and `false` keeps drawing to the invisible block", () => {
    const hidden = setup({ interaction: { clipToScrollParents: 'hide' } }, 300)
    expect(hidden.container.querySelector('path.vl-connection')).toBeNull()
    hidden.engine.destroy()

    const ignored = setup({ interaction: { clipToScrollParents: false } }, 300)
    expect(ignored.layout()!.fromClipped).toBe(false)
    expect(ignored.layout()!.from.y).toBe(315)
    ignored.engine.destroy()
  })

  it('follows the scroll: the same port is unpinned once it scrolls back into view', () => {
    const { engine, layout, container } = setup({}, 300)
    const row = container.querySelector('div > div > div') as HTMLElement
    expect(layout()!.fromClipped).toBe(true)
    rectOf(row, 0, 150, 200, 30)
    engine.refresh()
    expect(layout()!.fromClipped).toBe(false)
    expect(layout()!.from.y).toBe(165)
    engine.destroy()
  })
})
