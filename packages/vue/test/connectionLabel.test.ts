import { h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
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
        'connection-label': ({ connection, point }: { connection: { id: string }; point: { x: number; y: number } }) =>
          h('span', { class: 'label' }, `${connection.id}:${point.x},${point.y}`),
      },
      attachTo: document.body,
    })
    await flushPromises()

    emitLayout({ connections: [{ id: 'ab', from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, mid: { x: 50, y: 20 } }] })
    await flushPromises()

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
        'connection-label': () => h('span', 'label'),
      },
      attachTo: document.body,
    })
    await flushPromises()

    // A layout event for a connection no longer in props.connections (e.g. the
    // engine's next render hasn't caught up yet) must not render a ghost label.
    emitLayout({ connections: [{ id: 'gone', from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, mid: { x: 0, y: 0 } }] })
    await flushPromises()

    expect(wrapper.find('.vl-connection-label').exists()).toBe(false)

    wrapper.unmount()
  })

  it('renders no overlay at all when the connection-label slot is not used', async () => {
    const wrapper = mount(VisualLinker, {
      props: { blocks: [{ id: 'a' }], connections: [] },
      attachTo: document.body,
    })
    await flushPromises()

    expect(wrapper.find('.vl-overlay').exists()).toBe(false)

    wrapper.unmount()
  })
})

describe('#connection-label with `labels`', () => {
  const connection = {
    id: 'ab',
    from: { blockId: 'a' },
    to: { blockId: 'b' },
    labels: [
      { id: 'drawn', position: 'middle' as const, text: 'drawn by the engine' },
      { id: 'start', position: 'start' as const, rotate: true },
      { id: 'end', position: 0.9 as const },
    ],
  }
  const placed = (id: string, x: number, rotation = 0, text?: string) => ({
    id,
    point: { x, y: 5 },
    angle: rotation,
    rotation,
    text,
  })

  it('calls the slot once per label without `text`, at its own point and rotation, passing the label itself', async () => {
    const wrapper = mount(VisualLinker, {
      props: { connections: [connection] },
      slots: {
        'connection-label': ({ label, rotation }: { label?: { id: string }; rotation: number }) =>
          h('i', `${label?.id}:${rotation}`),
      },
      attachTo: document.body,
    })
    await flushPromises()

    emitLayout({
      connections: [
        {
          id: 'ab',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 0 },
          mid: { x: 50, y: 0 },
          labels: [placed('drawn', 50, 0, 'drawn by the engine'), placed('start', 20, -30), placed('end', 90)],
        },
      ],
    })
    await flushPromises()

    const boxes = wrapper.findAll('.vl-connection-label')
    expect(boxes).toHaveLength(2) // the one with `text` is the engine's, not the slot's
    expect(boxes[0]!.text()).toBe('start:-30')
    expect(boxes[0]!.attributes('style')).toContain('left: 20px')
    expect(boxes[0]!.attributes('style')).toContain('rotate(-30deg)')
    expect(boxes[1]!.text()).toBe('end:0')
    wrapper.unmount()
  })
})
