import { describe, expect, it } from 'vitest'
import {
  attachedArrowTipX,
  createMarkerElement,
  markerSignature,
  resolveMarkerConfig,
  shapeEdgeDistance,
} from '../src/markers'
import { VLMarkerShapeEnum, VLOrientEnum } from '../src/enums'

describe('resolveMarkerConfig', () => {
  it('returns null when no marker is configured', () => {
    expect(resolveMarkerConfig(undefined, '#000')).toBeNull()
  })

  it('expands a shorthand shape string', () => {
    expect(resolveMarkerConfig(VLMarkerShapeEnum.DIAMOND, '#000')).toEqual({
      shape: VLMarkerShapeEnum.DIAMOND,
      size: 6, // default: 6x the connection's current stroke width
      color: '#000',
      strokeColor: undefined, // no outline by default
      strokeWidth: 1,
      className: undefined,
      svg: undefined,
      orient: VLOrientEnum.FIXED,
    })
  })

  it('leaves strokeColor unset by default, and resolves an explicit one alongside its own strokeWidth default', () => {
    expect(resolveMarkerConfig(VLMarkerShapeEnum.CIRCLE, '#000')!.strokeColor).toBeUndefined()
    const resolved = resolveMarkerConfig({ shape: VLMarkerShapeEnum.CIRCLE, strokeColor: 'blue' }, '#000')!
    expect(resolved.strokeColor).toBe('blue')
    expect(resolved.strokeWidth).toBe(1) // default when only strokeColor is given
  })

  it('lets an explicit strokeWidth override the default', () => {
    const resolved = resolveMarkerConfig(
      { shape: VLMarkerShapeEnum.CIRCLE, strokeColor: 'blue', strokeWidth: 3 },
      '#000',
    )!
    expect(resolved.strokeWidth).toBe(3)
  })

  it('defaults every built-in shape to the same 6x stroke-width multiple', () => {
    expect(resolveMarkerConfig(VLMarkerShapeEnum.ARROW, '#000')!.size).toBe(6)
    expect(resolveMarkerConfig(VLMarkerShapeEnum.CIRCLE, '#000')!.size).toBe(6)
    expect(resolveMarkerConfig(VLMarkerShapeEnum.SQUARE, '#000')!.size).toBe(6)
    expect(resolveMarkerConfig(VLMarkerShapeEnum.DIAMOND, '#000')!.size).toBe(6)
  })

  it('lets an instance-wide sizeDefaults override each shape independently', () => {
    const sizeDefaults = { circle: 10, square: 12, diamond: 14, arrow: 16 }
    expect(resolveMarkerConfig(VLMarkerShapeEnum.CIRCLE, '#000', sizeDefaults)!.size).toBe(10)
    expect(resolveMarkerConfig(VLMarkerShapeEnum.SQUARE, '#000', sizeDefaults)!.size).toBe(12)
    expect(resolveMarkerConfig(VLMarkerShapeEnum.DIAMOND, '#000', sizeDefaults)!.size).toBe(14)
    expect(resolveMarkerConfig(VLMarkerShapeEnum.ARROW, '#000', sizeDefaults)!.size).toBe(16)
  })

  it('still lets an explicit per-connection size win over the instance-wide default', () => {
    const resolved = resolveMarkerConfig({ shape: VLMarkerShapeEnum.SQUARE, size: 99 }, '#000', { square: 12 })!
    expect(resolved.size).toBe(99)
  })

  it('defaults the arrow shape to auto orientation', () => {
    expect(resolveMarkerConfig(VLMarkerShapeEnum.ARROW, '#000')!.orient).toBe(VLOrientEnum.AUTO)
  })

  it('lets an explicit config override size/color and orient', () => {
    const resolved = resolveMarkerConfig(
      { shape: VLMarkerShapeEnum.SQUARE, size: 20, color: 'red', orient: VLOrientEnum.AUTO },
      '#000',
    )
    expect(resolved).toMatchObject({
      shape: VLMarkerShapeEnum.SQUARE,
      size: 20,
      color: 'red',
      orient: VLOrientEnum.AUTO,
    })
  })

  it('treats a custom svg config as shapeless', () => {
    const resolved = resolveMarkerConfig({ svg: '<path d="M0,0" />' }, '#000')
    expect(resolved?.shape).toBeUndefined()
    expect(resolved?.svg).toBe('<path d="M0,0" />')
  })
})

