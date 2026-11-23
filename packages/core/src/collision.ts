import { DEFAULT_BLOCK_GAP } from './params'
import type { CollisionOption } from './types'

export interface CollisionBox {
  x: number
  y: number
  w: number
  h: number
  gap: number
}

/**
 * Resolve one collision setting to a gap in px, or `false` if this block
 * does not take part. Own value wins over the instance default; unset at
 * both levels means off. `true` uses `fallbackGap`.
 */
export function resolveCollisionOption(
  own: CollisionOption | undefined,
  instance: CollisionOption | undefined,
  fallbackGap: number = DEFAULT_BLOCK_GAP,
): number | false {
  const value = own !== undefined ? own : instance
  if (value === undefined || value === false) return false
  if (value === true) return fallbackGap
  return value.gap ?? fallbackGap
}

function overlaps(a: CollisionBox, b: CollisionBox, gap: number): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  )
}

/**
 * Nudge `moving` until it sits at least `max(moving.gap, other.gap)` away
 * from every obstacle (CSS-margin-collapse: the larger gap of the pair).
 * Returns the resolved top-left.
 */
export function separateBox(moving: CollisionBox, obstacles: readonly CollisionBox[]): { x: number; y: number } {
  const next: CollisionBox = { ...moving }
  for (let step = 0; step < 16; step++) {
    let hit = false
    for (const other of obstacles) {
      const gap = Math.max(next.gap, other.gap)
      if (!overlaps(next, other, gap)) continue
      hit = true
      const right = other.x + other.w + gap - next.x
      const left = next.x + next.w + gap - other.x
      const down = other.y + other.h + gap - next.y
      const up = next.y + next.h + gap - other.y
      const minX = Math.min(right, left)
      const minY = Math.min(down, up)
      if (minX <= minY) next.x += right < left ? right : -left
      else next.y += down < up ? down : -up
    }
    if (!hit) break
  }
  return { x: next.x, y: next.y }
}
