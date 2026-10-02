import { beforeEach, describe, expect, it, vi } from 'vitest'

const addImports = vi.fn()
const addPlugin = vi.fn()
const addComponent = vi.fn()

vi.mock('@nuxt/kit', () => ({
  createResolver: () => ({ resolve: (p: string) => `/resolved${p.replace(/^\./, '')}` }),
  addImports,
  addPlugin,
  addComponent,
  defineNuxtModule: <T extends Record<string, unknown>>(definition: {
    defaults: T
    setup: (options: T, nuxt: unknown) => void
  }) => {
    return (inlineOptions: Partial<T>, nuxt: unknown) => {
      const options = { ...definition.defaults, ...inlineOptions }
      return definition.setup(options, nuxt)
    }
  },
}))

function createMockNuxt() {
  return {
    options: {
      runtimeConfig: {
        public: {} as Record<string, unknown>,
      },
    },
  }
}

describe('@macrulez/visual-linker-nuxt module', () => {
  beforeEach(() => {
    addImports.mockClear()
    addPlugin.mockClear()
    addComponent.mockClear()
  })

  it('registers <VisualLinker> as a global component', async () => {
    const { default: visualLinkerModule } = await import('../src/module')
    const nuxt = createMockNuxt()

    // @ts-expect-error the mocked defineNuxtModule returns a plain callable, matching the runtime shape
    visualLinkerModule({}, nuxt)

    expect(addComponent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'VisualLinker', filePath: '@macrulez/visual-linker-vue' }),
    )
  })

  it('auto-imports useVisualLinker from @macrulez/visual-linker-vue', async () => {
    const { default: visualLinkerModule } = await import('../src/module')
    const nuxt = createMockNuxt()

    // @ts-expect-error see above
    visualLinkerModule({}, nuxt)

    expect(addImports).toHaveBeenCalledWith({ name: 'useVisualLinker', from: '@macrulez/visual-linker-vue' })
  })

  it('registers one universal plugin: the directives and the shared configuration', async () => {
    const { default: visualLinkerModule } = await import('../src/module')
    const nuxt = createMockNuxt()

    // @ts-expect-error see above
    visualLinkerModule({}, nuxt)

    expect(addPlugin).toHaveBeenCalledTimes(1)
    expect(addPlugin).toHaveBeenCalledWith('/resolved/runtime/plugin')
  })

  it('forwards the configuration the user wrote, as is, leaving everything else unset', async () => {
    const { default: visualLinkerModule } = await import('../src/module')
    const nuxt = createMockNuxt()

    // @ts-expect-error see above
    visualLinkerModule({ ports: { show: false } }, nuxt)

    expect(nuxt.options.runtimeConfig.public.visualLinker).toEqual({ ports: { show: false } })
  })

  it('forwards every group of the configuration, nested and with its states', async () => {
    const { default: visualLinkerModule } = await import('../src/module')
    const nuxt = createMockNuxt()
    const config = {
      theme: { line: '#112233', portFill: '#ffffff' },
      lines: {
        curve: 'smoothstep',
        width: 2,
        hover: { color: 'red' },
        bezier: { curvature: 0.8 },
        jumps: { radius: 6 },
      },
      markers: { end: { shape: 'arrow', hover: { size: 10 } }, sizes: { arrow: 8 } },
      ports: { radius: 5, spread: { gap: 20 } },
      labels: { background: '#fff' },
      blocks: { draggable: true, drag: { grid: 20, bounds: 'container' } },
      interaction: { selectable: true, clipToScrollParents: 'hide' },
    }

    // @ts-expect-error see above
    visualLinkerModule(config, nuxt)

    expect(nuxt.options.runtimeConfig.public.visualLinker).toEqual(config)
  })

  it('exposes a plain copy, so later changes to the options object do not leak into the runtime config', async () => {
    const { default: visualLinkerModule } = await import('../src/module')
    const nuxt = createMockNuxt()
    const config = { lines: { color: 'red' } }

    // @ts-expect-error see above
    visualLinkerModule(config, nuxt)
    config.lines.color = 'blue'

    expect(nuxt.options.runtimeConfig.public.visualLinker).toEqual({ lines: { color: 'red' } })
  })
})
