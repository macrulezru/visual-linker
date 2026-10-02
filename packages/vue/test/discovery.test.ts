import { defineComponent, h, ref, withDirectives } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BlockDescriptor } from '@macrulez/visual-linker-core'

const { createVisualLinker } = vi.hoisted(() => ({
  createVisualLinker: vi.fn((container: HTMLElement) => ({
    container,
    setBlocks: vi.fn(),
    setConnections: vi.fn(),
    replaceConfig: vi.fn(),
    on: vi.fn(() => () => {}),
    destroy: vi.fn(),
  })),
}))
vi.mock('@macrulez/visual-linker-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@macrulez/visual-linker-core')>()),
  createVisualLinker,
}))

const { VisualLinker } = await import('../src/VisualLinker')
const { vVlBlock, vVlPort } = await import('../src/directives')

type EngineMock = ReturnType<typeof createVisualLinker>

afterEach(() => {
  createVisualLinker.mockClear()
  document.body.innerHTML = ''
})

/** Flushes Vue's scheduler plus MutationObserver deliveries. */
async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

function engine(index = 0): EngineMock {
  return createVisualLinker.mock.results[index]!.value as EngineMock
}

function lastBlocks(index = 0): BlockDescriptor[] {
  return engine(index).setBlocks.mock.calls.at(-1)![0] as BlockDescriptor[]
}

function byId(blocks: BlockDescriptor[], id: string) {
  return blocks.find((block) => block.id === id)
}

const Panel = defineComponent({
  setup(_, { slots }) {
    return () => h('section', { class: 'panel' }, h('div', { class: 'panel-body' }, slots.default?.()))
  },
})

describe('block/port discovery', () => {
  it('finds v-vl-block anywhere under the default slot, through any number of wrapper components', async () => {
    mount(
      defineComponent({
        setup: () => () =>
          h(VisualLinker, { connections: [] }, () =>
            h(Panel, () =>
              h(Panel, () => h(Panel, () => withDirectives(h('div', { class: 'deep' }), [[vVlBlock, 'deep']]))),
            ),
          ),
      }),
      { attachTo: document.body },
    )
    await settle()

    const block = byId(lastBlocks(), 'deep')!
    expect(block.el.classList.contains('deep')).toBe(true)
  })

  it('attaches v-vl-port to its nearest ancestor block, with directive options, and v-vl-port on another block via `block`', async () => {
    mount(
      defineComponent({
        setup: () => () =>
          h(VisualLinker, { connections: [] }, () => [
            withDirectives(
              h('div', { class: 'group' }, [
                h(Panel, () =>
                  withDirectives(h('div', { class: 'row' }), [
                    [vVlPort, { id: 'row', side: ['left', 'right'], offset: 0.3 }],
                  ]),
                ),
              ]),
              [[vVlBlock, { id: 'group', draggable: true }]],
            ),
            withDirectives(h('div', { class: 'elsewhere' }), [[vVlPort, { id: 'far', block: 'group' }]]),
          ]),
      }),
      { attachTo: document.body },
    )
    await settle()

    const group = byId(lastBlocks(), 'group')!
    expect(group.draggable).toBe(true)
    expect(group.ports!.map((port) => port.id)).toEqual(['row', 'far'])
    expect((group.ports![0]!.target as HTMLElement).classList.contains('row')).toBe(true)
    expect(group.ports![0]!.side).toEqual(['left', 'right'])
    expect(group.ports![0]!.offset).toBe(0.3)
    expect((group.ports![1]!.target as HTMLElement).classList.contains('elsewhere')).toBe(true)
  })

  it('parses plain data attributes for blocks and ports', async () => {
    mount(
      defineComponent({
        setup: () => () =>
          h(VisualLinker, { connections: [] }, () => [
            h('div', { class: 'fence' }),
            h(
              'div',
              {
                'data-vl-block': 'b',
                'data-vl-draggable': '',
                'data-vl-drag-handle': '.title',
                'data-vl-drag-bounds': 'container',
              },
              [
                h('div', { class: 'title' }),
                h('div', {
                  'data-vl-port': 'p',
                  'data-vl-side': 'left right',
                  'data-vl-offset': '0.25',
                  'data-vl-anchor': 'b',
                }),
              ],
            ),
            h('div', { 'data-vl-block': 'c', 'data-vl-draggable': 'false', 'data-vl-drag-bounds': '.fence' }),
          ]),
      }),
      { attachTo: document.body },
    )
    await settle()

    const b = byId(lastBlocks(), 'b')!
    expect(b.draggable).toBe(true)
    expect(b.dragHandle).toBe('.title')
    expect(b.dragBounds).toBe('container')
    expect(b.ports![0]).toMatchObject({ id: 'p', side: ['left', 'right'], offset: 0.25, anchorBlockId: 'b' })

    const c = byId(lastBlocks(), 'c')!
    expect(c.draggable).toBe(false)
    expect((c.dragBounds as HTMLElement).classList.contains('fence')).toBe(true)
  })

  it('lets a `blocks` entry without `el` add config on top of a block discovered in the template', async () => {
    const rowRef = ref<HTMLElement | null>(null)
    mount(
      defineComponent({
        setup: () => () =>
          h(
            VisualLinker,
            { connections: [], blocks: [{ id: 'a', draggable: false, ports: [{ id: 'row', target: rowRef }] }] },
            () => h('div', { 'data-vl-block': 'a', 'data-vl-draggable': '' }, h('div', { ref: rowRef })),
          ),
      }),
      { attachTo: document.body },
    )
    await settle()

    const a = byId(lastBlocks(), 'a')!
    expect(a.draggable).toBe(false)
    expect(a.ports![0]!.target).toBe(rowRef.value)
  })

  it('keeps blocks of a nested <VisualLinker> out of the outer one', async () => {
    mount(
      defineComponent({
        setup: () => () =>
          h(VisualLinker, { connections: [] }, () => [
            h('div', { 'data-vl-block': 'outer' }),
            h(VisualLinker, { connections: [] }, () => h('div', { 'data-vl-block': 'inner' })),
          ]),
      }),
      { attachTo: document.body },
    )
    await settle()

    const engines = createVisualLinker.mock.results.map((result) => result.value as EngineMock)
    const outer = engines.find(
      (candidate) => !candidate.container.parentElement!.closest('[data-vl-root] [data-vl-root]'),
    )!
    const inner = engines.find((candidate) => candidate !== outer)!
    const ids = (mock: EngineMock) =>
      (mock.setBlocks.mock.calls.at(-1)![0] as BlockDescriptor[]).map((block) => block.id)
    expect(ids(outer)).toEqual(['outer'])
    expect(ids(inner)).toEqual(['inner'])
  })

  it('routes an element to a differently-named <VisualLinker> via data-vl-linker / the directive `linker` option', async () => {
    mount(
      defineComponent({
        setup: () => () => [
          h(VisualLinker, { connections: [], name: 'left' }, () => [
            h('div', { 'data-vl-block': 'mine' }),
            withDirectives(h('div'), [[vVlBlock, { id: 'theirs', linker: 'right' }]]),
          ]),
          h(VisualLinker, { connections: [], name: 'right', scope: 'page' }),
        ],
      }),
      { attachTo: document.body },
    )
    await settle()

    const ids = (index: number) => lastBlocks(index).map((block) => block.id)
    expect(ids(0)).toEqual(['mine'])
    expect(ids(1)).toEqual(['theirs'])
  })

  it('scope="page": draws in a fixed layer teleported to <body> and finds blocks outside the component', async () => {
    const outside = document.createElement('div')
    outside.setAttribute('data-vl-block', 'outside')
    document.body.appendChild(outside)

    mount(
      defineComponent({
        setup: () => () => [
          h(VisualLinker, { connections: [], scope: 'page', zIndex: 5 }),
          h(VisualLinker, { connections: [] }, () => h('div', { 'data-vl-block': 'fenced' })),
        ],
      }),
      { attachTo: document.body },
    )
    await settle()

    const layer = engine(0).container
    expect(layer.classList.contains('vl-layer--page')).toBe(true)
    expect(layer.parentElement).toBe(document.body)
    expect(layer.style.position).toBe('fixed')
    expect(layer.style.zIndex).toBe('5')
    // Elements inside another (container-scoped) <VisualLinker> stay with that one.
    expect(lastBlocks(0).map((block) => block.id)).toEqual(['outside'])
  })

  it('picks up blocks added or removed later (v-if), and skips re-registering when nothing changed', async () => {
    const show = ref(false)
    const label = ref('x')
    mount(
      defineComponent({
        setup: () => () =>
          h(VisualLinker, { connections: [] }, () => [
            h('div', { 'data-vl-block': 'always' }, label.value),
            show.value ? h('div', { 'data-vl-block': 'later' }) : null,
          ]),
      }),
      { attachTo: document.body },
    )
    await settle()
    expect(lastBlocks().map((block) => block.id)).toEqual(['always'])

    show.value = true
    await settle()
    expect(lastBlocks().map((block) => block.id)).toEqual(['always', 'later'])

    const calls = engine().setBlocks.mock.calls.length
    label.value = 'y'
    await settle()
    expect(engine().setBlocks.mock.calls.length).toBe(calls)

    show.value = false
    await settle()
    expect(lastBlocks().map((block) => block.id)).toEqual(['always'])
  })
})

