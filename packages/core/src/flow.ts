import {
  DEFAULT_FLOW_DASH,
  DEFAULT_FLOW_DOT_GAP,
  DEFAULT_FLOW_GAP,
  DEFAULT_FLOW_SPEED,
  FLOW_DOT_LENGTH,
  FLOW_DOT_MIN_WIDTH,
  FLOW_DOT_WIDTH_RATIO,
  FLOW_TINT_DOT_MIN_WIDTH,
  FLOW_TINT_DOT_WIDTH_RATIO,
  FLOW_WIDTH_RATIO,
} from './params'
import type { ConnectionFlow } from './types'

export interface ResolvedFlow {
  /** Pattern speed, px per second. */
  speed: number
  direction: 'forward' | 'backward'
  /** Dash length, px — a tiny value for dots (rounded caps turn it into a circle). */
  dash: number
  gap: number
  /** Explicit pattern color, or `undefined` for "tint" mode: the pattern takes the line's own color and the line underneath is dimmed. */
  color: string | undefined
  /** Explicit stroke width, or `undefined` to follow the line's own width. */
  width: number | undefined
  dots: boolean
}

/**
 * Resolves `style.animated` against the instance default: `false` turns an
 * inherited animation off, `true` takes every default, an object tunes it.
 */
export function resolveFlow(
  own: boolean | ConnectionFlow | undefined,
  fallback: boolean | ConnectionFlow | undefined,
): ResolvedFlow | null {
  const value = own ?? fallback
  if (!value) return null
  const flow: ConnectionFlow = value === true ? {} : value
  const dots = flow.shape === 'dots'
  return {
    speed: Math.max(1, flow.speed ?? DEFAULT_FLOW_SPEED),
    direction: flow.direction === 'backward' ? 'backward' : 'forward',
    dash: Math.max(0, flow.dash ?? (dots ? FLOW_DOT_LENGTH : DEFAULT_FLOW_DASH)),
    gap: Math.max(1, flow.gap ?? (dots ? DEFAULT_FLOW_DOT_GAP : DEFAULT_FLOW_GAP)),
    color: flow.color,
    width: flow.width,
    dots,
  }
}

/**
 * The pattern's stroke width: explicit, or derived from the line it rides on.
 * In tint mode the pattern is as wide as the line (it replaces the dimmed
 * line where it passes); drawn in its own color it is thinner, like a
 * highlight on the line. Dots keep a visible minimum either way.
 */
export function flowStrokeWidth(flow: ResolvedFlow, lineWidth: number): number {
  if (flow.width != null) return flow.width
  const tint = flow.color === undefined
  if (flow.dots) {
    return tint
      ? Math.max(FLOW_TINT_DOT_MIN_WIDTH, lineWidth * FLOW_TINT_DOT_WIDTH_RATIO)
      : Math.max(FLOW_DOT_MIN_WIDTH, lineWidth * FLOW_DOT_WIDTH_RATIO)
  }
  return tint ? lineWidth : Math.max(1, lineWidth * FLOW_WIDTH_RATIO)
}
