import { angleDeg, type Point } from './geometry'
import { LABEL_END_INSET } from './params'
import type { ConnectionLabel, LabelLayout } from './types'

export function polylineLength(points: readonly Point[]): number {
  let length = 0
  for (let i = 1; i < points.length; i++)
    length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y)
  return length
}

/** The point `distance` px along the polyline (clamped to its ends) and the direction of travel there, in degrees. */
export function samplePolyline(points: readonly Point[], distance: number): { point: Point; angle: number } {
  if (points.length === 0) return { point: { x: 0, y: 0 }, angle: 0 }
  if (points.length === 1) return { point: points[0]!, angle: 0 }

  let remaining = Math.max(0, distance)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const isLast = i === points.length - 1
    // Zero-length segments are skipped (no direction) unless nothing else is left.
    if (length > 0 && (remaining <= length || isLast)) {
      const t = Math.min(remaining / length, 1)
      return {
        point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        angle: angleDeg({ x: b.x - a.x, y: b.y - a.y }),
      }
    }
    remaining -= length
  }
  return { point: points[points.length - 1]!, angle: 0 }
}

/** Where along a path of `length` a label position falls, as a distance from its start. */
export function labelDistance(position: ConnectionLabel['position'], length: number): number {
  const inset = Math.min(LABEL_END_INSET, length / 2)
  if (position === 'start') return inset
  if (position === 'end') return length - inset
  if (position === 'middle') return length / 2
  return Math.min(Math.max(position, 0), 1) * length
}

/** Flips an angle that would put text upside down, so a rotated label always reads left-to-right. */
export function uprightRotation(angle: number): number {
  const normalized = ((((angle + 180) % 360) + 360) % 360) - 180
  if (normalized > 90) return normalized - 180
  if (normalized < -90) return normalized + 180
  return normalized
}

/** Resolves a label's position along a path (given as a polyline) into where to draw it. */
export function layoutLabel(label: ConnectionLabel, points: readonly Point[]): LabelLayout {
  const { point, angle } = samplePolyline(points, labelDistance(label.position, polylineLength(points)))
  const offset = label.offset ?? 0
  const radians = (angle * Math.PI) / 180
  return {
    id: label.id,
    // The normal to the right of the direction of travel (down, on a rightward line).
    point: { x: point.x - Math.sin(radians) * offset, y: point.y + Math.cos(radians) * offset },
    angle,
    rotation: label.rotate ? uprightRotation(angle) : 0,
    text: label.text,
    className: label.className,
  }
}
