import { afterEach, describe, expect, it } from 'vitest'
import { createVisualLinker, type VisualLinker } from '../src/visual-linker'
import type { BlockDescriptor, ConnectionDescriptor, PortDescriptor, VisualLinkerConfig } from '../src/types'

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

function setRect(el: HTMLElement, left: number, top: number, width: number, height: number) {
  el.getBoundingClientRect = () => rectOf(left, top, width, height)
}

interface Scene {
  container: HTMLElement
  blocks: BlockDescriptor[]
  els: Record<string, HTMLElement>
  engine: VisualLinker
  events: { type: string; payload: Record<string, unknown> }[]
  layout: { connections: unknown[]; ports: Record<string, unknown>[] }
}

interface SceneOptions {
  config?: VisualLinkerConfig
  srcPorts?: Partial<PortDescriptor>[]
  dstPorts?: Partial<PortDescriptor>[]
  srcBlock?: Partial<BlockDescriptor>
  dstBlock?: Partial<BlockDescriptor>
  connections?: ConnectionDescriptor[]
  withButton?: boolean
}

function createScene(options: SceneOptions = {}): Scene {
  const container = document.createElement('div')
  setRect(container, 0, 0, 800, 400)
  document.body.appendChild(container)
  const els: Record<string, HTMLElement> = {}
  const blocks: BlockDescriptor[] = []
  for (const [id, left, side, names, extra, overrides] of [
    ['src', 0, 'right', ['p1', 'p2'], options.srcPorts, options.srcBlock],
    ['dst', 400, 'left', ['q1', 'q2'], options.dstPorts, options.dstBlock],
  ] as const) {
    const el = document.createElement('div')
    setRect(el, left, 0, 200, 100)
    container.appendChild(el)
    els[id] = el
    const descriptors = names.map((name, index) => {
      const portEl = document.createElement('div')
      setRect(portEl, left === 0 ? 160 : 400, 10 + index * 40, 40, 20)
      el.appendChild(portEl)
      els[`${id}:${name}`] = portEl
      return { id: name, target: portEl, side, ...(extra?.[index] ?? {}) } as PortDescriptor
    })
    if (options.withButton) {
      const button = document.createElement('button')
      setRect(button, left + 10, 80, 20, 10)
      el.appendChild(button)
      els[`${id}:button`] = button
    }
    blocks.push({ id, el, ports: descriptors, ...(overrides ?? {}) })
  }
  const engine = createVisualLinker(container, { ports: { show: false }, ...options.config })
  engine.setBlocks(blocks)
  const scene: Scene = { container, blocks, els, engine, events: [], layout: { connections: [], ports: [] } }
  for (const type of [
    'connect:start',
    'connect:candidate',
    'connection:create-request',
    'connection:create-cancel',
    'block:mouseenter',
    'block:mouseleave',
  ] as const) {
    engine.on(type, (payload) => scene.events.push({ type, payload: payload as Record<string, unknown> }))
  }
  engine.on('layout', (payload) => {
    scene.layout = payload as unknown as Scene['layout']
  })
  engine.setConnections(options.connections ?? [])
  return scene
}

function pointer(target: EventTarget, type: string, x: number, y: number, init: PointerEventInit = {}) {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    clientX: x,
    clientY: y,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

function click(target: EventTarget, x = 0, y = 0) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y })
  target.dispatchEvent(event)
  return event
}

const connect = (extra: object = {}) => ({ interaction: { connect: { enabled: true, handle: 'always', ...extra } } })

const path = (scene: Scene, index = 0) =>
  (scene.container.querySelectorAll('path.vl-connection')[index] as SVGPathElement).getAttribute('d')!

afterEach(() => {
  document.body.innerHTML = ''
})

