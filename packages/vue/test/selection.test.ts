import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { createVisualLinker, engineMock, handlers } = vi.hoisted(() => {
  const handlers: Record<string, (payload: unknown) => void> = {}
  const engineMock = {
    setBlocks: vi.fn(),
    setConnections: vi.fn(),
    setSelectedConnections: vi.fn(),
    on: vi.fn((event: string, handler: (payload: unknown) => void) => {
      handlers[event] = handler
      return () => {}
    }),
    destroy: vi.fn(),
  }
  return { createVisualLinker: vi.fn(() => engineMock), engineMock, handlers }
})
vi.mock('@macrulez/visual-linker-core', () => ({ createVisualLinker }))

const { VisualLinker } = await import('../src/VisualLinker')

afterEach(() => {
  createVisualLinker.mockClear()
  engineMock.setSelectedConnections.mockClear()
  engineMock.setConnections.mockClear()
})

const connections = [{ id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' } }]

describe('selection props and events', () => {
  it('pushes the `selected` prop into the engine after the connections, and follows later changes', async () => {
    const selected = ref(['ab'])
    const Host = defineComponent({
      setup: () => () => h(VisualLinker, { connections, selected: selected.value }),
    })
    const wrapper = mount(Host, { attachTo: document.body })
    await flushPromises()

    expect(engineMock.setSelectedConnections).toHaveBeenCalledWith(['ab'])
    expect(engineMock.setConnections.mock.invocationCallOrder[0]!).toBeLessThan(
      engineMock.setSelectedConnections.mock.invocationCallOrder[0]!,
    )

    selected.value = []
    await flushPromises()
    expect(engineMock.setSelectedConnections).toHaveBeenLastCalledWith([])
    wrapper.unmount()
  })

  it('does not touch the engine selection when `selected` is left unset (uncontrolled)', async () => {
    const wrapper = mount(VisualLinker, { props: { connections }, attachTo: document.body })
    await flushPromises()
    expect(engineMock.setSelectedConnections).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('emits update:selected (for v-model) and connection-selectionchange, and forwards delete requests', async () => {
    const wrapper = mount(VisualLinker, { props: { connections }, attachTo: document.body })
    await flushPromises()

    handlers['connection:selectionchange']!({ selectedIds: ['ab'] })
    expect(wrapper.emitted('update:selected')).toEqual([[['ab']]])
    expect(wrapper.emitted('connection-selectionchange')).toEqual([[['ab']]])

    handlers['connection:delete-request']!({ connections })
    expect(wrapper.emitted('connection-delete-request')).toEqual([[connections]])
    wrapper.unmount()
  })
})
