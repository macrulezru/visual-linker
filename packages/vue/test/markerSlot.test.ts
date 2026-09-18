import { h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionLayout, PortLayout } from '@macrulez/visual-linker-core'

const { createVisualLinker, emitLayout } = vi.hoisted(() => {
  let layoutHandler: ((payload: { connections: ConnectionLayout[]; ports: PortLayout[] }) => void) | undefined
  const engineMock = {
    setBlocks: vi.fn(),
    setConnections: vi.fn(),
    on: vi.fn((event: string, handler: typeof layoutHandler) => {
      if (event === 'layout') layoutHandler = handler
      return () => {}
    }),
    destroy: vi.fn(),
  }
  return {
    createVisualLinker: vi.fn(() => engineMock),
    emitLayout: (p: { connections: ConnectionLayout[]; ports: PortLayout[] }) => layoutHandler?.(p),
  }
})
vi.mock('@macrulez/visual-linker-core', () => ({ createVisualLinker }))

const { VisualLinker } = await import('../src/VisualLinker')

afterEach(() => {
  createVisualLinker.mockClear()
})

const layout: ConnectionLayout = {
  id: 'ab',
  from: { x: 0, y: 0 },
  to: { x: 100, y: 0 },
  mid: { x: 50, y: 0 },
  fromAngle: 10,
  toAngle: 20,
}

describe('#marker overlay', () => {
  it('renders one marker at start and one at end, rotated to each angle', async () => {
    const wrapper = mount(VisualLinker, {
      props: {
        blocks: [{ id: 'a' }, { id: 'b' }],
        connections: [{ id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' } }],
      },
      slots: {
        'block-a': () => 'A',
        'block-b': () => 'B',
        marker: ({ position }: { position: 'start' | 'end' }) => h('i', position),
      },
      attachTo: document.body,
    })
    await nextTick()

    emitLayout({ connections: [layout], ports: [] })
    await nextTick()

    const markers = wrapper.findAll('.vl-marker')
    expect(markers).toHaveLength(2)
    expect(markers[0]!.attributes('style')).toContain('rotate(10deg)')
    expect(markers[0]!.find('i').text()).toBe('start')
    expect(markers[1]!.attributes('style')).toContain('rotate(20deg)')
    expect(markers[1]!.find('i').text()).toBe('end')

    wrapper.unmount()
  })

  it('skips whichever end already has an explicit startMarker/endMarker style', async () => {
    const wrapper = mount(VisualLinker, {
      props: {
        blocks: [{ id: 'a' }, { id: 'b' }],
        connections: [{ id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' }, style: { endMarker: 'arrow' } }],
      },
      slots: {
        'block-a': () => 'A',
        'block-b': () => 'B',
        marker: ({ position }: { position: 'start' | 'end' }) => h('i', position),
      },
      attachTo: document.body,
    })
    await nextTick()

    emitLayout({ connections: [layout], ports: [] })
    await nextTick()

    const markers = wrapper.findAll('.vl-marker')
    expect(markers).toHaveLength(1)
    expect(markers[0]!.find('i').text()).toBe('start')

    wrapper.unmount()
  })
})