describe('block roles in the connect mode', () => {
  it('derives the role of a block from its ports when it sets none', () => {
    const scene = createScene({
      config: connect({ from: 'both', to: 'both' }),
      dstPorts: [{ connect: 'target' }, { connect: 'target' }],
    })
    expect(scene.engine.startConnect({ blockId: 'dst' })).toBe(false)
    expect(scene.engine.startConnect({ blockId: 'src' })).toBe(true)
    expect(scene.engine.completeConnect({ blockId: 'dst' })).toBe(true)
    scene.engine.destroy()
  })

  it.each([
    ['source', true, false],
    ['target', false, true],
    ['both', true, true],
    [false, false, false],
  ] as const)('role %s on a block: can start %s, can end %s', (role, canStart, canEnd) => {
    const scene = createScene({
      config: connect({ from: 'block', to: 'block' }),
      srcBlock: { connect: role },
      dstBlock: { connect: 'both' },
    })
    expect(scene.engine.startConnect({ blockId: 'src' })).toBe(canStart)
    scene.engine.cancelConnect()
    const other = createScene({
      config: connect({ from: 'block', to: 'block' }),
      srcBlock: { connect: 'both' },
      dstBlock: { connect: role },
    })
    other.engine.startConnect({ blockId: 'src' })
    expect(other.engine.completeConnect({ blockId: 'dst' })).toBe(canEnd)
    scene.engine.destroy()
    other.engine.destroy()
  })

  it('does not start from a target-only block by drag, click or when it is the pointer candidate', () => {
    const scene = createScene({
      config: connect({ from: 'block', to: 'block', mode: 'both' }),
      srcBlock: { connect: 'target' },
    })
    pointer(scene.els.src!, 'pointerdown', 50, 50)
    pointer(document.body, 'pointermove', 450, 50)
    pointer(document.body, 'pointerup', 450, 50)
    click(scene.els.src!, 50, 50)
    expect(scene.events.filter((event) => event.type === 'connect:start')).toHaveLength(0)

    pointer(scene.els['dst:q1']!, 'pointerdown', 450, 20)
    pointer(document.body, 'pointermove', 100, 50)
    pointer(document.body, 'pointerup', 100, 50)
    const request = scene.events.find((event) => event.type === 'connection:create-request')
    expect(request?.payload).toMatchObject({ from: { blockId: 'dst' }, to: { blockId: 'src' } })
    scene.engine.destroy()
  })

  it('starts from a source block body by drag and by click', () => {
    const scene = createScene({ config: connect({ from: 'block', to: 'block' }), srcBlock: { connect: 'source' } })
    pointer(scene.els.src!, 'pointerdown', 50, 80)
    pointer(document.body, 'pointermove', 450, 80)
    pointer(document.body, 'pointerup', 450, 80)
    const request = scene.events.find((event) => event.type === 'connection:create-request')
    expect(request?.payload).toMatchObject({ from: { blockId: 'src' }, to: { blockId: 'dst' }, via: 'drag' })

    const byClick = createScene({ config: connect({ from: 'block', to: 'block', mode: 'click' }) })
    click(byClick.els.src!, 50, 80)
    expect(byClick.engine.isConnecting().active).toBe(true)
    scene.engine.destroy()
    byClick.engine.destroy()
  })
})

