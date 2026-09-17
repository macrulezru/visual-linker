import type { VisualLinkerOptions } from '@macrulez/visual-linker-core'

export type VisualLinkerDefaults = Pick<
  VisualLinkerOptions,
  | 'defaultCurve'
  | 'showPorts'
  | 'defaultCurvature'
  | 'defaultCurveMinReach'
  | 'defaultCurveMaxReach'
  | 'defaultCurveAngleBlend'
  | 'defaultCurveAngleMaxOffset'
>

/**
 * Mutated in place by @macrulez/visual-linker-nuxt's client plugin from
 * nuxt.config.ts module options. Deliberately starts empty rather than
 * hardcoding a value for any of these fields: every one already has its own
 * default inside @macrulez/visual-linker-core (see `params.ts`), and this
 * object is merged in *underneath* an explicit `options` prop, but *over*
 * nothing when left empty — so an unset field here still falls through to
 * core's own default. Hardcoding a value here would silently shadow it,
 * making changing core's default look like it does nothing from the Vue/Nuxt
 * side.
 */
export const visualLinkerDefaults: VisualLinkerDefaults = {}

export function setVisualLinkerDefaults(next: Partial<VisualLinkerDefaults>) {
  Object.assign(visualLinkerDefaults, next)
}
