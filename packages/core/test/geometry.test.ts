import { describe, expect, it } from 'vitest'
import { bezierPath, exitDirection, resolveAutoSide, sidePoint, straightPath } from '../src/geometry'
import { VLFixedSideEnum } from '../src/enums'

function angleDeg(vector: { x: number; y: number }): number {
  return (Math.atan2(vector.y, vector.x) * 180) / Math.PI
}

describe('resolveAutoSide', () => {
  it('picks right when the target is mostly to the right', () => {
    expect(resolveAutoSide({ x: 0, y: 0 }, { x: 100, y: 5 })).toBe(VLFixedSideEnum.RIGHT)
  })

  it('picks bottom when the target is mostly below', () => {
    expect(resolveAutoSide({ x: 0, y: 0 }, { x: 5, y: 100 })).toBe(VLFixedSideEnum.BOTTOM)
  })

  it('picks left when the target is mostly to the left', () => {
    expect(resolveAutoSide({ x: 100, y: 0 }, { x: 0, y: 5 })).toBe(VLFixedSideEnum.LEFT)
  })

  it('picks top when the target is mostly above', () => {
    expect(resolveAutoSide({ x: 0, y: 100 }, { x: 5, y: 0 })).toBe(VLFixedSideEnum.TOP)
  })

  it('restricts the choice to the given candidates, even when a ruled-out side would otherwise win', () => {
    // Target is almost directly below (dy=100 dwarfs dx=5) — full auto would pick 'bottom'.
    expect(resolveAutoSide({ x: 0, y: 0 }, { x: 5, y: 100 }, [VLFixedSideEnum.LEFT, VLFixedSideEnum.RIGHT])).toBe(
      VLFixedSideEnum.RIGHT,
    )
    expect(resolveAutoSide({ x: 100, y: 0 }, { x: 5, y: 100 }, [VLFixedSideEnum.LEFT, VLFixedSideEnum.RIGHT])).toBe(
      VLFixedSideEnum.LEFT,
    )
  })

  it('restricts to a single candidate regardless of geometry', () => {
    expect(resolveAutoSide({ x: 0, y: 0 }, { x: -500, y: -500 }, [VLFixedSideEnum.BOTTOM])).toBe(VLFixedSideEnum.BOTTOM)
  })

  it('falls back to all four sides for an empty candidate list', () => {
    expect(resolveAutoSide({ x: 0, y: 0 }, { x: 100, y: 5 }, [])).toBe(VLFixedSideEnum.RIGHT)
  })
})

describe('sidePoint', () => {
  const rect = new DOMRect(10, 20, 100, 50)

  it('returns the midpoint of the given side by default', () => {
    expect(sidePoint(rect, VLFixedSideEnum.BOTTOM)).toEqual({ x: 60, y: 70 })
    expect(sidePoint(rect, VLFixedSideEnum.RIGHT)).toEqual({ x: 110, y: 45 })
  })

  it('respects a non-center offset along the side', () => {
    expect(sidePoint(rect, VLFixedSideEnum.BOTTOM, 0.25)).toEqual({ x: 35, y: 70 })
  })
})

describe('exitDirection', () => {
  it('stays exactly on the cardinal normal when the target is dead-on', () => {
    // 'right' normal is 0°, and (100,0) is exactly 0° from (0,0) — no bias needed.
    expect(angleDeg(exitDirection(VLFixedSideEnum.RIGHT, { x: 0, y: 0 }, { x: 100, y: 0 }))).toBeCloseTo(0, 5)
  })

  it('leans toward a target only partway, never fully aligning to it (keeps a visible bow)', () => {
    // Target is 20° off the 'right' normal — well inside the cap — so the exit leans
    // 55% of the way there (EXIT_ANGLE_BLEND), not the full 20°.
    const to = { x: 100, y: 100 * Math.tan((20 * Math.PI) / 180) }
    expect(angleDeg(exitDirection(VLFixedSideEnum.RIGHT, { x: 0, y: 0 }, to))).toBeCloseTo(20 * 0.55, 1)
  })

  it('blends the maximum possible auto-resolved gap (45°) to well under the absolute cap', () => {
    // Target is 45° off the 'right' normal — the largest gap resolveAutoSide can ever produce.
    // 45 * 0.55 = 24.75°, comfortably under the 30° ceiling, so the ceiling doesn't even engage here.
    expect(angleDeg(exitDirection(VLFixedSideEnum.RIGHT, { x: 0, y: 0 }, { x: 100, y: 100 }))).toBeCloseTo(45 * 0.55, 1)
    // Symmetric on the other side.
    expect(angleDeg(exitDirection(VLFixedSideEnum.RIGHT, { x: 0, y: 0 }, { x: 100, y: -100 }))).toBeCloseTo(
      -45 * 0.55,
      1,
    )
  })

  it('caps the lean at the absolute ceiling for a much larger gap (e.g. a narrowed side candidate list)', () => {
    // Target nearly behind the port: a ~90° gap, only reachable with a narrowed `side` candidate
    // list (full auto never picks a side more than 45° off). 90 * 0.55 = 49.5°, over the 30° ceiling.
    const angle = angleDeg(exitDirection(VLFixedSideEnum.RIGHT, { x: 0, y: 0 }, { x: -10, y: 1000 }))
    expect(angle).toBeCloseTo(30, 1)
  })
})

describe('paths', () => {
  it('produces a straight-line M/L path', () => {
    expect(straightPath({ x: 0, y: 0 }, { x: 10, y: 10 })).toBe('M 0 0 L 10 10')
  })

  it('produces a cubic bezier path anchored at both endpoints', () => {
    const d = bezierPath({ x: 0, y: 0 }, VLFixedSideEnum.RIGHT, { x: 200, y: 0 }, VLFixedSideEnum.LEFT)
    expect(d.startsWith('M 0 0 C')).toBe(true)
    expect(d.endsWith('200 0')).toBe(true)
  })
})
