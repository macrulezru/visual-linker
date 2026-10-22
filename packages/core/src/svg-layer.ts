import type { ConnectionEndpoint, ConnectionStyle, ConnectPortState, MarkerStyle, VisualLinkerConfig } from './types'
import {
  baseOf,
  layered,
  mergeMarkerInputs,
  NO_STATES,
  resolveLines,
  statesOf,
  themeLineColor,
  type ActiveStates,
} from './config'
import { flowStrokeWidth, resolveFlow } from './flow'
import type { Point } from './geometry'
import { createMarkerElement, markerSignature, resolveMarkerConfig } from './markers'
import { themeVariables } from './theme'
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

let svgLayerInstanceCounter = 0

export interface SvgPathInput {
  id: string
  d: string
  style?: ConnectionStyle
  hoverable?: boolean
  fromKey?: string
  toKey?: string
  fromClipped?: boolean
  toClipped?: boolean
  ariaLabel?: string
  styleKey?: string
  proxied?: boolean
}

export interface SvgHandleInput {
  key: string
  point: Point
  endpoint: ConnectionEndpoint
  radius: number
  state: ConnectPortState | null
  visible: boolean
}

export interface SvgLabelInput {
  key: string
  connectionId: string
  point: Point
  rotation: number
  text: string
  className?: string
}

export interface SvgPortInput {
  key: string
  point: Point
  connectionIds: string[]
}

export interface SvgLayerHandlers {
  onConnectionClick?: (id: string, event: PointerEvent) => void
  onConnectionEnter?: (id: string, event: PointerEvent) => void
  onConnectionLeave?: (id: string, event: PointerEvent) => void
  onConnectionKeydown?: (id: string, event: KeyboardEvent) => void
  onHandlePointerDown?: (key: string, event: PointerEvent) => void
  onHandleClick?: (key: string, event: MouseEvent) => void
}

const DEFAULT_STYLE = `
  .vl-connection { fill: none; stroke: var(--vl-line-color, ${DEFAULT_LINE_COLOR}); stroke-width: var(--vl-line-width, ${DEFAULT_LINE_WIDTH}); }
  .vl-connection--selected { stroke: var(--vl-line-color-selected, var(--vl-line-color-active, var(--vl-line-color, ${DEFAULT_LINE_COLOR}))); stroke-width: calc(var(--vl-line-width, ${DEFAULT_LINE_WIDTH}) + ${ACTIVE_LINE_WIDTH_BUMP}); }
  .vl-connection--active { stroke: var(--vl-line-color-active, var(--vl-line-color, ${DEFAULT_LINE_COLOR})); stroke-width: calc(var(--vl-line-width, ${DEFAULT_LINE_WIDTH}) + ${ACTIVE_LINE_WIDTH_BUMP}); }
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
  .vl-connection-hit { fill: none; stroke: transparent; stroke-width: ${HIT_AREA_STROKE_WIDTH}; pointer-events: stroke; outline: none; }
  .vl-port { fill: var(--vl-port-fill, ${DEFAULT_PORT_FILL}); stroke: var(--vl-port-stroke-color, ${DEFAULT_PORT_STROKE_COLOR}); stroke-width: var(--vl-port-stroke-width, ${DEFAULT_PORT_STROKE_WIDTH}); r: var(--vl-port-radius, ${DEFAULT_PORT_RADIUS}); }
  .vl-draggable { cursor: grab; }
  .vl-dragging { cursor: grabbing; }
`

