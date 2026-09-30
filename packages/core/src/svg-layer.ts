import type { ConnectionStyle } from './types'
import type { Point } from './geometry'
import { createMarkerElement, markerSignature, resolveMarkerConfig, type MarkerSizeDefaults } from './markers'
import {
  ACTIVE_LINE_WIDTH_BUMP,
  DASH_PATTERN,
  DEFAULT_LINE_COLOR,
  DEFAULT_LINE_WIDTH,
  DEFAULT_PORT_FILL,
  DEFAULT_PORT_RADIUS,
  DEFAULT_PORT_STROKE_COLOR,
  DEFAULT_PORT_STROKE_WIDTH,
  HIT_AREA_STROKE_WIDTH,
} from './params'

const SVG_NS = 'http://www.w3.org/2000/svg'

// Module-level (not per-instance) so marker ids stay unique across every
// `<VisualLinker>`/`createVisualLinker()` instance mounted on the same page —
// an SVG `id` is global to the whole document, and `url(#id)` resolves to
// whichever element happens to have that id first in document order. Without
// this, every instance's own marker counter restarts at 0, so a page with
// several diagrams ends up with multiple `id="vl-marker-0"` elements, and
// every connection referencing "its own" vl-marker-0 actually renders
// whichever instance's marker happened to land first in the DOM.
let svgLayerInstanceCounter = 0

export interface SvgPathInput {
  id: string
  d: string
  style?: ConnectionStyle
  /** Physical endpoint identity (block + rounded point) — connections sharing one hide their marker there while another is highlighted. */
  fromKey?: string
  toKey?: string
}

export interface SvgPortInput {
  key: string
  point: Point
}

export interface SvgLayerHandlers {
  onConnectionClick?: (id: string, event: PointerEvent) => void
  onConnectionEnter?: (id: string, event: PointerEvent) => void
  onConnectionLeave?: (id: string, event: PointerEvent) => void
}

/** Instance-wide look for the built-in port dot — see `VisualLinkerOptions.defaultPortXxx`. Each field left unset keeps that CSS variable's own params.ts-sourced fallback, so plain external CSS overrides still work undisturbed. */
export interface DefaultPortStyle {
  radius?: number
  color?: string
  strokeColor?: string
  strokeWidth?: number
}

// One shared default look via CSS variables, so consumers can restyle every
// connection/port from the outside without fighting inline-style specificity —
// per-connection ConnectionStyle overrides below are set inline instead,
// since those are an explicit request to differ from the shared default.
// Also covers the drag cursor for .vl-draggable/.vl-dragging: a <style>
// element applies document-wide regardless of where it sits in the DOM, so
// this reaches the plain HTML block wrappers outside the svg too.
const DEFAULT_STYLE = `
  .vl-connection { fill: none; stroke: var(--vl-line-color, ${DEFAULT_LINE_COLOR}); stroke-width: var(--vl-line-width, ${DEFAULT_LINE_WIDTH}); }
  .vl-connection--active { stroke: var(--vl-line-color-active, var(--vl-line-color, ${DEFAULT_LINE_COLOR})); stroke-width: calc(var(--vl-line-width, ${DEFAULT_LINE_WIDTH}) + ${ACTIVE_LINE_WIDTH_BUMP}); }
  .vl-connection-hit { fill: none; stroke: transparent; stroke-width: ${HIT_AREA_STROKE_WIDTH}; pointer-events: stroke; cursor: pointer; }
  .vl-port { fill: var(--vl-port-fill, ${DEFAULT_PORT_FILL}); stroke: var(--vl-port-stroke-color, ${DEFAULT_PORT_STROKE_COLOR}); stroke-width: var(--vl-port-stroke-width, ${DEFAULT_PORT_STROKE_WIDTH}); r: var(--vl-port-radius, ${DEFAULT_PORT_RADIUS}); }
  .vl-draggable { cursor: grab; }
  .vl-dragging { cursor: grabbing; }
`

