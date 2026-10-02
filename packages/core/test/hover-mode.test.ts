import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVisualLinker, type VisualLinker } from '../src/visual-linker'
import type { BlockDescriptor, ConnectionDescriptor, VisualLinkerConfig } from '../src/types'

function block(id: string, left: number): HTMLElement {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => new DOMRect(left, 0, 100, 40)
  document.body.appendChild(el)
  return el
}

const pointer = (el: Element, type: string) =>
  el.dispatchEvent(new PointerEvent(type, { bubbles: false, cancelable: true, pointerId: 1 }))

let engine: VisualLinker | undefined

function setup(
  config: VisualLinkerConfig = {},
  connection: Partial<ConnectionDescriptor> = {},
  blockA: Partial<BlockDescriptor> = {},
) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  engine = createVisualLinker(container, config)
  const a = block('a', 0)
  const b = block('b', 300)
  engine.setBlocks([
    { id: 'a', el: a, ...blockA },
    { id: 'b', el: b },
  ])
  engine.setConnections([{ id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' }, ...connection }])
  const path = () => container.querySelector('path.vl-connection') as SVGPathElement
  const hit = () => container.querySelector('path.vl-connection-hit') as SVGPathElement
  return { engine, a, path, hit }
}

afterEach(() => {
  engine?.destroy()
  engine = undefined
  document.body.innerHTML = ''
})

describe('line hover is opt-in', () => {
  it('does nothing visible by default, and shows no pointer cursor', () => {
    const { path, hit } = setup()
    pointer(hit(), 'pointerenter')
    expect(path().classList.contains('vl-connection--active')).toBe(false)
    expect(hit().style.cursor).toBe('')
  })

  it('still emits the connection events by default', () => {
    const { engine, hit } = setup()
    const enter = vi.fn()
    const leave = vi.fn()
    engine.on('connection:mouseenter', enter)
    engine.on('connection:mouseleave', leave)
    pointer(hit(), 'pointerenter')
    pointer(hit(), 'pointerleave')
    expect(enter).toHaveBeenCalledTimes(1)
    expect(leave).toHaveBeenCalledTimes(1)
  })

  it('applies the hover state and the pointer cursor with interaction.hover', () => {
    const { path, hit } = setup({ interaction: { hover: true }, lines: { width: 2 } })
    expect(hit().style.cursor).toBe('pointer')
    pointer(hit(), 'pointerenter')
    expect(path().classList.contains('vl-connection--active')).toBe(true)
    expect(path().style.strokeWidth).toBe('3.5')
    pointer(hit(), 'pointerleave')
    expect(path().classList.contains('vl-connection--active')).toBe(false)
    expect(path().style.strokeWidth).toBe('2')
  })

  it('lets a connection turn it on or off against the instance-wide setting', () => {
    const on = setup({}, { hoverable: true })
    pointer(on.hit(), 'pointerenter')
    expect(on.path().classList.contains('vl-connection--active')).toBe(true)
    expect(on.hit().style.cursor).toBe('pointer')
    engine!.destroy()
    document.body.innerHTML = ''

    const off = setup({ interaction: { hover: true } }, { hoverable: false })
    pointer(off.hit(), 'pointerenter')
    expect(off.path().classList.contains('vl-connection--active')).toBe(false)
    expect(off.hit().style.cursor).toBe('')
  })

  it('shows the pointer cursor on a selectable connection without any hover effect', () => {
    const { path, hit } = setup({ interaction: { selectable: true } })
    expect(hit().style.cursor).toBe('pointer')
    pointer(hit(), 'pointerenter')
    expect(path().classList.contains('vl-connection--active')).toBe(false)
  })

  it('follows setConfig, and drops a hover that is switched off while it lasts', () => {
    const { engine, path, hit } = setup()
    engine.setConfig({ interaction: { hover: true } })
    expect(hit().style.cursor).toBe('pointer')
    pointer(hit(), 'pointerenter')
    expect(path().classList.contains('vl-connection--active')).toBe(true)
    engine.setConfig({ interaction: { hover: false } })
    expect(path().classList.contains('vl-connection--active')).toBe(false)
    expect(hit().style.cursor).toBe('')
  })
})

describe('block highlight is opt-in', () => {
  it('highlights nothing by default, but still emits the block events', () => {
    const { engine, a, path } = setup()
    const enter = vi.fn()
    engine.on('block:mouseenter', enter)
    pointer(a, 'pointerenter')
    expect(path().classList.contains('vl-connection--active')).toBe(false)
    expect(enter).toHaveBeenCalledWith({ blockId: 'a' })
  })

  it('highlights the connections of a hovered block with interaction.highlight, independent of hover', () => {
    const { a, path, hit } = setup({ interaction: { highlight: true } })
    expect(hit().style.cursor).toBe('')
    pointer(a, 'pointerenter')
    expect(path().classList.contains('vl-connection--active')).toBe(true)
    pointer(a, 'pointerleave')
    expect(path().classList.contains('vl-connection--active')).toBe(false)
  })

  it('lets a block turn it on or off against the instance-wide setting', () => {
    const on = setup({}, {}, { highlightable: true })
    pointer(on.a, 'pointerenter')
    expect(on.path().classList.contains('vl-connection--active')).toBe(true)
    engine!.destroy()
    document.body.innerHTML = ''

    const off = setup({ interaction: { highlight: true } }, {}, { highlightable: false })
    pointer(off.a, 'pointerenter')
    expect(off.path().classList.contains('vl-connection--active')).toBe(false)
  })
})
