import {
  angleDeg,
  bezierMidpoint,
  bezierPath,
  bezierPolyline,
  bezierTangentAngles,
  DEFAULT_CURVE_GEOMETRY,
  projectedSidePoint,
  resolveAutoSide,
  sidePoint,
  straightPath,
  type CurveGeometryOptions,
  type Point,
} from './geometry'
import {
  computeBranchInfo,
  polylineMidpoint,
  polylineTangentAngles,
  roundedPolylinePath,
  smoothstepPoints,
} from './orthogonal'
import { clampToRect, clippingAncestors, visibleRect, type ClipRect, type ClippingAncestor } from './clipping'
import { createResizeWatcher } from './resize-watcher'
import { findJumps, resolveJumpRadius, type JumpPath } from './jumps'
import { layoutLabel } from './path-sampling'
import { createRouteCache, inflate, pathIsClear, type ObstacleRect } from './routing'
import { resolveSpread, spreadPositions, type ResolvedSpread } from './spread'
import {
  createSvgLayer,
  type SvgHandleInput,
  type SvgLabelInput,
  type SvgPathInput,
  type SvgPortInput,
} from './svg-layer'
import { createConnectController, HANDLE_MIN_RADIUS, type BlockGeometry, type HandleInfo } from './connect'
import { mergeConfig, mergeMarkerInputs, patchConfig, resolveLines } from './config'
import {
  DEFAULT_CORNER_RADIUS,
  DEFAULT_CURVE_TYPE,
  DEFAULT_DRAGGABLE,
  DEFAULT_MAX_TRUNK_REACH,
  DEFAULT_OBSTACLE_PADDING,
  DEFAULT_PORT_OFFSET,
  DEFAULT_SHOW_PORTS,
  ROUTE_REGION_MARGIN,
} from './params'
import { VLConnectionCurveEnum, VLFixedSideEnum } from './enums'
import type {
  BlockDescriptor,
  ConnectCancelReason,
  ConnectionDescriptor,
  ConnectionEndpoint,
  ConnectionLabel,
  ConnectionLayout,
  ConnectionStyle,
  DragBounds,
  FixedSide,
  LabelLayout,
  PortDescriptor,
  PortLayout,
  VisualLinkerConfig,
  VisualLinkerEventMap,
} from './types'

export interface VisualLinkerStats {
  blocks: number
  connections: number
  rendered: number
  culled: number
  proxied: number
  lastRenderMs: number
  medianRenderMs: number
  observedElements: number
}

export interface VisualLinker {
  setBlocks(blocks: BlockDescriptor[]): void
  setConnections(connections: ConnectionDescriptor[]): void
  updateBlock(id: string, patch: Partial<Omit<BlockDescriptor, 'id'>>): void
  addBlock(block: BlockDescriptor): void
  removeBlock(id: string): void
  addConnection(connection: ConnectionDescriptor): void
  removeConnection(id: string): void
  /** Sets the selected connections (`selectable` mode) — for controlled use; does not emit `connection:selectionchange`. */
  setSelectedConnections(ids: readonly string[]): void
  setConfig(patch: VisualLinkerConfig): void
  replaceConfig(next: VisualLinkerConfig): void
  getConfig(): VisualLinkerConfig
  /** Forces an immediate path recalculation, bypassing the rAF batching (e.g. right before a screenshot). */
  refresh(): void
  batch(fn: () => void): void
  getStats(): VisualLinkerStats
  startConnect(from: ConnectionEndpoint): boolean
  completeConnect(to: ConnectionEndpoint): boolean
  cancelConnect(reason?: ConnectCancelReason): void
  isConnecting(): { active: boolean; from?: ConnectionEndpoint }
  on<E extends keyof VisualLinkerEventMap>(event: E, handler: (payload: VisualLinkerEventMap[E]) => void): () => void
  destroy(): void
}

const DEFAULT_PORT: PortDescriptor = { id: '__default__' }
const RENDER_WINDOW = 60
const DEFAULT_CULL_MARGIN = 64
const DEFAULT_MAX_CONNECTIONS_FOR_JUMPS = 150
const DEFAULT_MAX_OBSTACLE_BLOCKS = 200
const CURVE_SLACK = 160

interface ResolvedEnd {
  point: Point
  side: FixedSide
  spread: ResolvedSpread | null
  /** The anchoring rect's extent along the side's own axis — x for top/bottom, y for left/right — in local coords. */
  range: [number, number]
  /** Set on a spread endpoint: its own branch-grouping id, so smoothstep never merges spread lines into one trunk. */
  branchPortId?: string
  /** The endpoint's port was scrolled out of a clipping ancestor and its point pulled to the visible edge. */
  clipped?: boolean
  blockId: string
  portId?: string
  proxied: boolean
}

interface Pass {
  containerRect: DOMRect
  measure(el: Element): DOMRect
}

interface Resolved {
  connection: ConnectionDescriptor
  from: ResolvedEnd
  to: ResolvedEnd
  view: ConnectionStyle
  curve: ConnectionStyle['curve']
}

interface BuiltPath {
  sig: string
  d: string
  layout: ConnectionLayout
  labelInputs: SvgLabelInput[]
}

function isHorizontalSide(side: FixedSide): boolean {
  return side === VLFixedSideEnum.TOP || side === VLFixedSideEnum.BOTTOM
}

/**
 * Gives every connection sharing a spread port side its own point along that
 * side — ordered by where each connection's other end sits on the same axis,
 * so the lines fan out without crossing. Mutates the endpoints in place.
 */
function applyPortSpread(items: { connection: ConnectionDescriptor; from: ResolvedEnd; to: ResolvedEnd }[]) {
  const origins = new Map<ResolvedEnd, Point>()
  const groups = new Map<string, { end: ResolvedEnd; other: ResolvedEnd }[]>()
  for (const item of items) {
    origins.set(item.from, item.from.point)
    origins.set(item.to, item.to.point)
    for (const [end, other] of [
      [item.from, item.to],
      [item.to, item.from],
    ] as const) {
      if (!end.spread) continue
      const key = `${end.blockId}:${end.portId ?? DEFAULT_PORT.id}:${end.side}`
      const group = groups.get(key)
      if (group) group.push({ end, other })
      else groups.set(key, [{ end, other }])
    }
  }

  for (const [key, group] of groups) {
    if (group.length < 2) continue
    const axis = isHorizontalSide(group[0]!.end.side) ? 'x' : 'y'
    group.sort((a, b) => origins.get(a.other)![axis] - origins.get(b.other)![axis])
    const { gap, padding } = group[0]!.end.spread!
    const [rangeStart, rangeEnd] = group[0]!.end.range
    const center = group.reduce((sum, { end }) => sum + origins.get(end)![axis], 0) / group.length
    const positions = spreadPositions(center, group.length, rangeStart + padding, rangeEnd - padding, gap)
    group.forEach(({ end }, i) => {
      end.point = { ...end.point, [axis]: positions[i]! }
      end.branchPortId = `${key}#${i}`
    })
  }
}

function resolvePort(block: BlockDescriptor, portId?: string): PortDescriptor {
  const port = portId ? block.ports?.find((candidate) => candidate.id === portId) : undefined
  return port ?? DEFAULT_PORT
}

/** Resolves a `string | HTMLElement | undefined` field (a CSS selector, a direct element, or "use the block itself"). */
function resolveWithin(el: HTMLElement, ref: string | HTMLElement | undefined): HTMLElement {
  if (typeof ref === 'string') return el.querySelector<HTMLElement>(ref) ?? el
  if (ref instanceof HTMLElement) return ref
  return el
}

function portElement(block: BlockDescriptor, port: PortDescriptor): HTMLElement {
  return resolveWithin(block.el, port.target)
}

function toLocal(point: Point, containerRect: DOMRect): Point {
  return { x: point.x - containerRect.left, y: point.y - containerRect.top }
}

