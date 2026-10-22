import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createVisualLinker, type VisualLinker } from '../src/visual-linker'
import type { BlockDescriptor, ConnectConfig, ConnectionDescriptor, VisualLinkerConfig } from '../src/types'

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
  ports: Record<string, HTMLElement>
  engine: VisualLinker
  events: { type: string; payload: unknown }[]
}

function createScene(
  connect: ConnectConfig = {},
  extra: VisualLinkerConfig = {},
  connections: ConnectionDescriptor[] = [],
): Scene {
  const container = document.createElement('div')
  setRect(container, 0, 0, 800, 400)
  document.body.appendChild(container)

  const ports: Record<string, HTMLElement> = {}
  const blocks: BlockDescriptor[] = []
  for (const [id, left, side, names] of [
    ['src', 0, 'right', ['p1', 'p2']],
    ['dst', 400, 'left', ['q1', 'q2']],
  ] as const) {
    const el = document.createElement('div')
    setRect(el, left, 0, 200, 100)
    container.appendChild(el)
    const descriptors = names.map((name, index) => {
      const portEl = document.createElement('div')
      setRect(portEl, left === 0 ? 160 : 400, 10 + index * 40, 40, 20)
      el.appendChild(portEl)
      ports[`${id}:${name}`] = portEl
      return { id: name, target: portEl, side }
    })
    blocks.push({ id, el, ports: descriptors })
  }

  const engine = createVisualLinker(container, {
    interaction: { connect: { enabled: true, ...connect } },
    ports: { show: false },
    ...extra,
  })
  engine.setBlocks(blocks)
  engine.setConnections(connections)
  const events: Scene['events'] = []
  for (const type of ['connect:start', 'connection:create-request', 'connection:create-cancel'] as const) {
    engine.on(type, (payload) => events.push({ type, payload }))
  }
  return { container, blocks, ports, engine, events }
}

function hit(scene: Scene, key: string): HTMLElement {
  const group = scene.container.querySelector(`[data-vl-handle="${key}"]`)
  if (!group) throw new Error(`no handle ${key}`)
  return group.querySelector('.vl-handle-hit') as HTMLElement
}

function pointer(target: EventTarget, type: string, x: number, y: number, init: PointerEventInit = {}) {
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, clientX: x, clientY: y, ...init }),
  )
}

function click(target: EventTarget, x: number, y: number, init: MouseEventInit = {}) {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y, ...init }))
}

function key(target: EventTarget, name: string, init: KeyboardEventInit = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init }))
}

function types(scene: Scene) {
  return scene.events.map((event) => event.type)
}

function last(scene: Scene) {
  return scene.events[scene.events.length - 1]!
}

describe('connect mode: disabled', () => {
  it('adds no handles, no tabindex and no live region, and every method returns false', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const el = document.createElement('div')
    const portEl = document.createElement('div')
    el.appendChild(portEl)
    container.appendChild(el)
    const engine = createVisualLinker(container)
    engine.setBlocks([{ id: 'a', el, ports: [{ id: 'p', target: portEl }] }])
    expect(container.querySelector('[data-vl-handle]')).toBeNull()
    expect(container.querySelector('.vl-live')).toBeNull()
    expect(portEl.hasAttribute('tabindex')).toBe(false)
    expect(engine.startConnect({ blockId: 'a', portId: 'p' })).toBe(false)
    expect(engine.completeConnect({ blockId: 'a', portId: 'p' })).toBe(false)
    expect(engine.isConnecting()).toEqual({ active: false })
    expect(() => engine.cancelConnect()).not.toThrow()
    expect(container.getAttribute('data-vl-connecting')).toBeNull()
    engine.destroy()
  })
})

