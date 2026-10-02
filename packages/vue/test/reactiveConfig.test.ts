import { defineComponent, h, nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { VisualLinker } from '../src/VisualLinker'
import { useVisualLinker } from '../src/useVisualLinker'
import { VisualLinkerPlugin } from '../src/plugin'
import { createSharedConfig, useVisualLinkerConfig, VISUAL_LINKER_CONFIG_KEY } from '../src/sharedConfig'
import type { VisualLinkerConfig } from '@macrulez/visual-linker-core'

afterEach(() => {
  document.body.innerHTML = ''
})

function mountReal(config: VisualLinkerConfig, shared: VisualLinkerConfig = createSharedConfig()) {
  const Host = defineComponent({
    props: { config: { type: Object, default: () => ({}) } },
    setup(props) {
      return () =>
        h(
          VisualLinker,
          { connections: [{ id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' } }], config: props.config },
          () => [h('div', { id: 'a', 'data-vl-block': 'a' }), h('div', { id: 'b', 'data-vl-block': 'b' })],
        )
    },
  })
  const wrapper = mount(Host, {
    props: { config },
    global: { provide: { [VISUAL_LINKER_CONFIG_KEY as symbol]: shared } },
    attachTo: document.body,
  })
  return wrapper
}

const svgVar = (name: string) =>
  (document.querySelector('svg.vl-svg') as SVGSVGElement | null)?.style.getPropertyValue(name)

describe('reactive config with the real engine', () => {
  it('applies a theme given in the config prop', async () => {
    const wrapper = mountReal({ theme: { line: '#112233' } })
    await flushPromises()
    expect(svgVar('--vl-line-color')).toBe('#112233')
    wrapper.unmount()
  })

  it('re-themes the diagram when the config prop changes', async () => {
    const wrapper = mountReal({ theme: { line: '#112233' } })
    await flushPromises()

    await wrapper.setProps({ config: { theme: { line: '#445566', portFill: '#000000' } } })
    await flushPromises()

    expect(svgVar('--vl-line-color')).toBe('#445566')
    expect(svgVar('--vl-port-fill')).toBe('#000000')
    wrapper.unmount()
  })

  it('re-themes when the shared config changes, for a diagram that sets no theme of its own', async () => {
    const shared = createSharedConfig()
    const wrapper = mountReal({}, shared)
    await flushPromises()
    expect(svgVar('--vl-line-color')).toBe('')

    shared.theme = { line: '#abcdef' }
    await flushPromises()
    expect(svgVar('--vl-line-color')).toBe('#abcdef')

    shared.theme = { line: '#fedcba' }
    await flushPromises()
    expect(svgVar('--vl-line-color')).toBe('#fedcba')
    wrapper.unmount()
  })

  it('lets the component config win over the shared config after a change', async () => {
    const shared = createSharedConfig({ lines: { color: 'red', width: 3 } })
    const wrapper = mountReal({ lines: { color: 'blue' } }, shared)
    await flushPromises()
    const path = () => document.querySelector('path.vl-connection') as SVGPathElement
    expect(path().style.stroke).toBe('blue')
    expect(path().style.strokeWidth).toBe('3')

    shared.lines = { ...shared.lines, width: 6 }
    await flushPromises()
    expect(path().style.stroke).toBe('blue')
    expect(path().style.strokeWidth).toBe('6')
    wrapper.unmount()
  })

  it('installs the shared config through the plugin and re-themes every diagram when it changes', async () => {
    let shared: VisualLinkerConfig | undefined
    const Probe = defineComponent({
      setup() {
        shared = useVisualLinkerConfig()
        return () =>
          h(VisualLinker, { connections: [{ id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' } }] }, () => [
            h('div', { id: 'a', 'data-vl-block': 'a' }),
            h('div', { id: 'b', 'data-vl-block': 'b' }),
          ])
      },
    })
    const wrapper = mount(Probe, {
      global: { plugins: [[VisualLinkerPlugin, { config: { theme: { line: '#010203' } } }]] },
      attachTo: document.body,
    })
    await flushPromises()
    expect(svgVar('--vl-line-color')).toBe('#010203')

    shared!.theme = { line: '#0a0b0c' }
    await flushPromises()
    expect(svgVar('--vl-line-color')).toBe('#0a0b0c')
    wrapper.unmount()
  })
})

describe('useVisualLinker config', () => {
  it('follows a ref holding the config', async () => {
    const config = ref<VisualLinkerConfig>({ theme: { line: '#111111' } })
    const Host = defineComponent({
      setup() {
        const el = ref<HTMLElement | null>(null)
        const { engine } = useVisualLinker(el, { config })
        return () => h('div', { ref: el }, [engine.value ? 'ready' : 'waiting'])
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    await flushPromises()
    expect(svgVar('--vl-line-color')).toBe('#111111')

    config.value = { theme: { line: '#222222' } }
    await nextTick()
    await flushPromises()
    expect(svgVar('--vl-line-color')).toBe('#222222')

    wrapper.unmount()
  })
})
