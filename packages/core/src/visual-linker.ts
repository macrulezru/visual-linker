import {
  bezierPath,
  DEFAULT_CURVE_GEOMETRY,
  projectedSidePoint,
  resolveAutoSide,
  sidePoint,
  straightPath,
  type CurveGeometryOptions,
  type Point,
} from './geometry'
import { computeBranchInfo, smoothstepPath } from './orthogonal'
import { createResizeWatcher } from './resize-watcher'
import { createSvgLayer } from './svg-layer'
import {
  DEFAULT_CORNER_RADIUS,
  DEFAULT_CURVE_TYPE,
  DEFAULT_DRAGGABLE,
  DEFAULT_MAX_TRUNK_REACH,
  DEFAULT_PORT_OFFSET,
  DEFAULT_SHOW_PORTS,
} from './params'
import { VLConnectionCurveEnum, VLFixedSideEnum } from './enums'
import type {
  BlockDescriptor,
  ConnectionDescriptor,
  ConnectionEndpoint,
  ConnectionStyle,
  FixedSide,
  PortDescriptor,
  VisualLinkerEventMap,
  VisualLinkerOptions,
} from './types'

export interface VisualLinker {
  setBlocks(blocks: BlockDescriptor[]): void
  setConnections(connections: ConnectionDescriptor[]): void
  updateBlock(id: string, patch: Partial<Omit<BlockDescriptor, 'id'>>): void
  addConnection(connection: ConnectionDescriptor): void
  removeConnection(id: string): void
  /** Forces an immediate path recalculation, bypassing the rAF batching (e.g. right before a screenshot). */
  refresh(): void
  on<E extends keyof VisualLinkerEventMap>(event: E, handler: (payload: VisualLinkerEventMap[E]) => void): () => void
  destroy(): void
}

const DEFAULT_PORT: PortDescriptor = { id: '__default__', side: VLFixedSideEnum.AUTO, offset: DEFAULT_PORT_OFFSET }

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

function applyDragTransform(el: HTMLElement, offset: Point) {
  el.style.transform = offset.x || offset.y ? `translate(${offset.x}px, ${offset.y}px)` : ''
}

