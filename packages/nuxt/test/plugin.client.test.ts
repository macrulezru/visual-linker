import { describe, expect, it, vi } from 'vitest'

const setVisualLinkerDefaults = vi.fn()

vi.mock('@macrulez/visual-linker-vue', () => ({ setVisualLinkerDefaults }))

function mockNuxtApp(publicConfig: unknown) {
  vi.doMock('nuxt/app', () => ({
    defineNuxtPlugin: (fn: () => void) => fn,
    useRuntimeConfig: () => ({ public: { visualLinker: publicConfig } }),
  }))
}

describe('visual-linker-nuxt client plugin', () => {
  it('applies defaultCurve/showPorts from runtimeConfig', async () => {
    vi.resetModules()
    setVisualLinkerDefaults.mockClear()
    mockNuxtApp({ defaultCurve: 'straight', showPorts: false })

    const { default: plugin } = await import('../src/runtime/plugin.client')
    plugin()

    expect(setVisualLinkerDefaults).toHaveBeenCalledWith({ defaultCurve: 'straight', showPorts: false })
  })

  it('skips setVisualLinkerDefaults when the module was never configured', async () => {
    vi.resetModules()
    setVisualLinkerDefaults.mockClear()
    mockNuxtApp(undefined)

    const { default: plugin } = await import('../src/runtime/plugin.client')
    plugin()

    expect(setVisualLinkerDefaults).not.toHaveBeenCalled()
  })
})
