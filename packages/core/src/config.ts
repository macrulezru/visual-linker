import type {
  ConnectionStyle,
  LinesConfig,
  MarkerConfig,
  MarkerInput,
  Stateful,
  Theme,
  VisualLinkerConfig,
  VisualState,
} from './types'
import { DEFAULT_LINE_COLOR } from './params'

export interface ActiveStates {
  highlight: boolean
  hover: boolean
  selected: boolean
  focus: boolean
}

export const NO_STATES: ActiveStates = { highlight: false, hover: false, selected: false, focus: false }

const STATE_KEYS: readonly VisualState[] = ['selected', 'highlight', 'hover', 'focus']

type PlainObject = Record<string, unknown>

export function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== 'object' || value === null) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function deepMerge(base: PlainObject, patch: PlainObject, undefinedDeletes: boolean): PlainObject {
  const result: PlainObject = { ...base }
  for (const key of Object.keys(patch)) {
    const value = patch[key]
    if (value === undefined) {
      if (undefinedDeletes) delete result[key]
      continue
    }
    const current = result[key]
    if (isPlainObject(value)) {
      result[key] = deepMerge(isPlainObject(current) ? current : {}, value, undefinedDeletes)
    } else {
      result[key] = value
    }
  }
  return result
}

export function mergeConfig<T extends object>(...layers: (T | undefined)[]): T {
  let result: PlainObject = {}
  for (const layer of layers) {
    if (layer) result = deepMerge(result, layer as PlainObject, false)
  }
  return result as T
}

export function patchConfig<T extends object>(base: T, patch: T): T {
  return deepMerge(base as PlainObject, patch as PlainObject, true) as T
}

export function baseOf<T extends object>(config: Stateful<T> | undefined): T {
  if (!config) return {} as T
  const result: PlainObject = { ...(config as PlainObject) }
  for (const key of STATE_KEYS) delete result[key]
  return result as T
}

export function statesOf<T extends object>(config: Stateful<T> | undefined, active: ActiveStates): Partial<T> {
  if (!config) return {}
  let result: PlainObject = {}
  const source = config as PlainObject
  for (const key of STATE_KEYS) {
    if (!active[key]) continue
    const layer = key === 'highlight' ? (source.highlight ?? source.hover) : source[key]
    if (isPlainObject(layer)) result = { ...result, ...layer }
  }
  return result as Partial<T>
}

export function layered<T extends object>(config: Stateful<T> | undefined, active: ActiveStates): T {
  return { ...baseOf(config), ...statesOf(config, active) }
}

export function resolveLines(config: LinesConfig | undefined, own: ConnectionStyle | undefined): ConnectionStyle {
  if (!own) return config ?? {}
  return mergeConfig<ConnectionStyle>(config, own)
}

export function normalizeMarker(input: MarkerInput | undefined): MarkerConfig | false | undefined {
  if (input === undefined || input === false) return input
  if (typeof input === 'string') return { shape: input }
  return input
}

export function mergeMarkerInputs(
  base: MarkerInput | undefined,
  over: MarkerInput | undefined,
): MarkerConfig | false | undefined {
  const top = normalizeMarker(over)
  if (top === undefined) return normalizeMarker(base)
  if (top === false) return false
  const bottom = normalizeMarker(base)
  if (!bottom) return top
  return mergeConfig<MarkerConfig>(bottom, top)
}

export function themeLineColor(theme: Theme | undefined, active: ActiveStates): string {
  const hover = active.hover || active.highlight ? theme?.lineHover : undefined
  const selected = active.selected ? (theme?.lineSelected ?? theme?.lineHover) : undefined
  return hover ?? selected ?? theme?.line ?? DEFAULT_LINE_COLOR
}

export function configLayers(...layers: (VisualLinkerConfig | undefined)[]): VisualLinkerConfig {
  return mergeConfig<VisualLinkerConfig>(...layers)
}