describe('connect mode: drag', () => {
  let scene: Scene
  beforeEach(() => {
    scene = createScene({ handle: 'always' })
  })
  afterEach(() => {
    scene.engine.destroy()
    document.body.innerHTML = ''
  })

  it('draws a handle for every connectable port', () => {
    const keys = [...scene.container.querySelectorAll('[data-vl-handle]')].map((el) =>
      el.getAttribute('data-vl-handle'),
    )
    expect(keys.sort()).toEqual(['dst:q1', 'dst:q2', 'src:p1', 'src:p2'])
    expect(scene.container.querySelector('.vl-handle-hit')!.getAttribute('r')).toBe('12')
  })

  it('emits exactly one create-request when released on a valid port, and adds no connection itself', () => {
    pointer(hit(scene, 'src:p1'), 'pointerdown', 200, 20)
    expect(scene.container.getAttribute('data-vl-connecting')).toBe('true')
    expect(scene.container.querySelector('.vl-connect-preview')).not.toBeNull()
    pointer(document.body, 'pointermove', 395, 25)
    pointer(document.body, 'pointermove', 399, 21)
    pointer(document.body, 'pointerup', 399, 21)

    expect(types(scene)).toEqual(['connect:start', 'connection:create-request'])
    expect(scene.events[1]!.payload).toMatchObject({
      from: { blockId: 'src', portId: 'p1' },
      to: { blockId: 'dst', portId: 'q1' },
      via: 'drag',
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    })
    expect(scene.container.querySelector('path.vl-connection')).toBeNull()
    expect(scene.container.getAttribute('data-vl-connecting')).toBeNull()
    expect(scene.container.querySelector('.vl-connect-preview')).toBeNull()
  })

  it('reports the modifier keys held on release', () => {
    pointer(hit(scene, 'src:p1'), 'pointerdown', 200, 20)
    pointer(document.body, 'pointermove', 399, 21)
    pointer(document.body, 'pointerup', 399, 21, { shiftKey: true })
    expect(scene.events[1]!.payload).toMatchObject({ modifiers: { shift: true } })
  })

  it('cancels with no-target when released on empty space', () => {
    pointer(hit(scene, 'src:p1'), 'pointerdown', 200, 20)
    pointer(document.body, 'pointermove', 300, 300)
    pointer(document.body, 'pointerup', 300, 300)
    expect(types(scene)).toEqual(['connect:start', 'connection:create-cancel'])
    expect(scene.events[1]!.payload).toMatchObject({ reason: 'no-target', from: { blockId: 'src', portId: 'p1' } })
  })

  it('cancels with escape', () => {
    pointer(hit(scene, 'src:p1'), 'pointerdown', 200, 20)
    pointer(document.body, 'pointermove', 300, 100)
    key(document.body, 'Escape')
    expect(scene.events[1]!.payload).toMatchObject({ reason: 'escape' })
    pointer(document.body, 'pointerup', 300, 100)
    expect(types(scene)).toEqual(['connect:start', 'connection:create-cancel'])
  })

  it('cancels with pointer-cancel', () => {
    pointer(hit(scene, 'src:p1'), 'pointerdown', 200, 20)
    pointer(document.body, 'pointermove', 300, 100)
    pointer(document.body, 'pointercancel', 300, 100)
    expect(scene.events[1]!.payload).toMatchObject({ reason: 'pointer-cancel' })
  })

  it('does not connect a port to its own block by default', () => {
    pointer(hit(scene, 'src:p1'), 'pointerdown', 200, 20)
    pointer(document.body, 'pointermove', 200, 60)
    pointer(document.body, 'pointerup', 200, 60)
    expect(scene.events[1]!.type).toBe('connection:create-cancel')
    expect(scene.events[1]!.payload).toMatchObject({ reason: 'invalid' })
  })

  it('marks source, candidates and the target under the pointer, then clears every attribute', () => {
    pointer(hit(scene, 'src:p1'), 'pointerdown', 200, 20)
    expect(scene.ports['src:p1']!.getAttribute('data-vl-connect-state')).toBe('source')
    expect(scene.ports['dst:q1']!.getAttribute('data-vl-connect-state')).toBe('candidate')
    expect(scene.ports['src:p2']!.getAttribute('data-vl-connect-state')).toBeNull()
    pointer(document.body, 'pointermove', 399, 21)
    expect(scene.ports['dst:q1']!.getAttribute('data-vl-connect-state')).toBe('target')
    pointer(document.body, 'pointerup', 399, 21)
    for (const el of Object.values(scene.ports)) expect(el.hasAttribute('data-vl-connect-state')).toBe(false)
  })
})

