import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createVisualLinker, type VisualLinker } from '../src/visual-linker'
import { VLConnectionCurveEnum, VLFixedSideEnum, VLMarkerShapeEnum } from '../src/enums'

function makeBlock(id: string, rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('div')
  el.id = id
  el.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 100,
    height: 40,
    x: 0,
    y: 0,
    toJSON() {},
    ...rect,
  })
  document.body.appendChild(el)
  return el
}

function firePointer(el: HTMLElement, type: string, init: PointerEventInit = {}) {
  el.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, clientX: 0, clientY: 0, ...init }),
  )
}

/** A block whose (and whose child port's) rect can be moved after creation, to simulate a drag. */
function makeMovableGroupBlock(left: number) {
  let x = left
  const el = document.createElement('div')
  const child = document.createElement('div')
  child.setAttribute('data-port', 'p')
  el.appendChild(child)
  document.body.appendChild(el)

  const rect = (offsetX: number, offsetWidth: number): DOMRect => ({
    top: 0,
    bottom: 40,
    height: 40,
    left: x + offsetX,
    right: x + offsetX + offsetWidth,
    width: offsetWidth,
    x: x + offsetX,
    y: 0,
    toJSON() {},
  })
  el.getBoundingClientRect = () => rect(0, 180)
  child.getBoundingClientRect = () => rect(150, 30) // the port sits near the group's right edge

  return { el, moveTo: (nextLeft: number) => (x = nextLeft) }
}

describe('createVisualLinker interactivity', () => {
  let container: HTMLElement
  let engine: VisualLinker

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  it('highlights the connections incident to a hovered block', () => {
    const a = makeBlock('a', { left: 0, top: 0 })
    const b = makeBlock('b', { left: 200, top: 0 })
    engine = createVisualLinker(container, { showPorts: false })
    engine.setBlocks([
      { id: 'a', el: a },
      { id: 'b', el: b },
    ])
    engine.setConnections([{ id: 'a-b', from: { blockId: 'a' }, to: { blockId: 'b' } }])

    const path = container.querySelector('path.vl-connection')!
    expect(path.classList.contains('vl-connection--active')).toBe(false)

    firePointer(a, 'pointerenter')
    expect(path.classList.contains('vl-connection--active')).toBe(true)

    firePointer(a, 'pointerleave')
    expect(path.classList.contains('vl-connection--active')).toBe(false)

    engine.destroy()
  })

  it('emits connection:click when the connection hit-area is clicked', () => {
    const a = makeBlock('a', { left: 0, top: 0 })
    const b = makeBlock('b', { left: 200, top: 0 })
    engine = createVisualLinker(container, { showPorts: false })
    engine.setBlocks([
      { id: 'a', el: a },
      { id: 'b', el: b },
    ])
    engine.setConnections([{ id: 'a-b', from: { blockId: 'a' }, to: { blockId: 'b' } }])

    const handler = vi.fn()
    engine.on('connection:click', handler)

    const hit = container.querySelector('path.vl-connection-hit')!
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(handler).toHaveBeenCalledWith({ connection: { id: 'a-b', from: { blockId: 'a' }, to: { blockId: 'b' } } })

    engine.destroy()
  })

  it('drags a block by translating it and fires the drag lifecycle events', () => {
    const a = makeBlock('a', { left: 0, top: 0 })
    engine = createVisualLinker(container, { showPorts: false, draggable: true })
    engine.setBlocks([{ id: 'a', el: a }])

    const events: string[] = []
    engine.on('block:dragstart', () => events.push('start'))
    engine.on('block:drag', (payload) => events.push(`drag:${payload.x},${payload.y}`))
    engine.on('block:dragend', () => events.push('end'))

    firePointer(a, 'pointerdown', { clientX: 10, clientY: 10 })
    firePointer(a, 'pointermove', { clientX: 30, clientY: 25 })
    firePointer(a, 'pointerup', { clientX: 30, clientY: 25 })

    expect(events).toEqual(['start', 'drag:20,15', 'end'])
    expect(a.style.transform).toBe('translate(20px, 15px)')

    engine.destroy()
  })

  it('accepts dragHandle as a direct element, not just a CSS selector', () => {
    const a = makeBlock('a', { left: 0, top: 0 })
    const handle = document.createElement('div')
    a.appendChild(handle)

    engine = createVisualLinker(container, { showPorts: false, draggable: true })
    engine.setBlocks([{ id: 'a', el: a, dragHandle: handle }])

    firePointer(handle, 'pointerdown', { clientX: 10, clientY: 10 })
    firePointer(handle, 'pointermove', { clientX: 30, clientY: 25 })
    firePointer(handle, 'pointerup', { clientX: 30, clientY: 25 })

    expect(a.style.transform).toBe('translate(20px, 15px)')
    expect(handle.classList.contains('vl-draggable')).toBe(true)

    engine.destroy()
  })
})

