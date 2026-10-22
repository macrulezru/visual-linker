import { defineComponent, h, nextTick, ref, withDirectives } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BlockDescriptor, ConnectionDescriptor } from '@macrulez/visual-linker-core'

const handlers = new Map<string, (payload: unknown) => void>()

const { createVisualLinker } = vi.hoisted(() => ({
  createVisualLinker: vi.fn(() => ({
    setBlocks: vi.fn(),
    setConnections: vi.fn(),
    addConnection: vi.fn(),
    removeConnection: vi.fn(),
    batch: vi.fn((fn: () => void) => fn()),
    replaceConfig: vi.fn(),
    startConnect: vi.fn(() => true),
    completeConnect: vi.fn(() => true),
    cancelConnect: vi.fn(),
    isConnecting: vi.fn(() => ({ active: false })),
    getStats: vi.fn(() => ({
      blocks: 3,
      connections: 2,
      rendered: 1,
      culled: 0,
      proxied: 0,
      lastRenderMs: 1,
      medianRenderMs: 1,
      observedElements: 2,
    })),
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
  handlers.clear()
  document.body.innerHTML = ''
})

async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

function engine(): EngineMock {
  return createVisualLinker.mock.results[0]!.value as EngineMock
}

function link(i: number, extra: Partial<ConnectionDescriptor> = {}): ConnectionDescriptor {
  return { id: `c${i}`, from: { blockId: `b${i}` }, to: { blockId: `b${i + 1}` }, ...extra }
}

describe('incremental block registry', () => {
  it('folds the mounting of 200 directive blocks in one tick into a single registry update', async () => {
    const count = ref(0)
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(VisualLinker, { connections: [], ref: 'vl' }, () =>
            Array.from({ length: count.value }, (_, i) => withDirectives(h('div', { key: i }), [[vVlBlock, `b${i}`]])),
          ),
      }),
      { attachTo: document.body },
    )
    await settle()
    const mock = engine()
    const before = mock.setBlocks.mock.calls.length
    const vl = wrapper.findComponent(VisualLinker)
    const recomputedBefore = (vl.vm as unknown as { stats(): { registryRecomputations: number } }).stats()
      .registryRecomputations

    count.value = 200
    await nextTick()
    await settle()
    const blocks = mock.setBlocks.mock.calls.at(-1)![0] as BlockDescriptor[]
    expect(blocks).toHaveLength(200)
    expect(mock.setBlocks.mock.calls.length - before).toBeLessThanOrEqual(1)
    const recomputedAfter = (vl.vm as unknown as { stats(): { registryRecomputations: number } }).stats()
      .registryRecomputations
    expect(recomputedAfter - recomputedBefore).toBeLessThanOrEqual(1)

    count.value = 0
    await nextTick()
    await settle()
    expect((mock.setBlocks.mock.calls.at(-1)![0] as BlockDescriptor[]).length).toBe(0)
    wrapper.unmount()
  })

  it('attaches a port that mounts before its block, and follows a port moved between blocks', async () => {
    const owner = ref<'a' | 'b'>('a')
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(VisualLinker, { connections: [] }, () => [
            withDirectives(
              h('div', { key: 'a' }, owner.value === 'a' ? [withDirectives(h('i'), [[vVlPort, 'p']])] : []),
              [[vVlBlock, 'a']],
            ),
            withDirectives(
              h('div', { key: 'b' }, owner.value === 'b' ? [withDirectives(h('i'), [[vVlPort, 'p']])] : []),
              [[vVlBlock, 'b']],
            ),
          ]),
      }),
      { attachTo: document.body },
    )
    await settle()
    const mock = engine()
    const last = () => mock.setBlocks.mock.calls.at(-1)![0] as BlockDescriptor[]
    expect(
      last()
        .find((block) => block.id === 'a')!
        .ports?.map((port) => port.id),
    ).toEqual(['p'])
    owner.value = 'b'
    await nextTick()
    await settle()
    expect(last().find((block) => block.id === 'a')!.ports ?? []).toHaveLength(0)
    expect(
      last()
        .find((block) => block.id === 'b')!
        .ports?.map((port) => port.id),
    ).toEqual(['p'])
    wrapper.unmount()
  })

  it('still picks up plain data-vl-block markup through the mutation observer', async () => {
    const show = ref(false)
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(VisualLinker, { connections: [] }, () => (show.value ? [h('div', { 'data-vl-block': 'plain' })] : [])),
      }),
      { attachTo: document.body },
    )
    await settle()
    show.value = true
    await nextTick()
    await settle()
    expect((engine().setBlocks.mock.calls.at(-1)![0] as BlockDescriptor[]).map((block) => block.id)).toEqual(['plain'])
    wrapper.unmount()
  })

  it('reads data-vl-connect from the markup', async () => {
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(VisualLinker, { connections: [] }, () => [
            h('div', { 'data-vl-block': 'a', 'data-vl-connect': 'source' }, [
              h('i', { 'data-vl-port': 'p', 'data-vl-connect': 'false' }),
            ]),
          ]),
      }),
      { attachTo: document.body },
    )
    await settle()
    const block = (engine().setBlocks.mock.calls.at(-1)![0] as BlockDescriptor[])[0]!
    expect(block.connect).toBe('source')
    expect(block.ports![0]!.connect).toBe(false)
    wrapper.unmount()
  })
})