describe('interactive elements inside a block', () => {
  it('lets a button inside a block receive its click and does not start a connection', () => {
    const scene = createScene({ config: connect({ from: 'block', to: 'block' }), withButton: true })
    const button = scene.els['src:button']!
    const down = pointer(button, 'pointerdown', 20, 85)
    const clicked = click(button, 20, 85)
    expect(down.defaultPrevented).toBe(false)
    expect(clicked.defaultPrevented).toBe(false)
    expect(scene.engine.isConnecting().active).toBe(false)
    scene.engine.destroy()
  })

  it('treats data-vl-ignore like an interactive element', () => {
    const scene = createScene({ config: connect({ from: 'block', to: 'block' }), withButton: true })
    const span = document.createElement('span')
    span.setAttribute('data-vl-ignore', '')
    scene.els.src!.appendChild(span)
    pointer(span, 'pointerdown', 50, 80)
    click(span, 50, 80)
    expect(scene.engine.isConnecting().active).toBe(false)
    scene.engine.destroy()
  })

  it('accepts a custom selector, and ignore: false restores the old behaviour', () => {
    const custom = createScene({ config: connect({ from: 'block', ignore: '.skip' }), withButton: true })
    const skip = document.createElement('div')
    skip.className = 'skip'
    custom.els.src!.appendChild(skip)
    click(skip, 50, 80)
    expect(custom.engine.isConnecting().active).toBe(false)
    click(custom.els['src:button']!, 20, 85)
    expect(custom.engine.isConnecting().active).toBe(true)
    custom.engine.destroy()

    const plain = createScene({ config: connect({ from: 'block', ignore: false }), withButton: true })
    click(plain.els['src:button']!, 20, 85)
    expect(plain.engine.isConnecting().active).toBe(true)
    plain.engine.destroy()
  })

  it('does not complete or cancel a two-click connection on a button inside a target block', () => {
    const scene = createScene({ config: connect({ from: 'port', to: 'block', mode: 'click' }), withButton: true })
    scene.engine.startConnect({ blockId: 'src', portId: 'p1' })
    click(scene.els['dst:button']!, 420, 85)
    expect(scene.engine.isConnecting().active).toBe(true)
    scene.engine.destroy()
  })
})

describe('attributes on blocks', () => {
  it('marks the block of every candidate and the target, and removes them afterwards', () => {
    const scene = createScene({ config: connect() })
    pointer(scene.container.querySelector('[data-vl-handle="src:p1"] .vl-handle-hit')!, 'pointerdown', 200, 20)
    expect(scene.els.src!.getAttribute('data-vl-connect-state')).toBe('source')
    expect(scene.els.dst!.getAttribute('data-vl-connect-state')).toBe('candidate')
    pointer(document.body, 'pointermove', 399, 21)
    expect(scene.els.dst!.getAttribute('data-vl-connect-state')).toBe('target')
    expect(scene.els['dst:q1']!.getAttribute('aria-pressed')).toBeNull()
    expect(scene.els['src:p1']!.getAttribute('aria-pressed')).toBe('true')
    pointer(document.body, 'pointerup', 399, 21)
    expect(document.querySelectorAll('[data-vl-connect-state]').length).toBe(0)
    expect(scene.els['src:p1']!.hasAttribute('aria-pressed')).toBe(false)
    scene.engine.destroy()
  })

  it('sets data-vl-hover on the block under the pointer and on the ends of a hovered line', () => {
    const scene = createScene({
      config: { interaction: { hover: true } },
      connections: [{ id: 'a', from: { blockId: 'src', portId: 'p1' }, to: { blockId: 'dst', portId: 'q1' } }],
    })
    pointer(scene.els.src!, 'pointerenter', 10, 10, { bubbles: false })
    expect(scene.els.src!.getAttribute('data-vl-hover')).toBe('pointer')
    expect(scene.els.dst!.hasAttribute('data-vl-hover')).toBe(false)
    pointer(scene.els.src!, 'pointerleave', 10, 10, { bubbles: false })
    expect(scene.els.src!.hasAttribute('data-vl-hover')).toBe(false)

    const hit = scene.container.querySelector('.vl-connection-hit')!
    pointer(hit, 'pointerenter', 300, 20, { bubbles: false })
    expect(scene.els.src!.getAttribute('data-vl-hover')).toBe('line')
    expect(scene.els.dst!.getAttribute('data-vl-hover')).toBe('line')
    const viaLine = scene.events.filter((event) => event.type === 'block:mouseenter' && event.payload.via === 'line')
    expect(viaLine.map((event) => event.payload)).toEqual([
      { blockId: 'src', via: 'line' },
      { blockId: 'dst', via: 'line' },
    ])
    pointer(hit, 'pointerleave', 300, 20, { bubbles: false })
    expect(document.querySelectorAll('[data-vl-hover]').length).toBe(0)
    scene.engine.destroy()
  })

  it('adds no data-vl-hover while hover, highlight and connect are all off', () => {
    const scene = createScene()
    pointer(scene.els.src!, 'pointerenter', 10, 10, { bubbles: false })
    expect(scene.els.src!.hasAttribute('data-vl-hover')).toBe(false)
    scene.engine.destroy()
  })
})