const CONNECT_STYLE = `
  .vl-handle-hit { fill: transparent; stroke: none; pointer-events: all; cursor: crosshair; touch-action: none; }
  .vl-handle { fill: var(--vl-port-fill, ${DEFAULT_PORT_FILL}); stroke: var(--vl-port-stroke-color, ${DEFAULT_PORT_STROKE_COLOR}); stroke-width: var(--vl-port-stroke-width, ${DEFAULT_PORT_STROKE_WIDTH}); r: var(--vl-port-radius, ${DEFAULT_PORT_RADIUS}); pointer-events: none; opacity: 0; }
  .vl-handle--visible { opacity: 1; }
  .vl-handle--source { stroke: var(--vl-connect-preview-color, ${DEFAULT_SELECTION_COLOR}); fill: var(--vl-connect-preview-color, ${DEFAULT_SELECTION_COLOR}); }
  .vl-handle--candidate { stroke: var(--vl-connect-valid-color, ${DEFAULT_LINE_COLOR}); }
  .vl-handle--target { stroke: var(--vl-connect-valid-color, ${DEFAULT_LINE_COLOR}); fill: var(--vl-connect-valid-color, ${DEFAULT_LINE_COLOR}); }
  .vl-handle--invalid { stroke: var(--vl-connect-invalid-color, #d64545); }
  .vl-connect-preview { fill: none; stroke: var(--vl-connect-preview-color, ${DEFAULT_SELECTION_COLOR}); stroke-width: var(--vl-line-width, ${DEFAULT_LINE_WIDTH}); stroke-dasharray: ${DASH_PATTERN}; opacity: 0.8; pointer-events: none; }
  .vl-connect-preview--valid { stroke: var(--vl-connect-valid-color, ${DEFAULT_LINE_COLOR}); }
  .vl-connect-preview--invalid { stroke: var(--vl-connect-invalid-color, #d64545); }
  .vl-live { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; padding: 0; }
`

function measureText(text: SVGTextElement): { width: number; height: number } {
  try {
    const box = text.getBBox()
    return { width: box.width, height: box.height }
  } catch {
    return { width: 0, height: 0 }
  }
}

function setStyle(el: SVGElement, name: string, value: string | number | undefined) {
  if (value === undefined || value === '') el.style.removeProperty(name)
  else el.style.setProperty(name, String(value))
}

