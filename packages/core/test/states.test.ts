import { afterEach, describe, expect, it } from 'vitest'
import { createVisualLinker, type VisualLinker } from '../src/visual-linker'
import { VLMarkerShapeEnum } from '../src/enums'
import type { ConnectionStyle, VisualLinkerConfig } from '../src/types'

function block(id: string, left: number, top: number): HTMLElement {
  const el = document.createElement('div')
  el.id = id
  el.getBoundingClientRect = () => new DOMRect(left, top, 100, 40)
  document.body.appendChild(el)
  return el
}

const pointer = (el: Element, type: string, init: PointerEventInit = {}) =>
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init }))

let engine: VisualLinker | undefined

function setup(config: VisualLinkerConfig, style?: ConnectionStyle) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  engine = createVisualLinker(container, config)
  const a = block('a', 0, 0)
  const b = block('b', 300, 0)
  engine.setBlocks([
    { id: 'a', el: a },
    { id: 'b', el: b },
  ])
  engine.setConnections([{ id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' }, ...(style ? { style } : {}) }])
  const path = () => container.querySelector('path.vl-connection') as SVGPathElement
  const hit = () => container.querySelector('path.vl-connection-hit') as SVGPathElement
  const svg = () => container.querySelector('svg.vl-svg') as SVGSVGElement
  const marker = (position: 'markerStart' | 'markerEnd') => {
    const ref = path().style[position]
    if (!ref) return null
    return container.querySelector(`marker#${ref.slice('url(#'.length, -1)}`) as SVGMarkerElement
  }
  return { engine, container, a, b, path, hit, svg, marker }
}

afterEach(() => {
  engine?.destroy()
  engine = undefined
  document.body.innerHTML = ''
})

describe('lines config', () => {
  it('applies the group defaults to every connection, and a connection overrides them', () => {
    const { path, container } = setup({ ports: { show: false }, lines: { color: 'teal', width: 3, dashed: true } })
    expect(path().style.stroke).toBe('teal')
    expect(path().style.strokeWidth).toBe('3')
    expect(path().style.strokeDasharray).not.toBe('')

    engine!.addConnection({
      id: 'ba',
      from: { blockId: 'b' },
      to: { blockId: 'a' },
      style: { color: 'orange', dashed: false },
    })
    const [, other] = [...container.querySelectorAll('path.vl-connection')] as SVGPathElement[]
    expect(other!.style.stroke).toBe('orange')
    expect(other!.style.strokeWidth).toBe('3')
    expect(other!.style.strokeDasharray).toBe('')
  })

  it('takes the curve, the bezier and the smoothstep settings from the group', () => {
    const bezier = setup({ ports: { show: false }, lines: { bezier: { curvature: 0.9 } } })
    const strong = bezier.path().getAttribute('d')
    engine!.destroy()
    document.body.innerHTML = ''
    const plain = setup({ ports: { show: false } })
      .path()
      .getAttribute('d')
    expect(strong).not.toBe(plain)

    engine!.destroy()
    document.body.innerHTML = ''
    const smooth = setup({ ports: { show: false }, lines: { curve: 'smoothstep', smoothstep: { cornerRadius: 0 } } })
    expect(smooth.path().getAttribute('d')).not.toContain('Q')
  })
})

describe('line states', () => {
  it('applies the hover, selected and focus variants of the group, hover over selected', () => {
    const { path, a, hit } = setup({
      ports: { show: false },
      interaction: { selectable: true },
      lines: {
        color: 'gray',
        width: 2,
        hover: { color: 'red' },
        selected: { color: 'green', width: 6, dashed: true },
        focus: { width: 8 },
      },
    })
    expect(path().style.stroke).toBe('gray')

    engine!.setSelectedConnections(['ab'])
    expect(path().style.stroke).toBe('green')
    expect(path().style.strokeWidth).toBe('6')
    expect(path().style.strokeDasharray).not.toBe('')

    pointer(a, 'pointerenter')
    expect(path().style.stroke).toBe('red')
    expect(path().style.strokeWidth).toBe('6')

    hit().dispatchEvent(new FocusEvent('focus'))
    expect(path().style.strokeWidth).toBe('8')

    hit().dispatchEvent(new FocusEvent('blur'))
    pointer(a, 'pointerleave')
    engine!.setSelectedConnections([])
    expect(path().style.stroke).toBe('gray')
    expect(path().style.strokeWidth).toBe('2')
  })

  it('merges the connection state over the group state field by field', () => {
    const { path, a } = setup(
      { ports: { show: false }, lines: { hover: { color: 'red', width: 5 } } },
      { hover: { width: 9 } },
    )
    pointer(a, 'pointerenter')
    expect(path().style.stroke).toBe('red')
    expect(path().style.strokeWidth).toBe('9')
  })

  it('adds the default width bump to an explicit width only when no state sets one', () => {
    const bumped = setup({ ports: { show: false }, lines: { width: 2 } })
    pointer(bumped.a, 'pointerenter')
    expect(bumped.path().style.strokeWidth).toBe('3.5')
    engine!.destroy()
    document.body.innerHTML = ''

    const explicit = setup({ ports: { show: false }, lines: { width: 2, hover: { width: 7 } } })
    pointer(explicit.a, 'pointerenter')
    expect(explicit.path().style.strokeWidth).toBe('7')
  })
})

describe('markers config', () => {
  it('draws the instance markers on every connection, in place of the port dot at that end', () => {
    const { container, marker } = setup({ markers: { end: VLMarkerShapeEnum.ARROW } })
    expect(marker('markerEnd')).not.toBeNull()
    expect(marker('markerStart')).toBeNull()
    expect(container.querySelectorAll('circle.vl-port')).toHaveLength(1)
  })

  it('lets a connection replace or remove an instance marker', () => {
    const replaced = setup(
      { ports: { show: false }, markers: { end: VLMarkerShapeEnum.ARROW } },
      { markers: { end: VLMarkerShapeEnum.SQUARE } },
    )
    expect(replaced.marker('markerEnd')!.querySelector('rect')).not.toBeNull()
    engine!.destroy()
    document.body.innerHTML = ''

    const removed = setup(
      { ports: { show: false }, markers: { end: VLMarkerShapeEnum.ARROW } },
      { markers: { end: false } },
    )
    expect(removed.marker('markerEnd')).toBeNull()
  })

  it('changes shape, colors, outline and size in the hover and selected states', () => {
    const { a, marker } = setup({
      ports: { show: false },
      markers: {
        end: {
          shape: VLMarkerShapeEnum.CIRCLE,
          size: 6,
          color: '#111111',
          hover: {
            shape: VLMarkerShapeEnum.DIAMOND,
            size: 10,
            color: '#222222',
            strokeColor: '#333333',
            strokeWidth: 2,
          },
          selected: { svg: '<path d="M0 0 L20 20" />' },
        },
      },
    })
    expect(marker('markerEnd')!.querySelector('circle')).not.toBeNull()
    expect(marker('markerEnd')!.getAttribute('markerHeight')).toBe('6')

    pointer(a, 'pointerenter')
    const hovered = marker('markerEnd')!
    expect(hovered.querySelector('circle')).toBeNull()
    const polygon = hovered.querySelector('polygon')!
    expect(polygon.getAttribute('fill')).toBe('#222222')
    expect(polygon.getAttribute('stroke')).toBe('#333333')
    expect(polygon.getAttribute('stroke-width')).toBe('2')
    expect(hovered.getAttribute('markerHeight')).toBe('10')

    pointer(a, 'pointerleave')
    engine!.setSelectedConnections(['ab'])
    expect(marker('markerEnd')!.innerHTML).toContain('M0 0 L20 20')
  })

  it('makes a marker follow the line color of the current state unless it sets its own', () => {
    const followed = setup({
      ports: { show: false },
      lines: { color: '#aa0000', hover: { color: '#00aa00' } },
      markers: { end: VLMarkerShapeEnum.CIRCLE },
    })
    expect(followed.marker('markerEnd')!.querySelector('circle')!.getAttribute('fill')).toBe('#aa0000')
    pointer(followed.a, 'pointerenter')
    expect(followed.marker('markerEnd')!.querySelector('circle')!.getAttribute('fill')).toBe('#00aa00')
    engine!.destroy()
    document.body.innerHTML = ''

    const fixed = setup({
      ports: { show: false },
      lines: { color: '#aa0000', hover: { color: '#00aa00' } },
      markers: { end: { shape: VLMarkerShapeEnum.CIRCLE, color: '#0000aa' } },
    })
    pointer(fixed.a, 'pointerenter')
    expect(fixed.marker('markerEnd')!.querySelector('circle')!.getAttribute('fill')).toBe('#0000aa')
  })

  it('applies the per-shape sizes of the group', () => {
    const { marker } = setup({
      ports: { show: false },
      markers: { end: VLMarkerShapeEnum.SQUARE, sizes: { square: 13 } },
    })
    expect(marker('markerEnd')!.getAttribute('markerHeight')).toBe('13')
  })
})

describe('theme', () => {
  it('writes the tokens as CSS variables and removes them when unset', () => {
    const { svg } = setup({ theme: { line: '#abcdef', portFill: '#123456' } })
    expect(svg().style.getPropertyValue('--vl-line-color')).toBe('#abcdef')
    expect(svg().style.getPropertyValue('--vl-port-fill')).toBe('#123456')
    expect(svg().style.getPropertyValue('--vl-label-bg')).toBe('')

    engine!.setConfig({ theme: { line: undefined, labelBackground: '#000000' } })
    expect(svg().style.getPropertyValue('--vl-line-color')).toBe('')
    expect(svg().style.getPropertyValue('--vl-port-fill')).toBe('#123456')
    expect(svg().style.getPropertyValue('--vl-label-bg')).toBe('#000000')
  })

  it('colors markers from the theme line color of the state', () => {
    const { marker, a } = setup({
      ports: { show: false },
      theme: { line: '#112233', lineHover: '#445566' },
      markers: { end: VLMarkerShapeEnum.CIRCLE },
    })
    expect(marker('markerEnd')!.querySelector('circle')!.getAttribute('fill')).toBe('#112233')
    pointer(a, 'pointerenter')
    expect(marker('markerEnd')!.querySelector('circle')!.getAttribute('fill')).toBe('#445566')
  })

  it('lets an explicit line color beat the theme', () => {
    const { marker } = setup(
      { ports: { show: false }, theme: { line: '#112233' }, markers: { end: VLMarkerShapeEnum.CIRCLE } },
      { color: '#ff0000' },
    )
    expect(marker('markerEnd')!.querySelector('circle')!.getAttribute('fill')).toBe('#ff0000')
  })
})

describe('labels config', () => {
  function labelled(config: VisualLinkerConfig) {
    const result = setup(config)
    engine!.setConnections([
      {
        id: 'ab',
        from: { blockId: 'a' },
        to: { blockId: 'b' },
        labels: [{ id: 'l', position: 'middle', text: 'hello' }],
      },
    ])
    const label = () => result.container.querySelector('g.vl-label') as SVGGElement
    return { ...result, label }
  }

  it('styles every library-drawn label from the group', () => {
    const { label } = labelled({
      ports: { show: false },
      labels: { background: '#fefefe', border: '#010101', color: '#202020', fontSize: 15, paddingX: 10 },
    })
    const rect = label().querySelector('rect')!
    const text = label().querySelector('text')!
    expect(rect.style.fill).toBe('#fefefe')
    expect(rect.style.stroke).toBe('#010101')
    expect(text.style.fill).toBe('#202020')
    expect(text.style.fontSize).toBe('15px')
    expect(Number(rect.getAttribute('width'))).toBeGreaterThan(20)
  })

  it('follows the state of its connection', () => {
    const { label, a } = labelled({
      ports: { show: false },
      labels: { background: 'white', hover: { background: 'yellow', fontSize: 20 } },
    })
    expect(label().querySelector('rect')!.style.fill).toBe('white')
    const resting = Number(label().querySelector('rect')!.getAttribute('width'))
    pointer(a, 'pointerenter')
    expect(label().querySelector('rect')!.style.fill).toBe('yellow')
    expect(Number(label().querySelector('rect')!.getAttribute('width'))).toBeGreaterThan(resting)
    pointer(a, 'pointerleave')
    expect(label().querySelector('rect')!.style.fill).toBe('white')
  })
})

describe('ports config', () => {
  it('uses the group side and offset for ports that do not set their own', () => {
    const top = setup({ ports: { show: false, side: 'bottom', offset: 0.25 } })
    const layout = [] as { x: number; y: number }[]
    engine!.on('layout', ({ connections }) => layout.push(connections[0]!.from))
    engine!.refresh()
    expect(layout[0]!.y).toBe(40)
    expect(layout[0]!.x).toBe(25)
    expect(top.path()).not.toBeNull()
  })

  it('lets a port override the group side', () => {
    const { container } = setup({ ports: { show: false, side: 'bottom' } })
    const a = document.getElementById('a')!
    const b = document.getElementById('b')!
    engine!.setBlocks([
      { id: 'a', el: a, ports: [{ id: 'p', side: 'top' }] },
      { id: 'b', el: b },
    ])
    engine!.setConnections([{ id: 'ab', from: { blockId: 'a', portId: 'p' }, to: { blockId: 'b' } }])
    const layouts: number[] = []
    engine!.on('layout', ({ connections }) => layouts.push(connections[0]!.from.y))
    engine!.refresh()
    expect(layouts[0]).toBe(0)
    expect(container).not.toBeNull()
  })
})

describe('changing the config at runtime', () => {
  it('re-renders lines when setConfig changes their defaults', () => {
    const { path } = setup({ ports: { show: false }, lines: { color: 'red' } })
    expect(path().style.stroke).toBe('red')
    engine!.setConfig({ lines: { color: 'blue', width: 4 } })
    expect(path().style.stroke).toBe('blue')
    expect(path().style.strokeWidth).toBe('4')
    engine!.setConfig({ lines: { color: undefined } })
    expect(path().style.stroke).toBe('')
    expect(path().style.strokeWidth).toBe('4')
  })

  it('replaceConfig drops what the new config leaves out', () => {
    const { path } = setup({ ports: { show: false }, lines: { color: 'red', width: 4 } })
    engine!.replaceConfig({ ports: { show: false }, lines: { color: 'green' } })
    expect(path().style.stroke).toBe('green')
    expect(path().style.strokeWidth).toBe('')
  })

  it('getConfig returns a copy of what is in effect', () => {
    setup({ lines: { color: 'red' } })
    engine!.setConfig({ lines: { width: 3 } })
    const copy = engine!.getConfig()
    expect(copy).toEqual({ lines: { color: 'red', width: 3 } })
    copy.lines!.color = 'changed'
    expect(engine!.getConfig().lines!.color).toBe('red')
  })

  it('shows and hides the port dots', () => {
    const { container } = setup({})
    expect(container.querySelectorAll('circle.vl-port')).toHaveLength(2)
    engine!.setConfig({ ports: { show: false } })
    expect(container.querySelectorAll('circle.vl-port')).toHaveLength(0)
    engine!.setConfig({ ports: { show: true } })
    expect(container.querySelectorAll('circle.vl-port')).toHaveLength(2)
  })

  it('turns selection on and off, clearing a selection that is switched off', () => {
    const { hit } = setup({ ports: { show: false } })
    expect(hit().getAttribute('tabindex')).toBeNull()
    expect(hit().getAttribute('aria-hidden')).toBe('true')

    engine!.setConfig({ interaction: { selectable: true } })
    expect(hit().getAttribute('tabindex')).toBe('0')
    expect(hit().getAttribute('role')).toBe('button')
    expect(hit().getAttribute('aria-hidden')).toBeNull()

    const changes: string[][] = []
    engine!.on('connection:selectionchange', ({ selectedIds }) => changes.push(selectedIds))
    hit().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(changes).toEqual([['ab']])

    engine!.setConfig({ interaction: { selectable: false } })
    expect(changes).toEqual([['ab'], []])
    expect(hit().getAttribute('tabindex')).toBeNull()
    expect(hit().getAttribute('aria-hidden')).toBe('true')
  })

  it('makes blocks draggable and undraggable on the fly, and applies a new grid', () => {
    const { a } = setup({ ports: { show: false } })
    const drag = (to: number) => {
      pointer(a, 'pointerdown', { clientX: 0, clientY: 0, button: 0 })
      pointer(a, 'pointermove', { clientX: to, clientY: 0 })
      pointer(a, 'pointerup', { clientX: to, clientY: 0 })
    }
    drag(33)
    expect(a.style.translate ?? '').toBe('')

    engine!.setConfig({ blocks: { draggable: true, drag: { grid: 20 } } })
    drag(47)
    expect(a.style.translate).toBe('40px 0px')
    expect(a.classList.contains('vl-draggable')).toBe(true)

    engine!.setConfig({ blocks: { draggable: false } })
    expect(a.classList.contains('vl-draggable')).toBe(false)
  })

  it('switches the clipping mode', () => {
    const { path } = setup({ ports: { show: false } })
    expect(path()).not.toBeNull()
    engine!.setConfig({ interaction: { clipToScrollParents: false } })
    expect(engine!.getConfig().interaction?.clipToScrollParents).toBe(false)
  })

  it('turns obstacle avoidance on and off without recreating the engine', () => {
    const { path } = setup({ ports: { show: false }, lines: { curve: 'smoothstep' } })
    const wall = block('wall', 150, -30)
    wall.getBoundingClientRect = () => new DOMRect(150, -30, 100, 100)
    engine!.setBlocks([
      { id: 'a', el: document.getElementById('a')! },
      { id: 'b', el: document.getElementById('b')! },
      { id: 'wall', el: wall },
    ])
    const straight = path().getAttribute('d')
    engine!.setConfig({ lines: { routing: { avoidObstacles: true } } })
    const detour = path().getAttribute('d')
    expect(detour).not.toBe(straight)
    engine!.setConfig({ lines: { routing: { avoidObstacles: false } } })
    expect(path().getAttribute('d')).toBe(straight)
  })
})

describe('highlight state', () => {
  it('is what a hovered block sets on its connections, apart from the hover of the line itself', () => {
    const { path, a, hit } = setup({
      ports: { show: false },
      lines: { color: 'gray', width: 2, highlight: { color: 'orange' }, hover: { color: 'red' } },
    })
    expect(path().style.stroke).toBe('gray')

    pointer(a, 'pointerenter')
    expect(path().style.stroke).toBe('orange')

    pointer(hit(), 'pointerenter')
    expect(path().style.stroke).toBe('red')

    pointer(hit(), 'pointerleave')
    expect(path().style.stroke).toBe('orange')

    pointer(a, 'pointerleave')
    expect(path().style.stroke).toBe('gray')
  })

  it('falls back to the hover bucket when no highlight is configured', () => {
    const { path, a } = setup({ ports: { show: false }, lines: { color: 'gray', hover: { color: 'red' } } })
    pointer(a, 'pointerenter')
    expect(path().style.stroke).toBe('red')
  })

  it('gets the default width bump like a hover does', () => {
    const { path, a } = setup({ ports: { show: false }, lines: { width: 2 } })
    pointer(a, 'pointerenter')
    expect(path().style.strokeWidth).toBe('3.5')
  })

  it('reaches markers, ports and labels through their own highlight buckets', () => {
    const { a, marker, container } = setup({
      markers: { end: { shape: VLMarkerShapeEnum.CIRCLE, size: 6, highlight: { size: 12 } } },
      ports: { radius: 4, highlight: { radius: 9 } },
      labels: { background: 'white', highlight: { background: 'gold' } },
    })
    engine!.setConnections([
      { id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' }, labels: [{ id: 'l', position: 'middle', text: 'x' }] },
    ])
    const startDot = () => container.querySelector('circle.vl-port') as SVGCircleElement
    expect(marker('markerEnd')!.getAttribute('markerHeight')).toBe('6')
    expect(startDot().style.getPropertyValue('r')).toBe('4px')

    pointer(a, 'pointerenter')
    expect(marker('markerEnd')!.getAttribute('markerHeight')).toBe('12')
    expect(startDot().style.getPropertyValue('r')).toBe('9px')
    expect((container.querySelector('g.vl-label rect') as SVGRectElement).style.fill).toBe('gold')

    pointer(a, 'pointerleave')
    expect(marker('markerEnd')!.getAttribute('markerHeight')).toBe('6')
  })
})

describe('opacity', () => {
  it('applies the line opacity and its states', () => {
    const { path, a } = setup({ ports: { show: false }, lines: { opacity: 0.6, hover: { opacity: 1 } } })
    expect(path().style.strokeOpacity).toBe('0.6')
    pointer(a, 'pointerenter')
    expect(path().style.strokeOpacity).toBe('1')
    pointer(a, 'pointerleave')
    expect(path().style.strokeOpacity).toBe('0.6')
  })

  it('multiplies with the dimming of an animated line', () => {
    const { path } = setup({ ports: { show: false }, lines: { opacity: 0.5, animated: true } })
    expect(Number(path().style.strokeOpacity)).toBeCloseTo(0.5 * 0.35, 5)
    const overlay = document.querySelector('path.vl-flow') as SVGPathElement
    expect(overlay.style.strokeOpacity).toBe('0.5')
  })

  it('dims a marker with its line, unless the marker sets its own', () => {
    const faded = setup({ ports: { show: false }, lines: { opacity: 0.4 }, markers: { end: VLMarkerShapeEnum.CIRCLE } })
    expect(faded.marker('markerEnd')!.innerHTML).toContain('opacity="0.4"')
    engine!.destroy()
    document.body.innerHTML = ''

    const own = setup({
      ports: { show: false },
      lines: { opacity: 0.4 },
      markers: { end: { shape: VLMarkerShapeEnum.CIRCLE, opacity: 1 } },
    })
    expect(own.marker('markerEnd')!.innerHTML).not.toContain('opacity')
  })

  it('applies the port and label opacity', () => {
    const { container } = setup({ ports: { opacity: 0.3 }, labels: { opacity: 0.7 } })
    engine!.setConnections([
      { id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' }, labels: [{ id: 'l', position: 'middle', text: 'x' }] },
    ])
    expect((container.querySelector('circle.vl-port') as SVGCircleElement).style.opacity).toBe('0.3')
    expect((container.querySelector('g.vl-label') as SVGGElement).style.opacity).toBe('0.7')
  })
})