describe('auto-side ports on a child element', () => {
  it('flips the exit side when the block is dragged past its target (regression: reported hardcoded side bug)', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const target = makeBlock('target', { left: 400, top: 0 })
    const group = makeMovableGroupBlock(0)

    const engine = createVisualLinker(container, { showPorts: false })
    engine.setBlocks([
      { id: 'target', el: target },
      { id: 'group', el: group.el, ports: [{ id: 'p', target: '[data-port="p"]', side: VLFixedSideEnum.AUTO }] },
    ])
    engine.setConnections([{ id: 'c', from: { blockId: 'group', portId: 'p' }, to: { blockId: 'target' } }])

    // Group starts to the left of its target: the port should exit rightward (toward higher x).
    const pathBefore = container.querySelector('path.vl-connection')!.getAttribute('d')!
    const startXBefore = Number(pathBefore.split(' ')[1])
    expect(startXBefore).toBeCloseTo(180, 0) // right edge of the port rect (x=150, width=30)

    // Drag the group far to the right, past the target.
    group.moveTo(1000)
    engine.refresh()

    const pathAfter = container.querySelector('path.vl-connection')!.getAttribute('d')!
    const startXAfter = Number(pathAfter.split(' ')[1])
    expect(startXAfter).toBeCloseTo(1150, 0) // left edge of the port rect, now that the target is behind it

    engine.destroy()
  })

  it('restricts side resolution to the port-declared candidates', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    // Target sits directly above the source — full auto would exit via 'top'.
    const source = makeBlock('source', { left: 0, top: 300, width: 100, height: 40 })
    const target = makeBlock('target', { left: 0, top: 0, width: 100, height: 40 })

    const engine = createVisualLinker(container, { showPorts: false })
    engine.setBlocks([
      { id: 'source', el: source, ports: [{ id: 'p', side: [VLFixedSideEnum.BOTTOM, VLFixedSideEnum.RIGHT] }] },
      { id: 'target', el: target },
    ])
    engine.setConnections([{ id: 'c', from: { blockId: 'source', portId: 'p' }, to: { blockId: 'target' } }])

    const d = container.querySelector('path.vl-connection')!.getAttribute('d')!
    const [, startX, startY] = d.split(' ')
    // 'right' side of source: x = left + width = 100, y = top + height/2 = 320.
    expect(Number(startX)).toBeCloseTo(100, 0)
    expect(Number(startY)).toBeCloseTo(320, 0)

    engine.destroy()
  })
})