describe('connect mode: rules', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('honours validate(), reports the reason to the live region and cancels with invalid', () => {
    const scene = createScene({
      handle: 'always',
      validate: (_from, to) => (to.portId === 'q2' ? 'q2 is taken' : true),
    })
    pointer(hit(scene, 'src:p1'), 'pointerdown', 200, 20)
    pointer(document.body, 'pointermove', 399, 61)
    expect(scene.container.querySelector('.vl-live')!.textContent).toContain('q2 is taken')
    expect(scene.ports['dst:q2']!.getAttribute('data-vl-connect-state')).toBe('invalid')
    pointer(document.body, 'pointerup', 399, 61)
    expect(scene.events[1]!.payload).toMatchObject({ reason: 'invalid', message: 'q2 is taken' })
    scene.engine.destroy()
  })

  it('respects source/target roles and connect: false', () => {
    const scene = createScene({ handle: 'always' })
    scene.engine.setBlocks([
      {
        ...scene.blocks[0]!,
        ports: [
          { id: 'p1', target: scene.ports['src:p1']!, side: 'right', connect: 'target' },
          { id: 'p2', target: scene.ports['src:p2']!, side: 'right', connect: 'source' },
        ],
      },
      {
        ...scene.blocks[1]!,
        ports: [
          { id: 'q1', target: scene.ports['dst:q1']!, side: 'left', connect: 'both' },
          { id: 'q2', target: scene.ports['dst:q2']!, side: 'left', connect: false },
        ],
      },
    ])
    expect(scene.engine.startConnect({ blockId: 'src', portId: 'p1' })).toBe(false)
    expect(scene.engine.startConnect({ blockId: 'dst', portId: 'q2' })).toBe(false)
    expect(scene.container.querySelector('[data-vl-handle="dst:q2"]')).toBeNull()
    expect(scene.engine.startConnect({ blockId: 'src', portId: 'p2' })).toBe(true)
    expect(scene.engine.completeConnect({ blockId: 'src', portId: 'p1' })).toBe(false)
    expect(scene.engine.completeConnect({ blockId: 'dst', portId: 'q1' })).toBe(true)
    scene.engine.destroy()
  })

  it('refuses duplicates unless allowed', () => {
    const existing: ConnectionDescriptor = {
      id: 'x',
      from: { blockId: 'src', portId: 'p1' },
      to: { blockId: 'dst', portId: 'q1' },
    }
    const scene = createScene({}, {}, [existing])
    expect(scene.engine.startConnect({ blockId: 'src', portId: 'p1' })).toBe(true)
    expect(scene.engine.completeConnect({ blockId: 'dst', portId: 'q1' })).toBe(false)
    expect(scene.engine.completeConnect({ blockId: 'dst', portId: 'q2' })).toBe(true)
    scene.engine.destroy()

    const permissive = createScene({ allowDuplicates: true }, {}, [existing])
    permissive.engine.startConnect({ blockId: 'src', portId: 'p1' })
    expect(permissive.engine.completeConnect({ blockId: 'dst', portId: 'q1' })).toBe(true)
    permissive.engine.destroy()
  })

  it('refuses a block connected to itself unless allowed', () => {
    const scene = createScene({})
    scene.engine.startConnect({ blockId: 'src', portId: 'p1' })
    expect(scene.engine.completeConnect({ blockId: 'src', portId: 'p2' })).toBe(false)
    scene.engine.cancelConnect()
    scene.engine.destroy()

    const permissive = createScene({ allowSelf: true })
    permissive.engine.startConnect({ blockId: 'src', portId: 'p1' })
    expect(permissive.engine.completeConnect({ blockId: 'src', portId: 'p2' })).toBe(true)
    permissive.engine.destroy()
  })

  it('connects to a block body when to is "both"', () => {
    const scene = createScene({ to: 'both', handle: 'always' })
    pointer(hit(scene, 'src:p1'), 'pointerdown', 200, 20)
    pointer(document.body, 'pointermove', 500, 90)
    pointer(document.body, 'pointerup', 500, 90)
    expect(scene.events[1]!.payload).toMatchObject({ from: { blockId: 'src', portId: 'p1' }, to: { blockId: 'dst' } })
    expect((scene.events[1]!.payload as { to: object }).to).not.toHaveProperty('portId')
    scene.engine.destroy()
  })
})

