import { describe, expect, it } from 'vitest'
import {
  computeBranchInfo,
  orthogonalPoints,
  polylineMidpoint,
  polylineTangentAngles,
  roundedPolylinePath,
  smoothstepPath,
} from '../src/orthogonal'
import { VLFixedSideEnum } from '../src/enums'
import type { FixedSide } from '../src/types'

describe('orthogonalPoints', () => {
  it('draws a single straight segment when already aligned on the shared axis', () => {
    expect(orthogonalPoints({ x: 0, y: 0 }, VLFixedSideEnum.BOTTOM, { x: 0, y: 100 }, VLFixedSideEnum.TOP)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ])
    expect(orthogonalPoints({ x: 0, y: 0 }, VLFixedSideEnum.RIGHT, { x: 100, y: 0 }, VLFixedSideEnum.LEFT)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ])
  })

  it('adds one bend for perpendicular sides (an "L")', () => {
    expect(orthogonalPoints({ x: 0, y: 0 }, VLFixedSideEnum.RIGHT, { x: 100, y: 100 }, VLFixedSideEnum.TOP)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ])
    expect(orthogonalPoints({ x: 0, y: 0 }, VLFixedSideEnum.BOTTOM, { x: 100, y: 100 }, VLFixedSideEnum.LEFT)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ])
  })

  it('adds two bends at the midpoint for parallel, unaligned sides (a "Z")', () => {
    expect(orthogonalPoints({ x: 0, y: 0 }, VLFixedSideEnum.BOTTOM, { x: 100, y: 100 }, VLFixedSideEnum.TOP)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 50 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
    ])
    expect(orthogonalPoints({ x: 0, y: 0 }, VLFixedSideEnum.RIGHT, { x: 100, y: 100 }, VLFixedSideEnum.LEFT)).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 100 },
      { x: 100, y: 100 },
    ])
  })
})

describe('roundedPolylinePath', () => {
  it('draws a plain M/L path for two points regardless of radius', () => {
    expect(
      roundedPolylinePath(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        8,
      ),
    ).toBe('M 0 0 L 10 0')
  })

  it('draws plain M/L segments (no Q) when radius is ~0', () => {
    const d = roundedPolylinePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      0,
    )
    expect(d).toBe('M 0 0 L 10 0 L 10 10')
  })

  it('rounds an interior corner with a quadratic curve through the original corner point', () => {
    const d = roundedPolylinePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      4,
    )
    expect(d).toBe('M 0 0 L 6 0 Q 10 0 10 4 L 10 10')
  })

  it('clamps the radius to half the shorter adjoining segment', () => {
    const d = roundedPolylinePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 6 },
      ],
      100,
    )
    // Shorter segment (10,0)->(10,6) has length 6, so radius clamps to 3.
    expect(d).toBe('M 0 0 L 7 0 Q 10 0 10 3 L 10 6')
  })
})