describe('one port for every connectable end', () => {
  const connections: ConnectionDescriptor[] = [
    { id: 'a', from: { blockId: 'src', portId: 'p1' }, to: { blockId: 'dst', portId: 'q1' } },
  ]

  it('draws a circle for every declared port with show: "all", with the same geometry whether it is connected or not', () => {
    const scene = createScene({ config: { ports: { show: 'all' } }, connections })
    const circles = [...scene.container.querySelectorAll('circle.vl-port')]
    expect(circles).toHaveLength(4)
    const radii = new Set(circles.map((circle) => (circle as SVGElement).style.getPropertyValue('r')))
    expect(radii.size).toBe(1)
    scene.engine.destroy()
  })

  it('keeps show: true to the connected ports only', () => {
    const scene = createScene({ config: { ports: { show: true } }, connections })
    expect(scene.container.querySelectorAll('circle.vl-port')).toHaveLength(2)
    scene.engine.destroy()
  })

  it('reports every connectable port to the layout with role, connected count, state and hovered', () => {
    const scene = createScene({
      config: { ports: { show: 'all' }, ...connect({ handle: 'never' }) },
      srcPorts: [{ connect: 'source' }, { connect: 'source' }],
      dstPorts: [{ connect: 'target' }, { connect: 'target' }],
      connections,
    })
    const byId = Object.fromEntries(scene.layout.ports.map((port) => [`${port.blockId}:${port.portId}`, port]))
    expect(Object.keys(byId).sort()).toEqual(['dst:q1', 'dst:q2', 'src:p1', 'src:p2'])
    expect(byId['src:p1']).toMatchObject({ role: 'source', connected: 1, state: 'idle', hovered: false })
    expect(byId['src:p2']).toMatchObject({ role: 'source', connected: 0 })
    expect(byId['dst:q2']).toMatchObject({ role: 'target', connected: 0 })

    pointer(scene.container.querySelector('[data-vl-handle="src:p2"] .vl-handle-hit')!, 'pointerdown', 200, 60)
    const during = Object.fromEntries(scene.layout.ports.map((port) => [`${port.blockId}:${port.portId}`, port]))
    expect(during['src:p2']).toMatchObject({ state: 'source' })
    expect(during['dst:q2']).toMatchObject({ state: 'candidate' })
    scene.engine.cancelConnect()
    scene.engine.destroy()
  })

  it('does not draw a second circle for a port that is already drawn', () => {
    const scene = createScene({ config: { ports: { show: true }, ...connect({ handle: 'always' }) }, connections })
    const dot = (key: string) => scene.container.querySelector(`[data-vl-handle="${key}"] .vl-handle`) as SVGElement
    expect(dot('src:p1').style.display).toBe('none')
    expect(dot('src:p2').style.display).toBe('')
    scene.engine.destroy()
  })

  it('shows the handle dot of a free port only while the pointer is over its block when handle is "hover"', () => {
    const scene = createScene({ config: { ports: { show: false }, ...connect({ handle: 'hover' }) } })
    const dot = scene.container.querySelector('[data-vl-handle="src:p1"] .vl-handle') as SVGElement
    expect(dot.classList.contains('vl-handle--visible')).toBe(false)
    pointer(scene.els.src!, 'pointerenter', 10, 10, { bubbles: false })
    expect(dot.classList.contains('vl-handle--visible')).toBe(true)
    scene.engine.destroy()
  })

  it('paints the gesture state on the single port circle', () => {
    const scene = createScene({
      config: {
        ports: { show: 'all', connect: { candidate: { fill: '#00aa00' }, source: { fill: '#aa0000' } } },
        ...connect(),
      },
    })
    pointer(scene.container.querySelector('[data-vl-handle="src:p1"] .vl-handle-hit')!, 'pointerdown', 200, 20)
    const circle = (point: string) =>
      [...scene.container.querySelectorAll('circle.vl-port')].find((el) =>
        el.classList.contains(`vl-port--${point}`),
      ) as SVGElement | undefined
    expect(circle('source')!.style.fill).toBe('#aa0000')
    expect(circle('candidate')!.style.fill).toBe('#00aa00')
    scene.engine.cancelConnect()
    expect(circle('source')).toBeUndefined()
    scene.engine.destroy()
  })
})

