import type { ConnectionFlow, ConnectionStyle } from './types'
import { flowStrokeWidth, resolveFlow } from './flow'
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
  DEFAULT_SELECTION_COLOR,
  FLOW_TINT_BASE_OPACITY,
  FLOW_TINT_BASE_OPACITY_ACTIVE,
  HIT_AREA_STROKE_WIDTH,
  LABEL_FALLBACK_CHAR_WIDTH,
  LABEL_FONT_SIZE,
  LABEL_PADDING_X,
  LABEL_PADDING_Y,
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
  /** An end pulled to a clipping ancestor's edge — its marker is not drawn (the real port is out of view). */
  fromClipped?: boolean
  toClipped?: boolean
  /** Accessible name of the connection (see `ConnectionDescriptor.ariaLabel`). */
  ariaLabel?: string
}

/** A library-drawn text label (an SVG pill), already positioned. */
export interface SvgLabelInput {
  /** `{connectionId}:{labelId}` */
  key: string
  point: Point
  rotation: number
  text: string
  className?: string
}

export interface SvgPortInput {
  key: string
  point: Point
}

export interface SvgLayerHandlers {
  onConnectionClick?: (id: string, event: PointerEvent) => void
  onConnectionEnter?: (id: string, event: PointerEvent) => void
  onConnectionLeave?: (id: string, event: PointerEvent) => void
  onConnectionKeydown?: (id: string, event: KeyboardEvent) => void
}

