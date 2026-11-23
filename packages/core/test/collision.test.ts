import { describe, expect, it } from 'vitest'
import { resolveCollisionOption, separateBox } from '../src/collision'

describe('resolveCollisionOption', () => {
  it('is off when nothing is set', () => {
    expect(resolveCollisionOption(undefined, undefined, 16)).toBe(false)
  })

  it('inherits the instance value when the block has none', () => {
    expect(resolveCollisionOption(undefined, true, 16)).toBe(16)
    expect(resolveCollisionOption(undefined, { gap: 12 }, 16)).toBe(12)
    expect(resolveCollisionOption(undefined, false, 16)).toBe(false)
  })

  it("a block's own value wins over the instance default", () => {
    expect(resolveCollisionOption(false, true, 16)).toBe(false)
    expect(resolveCollisionOption({ gap: 8 }, { gap: 20 }, 16)).toBe(8)
    expect(resolveCollisionOption(true, false, 16)).toBe(16)
  })

  it('uses the fallback gap when the option is true or { gap } is omitted', () => {
    expect(resolveCollisionOption(true, undefined, 16)).toBe(16)
    expect(resolveCollisionOption({}, true, 16)).toBe(16)
  })
})

describe('separateBox', () => {
  it('does not move a box that already has enough air', () => {
    const next = separateBox({ x: 0, y: 0, w: 100, h: 40, gap: 16 }, [
      { x: 150, y: 0, w: 100, h: 40, gap: 16 },
    ])
    expect(next).toEqual({ x: 0, y: 0 })
  })

  it('pushes along the shortest axis to keep the pair gap', () => {
    // Moving 80..180 against obstacle 150..250, both gap 16 → 16px of air
    // means the moving box's right edge must sit at 134.
    const next = separateBox({ x: 80, y: 0, w: 100, h: 40, gap: 16 }, [
      { x: 150, y: 0, w: 100, h: 40, gap: 16 },
    ])
    expect(next).toEqual({ x: 34, y: 0 })
  })

  it('uses the larger of the two gaps, like CSS margin collapse', () => {
    const next = separateBox({ x: 80, y: 0, w: 100, h: 40, gap: 12 }, [
      { x: 150, y: 0, w: 100, h: 40, gap: 20 },
    ])
    expect(next).toEqual({ x: 30, y: 0 })
  })
})
