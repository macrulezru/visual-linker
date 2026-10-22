import {
  defineComponent,
  h,
  mergeProps,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  Teleport,
  watch,
  watchEffect,
  type PropType,
  type VNode,
} from 'vue'
import {
  createVisualLinker,
  mergeConfig,
  mergeMarkerInputs,
  type BlockDescriptor,
  type ConnectCancelReason,
  type ConnectionDescriptor,
  type ConnectionEndpoint,
  type ConnectionLayout,
  type PortLayout,
  type VisualLinker as VisualLinkerEngine,
  type VisualLinkerConfig,
} from '@macrulez/visual-linker-core'
import { injectSharedConfig } from './sharedConfig'
import {
  OBSERVED_ATTRS,
  registerScope,
  sameBlocks,
  VL_ATTR,
  type ScopeChange,
  type VisualLinkerBlock,
} from './discovery'
import { createBlockRegistry, isDirectiveManaged, type BlockRegistry } from './registry'
import { connectionsSignature, createConnectionsSync } from './connectionsSync'

export type { VisualLinkerBlock } from './discovery'

/**
 * - `'container'` — blocks live anywhere inside this component's default
 *   slot (any depth, any wrapper components); lines are drawn in a layer
 *   inside the component's own box.
 * - `'page'` — blocks may live anywhere in the document; lines are drawn in a
 *   viewport-sized `position: fixed` layer teleported to `<body>`.
 */
export type VisualLinkerScope = 'container' | 'page'

function emptyStats() {
  return {
    blocks: 0,
    connections: 0,
    rendered: 0,
    culled: 0,
    proxied: 0,
    lastRenderMs: 0,
    medianRenderMs: 0,
    observedElements: 0,
  }
}

function isInsideLayer(node: Node): boolean {
  const el = node instanceof Element ? node : node.parentElement
  return Boolean(el?.closest('.vl-layer'))
}

const MARKED = `[${VL_ATTR.block}],[${VL_ATTR.port}]`

function hasPlainMarks(node: Node): boolean {
  if (!(node instanceof Element)) return false
  if (node.matches(MARKED) && !isDirectiveManaged(node)) return true
  for (const marked of node.querySelectorAll(MARKED)) if (!isDirectiveManaged(marked)) return true
  return false
}

function isRelevantMutation(record: MutationRecord): boolean {
  if (isInsideLayer(record.target)) return false
  if (record.type === 'attributes') return !(record.target instanceof Element && isDirectiveManaged(record.target))
  for (const node of record.addedNodes) if (hasPlainMarks(node)) return true
  for (const node of record.removedNodes) if (hasPlainMarks(node)) return true
  return record.removedNodes.length > 0 && record.target instanceof Element && hasRemovedRegistered(record)
}

function hasRemovedRegistered(record: MutationRecord): boolean {
  for (const node of record.removedNodes) {
    if (!(node instanceof Element)) continue
    if (node.matches(MARKED) || node.querySelector(MARKED)) return !isDirectiveRemoval(node)
  }
  return false
}

function isDirectiveRemoval(node: Element): boolean {
  if (node.matches(MARKED) && !isDirectiveManaged(node)) return false
  for (const marked of node.querySelectorAll(MARKED)) if (!isDirectiveManaged(marked)) return false
  return true
}

/**
 * Draws connections between elements you place yourself. Mark blocks with
 * `v-vl-block` / `data-vl-block` (ports with `v-vl-port` / `data-vl-port`)
 * anywhere in the default slot, or pass them via `blocks` with a ref/selector.
 *
 * ```vue
 * <VisualLinker :connections="connections">
 *   <MyLayout>
 *     <MyCard v-vl-block="'a'" />
 *     <div data-vl-block="b">…</div>
 *   </MyLayout>
 * </VisualLinker>
 * ```
 */
