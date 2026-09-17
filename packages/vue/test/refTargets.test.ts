import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { createVisualLinker, engineMock } = vi.hoisted(() => {
  const engineMock = { setBlocks: vi.fn(), setConnections: vi.fn(), on: vi.fn(() => () => {}), destroy: vi.fn() }
  return { createVisualLinker: vi.fn(() => engineMock), engineMock }
})
vi.mock('@macrulez/visual-linker-core', () => ({ createVisualLinker }))

const { VisualLinker } = await import('../src/VisualLinker')

afterEach(() => {
  createVisualLinker.mockClear()
  engineMock.setBlocks.mockClear()
})

function lastSetBlocksCall() {
  return engineMock.setBlocks.mock.calls.at(-1)![0] as {
    dragHandle?: unknown
    ports?: { target?: unknown; anchorEl?: unknown }[]
  }[]
}

describe('ref-friendly target/anchorEl/dragHandle', () => {
  it('resolves a template ref target that has already mounted by the time blocks first sync', async () => {
    const rowRef = ref<HTMLElement | null>(null)

    const Host = defineComponent({
      setup() {
        const blocks = [{ id: 'a', ports: [{ id: 'p', target: rowRef }] }]
        return () => h(VisualLinker, { blocks, connections: [] }, { 'block-a': () => h('div', { ref: rowRef }, 'Row') })
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    await nextTick()

    expect(rowRef.value).toBeInstanceOf(HTMLElement)
    expect(lastSetBlocksCall()[0]!.ports![0]!.target).toBe(rowRef.value)

    wrapper.unmount()
  })

  it('re-syncs once a conditionally-rendered ref target appears later, without the blocks array itself changing', async () => {
    const show = ref(false)
    const rowRef = ref<HTMLElement | null>(null)
    // A stable array reference: proves the re-sync comes from tracking the ref
    // read inside resolvePortForCore, not from `blocks` itself changing.
    const blocks = [{ id: 'a', ports: [{ id: 'p', target: rowRef }] }]

    const Host = defineComponent({
      setup() {
        return () =>
          h(
            VisualLinker,
            { blocks, connections: [] },
            {
              'block-a': () => (show.value ? h('div', { ref: rowRef }, 'Row') : null),
            },
          )
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    await nextTick()
    expect(rowRef.value).toBeNull()
    expect(lastSetBlocksCall()[0]!.ports![0]!.target).toBeUndefined()

    show.value = true
    await nextTick()

    expect(rowRef.value).toBeInstanceOf(HTMLElement)
    expect(lastSetBlocksCall()[0]!.ports![0]!.target).toBe(rowRef.value)

    wrapper.unmount()
  })

  it('resolves an anchorEl ref the same way', async () => {
    const anchorRef = ref<HTMLElement | null>(null)

    const Host = defineComponent({
      setup() {
        const blocks = [{ id: 'a', ports: [{ id: 'p', anchorEl: anchorRef }] }, { id: 'group' }]
        return () =>
          h(
            VisualLinker,
            { blocks, connections: [] },
            {
              'block-a': () => 'A',
              'block-group': () => h('div', { ref: anchorRef }, 'Group'),
            },
          )
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    await nextTick()

    expect(anchorRef.value).toBeInstanceOf(HTMLElement)
    expect(lastSetBlocksCall()[0]!.ports![0]!.anchorEl).toBe(anchorRef.value)

    wrapper.unmount()
  })

  it('resolves dragHandle as a ref, not just a CSS selector', async () => {
    const handleRef = ref<HTMLElement | null>(null)

    const Host = defineComponent({
      setup() {
        const blocks = [{ id: 'a', draggable: true, dragHandle: handleRef }]
        return () =>
          h(VisualLinker, { blocks, connections: [] }, { 'block-a': () => h('div', { ref: handleRef }, 'Handle') })
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    await nextTick()

    expect(handleRef.value).toBeInstanceOf(HTMLElement)
    expect(lastSetBlocksCall()[0]!.dragHandle).toBe(handleRef.value)

    wrapper.unmount()
  })
})
