import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { createVisualLinker } = vi.hoisted(() => ({
  createVisualLinker: vi.fn(() => ({
    setBlocks: vi.fn(),
    setConnections: vi.fn(),
    on: vi.fn(() => () => {}),
    destroy: vi.fn(),
  })),
}))

vi.mock('@macrulez/visual-linker-core', () => ({ createVisualLinker }))

const { VisualLinker } = await import('../src/VisualLinker')
const { setVisualLinkerDefaults, visualLinkerDefaults } = await import('../src/config')

afterEach(() => {
  createVisualLinker.mockClear()
  for (const key of Object.keys(visualLinkerDefaults)) delete (visualLinkerDefaults as Record<string, unknown>)[key]
})

function mountOne(options?: Record<string, unknown>) {
  return mount(VisualLinker, {
    props: { blocks: [{ id: 'a' }], connections: [], ...(options ? { options } : {}) },
    slots: { 'block-a': () => 'A' },
    attachTo: document.body,
  })
}

describe('option merge order: props.options > visualLinkerDefaults (Nuxt) > @macrulez/visual-linker-core default', () => {
  it('passes defaultCurve/showPorts through as undefined when nothing overrides them, so core applies its own default', async () => {
    const wrapper = mountOne()
    await wrapper.vm.$nextTick()

    const [, options] = createVisualLinker.mock.calls[0]!
    expect(options.defaultCurve).toBeUndefined()
    expect(options.showPorts).toBeUndefined()

    wrapper.unmount()
  })

  it('applies a Nuxt-level default (set via setVisualLinkerDefaults) when the component prop does not override it', async () => {
    setVisualLinkerDefaults({ defaultCurve: 'straight' })
    const wrapper = mountOne()
    await wrapper.vm.$nextTick()

    const [, options] = createVisualLinker.mock.calls[0]!
    expect(options.defaultCurve).toBe('straight')

    wrapper.unmount()
  })

  it('lets an explicit component-level option override the Nuxt-level default', async () => {
    setVisualLinkerDefaults({ defaultCurve: 'straight' })
    const wrapper = mountOne({ defaultCurve: 'bezier' })
    await wrapper.vm.$nextTick()

    const [, options] = createVisualLinker.mock.calls[0]!
    expect(options.defaultCurve).toBe('bezier')

    wrapper.unmount()
  })

  it('forwards every curve-geometry option (not just defaultCurve/showPorts) straight through to core', async () => {
    const wrapper = mountOne({ curvature: 0.8, curveMaxReach: 300, curveAngleBlend: 0.9, curveAngleMaxOffset: 45 })
    await wrapper.vm.$nextTick()

    const [, options] = createVisualLinker.mock.calls[0]!
    expect(options).toMatchObject({ curvature: 0.8, curveMaxReach: 300, curveAngleBlend: 0.9, curveAngleMaxOffset: 45 })

    wrapper.unmount()
  })
})