describe("anchorBlockId — port renders on another block's border", () => {
  it("renders the port on the anchor block's edge, at the target element's own position along it", () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const group = document.createElement('div')
    const row = document.createElement('div')
    row.setAttribute('data-port', 'row')
    group.appendChild(row)
    document.body.appendChild(group)
    // The group is a wide container; the row inside it is indented and only
    // spans part of its width — without anchoring, the port would sit on the
    // row's own (indented) right edge, not the group's outer edge.
    group.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100)
    row.getBoundingClientRect = () => new DOMRect(20, 40, 100, 20) // right edge at x=120, center y=50

    const target = makeBlock('target', { left: 400, top: 0, width: 100, height: 40 })

    const engine = createVisualLinker(container, { showPorts: false })
    engine.setBlocks([
      {
        id: 'group',
        el: group,
        ports: [{ id: 'p', target: '[data-port="row"]', side: VLFixedSideEnum.RIGHT, anchorBlockId: 'group' }],
      },
      { id: 'target', el: target },
    ])
    engine.setConnections([{ id: 'c', from: { blockId: 'group', portId: 'p' }, to: { blockId: 'target' } }])

    const d = container.querySelector('path.vl-connection')!.getAttribute('d')!
    const [, startX, startY] = d.split(' ')
    // x follows the anchor (group)'s own right edge (200), not the row's (120).
    expect(Number(startX)).toBeCloseTo(200, 0)
    // y still follows the row's own actual center, so it doesn't collapse to the group's center.
    expect(Number(startY)).toBeCloseTo(50, 0)

    engine.destroy()
  })

  it('keeps siblings anchored to the same border in their own relative order', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const group = document.createElement('div')
    const rowA = document.createElement('div')
    const rowB = document.createElement('div')
    rowA.setAttribute('data-port', 'a')
    rowB.setAttribute('data-port', 'b')
    group.append(rowA, rowB)
    document.body.appendChild(group)
    group.getBoundingClientRect = () => new DOMRect(0, 0, 200, 200)
    rowA.getBoundingClientRect = () => new DOMRect(20, 10, 100, 20) // center y=20
    rowB.getBoundingClientRect = () => new DOMRect(20, 110, 100, 20) // center y=120

    const targetA = makeBlock('targetA', { left: 400, top: 0, width: 100, height: 40 })
    const targetB = makeBlock('targetB', { left: 400, top: 200, width: 100, height: 40 })

    const engine = createVisualLinker(container, { showPorts: false })
    engine.setBlocks([
      {
        id: 'group',
        el: group,
        ports: [
          { id: 'pa', target: '[data-port="a"]', side: VLFixedSideEnum.RIGHT, anchorBlockId: 'group' },
          { id: 'pb', target: '[data-port="b"]', side: VLFixedSideEnum.RIGHT, anchorBlockId: 'group' },
        ],
      },
      { id: 'targetA', el: targetA },
      { id: 'targetB', el: targetB },
    ])
    engine.setConnections([
      { id: 'ca', from: { blockId: 'group', portId: 'pa' }, to: { blockId: 'targetA' } },
      { id: 'cb', from: { blockId: 'group', portId: 'pb' }, to: { blockId: 'targetB' } },
    ])

    const paths = [...container.querySelectorAll('path.vl-connection')] as SVGPathElement[]
    const startYOf = (d: string) => Number(d.split(' ')[2])
    const yA = startYOf(paths[0]!.getAttribute('d')!)
    const yB = startYOf(paths[1]!.getAttribute('d')!)
    expect(yA).toBeCloseTo(20, 0)
    expect(yB).toBeCloseTo(120, 0)

    engine.destroy()
  })
})

describe('anchorEl — anchors to an arbitrary element, not just a registered block', () => {
  it('takes precedence over anchorBlockId, and works for an element with no BlockDescriptor of its own', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const group = document.createElement('div')
    const row = document.createElement('div')
    row.setAttribute('data-port', 'row')
    group.appendChild(row)
    document.body.appendChild(group)
    group.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100)
    row.getBoundingClientRect = () => new DOMRect(20, 40, 100, 20) // center y=50

    // A plain wrapper element never registered as a block at all — only reachable via anchorEl.
    const wrapper = document.createElement('div')
    document.body.appendChild(wrapper)
    wrapper.getBoundingClientRect = () => new DOMRect(0, 0, 300, 100)

    const target = makeBlock('target', { left: 500, top: 0, width: 100, height: 40 })

    const engine = createVisualLinker(container, { showPorts: false })
    engine.setBlocks([
      {
        id: 'group',
        el: group,
        // anchorBlockId points at 'group' (right edge 200); anchorEl points at
        // the unrelated wrapper (right edge 300) and should win.
        ports: [
          {
            id: 'p',
            target: '[data-port="row"]',
            side: VLFixedSideEnum.RIGHT,
            anchorBlockId: 'group',
            anchorEl: wrapper,
          },
        ],
      },
      { id: 'target', el: target },
    ])
    engine.setConnections([{ id: 'c', from: { blockId: 'group', portId: 'p' }, to: { blockId: 'target' } }])

    const d = container.querySelector('path.vl-connection')!.getAttribute('d')!
    const [, startX, startY] = d.split(' ')
    expect(Number(startX)).toBeCloseTo(300, 0)
    expect(Number(startY)).toBeCloseTo(50, 0)

    engine.destroy()
  })
})

