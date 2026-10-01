import type { Point } from './geometry'

export interface ClipRect {
  left: number
  top: number
  right: number
  bottom: number
}

/** An ancestor that clips its content on one or both axes (`overflow` other than `visible`). */
export interface ClippingAncestor {
  el: HTMLElement
  x: boolean
  y: boolean
}

const CLIPPING_VALUES = new Set(['hidden', 'scroll', 'auto', 'clip'])

/** Reads one axis' overflow, falling back to the `overflow` shorthand's first/second token. */
function overflowOf(style: CSSStyleDeclaration, axis: 'x' | 'y'): string {
  const longhand = axis === 'x' ? style.overflowX : style.overflowY
  if (longhand) return longhand
  const [first, second] = (style.overflow ?? '').split(/\s+/)
  return (axis === 'x' ? first : (second ?? first)) ?? ''
}

/**
 * The ancestors of `el` that clip it, innermost first, stopping at (and
 * excluding) `stopAt` — whatever lies above the diagram's own container moves
 * the container together with its drawing layer, so it never needs handling —
 * and at `<body>`/`<html>`, whose "clipping" is just the viewport.
 */
export function clippingAncestors(el: HTMLElement, stopAt: HTMLElement): ClippingAncestor[] {
  const chain: ClippingAncestor[] = []
  for (
    let node = el.parentElement;
    node && node !== stopAt && node !== document.body && node !== document.documentElement;
    node = node.parentElement
  ) {
    const style = getComputedStyle(node)
    const x = CLIPPING_VALUES.has(overflowOf(style, 'x'))
    const y = CLIPPING_VALUES.has(overflowOf(style, 'y'))
    if (x || y) chain.push({ el: node, x, y })
  }
  return chain
}

/** The part of the viewport still showing through every clipping ancestor, or `null` when nothing clips. */
export function visibleRect(chain: readonly ClippingAncestor[]): ClipRect | null {
  if (chain.length === 0) return null
  const rect: ClipRect = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity }
  for (const { el, x, y } of chain) {
    const box = el.getBoundingClientRect()
    if (x) {
      rect.left = Math.max(rect.left, box.left)
      rect.right = Math.min(rect.right, box.right)
    }
    if (y) {
      rect.top = Math.max(rect.top, box.top)
      rect.bottom = Math.min(rect.bottom, box.bottom)
    }
  }
  return rect
}

/** Pulls `point` into `rect`; `clipped` is true when it had to move by more than `tolerance` px (so a point sitting on the edge itself is not "clipped"). */
export function clampToRect(point: Point, rect: ClipRect, tolerance = 1): { point: Point; clipped: boolean } {
  // A degenerate (fully collapsed) rect still gets a single well-defined point.
  const maxX = Math.max(rect.left, rect.right)
  const maxY = Math.max(rect.top, rect.bottom)
  const x = Math.min(Math.max(point.x, rect.left), maxX)
  const y = Math.min(Math.max(point.y, rect.top), maxY)
  return { point: { x, y }, clipped: Math.abs(x - point.x) > tolerance || Math.abs(y - point.y) > tolerance }
}