describe('portSpread / spread markup', () => {
  it('reads data-vl-port-spread on blocks, data-vl-spread on ports, and the directive options', async () => {
    mount(
      defineComponent({
        setup: () => () =>
          h(VisualLinker, { connections: [] }, () => [
            h('div', { 'data-vl-block': 'a', 'data-vl-port-spread': '24 4' }, [
              h('span', { 'data-vl-port': 'off', 'data-vl-spread': 'false' }),
              h('span', { 'data-vl-port': 'on', 'data-vl-spread': '' }),
            ]),
            withDirectives(h('div', [withDirectives(h('span'), [[vVlPort, { id: 'p', spread: { gap: 40 } }]])]), [
              [vVlBlock, { id: 'b', portSpread: true }],
            ]),
          ]),
      }),
      { attachTo: document.body },
    )
    await settle()

    const a = byId(lastBlocks(), 'a')!
    expect(a.portSpread).toEqual({ gap: 24, padding: 4 })
    expect(a.ports!.map((port) => port.spread)).toEqual([false, true])

    const b = byId(lastBlocks(), 'b')!
    expect(b.portSpread).toBe(true)
    expect(b.ports![0]!.spread).toEqual({ gap: 40 })
  })
})

describe('directive SSR props', () => {
  it('emits the discovery attributes so server-rendered markup is already marked', () => {
    expect(vVlBlock.getSSRProps!({ value: { id: 'a', linker: 'main' } } as never, {} as never)).toEqual({
      'data-vl-block': 'a',
      'data-vl-linker': 'main',
    })
    expect(vVlPort.getSSRProps!({ value: { id: 'p', block: 'a' } } as never, {} as never)).toEqual({
      'data-vl-port': 'p',
      'data-vl-port-block': 'a',
    })
  })
})
