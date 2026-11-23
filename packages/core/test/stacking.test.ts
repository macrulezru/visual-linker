import { afterEach, describe, expect, it } from 'vitest'
import { createVisualLinker, type VisualLinker } from '../src/visual-linker'

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

describe('stacking', () => {
  let container: HTMLElement
  let engine: VisualLinker

  afterEach(() => {
    engine?.destroy()
    container?.remove()
  })

  function setup(options: Parameters<typeof createVisualLinker>[1] = {}) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const a = makeBlock('a', { left: 0, top: 0, right: 100, width: 100 })
    const b = makeBlock('b', { left: 200, top: 0, right: 300, width: 100 })
    container.append(a, b)
    engine = createVisualLinker(container, options)
    engine.setBlocks([
      { id: 'a', el: a },
      { id: 'b', el: b },
    ])
    engine.setConnections([{ id: 'a-b', from: { blockId: 'a' }, to: { blockId: 'b' } }])
    return { a, b }
  }

  it('keeps a single overlay SVG when stacking is omitted', () => {
    setup({ ports: { show: true } })
    expect(container.querySelectorAll('svg.vl-svg')).toHaveLength(1)
    expect(container.querySelector('svg.vl-svg--under')).toBeNull()
    expect(container.querySelector('path.vl-connection')?.closest('svg')).toBe(container.querySelector('svg.vl-svg'))
  })

  it('puts strokes in an underlay SVG and ports in the front SVG', () => {
    setup({ stacking: { lines: 'under' }, ports: { show: true }, markers: { end: { shape: 'arrow' } } })
    const under = container.querySelector('svg.vl-svg--under')
    const front = [...container.querySelectorAll('svg.vl-svg')].find((el) => !el.classList.contains('vl-svg--under'))
    expect(under).toBeTruthy()
    expect(front).toBeTruthy()
    expect(container.firstElementChild).toBe(under)
    expect(under!.querySelector('path.vl-connection')).toBeTruthy()
    expect(front!.querySelector('circle.vl-port')).toBeTruthy()
    expect(front!.querySelector('path.vl-connection-markers')).toBeTruthy()
    expect(under!.querySelector('path.vl-connection')!.style.markerEnd).toBe('')
  })

  it('lets a connection override the instance-wide line plane', () => {
    setup({ stacking: { lines: 'under' } })
    engine.setConnections([
      { id: 'a-b', from: { blockId: 'a' }, to: { blockId: 'b' }, style: { stacking: 'over' } },
    ])
    const under = container.querySelector('svg.vl-svg--under')
    const front = [...container.querySelectorAll('svg.vl-svg')].find((el) => !el.classList.contains('vl-svg--under'))
    expect(under?.querySelector('path.vl-connection')).toBeNull()
    expect(front!.querySelector('path.vl-connection')).toBeTruthy()
  })

  it('lets a block override the instance-wide port plane', () => {
    const { a, b } = setup({ stacking: { lines: 'over', ports: 'over' }, ports: { show: true } })
    engine.setBlocks([
      { id: 'a', el: a, stacking: { ports: 'under' } },
      { id: 'b', el: b },
    ])
    const under = container.querySelector('svg.vl-svg--under')
    expect(under).toBeTruthy()
    expect(under!.querySelectorAll('circle.vl-port').length).toBeGreaterThan(0)
  })

  it('draws into a dedicated underlay host when setUnderlay is used', () => {
    container = document.createElement('div')
    const back = document.createElement('div')
    const front = document.createElement('div')
    document.body.append(container, back, front)
    const a = makeBlock('a', { left: 0, top: 0, right: 100, width: 100 })
    const b = makeBlock('b', { left: 200, top: 0, right: 300, width: 100 })
    engine = createVisualLinker(front, { stacking: { lines: 'under' }, ports: { show: true } })
    engine.setUnderlay(back)
    engine.setBlocks([
      { id: 'a', el: a },
      { id: 'b', el: b },
    ])
    engine.setConnections([{ id: 'a-b', from: { blockId: 'a' }, to: { blockId: 'b' } }])
    expect(back.querySelector('svg.vl-svg--under path.vl-connection:not(.vl-connection-markers)')).toBeTruthy()
    expect(front.querySelector('circle.vl-port')).toBeTruthy()
    expect(front.querySelector('path.vl-connection-markers')).toBeTruthy()
    expect(front.querySelector('path.vl-connection:not(.vl-connection-markers)')).toBeNull()
  })
})