export const VisualLinker = defineComponent({
  name: 'VisualLinker',
  inheritAttrs: false,
  props: {
    connections: { type: Array as PropType<ConnectionDescriptor[]>, required: true },
    blocks: { type: Array as PropType<VisualLinkerBlock[]>, default: () => [] },
    config: { type: Object as PropType<VisualLinkerConfig>, default: () => ({}) },
    /** Ids of the selected connections (`v-model:selected`) — needs `config.interaction.selectable`. Leave unset to let the engine own the selection. */
    selected: { type: Array as PropType<string[]>, default: undefined },
    scope: { type: String as PropType<VisualLinkerScope>, default: 'container' },
    /** Lets elements elsewhere claim this instance via `data-vl-linker="<name>"` / the directives' `linker` option. */
    name: { type: String, default: undefined },
    /** `z-index` of the layer the lines (and overlay slots) are drawn in. */
    zIndex: { type: [Number, String], default: undefined },
  },
  emits: [
    'connection-click',
    'connection-mouseenter',
    'connection-mouseleave',
    'connection-selectionchange',
    'connection-delete-request',
    'update:selected',
    'block-dragstart',
    'block-drag',
    'block-dragend',
    'block-mouseenter',
    'block-mouseleave',
    'connect-start',
    'connection-create-request',
    'connection-create-cancel',
  ],
  setup(props, { slots, emit, attrs, expose }) {
    const root = ref<HTMLElement | null>(null)
    const layer = ref<HTMLElement | null>(null)
    // The layer only renders client-side after mount: keeps SSR output and the
    // hydration pass identical, and lets scope="page" teleport it safely.
    const isMounted = ref(false)
    const engine = shallowRef<VisualLinkerEngine | null>(null)
    const scanTick = ref(0)
    const connectionLayouts = shallowRef<ConnectionLayout[]>([])
    const portLayouts = shallowRef<PortLayout[]>([])
    let lastBlocks: BlockDescriptor[] = []
    let unsubscribes: (() => void)[] = []
    let observer: MutationObserver | null = null
    let unregisterScope: (() => void) | null = null
    let registry: BlockRegistry | null = null
    let pendingChanges = new Map<HTMLElement, ScopeChange>()
    let flushScheduled = false
    const connectionsSync = createConnectionsSync(() => engine.value)

    const shared = injectSharedConfig()
    const effectiveConfig = () => mergeConfig<VisualLinkerConfig>(shared, props.config)

    const scheduleScan = () => {
      scanTick.value++
    }

    function currentRegistry(): BlockRegistry | null {
      if (!root.value) return null
      registry ??= createBlockRegistry(
        { root: root.value, page: props.scope === 'page', name: props.name },
        () => props.blocks,
      )
      return registry
    }

    function applyBlocks(next: BlockDescriptor[]) {
      if (sameBlocks(next, lastBlocks)) return
      lastBlocks = next
      engine.value?.setBlocks(next)
    }

    function flushChanges() {
      flushScheduled = false
      const changes = pendingChanges
      pendingChanges = new Map()
      const current = registry
      if (!current || !engine.value || changes.size === 0) return
      const next = current.apply(changes.values())
      if (next) applyBlocks(next)
    }

    function onScopeChange(change?: ScopeChange) {
      if (!change) {
        scheduleScan()
        return
      }
      if (!registry) {
        scheduleScan()
        return
      }
      pendingChanges.set(change.el, change)
      if (!flushScheduled) {
        flushScheduled = true
        queueMicrotask(flushChanges)
      }
    }

    onMounted(() => {
      isMounted.value = true
      if (!root.value) return
      unregisterScope = registerScope(onScopeChange)
      // Picks up blocks/ports added, removed or re-marked by anything — a
      // v-if, a v-for, plain data attributes set by third-party markup. Our
      // own layer's churn (paths, overlay slots) is ignored.
      observer = new MutationObserver((records) => {
        if (records.some(isRelevantMutation)) scheduleScan()
      })
      observer.observe(props.scope === 'page' ? document.body : root.value, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: OBSERVED_ATTRS,
      })
    })

    watch(
      layer,
      (el) => {
        if (!el || engine.value) return
        // The shared config from the app first, then props.config on top: a
        // field neither sets falls through to @macrulez/visual-linker-core's own default.
        const created = createVisualLinker(el, effectiveConfig())
        created.setConnections(props.connections)
        connectionsSync.reset(props.connections)
        // After the connections: an id not (yet) in them would be pruned from the selection.
        if (props.selected) created.setSelectedConnections(props.selected)
        unsubscribes = [
          created.on('connection:click', ({ connection }) => emit('connection-click', connection)),
          created.on('connection:mouseenter', ({ connection }) => emit('connection-mouseenter', connection)),
          created.on('connection:mouseleave', ({ connection }) => emit('connection-mouseleave', connection)),
          created.on('connection:selectionchange', ({ selectedIds }) => {
            emit('update:selected', selectedIds)
            emit('connection-selectionchange', selectedIds)
          }),
          created.on('connection:delete-request', ({ connections }) => emit('connection-delete-request', connections)),
          created.on('block:dragstart', (payload) => emit('block-dragstart', payload)),
          created.on('block:drag', (payload) => emit('block-drag', payload)),
          created.on('block:dragend', (payload) => emit('block-dragend', payload)),
          created.on('block:mouseenter', (payload) => emit('block-mouseenter', payload)),
          created.on('block:mouseleave', (payload) => emit('block-mouseleave', payload)),
          created.on('connect:start', (payload) => emit('connect-start', payload)),
          created.on('connection:create-request', (payload) => emit('connection-create-request', payload)),
          created.on('connection:create-cancel', (payload) => emit('connection-create-cancel', payload)),
          // Drives the overlay slots below — fires on every render, so overlay
          // positions follow drag/resize/scroll exactly like the SVG paths do.
          created.on('layout', ({ connections: layouts, ports }) => {
            connectionLayouts.value = layouts
            portLayouts.value = ports
          }),
        ]
        engine.value = created
      },
      { flush: 'post' },
    )

    // watchEffect (not a plain watch) so refs read by collectBlocks's toValue()
    // calls — a `blocks` entry's `el`, a port's `target` — are tracked too, and
    // re-sync once they resolve even though `blocks` itself never changes.
    watchEffect(
      () => {
        void scanTick.value
        const current = engine.value
        if (!current || !root.value) return
        const next = currentRegistry()?.fullScan()
        if (next) applyBlocks(next)
        void current
      },
      { flush: 'post' },
    )

    watch(effectiveConfig, (next) => engine.value?.replaceConfig(next))

    watch(
      () => props.selected,
      (next) => {
        if (next) engine.value?.setSelectedConnections(next)
      },
      { deep: true },
    )

    watch(
      () => connectionsSignature(props.connections),
      () => connectionsSync.sync(props.connections),
      { flush: 'pre' },
    )
    watch(
      () => props.connections,
      () => connectionsSync.sync(props.connections),
    )

    expose({
      engine,
      startConnect: (from: ConnectionEndpoint) => engine.value?.startConnect(from) ?? false,
      completeConnect: (to: ConnectionEndpoint) => engine.value?.completeConnect(to) ?? false,
      cancelConnect: (reason?: ConnectCancelReason) => engine.value?.cancelConnect(reason),
      isConnecting: () => engine.value?.isConnecting() ?? { active: false },
      batch: (fn: () => void) => (engine.value ? engine.value.batch(fn) : fn()),
      stats: () => ({
        ...(engine.value?.getStats() ?? emptyStats()),
        registryRecomputations: registry?.recomputations ?? 0,
      }),
    })

    onBeforeUnmount(() => {
      observer?.disconnect()
      unregisterScope?.()
      for (const unsubscribe of unsubscribes) unsubscribe()
      engine.value?.destroy()
      engine.value = null
    })

    function renderOverlay(): VNode | null {
      // Only built when at least one of these slots is actually used — an
      // HTML overlay sibling to the SVG (arbitrary Vue content can't render
      // into an <svg> without <foreignObject>'s cross-browser quirks), in the
      // exact same local coordinate space the layout event's points are in.
      const labelSlot = slots['connection-label']
      const portSlot = slots['port']
      const markerSlot = slots['marker']
      const children: VNode[] = []

      if (labelSlot) {
        const labelBox = (key: string, point: { x: number; y: number }, rotation: number) => ({
          key,
          class: 'vl-connection-label',
          style: {
            position: 'absolute',
            display: 'flex',
            left: `${point.x}px`,
            top: `${point.y}px`,
            transform: `translate(-50%, -50%)${rotation ? ` rotate(${rotation}deg)` : ''}`,
            pointerEvents: 'auto',
          },
        })
        for (const layout of connectionLayouts.value) {
          const connection = props.connections.find((candidate) => candidate.id === layout.id)
          if (!connection) continue

          if (connection.labels?.length) {
            // Labels with `text` are already drawn by the engine; the slot fills in the rest.
            for (const placed of layout.labels ?? []) {
              if (placed.text) continue
              const label = connection.labels.find((candidate) => candidate.id === placed.id)
              if (!label) continue
              children.push(
                h(
                  'div',
                  labelBox(`label:${layout.id}:${placed.id}`, placed.point, placed.rotation),
                  labelSlot({
                    connection,
                    label,
                    point: placed.point,
                    angle: placed.angle,
                    rotation: placed.rotation,
                    from: layout.from,
                    to: layout.to,
                  }),
                ),
              )
            }
            continue
          }

          // No `labels`: the original single label at the line's midpoint.
          children.push(
            h(
              'div',
              labelBox(`label:${layout.id}`, layout.mid, 0),
              labelSlot({ connection, point: layout.mid, from: layout.from, to: layout.to }),
            ),
          )
        }
      }

      if (portSlot) {
        for (const port of portLayouts.value) {
          children.push(
            h(
              'div',
              {
                key: `port:${port.key}`,
                class: 'vl-port-slot',
                style: {
                  position: 'absolute',
                  left: `${port.point.x}px`,
                  top: `${port.point.y}px`,
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: props.config.ports?.slotPointerEvents === false ? 'none' : 'auto',
                },
              },
              portSlot({
                blockId: port.blockId,
                portId: port.portId,
                point: port.point,
                ...(port.role !== undefined ? { role: port.role } : {}),
                ...(port.connected !== undefined ? { connected: port.connected } : {}),
                ...(port.state !== undefined ? { state: port.state } : {}),
                ...(port.hovered !== undefined ? { hovered: port.hovered } : {}),
              }),
            ),
          )
        }
      }

      if (markerSlot) {
        for (const layout of connectionLayouts.value) {
          const connection = props.connections.find((candidate) => candidate.id === layout.id)
          if (!connection) continue
          // An explicit startMarker/endMarker still wins (renders as the native
          // SVG marker it already was) — the slot only fills in where no
          // per-connection marker style was set, mirroring the built-in dot.
          const markerConfig = effectiveConfig().markers
          for (const [position, point, angle, clipped] of [
            ['start', layout.from, layout.fromAngle, layout.fromClipped],
            ['end', layout.to, layout.toAngle, layout.toClipped],
          ] as const) {
            const explicit =
              mergeMarkerInputs(markerConfig?.[position], connection.style?.markers?.[position]) !== undefined
            // A clipped end is pinned to a scroller's edge, not a real endpoint.
            if (explicit || clipped) continue
            children.push(
              h(
                'div',
                {
                  key: `marker:${position}:${layout.id}`,
                  class: 'vl-marker',
                  style: {
                    position: 'absolute',
                    left: `${point.x}px`,
                    top: `${point.y}px`,
                    transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                    pointerEvents: 'auto',
                  },
                },
                markerSlot({ connection, position, point, angle }),
              ),
            )
          }
        }
      }

      return children.length > 0
        ? h(
            'div',
            {
              key: '__vl-overlay__',
              class: 'vl-overlay',
              style: { position: 'absolute', inset: '0', pointerEvents: 'none' },
            },
            children,
          )
        : null
    }

    return () => {
      const page = props.scope === 'page'
      const overlay = renderOverlay()
      const layerNode = isMounted.value
        ? h(
            'div',
            {
              ref: layer,
              class: page ? 'vl-layer vl-layer--page' : 'vl-layer',
              style: {
                position: page ? 'fixed' : 'absolute',
                inset: '0',
                pointerEvents: 'none',
                zIndex: props.zIndex,
              },
            },
            overlay ? [overlay] : [],
          )
        : null

      const rootNode = h(
        'div',
        mergeProps(attrs, {
          ref: root,
          class: 'vl-container',
          [VL_ATTR.root]: '',
          style: page ? undefined : { position: 'relative' },
        }),
        // In container mode the layer is the root's last child, so it always
        // paints over the slot content without any z-index juggling.
        [slots.default?.(), page ? null : layerNode],
      )

      // Always a fragment in page mode (not only once the layer exists), so
      // mounting the layer never swaps the root vnode and remounts the slot.
      if (!page) return rootNode
      return [rootNode, layerNode ? h(Teleport, { to: 'body' }, [layerNode]) : null]
    }
  },
})
