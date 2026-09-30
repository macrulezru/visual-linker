import { describe, expect, it, vi } from 'vitest'

const vVlBlock = { name: 'block' }
const vVlPort = { name: 'port' }

vi.mock('@macrulez/visual-linker-vue', () => ({ vVlBlock, vVlPort }))
vi.mock('nuxt/app', () => ({ defineNuxtPlugin: (fn: unknown) => fn }))

describe('visual-linker-nuxt directives plugin', () => {
  it('registers v-vl-block and v-vl-port on the Vue app', async () => {
    const { default: plugin } = await import('../src/runtime/plugin')
    const directive = vi.fn()

    ;(plugin as unknown as (app: { vueApp: { directive: typeof directive } }) => void)({ vueApp: { directive } })

    expect(directive).toHaveBeenCalledWith('vl-block', vVlBlock)
    expect(directive).toHaveBeenCalledWith('vl-port', vVlPort)
  })
})