describe('markerSignature', () => {
  it('produces identical signatures for identical configs, at the same position', () => {
    const a = resolveMarkerConfig(VLMarkerShapeEnum.CIRCLE, '#2e8b57')!
    const b = resolveMarkerConfig({ shape: VLMarkerShapeEnum.CIRCLE }, '#2e8b57')!
    expect(markerSignature('end', a)).toBe(markerSignature('end', b))
  })

  it('differs by position, shape, size, color, className, or svg', () => {
    const base = resolveMarkerConfig(VLMarkerShapeEnum.CIRCLE, '#000')!
    const signature = markerSignature('end', base)
    expect(markerSignature('start', base)).not.toBe(signature)
    expect(markerSignature('end', { ...base, size: 20 })).not.toBe(signature)
    expect(markerSignature('end', { ...base, color: 'red' })).not.toBe(signature)
  })
})

describe('createMarkerElement', () => {
  it('builds a <marker> with the given id and a shape matching the config', () => {
    const el = createMarkerElement('vl-marker-0', 'end', resolveMarkerConfig(VLMarkerShapeEnum.SQUARE, '#000')!)
    expect(el.tagName.toLowerCase()).toBe('marker')
    expect(el.id).toBe('vl-marker-0')
    expect(el.querySelector('rect')).not.toBeNull()
    // These check raw SVG attribute output (a separate contract from our own
    // VLOrientEnum config), so they stay literal strings — '0'/'auto-start-reverse'
    // aren't VLOrientEnum members at all.
    expect(el.getAttribute('orient')).toBe('0')
    // strokeWidth units, not userSpaceOnUse: the marker then scales automatically
    // whenever the connection's own stroke-width changes (e.g. the hover highlight).
    expect(el.getAttribute('markerUnits')).toBe('strokeWidth')
  })

  it('auto-orients an arrow, reversed at the start position', () => {
    const arrow = resolveMarkerConfig(VLMarkerShapeEnum.ARROW, '#000')!
    const end = createMarkerElement('e', 'end', arrow)
    const start = createMarkerElement('s', 'start', arrow)
    expect(end.getAttribute('orient')).toBe('auto')
    expect(start.getAttribute('orient')).toBe('auto-start-reverse')
  })

  it('renders raw custom svg markup as-is', () => {
    const el = createMarkerElement('c', 'end', resolveMarkerConfig({ svg: '<circle cx="5" cy="5" r="5" />' }, '#000')!)
    expect(el.querySelector('circle')).not.toBeNull()
  })

  it('applies a custom class to the marker element', () => {
    const el = createMarkerElement(
      'm',
      'end',
      resolveMarkerConfig({ shape: VLMarkerShapeEnum.CIRCLE, className: 'my-marker' }, '#000')!,
    )
    expect(el.classList.contains('my-marker')).toBe(true)
  })

  it('adds a stroke to a built-in shape only when strokeColor is set', () => {
    const plain = createMarkerElement('p', 'end', resolveMarkerConfig(VLMarkerShapeEnum.CIRCLE, '#000')!)
    expect(plain.querySelector('circle')!.getAttribute('stroke')).toBeNull()

    const outlined = createMarkerElement(
      'o',
      'end',
      resolveMarkerConfig({ shape: VLMarkerShapeEnum.CIRCLE, strokeColor: 'blue', strokeWidth: 2 }, '#000')!,
    )
    const circle = outlined.querySelector('circle')!
    expect(circle.getAttribute('stroke')).toBe('blue')
    expect(circle.getAttribute('stroke-width')).toBe('2')
  })

  it('ignores strokeColor for the arrow shape, which already uses color as its one stroke', () => {
    const el = createMarkerElement(
      'a',
      'end',
      resolveMarkerConfig({ shape: VLMarkerShapeEnum.ARROW, color: 'green', strokeColor: 'blue' }, '#000')!,
    )
    expect(el.querySelector('path')!.getAttribute('stroke')).toBe('green')
  })
})

