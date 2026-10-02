import { describe, expect, it } from 'vitest'
import {
  baseOf,
  layered,
  mergeConfig,
  mergeMarkerInputs,
  normalizeMarker,
  patchConfig,
  resolveLines,
  statesOf,
  themeLineColor,
  NO_STATES,
} from '../src/config'
import { darkTheme, defineTheme, lightTheme, themeVariables, THEME_VARS } from '../src/theme'
import { VLMarkerShapeEnum } from '../src/enums'
import type { LinesConfig, VisualLinkerConfig } from '../src/types'

describe('mergeConfig', () => {
  it('merges plain objects deeply and lets later layers win', () => {
    const result = mergeConfig<VisualLinkerConfig>(
      { lines: { color: 'red', width: 2, hover: { color: 'blue' } } },
      { lines: { width: 4, hover: { width: 5 } }, ports: { radius: 3 } },
    )
    expect(result).toEqual({
      lines: { color: 'red', width: 4, hover: { color: 'blue', width: 5 } },
      ports: { radius: 3 },
    })
  })

  it('ignores undefined values instead of erasing the lower layer', () => {
    const result = mergeConfig<VisualLinkerConfig>({ lines: { color: 'red' } }, { lines: { color: undefined } })
    expect(result.lines?.color).toBe('red')
  })

  it('does not mutate its inputs and does not share nested objects with them', () => {
    const base: VisualLinkerConfig = { lines: { hover: { color: 'blue' } } }
    const merged = mergeConfig<VisualLinkerConfig>(base, { lines: { hover: { width: 3 } } })
    expect(base).toEqual({ lines: { hover: { color: 'blue' } } })
    merged.lines!.hover!.color = 'green'
    expect(base.lines!.hover!.color).toBe('blue')
  })

  it('treats DOM elements and arrays as opaque values', () => {
    const box = document.createElement('div')
    const result = mergeConfig<VisualLinkerConfig>(
      { blocks: { drag: { bounds: 'container' } } },
      { blocks: { drag: { bounds: box } } },
    )
    expect(result.blocks?.drag?.bounds).toBe(box)
    const sides = mergeConfig<VisualLinkerConfig>({ ports: { side: ['left'] } }, { ports: { side: ['top', 'right'] } })
    expect(sides.ports?.side).toEqual(['top', 'right'])
  })
})

describe('patchConfig', () => {
  it('deletes a key patched to undefined, so a setting can be unset at runtime', () => {
    const result = patchConfig<VisualLinkerConfig>(
      { lines: { color: 'red', width: 2 } },
      { lines: { color: undefined, width: 3 } },
    )
    expect(result).toEqual({ lines: { width: 3 } })
  })
})

describe('state layering', () => {
  const config = {
    color: 'red',
    width: 2,
    hover: { color: 'blue' },
    selected: { color: 'green', width: 5 },
    focus: { width: 9 },
  }

  it('baseOf drops the state buckets', () => {
    expect(baseOf(config)).toEqual({ color: 'red', width: 2 })
  })

  it('applies selected, then hover, then focus on top of the base', () => {
    expect(layered(config, NO_STATES)).toEqual({ color: 'red', width: 2 })
    expect(layered(config, { ...NO_STATES, selected: true })).toEqual({ color: 'green', width: 5 })
    expect(layered(config, { hover: true, selected: true, focus: false })).toEqual({ color: 'blue', width: 5 })
    expect(layered(config, { hover: true, selected: true, focus: true })).toEqual({ color: 'blue', width: 9 })
  })

  it('statesOf returns only what the active states set', () => {
    expect(statesOf(config, { ...NO_STATES, hover: true })).toEqual({ color: 'blue' })
    expect(statesOf(config, NO_STATES)).toEqual({})
    expect(statesOf(undefined, NO_STATES)).toEqual({})
  })
})

describe('resolveLines', () => {
  it('merges a connection style over the group config, state by state', () => {
    const group: LinesConfig = {
      color: 'red',
      hover: { color: 'blue', width: 3 },
      bezier: { curvature: 0.2, minReach: 10 },
    }
    const view = resolveLines(group, { width: 4, hover: { width: 6 }, bezier: { curvature: 0.9 } })
    expect(view).toEqual({
      color: 'red',
      width: 4,
      hover: { color: 'blue', width: 6 },
      bezier: { curvature: 0.9, minReach: 10 },
    })
  })

  it('lets a connection switch an inherited animation off', () => {
    expect(resolveLines({ animated: { shape: 'dots' } }, { animated: false }).animated).toBe(false)
  })

  it('returns the group config as is without a connection style', () => {
    const group: LinesConfig = { color: 'red' }
    expect(resolveLines(group, undefined)).toBe(group)
    expect(resolveLines(undefined, undefined)).toEqual({})
  })
})