describe('port style by role and per port', () => {
  it('styles sources and targets differently at rest', () => {
    const scene = createScene({
      config: {
        ports: { show: 'all', stroke: '#111111', source: { fill: '#ff0000' }, target: { fill: '#0000ff' } },
      },
      srcPorts: [{ connect: 'source' }, { connect: 'source' }],
      dstPorts: [{ connect: 'target' }, { connect: 'target' }],
    })
    const fills = [...scene.container.querySelectorAll('circle.vl-port')].map((el) => ({
      role: el.classList.contains('vl-port--source') ? 'source' : 'target',
      fill: (el as SVGElement).style.fill,
      stroke: (el as SVGElement).style.stroke,
    }))
    expect(fills.filter((f) => f.role === 'source').every((f) => f.fill === '#ff0000')).toBe(true)
    expect(fills.filter((f) => f.role === 'target').every((f) => f.fill === '#0000ff')).toBe(true)
    expect(new Set(fills.map((f) => f.stroke))).toEqual(new Set(['#111111']))
    scene.engine.destroy()
  })

  it('lets a port override its role style and group, and adds its class name', () => {
    const scene = createScene({
      config: { ports: { show: 'all', fill: '#eeeeee', source: { fill: '#ff0000' } } },
      srcPorts: [{ connect: 'source', style: { fill: '#00ff00' }, className: 'special' }, { connect: 'source' }],
    })
    const special = scene.container.querySelector('circle.special') as SVGElement
    expect(special.style.fill).toBe('#00ff00')
    const plain = [...scene.container.querySelectorAll('circle.vl-port--source')].find(
      (el) => !el.classList.contains('special'),
    ) as SVGElement
    expect(plain.style.fill).toBe('#ff0000')
    scene.engine.destroy()
  })

  it('applies ports.connected to a port that has a connection', () => {
    const scene = createScene({
      config: { ports: { show: 'all', connected: { radius: 6 } } },
      connections: [{ id: 'a', from: { blockId: 'src', portId: 'p1' }, to: { blockId: 'dst', portId: 'q1' } }],
    })
    const radii = [...scene.container.querySelectorAll('circle.vl-port')].map((el) =>
      el.classList.contains('vl-port--connected') ? (el as SVGElement).style.getPropertyValue('r') : '',
    )
    expect(radii.filter(Boolean)).toEqual(['6px', '6px'])
    scene.engine.destroy()
  })

  it('lets the port ring follow the marker ring with ports.sync = "marker"', () => {
    const scene = createScene({
      config: {
        ports: { show: true, sync: 'marker' },
        markers: {
          end: { shape: 'circle', strokeColor: '#222222', strokeWidth: 3, hover: { strokeColor: '#ff0066' } },
        },
        interaction: { hover: true },
      },
      connections: [{ id: 'a', from: { blockId: 'src', portId: 'p1' }, to: { blockId: 'dst', portId: 'q1' } }],
    })
    const ring = () =>
      [...scene.container.querySelectorAll('circle.vl-port')].map((el) => (el as SVGElement).style.stroke)
    expect(ring()).toContain('#222222')
    const hit = scene.container.querySelector('.vl-connection-hit')!
    pointer(hit, 'pointerenter', 300, 20, { bubbles: false })
    expect(ring()).toContain('#ff0066')
    scene.engine.destroy()
  })
})

