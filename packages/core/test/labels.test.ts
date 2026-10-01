import { afterEach, describe, expect, it } from 'vitest'
import { labelDistance, layoutLabel, polylineLength, samplePolyline, uprightRotation } from '../src/path-sampling'
import { bezierPolyline } from '../src/geometry'
import { createVisualLinker, type VisualLinker } from '../src/visual-linker'
import { VLConnectionCurveEnum, VLFixedSideEnum } from '../src/enums'
import type { ConnectionLayout } from '../src/types'

const L = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
] // 150 long: right, then down

describe('path sampling', () => {
  it('measures a polyline and samples a point plus the direction of travel at a distance', () => {
    expect(polylineLength(L)).toBe(150)
    expect(samplePolyline(L, 50)).toEqual({ point: { x: 50, y: 0 }, angle: 0 })
    const down = samplePolyline(L, 125)
    expect(down.point).toEqual({ x: 100, y: 25 })
    expect(down.angle).toBe(90)
  })

  it('clamps to the ends and skips zero-length segments', () => {
    expect(samplePolyline(L, -10).point).toEqual({ x: 0, y: 0 })
    expect(samplePolyline(L, 999).point).toEqual({ x: 100, y: 50 })
    const withDuplicate = [L[0]!, L[0]!, L[1]!]
    expect(samplePolyline(withDuplicate, 40)).toEqual({ point: { x: 40, y: 0 }, angle: 0 })
  })

  it('resolves positions: start/end are inset from the ends (capped at half), middle, and a clamped fraction', () => {
    expect(labelDistance('start', 150)).toBe(24)
    expect(labelDistance('end', 150)).toBe(126)
    expect(labelDistance('start', 30)).toBe(15) // never past the middle of a short line
    expect(labelDistance('middle', 150)).toBe(75)
    expect(labelDistance(0.2, 150)).toBe(30)
    expect(labelDistance(7, 150)).toBe(150)
    expect(labelDistance(-1, 150)).toBe(0)
  })

  it('keeps rotated text upright', () => {
    expect(uprightRotation(0)).toBe(0)
    expect(uprightRotation(45)).toBe(45)
    expect(uprightRotation(135)).toBe(-45) // pointing left-down: flipped
    expect(uprightRotation(-135)).toBe(45)
    expect(uprightRotation(180)).toBe(0)
  })

  it('offsets along the normal to the right of travel, and only rotates on request', () => {
    const straight = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]
    expect(layoutLabel({ id: 'a', position: 'middle', offset: 10 }, straight).point).toEqual({ x: 50, y: 10 }) // below a rightward line
    const down = layoutLabel({ id: 'a', position: 0.5, offset: 10, rotate: true }, [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ])
    expect(down.point.x).toBeCloseTo(-10) // right of "down" is screen-left
    expect(down.point.y).toBeCloseTo(50)
    expect(down.rotation).toBe(90)
    expect(layoutLabel({ id: 'a', position: 'middle' }, straight).rotation).toBe(0)
  })

  it('flattens a bezier into points that start and end on the endpoints', () => {
    const points = bezierPolyline({ x: 0, y: 0 }, VLFixedSideEnum.RIGHT, { x: 200, y: 100 }, VLFixedSideEnum.LEFT)
    expect(points).toHaveLength(49)
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points[48]!.x).toBeCloseTo(200)
    expect(points[48]!.y).toBeCloseTo(100)
  })
})

