import { afterEach, describe, expect, it, vi } from 'vitest'
import { mergeConfig } from '../src/config'
import { createVisualLinker, type VisualLinker } from '../src/visual-linker'

function block(id: string, left: number, top: number): HTMLElement {
  const el = document.createElement('div')
  el.id = id
  el.getBoundingClientRect = () => new DOMRect(left, top, 100, 40)
  document.body.appendChild(el)
  return el
}

function setup(options: Parameters<typeof createVisualLinker>[1] = { interaction: { selectable: true } }) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const engine = createVisualLinker(container, mergeConfig({ ports: { show: false } }, options))
  engine.setBlocks([
    { id: 'a', el: block('a', 0, 0) },
    { id: 'b', el: block('b', 300, 0) },
    { id: 'c', el: block('c', 300, 200) },
  ])
  engine.setConnections([
    { id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' }, style: { width: 2, selected: { color: 'red' } } },
    { id: 'ac', from: { blockId: 'a' }, to: { blockId: 'c' }, ariaLabel: 'A to C' },
  ])
  const paths = Object.fromEntries(
    [...container.querySelectorAll('path.vl-connection')].map((p, i) => [['ab', 'ac'][i]!, p as SVGPathElement]),
  )
  const hits = Object.fromEntries(
    [...container.querySelectorAll('path.vl-connection-hit')].map((p, i) => [['ab', 'ac'][i]!, p as SVGPathElement]),
  )
  const changes: string[][] = []
  engine.on('connection:selectionchange', ({ selectedIds }) => changes.push(selectedIds))
  return { engine, container, paths, hits, changes }
}

const click = (el: Element, init: MouseEventInit = {}) =>
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init }))
const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }))

let engine: VisualLinker | undefined
afterEach(() => {
  engine?.destroy()
  engine = undefined
  document.body.innerHTML = ''
})