describe('line end gap and clearance', () => {
  const connections: ConnectionDescriptor[] = [
    { id: 'a', from: { blockId: 'src', portId: 'p1' }, to: { blockId: 'dst', portId: 'q1' } },
  ]

  it('keeps the path untouched by default', () => {
    const plain = createScene({ config: { lines: { curve: 'straight' } }, connections })
    expect(path(plain)).toBe('M 200 20 L 400 20')
    plain.engine.destroy()
  })

  it('stops the line endGap px before the port, outward along the side', () => {
    const scene = createScene({ config: { lines: { curve: 'straight', endGap: 6 } }, connections })
    expect(path(scene)).toBe('M 206 20 L 394 20')
    scene.engine.destroy()
    const split = createScene({ config: { lines: { curve: 'straight', endGap: { start: 2, end: 10 } } }, connections })
    expect(path(split)).toBe('M 202 20 L 390 20')
    split.engine.destroy()
  })

  it('adds the port radius and outline with clearance: "auto"', () => {
    const scene = createScene({
      config: { lines: { curve: 'straight' }, ports: { show: true, radius: 5, strokeWidth: 1, clearance: 'auto' } },
      connections,
    })
    expect(path(scene)).toBe('M 206 20 L 394 20')
    scene.engine.destroy()
  })

  it('keeps the port circle and the layout on the port itself', () => {
    const scene = createScene({
      config: { lines: { curve: 'straight', endGap: 6 }, ports: { show: true } },
      connections,
    })
    const circle = scene.container.querySelector('circle.vl-port')!
    expect(circle.getAttribute('cx')).toBe('200')
    expect(scene.layout.connections[0]).toMatchObject({ from: { x: 200, y: 20 }, to: { x: 400, y: 20 } })
    scene.engine.destroy()
  })
})

describe('proxied ends', () => {
  function proxiedScene(lines: VisualLinkerConfig['lines']) {
    const scene = createScene({ config: { lines } })
    scene.engine.setConnections([
      {
        id: 'x',
        from: { blockId: 'gone', fallback: [{ blockId: 'src', portId: 'p1' }] },
        to: { blockId: 'dst', portId: 'q1' },
      },
      {
        id: 'y',
        from: { blockId: 'gone2', fallback: [{ blockId: 'src', portId: 'p1' }] },
        to: { blockId: 'dst', portId: 'q2' },
      },
    ])
    return scene
  }

  it('puts a marker on the proxied end only', () => {
    const scene = proxiedScene({ proxied: { start: 'diamond' } })
    const first = scene.container.querySelector('path.vl-connection') as SVGPathElement
    expect(first.style.markerStart).toContain('url(#')
    expect(first.style.markerEnd).toBe('')
    scene.engine.destroy()
  })

  it('counts the connections led to a fallback block in data-vl-proxy-count and clears it', () => {
    const scene = proxiedScene({})
    expect(scene.els.src!.getAttribute('data-vl-proxy-count')).toBe('2')
    scene.engine.setConnections([])
    expect(scene.els.src!.hasAttribute('data-vl-proxy-count')).toBe(false)
    scene.engine.destroy()
  })
})

describe('sides by role', () => {
  it('uses ports.sides for a fallback block without a port, and for the preview line', () => {
    const container = document.createElement('div')
    setRect(container, 0, 0, 800, 400)
    document.body.appendChild(container)
    const mk = (left: number, top: number) => {
      const el = document.createElement('div')
      setRect(el, left, top, 100, 40)
      container.appendChild(el)
      return el
    }
    const engine = createVisualLinker(container, {
      ports: { show: false, sides: { source: 'right', target: 'left' } },
      lines: { curve: 'straight' },
      ...connect({ from: 'block', to: 'block' }),
    })
    engine.setBlocks([
      { id: 'a', el: mk(0, 300) },
      { id: 'b', el: mk(300, 0) },
    ])
    engine.setConnections([{ id: 'x', from: { blockId: 'a' }, to: { blockId: 'b' } }])
    expect((container.querySelector('path.vl-connection') as SVGPathElement).getAttribute('d')).toBe(
      'M 100 320 L 300 20',
    )

    engine.startConnect({ blockId: 'a' })
    const preview = container.querySelector('.vl-connect-preview') as SVGPathElement
    expect(preview.getAttribute('d')!.startsWith('M 100 320')).toBe(true)
    engine.cancelConnect()
    engine.destroy()
  })
})

