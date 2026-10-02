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
import { clampToRect, clippingAncestors, visibleRect, type ClippingAncestor } from './clipping'
import { createResizeWatcher } from './resize-watcher'
import { findJumps, resolveJumpRadius, type JumpPath } from './jumps'
import { layoutLabel } from './path-sampling'
import { createRouteCache, inflate, pathIsClear, type ObstacleRect } from './routing'
import { resolveSpread, spreadPositions, type ResolvedSpread } from './spread'
import { createSvgLayer, type SvgLabelInput, type SvgPathInput, type SvgPortInput } from './svg-layer'
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
  ConnectionDescriptor,
  ConnectionEndpoint,
  ConnectionLayout,
  ConnectionStyle,
  DragBounds,
  FixedSide,
  PortDescriptor,
  PortLayout,
  VisualLinkerConfig,
  VisualLinkerEventMap,
} from './types'

export interface VisualLinker {
  setBlocks(blocks: BlockDescriptor[]): void
  setConnections(connections: ConnectionDescriptor[]): void
  updateBlock(id: string, patch: Partial<Omit<BlockDescriptor, 'id'>>): void
  addConnection(connection: ConnectionDescriptor): void
  removeConnection(id: string): void
  /** Sets the selected connections (`selectable` mode) — for controlled use; does not emit `connection:selectionchange`. */
  setSelectedConnections(ids: readonly string[]): void
  setConfig(patch: VisualLinkerConfig): void
  replaceConfig(next: VisualLinkerConfig): void
  getConfig(): VisualLinkerConfig
  /** Forces an immediate path recalculation, bypassing the rAF batching (e.g. right before a screenshot). */
  refresh(): void
  on<E extends keyof VisualLinkerEventMap>(event: E, handler: (payload: VisualLinkerEventMap[E]) => void): () => void
  destroy(): void
}

