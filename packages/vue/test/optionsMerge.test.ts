import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

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
const { VisualLinkerPlugin } = await import('../src/plugin')
const { createSharedConfig, provideVisualLinkerConfig, useVisualLinkerConfig, VISUAL_LINKER_CONFIG_KEY } =
  await import('../src/sharedConfig')

afterEach(() => {
  createVisualLinker.mockClear()
  engineMock.replaceConfig.mockClear()
})

function mountOne(config?: Record<string, unknown>, shared?: Record<string, unknown>) {
  return mount(VisualLinker, {
    props: { blocks: [{ id: 'a' }], connections: [], ...(config ? { config } : {}) },
    global: shared ? { plugins: [[VisualLinkerPlugin, { config: shared }]] } : {},
    attachTo: document.body,
  })
}

describe('config merge order: props.config > shared config (plugin / Nuxt) > @macrulez/visual-linker-core default', () => {
  it('passes an empty config through when nothing sets anything, so core applies its own defaults', async () => {
    const wrapper = mountOne()
    await flushPromises()

    const [, config] = createVisualLinker.mock.calls[0]!
    expect(config).toEqual({})

    wrapper.unmount()
  })

  it('applies a shared default given to the plugin when the component prop does not override it', async () => {
    const wrapper = mountOne(undefined, { lines: { curve: 'straight' } })
    await flushPromises()

    const [, config] = createVisualLinker.mock.calls[0]!
    expect(config.lines.curve).toBe('straight')

    wrapper.unmount()
  })

  it('lets an explicit component-level setting override the shared default, field by field', async () => {
    const wrapper = mountOne(
      { lines: { curve: 'bezier' } },
      { lines: { curve: 'straight', color: 'red' }, ports: { radius: 6 } },
    )
    await flushPromises()

    const [, config] = createVisualLinker.mock.calls[0]!
    expect(config.lines).toEqual({ curve: 'bezier', color: 'red' })
    expect(config.ports).toEqual({ radius: 6 })

    wrapper.unmount()
  })

  it('forwards the nested groups straight through to core', async () => {
    const wrapper = mountOne({
      lines: { bezier: { curvature: 0.8, maxReach: 300, angleBlend: 0.9, angleMaxOffset: 45 } },
      theme: { line: '#112233' },
    })
    await flushPromises()

    const [, config] = createVisualLinker.mock.calls[0]!
    expect(config.lines.bezier).toEqual({ curvature: 0.8, maxReach: 300, angleBlend: 0.9, angleMaxOffset: 45 })
    expect(config.theme).toEqual({ line: '#112233' })

    wrapper.unmount()
  })
})

describe('reactive config', () => {
  it('pushes a changed config prop to the engine', async () => {
    const wrapper = mountOne({ lines: { color: 'red' } })
    await flushPromises()

    await wrapper.setProps({ config: { lines: { color: 'blue' } } })
    await flushPromises()

    expect(engineMock.replaceConfig).toHaveBeenLastCalledWith({ lines: { color: 'blue' } })

    wrapper.unmount()
  })

  it('pushes a change of the shared config to every diagram that is mounted under it', async () => {
    const shared = createSharedConfig({ lines: { width: 2 } })
    const wrapper = mount(VisualLinker, {
      props: { blocks: [{ id: 'a' }], connections: [] },
      global: { provide: { [VISUAL_LINKER_CONFIG_KEY as symbol]: shared } },
      attachTo: document.body,
    })
    await flushPromises()

    shared.theme = { line: '#abcdef' }
    await flushPromises()

    expect(engineMock.replaceConfig).toHaveBeenLastCalledWith({ lines: { width: 2 }, theme: { line: '#abcdef' } })

    wrapper.unmount()
  })
})

describe('shared config access', () => {
  it('useVisualLinkerConfig returns the object the plugin installed, and edits to it are the shared state', () => {
    let seen: ReturnType<typeof useVisualLinkerConfig> | undefined
    const Probe = defineComponent({
      setup() {
        seen = useVisualLinkerConfig()
        return () => h('div')
      },
    })
    const wrapper = mount(Probe, {
      global: { plugins: [[VisualLinkerPlugin, { config: { ports: { show: false } } }]] },
    })
    expect({ ...seen }).toEqual({ ports: { show: false } })
    wrapper.unmount()
  })

  it('useVisualLinkerConfig says what is missing when nothing provides a config', () => {
    const Probe = defineComponent({
      setup() {
        useVisualLinkerConfig()
        return () => h('div')
      },
    })
    expect(() => mount(Probe)).toThrow(/no shared config/)
  })

  it('provideVisualLinkerConfig scopes a config to a subtree, replacing the app-level one', async () => {
    const Child = defineComponent({
      setup() {
        return () => h(VisualLinker, { blocks: [{ id: 'a' }], connections: [], config: { lines: { width: 9 } } })
      },
    })
    const Scope = defineComponent({
      setup() {
        provideVisualLinkerConfig({ lines: { color: 'teal' } })
        return () => h(Child)
      },
    })
    const wrapper = mount(Scope, {
      global: { plugins: [[VisualLinkerPlugin, { config: { lines: { color: 'red', dashed: true } } }]] },
      attachTo: document.body,
    })
    await flushPromises()

    const [, config] = createVisualLinker.mock.calls[0]!
    expect(config.lines).toEqual({ color: 'teal', width: 9 })

    wrapper.unmount()
  })
})