describe('connection start/end markers', () => {
  it('sets marker-start/marker-end referencing a real <marker> def, and shares defs across identical configs', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const a = makeBlock('a', { left: 0, top: 0 })
    const b = makeBlock('b', { left: 200, top: 0 })
    const c = makeBlock('c', { left: 400, top: 0 })
    const engine = createVisualLinker(container, { showPorts: false })
    engine.setBlocks([
      { id: 'a', el: a },
      { id: 'b', el: b },
      { id: 'c', el: c },
    ])
    engine.setConnections([
      {
        id: 'ab',
        from: { blockId: 'a' },
        to: { blockId: 'b' },
        style: { startMarker: VLMarkerShapeEnum.CIRCLE, endMarker: VLMarkerShapeEnum.ARROW },
      },
      { id: 'bc', from: { blockId: 'b' }, to: { blockId: 'c' }, style: { endMarker: VLMarkerShapeEnum.ARROW } },
    ])

    const paths = [...container.querySelectorAll('path.vl-connection')] as SVGPathElement[]
    const pathAB = paths.find((p) => p.getAttribute('d')?.startsWith('M 100'))!
    const pathBC = paths.find((p) => p.getAttribute('d')?.startsWith('M 300'))!

    expect(pathAB.style.markerStart).toMatch(/^url\(#vl-marker-\d+\)$/)
    expect(pathAB.style.markerEnd).toMatch(/^url\(#vl-marker-\d+\)$/)
    expect(pathBC.style.markerStart).toBe('')
    // Both connections request the same default-color 'arrow' end marker: one shared def.
    expect(pathAB.style.markerEnd).toBe(pathBC.style.markerEnd)

    const endMarkerId = pathAB.style.markerEnd.slice('url(#'.length, -1)
    const markerEl = container.querySelector(`marker#${endMarkerId}`)
    expect(markerEl).not.toBeNull()
    expect(markerEl!.getAttribute('orient')).toBe('auto')

    engine.destroy()
  })

  it('removes marker defs that are no longer referenced by any connection', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const a = makeBlock('a', { left: 0, top: 0 })
    const b = makeBlock('b', { left: 200, top: 0 })
    const engine = createVisualLinker(container, { showPorts: false })
    engine.setBlocks([
      { id: 'a', el: a },
      { id: 'b', el: b },
    ])
    engine.setConnections([
      { id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' }, style: { endMarker: VLMarkerShapeEnum.DIAMOND } },
    ])
    expect(container.querySelectorAll('marker')).toHaveLength(1)

    engine.setConnections([{ id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' } }])
    expect(container.querySelectorAll('marker')).toHaveLength(0)

    engine.destroy()
  })

  it('replaces the generic port dot with the explicit marker instead of layering under it', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const a = makeBlock('a', { left: 0, top: 0 })
    const b = makeBlock('b', { left: 200, top: 0 })
    // showPorts defaults to true — the generic dot would normally appear at both ends.
    const engine = createVisualLinker(container)
    engine.setBlocks([
      { id: 'a', el: a },
      { id: 'b', el: b },
    ])
    engine.setConnections([
      { id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' }, style: { endMarker: VLMarkerShapeEnum.DIAMOND } },
    ])

    // 'a' (start, no explicit marker) still gets its generic dot; 'b' (explicit endMarker) does not.
    expect(container.querySelectorAll('circle.vl-port')).toHaveLength(1)
    expect(container.querySelector('path.vl-connection')!.style.markerEnd).toMatch(/^url\(#vl-marker-\d+\)$/)

    engine.destroy()
  })
})

describe('connection hoverStyle', () => {
  it('leaves stroke/marker color untouched while active when no hoverStyle is given (default CSS-class bump only)', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const a = makeBlock('a', { left: 0, top: 0 })
    const b = makeBlock('b', { left: 200, top: 0 })
    const engine = createVisualLinker(container, { showPorts: false })
    engine.setBlocks([
      { id: 'a', el: a },
      { id: 'b', el: b },
    ])
    engine.setConnections([
      {
        id: 'ab',
        from: { blockId: 'a' },
        to: { blockId: 'b' },
        style: { color: 'blue', endMarker: VLMarkerShapeEnum.ARROW },
      },
    ])

    const path = container.querySelector('path.vl-connection') as SVGPathElement
    const baseMarkerEnd = path.style.markerEnd

    firePointer(a, 'pointerenter')
    expect(path.classList.contains('vl-connection--active')).toBe(true)
    expect(path.style.stroke).toBe('blue')
    expect(path.style.markerEnd).toBe(baseMarkerEnd)

    engine.destroy()
  })

  it('applies hoverStyle color/width/dashed while active, and reverts on deactivate', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const a = makeBlock('a', { left: 0, top: 0 })
    const b = makeBlock('b', { left: 200, top: 0 })
    const engine = createVisualLinker(container, { showPorts: false })
    engine.setBlocks([
      { id: 'a', el: a },
      { id: 'b', el: b },
    ])
    engine.setConnections([
      {
        id: 'ab',
        from: { blockId: 'a' },
        to: { blockId: 'b' },
        style: {
          color: 'green',
          width: 2,
          endMarker: VLMarkerShapeEnum.ARROW,
          hoverStyle: { color: 'red', width: 5, dashed: true },
        },
      },
    ])

    const path = container.querySelector('path.vl-connection') as SVGPathElement
    expect(path.style.stroke).toBe('green')
    expect(path.style.strokeWidth).toBe('2')
    expect(path.style.strokeDasharray).toBe('')
    const baseMarkerEnd = path.style.markerEnd

    firePointer(a, 'pointerenter')
    expect(path.style.stroke).toBe('red')
    expect(path.style.strokeWidth).toBe('5')
    expect(path.style.strokeDasharray).toBe('6 4')
    // The arrow recolors to match — otherwise it'd clash with the now-red line.
    expect(path.style.markerEnd).not.toBe(baseMarkerEnd)

    firePointer(a, 'pointerleave')
    expect(path.style.stroke).toBe('green')
    expect(path.style.strokeWidth).toBe('2')
    expect(path.style.strokeDasharray).toBe('')
    expect(path.style.markerEnd).toBe(baseMarkerEnd)

    engine.destroy()
  })

  it('keeps a connection highlighted through a render triggered while it is still active', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const a = makeBlock('a', { left: 0, top: 0 })
    const b = makeBlock('b', { left: 200, top: 0 })
    const engine = createVisualLinker(container, { showPorts: false })
    engine.setBlocks([
      { id: 'a', el: a },
      { id: 'b', el: b },
    ])
    engine.setConnections([
      { id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' }, style: { hoverStyle: { color: 'red' } } },
    ])

    firePointer(a, 'pointerenter')
    engine.refresh()

    const path = container.querySelector('path.vl-connection') as SVGPathElement
    expect(path.classList.contains('vl-connection--active')).toBe(true)
    expect(path.style.stroke).toBe('red')

    engine.destroy()
  })
})

function parseBezier(d: string) {
  const match = d.match(/^M ([\d.-]+) ([\d.-]+) C ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+)$/)
  if (!match) throw new Error(`not a bezier path: ${d}`)
  const [, fx, fy, c1x, c1y, c2x, c2y, tx, ty] = match.map(Number) as unknown as number[]
  return { from: { x: fx, y: fy }, c1: { x: c1x, y: c1y }, c2: { x: c2x, y: c2y }, to: { x: tx, y: ty } }
}

describe('per-connection and instance-wide curve geometry config', () => {
  it('lets a connection override curveMaxReach beyond the instance default', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const a = makeBlock('a', { left: 0, top: 0, width: 100, height: 40 })
    const b = makeBlock('b', { left: 1000, top: 0, width: 100, height: 40 })
    const engine = createVisualLinker(container, { showPorts: false })
    engine.setBlocks([
      { id: 'a', el: a },
      { id: 'b', el: b },
    ])

    engine.setConnections([{ id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' } }])
    const defaultPath = parseBezier(container.querySelector('path.vl-connection')!.getAttribute('d')!)
    expect(defaultPath.c1.x - defaultPath.from.x).toBeCloseTo(160, 5) // default maxReach caps it here

    engine.setConnections([{ id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' }, style: { curveMaxReach: 300 } }])
    const widerPath = parseBezier(container.querySelector('path.vl-connection')!.getAttribute('d')!)
    expect(widerPath.c1.x - widerPath.from.x).toBeCloseTo(300, 5)

    engine.destroy()
  })

  it('applies an instance-wide curve default to every connection that does not override it', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const a = makeBlock('a', { left: 0, top: 0, width: 100, height: 40 })
    const b = makeBlock('b', { left: 1000, top: 0, width: 100, height: 40 })
    const engine = createVisualLinker(container, { showPorts: false, defaultCurveMaxReach: 300 })
    engine.setBlocks([
      { id: 'a', el: a },
      { id: 'b', el: b },
    ])
    engine.setConnections([{ id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' } }])

    const path = parseBezier(container.querySelector('path.vl-connection')!.getAttribute('d')!)
    expect(path.c1.x - path.from.x).toBeCloseTo(300, 5)

    engine.destroy()
  })

  it('lets a connection disable the angle lean entirely (curveAngleBlend: 0) to stay strictly perpendicular', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    // b sits diagonally from a, so the resolved side's normal and the true direction diverge.
    const a = makeBlock('a', { left: 0, top: 0, width: 100, height: 40 })
    const b = makeBlock('b', { left: 300, top: 300, width: 100, height: 40 })
    const engine = createVisualLinker(container, { showPorts: false })
    engine.setBlocks([
      { id: 'a', el: a },
      { id: 'b', el: b },
    ])

    engine.setConnections([{ id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' }, style: { curveAngleBlend: 0 } }])
    const straightNormal = parseBezier(container.querySelector('path.vl-connection')!.getAttribute('d')!)
    // No lean at all: the control point stays exactly on the horizontal/vertical cardinal axis.
    expect(straightNormal.c1.y).toBeCloseTo(straightNormal.from.y, 5)

    engine.setConnections([
      {
        id: 'ab',
        from: { blockId: 'a' },
        to: { blockId: 'b' },
        style: { curveAngleBlend: 1, curveAngleMaxOffset: 90 },
      },
    ])
    const fullyLeaning = parseBezier(container.querySelector('path.vl-connection')!.getAttribute('d')!)
    // Fully leaning toward a diagonal target moves the control point off-axis.
    expect(Math.abs(fullyLeaning.c1.y - fullyLeaning.from.y)).toBeGreaterThan(1)

    engine.destroy()
  })
})

describe("curve: 'smoothstep' — grouped orthogonal routing", () => {
  it('routes the nearest sibling straight through a shared branch point, and peels the other one off sideways', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    // Mirrors the Block3 → Block4/Block5 mockup: one shared bottom port fanning
    // out to a target directly below (nearest) and one further down and to the right.
    const b3 = makeBlock('b3', { left: 0, top: 0, width: 200, height: 90 })
    const b4 = makeBlock('b4', { left: 0, top: 200, width: 200, height: 40 })
    const b5 = makeBlock('b5', { left: 300, top: 250, width: 200, height: 40 })

    const engine = createVisualLinker(container, { showPorts: false })
    engine.setBlocks([
      { id: 'b3', el: b3, ports: [{ id: 'out', side: VLFixedSideEnum.BOTTOM }] },
      { id: 'b4', el: b4, ports: [{ id: 'in', side: VLFixedSideEnum.TOP }] },
      { id: 'b5', el: b5, ports: [{ id: 'in', side: VLFixedSideEnum.TOP }] },
    ])
    // maxTrunkReach raised well past b4's 110px distance — this test is about
    // the branch/nearest logic, not the cap (which gets its own test below).
    engine.setConnections([
      {
        id: 'toNear',
        from: { blockId: 'b3', portId: 'out' },
        to: { blockId: 'b4', portId: 'in' },
        style: { curve: VLConnectionCurveEnum.SMOOTHSTEP, cornerRadius: 0, maxTrunkReach: 200 },
      },
      {
        id: 'toFar',
        from: { blockId: 'b3', portId: 'out' },
        to: { blockId: 'b5', portId: 'in' },
        style: { curve: VLConnectionCurveEnum.SMOOTHSTEP, cornerRadius: 0, maxTrunkReach: 200 },
      },
    ])

    const paths = [...container.querySelectorAll('path.vl-connection')] as SVGPathElement[]
    const near = paths.find((el) => el.getAttribute('d')?.startsWith('M 100 90 L 100 200'))!
    const far = paths.find((el) => el !== near)!

    // The nearest sibling (b4, directly below) runs straight down with no extra bend.
    expect(near.getAttribute('d')).toBe('M 100 90 L 100 200')
    // The farther sibling (b5) shares that exact same trunk, then peels off toward its own target.
    expect(far.getAttribute('d')).toBe('M 100 90 L 100 200 L 400 200 L 400 250')

    engine.destroy()
  })

  it('caps the default trunk length so two targets tying in the same column stay a short, distinct stub (not a long merged line)', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    // b17/b18-like case: both targets sit in the exact same column, far to the
    // right of the shared port — without a cap, the trunk would stretch all
    // the way out to that column for both, making this port's fan-out look
    // like it merges with whatever else happens to run through that column.
    const source = makeBlock('source', { left: 0, top: 0, width: 100, height: 40 })
    const top = makeBlock('top', { left: 300, top: -10, width: 100, height: 40 })
    const bottom = makeBlock('bottom', { left: 300, top: 100, width: 100, height: 40 })

    const engine = createVisualLinker(container, { showPorts: false })
    engine.setBlocks([
      { id: 'source', el: source, ports: [{ id: 'out', side: VLFixedSideEnum.RIGHT }] },
      { id: 'top', el: top, ports: [{ id: 'in', side: VLFixedSideEnum.TOP }] },
      { id: 'bottom', el: bottom, ports: [{ id: 'in', side: VLFixedSideEnum.TOP }] },
    ])
    engine.setConnections([
      {
        id: 'toTop',
        from: { blockId: 'source', portId: 'out' },
        to: { blockId: 'top', portId: 'in' },
        style: { curve: VLConnectionCurveEnum.SMOOTHSTEP, cornerRadius: 0 },
      },
      {
        id: 'toBottom',
        from: { blockId: 'source', portId: 'out' },
        to: { blockId: 'bottom', portId: 'in' },
        style: { curve: VLConnectionCurveEnum.SMOOTHSTEP, cornerRadius: 0 },
      },
    ])

    const paths = [...container.querySelectorAll('path.vl-connection')].map((el) => el.getAttribute('d')!)
    // Anchor is (100, 20); with the 48px default cap, the shared trunk stops at
    // x=148 — well short of the shared target column at x=300 — instead of
    // both siblings' trunks stretching all the way out to it.
    const sharedTrunk = 'M 100 20 L 148 20'
    for (const d of paths) expect(d.startsWith(sharedTrunk)).toBe(true)
    // Without the cap this would instead be a shared prefix all the way to x=300.
    for (const d of paths) expect(d).not.toContain('L 300 20')

    engine.destroy()
  })

  it('routes a solo smoothstep connection as a plain rounded orthogonal path (no grouping)', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const a = makeBlock('a', { left: 0, top: 0, width: 100, height: 40 })
    const b = makeBlock('b', { left: 200, top: 100, width: 100, height: 40 })
    const engine = createVisualLinker(container, { showPorts: false })
    engine.setBlocks([
      { id: 'a', el: a, ports: [{ id: 'out', side: VLFixedSideEnum.RIGHT }] },
      { id: 'b', el: b, ports: [{ id: 'in', side: VLFixedSideEnum.TOP }] },
    ])
    engine.setConnections([
      {
        id: 'ab',
        from: { blockId: 'a', portId: 'out' },
        to: { blockId: 'b', portId: 'in' },
        style: { curve: VLConnectionCurveEnum.SMOOTHSTEP, cornerRadius: 0 },
      },
    ])

    const d = container.querySelector('path.vl-connection')!.getAttribute('d')
    // a's right-center (100,20) turns once to reach b's top-center (250,100).
    expect(d).toBe('M 100 20 L 250 20 L 250 100')

    engine.destroy()
  })

  it('rounds the corners (including the branch point) when cornerRadius is left at its default', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const a = makeBlock('a', { left: 0, top: 0, width: 100, height: 40 })
    const b = makeBlock('b', { left: 200, top: 100, width: 100, height: 40 })
    const engine = createVisualLinker(container, { showPorts: false })
    engine.setBlocks([
      { id: 'a', el: a, ports: [{ id: 'out', side: VLFixedSideEnum.RIGHT }] },
      { id: 'b', el: b, ports: [{ id: 'in', side: VLFixedSideEnum.TOP }] },
    ])
    engine.setConnections([
      {
        id: 'ab',
        from: { blockId: 'a', portId: 'out' },
        to: { blockId: 'b', portId: 'in' },
        style: { curve: VLConnectionCurveEnum.SMOOTHSTEP },
      },
    ])

    const d = container.querySelector('path.vl-connection')!.getAttribute('d')!
    expect(d).toContain('Q') // a rounded corner, not a sharp one

    engine.destroy()
  })
})