describe('connect events and dimming', () => {
  it('reports how the gesture started and every candidate change', () => {
    const scene = createScene({ config: connect() })
    pointer(scene.container.querySelector('[data-vl-handle="src:p1"] .vl-handle-hit')!, 'pointerdown', 200, 20)
    pointer(document.body, 'pointermove', 399, 21)
    pointer(document.body, 'pointermove', 300, 300)
    const start = scene.events.find((event) => event.type === 'connect:start')!
    expect(start.payload).toMatchObject({ via: 'drag' })
    const candidates = scene.events.filter((event) => event.type === 'connect:candidate').map((e) => e.payload)
    expect(candidates).toEqual([
      { from: { blockId: 'src', portId: 'p1' }, candidate: { blockId: 'dst', portId: 'q1' }, valid: true },
      { from: { blockId: 'src', portId: 'p1' }, candidate: null, valid: false },
    ])
    scene.engine.cancelConnect()
    const api = createScene({ config: connect() })
    api.engine.startConnect({ blockId: 'src', portId: 'p1' })
    expect(api.events.find((event) => event.type === 'connect:start')!.payload).toMatchObject({ via: 'api' })
    scene.engine.destroy()
    api.engine.destroy()
  })

  it('dims the other lines while connecting when dimOthers is set', () => {
    const scene = createScene({ config: connect({ dimOthers: 0.2 }) })
    const svg = scene.container.querySelector('svg') as SVGElement
    expect(svg.classList.contains('vl-svg--dim')).toBe(false)
    scene.engine.startConnect({ blockId: 'src', portId: 'p1' })
    expect(svg.classList.contains('vl-svg--dim')).toBe(true)
    expect(svg.style.getPropertyValue('--vl-connect-dim')).toBe('0.2')
    scene.engine.cancelConnect()
    expect(svg.classList.contains('vl-svg--dim')).toBe(false)
    scene.engine.destroy()
  })

  it('does not dim anything by default', () => {
    const scene = createScene({ config: connect() })
    scene.engine.startConnect({ blockId: 'src', portId: 'p1' })
    expect(scene.container.querySelector('svg')!.classList.contains('vl-svg--dim')).toBe(false)
    scene.engine.destroy()
  })
})

describe('line kinds, marker units and overlapping lines', () => {
  it('styles a group of connections once through lines.kinds, below the connection own style', () => {
    const scene = createScene({
      config: { lines: { color: '#111111', kinds: { whole: { color: '#222222', width: 4 } } } },
      connections: [
        { id: 'a', kind: 'whole', from: { blockId: 'src', portId: 'p1' }, to: { blockId: 'dst', portId: 'q1' } },
        {
          id: 'b',
          kind: 'whole',
          from: { blockId: 'src', portId: 'p2' },
          to: { blockId: 'dst', portId: 'q2' },
          style: { color: '#333333' },
        },
        { id: 'c', from: { blockId: 'src', portId: 'p1' }, to: { blockId: 'dst', portId: 'q2' } },
      ],
    })
    const paths = [...scene.container.querySelectorAll('path.vl-connection')] as SVGPathElement[]
    expect(paths.map((p) => p.style.stroke)).toEqual(['#222222', '#333333', '#111111'])
    expect(paths[0]!.style.strokeWidth).toBe('4')
    expect(paths[1]!.style.strokeWidth).toBe('4')
    scene.engine.destroy()
  })

  it('draws a marker in px units independent of the line width', () => {
    const scene = createScene({
      config: { lines: { width: 1 }, markers: { end: { shape: 'circle', size: 14, units: 'px' } } },
      connections: [{ id: 'a', from: { blockId: 'src', portId: 'p1' }, to: { blockId: 'dst', portId: 'q1' } }],
    })
    const marker = scene.container.querySelector('marker')!
    expect(marker.getAttribute('markerUnits')).toBe('userSpaceOnUse')
    expect(marker.getAttribute('markerWidth')).toBe('14')
    scene.engine.destroy()
    const stroke = createScene({
      config: { markers: { end: { shape: 'circle', size: 14 } } },
      connections: [{ id: 'a', from: { blockId: 'src', portId: 'p1' }, to: { blockId: 'dst', portId: 'q1' } }],
    })
    expect(stroke.container.querySelector('marker')!.getAttribute('markerUnits')).toBe('strokeWidth')
    stroke.engine.destroy()
  })

  it('moves a line that lies exactly on another one aside when overlap is "offset"', () => {
    const same = [
      { id: 'a', from: { blockId: 'src', portId: 'p1' }, to: { blockId: 'dst', portId: 'q1' } },
      { id: 'b', from: { blockId: 'src', portId: 'p1' }, to: { blockId: 'dst', portId: 'q1' } },
    ]
    const stacked = createScene({ config: { lines: { curve: 'straight' } }, connections: same })
    expect(path(stacked, 0)).toBe(path(stacked, 1))
    stacked.engine.destroy()
    const offset = createScene({ config: { lines: { curve: 'straight', overlap: 'offset' } }, connections: same })
    expect(path(offset, 0)).toBe('M 200 20 L 400 20')
    expect(path(offset, 1)).not.toBe(path(offset, 0))
    expect(path(offset, 1)).toMatch(/^M 200 (2[0-9]|1[0-9])(\.\d+)? L 400/)
    offset.engine.destroy()
  })
})

