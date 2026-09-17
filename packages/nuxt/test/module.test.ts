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

  it('registers the client-only plugin', async () => {
    const { default: visualLinkerModule } = await import('../src/module')
    const nuxt = createMockNuxt()

    // @ts-expect-error see above
    visualLinkerModule({}, nuxt)

    expect(addPlugin).toHaveBeenCalledWith('/resolved/runtime/plugin.client')
  })

  it('forwards only the module options the user actually set, leaving the rest undefined', async () => {
    const { default: visualLinkerModule } = await import('../src/module')
    const nuxt = createMockNuxt()

    // @ts-expect-error see above
    visualLinkerModule({ showPorts: false }, nuxt)

    // No `defaultCurve` here: leaving it `undefined` (not defaulting it to 'bezier' in
    // this module) is what lets @macrulez/visual-linker-core's own default take effect —
    // a hardcoded default here would silently shadow core's and never let it be reached.
    expect(nuxt.options.runtimeConfig.public.visualLinker).toEqual({
      defaultCurve: undefined,
      showPorts: false,
      defaultCurvature: undefined,
      defaultCurveMinReach: undefined,
      defaultCurveMaxReach: undefined,
      defaultCurveAngleBlend: undefined,
      defaultCurveAngleMaxOffset: undefined,
    })
  })

  it('forwards every curve-geometry module option under its @macrulez/visual-linker-core name', async () => {
    const { default: visualLinkerModule } = await import('../src/module')
    const nuxt = createMockNuxt()

    // @ts-expect-error see above
    visualLinkerModule(
      { curvature: 0.8, curveMinReach: 10, curveMaxReach: 300, curveAngleBlend: 0.9, curveAngleMaxOffset: 45 },
      nuxt,
    )

    expect(nuxt.options.runtimeConfig.public.visualLinker).toMatchObject({
      defaultCurvature: 0.8,
      defaultCurveMinReach: 10,
      defaultCurveMaxReach: 300,
      defaultCurveAngleBlend: 0.9,
      defaultCurveAngleMaxOffset: 45,
    })
  })
})