const DEFAULT_PORT: PortDescriptor = { id: '__default__' }

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
    for (const [endpoint, end, other] of [
      [item.connection.from, item.from, item.to],
      [item.connection.to, item.to, item.from],
    ] as const) {
      if (!end.spread) continue
      const key = `${endpoint.blockId}:${endpoint.portId ?? DEFAULT_PORT.id}:${end.side}`
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
function endpointKey(endpoint: ConnectionEndpoint, point: Point): string {
  return `${endpoint.blockId}:${Math.round(point.x)}:${Math.round(point.y)}`
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

export function createVisualLinker(container: HTMLElement, initialConfig: VisualLinkerConfig = {}): VisualLinker {
  let config: VisualLinkerConfig = mergeConfig<VisualLinkerConfig>(initialConfig)
  const routeCache = createRouteCache()

  const selectable = () => config.interaction?.selectable ?? false
  const showPorts = () => config.ports?.show ?? DEFAULT_SHOW_PORTS
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
  // Per-element clipping-ancestor chains: computing one needs getComputedStyle
  // up the tree, so it is cached until the block list changes.
  let clippingChains = new WeakMap<HTMLElement, ClippingAncestor[]>()

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
    },
    () => config,
  )

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
      emit('block:mouseenter', { blockId: block.id })
    }
    const onMouseLeave = () => {
      svg.setHighlightedConnections([])
      emit('block:mouseleave', { blockId: block.id })
    }
    block.el.addEventListener('pointerenter', onMouseEnter)
    block.el.addEventListener('pointerleave', onMouseLeave)
    cleanups.push(() => {
      block.el.removeEventListener('pointerenter', onMouseEnter)
      block.el.removeEventListener('pointerleave', onMouseLeave)
    })

    const draggable = block.draggable ?? config.blocks?.draggable ?? DEFAULT_DRAGGABLE
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

  function centerOf(el: HTMLElement, containerRect: DOMRect): Point {
    const rect = el.getBoundingClientRect()
    return { x: rect.left + rect.width / 2 - containerRect.left, y: rect.top + rect.height / 2 - containerRect.top }
  }

  function resolveEndpoint(endpoint: ConnectionEndpoint, towards: Point, containerRect: DOMRect): ResolvedEnd | null {
    const block = blocks.get(endpoint.blockId)
    if (!block) return null

    const port = resolvePort(block, endpoint.portId)
    const targetRect = portElement(block, port).getBoundingClientRect()
    const anchorEl = port.anchorEl ?? (port.anchorBlockId ? blocks.get(port.anchorBlockId)?.el : undefined)
    const rect = anchorEl ? anchorEl.getBoundingClientRect() : targetRect
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
      const visible = visibleRect(clippingChainOf(portElement(block, port)))
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
    }
  }

  function syncObservedElements() {
    watcher.unobserveAll()
    watcher.observe(container)
    for (const block of blocks.values()) watcher.observe(block.el)
  }

  function setBlockList(next: BlockDescriptor[]) {
    for (const cleanup of blockCleanups.values()) cleanup()
    blockCleanups.clear()
    blocks.clear()
    clippingChains = new WeakMap()
    for (const block of next) {
      blocks.set(block.id, block)
      blockCleanups.set(block.id, attachBlockInteractivity(block))
      const offset = dragOffsets.get(block.id)
      if (offset) applyDragTransform(block.el, offset)
    }
    syncObservedElements()
  }

  function render() {
    const containerRect = container.getBoundingClientRect()
    svg.resize(containerRect.width, containerRect.height)

    // Pass 1: resolve every connection's endpoints once, up front — the
    // 'smoothstep' branch-grouping pass below needs every sibling's resolved
    // point/side before it can decide where any one of them should branch.
    const resolved: {
      connection: ConnectionDescriptor
      from: ResolvedEnd
      to: ResolvedEnd
      view: ConnectionStyle
      curve: ConnectionStyle['curve']
    }[] = []
    for (const connection of connections.values()) {
      const fromBlock = blocks.get(connection.from.blockId)
      const toBlock = blocks.get(connection.to.blockId)
      if (!fromBlock || !toBlock) continue

      const fromCenter = centerOf(fromBlock.el, containerRect)
      const toCenter = centerOf(toBlock.el, containerRect)

      const from = resolveEndpoint(connection.from, toCenter, containerRect)
      const to = resolveEndpoint(connection.to, fromCenter, containerRect)
      if (!from || !to) continue

      const view = resolveLines(config.lines, connection.style)
      resolved.push({ connection, from, to, view, curve: view.curve ?? DEFAULT_CURVE_TYPE })
    }

    // Pass 1b: spread ports — runs before branching, which then treats each
    // virtual port as its own group (no shared trunk between spread lines).
    applyPortSpread(resolved)

    // Pass 2: group 'smoothstep' connections by shared (block, port, side) on
    // each end and pick every group's branch point — see computeBranchInfo.
    const smoothstepItems = resolved.filter((item) => item.curve === VLConnectionCurveEnum.SMOOTHSTEP)
    const fromBranches = computeBranchInfo(
      smoothstepItems.map((item) => ({
        connectionId: item.connection.id,
        blockId: item.connection.from.blockId,
        portId: item.from.branchPortId ?? item.connection.from.portId,
        point: item.from.point,
        side: item.from.side,
        otherPoint: item.to.point,
        maxReach: item.view.smoothstep?.maxTrunkReach ?? DEFAULT_MAX_TRUNK_REACH,
      })),
    )
    const toBranches = computeBranchInfo(
      smoothstepItems.map((item) => ({
        connectionId: item.connection.id,
        blockId: item.connection.to.blockId,
        portId: item.to.branchPortId ?? item.connection.to.portId,
        point: item.to.point,
        side: item.to.side,
        otherPoint: item.from.point,
        maxReach: item.view.smoothstep?.maxTrunkReach ?? DEFAULT_MAX_TRUNK_REACH,
      })),
    )

    // Pass 3: build the actual paths/port markers now that every branch point is known.
    const paths: SvgPathInput[] = []
    const portLayouts: PortLayout[] = []
    const portConnections = new Map<string, string[]>()
    const connectionLayouts: ConnectionLayout[] = []
    const labelInputs: SvgLabelInput[] = []

    // Every block's rect, measured once — only if some connection wants obstacle avoidance.
    let blockRects: { id: string; el: HTMLElement; rect: ObstacleRect }[] | null = null
    function allBlockRects() {
      blockRects ??= [...blocks.values()].map((block) => {
        const box = block.el.getBoundingClientRect()
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

    /** The blocks a connection has to route around: everything near it except its own endpoints' blocks and their DOM ancestors/descendants. */
    function obstaclesFor(connection: ConnectionDescriptor, from: ResolvedEnd, to: ResolvedEnd): ObstacleRect[] {
      const fromEl = blocks.get(connection.from.blockId)?.el
      const toEl = blocks.get(connection.to.blockId)?.el
      const region = {
        left: Math.min(from.point.x, to.point.x) - ROUTE_REGION_MARGIN,
        top: Math.min(from.point.y, to.point.y) - ROUTE_REGION_MARGIN,
        right: Math.max(from.point.x, to.point.x) + ROUTE_REGION_MARGIN,
        bottom: Math.max(from.point.y, to.point.y) + ROUTE_REGION_MARGIN,
      }
      const contains = (rect: ObstacleRect, p: Point) =>
        p.x > rect.left && p.x < rect.right && p.y > rect.top && p.y < rect.bottom
      return allBlockRects()
        .filter(({ id, el, rect }) => {
          if (id === connection.from.blockId || id === connection.to.blockId) return false
          for (const end of [fromEl, toEl]) if (end && (el.contains(end) || end.contains(el))) return false
          if (contains(rect, from.point) || contains(rect, to.point)) return false
          return (
            rect.right > region.left && rect.left < region.right && rect.bottom > region.top && rect.top < region.bottom
          )
        })
        .map(({ rect }) => rect)
    }

    // Every smoothstep polyline up front (obstacle-routed where asked) — the
    // line-jump pass below needs all of them before any single path is built.
    const smoothPointsById = new Map<string, Point[]>()
    for (const { connection, from, to, view, curve } of resolved) {
      if (curve !== VLConnectionCurveEnum.SMOOTHSTEP) continue
      const fromBranch = fromBranches.get(connection.id)
      const toBranch = toBranches.get(connection.id)
      const avoid = view.routing?.avoidObstacles ?? false
      const obstaclePadding = view.routing?.padding ?? DEFAULT_OBSTACLE_PADDING
      const obstacles = avoid ? obstaclesFor(connection, from, to) : []
      const padded = obstacles.map((rect) => inflate(rect, obstaclePadding))
      smoothPointsById.set(
        connection.id,
        smoothstepPoints(
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
                  : (routeCache.route(start, startSide, end, endSide, obstacles, { padding: obstaclePadding }) ??
                    plain),
        ),
      )
    }

    // Line jumps: where a hopping line's horizontal stretch crosses another
    // connection's vertical one. Needs every polyline, hence the pre-pass.
    const viewById = new Map(resolved.map((item) => [item.connection.id, item.view]))
    const cornerRadiusOf = (connection: ConnectionDescriptor) =>
      viewById.get(connection.id)?.smoothstep?.cornerRadius ?? DEFAULT_CORNER_RADIUS
    const jumpPaths: JumpPath[] = resolved.flatMap(({ connection }) => {
      const points = smoothPointsById.get(connection.id)
      if (!points) return []
      return [
        {
          id: connection.id,
          points,
          jumpRadius: resolveJumpRadius(viewById.get(connection.id)?.jumps, undefined),
          cornerRadius: cornerRadiusOf(connection),
        },
      ]
    })
    const jumpsByPath = jumpPaths.some((path) => path.jumpRadius !== null) ? findJumps(jumpPaths) : new Map()
    const jumpRadiusById = new Map(jumpPaths.map((path) => [path.id, path.jumpRadius]))

    for (const { connection, from, to, view, curve } of resolved) {
      const smoothPoints = smoothPointsById.get(connection.id) ?? null
      const bySegment = jumpsByPath.get(connection.id)
      const d =
        curve === VLConnectionCurveEnum.STRAIGHT
          ? straightPath(from.point, to.point)
          : smoothPoints
            ? roundedPolylinePath(
                smoothPoints,
                cornerRadiusOf(connection),
                bySegment ? { radius: jumpRadiusById.get(connection.id) ?? 0, bySegment } : undefined,
              )
            : bezierPath(from.point, from.side, to.point, to.side, resolveCurveGeometry(view))
      paths.push({
        id: connection.id,
        d,
        style: connection.style,
        fromKey: endpointKey(connection.from, from.point),
        toKey: endpointKey(connection.to, to.point),
        fromClipped: from.clipped,
        toClipped: to.clipped,
        hoverable: connection.hoverable,
        ariaLabel: connection.ariaLabel ?? `Connection: ${connection.from.blockId} → ${connection.to.blockId}`,
      })

      let mid: Point
      let fromAngle: number
      let toAngle: number
      // The path as a polyline, for placing labels along it (built only when needed).
      let polyline: Point[] | null = null
      const wantsLabels = Boolean(connection.labels?.length)
      if (curve === VLConnectionCurveEnum.STRAIGHT) {
        mid = { x: (from.point.x + to.point.x) / 2, y: (from.point.y + to.point.y) / 2 }
        fromAngle = toAngle = angleDeg({ x: to.point.x - from.point.x, y: to.point.y - from.point.y })
        if (wantsLabels) polyline = [from.point, to.point]
      } else if (curve === VLConnectionCurveEnum.SMOOTHSTEP) {
        const points = smoothPoints!
        mid = polylineMidpoint(points)
        ;({ fromAngle, toAngle } = polylineTangentAngles(points))
        polyline = points
      } else {
        const geometry = resolveCurveGeometry(view)
        mid = bezierMidpoint(from.point, from.side, to.point, to.side, geometry)
        ;({ fromAngle, toAngle } = bezierTangentAngles(from.point, from.side, to.point, to.side, geometry))
        if (wantsLabels) polyline = bezierPolyline(from.point, from.side, to.point, to.side, geometry)
      }
      const labels = polyline ? (connection.labels ?? []).map((label) => layoutLabel(label, polyline)) : []
      for (const label of labels) {
        if (label.text) {
          labelInputs.push({
            key: `${connection.id}:${label.id}`,
            connectionId: connection.id,
            point: label.point,
            rotation: label.rotation,
            text: label.text,
            ...(label.className ? { className: label.className } : {}),
          })
        }
      }
      connectionLayouts.push({
        id: connection.id,
        from: from.point,
        to: to.point,
        mid,
        fromAngle,
        toAngle,
        labels,
        fromClipped: from.clipped,
        toClipped: to.clipped,
      })

      // Computed unconditionally (not gated by showPorts) so a `#port` slot
      // consumer can render custom content even with the built-in dot off.
      // A pinned (clipped) end is not a real port position, so it gets no dot either.
      for (const [endpoint, r, hasExplicitMarker] of [
        [
          connection.from,
          from,
          mergeMarkerInputs(config.markers?.start, connection.style?.markers?.start) !== undefined,
        ],
        [connection.to, to, mergeMarkerInputs(config.markers?.end, connection.style?.markers?.end) !== undefined],
      ] as const) {
        // An explicit start/endMarker replaces the generic dot (and any
        // `#port` slot content) for that endpoint rather than layering under
        // it — otherwise the default dot/slot, at the same size/position,
        // visually hides a custom shape. `startMarker`/`endMarker: false`
        // counts as "explicit" too, even though it renders no native marker
        // either — it's the escape hatch for a Vue `#marker` slot to have a
        // bare point with nothing else drawn on top of or under it.
        if (hasExplicitMarker || r.clipped) continue
        // Keyed by the resolved physical point rather than the logical port id:
        // an 'auto'-side port can resolve to a different side per connection
        // (e.g. one target below, another far to the right), and each distinct
        // point earns its own marker — only truly-coincident points collapse.
        const key = endpointKey(endpoint, r.point)
        const sharing = portConnections.get(key)
        if (sharing) {
          sharing.push(connection.id)
          continue
        }
        portConnections.set(key, [connection.id])
        portLayouts.push({ key, blockId: endpoint.blockId, portId: endpoint.portId, point: r.point })
      }
    }

    const portInputs: SvgPortInput[] = showPorts()
      ? portLayouts.map((port) => ({
          key: port.key,
          point: port.point,
          connectionIds: portConnections.get(port.key) ?? [],
        }))
      : []
    svg.update(paths, portInputs, labelInputs)
    emit('layout', { connections: connectionLayouts, ports: portLayouts })
  }

  function applyConfigChange() {
    syncSelectionListeners()
    if (!selectable() && selectedIds.size > 0) applySelection(new Set(), true)
    setBlockList([...blocks.values()])
    svg.applyConfig()
    render()
  }

  return {
    setBlocks(next) {
      setBlockList(next)
      render()
    },
    setConnections(next) {
      connections.clear()
      for (const connection of next) connections.set(connection.id, connection)
      pruneSelection()
      render()
    },
    updateBlock(id, patch) {
      const block = blocks.get(id)
      if (!block) return
      setBlockList([...blocks.values()].map((existing) => (existing.id === id ? { ...existing, ...patch } : existing)))
      render()
    },
    addConnection(connection) {
      connections.set(connection.id, connection)
      render()
    },
    removeConnection(id) {
      connections.delete(id)
      pruneSelection()
      render()
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
    refresh: render,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      const set = listeners.get(event)!
      set.add(handler as (payload: unknown) => void)
      return () => set.delete(handler as (payload: unknown) => void)
    },
    destroy() {
      window.removeEventListener('scroll', onViewportChange, true)
      window.removeEventListener('resize', onViewportChange)
      document.removeEventListener('pointerdown', onDocumentPointerDown, true)
      document.removeEventListener('keydown', onDocumentKeydown)
      selectionListenersOn = false
      for (const cleanup of blockCleanups.values()) cleanup()
      blockCleanups.clear()
      watcher.destroy()
      svg.destroy()
      blocks.clear()
      connections.clear()
      dragOffsets.clear()
      listeners.clear()
    },
  }
}