describe('connect mode: two clicks and the programmatic API', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('starts on a handle click and finishes on another handle click', () => {
    const scene = createScene({ mode: 'click', handle: 'always' })
    click(hit(scene, 'src:p1'), 200, 20)
    expect(scene.engine.isConnecting()).toEqual({ active: true, from: { blockId: 'src', portId: 'p1' } })
    click(hit(scene, 'dst:q1'), 400, 20)
    expect(types(scene)).toEqual(['connect:start', 'connection:create-request'])
    expect(scene.events[1]!.payload).toMatchObject({ via: 'click', to: { blockId: 'dst', portId: 'q1' } })
    expect(scene.engine.isConnecting()).toEqual({ active: false })
    scene.engine.destroy()
  })

  it('cancels when the second click lands on empty space', () => {
    const scene = createScene({ mode: 'click', handle: 'always' })
    click(hit(scene, 'src:p1'), 200, 20)
    click(document.body, 300, 300)
    expect(scene.events[1]!.payload).toMatchObject({ reason: 'no-target' })
    scene.engine.destroy()
  })

  it('turns a press without movement into a click-mode start in mode "both"', () => {
    const scene = createScene({ handle: 'always' })
    pointer(hit(scene, 'src:p1'), 'pointerdown', 200, 20)
    pointer(document.body, 'pointerup', 200, 20)
    click(hit(scene, 'src:p1'), 200, 20)
    expect(scene.engine.isConnecting().active).toBe(true)
    click(hit(scene, 'dst:q1'), 400, 20)
    expect(last(scene).payload).toMatchObject({ via: 'click' })
    scene.engine.destroy()
  })

  it('drives a connection from the API: start, complete, cancel, isConnecting', () => {
    const scene = createScene({ mode: 'drag' })
    expect(scene.engine.startConnect({ blockId: 'nope' })).toBe(false)
    expect(scene.engine.startConnect({ blockId: 'src', portId: 'unknown' })).toBe(false)
    expect(scene.engine.startConnect({ blockId: 'src', portId: 'p1' })).toBe(true)
    expect(scene.engine.isConnecting()).toEqual({ active: true, from: { blockId: 'src', portId: 'p1' } })
    scene.engine.cancelConnect()
    expect(last(scene).payload).toMatchObject({ reason: 'api' })
    expect(scene.engine.isConnecting().active).toBe(false)

    scene.engine.startConnect({ blockId: 'src', portId: 'p1' })
    expect(scene.engine.completeConnect({ blockId: 'dst', portId: 'q2' })).toBe(true)
    expect(last(scene).payload).toMatchObject({ via: 'click', to: { portId: 'q2' } })
    expect(scene.engine.completeConnect({ blockId: 'dst', portId: 'q2' })).toBe(false)
    scene.engine.destroy()
  })
})

describe('connect mode: keyboard', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('makes ports focusable buttons and connects with Enter, Tab and Escape', () => {
    const scene = createScene({})
    const source = scene.ports['src:p1']!
    expect(source.getAttribute('tabindex')).toBe('0')
    expect(source.getAttribute('role')).toBe('button')
    expect(source.getAttribute('aria-label')).toBe('Port: src / p1')

    source.focus()
    key(source, 'Enter')
    expect(scene.engine.isConnecting().active).toBe(true)
    key(source, 'Tab')
    expect(document.activeElement).toBe(scene.ports['dst:q1'])
    key(document.activeElement!, 'Tab')
    expect(document.activeElement).toBe(scene.ports['dst:q2'])
    key(document.activeElement!, 'Tab', { shiftKey: true })
    expect(document.activeElement).toBe(scene.ports['dst:q1'])
    key(document.activeElement!, 'Enter')
    expect(last(scene).payload).toMatchObject({ via: 'keyboard', to: { blockId: 'dst', portId: 'q1' } })
    scene.engine.destroy()
  })

  it('cancels with Escape and restores the original attributes on destroy', () => {
    const scene = createScene({})
    key(scene.ports['src:p1']!, 'Enter')
    key(scene.ports['src:p1']!, 'Escape')
    expect(last(scene).payload).toMatchObject({ reason: 'escape' })
    scene.engine.destroy()
    expect(scene.ports['src:p1']!.hasAttribute('tabindex')).toBe(false)
    expect(scene.container.querySelector('.vl-live')).toBeNull()
  })

  it('announces to the live region', () => {
    const scene = createScene({ announce: { start: 'Start: {from}', complete: 'Done {from} -> {to}' } })
    key(scene.ports['src:p1']!, 'Enter')
    expect(scene.container.querySelector('.vl-live')!.getAttribute('aria-live')).toBe('polite')
    expect(scene.container.querySelector('.vl-live')!.textContent).toBe('Start: src / p1')
    key(scene.ports['src:p1']!, 'Tab')
    key(document.activeElement!, 'Enter')
    expect(scene.container.querySelector('.vl-live')!.textContent).toBe('Done src / p1 -> dst / q1')
    scene.engine.destroy()
  })
})

