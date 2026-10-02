import {
  ARROW_ARM_LENGTH,
  ARROW_HALF_SPAN,
  ARROW_STROKE_WIDTH,
  ARROW_TIP_INSET,
  CIRCLE_MARKER_RADIUS,
  DEFAULT_ARROW_MARKER_SIZE,
  DEFAULT_CIRCLE_MARKER_SIZE,
  DEFAULT_DIAMOND_MARKER_SIZE,
  DEFAULT_MARKER_STROKE_WIDTH,
  DEFAULT_SQUARE_MARKER_SIZE,
  DIAMOND_MARKER_INSET,
  MARKER_VIEWBOX,
  SQUARE_MARKER_INSET,
} from './params'
import { VLMarkerShapeEnum, VLOrientEnum } from './enums'
import type { MarkerShape, MarkerStyle } from './types'

const SVG_NS = 'http://www.w3.org/2000/svg'
const CENTER = MARKER_VIEWBOX / 2

export interface ResolvedMarker {
  shape?: MarkerShape
  size: number
  color: string
  strokeColor?: string
  strokeWidth: number
  opacity?: number
  className?: string
  svg?: string
  orient: `${VLOrientEnum.AUTO | VLOrientEnum.FIXED}`
  arrow?: { color: string; gap: number }
}

/** Instance-wide default marker size per built-in shape — see `VisualLinkerConfig.markers.sizes`. */
export interface MarkerSizeDefaults {
  circle?: number
  square?: number
  diamond?: number
  arrow?: number
}

/**
 * Default size in multiples of the connection's *current* stroke width
 * (`markerUnits="strokeWidth"`, set in `createMarkerElement`) rather than a
 * flat px constant: the marker then scales up on its own — no JS involved —
 * whenever the stroke gets thicker, including the `.vl-connection--active`
 * hover highlight. A fixed px size would freeze the arrow at its resting size
 * while the highlighted line grows past it, making it look broken.
 */
function defaultMarkerSize(shape: MarkerShape | undefined, sizeDefaults: MarkerSizeDefaults): number {
  switch (shape) {
    case 'arrow':
      return sizeDefaults.arrow ?? DEFAULT_ARROW_MARKER_SIZE
    case 'square':
      return sizeDefaults.square ?? DEFAULT_SQUARE_MARKER_SIZE
    case 'diamond':
      return sizeDefaults.diamond ?? DEFAULT_DIAMOND_MARKER_SIZE
    default:
      return sizeDefaults.circle ?? DEFAULT_CIRCLE_MARKER_SIZE
  }
}

export function resolveMarkerConfig(
  input: MarkerShape | MarkerStyle | false | undefined,
  fallbackColor: string,
  sizeDefaults: MarkerSizeDefaults = {},
  fallbackOpacity?: number,
): ResolvedMarker | null {
  if (!input) return null
  const config: MarkerStyle = typeof input === 'string' ? { shape: input } : input
  const shape = config.svg ? undefined : (config.shape ?? VLMarkerShapeEnum.CIRCLE)
  const arrowConfig = config.arrow === true ? {} : config.arrow || undefined
  const arrow =
    arrowConfig && shape !== VLMarkerShapeEnum.ARROW
      ? { color: arrowConfig.color ?? fallbackColor, gap: arrowConfig.gap ?? 0 }
      : undefined
  return {
    shape,
    size: config.size ?? defaultMarkerSize(shape, sizeDefaults),
    color: config.color ?? fallbackColor,
    strokeColor: config.strokeColor,
    strokeWidth: config.strokeWidth ?? DEFAULT_MARKER_STROKE_WIDTH,
    opacity: config.opacity ?? fallbackOpacity,
    className: config.className,
    svg: config.svg,
    // The arrow has to follow the line, so a shape carrying one rotates with it too.
    orient: arrow
      ? VLOrientEnum.AUTO
      : (config.orient ?? (shape === VLMarkerShapeEnum.ARROW ? VLOrientEnum.AUTO : VLOrientEnum.FIXED)),
    arrow,
  }
}

/** Cache key for def reuse — connections with identical marker configs share one `<marker>`. */
export function markerSignature(position: 'start' | 'end', marker: ResolvedMarker): string {
  return [
    position,
    marker.shape ?? '',
    marker.size,
    marker.color,
    marker.strokeColor ?? '',
    marker.strokeWidth,
    marker.opacity ?? '',
    marker.className ?? '',
    marker.svg ?? '',
    marker.orient,
    marker.arrow ? `${marker.arrow.color}:${marker.arrow.gap}` : '',
  ].join('|')
}

/**
 * An open chevron drawn from two line segments meeting at the tip — the
 * classic ">" arrowhead built out of strokes, not a filled polygon. Matches
 * how the reference mockup draws it: same visual language as the connector
 * line itself (a stroke with round caps/joins), just two short segments.
 * `ARROW_ARM_LENGTH`/`ARROW_HALF_SPAN` set the tip's opening angle.
 */
function arrowPath(tipX = MARKER_VIEWBOX - ARROW_TIP_INSET): string {
  const backX = tipX - ARROW_ARM_LENGTH
  return `M ${backX} ${CENTER - ARROW_HALF_SPAN} L ${tipX} ${CENTER} L ${backX} ${CENTER + ARROW_HALF_SPAN}`
}

