import { beforeEach, describe, expect, it, vi } from 'vitest'

const vVlBlock = { name: 'block' }
const vVlPort = { name: 'port' }
const installVisualLinkerConfig = vi.fn()
let publicConfig: unknown

vi.mock('@macrulez/visual-linker-vue', () => ({ vVlBlock, vVlPort, installVisualLinkerConfig }))
vi.mock('nuxt/app', () => ({
  defineNuxtPlugin: (fn: unknown) => fn,
  useRuntimeConfig: () => ({ public: { visualLinker: publicConfig } }),
}))

type PluginFn = (app: { vueApp: { directive: ReturnType<typeof vi.fn> } }) => void

async function run() {
  const { default: plugin } = await import('../src/runtime/plugin')
  const directive = vi.fn()
  const vueApp = { directive }
  ;(plugin as unknown as PluginFn)({ vueApp })
  return { directive, vueApp }
}

describe('visual-linker-nuxt plugin', () => {
  beforeEach(() => {
    installVisualLinkerConfig.mockClear()
    publicConfig = undefined
  })

  it('registers v-vl-block and v-vl-port on the Vue app', async () => {
    const { directive } = await run()

    expect(directive).toHaveBeenCalledWith('vl-block', vVlBlock)
    expect(directive).toHaveBeenCalledWith('vl-port', vVlPort)
  })

  it('installs the configuration from runtimeConfig as the app-wide shared config', async () => {
    publicConfig = { lines: { curve: 'straight' }, ports: { show: false } }
    const { vueApp } = await run()

    expect(installVisualLinkerConfig).toHaveBeenCalledWith(vueApp, {
      lines: { curve: 'straight' },
      ports: { show: false },
    })
  })

  it('still installs an empty shared config when the module was never configured, so useVisualLinkerConfig() works', async () => {
    const { vueApp } = await run()

    expect(installVisualLinkerConfig).toHaveBeenCalledWith(vueApp, undefined)
  })
})