describe('connect mode: no leftovers', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('leaves no attributes and no listeners after 100 gestures', () => {
    let balance = 0
    const originalAdd = document.addEventListener.bind(document)
    const originalRemove = document.removeEventListener.bind(document)
    document.addEventListener = ((type: string, ...rest: unknown[]) => {
      if (type.startsWith('pointer') || type === 'click') balance++
      return (originalAdd as (...a: unknown[]) => void)(type, ...rest)
    }) as typeof document.addEventListener
    document.removeEventListener = ((type: string, ...rest: unknown[]) => {
      if (type.startsWith('pointer') || type === 'click') balance--
      return (originalRemove as (...a: unknown[]) => void)(type, ...rest)
    }) as typeof document.removeEventListener

    const scene = createScene({ handle: 'always' })
    const baseline = balance
    for (let i = 0; i < 100; i++) {
      pointer(hit(scene, 'src:p1'), 'pointerdown', 200, 20)
      pointer(document.body, 'pointermove', 399, 21)
      pointer(document.body, 'pointerup', 399, 21)
      pointer(hit(scene, 'src:p2'), 'pointerdown', 200, 60)
      key(document.body, 'Escape')
    }
    expect(balance).toBe(baseline)
    expect(scene.container.getAttribute('data-vl-connecting')).toBeNull()
    expect(document.querySelectorAll('[data-vl-connect-state]').length).toBe(0)
    scene.engine.destroy()
    document.addEventListener = originalAdd
    document.removeEventListener = originalRemove
  })

  it('removes handles and the live region when the mode is switched off', () => {
    const scene = createScene({ handle: 'always' })
    key(scene.ports['src:p1']!, 'Enter')
    expect(scene.container.querySelector('.vl-live')).not.toBeNull()
    scene.engine.setConfig({ interaction: { connect: { enabled: false } } })
    expect(scene.container.querySelector('[data-vl-handle]')).toBeNull()
    expect(scene.engine.isConnecting().active).toBe(false)
    expect(scene.ports['src:p1']!.hasAttribute('tabindex')).toBe(false)
    expect(scene.container.getAttribute('data-vl-connecting')).toBeNull()
    scene.engine.destroy()
  })
})