export function createSvgLayer(
  container: HTMLElement,
  handlers: SvgLayerHandlers,
  getConfig: () => VisualLinkerConfig,
) {
  const instanceId = svgLayerInstanceCounter++
  const config = () => getConfig()
  const selectable = () => config().interaction?.selectable ?? false

  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative'
  }

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'vl-svg')
  svg.style.position = 'absolute'
  svg.style.inset = '0'
  svg.style.overflow = 'visible'
  svg.style.pointerEvents = 'none'

  const style = document.createElementNS(SVG_NS, 'style')
  style.textContent = DEFAULT_STYLE
  svg.appendChild(style)

  const defs = document.createElementNS(SVG_NS, 'defs')
  svg.appendChild(defs)
  let connectStyle: SVGStyleElement | null = null
  function ensureConnectStyle() {
    if (connectStyle) return
    connectStyle = document.createElementNS(SVG_NS, 'style')
    connectStyle.textContent = CONNECT_STYLE
    svg.insertBefore(connectStyle, style.nextSibling)
  }
  const labelsLayer = document.createElementNS(SVG_NS, 'g')
  labelsLayer.setAttribute('class', 'vl-labels')
  svg.appendChild(labelsLayer)
  container.appendChild(svg)

  let handlesLayer: SVGGElement | null = null
  let previewPath: SVGPathElement | null = null
  let liveRegion: HTMLElement | null = null

  const paths = new Map<string, SVGPathElement>()
  const hits = new Map<string, SVGPathElement>()
  const flows = new Map<string, SVGPathElement>()
  const labelEls = new Map<string, SVGGElement>()
  const labelInputs = new Map<string, SvgLabelInput>()
  const labelKeys = new Map<string, string>()
  const ports = new Map<string, SVGCircleElement>()
  const portInputs = new Map<string, SvgPortInput>()
  const portPaintKeys = new Map<string, string>()
  const markerDefs = new Map<string, SVGMarkerElement>()
  const styles = new Map<string, ConnectionStyle | undefined>()
  const styleKeys = new Map<string, string | undefined>()
  const ariaLabels = new Map<string, string>()
  const hoverableFlags = new Map<string, boolean | undefined>()
  const endpointKeys = new Map<string, { from?: string; to?: string; fromClipped?: boolean; toClipped?: boolean }>()
  const lastD = new Map<string, string>()
  const appearanceKeys = new Map<string, string>()
  const connectionMarkers = new Map<string, string[]>()
  const handleEls = new Map<string, { group: SVGGElement; hit: SVGCircleElement; dot: SVGCircleElement }>()
  const handleKeys = new Map<string, string>()
  const textSizes = new Map<string, { width: number; height: number }>()
  const styleTokens = new WeakMap<object, number>()
  let styleTokenCounter = 0
  let configVersion = 0
  let markerIdCounter = 0
  let activeIds = new Set<string>()
  let selectedIds = new Set<string>()
  let highlightedIds = new Set<string>()
  let focusedIds = new Set<string>()
  const proxiedIds = new Set<string>()
  let drawnLastUpdate = 0

  const hoverEnabled = (id: string) => hoverableFlags.get(id) ?? config().interaction?.hover ?? false

  function styleToken(id: string): string {
    const key = styleKeys.get(id)
    if (key !== undefined) return `k${key}`
    const own = styles.get(id)
    if (own === undefined) return ''
    let token = styleTokens.get(own)
    if (token === undefined) {
      token = styleTokenCounter++
      styleTokens.set(own, token)
    }
    return `t${token}`
  }

  function pruneHovered() {
    const next = [...activeIds].filter(hoverEnabled)
    if (next.length !== activeIds.size) activeIds = new Set(next)
  }

  function statesFor(id: string): ActiveStates {
    return {
      proxied: proxiedIds.has(id),
      highlight: highlightedIds.has(id),
      hover: activeIds.has(id),
      selected: selectedIds.has(id),
      focus: focusedIds.has(id),
    }
  }

  function statesForAny(ids: string[]): ActiveStates {
    const result = { ...NO_STATES }
    for (const id of ids) {
      const states = statesFor(id)
      result.proxied ||= states.proxied
      result.highlight ||= states.highlight
      result.hover ||= states.hover
      result.selected ||= states.selected
      result.focus ||= states.focus
    }
    return result
  }

  function stateBits(states: ActiveStates): string {
    return `${states.proxied ? 1 : 0}${states.highlight ? 1 : 0}${states.hover ? 1 : 0}${states.selected ? 1 : 0}${states.focus ? 1 : 0}`
  }

  function applyTheme() {
    for (const [name, value] of themeVariables(config().theme)) setStyle(svg, name, value)
  }

  function ensureMarker(
    position: 'start' | 'end',
    input: MarkerStyle | false | undefined,
    fallbackColor: string,
    fallbackOpacity: number | undefined,
    used: string[],
  ): string | null {
    const resolved = resolveMarkerConfig(input, fallbackColor, config().markers?.sizes ?? {}, fallbackOpacity)
    if (!resolved) return null
    const signature = markerSignature(position, resolved)
    used.push(signature)
    let el = markerDefs.get(signature)
    if (!el) {
      el = createMarkerElement(`vl-marker-${instanceId}-${markerIdCounter++}`, position, resolved)
      defs.appendChild(el)
      markerDefs.set(signature, el)
    }
    return el.id
  }

  function applyConnectionAppearance(id: string, el: SVGPathElement, hidden: { start: boolean; end: boolean }) {
    const own = styles.get(id)
    const view = resolveLines(config().lines, own)
    const active = statesFor(id)
    const stateFields = statesOf(view, active)
    const base = baseOf(view)
    const emphasised = active.hover || active.highlight || active.selected
    const color = stateFields.color ?? base.color
    const width =
      stateFields.width ?? (emphasised && base.width != null ? base.width + ACTIVE_LINE_WIDTH_BUMP : base.width)
    const dashed = stateFields.dashed ?? base.dashed
    const opacity = stateFields.opacity ?? base.opacity

    el.style.stroke = color ?? ''
    el.style.strokeWidth = width != null ? String(width) : ''
    el.style.strokeDasharray = dashed ? DASH_PATTERN : ''

    const fallbackColor = color ?? themeLineColor(config().theme, active)
    const markerIds: Record<'start' | 'end', string | null> = { start: null, end: null }
    const used: string[] = []
    for (const position of ['start', 'end'] as const) {
      const merged = mergeMarkerInputs(config().markers?.[position], own?.markers?.[position])
      markerIds[position] = ensureMarker(
        position,
        merged ? layered(merged, active) : merged,
        fallbackColor,
        opacity,
        used,
      )
    }
    connectionMarkers.set(id, used)
    el.style.markerStart = markerIds.start && !hidden.start ? `url(#${markerIds.start})` : ''
    el.style.markerEnd = markerIds.end && !hidden.end ? `url(#${markerIds.end})` : ''

    const tint = applyFlow(id, el, view.animated, width, color, emphasised, opacity)
    const combined = opacity === undefined && tint === undefined ? undefined : (opacity ?? 1) * (tint ?? 1)
    el.style.strokeOpacity = combined === undefined ? '' : String(combined)
  }

  function applyFlow(
    id: string,
    el: SVGPathElement,
    animated: ConnectionStyle['animated'],
    lineWidth: number | undefined,
    lineColor: string | undefined,
    emphasised: boolean,
    opacity: number | undefined,
  ): number | undefined {
    const flow = resolveFlow(animated, undefined)
    let overlay = flows.get(id)
    if (!flow) {
      overlay?.remove()
      flows.delete(id)
      return undefined
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
    const tint = flow.color === undefined
    overlay.classList.toggle('vl-flow--tint', tint)
    overlay.style.stroke = flow.color ?? lineColor ?? ''
    overlay.style.strokeOpacity = opacity === undefined ? '' : String(opacity)
    overlay.style.strokeWidth = String(flowStrokeWidth(flow, lineWidth ?? DEFAULT_LINE_WIDTH))
    overlay.style.strokeDasharray = `${flow.dash} ${flow.gap}`
    overlay.style.animationName = flow.direction === 'backward' ? 'vl-flow-backward' : 'vl-flow-forward'
    overlay.style.animationDuration = `${period / flow.speed}s`
    return tint ? (emphasised ? FLOW_TINT_BASE_OPACITY_ACTIVE : FLOW_TINT_BASE_OPACITY) : undefined
  }

  function activeEndpointKeys(): Set<string> {
    const keys = new Set<string>()
    for (const id of [...activeIds, ...highlightedIds]) {
      const endpoints = endpointKeys.get(id)
      if (endpoints?.from) keys.add(endpoints.from)
      if (endpoints?.to) keys.add(endpoints.to)
    }
    return keys
  }

  function hiddenEnds(id: string, active: boolean, activeKeys: Set<string>) {
    const endpoints = endpointKeys.get(id)
    return {
      start: Boolean(endpoints?.fromClipped) || (!active && Boolean(endpoints?.from && activeKeys.has(endpoints.from))),
      end: Boolean(endpoints?.toClipped) || (!active && Boolean(endpoints?.to && activeKeys.has(endpoints.to))),
    }
  }

  function raiseActivePaths() {
    const anchor = svg.querySelector('.vl-port') ?? labelsLayer
    for (const id of [...selectedIds, ...highlightedIds, ...activeIds]) {
      const el = paths.get(id)
      if (!el) continue
      svg.insertBefore(el, anchor)
      const flow = flows.get(id)
      if (flow) svg.insertBefore(flow, anchor)
    }
  }

  function configureHit(id: string, hit: SVGPathElement) {
    const label = ariaLabels.get(id)
    hit.style.cursor = selectable() || hoverEnabled(id) ? 'pointer' : ''
    if (selectable()) {
      hit.removeAttribute('aria-hidden')
      hit.setAttribute('tabindex', '0')
      hit.setAttribute('role', 'button')
      hit.setAttribute('aria-pressed', String(selectedIds.has(id)))
      if (label) hit.setAttribute('aria-label', label)
    } else {
      hit.setAttribute('aria-hidden', 'true')
      hit.removeAttribute('tabindex')
      hit.removeAttribute('role')
      hit.removeAttribute('aria-pressed')
      hit.removeAttribute('aria-label')
    }
  }

  function paintPort(key: string, el: SVGCircleElement) {
    const input = portInputs.get(key)
    const active = statesForAny(input?.connectionIds ?? [])
    const paintKey = `${configVersion}|${stateBits(active)}`
    if (portPaintKeys.get(key) === paintKey) return
    portPaintKeys.set(key, paintKey)
    const portStyle = layered(config().ports, active)
    setStyle(el, 'r', portStyle.radius != null ? `${portStyle.radius}px` : undefined)
    setStyle(el, 'fill', portStyle.fill)
    setStyle(el, 'stroke', portStyle.stroke)
    setStyle(el, 'stroke-width', portStyle.strokeWidth)
    setStyle(el, 'opacity', portStyle.opacity)
  }

  function labelPaintKey(input: SvgLabelInput): string {
    const active = statesFor(input.connectionId)
    return [
      configVersion,
      stateBits(active),
      input.text,
      input.className ?? '',
      input.point.x,
      input.point.y,
      input.rotation,
    ].join('|')
  }

  function labelStyleFor(input: SvgLabelInput) {
    return layered(config().labels, statesFor(input.connectionId))
  }

  function textSizeKey(input: SvgLabelInput, fontSize: number | undefined): string {
    return `${input.text}|${input.className ?? ''}|${fontSize ?? ''}`
  }

  function writeLabelStyle(input: SvgLabelInput, g: SVGGElement) {
    const labelStyle = labelStyleFor(input)
    const rect = g.firstElementChild as SVGRectElement
    const text = g.lastElementChild as SVGTextElement

    g.setAttribute('class', input.className ? `vl-label ${input.className}` : 'vl-label')
    if (text.textContent !== input.text) text.textContent = input.text
    setStyle(rect, 'fill', labelStyle.background)
    setStyle(rect, 'stroke', labelStyle.border)
    setStyle(text, 'fill', labelStyle.color)
    setStyle(g, 'opacity', labelStyle.opacity)
    setStyle(text, 'font-size', labelStyle.fontSize != null ? `${labelStyle.fontSize}px` : undefined)
    return labelStyle
  }

  function writeLabelBox(input: SvgLabelInput, g: SVGGElement, size: { width: number; height: number }) {
    const labelStyle = labelStyleFor(input)
    const rect = g.firstElementChild as SVGRectElement
    const fontSize = labelStyle.fontSize ?? LABEL_FONT_SIZE
    const width = size.width || input.text.length * LABEL_FALLBACK_CHAR_WIDTH * (fontSize / LABEL_FONT_SIZE)
    const height = size.height || fontSize
    const boxWidth = width + (labelStyle.paddingX ?? LABEL_PADDING_X) * 2
    const boxHeight = height + (labelStyle.paddingY ?? LABEL_PADDING_Y) * 2
    rect.setAttribute('x', String(-boxWidth / 2))
    rect.setAttribute('y', String(-boxHeight / 2))
    rect.setAttribute('width', String(boxWidth))
    rect.setAttribute('height', String(boxHeight))
    rect.setAttribute('rx', String(boxHeight / 2))
    g.setAttribute('transform', `translate(${input.point.x} ${input.point.y}) rotate(${input.rotation})`)
  }

  function paintLabels(keys: string[]) {
    const pending: { key: string; input: SvgLabelInput; g: SVGGElement; sizeKey: string }[] = []
    for (const key of keys) {
      const input = labelInputs.get(key)
      const g = labelEls.get(key)
      if (!input || !g) continue
      const paintKey = labelPaintKey(input)
      if (labelKeys.get(key) === paintKey) continue
      labelKeys.set(key, paintKey)
      const labelStyle = writeLabelStyle(input, g)
      pending.push({ key, input, g, sizeKey: textSizeKey(input, labelStyle.fontSize) })
    }
    for (const entry of pending) {
      if (textSizes.has(entry.sizeKey)) continue
      textSizes.set(entry.sizeKey, measureText(entry.g.lastElementChild as SVGTextElement))
    }
    for (const entry of pending) writeLabelBox(entry.input, entry.g, textSizes.get(entry.sizeKey)!)
  }

  function refreshConnection(id: string, el: SVGPathElement, activeKeys: Set<string>): boolean {
    const hit = hits.get(id)
    const active = activeIds.has(id) || highlightedIds.has(id)
    const hidden = hiddenEnds(id, active, activeKeys)
    const states = statesFor(id)
    const key = [
      configVersion,
      styleToken(id),
      stateBits(states),
      hidden.start ? 1 : 0,
      hidden.end ? 1 : 0,
      hoverableFlags.get(id) ?? '',
      selectable() ? 1 : 0,
      ariaLabels.get(id) ?? '',
    ].join('|')
    if (appearanceKeys.get(id) === key) return false
    appearanceKeys.set(id, key)
    el.classList.toggle('vl-connection--active', active)
    el.classList.toggle('vl-connection--selected', states.selected)
    el.classList.toggle('vl-connection--focus', states.focus)
    const label = ariaLabels.get(id)
    if (label) el.setAttribute('aria-label', label)
    if (hit) configureHit(id, hit)
    applyConnectionAppearance(id, el, hidden)
    return true
  }

  function applyAll() {
    const activeKeys = activeEndpointKeys()
    for (const [id, el] of paths) {
      if (selectable()) hits.get(id)?.setAttribute('aria-pressed', String(selectedIds.has(id)))
      refreshConnection(id, el, activeKeys)
    }
    for (const [key, el] of ports) paintPort(key, el)
    paintLabels([...labelEls.keys()])
    raiseActivePaths()
  }

  function resize(width: number, height: number) {
    svg.setAttribute('width', String(width))
    svg.setAttribute('height', String(height))
  }

  function updateLabels(inputs: SvgLabelInput[]) {
    const keys = new Set(inputs.map((input) => input.key))
    for (const [key, g] of labelEls) {
      if (!keys.has(key)) {
        g.remove()
        labelEls.delete(key)
        labelInputs.delete(key)
        labelKeys.delete(key)
      }
    }
    for (const input of inputs) {
      labelInputs.set(input.key, input)
      if (!labelEls.has(input.key)) {
        const g = document.createElementNS(SVG_NS, 'g')
        g.appendChild(document.createElementNS(SVG_NS, 'rect')).setAttribute('class', 'vl-label-bg')
        g.appendChild(document.createElementNS(SVG_NS, 'text')).setAttribute('class', 'vl-label-text')
        labelsLayer.appendChild(g)
        labelEls.set(input.key, g)
      }
    }
    paintLabels(inputs.map((input) => input.key))
  }

  function createConnection(id: string): SVGPathElement {
    const el = document.createElementNS(SVG_NS, 'path')
    el.setAttribute('class', 'vl-connection')
    el.setAttribute('role', 'img')
    svg.insertBefore(el, labelsLayer)
    paths.set(id, el)

    const hit = document.createElementNS(SVG_NS, 'path')
    hit.setAttribute('class', 'vl-connection-hit')
    hit.addEventListener('pointerenter', (event) => handlers.onConnectionEnter?.(id, event))
    hit.addEventListener('pointerleave', (event) => handlers.onConnectionLeave?.(id, event))
    hit.addEventListener('click', (event) => handlers.onConnectionClick?.(id, event as unknown as PointerEvent))
    hit.addEventListener('keydown', (event) => {
      if (selectable()) handlers.onConnectionKeydown?.(id, event)
    })
    hit.addEventListener('focus', () => {
      if (!selectable()) return
      focusedIds.add(id)
      applyAll()
    })
    hit.addEventListener('blur', () => {
      if (!focusedIds.delete(id)) return
      applyAll()
    })
    svg.insertBefore(hit, labelsLayer)
    hits.set(id, hit)
    configureHit(id, hit)
    return el
  }

  function removeConnectionElements(id: string) {
    paths.get(id)?.remove()
    paths.delete(id)
    hits.get(id)?.remove()
    hits.delete(id)
    flows.get(id)?.remove()
    flows.delete(id)
    styles.delete(id)
    styleKeys.delete(id)
    ariaLabels.delete(id)
    hoverableFlags.delete(id)
    focusedIds.delete(id)
    proxiedIds.delete(id)
    endpointKeys.delete(id)
    lastD.delete(id)
    appearanceKeys.delete(id)
    connectionMarkers.delete(id)
  }

  function update(nextPaths: SvgPathInput[], nextPorts: SvgPortInput[], nextLabels: SvgLabelInput[] = []): number {
    drawnLastUpdate = 0
    const nextPathIds = new Set(nextPaths.map((path) => path.id))
    for (const id of [...paths.keys()]) {
      if (!nextPathIds.has(id)) removeConnectionElements(id)
    }
    for (const input of nextPaths) {
      endpointKeys.set(input.id, {
        from: input.fromKey,
        to: input.toKey,
        fromClipped: input.fromClipped,
        toClipped: input.toClipped,
      })
      styles.set(input.id, input.style)
      styleKeys.set(input.id, input.styleKey)
      hoverableFlags.set(input.id, input.hoverable)
      if (input.ariaLabel) ariaLabels.set(input.id, input.ariaLabel)
      if (input.proxied) proxiedIds.add(input.id)
      else proxiedIds.delete(input.id)
    }
    pruneHovered()
    const activeKeys = activeEndpointKeys()
    for (const input of nextPaths) {
      const created = !paths.has(input.id)
      const el = paths.get(input.id) ?? createConnection(input.id)
      let drawn = created
      if (lastD.get(input.id) !== input.d) {
        lastD.set(input.id, input.d)
        el.setAttribute('d', input.d)
        hits.get(input.id)?.setAttribute('d', input.d)
        flows.get(input.id)?.setAttribute('d', input.d)
        drawn = true
      }
      if (refreshConnection(input.id, el, activeKeys)) drawn = true
      if (drawn) drawnLastUpdate++
    }
    raiseActivePaths()

    const usedMarkers = new Set<string>()
    for (const signatures of connectionMarkers.values()) for (const signature of signatures) usedMarkers.add(signature)
    for (const [signature, el] of markerDefs) {
      if (!usedMarkers.has(signature)) {
        el.remove()
        markerDefs.delete(signature)
      }
    }

    const nextPortKeys = new Set(nextPorts.map((port) => port.key))
    for (const [key, el] of ports) {
      if (!nextPortKeys.has(key)) {
        el.remove()
        ports.delete(key)
        portInputs.delete(key)
        portPaintKeys.delete(key)
      }
    }
    for (const input of nextPorts) {
      portInputs.set(input.key, input)
      let el = ports.get(input.key)
      if (!el) {
        el = document.createElementNS(SVG_NS, 'circle')
        el.setAttribute('class', 'vl-port')
        svg.insertBefore(el, labelsLayer)
        ports.set(input.key, el)
      }
      el.setAttribute('cx', String(input.point.x))
      el.setAttribute('cy', String(input.point.y))
      paintPort(input.key, el)
    }

    updateLabels(nextLabels)
    return drawnLastUpdate
  }

  function applyConfig() {
    configVersion++
    textSizes.clear()
    applyTheme()
    pruneHovered()
    for (const [id, hit] of hits) configureHit(id, hit)
    if (!selectable() && focusedIds.size > 0) focusedIds = new Set()
    applyAll()
    repaintHandles()
  }

  function setHoveredConnections(ids: Iterable<string>) {
    activeIds = new Set([...ids].filter(hoverEnabled))
    applyAll()
  }

  function setHighlightedConnections(ids: Iterable<string>) {
    highlightedIds = new Set(ids)
    applyAll()
  }

  function setSelectedConnections(ids: Iterable<string>) {
    selectedIds = new Set(ids)
    applyAll()
  }

  function ensureHandlesLayer(): SVGGElement {
    if (!handlesLayer) {
      ensureConnectStyle()
      handlesLayer = document.createElementNS(SVG_NS, 'g')
      handlesLayer.setAttribute('class', 'vl-handles')
      svg.appendChild(handlesLayer)
    }
    return handlesLayer
  }

  let handleInputs = new Map<string, SvgHandleInput>()

  function paintHandleDot(dot: SVGCircleElement, input: SvgHandleInput) {
    const stateStyle = input.state ? config().ports?.connect?.[input.state] : undefined
    dot.setAttribute('class', handleClass(input))
    setStyle(dot, 'r', stateStyle?.radius != null ? `${stateStyle.radius}px` : undefined)
    setStyle(dot, 'fill', stateStyle?.fill)
    setStyle(dot, 'stroke', stateStyle?.stroke)
    setStyle(dot, 'stroke-width', stateStyle?.strokeWidth)
    setStyle(dot, 'opacity', stateStyle?.opacity)
  }

  function handleClass(input: SvgHandleInput): string {
    return [
      'vl-handle',
      input.visible || input.state ? 'vl-handle--visible' : '',
      input.state ? `vl-handle--${input.state}` : '',
    ]
      .filter(Boolean)
      .join(' ')
  }

  function handleKey(input: SvgHandleInput): string {
    return [configVersion, input.point.x, input.point.y, input.radius, input.state ?? '', input.visible ? 1 : 0].join(
      '|',
    )
  }

  function setHandles(inputs: SvgHandleInput[]) {
    if (inputs.length === 0 && !handlesLayer) return
    const layer = ensureHandlesLayer()
    const keys = new Set(inputs.map((input) => input.key))
    for (const [key, els] of handleEls) {
      if (!keys.has(key)) {
        els.group.remove()
        handleEls.delete(key)
        handleKeys.delete(key)
        handleInputs.delete(key)
      }
    }
    for (const input of inputs) {
      handleInputs.set(input.key, input)
      let els = handleEls.get(input.key)
      if (!els) {
        const group = document.createElementNS(SVG_NS, 'g')
        group.setAttribute('class', 'vl-handle-group')
        group.setAttribute('data-vl-handle', input.key)
        const hit = document.createElementNS(SVG_NS, 'circle')
        hit.setAttribute('class', 'vl-handle-hit')
        hit.setAttribute('aria-hidden', 'true')
        const dot = document.createElementNS(SVG_NS, 'circle')
        group.append(hit, dot)
        const key = input.key
        hit.addEventListener('pointerdown', (event) => handlers.onHandlePointerDown?.(key, event))
        hit.addEventListener('click', (event) => handlers.onHandleClick?.(key, event))
        layer.appendChild(group)
        els = { group, hit, dot }
        handleEls.set(input.key, els)
      }
      const nextKey = handleKey(input)
      if (handleKeys.get(input.key) === nextKey) continue
      handleKeys.set(input.key, nextKey)
      els.group.setAttribute('transform', `translate(${input.point.x} ${input.point.y})`)
      els.hit.setAttribute('r', String(input.radius))
      paintHandleDot(els.dot, input)
    }
  }

  function repaintHandles() {
    handleKeys.clear()
    setHandles([...handleInputs.values()])
  }

  function clearHandles() {
    for (const els of handleEls.values()) els.group.remove()
    handleEls.clear()
    handleKeys.clear()
    handleInputs = new Map()
  }

  function setPreview(d: string | null, validity: 'valid' | 'invalid' | null = null) {
    if (d === null) {
      previewPath?.remove()
      previewPath = null
      return
    }
    if (!previewPath) {
      ensureConnectStyle()
      previewPath = document.createElementNS(SVG_NS, 'path')
      previewPath.setAttribute('aria-hidden', 'true')
      svg.appendChild(previewPath)
    }
    previewPath.setAttribute('class', `vl-connect-preview${validity ? ` vl-connect-preview--${validity}` : ''}`)
    previewPath.setAttribute('d', d)
  }

  function stylePreview(apply: (el: SVGPathElement) => void) {
    if (previewPath) apply(previewPath)
  }

  function announce(text: string) {
    if (!liveRegion) {
      liveRegion = document.createElement('div')
      liveRegion.className = 'vl-live'
      liveRegion.setAttribute('aria-live', 'polite')
      liveRegion.setAttribute('role', 'status')
      container.appendChild(liveRegion)
    }
    liveRegion.textContent = text
  }

  function removeLiveRegion() {
    liveRegion?.remove()
    liveRegion = null
  }

  function destroy() {
    svg.remove()
    liveRegion?.remove()
    liveRegion = null
    handlesLayer = null
    previewPath = null
    paths.clear()
    hits.clear()
    flows.clear()
    labelEls.clear()
    labelInputs.clear()
    labelKeys.clear()
    ports.clear()
    portInputs.clear()
    portPaintKeys.clear()
    markerDefs.clear()
    styles.clear()
    styleKeys.clear()
    ariaLabels.clear()
    hoverableFlags.clear()
    endpointKeys.clear()
    lastD.clear()
    appearanceKeys.clear()
    connectionMarkers.clear()
    handleEls.clear()
    handleKeys.clear()
    handleInputs.clear()
    textSizes.clear()
  }

  applyTheme()

  return {
    resize,
    update,
    applyConfig,
    setHoveredConnections,
    setHighlightedConnections,
    setSelectedConnections,
    setHandles,
    clearHandles,
    setPreview,
    stylePreview,
    announce,
    removeLiveRegion,
    contains: (node: Node) => svg.contains(node),
    destroy,
  }
}