export interface SvgLayerBehavior {
  /** Connections become keyboard-focusable buttons (and can show a selected state). */
  selectable?: boolean
  /** Instance-wide default for `ConnectionStyle.animated`. */
  defaultAnimated?: boolean | ConnectionFlow
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
  .vl-connection--active, .vl-connection--selected { stroke: var(--vl-line-color-active, var(--vl-line-color, ${DEFAULT_LINE_COLOR})); stroke-width: calc(var(--vl-line-width, ${DEFAULT_LINE_WIDTH}) + ${ACTIVE_LINE_WIDTH_BUMP}); }
  .vl-connection--selected { filter: drop-shadow(0 0 3px var(--vl-selected-color, ${DEFAULT_SELECTION_COLOR})); }
  .vl-connection--focus { filter: drop-shadow(0 0 3px var(--vl-focus-color, ${DEFAULT_SELECTION_COLOR})); }
  .vl-label { pointer-events: none; }
  .vl-label-bg { fill: var(--vl-label-bg, #fff); stroke: var(--vl-label-border, var(--vl-line-color, ${DEFAULT_LINE_COLOR})); stroke-width: 1; }
  .vl-label-text { fill: var(--vl-label-color, #1c1e2b); font: ${LABEL_FONT_SIZE}px/1 system-ui, sans-serif; text-anchor: middle; dominant-baseline: central; }
  .vl-flow--tint { stroke: var(--vl-line-color, ${DEFAULT_LINE_COLOR}); }
  .vl-flow { fill: none; pointer-events: none; stroke-linecap: round; animation-timing-function: linear; animation-iteration-count: infinite; }
  @keyframes vl-flow-forward { to { stroke-dashoffset: calc(var(--vl-flow-period) * -1); } }
  @keyframes vl-flow-backward { to { stroke-dashoffset: var(--vl-flow-period); } }
  @media (prefers-reduced-motion: reduce) { .vl-flow { animation-name: none !important; } }
  .vl-connection-hit { fill: none; stroke: transparent; stroke-width: ${HIT_AREA_STROKE_WIDTH}; pointer-events: stroke; cursor: pointer; outline: none; }
  .vl-port { fill: var(--vl-port-fill, ${DEFAULT_PORT_FILL}); stroke: var(--vl-port-stroke-color, ${DEFAULT_PORT_STROKE_COLOR}); stroke-width: var(--vl-port-stroke-width, ${DEFAULT_PORT_STROKE_WIDTH}); r: var(--vl-port-radius, ${DEFAULT_PORT_RADIUS}); }
  .vl-draggable { cursor: grab; }
  .vl-dragging { cursor: grabbing; }
`

export function createSvgLayer(
  container: HTMLElement,
  handlers: SvgLayerHandlers = {},
  defaultPortStyle: DefaultPortStyle = {},
  markerSizeDefaults: MarkerSizeDefaults = {},
  behavior: SvgLayerBehavior = {},
) {
  const instanceId = svgLayerInstanceCounter++
  const selectable = behavior.selectable ?? false
  const defaultAnimated = behavior.defaultAnimated

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
  // Library-drawn labels live in a group that stays the last child, so every
  // path / hit area / port dot — created now or later, raised or not — is
  // painted underneath them.
  const labelsLayer = document.createElementNS(SVG_NS, 'g')
  labelsLayer.setAttribute('class', 'vl-labels')
  svg.appendChild(labelsLayer)
  container.appendChild(svg)

  const paths = new Map<string, SVGPathElement>()
  const hits = new Map<string, SVGPathElement>()
  // The animated-flow overlay of each animated connection, kept right after its line.
  const flows = new Map<string, SVGPathElement>()
  const labelEls = new Map<string, SVGGElement>()
  const ports = new Map<string, SVGCircleElement>()
  const markerDefs = new Map<string, SVGMarkerElement>()
  const styles = new Map<string, ConnectionStyle | undefined>()
  const endpointKeys = new Map<string, { from?: string; to?: string; fromClipped?: boolean; toClipped?: boolean }>()
  let markerIdCounter = 0
  let usedMarkerSignatures = new Set<string>()
  // Preserved across update() calls so a connection stays highlighted through
  // a data refresh (e.g. dragging a block shouldn't un-highlight a hovered edge).
  let activeIds = new Set<string>()
  let selectedIds = new Set<string>()

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
    id: string,
    el: SVGPathElement,
    style: ConnectionStyle | undefined,
    active: boolean,
    selected: boolean,
    hidden: { start: boolean; end: boolean },
  ) {
    // Layers, later wins: base style < selectedStyle < hoverStyle.
    const hover = active ? style?.hoverStyle : undefined
    const pick = selected ? style?.selectedStyle : undefined
    const color = hover?.color ?? pick?.color ?? style?.color
    // An explicit `width` is set inline, which outranks the class's CSS width
    // bump — so apply the same bump inline too, or the highlight would vanish.
    const width =
      hover?.width ??
      pick?.width ??
      ((active || selected) && style?.width != null ? style.width + ACTIVE_LINE_WIDTH_BUMP : style?.width)
    const dashed = hover?.dashed ?? pick?.dashed ?? style?.dashed
    const markerSize = hover?.markerSize ?? pick?.markerSize

    el.style.stroke = color ?? ''
    el.style.strokeWidth = width != null ? String(width) : ''
    el.style.strokeDasharray = dashed ? DASH_PATTERN : ''

    const startMarkerId = ensureMarker(
      'start',
      withHoverMarkerSize(style?.startMarker, markerSize),
      color ?? DEFAULT_LINE_COLOR,
    )
    const endMarkerId = ensureMarker(
      'end',
      withHoverMarkerSize(style?.endMarker, markerSize),
      color ?? DEFAULT_LINE_COLOR,
    )
    el.style.markerStart = startMarkerId && !hidden.start ? `url(#${startMarkerId})` : ''
    el.style.markerEnd = endMarkerId && !hidden.end ? `url(#${endMarkerId})` : ''

    applyFlow(id, el, style, width, color, active || selected)
  }

  /** Creates, updates or removes the animated-flow overlay that rides on a connection's line. */
  function applyFlow(
    id: string,
    el: SVGPathElement,
    style: ConnectionStyle | undefined,
    lineWidth: number | undefined,
    lineColor: string | undefined,
    emphasised: boolean,
  ) {
    const flow = resolveFlow(style?.animated, defaultAnimated)
    let overlay = flows.get(id)
    if (!flow) {
      overlay?.remove()
      flows.delete(id)
      el.style.strokeOpacity = ''
      return
    }
    if (!overlay) {
      overlay = document.createElementNS(SVG_NS, 'path')
      overlay.setAttribute('class', 'vl-flow')
      overlay.setAttribute('aria-hidden', 'true')
      flows.set(id, overlay)
    }
    if (overlay.previousElementSibling !== el) svg.insertBefore(overlay, el.nextSibling)

    const period = flow.dash + flow.gap
    overlay.setAttribute('d', el.getAttribute('d') ?? '')
    overlay.style.setProperty('--vl-flow-period', `${period}px`)
    // Tint mode: the pattern wears the line's color (the CSS class for a
    // line using the shared variable, inline for an explicit/hover color) and
    // the line itself is dimmed, so the moving part is what you see.
    const tint = flow.color === undefined
    overlay.classList.toggle('vl-flow--tint', tint)
    overlay.style.stroke = flow.color ?? lineColor ?? ''
    el.style.strokeOpacity = tint ? String(emphasised ? FLOW_TINT_BASE_OPACITY_ACTIVE : FLOW_TINT_BASE_OPACITY) : ''
    overlay.style.strokeWidth = String(flowStrokeWidth(flow, lineWidth ?? DEFAULT_LINE_WIDTH))
    overlay.style.strokeDasharray = `${flow.dash} ${flow.gap}`
    overlay.style.animationName = flow.direction === 'backward' ? 'vl-flow-backward' : 'vl-flow-forward'
    overlay.style.animationDuration = `${period / flow.speed}s`
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
      start: Boolean(endpoints?.fromClipped) || (!active && Boolean(endpoints?.from && activeKeys.has(endpoints.from))),
      end: Boolean(endpoints?.toClipped) || (!active && Boolean(endpoints?.to && activeKeys.has(endpoints.to))),
    }
  }

  /** Paints selected, then hovered, connections last (but still under the port dots), so a sibling's line never crosses over an enlarged marker. */
  function raiseActivePaths() {
    // Raised paths go just under the port dots — or, with none, under the labels.
    const anchor = svg.querySelector('.vl-port') ?? labelsLayer
    for (const id of [...selectedIds, ...activeIds]) {
      const el = paths.get(id)
      if (!el) continue
      svg.insertBefore(el, anchor)
      const flow = flows.get(id)
      if (flow) svg.insertBefore(flow, anchor)
    }
  }

  function applyAll() {
    const activeKeys = activeEndpointKeys()
    for (const [id, el] of paths) {
      const active = activeIds.has(id)
      const selected = selectedIds.has(id)
      el.classList.toggle('vl-connection--active', active)
      el.classList.toggle('vl-connection--selected', selected)
      if (selectable) hits.get(id)?.setAttribute('aria-pressed', String(selected))
      applyConnectionAppearance(id, el, styles.get(id), active, selected, hiddenEnds(id, active, activeKeys))
    }
    raiseActivePaths()
  }

  function resize(width: number, height: number) {
    svg.setAttribute('width', String(width))
    svg.setAttribute('height', String(height))
  }

  /** Creates, updates or removes the library-drawn text labels. */
  function updateLabels(inputs: SvgLabelInput[]) {
    const keys = new Set(inputs.map((input) => input.key))
    for (const [key, g] of labelEls) {
      if (!keys.has(key)) {
        g.remove()
        labelEls.delete(key)
      }
    }
    for (const input of inputs) {
      let g = labelEls.get(input.key)
      if (!g) {
        g = document.createElementNS(SVG_NS, 'g')
        g.appendChild(document.createElementNS(SVG_NS, 'rect')).setAttribute('class', 'vl-label-bg')
        g.appendChild(document.createElementNS(SVG_NS, 'text')).setAttribute('class', 'vl-label-text')
        labelsLayer.appendChild(g)
        labelEls.set(input.key, g)
      }
      g.setAttribute('class', input.className ? `vl-label ${input.className}` : 'vl-label')
      const rect = g.firstElementChild as SVGRectElement
      const text = g.lastElementChild as SVGTextElement
      if (text.textContent !== input.text) text.textContent = input.text

      // Size the pill to the text — measured when the environment can, else estimated.
      let width = 0
      let height = 0
      try {
        const box = text.getBBox()
        width = box.width
        height = box.height
      } catch {
        // no layout engine (e.g. a test DOM) — fall through to the estimate
      }
      if (!width) width = input.text.length * LABEL_FALLBACK_CHAR_WIDTH
      if (!height) height = LABEL_FONT_SIZE
      const boxWidth = width + LABEL_PADDING_X * 2
      const boxHeight = height + LABEL_PADDING_Y * 2
      rect.setAttribute('x', String(-boxWidth / 2))
      rect.setAttribute('y', String(-boxHeight / 2))
      rect.setAttribute('width', String(boxWidth))
      rect.setAttribute('height', String(boxHeight))
      rect.setAttribute('rx', String(boxHeight / 2))
      g.setAttribute('transform', `translate(${input.point.x} ${input.point.y}) rotate(${input.rotation})`)
    }
  }

  function update(nextPaths: SvgPathInput[], nextPorts: SvgPortInput[], nextLabels: SvgLabelInput[] = []) {
    usedMarkerSignatures = new Set<string>()
    const nextPathIds = new Set(nextPaths.map((path) => path.id))
    for (const [id, el] of paths) {
      if (!nextPathIds.has(id)) {
        el.remove()
        paths.delete(id)
        hits.get(id)?.remove()
        hits.delete(id)
        flows.get(id)?.remove()
        flows.delete(id)
        styles.delete(id)
        endpointKeys.delete(id)
      }
    }
    for (const input of nextPaths) {
      endpointKeys.set(input.id, {
        from: input.fromKey,
        to: input.toKey,
        fromClipped: input.fromClipped,
        toClipped: input.toClipped,
      })
    }
    const activeKeys = activeEndpointKeys()
    for (const input of nextPaths) {
      let el = paths.get(input.id)
      if (!el) {
        el = document.createElementNS(SVG_NS, 'path')
        el.setAttribute('class', 'vl-connection')
        el.setAttribute('role', 'img')
        svg.insertBefore(el, labelsLayer)
        paths.set(input.id, el)

        const hit = document.createElementNS(SVG_NS, 'path')
        hit.setAttribute('class', 'vl-connection-hit')
        hit.addEventListener('pointerenter', (event) => handlers.onConnectionEnter?.(input.id, event))
        hit.addEventListener('pointerleave', (event) => handlers.onConnectionLeave?.(input.id, event))
        hit.addEventListener('click', (event) =>
          handlers.onConnectionClick?.(input.id, event as unknown as PointerEvent),
        )
        if (selectable) {
          hit.setAttribute('tabindex', '0')
          hit.setAttribute('role', 'button')
          hit.setAttribute('aria-pressed', 'false')
          hit.addEventListener('keydown', (event) => handlers.onConnectionKeydown?.(input.id, event))
          // Keyboard focus is shown on the visible line (the hit path is invisible).
          hit.addEventListener('focus', () => paths.get(input.id)?.classList.add('vl-connection--focus'))
          hit.addEventListener('blur', () => paths.get(input.id)?.classList.remove('vl-connection--focus'))
        } else {
          hit.setAttribute('aria-hidden', 'true')
        }
        svg.insertBefore(hit, labelsLayer)
        hits.set(input.id, hit)
      }
      el.setAttribute('d', input.d)
      if (input.ariaLabel) {
        el.setAttribute('aria-label', input.ariaLabel)
        if (selectable) hits.get(input.id)?.setAttribute('aria-label', input.ariaLabel)
      }
      el.classList.toggle('vl-connection--active', activeIds.has(input.id))
      el.classList.toggle('vl-connection--selected', selectedIds.has(input.id))
      styles.set(input.id, input.style)
      const active = activeIds.has(input.id)
      const selected = selectedIds.has(input.id)
      if (selectable) hits.get(input.id)?.setAttribute('aria-pressed', String(selected))
      applyConnectionAppearance(input.id, el, input.style, active, selected, hiddenEnds(input.id, active, activeKeys))

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
        svg.insertBefore(el, labelsLayer)
        ports.set(input.key, el)
      }
      el.setAttribute('cx', String(input.point.x))
      el.setAttribute('cy', String(input.point.y))
    }

    updateLabels(nextLabels)
  }

  /** Toggles the `.vl-connection--active` highlight (plus each connection's own `hoverStyle`, if any) on exactly the given connection ids. */
  function setActiveConnections(ids: Iterable<string>) {
    activeIds = new Set(ids)
    applyAll()
  }

  /** Toggles the `.vl-connection--selected` state (plus each connection's own `selectedStyle`, if any) on exactly the given connection ids. */
  function setSelectedConnections(ids: Iterable<string>) {
    selectedIds = new Set(ids)
    applyAll()
  }

  function destroy() {
    svg.remove()
    paths.clear()
    hits.clear()
    flows.clear()
    labelEls.clear()
    ports.clear()
    markerDefs.clear()
    styles.clear()
    endpointKeys.clear()
  }

  return {
    resize,
    update,
    setActiveConnections,
    setSelectedConnections,
    /** Whether `node` is part of this layer — used to tell a click on a connection from a click elsewhere. */
    contains: (node: Node) => svg.contains(node),
    destroy,
  }
}