describe('connection labels in the engine', () => {
  let engine: VisualLinker | undefined
  afterEach(() => {
    engine?.destroy()
    document.body.innerHTML = ''
  })

  function setup(connection: object, curve = VLConnectionCurveEnum.STRAIGHT) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const make = (id: string, left: number) => {
      const el = document.createElement('div')
      el.getBoundingClientRect = () => new DOMRect(left, 0, 100, 40)
      container.appendChild(el)
      return { id, el }
    }
    engine = createVisualLinker(container, { showPorts: false })
    let layout: ConnectionLayout | undefined
    engine.on('layout', ({ connections }) => (layout = connections[0]))
    engine.setBlocks([make('a', 0), make('b', 300)])
    const set = (extra: object) =>
      engine!.setConnections([{ id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' }, style: { curve }, ...extra }])
    set(connection)
    return { container, layout: () => layout!, set }
  }

  it('reports no labels unless asked', () => {
    expect(setup({}).layout().labels).toEqual([])
  })

  it('places labels at start / middle / end of a straight line (100 -> 300 at y=20)', () => {
    const { layout } = setup({
      labels: [
        { id: 's', position: 'start' },
        { id: 'm', position: 'middle' },
        { id: 'e', position: 'end' },
      ],
    })
    expect(layout().labels.map((label) => [label.id, label.point.x, label.point.y])).toEqual([
      ['s', 124, 20],
      ['m', 200, 20],
      ['e', 276, 20],
    ])
  })

  it('draws labels that have text as SVG pills — sized, positioned, classed — and leaves text-less ones to the slot', () => {
    const { container, set } = setup({
      labels: [
        { id: 'a', position: 'middle', text: 'hello', className: 'warn', rotate: true, offset: -8 },
        { id: 'b', position: 'start' },
      ],
    })
    const pills = container.querySelectorAll('g.vl-label')
    expect(pills).toHaveLength(1)
    const pill = pills[0]!
    expect(pill.classList.contains('warn')).toBe(true)
    expect(pill.querySelector('text')!.textContent).toBe('hello')
    expect(pill.getAttribute('transform')).toBe('translate(200 12) rotate(0)')
    expect(Number(pill.querySelector('rect')!.getAttribute('width'))).toBeGreaterThan(30)

    set({ labels: [{ id: 'a', position: 'middle', text: 'changed' }] })
    expect(container.querySelector('g.vl-label text')!.textContent).toBe('changed')

    set({})
    expect(container.querySelectorAll('g.vl-label')).toHaveLength(0)
  })

  it('keeps library-drawn labels on top of lines and port dots, even after paths are raised or ports re-created (regression: a dragged block left its label under the line)', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    let left = 0
    const el = document.createElement('div')
    el.getBoundingClientRect = () => new DOMRect(left, 0, 100, 40)
    const other = document.createElement('div')
    other.getBoundingClientRect = () => new DOMRect(300, 0, 100, 40)
    container.append(el, other)
    engine = createVisualLinker(container, { showPorts: true })
    engine.setBlocks([
      { id: 'a', el },
      { id: 'b', el: other },
    ])
    engine.setConnections([
      { id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' }, labels: [{ id: 'l', position: 'middle', text: 'hi' }] },
    ])

    const svg = container.querySelector('svg')!
    const assertLabelOnTop = () => {
      const label = svg.querySelector('g.vl-label')!
      const everythingElse = [...svg.querySelectorAll('path.vl-connection, path.vl-connection-hit, circle.vl-port')]
      expect(everythingElse.length).toBeGreaterThan(0)
      for (const node of everythingElse) {
        expect(node.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      }
    }
    assertLabelOnTop()

    // "Drag" block a: its port dot moves, so it is re-created (the dot is keyed by its position) — then hover raises the line.
    for (const next of [30, 60, 90]) {
      left = next
      engine.refresh()
      container.querySelector('path.vl-connection-hit')!.dispatchEvent(new Event('pointerenter'))
      assertLabelOnTop()
      container.querySelector('path.vl-connection-hit')!.dispatchEvent(new Event('pointerleave'))
    }
  })

  it('places labels along smoothstep and bezier lines too (on the path, within its bounds)', () => {
    for (const curve of [VLConnectionCurveEnum.SMOOTHSTEP, VLConnectionCurveEnum.BEZIER]) {
      const { layout } = setup({ labels: [{ id: 'q', position: 0.25 }] }, curve)
      const point = layout().labels[0]!.point
      expect(point.x).toBeGreaterThan(100)
      expect(point.x).toBeLessThan(300)
      engine!.destroy()
    }
  })
})
