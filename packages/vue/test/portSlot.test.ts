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

describe('#port overlay', () => {
  it('renders slot content positioned at each resolved port point', async () => {
    const wrapper = mount(VisualLinker, {
      props: {
        blocks: [{ id: 'a' }, { id: 'b' }],
        connections: [{ id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' } }],
      },
      slots: {
        'block-a': () => 'A',
        'block-b': () => 'B',
        port: ({ blockId, portId }: { blockId: string; portId?: string }) => h('i', `${blockId}:${portId ?? ''}`),
      },
      attachTo: document.body,
    })
    await nextTick()

    emitLayout({
      connections: [],
      ports: [
        { key: 'a:100:20', blockId: 'a', portId: undefined, point: { x: 100, y: 20 } },
        { key: 'b:300:20', blockId: 'b', portId: 'in', point: { x: 300, y: 20 } },
      ],
    })
    await nextTick()

    const slots = wrapper.findAll('.vl-port-slot')
    expect(slots).toHaveLength(2)
    expect(slots[0]!.attributes('style')).toContain('left: 100px')
    expect(slots[1]!.find('i').text()).toBe('b:in')

    wrapper.unmount()
  })

  it('renders nothing when the port slot is not used, even if showPorts stays default', async () => {
    const wrapper = mount(VisualLinker, {
      props: { blocks: [{ id: 'a' }], connections: [] },
      slots: { 'block-a': () => 'A' },
      attachTo: document.body,
    })
    await nextTick()

    emitLayout({ connections: [], ports: [{ key: 'a:0:0', blockId: 'a', point: { x: 0, y: 0 } }] })
    await nextTick()

    expect(wrapper.find('.vl-port-slot').exists()).toBe(false)
    expect(wrapper.find('.vl-overlay').exists()).toBe(false)

    wrapper.unmount()
  })
})
