import type { Theme } from './types'

export const THEME_VARS: Record<keyof Theme, string> = {
  line: '--vl-line-color',
  lineHover: '--vl-line-color-active',
  lineSelected: '--vl-line-color-selected',
  selectedHalo: '--vl-selected-color',
  focusRing: '--vl-focus-color',
  portFill: '--vl-port-fill',
  portStroke: '--vl-port-stroke-color',
  labelBackground: '--vl-label-bg',
  labelBorder: '--vl-label-border',
  labelText: '--vl-label-color',
}

export const lightTheme: Theme = {
  line: '#2e8b57',
  lineHover: '#2e8b57',
  lineSelected: '#2e8b57',
  selectedHalo: '#1f6feb',
  focusRing: '#1f6feb',
  portFill: '#ffffff',
  portStroke: '#2e8b57',
  labelBackground: '#ffffff',
  labelBorder: '#2e8b57',
  labelText: '#1c1e2b',
}

export const darkTheme: Theme = {
  line: '#6fcf97',
  lineHover: '#a8efc6',
  lineSelected: '#8ab4ff',
  selectedHalo: '#8ab4ff',
  focusRing: '#8ab4ff',
  portFill: '#1b1d2b',
  portStroke: '#6fcf97',
  labelBackground: '#1b1d2b',
  labelBorder: '#6fcf97',
  labelText: '#e6e8f2',
}

export function defineTheme(overrides: Theme, base: Theme = lightTheme): Theme {
  return { ...base, ...overrides }
}

export function themeVariables(theme: Theme | undefined): Map<string, string | undefined> {
  const result = new Map<string, string | undefined>()
  for (const key of Object.keys(THEME_VARS) as (keyof Theme)[]) {
    result.set(THEME_VARS[key], theme?.[key])
  }
  return result
}
