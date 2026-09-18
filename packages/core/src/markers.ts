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
import type { MarkerConfig, MarkerShape } from './types'

const SVG_NS = 'http://www.w3.org/2000/svg'
const CENTER = MARKER_VIEWBOX / 2

export interface ResolvedMarker {
  shape?: MarkerShape
  size: number
  color: string
  strokeColor?: string
  strokeWidth: number
  className?: string
  svg?: string
  orient: VLOrientEnum.AUTO | VLOrientEnum.FIXED
}

/** Instance-wide default marker size per built-in shape — see `VisualLinkerOptions.defaultXxxMarkerSize`. */
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
    case VLMarkerShapeEnum.ARROW:
      return sizeDefaults.arrow ?? DEFAULT_ARROW_MARKER_SIZE
    case VLMarkerShapeEnum.SQUARE:
      return sizeDefaults.square ?? DEFAULT_SQUARE_MARKER_SIZE
    case VLMarkerShapeEnum.DIAMOND:
      return sizeDefaults.diamond ?? DEFAULT_DIAMOND_MARKER_SIZE
    default:
      return sizeDefaults.circle ?? DEFAULT_CIRCLE_MARKER_SIZE
  }
}

export function resolveMarkerConfig(
  input: MarkerShape | MarkerConfig | false | undefined,
  fallbackColor: string,
  sizeDefaults: MarkerSizeDefaults = {},
): ResolvedMarker | null {
  if (!input) return null
  const config: MarkerConfig = typeof input === 'string' ? { shape: input } : input
  const shape = config.svg ? undefined : (config.shape ?? VLMarkerShapeEnum.CIRCLE)
  return {
    shape,
    size: config.size ?? defaultMarkerSize(shape, sizeDefaults),
    color: config.color ?? fallbackColor,
    strokeColor: config.strokeColor,
    strokeWidth: config.strokeWidth ?? DEFAULT_MARKER_STROKE_WIDTH,
    className: config.className,
    svg: config.svg,
    orient: config.orient ?? (shape === VLMarkerShapeEnum.ARROW ? VLOrientEnum.AUTO : VLOrientEnum.FIXED),
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
    marker.className ?? '',
    marker.svg ?? '',
    marker.orient,
  ].join('|')
}

/**
 * An open chevron drawn from two line segments meeting at the tip — the
 * classic ">" arrowhead built out of strokes, not a filled polygon. Matches
 * how the reference mockup draws it: same visual language as the connector
 * line itself (a stroke with round caps/joins), just two short segments.
 * `ARROW_ARM_LENGTH`/`ARROW_HALF_SPAN` set the tip's opening angle.
 */
function arrowPath(): string {
  const tipX = MARKER_VIEWBOX - ARROW_TIP_INSET
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
    case VLMarkerShapeEnum.CIRCLE:
      return `<circle cx="${CENTER}" cy="${CENTER}" r="${CIRCLE_MARKER_RADIUS}" ${fill} ${stroke} />`
    case VLMarkerShapeEnum.SQUARE: {
      const size = MARKER_VIEWBOX - SQUARE_MARKER_INSET * 2
      return `<rect x="${SQUARE_MARKER_INSET}" y="${SQUARE_MARKER_INSET}" width="${size}" height="${size}" ${fill} ${stroke} />`
    }
    case VLMarkerShapeEnum.DIAMOND: {
      const far = MARKER_VIEWBOX - DIAMOND_MARKER_INSET
      return `<polygon points="${CENTER},${DIAMOND_MARKER_INSET} ${far},${CENTER} ${CENTER},${far} ${DIAMOND_MARKER_INSET},${CENTER}" ${fill} ${stroke} />`
    }
    case VLMarkerShapeEnum.ARROW:
      // Already an open, stroked chevron with no fill — `strokeColor` doesn't
      // apply here, `color` already IS its one stroke.
      return `<path d="${arrowPath()}" fill="none" stroke="${color}" stroke-width="${ARROW_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" />`
  }
}

/** Builds a reusable `<marker>` def. `refX` sits near the arrow's tip so it lands exactly on the path's endpoint; other shapes center on it. */
export function createMarkerElement(id: string, position: 'start' | 'end', marker: ResolvedMarker): SVGMarkerElement {
  const el = document.createElementNS(SVG_NS, 'marker')
  el.setAttribute('id', id)
  el.setAttribute('viewBox', `0 0 ${MARKER_VIEWBOX} ${MARKER_VIEWBOX}`)
  el.setAttribute('markerWidth', String(marker.size))
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
  el.innerHTML =
    marker.svg ??
    builtinShapeMarkup(marker.shape ?? VLMarkerShapeEnum.CIRCLE, marker.color, marker.strokeColor, marker.strokeWidth)
  return el
}