/** `stroke`/`stroke-width` attributes for a filled shape's outline — omitted entirely when no `strokeColor` was given, matching the existing no-outline default. */
function strokeAttrs(strokeColor: string | undefined, strokeWidth: number): string {
  return strokeColor ? `stroke="${strokeColor}" stroke-width="${strokeWidth}"` : ''
}

function builtinShapeMarkup(
  shape: MarkerShape,
  color: string,
  strokeColor: string | undefined,
  strokeWidth: number,
): string {
  const fill = `fill="${color}"`
  const stroke = strokeAttrs(strokeColor, strokeWidth)
  switch (shape) {
    case 'circle':
      return `<circle cx="${CENTER}" cy="${CENTER}" r="${CIRCLE_MARKER_RADIUS}" ${fill} ${stroke} />`
    case 'square': {
      const size = MARKER_VIEWBOX - SQUARE_MARKER_INSET * 2
      return `<rect x="${SQUARE_MARKER_INSET}" y="${SQUARE_MARKER_INSET}" width="${size}" height="${size}" ${fill} ${stroke} />`
    }
    case 'diamond': {
      const far = MARKER_VIEWBOX - DIAMOND_MARKER_INSET
      return `<polygon points="${CENTER},${DIAMOND_MARKER_INSET} ${far},${CENTER} ${CENTER},${far} ${DIAMOND_MARKER_INSET},${CENTER}" ${fill} ${stroke} />`
    }
    case 'arrow':
      // Already an open, stroked chevron with no fill — `strokeColor` doesn't
      // apply here, `color` already IS its one stroke.
      return arrowMarkup(MARKER_VIEWBOX - ARROW_TIP_INSET, color)
  }
}

function arrowMarkup(tipX: number, color: string): string {
  return `<path d="${arrowPath(tipX)}" fill="none" stroke="${color}" stroke-width="${ARROW_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" />`
}

/** Distance from the marker's center to its shape's outer edge along +x, outline included — where an attached arrow's tip should land. */
export function shapeEdgeDistance(marker: ResolvedMarker): number {
  if (marker.svg || !marker.shape) return 0
  const halfStroke = marker.strokeColor ? marker.strokeWidth / 2 : 0
  switch (marker.shape) {
    case 'circle':
      return CIRCLE_MARKER_RADIUS + halfStroke
    case 'square':
      return CENTER - SQUARE_MARKER_INSET + halfStroke
    case 'diamond':
      // A 90° vertex: a mitered outline sticks out by halfStroke·√2 there.
      return CENTER - DIAMOND_MARKER_INSET + halfStroke * Math.SQRT2
    default:
      return 0
  }
}

/**
 * Geometric tip x of an attached arrow — inset by half the arrow's own stroke
 * so its rounded tip (not the path's centerline) is what touches the edge.
 * The line reaches the marker from -x in both positions: `auto` at the end,
 * and `auto-start-reverse` at the start, which flips +x to point out of the line.
 */
export function attachedArrowTipX(marker: ResolvedMarker): number {
  return CENTER - shapeEdgeDistance(marker) - (marker.arrow?.gap ?? 0) - ARROW_STROKE_WIDTH / 2
}

/** Builds a reusable `<marker>` def. `refX` sits near the arrow's tip so it lands exactly on the path's endpoint; other shapes center on it. */
export function createMarkerElement(id: string, position: 'start' | 'end', marker: ResolvedMarker): SVGMarkerElement {
  const el = document.createElementNS(SVG_NS, 'marker')
  el.setAttribute('id', id)
  // A marker clips to its own viewport, so an attached arrow widens the
  // viewBox leftward to fit it — and markerWidth grows by the same ratio, so
  // one viewBox unit keeps the same on-screen size as in a plain marker.
  const arrowTipX = marker.arrow ? attachedArrowTipX(marker) : undefined
  const minX = arrowTipX === undefined ? 0 : Math.min(0, Math.floor(arrowTipX - ARROW_ARM_LENGTH - ARROW_STROKE_WIDTH))
  const viewWidth = MARKER_VIEWBOX - minX
  el.setAttribute('viewBox', `${minX} 0 ${viewWidth} ${MARKER_VIEWBOX}`)
  el.setAttribute('markerWidth', String((marker.size * viewWidth) / MARKER_VIEWBOX))
  el.setAttribute('markerHeight', String(marker.size))
  el.setAttribute('markerUnits', 'strokeWidth')
  el.setAttribute(
    'refX',
    marker.shape === VLMarkerShapeEnum.ARROW ? String(MARKER_VIEWBOX - ARROW_TIP_INSET) : String(CENTER),
  )
  el.setAttribute('refY', String(CENTER))
  el.setAttribute(
    'orient',
    marker.orient === VLOrientEnum.AUTO ? (position === 'start' ? 'auto-start-reverse' : 'auto') : '0',
  )
  if (marker.className) el.classList.add(marker.className)
  const shapeMarkup =
    marker.svg ??
    builtinShapeMarkup(marker.shape ?? VLMarkerShapeEnum.CIRCLE, marker.color, marker.strokeColor, marker.strokeWidth)
  const markup =
    marker.arrow && arrowTipX !== undefined ? arrowMarkup(arrowTipX, marker.arrow.color) + shapeMarkup : shapeMarkup
  el.innerHTML =
    marker.opacity !== undefined && marker.opacity < 1 ? `<g opacity="${marker.opacity}">${markup}</g>` : markup
  return el
}