// The standalone `translate` property rather than `transform`, so dragging
// composes with any transform the block element already has of its own
// instead of overwriting it.
function applyDragTransform(el: HTMLElement, offset: Point) {
  el.style.translate = offset.x || offset.y ? `${offset.x}px ${offset.y}px` : ''
}

/** Identifies a resolved endpoint by where it physically lands — two connections sharing a port on the same side get the same key. */
function endpointKey(blockId: string, point: Point): string {
  return `${blockId}:${Math.round(point.x)}:${Math.round(point.y)}`
}

function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** Resolves a `DragBounds` value into a live viewport-space rect, or `null` for "unconstrained" — recomputed on every drag move so a resizing/moving bounds element (or the container itself) is tracked live. */
function resolveDragBoundsRect(bounds: DragBounds | undefined, container: HTMLElement): Rect | null {
  if (!bounds) return null
  if (bounds === 'container') return container.getBoundingClientRect()
  if (bounds instanceof HTMLElement) return bounds.getBoundingClientRect()
  const rect = container.getBoundingClientRect()
  return {
    left: rect.left + (bounds.left ?? 0),
    top: rect.top + (bounds.top ?? 0),
    right: rect.right - (bounds.right ?? 0),
    bottom: rect.bottom - (bounds.bottom ?? 0),
  }
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function shallowEqual(a: object | undefined, b: object | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every((key) => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key])
}

function samePorts(a: readonly PortDescriptor[] | undefined, b: readonly PortDescriptor[] | undefined): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((port, index) => {
    const other = b[index]!
    if (port === other) return true
    const { spread: spreadA, side: sideA, ...restA } = port
    const { spread: spreadB, side: sideB, ...restB } = other
    const sameSide = Array.isArray(sideA) && Array.isArray(sideB) ? sameStrings(sideA, sideB) : sideA === sideB
    const sameSpread =
      typeof spreadA === 'object' && typeof spreadB === 'object' ? shallowEqual(spreadA, spreadB) : spreadA === spreadB
    return sameSide && sameSpread && shallowEqual(restA, restB)
  })
}

function sameDescriptor(a: BlockDescriptor, b: BlockDescriptor): boolean {
  if (a === b) return true
  const { ports: portsA, portSpread: spreadA, dragBounds: boundsA, ...restA } = a
  const { ports: portsB, portSpread: spreadB, dragBounds: boundsB, ...restB } = b
  if (!shallowEqual(restA, restB) || !samePorts(portsA, portsB)) return false
  const spreadSame =
    typeof spreadA === 'object' && typeof spreadB === 'object' ? shallowEqual(spreadA, spreadB) : spreadA === spreadB
  const boundsSame =
    typeof boundsA === 'object' &&
    typeof boundsB === 'object' &&
    !(boundsA instanceof HTMLElement) &&
    !(boundsB instanceof HTMLElement)
      ? shallowEqual(boundsA, boundsB)
      : boundsA === boundsB
  return spreadSame && boundsSame
}

function signatureOf(value: unknown): string | undefined {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return undefined
  }
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

