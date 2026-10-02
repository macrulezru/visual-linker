import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { createVisualLinker, engineMock } = vi.hoisted(() => {
  const engineMock = {
    setBlocks: vi.fn(),
    setConnections: vi.fn(),
    replaceConfig: vi.fn(),
    on: vi.fn(() => () => {}),
    destroy: vi.fn(),
  }
  return { createVisualLinker: vi.fn(() => engineMock), engineMock }
})
vi.mock('@macrulez/visual-linker-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@macrulez/visual-linker-core')>()),
  createVisualLinker,
}))

const { VisualLinker } = await import('../src/VisualLinker')

afterEach(() => {
  createVisualLinker.mockClear()
  engineMock.setBlocks.mockClear()
})

function lastSetBlocksCall() {
  return engineMock.setBlocks.mock.calls.at(-1)![0] as {
    id: string
    el: HTMLElement
    dragHandle?: unknown
    dragBounds?: unknown
    ports?: { target?: unknown; anchorEl?: unknown }[]
  }[]
}

describe('`blocks` prop: ref-friendly el/target/anchorEl/dragHandle/dragBounds', () => {
  it('resolves a block el and a port target given as template refs', async () => {
    const cardRef = ref<HTMLElement | null>(null)
    const rowRef = ref<HTMLElement | null>(null)

    const Host = defineComponent({
      setup() {
        const blocks = [{ id: 'a', el: cardRef, ports: [{ id: 'p', target: rowRef }] }]
        return () =>
          h(VisualLinker, { blocks, connections: [] }, () =>
            h('div', { ref: cardRef }, h('div', { ref: rowRef }, 'Row')),
          )
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    await flushPromises()

    expect(lastSetBlocksCall()[0]!.el).toBe(cardRef.value)
    expect(lastSetBlocksCall()[0]!.ports![0]!.target).toBe(rowRef.value)

    wrapper.unmount()
  })

  it('re-syncs once a conditionally-rendered ref target appears later, without the blocks array itself changing', async () => {
    const show = ref(false)
    const cardRef = ref<HTMLElement | null>(null)
    const rowRef = ref<HTMLElement | null>(null)
    // A stable array reference: proves the re-sync comes from tracking the
    // ref, not from `blocks` itself changing.
    const blocks = [{ id: 'a', el: cardRef, ports: [{ id: 'p', target: rowRef }] }]

    const Host = defineComponent({
      setup() {
        return () =>
          h(VisualLinker, { blocks, connections: [] }, () =>
            h('div', { ref: cardRef }, show.value ? h('div', { ref: rowRef }, 'Row') : null),
          )
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    await flushPromises()
    expect(lastSetBlocksCall()[0]!.ports![0]!.target).toBeUndefined()

    show.value = true
    await flushPromises()

    expect(rowRef.value).toBeInstanceOf(HTMLElement)
    expect(lastSetBlocksCall()[0]!.ports![0]!.target).toBe(rowRef.value)

    wrapper.unmount()
  })

  it('resolves a block el given as a CSS selector inside the <VisualLinker> area', async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(VisualLinker, { blocks: [{ id: 'a', el: '.card' }], connections: [] }, () => h('div', { class: 'card' }))
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    await flushPromises()

    expect(lastSetBlocksCall()[0]!.el.classList.contains('card')).toBe(true)

    wrapper.unmount()
  })

  it('resolves anchorEl, dragHandle and dragBounds refs', async () => {
    const cardRef = ref<HTMLElement | null>(null)
    const anchorRef = ref<HTMLElement | null>(null)
    const handleRef = ref<HTMLElement | null>(null)
    const fenceRef = ref<HTMLElement | null>(null)

    const Host = defineComponent({
      setup() {
        const blocks = [
          {
            id: 'a',
            el: cardRef,
            draggable: true,
            dragHandle: handleRef,
            dragBounds: fenceRef,
            ports: [{ id: 'p', anchorEl: anchorRef }],
          },
        ]
        return () =>
          h(VisualLinker, { blocks, connections: [] }, () =>
            h('div', { ref: fenceRef }, [
              h('div', { ref: anchorRef }, h('div', { ref: cardRef }, h('span', { ref: handleRef }, 'Handle'))),
            ]),
          )
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    await flushPromises()

    const [block] = lastSetBlocksCall()
    expect(block!.ports![0]!.anchorEl).toBe(anchorRef.value)
    expect(block!.dragHandle).toBe(handleRef.value)
    expect(block!.dragBounds).toBe(fenceRef.value)

    wrapper.unmount()
  })

  it("passes dragBounds 'container' and a plain inset object through untouched", async () => {
    const aRef = ref<HTMLElement | null>(null)
    const bRef = ref<HTMLElement | null>(null)
    const Host = defineComponent({
      setup() {
        const blocks = [
          { id: 'a', el: aRef, draggable: true, dragBounds: 'container' as const },
          { id: 'b', el: bRef, draggable: true, dragBounds: { top: 10, left: 10 } },
        ]
        return () =>
          h(VisualLinker, { blocks, connections: [] }, () => [h('div', { ref: aRef }), h('div', { ref: bRef })])
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    await flushPromises()

    const [a, b] = lastSetBlocksCall()
    expect(a!.dragBounds).toBe('container')
    expect(b!.dragBounds).toEqual({ top: 10, left: 10 })

    wrapper.unmount()
  })
})