describe('arrow attached to a shape marker', () => {
  it('resolves `arrow: true` with the connection color and no gap, and forces orient auto', () => {
    const resolved = resolveMarkerConfig({ shape: VLMarkerShapeEnum.CIRCLE, color: '#fff', arrow: true }, '#123')!
    expect(resolved.arrow).toEqual({ color: '#123', gap: 0 })
    expect(resolved.orient).toBe(VLOrientEnum.AUTO)
  })

  it('takes an explicit arrow color/gap, and ignores `arrow` on the arrow shape itself', () => {
    const resolved = resolveMarkerConfig({ shape: VLMarkerShapeEnum.SQUARE, arrow: { color: 'red', gap: 2 } }, '#000')!
    expect(resolved.arrow).toEqual({ color: 'red', gap: 2 })
    expect(resolveMarkerConfig({ shape: VLMarkerShapeEnum.ARROW, arrow: true }, '#000')!.arrow).toBeUndefined()
  })

  it('measures the edge per shape, outline included', () => {
    const edge = (config: Parameters<typeof resolveMarkerConfig>[0]) =>
      shapeEdgeDistance(resolveMarkerConfig(config, '#000')!)
    expect(edge({ shape: VLMarkerShapeEnum.CIRCLE })).toBe(6)
    expect(edge({ shape: VLMarkerShapeEnum.CIRCLE, strokeColor: 'blue', strokeWidth: 2 })).toBe(7)
    expect(edge({ shape: VLMarkerShapeEnum.SQUARE })).toBe(6)
    expect(edge({ shape: VLMarkerShapeEnum.DIAMOND })).toBe(8)
    expect(edge({ svg: '<circle r="3" />' })).toBe(0)
  })

  it("puts the arrow's rounded tip exactly on the shape's edge, and widens the viewBox to fit it", () => {
    const resolved = resolveMarkerConfig({ shape: VLMarkerShapeEnum.CIRCLE, arrow: true, size: 5 }, '#000')!
    // center 10 − radius 6 − half the arrow's 3-unit stroke
    expect(attachedArrowTipX(resolved)).toBe(2.5)

    const el = createMarkerElement('m', 'end', resolved)
    const [minX, , width] = el.getAttribute('viewBox')!.split(' ').map(Number)
    expect(minX).toBeLessThan(0)
    expect(minX! + width!).toBe(20)
    // One viewBox unit keeps a plain marker's on-screen size.
    expect(Number(el.getAttribute('markerWidth')) / width!).toBeCloseTo(5 / 20)
    expect(el.getAttribute('refX')).toBe('10')
    expect(el.getAttribute('orient')).toBe('auto')

    const [arrow, shape] = [...el.children]
    expect(arrow!.getAttribute('d')).toContain('L 2.5 10')
    expect(arrow!.getAttribute('stroke')).toBe('#000')
    expect(shape!.tagName).toBe('circle')
  })

  it('keeps a start marker reversed, and gives an arrow-carrying config its own signature', () => {
    const plain = resolveMarkerConfig(VLMarkerShapeEnum.CIRCLE, '#000')!
    const withArrow = resolveMarkerConfig({ shape: VLMarkerShapeEnum.CIRCLE, arrow: true }, '#000')!
    expect(createMarkerElement('m', 'start', withArrow).getAttribute('orient')).toBe('auto-start-reverse')
    expect(markerSignature('end', plain)).not.toBe(markerSignature('end', withArrow))
  })
})
