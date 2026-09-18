import { addComponent, addImports, addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'
import type { NuxtModule } from '@nuxt/schema'
import type { ConnectionCurve } from '@macrulez/visual-linker-vue'

export interface ModuleOptions {
  /** Falls through to @macrulez/visual-linker-core's own default (VLConnectionCurveEnum.BEZIER) when unset. */
  defaultCurve?: ConnectionCurve
  /** Falls through to @macrulez/visual-linker-core's own default (true) when unset. */
  showPorts?: boolean
  curvature?: number
  curveMinReach?: number
  curveMaxReach?: number
  curveAngleBlend?: number
  curveAngleMaxOffset?: number
  /** Snaps every draggable block to this px grid while dragging. Falls through to no snapping when unset. */
  dragGridSize?: number
  /** Instance-wide look for the built-in port dot — falls through to @macrulez/visual-linker-core's own defaults (params.ts) when unset. */
  portRadius?: number
  portColor?: string
  portStrokeColor?: string
  portStrokeWidth?: number
  /** Instance-wide default marker size per built-in shape — falls through to @macrulez/visual-linker-core's own defaults (params.ts) when unset. */
  circleMarkerSize?: number
  squareMarkerSize?: number
  diamondMarkerSize?: number
  arrowMarkerSize?: number
}

const visualLinkerModule: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@macrulez/visual-linker-nuxt',
    configKey: 'visualLinker',
  },
  // No `defaults` here on purpose: an option the user didn't set in
  // nuxt.config.ts must stay `undefined` all the way through to
  // @macrulez/visual-linker-core's own defaults (params.ts) — hardcoding one
  // here would silently shadow it, making a change to core's default look
  // like it does nothing for a Nuxt consumer.
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    addComponent({ name: 'VisualLinker', export: 'VisualLinker', filePath: '@macrulez/visual-linker-vue' })
    addImports({ name: 'useVisualLinker', from: '@macrulez/visual-linker-vue' })

    nuxt.options.runtimeConfig.public.visualLinker = {
      defaultCurve: options.defaultCurve,
      showPorts: options.showPorts,
      defaultCurvature: options.curvature,
      defaultCurveMinReach: options.curveMinReach,
      defaultCurveMaxReach: options.curveMaxReach,
      defaultCurveAngleBlend: options.curveAngleBlend,
      defaultCurveAngleMaxOffset: options.curveAngleMaxOffset,
      dragGridSize: options.dragGridSize,
      defaultPortRadius: options.portRadius,
      defaultPortColor: options.portColor,
      defaultPortStrokeColor: options.portStrokeColor,
      defaultPortStrokeWidth: options.portStrokeWidth,
      defaultCircleMarkerSize: options.circleMarkerSize,
      defaultSquareMarkerSize: options.squareMarkerSize,
      defaultDiamondMarkerSize: options.diamondMarkerSize,
      defaultArrowMarkerSize: options.arrowMarkerSize,
    }

    // Applies module options on the client only — <VisualLinker>/useVisualLinker
    // are already SSR-safe no-ops, this just seeds their shared client-side defaults.
    addPlugin(resolver.resolve('./runtime/plugin.client'))
  },
})

export default visualLinkerModule