describe('connection updates', () => {
  it('sends only the connections that changed', async () => {
    const list = ref<ConnectionDescriptor[]>(Array.from({ length: 300 }, (_, i) => link(i)))
    const wrapper = mount(defineComponent({ setup: () => () => h(VisualLinker, { connections: list.value }) }), {
      attachTo: document.body,
    })
    await settle()
    const mock = engine()
    expect(mock.setConnections).toHaveBeenCalledTimes(1)

    list.value[7]!.style = { color: '#f00' }
    await settle()
    expect(mock.addConnection).toHaveBeenCalledTimes(1)
    expect((mock.addConnection.mock.calls[0]![0] as ConnectionDescriptor).id).toBe('c7')
    expect(mock.removeConnection).not.toHaveBeenCalled()
    expect(mock.setConnections).toHaveBeenCalledTimes(1)

    list.value.splice(2, 1)
    await settle()
    expect(mock.removeConnection).toHaveBeenCalledWith('c2')
    expect(mock.setConnections).toHaveBeenCalledTimes(1)

    list.value.push(link(500))
    await settle()
    expect(mock.addConnection).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('replaces the whole list when a new array differs in most connections', async () => {
    const list = ref<ConnectionDescriptor[]>(Array.from({ length: 10 }, (_, i) => link(i)))
    const wrapper = mount(defineComponent({ setup: () => () => h(VisualLinker, { connections: list.value }) }), {
      attachTo: document.body,
    })
    await settle()
    const mock = engine()
    list.value = Array.from({ length: 10 }, (_, i) => link(100 + i))
    await settle()
    expect(mock.setConnections).toHaveBeenCalledTimes(2)
    expect(mock.addConnection).not.toHaveBeenCalled()

    list.value = [...list.value.slice(0, 9), link(999)]
    await settle()
    expect(mock.setConnections).toHaveBeenCalledTimes(2)
    expect(mock.addConnection).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})

describe('connect API and events', () => {
  it('forwards the connect events as kebab-case emits', async () => {
    const onStart = vi.fn()
    const onRequest = vi.fn()
    const onCancel = vi.fn()
    const mock = createVisualLinker
    mock.mockImplementationOnce((() => {
      const created = {
        setBlocks: vi.fn(),
        setConnections: vi.fn(),
        replaceConfig: vi.fn(),
        destroy: vi.fn(),
        on: vi.fn((name: string, handler: (payload: unknown) => void) => {
          handlers.set(name, handler)
          return () => {}
        }),
      }
      return created
    }) as never)
    const wrapper = mount(VisualLinker, {
      props: {
        connections: [],
        onConnectStart: onStart,
        onConnectionCreateRequest: onRequest,
        onConnectionCreateCancel: onCancel,
      },
      attachTo: document.body,
    })
    await settle()
    handlers.get('connect:start')!({ from: { blockId: 'a' } })
    handlers.get('connection:create-request')!({ from: { blockId: 'a' }, to: { blockId: 'b' }, via: 'drag' })
    handlers.get('connection:create-cancel')!({ from: { blockId: 'a' }, reason: 'escape' })
    expect(onStart).toHaveBeenCalledWith({ from: { blockId: 'a' } })
    expect(onRequest).toHaveBeenCalledWith(expect.objectContaining({ via: 'drag' }))
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ reason: 'escape' }))
    wrapper.unmount()
  })

  it('exposes the connect methods, batch and stats on the component', async () => {
    const wrapper = mount(VisualLinker, { props: { connections: [] }, attachTo: document.body })
    await settle()
    const vm = wrapper.vm as unknown as {
      startConnect(from: object): boolean
      completeConnect(to: object): boolean
      cancelConnect(): void
      isConnecting(): { active: boolean }
      stats(): { rendered: number }
    }
    expect(vm.startConnect({ blockId: 'a' })).toBe(true)
    expect(engine().startConnect).toHaveBeenCalledWith({ blockId: 'a' })
    expect(vm.completeConnect({ blockId: 'b' })).toBe(true)
    vm.cancelConnect()
    expect(engine().cancelConnect).toHaveBeenCalled()
    expect(vm.isConnecting()).toEqual({ active: false })
    expect(vm.stats().rendered).toBe(1)
    wrapper.unmount()
  })
})