describe('markers input', () => {
  it('normalizes a shape name to a config and keeps false and undefined', () => {
    expect(normalizeMarker(VLMarkerShapeEnum.ARROW)).toEqual({ shape: 'arrow' })
    expect(normalizeMarker(false)).toBe(false)
    expect(normalizeMarker(undefined)).toBeUndefined()
  })

  it('merges a connection marker over the instance one field by field, including its states', () => {
    const merged = mergeMarkerInputs(
      { shape: VLMarkerShapeEnum.ARROW, size: 6, hover: { size: 9, color: 'red' } },
      { color: 'blue', hover: { size: 12 } },
    )
    expect(merged).toEqual({ shape: 'arrow', size: 6, color: 'blue', hover: { size: 12, color: 'red' } })
  })

  it('false on the connection removes the instance marker, and false on the instance is replaced by a config', () => {
    expect(mergeMarkerInputs(VLMarkerShapeEnum.CIRCLE, false)).toBe(false)
    expect(mergeMarkerInputs(false, { shape: VLMarkerShapeEnum.SQUARE })).toEqual({ shape: 'square' })
    expect(mergeMarkerInputs(undefined, undefined)).toBeUndefined()
  })
})

describe('theme', () => {
  it('maps every token to a CSS variable', () => {
    expect(Object.keys(THEME_VARS).sort()).toEqual(Object.keys(lightTheme).sort())
    expect(Object.keys(darkTheme).sort()).toEqual(Object.keys(lightTheme).sort())
  })

  it('defineTheme overrides a base, light by default', () => {
    expect(defineTheme({ line: '#123456' }).portFill).toBe(lightTheme.portFill)
    expect(defineTheme({ line: '#123456' }).line).toBe('#123456')
    expect(defineTheme({ line: '#123456' }, darkTheme).portFill).toBe(darkTheme.portFill)
  })

  it('lists every variable, with undefined for tokens the theme leaves out', () => {
    const vars = themeVariables({ line: 'red' })
    expect(vars.get('--vl-line-color')).toBe('red')
    expect(vars.get('--vl-port-fill')).toBeUndefined()
    expect(vars.size).toBe(Object.keys(THEME_VARS).length)
  })

  it('picks the line color of a state, falling back down the chain', () => {
    const theme = { line: 'a', lineHover: 'b', lineSelected: 'c' }
    expect(themeLineColor(theme, NO_STATES)).toBe('a')
    expect(themeLineColor(theme, { ...NO_STATES, selected: true })).toBe('c')
    expect(themeLineColor(theme, { ...NO_STATES, hover: true })).toBe('b')
    expect(themeLineColor({ line: 'a', lineHover: 'b' }, { ...NO_STATES, selected: true })).toBe('b')
    expect(themeLineColor(undefined, NO_STATES)).toBe('#2e8b57')
  })
})

describe('highlight state', () => {
  const config = { color: 'red', hover: { color: 'blue' }, highlight: { color: 'orange', width: 4 } }

  it('layers highlight between selected and hover', () => {
    expect(layered(config, { ...NO_STATES, highlight: true })).toEqual({ color: 'orange', width: 4 })
    expect(layered(config, { ...NO_STATES, highlight: true, hover: true })).toEqual({ color: 'blue', width: 4 })
    expect(
      layered({ ...config, selected: { color: 'green' } }, { ...NO_STATES, selected: true, highlight: true }),
    ).toEqual({
      color: 'orange',
      width: 4,
    })
  })

  it('behaves like hover when no highlight bucket is set', () => {
    const plain = { color: 'red', hover: { color: 'blue', width: 3 } }
    expect(layered(plain, { ...NO_STATES, highlight: true })).toEqual({ color: 'blue', width: 3 })
  })

  it('takes the hover line color from the theme', () => {
    expect(themeLineColor({ line: 'a', lineHover: 'b' }, { ...NO_STATES, highlight: true })).toBe('b')
  })
})