describe('computeBranchInfo', () => {
  // maxReach defaults to Infinity in these fixtures so most tests exercise
  // only the nearest-sibling logic; the cap itself gets its own tests below.
  function entry(overrides: {
    connectionId: string
    blockId: string
    portId?: string
    point: { x: number; y: number }
    side: FixedSide
    otherPoint: { x: number; y: number }
    maxReach?: number
  }) {
    return { portId: undefined, maxReach: Infinity, ...overrides }
  }

  it('creates no entry for a solo connection (group of 1)', () => {
    const result = computeBranchInfo([
      entry({
        connectionId: 'a',
        blockId: 'b1',
        point: { x: 0, y: 0 },
        side: VLFixedSideEnum.BOTTOM,
        otherPoint: { x: 0, y: 100 },
      }),
    ])
    expect(result.size).toBe(0)
  })

  it('picks the nearest sibling target as the branch point, along the trunk axis', () => {
    // Block3-like case: one sibling directly below (closer), one further and to the side.
    const result = computeBranchInfo([
      entry({
        connectionId: 'toNear',
        blockId: 'b3',
        point: { x: 0, y: 0 },
        side: VLFixedSideEnum.BOTTOM,
        otherPoint: { x: 0, y: 50 },
      }),
      entry({
        connectionId: 'toFar',
        blockId: 'b3',
        point: { x: 0, y: 0 },
        side: VLFixedSideEnum.BOTTOM,
        otherPoint: { x: 80, y: 120 },
      }),
    ])

    expect(result.get('toNear')).toEqual({ branchPoint: { x: 0, y: 50 }, isNearest: true })
    expect(result.get('toFar')).toEqual({ branchPoint: { x: 0, y: 50 }, isNearest: false })
  })

  it('keeps separate groups for different blocks/ports/sides', () => {
    const result = computeBranchInfo([
      entry({
        connectionId: 'a',
        blockId: 'b1',
        portId: 'p',
        point: { x: 0, y: 0 },
        side: VLFixedSideEnum.RIGHT,
        otherPoint: { x: 100, y: 0 },
      }),
      entry({
        connectionId: 'b',
        blockId: 'b1',
        portId: 'q',
        point: { x: 0, y: 0 },
        side: VLFixedSideEnum.RIGHT,
        otherPoint: { x: 100, y: 50 },
      }),
    ])
    // Different portId => different groups => no branching between them.
    expect(result.size).toBe(0)
  })

  it('clamps a negative (backwards) distance to 0 rather than producing a branch point behind the anchor', () => {
    const result = computeBranchInfo([
      entry({
        connectionId: 'a',
        blockId: 'b1',
        point: { x: 0, y: 0 },
        side: VLFixedSideEnum.BOTTOM,
        otherPoint: { x: 0, y: -50 },
      }),
      entry({
        connectionId: 'b',
        blockId: 'b1',
        point: { x: 0, y: 0 },
        side: VLFixedSideEnum.BOTTOM,
        otherPoint: { x: 10, y: 50 },
      }),
    ])
    expect(result.get('a')!.branchPoint).toEqual({ x: 0, y: 0 })
  })

  it('caps the trunk at maxTrunkReach even when a sibling would naturally reach further', () => {
    // Both targets tie in x (the classic "same column" case that motivated the cap).
    const result = computeBranchInfo([
      entry({
        connectionId: 'a',
        blockId: 'b1',
        point: { x: 0, y: 0 },
        side: VLFixedSideEnum.RIGHT,
        otherPoint: { x: 200, y: 10 },
        maxReach: 40,
      }),
      entry({
        connectionId: 'b',
        blockId: 'b1',
        point: { x: 0, y: 0 },
        side: VLFixedSideEnum.RIGHT,
        otherPoint: { x: 200, y: 90 },
        maxReach: 40,
      }),
    ])
    expect(result.get('a')!.branchPoint).toEqual({ x: 40, y: 0 })
    expect(result.get('b')!.branchPoint).toEqual({ x: 40, y: 0 })
  })

  it("uses the smallest maxTrunkReach among a group's members when they disagree", () => {
    const result = computeBranchInfo([
      entry({
        connectionId: 'a',
        blockId: 'b1',
        point: { x: 0, y: 0 },
        side: VLFixedSideEnum.RIGHT,
        otherPoint: { x: 200, y: 10 },
        maxReach: 100,
      }),
      entry({
        connectionId: 'b',
        blockId: 'b1',
        point: { x: 0, y: 0 },
        side: VLFixedSideEnum.RIGHT,
        otherPoint: { x: 200, y: 90 },
        maxReach: 25,
      }),
    ])
    expect(result.get('a')!.branchPoint).toEqual({ x: 25, y: 0 })
  })
})

describe('smoothstepPath', () => {
  it('draws a solo connection (no branch info) like a plain orthogonal connector', () => {
    const d = smoothstepPath(
      { x: 0, y: 0 },
      VLFixedSideEnum.RIGHT,
      { x: 100, y: 100 },
      VLFixedSideEnum.TOP,
      undefined,
      undefined,
      0,
    )
    expect(d).toBe('M 0 0 L 100 0 L 100 100')
  })

  it('routes the nearest sibling straight through the branch point, unaffected by its own bend', () => {
    const fromBranch = { branchPoint: { x: 0, y: 50 }, isNearest: true }
    const d = smoothstepPath(
      { x: 0, y: 0 },
      VLFixedSideEnum.BOTTOM,
      { x: 0, y: 50 },
      VLFixedSideEnum.TOP,
      fromBranch,
      undefined,
      0,
    )
    expect(d).toBe('M 0 0 L 0 50')
  })

  it('routes a non-nearest sibling sideways off the shared branch point toward its own target', () => {
    const fromBranch = { branchPoint: { x: 0, y: 50 }, isNearest: false }
    const d = smoothstepPath(
      { x: 0, y: 0 },
      VLFixedSideEnum.BOTTOM,
      { x: 80, y: 120 },
      VLFixedSideEnum.TOP,
      fromBranch,
      undefined,
      0,
    )
    // From (0,0) down to the shared branch point (0,50), then right+down into (80,120).
    expect(d).toBe('M 0 0 L 0 50 L 80 50 L 80 120')
  })
})

describe('polylineMidpoint', () => {
  it('returns the exact midpoint of a single straight segment', () => {
    expect(
      polylineMidpoint([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
    ).toEqual({ x: 50, y: 0 })
  })

  it('picks the point at half the TOTAL arc length across multiple segments, not the middle vertex', () => {
    // Total length 30 (10 + 20); half (15) falls 5 units into the second segment.
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
    ]
    expect(polylineMidpoint(points)).toEqual({ x: 10, y: 5 })
  })

  it('handles a degenerate single-point polyline', () => {
    expect(polylineMidpoint([{ x: 5, y: 5 }])).toEqual({ x: 5, y: 5 })
  })
})

describe('polylineTangentAngles', () => {
  it("takes the direction from the first two / last two points, regardless of the path's middle", () => {
    // Enters heading right (0°), exits heading down (90°) — an "L" bend.
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]
    expect(polylineTangentAngles(points)).toEqual({ fromAngle: 0, toAngle: 90 })
  })

  it('returns 0/0 for a degenerate polyline with fewer than 2 points', () => {
    expect(polylineTangentAngles([{ x: 5, y: 5 }])).toEqual({ fromAngle: 0, toAngle: 0 })
    expect(polylineTangentAngles([])).toEqual({ fromAngle: 0, toAngle: 0 })
  })
})