export function createSvgLayer(
  container: HTMLElement,
  handlers: SvgLayerHandlers = {},
  defaultPortStyle: DefaultPortStyle = {},
  markerSizeDefaults: MarkerSizeDefaults = {},
) {
  const instanceId = svgLayerInstanceCounter++

  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative'
  }

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'vl-svg')
  svg.style.position = 'absolute'
  svg.style.inset = '0'
  svg.style.overflow = 'visible'
  svg.style.pointerEvents = 'none'
  // Only ever set when the caller actually passed a value — leaving a field
  // unset here means the CSS variable's own fallback (above) still applies,
  // so restyling everything via a plain external stylesheet keeps working.
  if (defaultPortStyle.radius != null) svg.style.setProperty('--vl-port-radius', String(defaultPortStyle.radius))
  if (defaultPortStyle.color != null) svg.style.setProperty('--vl-port-fill', defaultPortStyle.color)
  if (defaultPortStyle.strokeColor != null)
    svg.style.setProperty('--vl-port-stroke-color', defaultPortStyle.strokeColor)
  if (defaultPortStyle.strokeWidth != null)
    svg.style.setProperty('--vl-port-stroke-width', String(defaultPortStyle.strokeWidth))

  const style = document.createElementNS(SVG_NS, 'style')
  style.textContent = DEFAULT_STYLE
  svg.appendChild(style)

  const defs = document.createElementNS(SVG_NS, 'defs')
  svg.appendChild(defs)
  container.appendChild(svg)

  const paths = new Map<string, SVGPathElement>()
  const hits = new Map<string, SVGPathElement>()
  const ports = new Map<string, SVGCircleElement>()
  const markerDefs = new Map<string, SVGMarkerElement>()
  const styles = new Map<string, ConnectionStyle | undefined>()
  const endpointKeys = new Map<string, { from?: string; to?: string }>()
  let markerIdCounter = 0
  let usedMarkerSignatures = new Set<string>()
  // Preserved across update() calls so a connection stays highlighted through
  // a data refresh (e.g. dragging a block shouldn't un-highlight a hovered edge).
  let activeIds = new Set<string>()

  /** Returns the id of a `<marker>` def matching this config, creating (and caching) one if needed. */
  function ensureMarker(
    position: 'start' | 'end',
    config: ConnectionStyle['startMarker'],
    fallbackColor: string,
  ): string | null {
    const resolved = resolveMarkerConfig(config, fallbackColor, markerSizeDefaults)
    if (!resolved) return null
    const signature = markerSignature(position, resolved)
    usedMarkerSignatures.add(signature)
    let el = markerDefs.get(signature)
    if (!el) {
      el = createMarkerElement(`vl-marker-${instanceId}-${markerIdCounter++}`, position, resolved)
      defs.appendChild(el)
      markerDefs.set(signature, el)
    }
    return el.id
  }

  /** Overrides a marker config's `size` while hovered — a no-op for `false`/unset config or an unset `markerSize`, so it never turns a bare/hidden endpoint into a marker. */
  function withHoverMarkerSize(
    config: ConnectionStyle['startMarker'],
    markerSize: number | undefined,
  ): ConnectionStyle['startMarker'] {
    if (markerSize == null || !config) return config
    const base = typeof config === 'string' ? { shape: config } : config
    return { ...base, size: markerSize }
  }

  /**
   * Applies a connection's resting or hover appearance. Without an explicit
   * `hoverStyle`, `active` only toggles the `.vl-connection--active` class —
   * the CSS-driven width bump — leaving stroke/marker color untouched, exactly
   * as before this existed. With `hoverStyle`, each given field (color/width/
   * dashed/markerSize) overrides the base value while active, and the markers
   * are recolored to match so the arrow doesn't fall out of sync with the line.
   */
  function applyConnectionAppearance(
    el: SVGPathElement,
    style: ConnectionStyle | undefined,
    active: boolean,
    hidden: { start: boolean; end: boolean },
  ) {
    const hover = active ? style?.hoverStyle : undefined
    const color = hover?.color ?? style?.color
    // An explicit `width` is set inline, which outranks the class's CSS width
    // bump — so apply the same bump inline too, or the highlight would vanish.
    const width = hover?.width ?? (active && style?.width != null ? style.width + ACTIVE_LINE_WIDTH_BUMP : style?.width)
    const dashed = hover?.dashed ?? style?.dashed

    el.style.stroke = color ?? ''
    el.style.strokeWidth = width != null ? String(width) : ''
    el.style.strokeDasharray = dashed ? DASH_PATTERN : ''

    const startMarkerId = ensureMarker(
      'start',
      withHoverMarkerSize(style?.startMarker, hover?.markerSize),
      color ?? DEFAULT_LINE_COLOR,
    )
    const endMarkerId = ensureMarker(
      'end',
      withHoverMarkerSize(style?.endMarker, hover?.markerSize),
      color ?? DEFAULT_LINE_COLOR,
    )
    el.style.markerStart = startMarkerId && !hidden.start ? `url(#${startMarkerId})` : ''
    el.style.markerEnd = endMarkerId && !hidden.end ? `url(#${endMarkerId})` : ''
  }

  function activeEndpointKeys(): Set<string> {
    const keys = new Set<string>()
    for (const id of activeIds) {
      const endpoints = endpointKeys.get(id)
      if (endpoints?.from) keys.add(endpoints.from)
      if (endpoints?.to) keys.add(endpoints.to)
    }
    return keys
  }

  /**
   * A non-highlighted connection hides its marker on any end that sits on the
   * same point as a highlighted connection's end — otherwise its resting-size
   * marker would overlap the highlighted (and possibly enlarged) one there.
   * Only the markers go; the line itself stays.
   */
  function hiddenEnds(id: string, active: boolean, activeKeys: Set<string>) {
    const endpoints = endpointKeys.get(id)
    return {
      start: !active && Boolean(endpoints?.from && activeKeys.has(endpoints.from)),
      end: !active && Boolean(endpoints?.to && activeKeys.has(endpoints.to)),
    }
  }

  /** Paints highlighted connections last (but still under the port dots), so a sibling's line never crosses over an enlarged marker. */
  function raiseActivePaths() {
    const firstPort = svg.querySelector('.vl-port')
    for (const id of activeIds) {
      const el = paths.get(id)
      if (el) svg.insertBefore(el, firstPort)
    }
  }

  function resize(width: number, height: number) {
    svg.setAttribute('width', String(width))
    svg.setAttribute('height', String(height))
  }

  function update(nextPaths: SvgPathInput[], nextPorts: SvgPortInput[]) {
    usedMarkerSignatures = new Set<string>()
    const nextPathIds = new Set(nextPaths.map((path) => path.id))
    for (const [id, el] of paths) {
      if (!nextPathIds.has(id)) {
        el.remove()
        paths.delete(id)
        hits.get(id)?.remove()
        hits.delete(id)
        styles.delete(id)
        endpointKeys.delete(id)
      }
    }
    for (const input of nextPaths) endpointKeys.set(input.id, { from: input.fromKey, to: input.toKey })
    const activeKeys = activeEndpointKeys()
    for (const input of nextPaths) {
      let el = paths.get(input.id)
      if (!el) {
        el = document.createElementNS(SVG_NS, 'path')
        el.setAttribute('class', 'vl-connection')
        svg.appendChild(el)
        paths.set(input.id, el)

        const hit = document.createElementNS(SVG_NS, 'path')
        hit.setAttribute('class', 'vl-connection-hit')
        hit.addEventListener('pointerenter', (event) => handlers.onConnectionEnter?.(input.id, event))
        hit.addEventListener('pointerleave', (event) => handlers.onConnectionLeave?.(input.id, event))
        hit.addEventListener('click', (event) =>
          handlers.onConnectionClick?.(input.id, event as unknown as PointerEvent),
        )
        svg.appendChild(hit)
        hits.set(input.id, hit)
      }
      el.setAttribute('d', input.d)
      el.classList.toggle('vl-connection--active', activeIds.has(input.id))
      styles.set(input.id, input.style)
      const active = activeIds.has(input.id)
      applyConnectionAppearance(el, input.style, active, hiddenEnds(input.id, active, activeKeys))

      hits.get(input.id)?.setAttribute('d', input.d)
    }
    raiseActivePaths()

    for (const [signature, el] of markerDefs) {
      if (!usedMarkerSignatures.has(signature)) {
        el.remove()
        markerDefs.delete(signature)
      }
    }

    const nextPortKeys = new Set(nextPorts.map((port) => port.key))
    for (const [key, el] of ports) {
      if (!nextPortKeys.has(key)) {
        el.remove()
        ports.delete(key)
      }
    }
    for (const input of nextPorts) {
      let el = ports.get(input.key)
      if (!el) {
        el = document.createElementNS(SVG_NS, 'circle')
        el.setAttribute('class', 'vl-port')
        svg.appendChild(el)
        ports.set(input.key, el)
      }
      el.setAttribute('cx', String(input.point.x))
      el.setAttribute('cy', String(input.point.y))
    }
  }

  /** Toggles the `.vl-connection--active` highlight (plus each connection's own `hoverStyle`, if any) on exactly the given connection ids. */
  function setActiveConnections(ids: Iterable<string>) {
    activeIds = new Set(ids)
    const activeKeys = activeEndpointKeys()
    for (const [id, el] of paths) {
      const active = activeIds.has(id)
      el.classList.toggle('vl-connection--active', active)
      applyConnectionAppearance(el, styles.get(id), active, hiddenEnds(id, active, activeKeys))
    }
    raiseActivePaths()
  }

  function destroy() {
    svg.remove()
    paths.clear()
    hits.clear()
    ports.clear()
    markerDefs.clear()
    styles.clear()
    endpointKeys.clear()
  }

  return { resize, update, setActiveConnections, destroy }
}
