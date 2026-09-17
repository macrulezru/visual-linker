import { describe, expect, it } from 'vitest'
import { createMarkerElement, markerSignature, resolveMarkerConfig } from '../src/markers'
import { VLMarkerShapeEnum, VLOrientEnum } from '../src/enums'

describe('resolveMarkerConfig', () => {
  it('returns null when no marker is configured', () => {
    expect(resolveMarkerConfig(undefined, '#000')).toBeNull()
  })

  it('expands a shorthand shape string', () => {
    expect(resolveMarkerConfig(VLMarkerShapeEnum.DIAMOND, '#000')).toEqual({
      shape: VLMarkerShapeEnum.DIAMOND,
      size: 4, // default: 4x the connection's current stroke width
      color: '#000',
      className: undefined,
      svg: undefined,
      orient: VLOrientEnum.FIXED,
    })
  })

  it('sizes the arrow larger by default than the dot-like shapes, both as stroke-width multiples', () => {
    expect(resolveMarkerConfig(VLMarkerShapeEnum.ARROW, '#000')!.size).toBe(6)
    expect(resolveMarkerConfig(VLMarkerShapeEnum.CIRCLE, '#000')!.size).toBe(4)
    expect(resolveMarkerConfig(VLMarkerShapeEnum.SQUARE, '#000')!.size).toBe(4)
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
})
