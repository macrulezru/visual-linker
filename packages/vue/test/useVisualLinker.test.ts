import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { createVisualLinker, engineMock } = vi.hoisted(() => {
  const engineMock = { setBlocks: vi.fn(), setConnections: vi.fn(), on: vi.fn(() => () => {}), destroy: vi.fn() }
  return { createVisualLinker: vi.fn(() => engineMock), engineMock }
})
vi.mock('@macrulez/visual-linker-core', () => ({ createVisualLinker }))

const { useVisualLinker } = await import('../src/useVisualLinker')

afterEach(() => {
  createVisualLinker.mockClear()
  engineMock.setBlocks.mockClear()
})

function lastSetBlocksCall() {
  return engineMock.setBlocks.mock.calls.at(-1)![0] as { id: string; el: unknown }[]
}

describe('useVisualLinker — ref-friendly block.el', () => {
  it('drops a block whose el ref has not resolved yet, then includes it once it does', async () => {
    const container = ref<HTMLElement | null>(null)
    const blockRef = ref<HTMLElement | null>(null)
    const show = ref(false)

    const Host = defineComponent({
      setup() {
        useVisualLinker(container, { blocks: [{ id: 'a', el: blockRef }] })
        return () => [h('div', { ref: container }), show.value ? h('div', { ref: blockRef }) : null]
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    await nextTick()

    expect(lastSetBlocksCall()).toEqual([])

    show.value = true
    await nextTick()

    expect(blockRef.value).toBeInstanceOf(HTMLElement)
    expect(lastSetBlocksCall()).toEqual([{ id: 'a', el: blockRef.value }])

    wrapper.unmount()
  })

  it('resolves a ref-based dragHandle too', async () => {
    const container = ref<HTMLElement | null>(null)
    const blockRef = ref<HTMLElement | null>(null)
    const handleRef = ref<HTMLElement | null>(null)

    const Host = defineComponent({
      setup() {
        useVisualLinker(container, { blocks: [{ id: 'a', el: blockRef, dragHandle: handleRef }] })
        return () => [h('div', { ref: container }), h('div', { ref: blockRef }, [h('div', { ref: handleRef })])]
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    await nextTick()

    expect(handleRef.value).toBeInstanceOf(HTMLElement)
    expect(lastSetBlocksCall()).toEqual([{ id: 'a', el: blockRef.value, dragHandle: handleRef.value }])

    wrapper.unmount()
  })
})