describe('ports as DOM elements', () => {
  it('draws nothing itself and starts the gesture from the element', () => {
    const scene = createScene({ config: { ports: { show: 'all', render: 'dom' }, ...connect() } })
    expect(scene.container.querySelector('circle.vl-port')).toBeNull()
    expect(scene.container.querySelector('[data-vl-handle]')).toBeNull()
    pointer(scene.els['src:p1']!, 'pointerdown', 200, 20)
    expect(scene.engine.isConnecting()).toEqual({ active: true, from: { blockId: 'src', portId: 'p1' } })
    expect(scene.els['src:p1']!.getAttribute('data-vl-connect-state')).toBe('source')
    expect(scene.els['src:p1']!.getAttribute('aria-pressed')).toBe('true')
    expect(scene.els['dst:q1']!.getAttribute('data-vl-connect-state')).toBe('candidate')
    scene.engine.cancelConnect()
    expect(scene.els['src:p1']!.hasAttribute('aria-pressed')).toBe(false)
    scene.engine.destroy()
  })

  it('removes its listeners with the mode', () => {
    const scene = createScene({ config: { ports: { render: 'dom' }, ...connect() } })
    scene.engine.setConfig({ interaction: { connect: { enabled: false } } })
    pointer(scene.els['src:p1']!, 'pointerdown', 200, 20)
    expect(scene.engine.isConnecting().active).toBe(false)
    scene.engine.destroy()
  })
})

describe('ports fading at the edge of a scroller', () => {
  it('lowers the opacity of a port close to the visible edge', () => {
    const container = document.createElement('div')
    setRect(container, 0, 0, 800, 400)
    document.body.appendChild(container)
    const scroller = document.createElement('div')
    scroller.style.overflow = 'auto'
    setRect(scroller, 0, 0, 200, 100)
    container.appendChild(scroller)
    const row = document.createElement('div')
    setRect(row, 0, 70, 100, 20)
    scroller.appendChild(row)
    const target = document.createElement('div')
    setRect(target, 500, 40, 100, 20)
    container.appendChild(target)
    const engine = createVisualLinker(container, { ports: { show: true, fadeEdge: 40 } })
    engine.setBlocks([
      { id: 'a', el: row },
      { id: 'b', el: target },
    ])
    engine.setConnections([{ id: 'x', from: { blockId: 'a' }, to: { blockId: 'b' } }])
    const opacities = [...container.querySelectorAll('circle.vl-port')].map((el) => (el as SVGElement).style.opacity)
    expect(opacities.some((value) => value !== '' && Number(value) < 1)).toBe(true)
    engine.destroy()
  })
})
