import { DEFAULT_PORT_SPREAD_GAP, DEFAULT_PORT_SPREAD_PADDING } from './params'
import type { PortSpread } from './types'

export interface ResolvedSpread {
  gap: number
  padding: number
}

/** First defined of port → block → instance setting wins; `false` there means "off", not "keep looking". */
export function resolveSpread(...candidates: (PortSpread | undefined)[]): ResolvedSpread | null {
  const value = candidates.find((candidate) => candidate !== undefined)
  if (!value) return null
  const options = value === true ? {} : value
  return {
    gap: Math.max(0, options.gap ?? DEFAULT_PORT_SPREAD_GAP),
    padding: Math.max(0, options.padding ?? DEFAULT_PORT_SPREAD_PADDING),
  }
}

/**
 * Positions along one side axis for `count` virtual ports, ascending: `gap`
 * apart and centered on `center`, but squeezed (smaller gap) to fit inside
 * [min, max] if needed, then shifted as a whole to stay inside it. A range
 * too short for any spacing collapses every port onto its midpoint.
 */
export function spreadPositions(center: number, count: number, min: number, max: number, gap: number): number[] {
  if (count <= 1) return [center]
  if (max < min) return Array.from({ length: count }, () => (min + max) / 2)
  const step = Math.min(gap, (max - min) / (count - 1))
  const span = step * (count - 1)
  const start = Math.min(Math.max(center - span / 2, min), max - span)
  return Array.from({ length: count }, (_, i) => start + i * step)
}