describe('connect mode: appearance', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('exposes the theme tokens as CSS variables', () => {
    const scene = createScene(
      {},
      { theme: { connectPreview: '#101010', connectValid: '#202020', connectInvalid: '#303030' } },
    )
    const svg = scene.container.querySelector('svg') as SVGElement
    expect(svg.style.getPropertyValue('--vl-connect-preview-color')).toBe('#101010')
    expect(svg.style.getPropertyValue('--vl-connect-valid-color')).toBe('#202020')
    expect(svg.style.getPropertyValue('--vl-connect-invalid-color')).toBe('#303030')
    scene.engine.destroy()
  })

  it('paints the handle of each state from ports.connect', () => {
    const scene = createScene(
      { handle: 'never' },
      {
        ports: {
          show: false,
          connect: {
            source: { fill: '#aa0000' },
            candidate: { fill: '#00aa00' },
            target: { fill: '#0000aa', radius: 9 },
            invalid: { fill: '#555555' },
          },
        },
      },
    )
    const dot = (key: string) => scene.container.querySelector(`[data-vl-handle="${key}"] .vl-handle`) as SVGElement
    expect(dot('src:p1').classList.contains('vl-handle--visible')).toBe(false)
    pointer(hit(scene, 'src:p1'), 'pointerdown', 200, 20)
    expect(dot('src:p1').style.fill).toBe('#aa0000')
    expect(dot('src:p1').classList.contains('vl-handle--source')).toBe(true)
    expect(dot('dst:q1').style.fill).toBe('#00aa00')
    expect(dot('dst:q1').classList.contains('vl-handle--visible')).toBe(true)
    pointer(document.body, 'pointermove', 399, 21)
    expect(dot('dst:q1').style.fill).toBe('#0000aa')
    expect(dot('dst:q1').style.getPropertyValue('r')).toBe('9px')
    pointer(document.body, 'pointerup', 399, 21)
    expect(dot('dst:q1').style.fill).toBe('')
    scene.engine.destroy()
  })

  it('shows the handles of a block only while the pointer is over it when handle is "hover"', () => {
    const scene = createScene({ handle: 'hover' })
    const dot = scene.container.querySelector('[data-vl-handle="src:p1"] .vl-handle') as SVGElement
    expect(dot.classList.contains('vl-handle--visible')).toBe(false)
    pointer(scene.blocks[0]!.el, 'pointerenter', 10, 10, { bubbles: false })
    expect(dot.classList.contains('vl-handle--visible')).toBe(true)
    pointer(scene.blocks[0]!.el, 'pointerleave', 10, 10, { bubbles: false })
    expect(dot.classList.contains('vl-handle--visible')).toBe(false)
    scene.engine.destroy()
  })

  it('styles the preview line from interaction.connect.preview', () => {
    const scene = createScene({ preview: { color: '#ff00ff', width: 4, dashed: false, opacity: 0.4 } })
    pointer(hit(scene, 'src:p1'), 'pointerdown', 200, 20)
    pointer(document.body, 'pointermove', 300, 200)
    const preview = scene.container.querySelector('.vl-connect-preview') as SVGPathElement
    expect(preview.style.stroke).toBe('#ff00ff')
    expect(preview.style.strokeWidth).toBe('4')
    expect(preview.style.strokeDasharray).toBe('none')
    expect(preview.style.opacity).toBe('0.4')
    expect(preview.getAttribute('d')).toMatch(/^M/)
    key(document.body, 'Escape')
    scene.engine.destroy()
  })

  it('draws the preview with the configured curve type', () => {
    for (const curve of ['straight', 'smoothstep', 'bezier'] as const) {
      const scene = createScene({ preview: { curve } })
      pointer(hit(scene, 'src:p1'), 'pointerdown', 200, 20)
      pointer(document.body, 'pointermove', 380, 150)
      const d = (scene.container.querySelector('.vl-connect-preview') as SVGPathElement).getAttribute('d')!
      if (curve === 'bezier') expect(d).toContain('C')
      if (curve === 'straight') expect(d).not.toContain('C')
      key(document.body, 'Escape')
      scene.engine.destroy()
    }
  })

  it('keeps the CSS for connecting out of the svg until the mode is used', () => {
    const plain = document.createElement('div')
    document.body.appendChild(plain)
    const engine = createVisualLinker(plain)
    expect(plain.querySelector('style')!.textContent).not.toContain('vl-handle')
    engine.destroy()
    const scene = createScene({})
    expect(scene.container.innerHTML).toContain('vl-handle-hit')
    scene.engine.destroy()
  })
})

describe('proxied state layer', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  function proxiedScene(lines: VisualLinkerConfig['lines']) {
    const scene = createScene({}, { lines, interaction: { selectable: true, connect: { enabled: false } } })
    scene.engine.setConnections([{ id: 'x', from: { blockId: 'gone', fallback: ['src'] }, to: { blockId: 'dst' } }])
    return scene
  }

  it('sits above the base style and below selected', () => {
    const scene = proxiedScene({
      color: '#111111',
      proxied: { color: '#222222', dashed: true },
      selected: { color: '#333333' },
    })
    const path = scene.container.querySelector('path.vl-connection') as SVGPathElement
    expect(path.style.stroke).toBe('#222222')
    expect(path.style.strokeDasharray).not.toBe('')
    scene.engine.setSelectedConnections(['x'])
    expect(path.style.stroke).toBe('#333333')
    scene.engine.destroy()
  })

  it('takes the connection own proxied style over the instance one', () => {
    const scene = createScene(
      {},
      { lines: { proxied: { opacity: 0.2 } }, interaction: { connect: { enabled: false } } },
    )
    scene.engine.setConnections([
      {
        id: 'x',
        from: { blockId: 'gone', fallback: ['src'] },
        to: { blockId: 'dst' },
        style: { proxied: { opacity: 0.7 } },
      },
    ])
    expect((scene.container.querySelector('path.vl-connection') as SVGPathElement).style.strokeOpacity).toBe('0.7')
    scene.engine.destroy()
  })
})
