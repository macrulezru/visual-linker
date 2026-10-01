import { describe, expect, it } from 'vitest'
import { resolveSpread, spreadPositions } from '../src/spread'

describe('spreadPositions', () => {
  it('spaces ports `gap` apart, centered on the original point', () => {
    expect(spreadPositions(100, 3, 0, 200, 20)).toEqual([80, 100, 120])
  })

  it('shrinks the gap so the outermost ports stay inside the range', () => {
    // 3 ports need 2 gaps; only 24 px are available.
    expect(spreadPositions(50, 3, 38, 62, 20)).toEqual([38, 50, 62])
  })

  it('shifts the whole row back inside when the center sits near an edge', () => {
    expect(spreadPositions(5, 3, 0, 200, 10)).toEqual([0, 10, 20])
    expect(spreadPositions(198, 3, 0, 200, 10)).toEqual([180, 190, 200])
  })

  it('leaves a single port where it is, and collapses onto the midpoint when the range is empty', () => {
    expect(spreadPositions(42, 1, 0, 10, 20)).toEqual([42])
    expect(spreadPositions(42, 2, 30, 10, 20)).toEqual([20, 20])
  })
})

describe('resolveSpread', () => {
  it('is off unless enabled, and the first defined setting (port → block → instance) wins', () => {
    expect(resolveSpread(undefined, undefined, undefined)).toBeNull()
    expect(resolveSpread(undefined, true, undefined)).toEqual({ gap: 16, padding: 8 })
    expect(resolveSpread(false, true, true)).toBeNull()
    expect(resolveSpread({ gap: 30 }, true, undefined)).toEqual({ gap: 30, padding: 8 })
    expect(resolveSpread(undefined, undefined, { padding: 0 })).toEqual({ gap: 16, padding: 0 })
  })
})