export function createVisualLinker(container: HTMLElement, initialConfig: VisualLinkerConfig = {}): VisualLinker {
  let config: VisualLinkerConfig = mergeConfig<VisualLinkerConfig>(initialConfig)
  const routeCache = createRouteCache()

  const selectable = () => config.interaction?.selectable ?? false
  const showPorts = () => config.ports?.show ?? DEFAULT_SHOW_PORTS
  const connectEnabled = () => Boolean(config.interaction?.connect?.enabled)
  const clipMode = (): 'pin' | 'hide' | null => {
    const value = config.interaction?.clipToScrollParents
    return value === false ? null : value === 'hide' ? 'hide' : 'pin'
  }

  function resolveCurveGeometry(view: ConnectionStyle): CurveGeometryOptions {
    const bezier = view.bezier
    return {
      curvature: bezier?.curvature ?? DEFAULT_CURVE_GEOMETRY.curvature,
      minReach: bezier?.minReach ?? DEFAULT_CURVE_GEOMETRY.minReach,
      maxReach: bezier?.maxReach ?? DEFAULT_CURVE_GEOMETRY.maxReach,
      angleBlend: bezier?.angleBlend ?? DEFAULT_CURVE_GEOMETRY.angleBlend,
      maxAngleOffsetRad:
        bezier?.angleMaxOffset != null
          ? (bezier.angleMaxOffset * Math.PI) / 180
          : DEFAULT_CURVE_GEOMETRY.maxAngleOffsetRad,
    }
  }

  const blocks = new Map<string, BlockDescriptor>()
  const connections = new Map<string, ConnectionDescriptor>()
  const dragOffsets = new Map<string, Point>()
  const blockCleanups = new Map<string, () => void>()
  const built = new Map<string, BuiltPath>()
  let viewCache = new WeakMap<ConnectionDescriptor, { lines: unknown; view: ConnectionStyle }>()
  let geometryKeys = new WeakMap<object, string>()
  let labelKeys = new WeakMap<object, string>()
  let styleKeys = new WeakMap<object, string | undefined>()
  // Per-element clipping-ancestor chains: computing one needs getComputedStyle
  // up the tree, so it is cached until the block list changes.
  let clippingChains = new WeakMap<HTMLElement, ClippingAncestor[]>()
  let blocksVersion = 0
  let lastSmoothSig = ''
  let smoothResults = new Map<string, { points: Point[]; d: string }>()
  const smoothEntries = new Map<string, { inSig: string; points: Point[]; dSig?: string; d?: string }>()
  let lastRectKeys = new Map<string, { key: string; rect: ObstacleRect }>()
  let lastSmoothBlocksVersion = -1
  let handleInfos: HandleInfo[] = []
  let lastBlockRects = new Map<string, Rect>()
  let lastContainerRect: DOMRect | null = null
  let hoveredBlockId: string | null = null
  let batchDepth = 0
  let renderPending = false
  const renderTimes: number[] = []
  const stats: VisualLinkerStats = {
    blocks: 0,
    connections: 0,
    rendered: 0,
    culled: 0,
    proxied: 0,
    lastRenderMs: 0,
    medianRenderMs: 0,
    observedElements: 0,
  }

  function clippingChainOf(el: HTMLElement): ClippingAncestor[] {
    let chain = clippingChains.get(el)
    if (!chain) {
      chain = clippingAncestors(el, container)
      clippingChains.set(el, chain)
    }
    return chain
  }

  const listeners = new Map<keyof VisualLinkerEventMap, Set<(payload: unknown) => void>>()
  function emit<E extends keyof VisualLinkerEventMap>(event: E, payload: VisualLinkerEventMap[E]) {
    for (const handler of listeners.get(event) ?? []) handler(payload)
  }

  let selectedIds = new Set<string>()

  function applySelection(next: Set<string>, notify: boolean) {
    const changed = next.size !== selectedIds.size || [...next].some((id) => !selectedIds.has(id))
    selectedIds = next
    svg.setSelectedConnections(selectedIds)
    if (changed && notify) emit('connection:selectionchange', { selectedIds: [...selectedIds] })
  }

  /** A plain click/Enter selects just this connection; with a modifier (Ctrl/Cmd/Shift) it toggles it within the selection. */
  function selectFromInput(id: string, additive: boolean) {
    const next = additive ? new Set(selectedIds) : new Set([id])
    if (additive) {
      if (!next.delete(id)) next.add(id)
    }
    applySelection(next, true)
  }

  function pruneSelection() {
    const next = new Set([...selectedIds].filter((id) => connections.has(id)))
    if (next.size !== selectedIds.size) applySelection(next, true)
  }

  const isAdditive = (event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) =>
    event.ctrlKey || event.metaKey || event.shiftKey

  function handleByKey(key: string): HandleInfo | undefined {
    return handleInfos.find((handle) => handle.key === key)
  }

  const svg = createSvgLayer(
    container,
    {
      onConnectionEnter(id) {
        svg.setHoveredConnections([id])
        const connection = connections.get(id)
        if (connection) emit('connection:mouseenter', { connection })
      },
      onConnectionLeave(id) {
        svg.setHoveredConnections([])
        const connection = connections.get(id)
        if (connection) emit('connection:mouseleave', { connection })
      },
      onConnectionClick(id, event) {
        const connection = connections.get(id)
        if (!connection) return
        if (selectable()) selectFromInput(id, isAdditive(event))
        emit('connection:click', { connection })
      },
      onConnectionKeydown(id, event) {
        const connection = connections.get(id)
        if (!connection) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          selectFromInput(id, isAdditive(event))
          emit('connection:click', { connection })
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault()
          const targets = selectedIds.has(id)
            ? [...selectedIds].flatMap((selectedId) => connections.get(selectedId) ?? [])
            : [connection]
          emit('connection:delete-request', { connections: targets })
        }
      },
      onHandlePointerDown(key, event) {
        const handle = handleByKey(key)
        if (handle) connect.handlePointerDown(handle, event)
      },
      onHandleClick(key, event) {
        const handle = handleByKey(key)
        if (handle) connect.handleClick(handle, event)
      },
    },
    () => config,
  )

  function handleVisible(handle: HandleInfo): boolean {
    const mode = config.interaction?.connect?.handle ?? 'hover'
    if (mode === 'never') return false
    if (mode === 'always') return true
    return connect.isConnecting().active || hoveredBlockId === handle.endpoint.blockId
  }

  let handleStates = new Map<string, 'source' | 'candidate' | 'invalid' | 'target'>()

  function syncHandles() {
    if (!connectEnabled()) {
      svg.clearHandles()
      return
    }
    const inputs: SvgHandleInput[] = []
    for (const handle of handleInfos) {
      if (handle.hidden) continue
      inputs.push({
        key: handle.key,
        point: handle.point,
        endpoint: handle.endpoint,
        radius: HANDLE_MIN_RADIUS,
        state: handleStates.get(handle.key) ?? null,
        visible: handleVisible(handle),
      })
    }
    svg.setHandles(inputs)
  }

  function previewPath(from: BlockGeometry, toPoint: Point, toSide: FixedSide | null): string {
    const connectConfig = config.interaction?.connect
    const view = resolveLines(config.lines, connectConfig?.preview as ConnectionStyle | undefined)
    const curve = view.curve ?? DEFAULT_CURVE_TYPE
    const dx = toPoint.x - from.point.x
    const dy = toPoint.y - from.point.y
    const facing: FixedSide =
      toSide ??
      (Math.abs(dx) >= Math.abs(dy)
        ? dx >= 0
          ? VLFixedSideEnum.LEFT
          : VLFixedSideEnum.RIGHT
        : dy >= 0
          ? VLFixedSideEnum.TOP
          : VLFixedSideEnum.BOTTOM)
    if (curve === VLConnectionCurveEnum.STRAIGHT) return straightPath(from.point, toPoint)
    if (curve === VLConnectionCurveEnum.SMOOTHSTEP) {
      return roundedPolylinePath(
        smoothstepPoints(from.point, from.side, toPoint, facing, undefined, undefined),
        view.smoothstep?.cornerRadius ?? DEFAULT_CORNER_RADIUS,
      )
    }
    return bezierPath(from.point, from.side, toPoint, facing, resolveCurveGeometry(view))
  }

  function stylePreview() {
    const connectConfig = config.interaction?.connect
    const view = resolveLines(config.lines, {
      dashed: true,
      opacity: 0.8,
      ...(connectConfig?.preview as ConnectionStyle | undefined),
    })
    svg.stylePreview((el) => {
      el.style.stroke = view.color ?? ''
      el.style.strokeWidth = view.width != null ? String(view.width) : ''
      el.style.strokeDasharray = view.dashed ? '6 4' : 'none'
      el.style.opacity = view.opacity != null ? String(view.opacity) : ''
    })
  }

  function blockRoleOf(block: BlockDescriptor | undefined) {
    if (!block) return false
    return block.connect === undefined ? ('both' as const) : block.connect
  }

  const connect = createConnectController({
    container,
    config: () => config.interaction?.connect,
    connections: () => connections.values(),
    handles: () => handleInfos,
    hasBlock: (blockId) => blocks.has(blockId),
    hasPort: (blockId, portId) => Boolean(blocks.get(blockId)?.ports?.some((port) => port.id === portId)),
    blockRole: (blockId) => blockRoleOf(blocks.get(blockId)),
    portRole: (blockId, portId) => {
      const block = blocks.get(blockId)
      const port = block?.ports?.find((candidate) => candidate.id === portId)
      if (!block || !port) return false
      if (port.connect !== undefined) return port.connect
      return blockRoleOf(block)
    },
    blockElement: (blockId) => blocks.get(blockId)?.el,
    portElement: (blockId, portId) => {
      const block = blocks.get(blockId)
      if (!block) return undefined
      return portId === undefined ? block.el : portElement(block, resolvePort(block, portId))
    },
    blockAt(clientX, clientY) {
      const rect = lastContainerRect ?? container.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      let best: { id: string; area: number } | null = null
      for (const [id, box] of lastBlockRects) {
        if (blockRoleOf(blocks.get(id)) === false) continue
        if (x < box.left || x > box.right || y < box.top || y > box.bottom) continue
        const area = (box.right - box.left) * (box.bottom - box.top)
        if (!best || area < best.area) best = { id, area }
      }
      return best?.id
    },
    toLocal(clientX, clientY) {
      const rect = container.getBoundingClientRect()
      return { x: clientX - rect.left, y: clientY - rect.top }
    },
    blockGeometry(blockId, towards) {
      const box = lastBlockRects.get(blockId)
      if (!box) return null
      const center = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 }
      const side = resolveAutoSide(center, towards)
      const rect = {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.right - box.left,
        height: box.bottom - box.top,
      } as DOMRect
      return { point: sidePoint(rect, side, DEFAULT_PORT_OFFSET), side }
    },
    previewPath,
    setStates(states) {
      handleStates = states
      syncHandles()
    },
    setPreview: (d, validity) => svg.setPreview(d, validity),
    stylePreview,
    announce: (text) => svg.announce(text),
    emit,
    onStateChange() {
      syncHandles()
    },
  })

  connect.syncListeners()

  // A click anywhere outside the connection layer, or Escape, clears the selection.
  function onDocumentPointerDown(event: PointerEvent) {
    if (selectedIds.size === 0) return
    if (event.target instanceof Node && svg.contains(event.target)) return
    applySelection(new Set(), true)
  }
  function onDocumentKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && selectedIds.size > 0) applySelection(new Set(), true)
  }
  let selectionListenersOn = false
  function syncSelectionListeners() {
    const wanted = selectable()
    if (wanted === selectionListenersOn) return
    selectionListenersOn = wanted
    if (wanted) {
      document.addEventListener('pointerdown', onDocumentPointerDown, true)
      document.addEventListener('keydown', onDocumentKeydown)
    } else {
      document.removeEventListener('pointerdown', onDocumentPointerDown, true)
      document.removeEventListener('keydown', onDocumentKeydown)
    }
  }
  syncSelectionListeners()

  const watcher = createResizeWatcher(render)
  watcher.observe(container)

  function onViewportChange() {
    watcher.scheduleNow()
  }
  window.addEventListener('scroll', onViewportChange, { passive: true, capture: true })
  window.addEventListener('resize', onViewportChange, { passive: true })

  function incidentConnectionIds(blockId: string): string[] {
    const ids: string[] = []
    for (const [id, connection] of connections) {
      if (connection.from.blockId === blockId || connection.to.blockId === blockId) ids.push(id)
    }
    return ids
  }

  function attachBlockInteractivity(block: BlockDescriptor): () => void {
    const cleanups: (() => void)[] = []

    const onMouseEnter = () => {
      if (block.highlightable ?? config.interaction?.highlight ?? false) {
        svg.setHighlightedConnections(incidentConnectionIds(block.id))
      }
      if (connectEnabled() && hoveredBlockId !== block.id) {
        hoveredBlockId = block.id
        syncHandles()
      }
      emit('block:mouseenter', { blockId: block.id })
    }
    const onMouseLeave = () => {
      svg.setHighlightedConnections([])
      if (hoveredBlockId === block.id) {
        hoveredBlockId = null
        if (connectEnabled()) syncHandles()
      }
      emit('block:mouseleave', { blockId: block.id })
    }
    block.el.addEventListener('pointerenter', onMouseEnter)
    block.el.addEventListener('pointerleave', onMouseLeave)
    cleanups.push(() => {
      block.el.removeEventListener('pointerenter', onMouseEnter)
      block.el.removeEventListener('pointerleave', onMouseLeave)
    })

    const draggable = block.draggable ?? config.blocks?.draggable ?? DEFAULT_DRAGGABLE

    if (connectEnabled() && (config.interaction?.connect?.from ?? 'port') !== 'port') {
      const onBlockPointerDown = (event: PointerEvent) => {
        if ((event.target as Element | null)?.closest?.('[data-vl-handle]')) return
        connect.startFromBlock(block.id, event, Boolean(draggable))
      }
      const onBlockClick = (event: MouseEvent) => {
        if ((event.target as Element | null)?.closest?.('[data-vl-handle]')) return
        connect.clickBlock(block.id, event)
      }
      block.el.addEventListener('pointerdown', onBlockPointerDown)
      block.el.addEventListener('click', onBlockClick)
      cleanups.push(() => {
        block.el.removeEventListener('pointerdown', onBlockPointerDown)
        block.el.removeEventListener('click', onBlockClick)
      })
    }

    if (draggable) {
      const handle = resolveWithin(block.el, block.dragHandle)
      const bounds = block.dragBounds ?? config.blocks?.drag?.bounds
      handle.classList.add('vl-draggable')
      handle.style.touchAction = 'none'

      const onPointerDown = (event: PointerEvent) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return
        event.preventDefault()

        const startX = event.clientX
        const startY = event.clientY
        const startOffset = dragOffsets.get(block.id) ?? { x: 0, y: 0 }
        // The block's own current rect already includes startOffset's transform,
        // so subtracting it back out gives its untransformed base position —
        // the fixed point that dragGridSize's absolute grid (and dragBounds'
        // absolute box) are measured against, regardless of where the block
        // happened to start out on the page.
        const startRect = block.el.getBoundingClientRect()
        const basePosition = { x: startRect.left - startOffset.x, y: startRect.top - startOffset.y }
        if (typeof handle.setPointerCapture === 'function') handle.setPointerCapture(event.pointerId)
        handle.classList.add('vl-dragging')
        emit('block:dragstart', { blockId: block.id })

        const onPointerMove = (moveEvent: PointerEvent) => {
          let absX = basePosition.x + startOffset.x + (moveEvent.clientX - startX)
          let absY = basePosition.y + startOffset.y + (moveEvent.clientY - startY)
          const dragGridSize = config.blocks?.drag?.grid
          if (dragGridSize) {
            absX = snapToGrid(absX, dragGridSize)
            absY = snapToGrid(absY, dragGridSize)
          }
          // Resolved live (not once at drag-start) so a bounds element that
          // itself resizes/moves during the drag (or the container, on a
          // scroll/resize) is always respected with its current box.
          const boundsRect = resolveDragBoundsRect(bounds, container)
          if (boundsRect) {
            absX = clamp(absX, boundsRect.left, Math.max(boundsRect.left, boundsRect.right - startRect.width))
            absY = clamp(absY, boundsRect.top, Math.max(boundsRect.top, boundsRect.bottom - startRect.height))
          }
          const next = { x: absX - basePosition.x, y: absY - basePosition.y }
          dragOffsets.set(block.id, next)
          applyDragTransform(block.el, next)
          watcher.scheduleNow()
          emit('block:drag', { blockId: block.id, ...next })
        }
        const onPointerUp = (upEvent: PointerEvent) => {
          if (typeof handle.releasePointerCapture === 'function') handle.releasePointerCapture(upEvent.pointerId)
          handle.classList.remove('vl-dragging')
          handle.removeEventListener('pointermove', onPointerMove)
          handle.removeEventListener('pointerup', onPointerUp)
          handle.removeEventListener('pointercancel', onPointerUp)
          const final = dragOffsets.get(block.id) ?? startOffset
          emit('block:dragend', { blockId: block.id, ...final })
        }
        handle.addEventListener('pointermove', onPointerMove)
        handle.addEventListener('pointerup', onPointerUp)
        handle.addEventListener('pointercancel', onPointerUp)
      }
      handle.addEventListener('pointerdown', onPointerDown)
      cleanups.push(() => {
        handle.removeEventListener('pointerdown', onPointerDown)
        handle.classList.remove('vl-draggable')
      })
    }

    return () => cleanups.forEach((cleanup) => cleanup())
  }

  function centerOfRect(rect: DOMRect): Point {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  function centerOf(el: HTMLElement, pass: Pass): Point {
    const rect = pass.measure(el)
    return {
      x: rect.left + rect.width / 2 - pass.containerRect.left,
      y: rect.top + rect.height / 2 - pass.containerRect.top,
    }
  }

  function resolveEndpoint(
    blockId: string,
    portId: string | undefined,
    towards: Point,
    pass: Pass,
    proxied: boolean,
  ): ResolvedEnd | null {
    const block = blocks.get(blockId)
    if (!block) return null
    const { containerRect, measure } = pass

    const port = resolvePort(block, portId)
    const targetRect = measure(portElement(block, port))
    const anchorEl = port.anchorEl ?? (port.anchorBlockId ? blocks.get(port.anchorBlockId)?.el : undefined)
    const rect = anchorEl ? measure(anchorEl) : targetRect
    const anchorCenter = toLocal(centerOfRect(rect), containerRect)

    const sideSetting = port.side ?? config.ports?.side
    const side = Array.isArray(sideSetting)
      ? resolveAutoSide(anchorCenter, towards, sideSetting)
      : sideSetting && sideSetting !== VLFixedSideEnum.AUTO
        ? sideSetting
        : resolveAutoSide(anchorCenter, towards)
    const raw = anchorEl
      ? projectedSidePoint(rect, side, targetRect)
      : sidePoint(rect, side, port.offset ?? config.ports?.offset ?? DEFAULT_PORT_OFFSET)
    const range: [number, number] = isHorizontalSide(side)
      ? [rect.left - containerRect.left, rect.right - containerRect.left]
      : [rect.top - containerRect.top, rect.bottom - containerRect.top]

    let point = toLocal(raw, containerRect)
    let clipped = false
    const clip = clipMode()
    if (clip) {
      // The port's own element is what a scroller hides — a row inside a
      // scrolling block — so its ancestors decide, not the block's.
      const visible = visibleRect(clippingChainOf(portElement(block, port)), measure)
      if (visible) {
        const local = {
          left: visible.left - containerRect.left,
          top: visible.top - containerRect.top,
          right: visible.right - containerRect.left,
          bottom: visible.bottom - containerRect.top,
        }
        const probe = anchorEl ? toLocal(centerOfRect(targetRect), containerRect) : point
        if (clampToRect(probe, local).clipped) {
          if (clip === 'hide') return null
          point = clampToRect(point, local).point
          clipped = true
        }
      }
    }
    return {
      point,
      clipped,
      side,
      spread: resolveSpread(port.spread, block.portSpread, config.ports?.spread),
      range,
      blockId,
      portId,
      proxied,
    }
  }

  function effectiveRef(endpoint: ConnectionEndpoint): { blockId: string; portId?: string; proxied: boolean } | null {
    if (blocks.has(endpoint.blockId)) return { blockId: endpoint.blockId, portId: endpoint.portId, proxied: false }
    for (const candidate of endpoint.fallback ?? []) {
      const ref = typeof candidate === 'string' ? { blockId: candidate } : candidate
      if (blocks.has(ref.blockId)) return { blockId: ref.blockId, portId: ref.portId, proxied: true }
    }
    return null
  }

  function resolveSide(endpoint: ConnectionEndpoint, otherCenter: Point, pass: Pass): ResolvedEnd | null {
    const first = effectiveRef(endpoint)
    if (!first) return null
    const primary = resolveEndpoint(first.blockId, first.portId, otherCenter, pass, first.proxied)
    const fallbacks = endpoint.fallback
    if (!fallbacks || fallbacks.length === 0 || (primary && !primary.clipped)) return primary

    let best = primary
    for (const candidate of fallbacks) {
      const ref = typeof candidate === 'string' ? { blockId: candidate } : candidate
      if (ref.blockId === first.blockId && ref.portId === first.portId) continue
      if (!blocks.has(ref.blockId)) continue
      const resolved = resolveEndpoint(ref.blockId, ref.portId, otherCenter, pass, true)
      if (!resolved) continue
      if (!resolved.clipped) return resolved
      best ??= resolved
    }
    return best
  }

  function syncObservedElements() {
    const wanted = new Set<HTMLElement>([container])
    const include = (blockId: string) => {
      const block = blocks.get(blockId)
      if (block) wanted.add(block.el)
    }
    for (const connection of connections.values()) {
      for (const endpoint of [connection.from, connection.to]) {
        include(endpoint.blockId)
        for (const candidate of endpoint.fallback ?? []) {
          include(typeof candidate === 'string' ? candidate : candidate.blockId)
        }
      }
    }
    if (connectEnabled()) {
      for (const block of blocks.values()) {
        if (blockRoleOf(block) === false) continue
        if (
          block.ports?.some((port) => port.connect !== false) ||
          (config.interaction?.connect?.from ?? 'port') !== 'port'
        ) {
          wanted.add(block.el)
        }
      }
    }
    watcher.sync(wanted)
    stats.observedElements = watcher.size()
  }

  function portAccessibleAttributes() {
    return ['tabindex', 'role', 'aria-label'] as const
  }

  const a11yOriginals = new Map<HTMLElement, Record<string, string | null>>()
  const explicitLabels = new Set<HTMLElement>()

  function syncPortAccessibility() {
    const wanted = new Map<HTMLElement, string>()
    if (connectEnabled()) {
      for (const block of blocks.values()) {
        for (const port of block.ports ?? []) {
          const role = port.connect === undefined ? blockRoleOf(block) : port.connect
          if (role === false) continue
          const el = portElement(block, port)
          wanted.set(el, port.ariaLabel ?? `Port: ${block.id} / ${port.id}`)
          if (port.ariaLabel !== undefined) explicitLabels.add(el)
          else explicitLabels.delete(el)
        }
      }
    }
    for (const [el, saved] of [...a11yOriginals]) {
      if (wanted.has(el)) continue
      for (const name of portAccessibleAttributes()) {
        const original = saved[name]
        if (original === null || original === undefined) el.removeAttribute(name)
        else el.setAttribute(name, original)
      }
      a11yOriginals.delete(el)
    }
    for (const [el, label] of wanted) {
      if (!a11yOriginals.has(el)) {
        a11yOriginals.set(el, {
          tabindex: el.getAttribute('tabindex'),
          role: el.getAttribute('role'),
          'aria-label': el.getAttribute('aria-label'),
        })
      }
      const saved = a11yOriginals.get(el)!
      if (saved.tabindex === null) el.setAttribute('tabindex', '0')
      if (saved.role === null) el.setAttribute('role', 'button')
      if (explicitLabels.has(el) || saved['aria-label'] === null) el.setAttribute('aria-label', label)
    }
  }

  function setBlockList(next: BlockDescriptor[], force = false) {
    const previous = new Map(blocks)
    blocks.clear()
    clippingChains = new WeakMap()
    blocksVersion++
    for (const block of next) {
      const before = previous.get(block.id)
      blocks.set(block.id, block)
      if (!force && before && blockCleanups.has(block.id) && sameDescriptor(before, block)) {
        previous.delete(block.id)
        continue
      }
      blockCleanups.get(block.id)?.()
      blockCleanups.set(block.id, attachBlockInteractivity(block))
      previous.delete(block.id)
      const offset = dragOffsets.get(block.id)
      if (offset) applyDragTransform(block.el, offset)
    }
    for (const id of previous.keys()) {
      blockCleanups.get(id)?.()
      blockCleanups.delete(id)
      if (hoveredBlockId === id) hoveredBlockId = null
    }
    syncObservedElements()
    syncPortAccessibility()
  }

  function forgetDerived(connection?: ConnectionDescriptor) {
    if (!connection) {
      viewCache = new WeakMap()
      geometryKeys = new WeakMap()
      labelKeys = new WeakMap()
      styleKeys = new WeakMap()
      return
    }
    viewCache.delete(connection)
    if (connection.style) {
      styleKeys.delete(connection.style)
      if (connection.style.bezier) geometryKeys.delete(connection.style.bezier)
    }
    if (connection.labels) labelKeys.delete(connection.labels)
  }

  function viewOf(connection: ConnectionDescriptor): ConnectionStyle {
    const cached = viewCache.get(connection)
    if (cached && cached.lines === config.lines) return cached.view
    const view = resolveLines(config.lines, connection.style)
    viewCache.set(connection, { lines: config.lines, view })
    return view
  }

  function cachedKey(store: WeakMap<object, string>, value: object | undefined, build: () => string): string {
    if (!value) return ''
    let key = store.get(value)
    if (key === undefined) {
      key = build()
      store.set(value, key)
    }
    return key
  }

  function geometryKey(view: ConnectionStyle): string {
    return cachedKey(geometryKeys, view.bezier, () => signatureOf(view.bezier) ?? '')
  }

  function labelsKey(labels: ConnectionLabel[] | undefined): string {
    return cachedKey(labelKeys, labels, () => signatureOf(labels) ?? '')
  }

  function styleKeyOf(connection: ConnectionDescriptor): string | undefined {
    const style = connection.style
    if (!style) return undefined
    if (styleKeys.has(style)) return styleKeys.get(style)
    const key = signatureOf(style)
    styleKeys.set(style, key)
    return key
  }

  function newPass(): Pass {
    const rects = new Map<Element, DOMRect>()
    const measure = (el: Element): DOMRect => {
      let rect = rects.get(el)
      if (!rect) {
        rect = el.getBoundingClientRect()
        rects.set(el, rect)
      }
      return rect
    }
    return { containerRect: measure(container), measure }
  }

  function visibleLocalRect(pass: Pass): Rect {
    const margin = (() => {
      const cull = config.performance?.cull
      return typeof cull === 'object' ? (cull.margin ?? DEFAULT_CULL_MARGIN) : DEFAULT_CULL_MARGIN
    })()
    let clip: ClipRect = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
    const chain = clippingChainOf(container)
    const ancestors = visibleRect(chain, pass.measure)
    if (ancestors) {
      clip = {
        left: Math.max(clip.left, ancestors.left),
        top: Math.max(clip.top, ancestors.top),
        right: Math.min(clip.right, ancestors.right),
        bottom: Math.min(clip.bottom, ancestors.bottom),
      }
    }
    const { containerRect } = pass
    return {
      left: clip.left - containerRect.left - margin,
      top: clip.top - containerRect.top - margin,
      right: clip.right - containerRect.left + margin,
      bottom: clip.bottom - containerRect.top + margin,
    }
  }

  function computeHandles(pass: Pass) {
    handleInfos = []
    if (!connectEnabled()) return
    const { containerRect, measure } = pass
    const middle = { x: containerRect.width / 2, y: containerRect.height / 2 }
    for (const block of blocks.values()) {
      for (const port of block.ports ?? []) {
        const role = port.connect === undefined ? blockRoleOf(block) : port.connect
        if (role === false) continue
        const resolved = resolveEndpoint(block.id, port.id, middle, pass, false)
        const el = portElement(block, port)
        if (!resolved) {
          handleInfos.push({
            key: `${block.id}:${port.id}`,
            endpoint: { blockId: block.id, portId: port.id },
            role,
            point: toLocal(centerOfRect(measure(el)), containerRect),
            side: VLFixedSideEnum.RIGHT,
            el,
            hidden: true,
          })
          continue
        }
        handleInfos.push({
          key: `${block.id}:${port.id}`,
          endpoint: { blockId: block.id, portId: port.id },
          role,
          point: resolved.point,
          side: resolved.side,
          el,
          hidden: Boolean(resolved.clipped),
        })
      }
    }
  }

  function render() {
    const startedAt = performance.now()
    const pass = newPass()
    const { containerRect } = pass
    lastContainerRect = containerRect

    // Pass 1: resolve every connection's endpoints once, up front — the
    // 'smoothstep' branch-grouping pass below needs every sibling's resolved
    // point/side before it can decide where any one of them should branch.
    const resolved: Resolved[] = []
    for (const connection of connections.values()) {
      const fromRef = effectiveRef(connection.from)
      const toRef = effectiveRef(connection.to)
      if (!fromRef || !toRef) continue
      const fromBlock = blocks.get(fromRef.blockId)!
      const toBlock = blocks.get(toRef.blockId)!

      const fromCenter = centerOf(fromBlock.el, pass)
      const toCenter = centerOf(toBlock.el, pass)

      const from = resolveSide(connection.from, toCenter, pass)
      const to = resolveSide(connection.to, fromCenter, pass)
      if (!from || !to) continue

      const view = viewOf(connection)
      resolved.push({ connection, from, to, view, curve: view.curve ?? DEFAULT_CURVE_TYPE })
    }

    // Pass 1b: spread ports — runs before branching, which then treats each
    // virtual port as its own group (no shared trunk between spread lines).
    applyPortSpread(resolved)

    // Pass 2: group 'smoothstep' connections by shared (block, port, side) on
    // each end and pick every group's branch point — see computeBranchInfo.
    const smoothstepItems = resolved.filter((item) => item.curve === VLConnectionCurveEnum.SMOOTHSTEP)
    const branchEntries = (end: 'from' | 'to') =>
      smoothstepItems.map((item) => {
        const own = item[end]
        const other = end === 'from' ? item.to : item.from
        return {
          connectionId: item.connection.id,
          blockId: own.blockId,
          portId: own.branchPortId ?? own.portId,
          point: own.point,
          side: own.side,
          otherPoint: other.point,
          maxReach: item.view.smoothstep?.maxTrunkReach ?? DEFAULT_MAX_TRUNK_REACH,
        }
      })
    const fromBranches = computeBranchInfo(branchEntries('from'))
    const toBranches = computeBranchInfo(branchEntries('to'))

    // Every block's rect, measured once — only if some connection wants obstacle avoidance.
    let blockRects: { id: string; el: HTMLElement; rect: ObstacleRect }[] | null = null
    function allBlockRects() {
      blockRects ??= [...blocks.values()].map((block) => {
        const box = pass.measure(block.el)
        return {
          id: block.id,
          el: block.el,
          rect: {
            left: box.left - containerRect.left,
            top: box.top - containerRect.top,
            right: box.right - containerRect.left,
            bottom: box.bottom - containerRect.top,
          },
        }
      })
      return blockRects
    }

    computeHandles(pass)
    lastBlockRects = new Map()
    if (connectEnabled() && (config.interaction?.connect?.to ?? 'port') !== 'port') {
      for (const { id, rect } of allBlockRects()) lastBlockRects.set(id, rect)
    } else if (connectEnabled()) {
      for (const block of blocks.values()) {
        const box = pass.measure(block.el)
        lastBlockRects.set(block.id, {
          left: box.left - containerRect.left,
          top: box.top - containerRect.top,
          right: box.right - containerRect.left,
          bottom: box.bottom - containerRect.top,
        })
      }
    }

    const cullSetting = config.performance?.cull
    let drawable = resolved
    let culledCount = 0
    if (cullSetting) {
      const visible = visibleLocalRect(pass)
      drawable = resolved.filter((item) => {
        const slack = item.view.bezier?.maxReach ?? CURVE_SLACK
        const box = {
          left: Math.min(item.from.point.x, item.to.point.x) - slack,
          top: Math.min(item.from.point.y, item.to.point.y) - slack,
          right: Math.max(item.from.point.x, item.to.point.x) + slack,
          bottom: Math.max(item.from.point.y, item.to.point.y) + slack,
        }
        return rectsIntersect(box, visible)
      })
      culledCount = resolved.length - drawable.length
    }

    const performanceConfig = config.performance
    const maxObstacleBlocks = performanceConfig?.maxObstacleBlocks ?? DEFAULT_MAX_OBSTACLE_BLOCKS
    const maxRoutingNodes = performanceConfig?.maxRoutingNodes
    const jumpLimit = performanceConfig?.maxConnectionsForJumps ?? DEFAULT_MAX_CONNECTIONS_FOR_JUMPS

    function regionOf(item: Resolved): ObstacleRect {
      const { from, to } = item
      return {
        left: Math.min(from.point.x, to.point.x) - ROUTE_REGION_MARGIN,
        top: Math.min(from.point.y, to.point.y) - ROUTE_REGION_MARGIN,
        right: Math.max(from.point.x, to.point.x) + ROUTE_REGION_MARGIN,
        bottom: Math.max(from.point.y, to.point.y) + ROUTE_REGION_MARGIN,
      }
    }

    /** The blocks a connection has to route around: everything near it except its own endpoints' blocks and their DOM ancestors/descendants. */
    function obstaclesFor(item: Resolved, region: ObstacleRect): ObstacleRect[] {
      const { from, to } = item
      const fromEl = blocks.get(from.blockId)?.el
      const toEl = blocks.get(to.blockId)?.el
      const contains = (rect: ObstacleRect, p: Point) =>
        p.x > rect.left && p.x < rect.right && p.y > rect.top && p.y < rect.bottom
      const found: ObstacleRect[] = []
      for (const { id, el, rect } of allBlockRects()) {
        if (!(
          rect.right > region.left &&
          rect.left < region.right &&
          rect.bottom > region.top &&
          rect.top < region.bottom
        ))
          continue
        if (id === from.blockId || id === to.blockId) continue
        if (contains(rect, from.point) || contains(rect, to.point)) continue
        let related = false
        for (const end of [fromEl, toEl]) if (end && (el.contains(end) || end.contains(el))) related = true
        if (related) continue
        found.push(rect)
      }
      return found.length > maxObstacleBlocks ? [] : found
    }

    const smoothDrawable = drawable.filter((item) => item.curve === VLConnectionCurveEnum.SMOOTHSTEP)
    const jumpsRequested = smoothDrawable.filter(
      (item) => resolveJumpRadius(item.view.jumps, undefined) !== null,
    ).length
    const jumpsAllowed = jumpsRequested <= jumpLimit

    const anyAvoid = smoothDrawable.some((item) => item.view.routing?.avoidObstacles ?? false)
    const smoothSig = smoothDrawable.length
      ? [
          blocksVersion,
          jumpsAllowed ? 1 : 0,
          maxObstacleBlocks,
          maxRoutingNodes ?? '',
          anyAvoid
            ? allBlockRects()
                .map(({ id, rect }) => `${id}:${rect.left},${rect.top},${rect.right},${rect.bottom}`)
                .join(';')
            : '',
          ...smoothDrawable.map((item) => {
            const fromBranch = fromBranches.get(item.connection.id)
            const toBranch = toBranches.get(item.connection.id)
            return [
              item.connection.id,
              item.from.point.x,
              item.from.point.y,
              item.from.side,
              item.from.branchPortId ?? '',
              item.to.point.x,
              item.to.point.y,
              item.to.side,
              item.to.branchPortId ?? '',
              item.view.smoothstep?.cornerRadius ?? '',
              item.view.smoothstep?.maxTrunkReach ?? '',
              item.view.routing?.avoidObstacles ? 1 : 0,
              item.view.routing?.padding ?? '',
              signatureOf(item.view.jumps) ?? '',
              fromBranch ? 1 : 0,
              toBranch ? 1 : 0,
            ].join(',')
          }),
        ].join('|')
      : ''

    if (smoothSig !== lastSmoothSig) {
      lastSmoothSig = smoothSig
      smoothResults = new Map()
      const smoothPointsById = new Map<string, Point[]>()

      if (lastSmoothBlocksVersion !== blocksVersion) smoothEntries.clear()
      lastSmoothBlocksVersion = blocksVersion
      const changedRects: ObstacleRect[] = []
      if (anyAvoid) {
        const nextKeys = new Map<string, { key: string; rect: ObstacleRect }>()
        for (const { id, rect } of allBlockRects()) {
          const key = `${rect.left},${rect.top},${rect.right},${rect.bottom}`
          nextKeys.set(id, { key, rect })
          const before = lastRectKeys.get(id)
          if (!before) changedRects.push(rect)
          else if (before.key !== key) changedRects.push(before.rect, rect)
        }
        for (const [id, before] of lastRectKeys) if (!nextKeys.has(id)) changedRects.push(before.rect)
        lastRectKeys = nextKeys
      } else {
        lastRectKeys = new Map()
      }
      const touches = (region: ObstacleRect) =>
        changedRects.some(
          (rect) =>
            rect.right > region.left &&
            rect.left < region.right &&
            rect.bottom > region.top &&
            rect.top < region.bottom,
        )
      const liveSmooth = new Set(smoothDrawable.map((item) => item.connection.id))
      for (const id of smoothEntries.keys()) if (!liveSmooth.has(id)) smoothEntries.delete(id)

      // Every smoothstep polyline up front (obstacle-routed where asked) — the
      // line-jump pass below needs all of them before any single path is built.
      for (const item of smoothDrawable) {
        const { connection, from, to, view } = item
        const fromBranch = fromBranches.get(connection.id)
        const toBranch = toBranches.get(connection.id)
        const avoid = view.routing?.avoidObstacles ?? false
        const obstaclePadding = view.routing?.padding ?? DEFAULT_OBSTACLE_PADDING
        const inSig = [
          from.point.x,
          from.point.y,
          from.side,
          to.point.x,
          to.point.y,
          to.side,
          signatureOf(fromBranch) ?? '',
          signatureOf(toBranch) ?? '',
          avoid ? 1 : 0,
          obstaclePadding,
          maxObstacleBlocks,
          maxRoutingNodes ?? '',
        ].join(',')
        const region = avoid ? regionOf(item) : null
        const previous = smoothEntries.get(connection.id)
        if (previous && previous.inSig === inSig && (!region || !touches(region))) {
          smoothPointsById.set(connection.id, previous.points)
          continue
        }
        const obstacles = avoid ? obstaclesFor(item, region!) : []
        const padded = obstacles.map((rect) => inflate(rect, obstaclePadding))
        const points = smoothstepPoints(
          from.point,
          from.side,
          to.point,
          to.side,
          fromBranch,
          toBranch,
          obstacles.length === 0
            ? undefined
            : (start, startSide, end, endSide, plain) =>
                // A plain route that is already clear is kept exactly as is.
                pathIsClear(plain, padded)
                  ? plain
                  : (routeCache.route(start, startSide, end, endSide, obstacles, {
                      padding: obstaclePadding,
                      ...(maxRoutingNodes !== undefined ? { maxNodes: maxRoutingNodes } : {}),
                    }) ?? plain),
        )
        smoothEntries.set(connection.id, { inSig, points })
        smoothPointsById.set(connection.id, points)
      }

      // Line jumps: where a hopping line's horizontal stretch crosses another
      // connection's vertical one. Needs every polyline, hence the pre-pass.
      const cornerRadiusOf = (item: Resolved) => item.view.smoothstep?.cornerRadius ?? DEFAULT_CORNER_RADIUS
      const jumpPaths: JumpPath[] = smoothDrawable.map((item) => ({
        id: item.connection.id,
        points: smoothPointsById.get(item.connection.id)!,
        jumpRadius: jumpsAllowed ? resolveJumpRadius(item.view.jumps, undefined) : null,
        cornerRadius: cornerRadiusOf(item),
      }))
      const jumpsByPath = jumpPaths.some((path) => path.jumpRadius !== null) ? findJumps(jumpPaths) : new Map()
      const jumpRadiusById = new Map(jumpPaths.map((path) => [path.id, path.jumpRadius]))
      for (const item of smoothDrawable) {
        const id = item.connection.id
        const points = smoothPointsById.get(id)!
        const bySegment = jumpsByPath.get(id)
        const entry = smoothEntries.get(id)!
        const dSig = `${cornerRadiusOf(item)}|${bySegment ? `${jumpRadiusById.get(id) ?? 0}:${signatureOf([...bySegment])}` : ''}`
        if (entry.d === undefined || entry.dSig !== dSig) {
          entry.dSig = dSig
          entry.d = roundedPolylinePath(
            points,
            cornerRadiusOf(item),
            bySegment ? { radius: jumpRadiusById.get(id) ?? 0, bySegment } : undefined,
          )
        }
        smoothResults.set(id, { points, d: entry.d })
      }
    }

    // Pass 3: build the actual paths/port markers now that every branch point is known.
    const paths: SvgPathInput[] = []
    const portLayouts: PortLayout[] = []
    const portConnections = new Map<string, string[]>()
    const connectionLayouts: ConnectionLayout[] = []
    const labelInputs: SvgLabelInput[] = []
    const liveIds = new Set<string>()
    let proxiedCount = 0

    for (const { connection, from, to, view, curve } of drawable) {
      liveIds.add(connection.id)
      const smooth = smoothResults.get(connection.id)
      const wantsLabels = Boolean(connection.labels?.length)
      const sig =
        curve === VLConnectionCurveEnum.SMOOTHSTEP
          ? [curve, smooth!.d, labelsKey(connection.labels), from.clipped ? 1 : 0, to.clipped ? 1 : 0].join('|')
          : [
              curve,
              from.point.x,
              from.point.y,
              from.side,
              to.point.x,
              to.point.y,
              to.side,
              curve === VLConnectionCurveEnum.STRAIGHT ? '' : geometryKey(view),
              labelsKey(connection.labels),
              from.clipped ? 1 : 0,
              to.clipped ? 1 : 0,
              from.proxied ? 1 : 0,
              to.proxied ? 1 : 0,
            ].join('|')

      let entry = built.get(connection.id)
      if (!entry || entry.sig !== sig) {
        let d: string
        let mid: Point
        let fromAngle: number
        let toAngle: number
        // The path as a polyline, for placing labels along it (built only when needed).
        let polyline: Point[] | null = null
        if (curve === VLConnectionCurveEnum.STRAIGHT) {
          d = straightPath(from.point, to.point)
          mid = { x: (from.point.x + to.point.x) / 2, y: (from.point.y + to.point.y) / 2 }
          fromAngle = toAngle = angleDeg({ x: to.point.x - from.point.x, y: to.point.y - from.point.y })
          if (wantsLabels) polyline = [from.point, to.point]
        } else if (curve === VLConnectionCurveEnum.SMOOTHSTEP) {
          d = smooth!.d
          const points = smooth!.points
          mid = polylineMidpoint(points)
          ;({ fromAngle, toAngle } = polylineTangentAngles(points))
          polyline = points
        } else {
          const geometry = resolveCurveGeometry(view)
          d = bezierPath(from.point, from.side, to.point, to.side, geometry)
          mid = bezierMidpoint(from.point, from.side, to.point, to.side, geometry)
          ;({ fromAngle, toAngle } = bezierTangentAngles(from.point, from.side, to.point, to.side, geometry))
          if (wantsLabels) polyline = bezierPolyline(from.point, from.side, to.point, to.side, geometry)
        }
        const labels: LabelLayout[] = polyline
          ? (connection.labels ?? []).map((label) => layoutLabel(label, polyline))
          : []
        const inputs: SvgLabelInput[] = []
        for (const label of labels) {
          if (label.text) {
            inputs.push({
              key: `${connection.id}:${label.id}`,
              connectionId: connection.id,
              point: label.point,
              rotation: label.rotation,
              text: label.text,
              ...(label.className ? { className: label.className } : {}),
            })
          }
        }
        const proxied =
          from.proxied || to.proxied
            ? { ...(from.proxied ? { from: true } : {}), ...(to.proxied ? { to: true } : {}) }
            : undefined
        entry = {
          sig,
          d,
          labelInputs: inputs,
          layout: {
            id: connection.id,
            from: from.point,
            to: to.point,
            mid,
            fromAngle,
            toAngle,
            labels,
            fromClipped: from.clipped,
            toClipped: to.clipped,
            ...(proxied ? { proxied } : {}),
          },
        }
        built.set(connection.id, entry)
      }

      if (from.proxied || to.proxied) proxiedCount++
      paths.push({
        id: connection.id,
        d: entry.d,
        style: connection.style,
        styleKey: styleKeyOf(connection),
        proxied: from.proxied || to.proxied,
        fromKey: endpointKey(from.blockId, from.point),
        toKey: endpointKey(to.blockId, to.point),
        fromClipped: from.clipped,
        toClipped: to.clipped,
        hoverable: connection.hoverable,
        ariaLabel: connection.ariaLabel ?? `Connection: ${connection.from.blockId} → ${connection.to.blockId}`,
      })
      for (const input of entry.labelInputs) labelInputs.push(input)
      connectionLayouts.push(entry.layout)

      // Computed unconditionally (not gated by showPorts) so a `#port` slot
      // consumer can render custom content even with the built-in dot off.
      // A pinned (clipped) end is not a real port position, so it gets no dot either.
      for (const [end, hasExplicitMarker] of [
        [from, mergeMarkerInputs(config.markers?.start, connection.style?.markers?.start) !== undefined],
        [to, mergeMarkerInputs(config.markers?.end, connection.style?.markers?.end) !== undefined],
      ] as const) {
        // An explicit start/endMarker replaces the generic dot (and any
        // `#port` slot content) for that endpoint rather than layering under
        // it — otherwise the default dot/slot, at the same size/position,
        // visually hides a custom shape. `startMarker`/`endMarker: false`
        // counts as "explicit" too, even though it renders no native marker
        // either — it's the escape hatch for a Vue `#marker` slot to have a
        // bare point with nothing else drawn on top of or under it.
        if (hasExplicitMarker || end.clipped) continue
        // Keyed by the resolved physical point rather than the logical port id:
        // an 'auto'-side port can resolve to a different side per connection
        // (e.g. one target below, another far to the right), and each distinct
        // point earns its own marker — only truly-coincident points collapse.
        const key = endpointKey(end.blockId, end.point)
        const sharing = portConnections.get(key)
        if (sharing) {
          sharing.push(connection.id)
          continue
        }
        portConnections.set(key, [connection.id])
        portLayouts.push({ key, blockId: end.blockId, portId: end.portId, point: end.point })
      }
    }
    for (const id of built.keys()) if (!liveIds.has(id)) built.delete(id)

    const portInputs: SvgPortInput[] = showPorts()
      ? portLayouts.map((port) => ({
          key: port.key,
          point: port.point,
          connectionIds: portConnections.get(port.key) ?? [],
        }))
      : []
    svg.resize(containerRect.width, containerRect.height)
    stats.rendered = svg.update(paths, portInputs, labelInputs)
    syncHandles()
    connect.refresh()

    stats.blocks = blocks.size
    stats.connections = connections.size
    stats.culled = culledCount
    stats.proxied = proxiedCount
    stats.lastRenderMs = performance.now() - startedAt
    renderTimes.push(stats.lastRenderMs)
    if (renderTimes.length > RENDER_WINDOW) renderTimes.shift()
    stats.medianRenderMs = median(renderTimes)
    stats.observedElements = watcher.size()
    emit('layout', { connections: connectionLayouts, ports: portLayouts })
  }

  function requestRender() {
    if (batchDepth > 0) {
      renderPending = true
      return
    }
    render()
  }

  function applyConfigChange() {
    syncSelectionListeners()
    connect.syncListeners()
    if (!selectable() && selectedIds.size > 0) applySelection(new Set(), true)
    setBlockList([...blocks.values()], true)
    svg.applyConfig()
    requestRender()
  }

  return {
    setBlocks(next) {
      setBlockList(next)
      requestRender()
    },
    setConnections(next) {
      connections.clear()
      for (const connection of next) {
        forgetDerived(connection)
        connections.set(connection.id, connection)
      }
      syncObservedElements()
      pruneSelection()
      requestRender()
    },
    updateBlock(id, patch) {
      const block = blocks.get(id)
      if (!block) return
      setBlockList([...blocks.values()].map((existing) => (existing.id === id ? { ...existing, ...patch } : existing)))
      requestRender()
    },
    addBlock(block) {
      setBlockList([...[...blocks.values()].filter((existing) => existing.id !== block.id), block])
      requestRender()
    },
    removeBlock(id) {
      if (!blocks.has(id)) return
      setBlockList([...blocks.values()].filter((existing) => existing.id !== id))
      requestRender()
    },
    addConnection(connection) {
      forgetDerived(connection)
      connections.set(connection.id, connection)
      syncObservedElements()
      requestRender()
    },
    removeConnection(id) {
      connections.delete(id)
      syncObservedElements()
      pruneSelection()
      requestRender()
    },
    setSelectedConnections(ids) {
      applySelection(new Set(ids), false)
    },
    setConfig(patch) {
      config = patchConfig(config, patch)
      applyConfigChange()
    },
    replaceConfig(next) {
      config = mergeConfig<VisualLinkerConfig>(next)
      applyConfigChange()
    },
    getConfig() {
      return mergeConfig<VisualLinkerConfig>(config)
    },
    refresh() {
      forgetDerived()
      render()
    },
    batch(fn) {
      batchDepth++
      try {
        fn()
      } finally {
        batchDepth--
        if (batchDepth === 0 && renderPending) {
          renderPending = false
          render()
        }
      }
    },
    getStats: () => ({ ...stats }),
    startConnect: (from) => connect.start(from),
    completeConnect: (to) => connect.complete(to),
    cancelConnect: (reason) => connect.cancel(reason),
    isConnecting: () => connect.isConnecting(),
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      const set = listeners.get(event)!
      set.add(handler as (payload: unknown) => void)
      return () => set.delete(handler as (payload: unknown) => void)
    },
    destroy() {
      connect.destroy()
      window.removeEventListener('scroll', onViewportChange, true)
      window.removeEventListener('resize', onViewportChange)
      document.removeEventListener('pointerdown', onDocumentPointerDown, true)
      document.removeEventListener('keydown', onDocumentKeydown)
      selectionListenersOn = false
      for (const cleanup of blockCleanups.values()) cleanup()
      blockCleanups.clear()
      connections.clear()
      blocks.clear()
      syncPortAccessibility()
      watcher.destroy()
      svg.destroy()
      dragOffsets.clear()
      built.clear()
      listeners.clear()
    },
  }
}