describe('selectable connections', () => {
  it('is off by default: no tab stops, hit paths hidden from assistive tech, clicks select nothing', () => {
    const s = setup({})
    engine = s.engine
    expect(s.hits.ab!.hasAttribute('tabindex')).toBe(false)
    expect(s.hits.ab!.getAttribute('aria-hidden')).toBe('true')
    click(s.hits.ab!)
    expect(s.paths.ab!.classList.contains('vl-connection--selected')).toBe(false)
    expect(s.changes).toEqual([])
  })

  it('names every line (custom or default) and makes the hit paths focusable buttons when enabled', () => {
    const s = setup()
    engine = s.engine
    expect(s.paths.ac!.getAttribute('aria-label')).toBe('A to C')
    expect(s.paths.ab!.getAttribute('aria-label')).toBe('Connection: a → b')
    expect(s.paths.ab!.getAttribute('role')).toBe('img')
    expect(s.hits.ab!.getAttribute('tabindex')).toBe('0')
    expect(s.hits.ab!.getAttribute('role')).toBe('button')
    expect(s.hits.ab!.getAttribute('aria-label')).toBe('Connection: a → b')
    expect(s.hits.ab!.getAttribute('aria-pressed')).toBe('false')
  })

  it('a click selects (replacing the selection), applies selectedStyle and the width bump, and reports the change', () => {
    const s = setup()
    engine = s.engine
    click(s.hits.ab!)
    expect(s.paths.ab!.classList.contains('vl-connection--selected')).toBe(true)
    expect(s.paths.ab!.style.stroke).toBe('red') // selectedStyle.color
    expect(Number(s.paths.ab!.style.strokeWidth)).toBeGreaterThan(2)
    expect(s.hits.ab!.getAttribute('aria-pressed')).toBe('true')
    expect(s.changes).toEqual([['ab']])

    click(s.hits.ac!)
    expect(s.paths.ab!.classList.contains('vl-connection--selected')).toBe(false)
    expect(s.paths.ab!.style.strokeWidth).toBe('2')
    expect(s.changes.at(-1)).toEqual(['ac'])
  })

  it('Ctrl/Cmd/Shift-click toggles within a multi-selection, and re-clicking the only selected one changes nothing', () => {
    const s = setup()
    engine = s.engine
    click(s.hits.ab!)
    click(s.hits.ac!, { ctrlKey: true })
    expect(s.changes.at(-1)).toEqual(['ab', 'ac'])
    click(s.hits.ab!, { metaKey: true })
    expect(s.changes.at(-1)).toEqual(['ac'])

    const before = s.changes.length
    click(s.hits.ac!) // plain click on the sole selection
    expect(s.changes.length).toBe(before)
  })

  it('Enter/Space select like a click (and still emit connection:click); Delete asks, never removes', () => {
    const s = setup()
    engine = s.engine
    const clicked = vi.fn()
    const deleteRequest = vi.fn()
    s.engine.on('connection:click', clicked)
    s.engine.on('connection:delete-request', deleteRequest)

    key(s.hits.ab!, 'Enter')
    key(s.hits.ac!, ' ', { ctrlKey: true })
    expect(s.changes.at(-1)).toEqual(['ab', 'ac'])
    expect(clicked).toHaveBeenCalledTimes(2)

    key(s.hits.ab!, 'Delete') // focused one is selected → the whole selection
    expect(deleteRequest.mock.calls[0]![0].connections.map((c: { id: string }) => c.id)).toEqual(['ab', 'ac'])
    expect(s.container.querySelectorAll('path.vl-connection')).toHaveLength(2) // nothing was removed

    s.engine.setSelectedConnections([])
    key(s.hits.ac!, 'Backspace') // focused one is not selected → just it
    expect(deleteRequest.mock.calls[1]![0].connections.map((c: { id: string }) => c.id)).toEqual(['ac'])
  })

  it('Escape or a pointerdown elsewhere clears the selection, but a pointerdown on a connection does not', () => {
    const s = setup()
    engine = s.engine
    click(s.hits.ab!)
    s.hits.ab!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(s.changes).toEqual([['ab']])

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(s.changes.at(-1)).toEqual([])

    click(s.hits.ab!)
    key(document.body, 'Escape')
    expect(s.changes.at(-1)).toEqual([])
  })

  it('setSelectedConnections drives the state without emitting, and removed connections drop out of the selection', () => {
    const s = setup()
    engine = s.engine
    s.engine.setSelectedConnections(['ab', 'ac'])
    expect(s.changes).toEqual([])
    expect(s.paths.ac!.classList.contains('vl-connection--selected')).toBe(true)

    s.engine.removeConnection('ab')
    expect(s.changes).toEqual([['ac']])
  })

  it('shows keyboard focus on the visible line', () => {
    const s = setup()
    engine = s.engine
    s.hits.ab!.dispatchEvent(new Event('focus'))
    expect(s.paths.ab!.classList.contains('vl-connection--focus')).toBe(true)
    s.hits.ab!.dispatchEvent(new Event('blur'))
    expect(s.paths.ab!.classList.contains('vl-connection--focus')).toBe(false)
  })

  it('lets hoverStyle win over selectedStyle while both apply', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const a = block('a', 0, 0)
    const b = block('b', 300, 0)
    engine = createVisualLinker(container, { ports: { show: false }, interaction: { selectable: true } })
    engine.setBlocks([
      { id: 'a', el: a },
      { id: 'b', el: b },
    ])
    engine.setConnections([
      {
        id: 'ab',
        from: { blockId: 'a' },
        to: { blockId: 'b' },
        style: { selected: { color: 'red' }, hover: { color: 'blue' } },
      },
    ])
    const path = container.querySelector('path.vl-connection') as SVGPathElement
    const hit = container.querySelector('path.vl-connection-hit') as SVGPathElement
    click(hit)
    expect(path.style.stroke).toBe('red')
    hit.dispatchEvent(new Event('pointerenter'))
    expect(path.style.stroke).toBe('blue')
    hit.dispatchEvent(new Event('pointerleave'))
    expect(path.style.stroke).toBe('red')
  })
})