export function createVisualLinker(container: HTMLElement, options: VisualLinkerOptions = {}): VisualLinker {
  const defaultCurve = options.defaultCurve ?? DEFAULT_CURVE_TYPE
  const showPorts = options.showPorts ?? DEFAULT_SHOW_PORTS
  const draggableDefault = options.draggable ?? DEFAULT_DRAGGABLE
  const cornerRadiusDefault = options.defaultCornerRadius ?? DEFAULT_CORNER_RADIUS
  const maxTrunkReachDefault = options.defaultMaxTrunkReach ?? DEFAULT_MAX_TRUNK_REACH
  const curveDefaults: CurveGeometryOptions = {
    curvature: options.defaultCurvature ?? DEFAULT_CURVE_GEOMETRY.curvature,
    minReach: options.defaultCurveMinReach ?? DEFAULT_CURVE_GEOMETRY.minReach,
    maxReach: options.defaultCurveMaxReach ?? DEFAULT_CURVE_GEOMETRY.maxReach,
    angleBlend: options.defaultCurveAngleBlend ?? DEFAULT_CURVE_GEOMETRY.angleBlend,
    maxAngleOffsetRad:
      options.defaultCurveAngleMaxOffset != null
        ? (options.defaultCurveAngleMaxOffset * Math.PI) / 180
        : DEFAULT_CURVE_GEOMETRY.maxAngleOffsetRad,
  }

  function resolveCurveGeometry(style: ConnectionStyle | undefined): CurveGeometryOptions {
    return {
      curvature: style?.curvature ?? curveDefaults.curvature,
      minReach: style?.curveMinReach ?? curveDefaults.minReach,
      maxReach: style?.curveMaxReach ?? curveDefaults.maxReach,
      angleBlend: style?.curveAngleBlend ?? curveDefaults.angleBlend,
      maxAngleOffsetRad:
        style?.curveAngleMaxOffset != null
          ? (style.curveAngleMaxOffset * Math.PI) / 180
          : curveDefaults.maxAngleOffsetRad,
    }
  }

  const blocks = new Map<string, BlockDescriptor>()
  const connections = new Map<string, ConnectionDescriptor>()
  const dragOffsets = new Map<string, Point>()
  const blockCleanups = new Map<string, () => void>()

  const listeners = new Map<keyof VisualLinkerEventMap, Set<(payload: unknown) => void>>()
  function emit<E extends keyof VisualLinkerEventMap>(event: E, payload: VisualLinkerEventMap[E]) {
    for (const handler of listeners.get(event) ?? []) handler(payload)
  }

  const svg = createSvgLayer(container, {
    onConnectionEnter(id) {
      svg.setActiveConnections([id])
      const connection = connections.get(id)
      if (connection) emit('connection:mouseenter', { connection })
    },
    onConnectionLeave(id) {
      svg.setActiveConnections([])
      const connection = connections.get(id)
      if (connection) emit('connection:mouseleave', { connection })
    },
    onConnectionClick(id) {
      const connection = connections.get(id)
      if (connection) emit('connection:click', { connection })
    },
  })
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
      svg.setActiveConnections(incidentConnectionIds(block.id))
      emit('block:mouseenter', { blockId: block.id })
    }
    const onMouseLeave = () => {
      svg.setActiveConnections([])
      emit('block:mouseleave', { blockId: block.id })
    }
    block.el.addEventListener('pointerenter', onMouseEnter)
    block.el.addEventListener('pointerleave', onMouseLeave)
    cleanups.push(() => {
      block.el.removeEventListener('pointerenter', onMouseEnter)
      block.el.removeEventListener('pointerleave', onMouseLeave)
    })

    const draggable = block.draggable ?? draggableDefault
    if (draggable) {
      const handle = resolveWithin(block.el, block.dragHandle)
      handle.classList.add('vl-draggable')
      handle.style.touchAction = 'none'

      const onPointerDown = (event: PointerEvent) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return
        event.preventDefault()

        const startX = event.clientX
        const startY = event.clientY
        const startOffset = dragOffsets.get(block.id) ?? { x: 0, y: 0 }
        if (typeof handle.setPointerCapture === 'function') handle.setPointerCapture(event.pointerId)
        handle.classList.add('vl-dragging')
        emit('block:dragstart', { blockId: block.id })

        const onPointerMove = (moveEvent: PointerEvent) => {
          const next = {
            x: startOffset.x + (moveEvent.clientX - startX),
            y: startOffset.y + (moveEvent.clientY - startY),
          }
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

  function centerOf(el: HTMLElement, containerRect: DOMRect): Point {
    const rect = el.getBoundingClientRect()
    return { x: rect.left + rect.width / 2 - containerRect.left, y: rect.top + rect.height / 2 - containerRect.top }
  }

  function resolveEndpoint(endpoint: ConnectionEndpoint, towards: Point, containerRect: DOMRect) {
    const block = blocks.get(endpoint.blockId)
    if (!block) return null

    const port = resolvePort(block, endpoint.portId)
    const targetRect = portElement(block, port).getBoundingClientRect()
    const anchorEl = port.anchorEl ?? (port.anchorBlockId ? blocks.get(port.anchorBlockId)?.el : undefined)
    const rect = anchorEl ? anchorEl.getBoundingClientRect() : targetRect
    const anchorCenter = toLocal({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, containerRect)

    const side = Array.isArray(port.side)
      ? resolveAutoSide(anchorCenter, towards, port.side)
      : port.side && port.side !== VLFixedSideEnum.AUTO
        ? port.side
        : resolveAutoSide(anchorCenter, towards)
    const raw = anchorEl
      ? projectedSidePoint(rect, side, targetRect)
      : sidePoint(rect, side, port.offset ?? DEFAULT_PORT_OFFSET)
    return { point: toLocal(raw, containerRect), side }
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
      from: { point: Point; side: FixedSide }
      to: { point: Point; side: FixedSide }
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

      resolved.push({ connection, from, to, curve: connection.style?.curve ?? defaultCurve })
    }

    // Pass 2: group 'smoothstep' connections by shared (block, port, side) on
    // each end and pick every group's branch point — see computeBranchInfo.
    const smoothstepItems = resolved.filter((item) => item.curve === VLConnectionCurveEnum.SMOOTHSTEP)
    const fromBranches = computeBranchInfo(
      smoothstepItems.map((item) => ({
        connectionId: item.connection.id,
        blockId: item.connection.from.blockId,
        portId: item.connection.from.portId,
        point: item.from.point,
        side: item.from.side,
        otherPoint: item.to.point,
        maxReach: item.connection.style?.maxTrunkReach ?? maxTrunkReachDefault,
      })),
    )
    const toBranches = computeBranchInfo(
      smoothstepItems.map((item) => ({
        connectionId: item.connection.id,
        blockId: item.connection.to.blockId,
        portId: item.connection.to.portId,
        point: item.to.point,
        side: item.to.side,
        otherPoint: item.from.point,
        maxReach: item.connection.style?.maxTrunkReach ?? maxTrunkReachDefault,
      })),
    )

    // Pass 3: build the actual paths/port markers now that every branch point is known.
    const paths: { id: string; d: string; style?: ConnectionDescriptor['style'] }[] = []
    const ports: { key: string; point: Point }[] = []
    const seenPortKeys = new Set<string>()

    for (const { connection, from, to, curve } of resolved) {
      const d =
        curve === VLConnectionCurveEnum.STRAIGHT
          ? straightPath(from.point, to.point)
          : curve === VLConnectionCurveEnum.SMOOTHSTEP
            ? smoothstepPath(
                from.point,
                from.side,
                to.point,
                to.side,
                fromBranches.get(connection.id),
                toBranches.get(connection.id),
                connection.style?.cornerRadius ?? cornerRadiusDefault,
              )
            : bezierPath(from.point, from.side, to.point, to.side, resolveCurveGeometry(connection.style))
      paths.push({ id: connection.id, d, style: connection.style })

      if (showPorts) {
        for (const [endpoint, resolved, hasExplicitMarker] of [
          [connection.from, from, Boolean(connection.style?.startMarker)],
          [connection.to, to, Boolean(connection.style?.endMarker)],
        ] as const) {
          // An explicit start/endMarker replaces the generic dot for that
          // connection's endpoint rather than layering under it — otherwise the
          // default dot (same size/position) visually hides a custom shape.
          if (hasExplicitMarker) continue
          // Keyed by the resolved physical point rather than the logical port id:
          // an 'auto'-side port can resolve to a different side per connection
          // (e.g. one target below, another far to the right), and each distinct
          // point earns its own marker — only truly-coincident points collapse.
          const key = `${endpoint.blockId}:${Math.round(resolved.point.x)}:${Math.round(resolved.point.y)}`
          if (seenPortKeys.has(key)) continue
          seenPortKeys.add(key)
          ports.push({ key, point: resolved.point })
        }
      }
    }

    svg.update(paths, ports)
  }

  return {
    setBlocks(next) {
      setBlockList(next)
      render()
    },
    setConnections(next) {
      connections.clear()
      for (const connection of next) connections.set(connection.id, connection)
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
      render()
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
