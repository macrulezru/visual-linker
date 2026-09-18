import { h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionLayout } from '@macrulez/visual-linker-core'

const { createVisualLinker, emitLayout } = vi.hoisted(() => {
  let layoutHandler: ((payload: { connections: ConnectionLayout[] }) => void) | undefined
  const engineMock = {
    setBlocks: vi.fn(),
    setConnections: vi.fn(),
    on: vi.fn((event: string, handler: (payload: { connections: ConnectionLayout[] }) => void) => {
      if (event === 'layout') layoutHandler = handler
      return () => {}
    }),
    destroy: vi.fn(),
  }
  return {
    createVisualLinker: vi.fn(() => engineMock),
    emitLayout: (p: { connections: ConnectionLayout[] }) => layoutHandler?.(p),
  }
})
vi.mock('@macrulez/visual-linker-core', () => ({ createVisualLinker }))

const { VisualLinker } = await import('../src/VisualLinker')

afterEach(() => {
  createVisualLinker.mockClear()
})

describe('#connection-label overlay', () => {
  it("renders slot content positioned at the layout event's mid point, keyed to the matching connection", async () => {
    const wrapper = mount(VisualLinker, {
      props: {
        blocks: [{ id: 'a' }, { id: 'b' }],
        connections: [{ id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' } }],
      },
      slots: {
        'block-a': () => 'A',
        'block-b': () => 'B',
        'connection-label': ({ connection, point }: { connection: { id: string }; point: { x: number; y: number } }) =>
          h('span', { class: 'label' }, `${connection.id}:${point.x},${point.y}`),
      },
      attachTo: document.body,
    })
    await nextTick()

    emitLayout({ connections: [{ id: 'ab', from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, mid: { x: 50, y: 20 } }] })
    await nextTick()

    const labelWrapper = wrapper.find('.vl-connection-label')
    expect(labelWrapper.exists()).toBe(true)
    expect(labelWrapper.attributes('style')).toContain('left: 50px')
    expect(labelWrapper.attributes('style')).toContain('top: 20px')
    expect(labelWrapper.find('.label').text()).toBe('ab:50,20')

    wrapper.unmount()
  })

  it('drops a stale label once its connection is removed, even if the layout payload is not yet updated', async () => {
    const wrapper = mount(VisualLinker, {
      props: {
        blocks: [{ id: 'a' }, { id: 'b' }],
        connections: [],
      },
      slots: {
        'block-a': () => 'A',
        'block-b': () => 'B',
        'connection-label': () => h('span', 'label'),
      },
      attachTo: document.body,
    })
    await nextTick()

    // A layout event for a connection no longer in props.connections (e.g. the
    // engine's next render hasn't caught up yet) must not render a ghost label.
    emitLayout({ connections: [{ id: 'gone', from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, mid: { x: 0, y: 0 } }] })
    await nextTick()

    expect(wrapper.find('.vl-connection-label').exists()).toBe(false)

    wrapper.unmount()
  })

  it('renders no overlay at all when the connection-label slot is not used', async () => {
    const wrapper = mount(VisualLinker, {
      props: { blocks: [{ id: 'a' }], connections: [] },
      slots: { 'block-a': () => 'A' },
      attachTo: document.body,
    })
    await nextTick()

    expect(wrapper.find('.vl-overlay').exists()).toBe(false)

    wrapper.unmount()
  })
})
