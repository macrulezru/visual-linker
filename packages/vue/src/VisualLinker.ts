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
  type BlockDescriptor,
  type ConnectionDescriptor,
  type ConnectionLayout,
  type PortLayout,
  type VisualLinker as VisualLinkerEngine,
  type VisualLinkerOptions,
} from '@macrulez/visual-linker-core'
import { visualLinkerDefaults } from './config'
import { collectBlocks, OBSERVED_ATTRS, registerScope, sameBlocks, VL_ATTR, type VisualLinkerBlock } from './discovery'

export type { VisualLinkerBlock } from './discovery'

/**
 * - `'container'` — blocks live anywhere inside this component's default
 *   slot (any depth, any wrapper components); lines are drawn in a layer
 *   inside the component's own box.
 * - `'page'` — blocks may live anywhere in the document; lines are drawn in a
 *   viewport-sized `position: fixed` layer teleported to `<body>`.
 */
export type VisualLinkerScope = 'container' | 'page'

function isInsideLayer(node: Node): boolean {
  const el = node instanceof Element ? node : node.parentElement
  return Boolean(el?.closest('.vl-layer'))
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
    options: { type: Object as PropType<VisualLinkerOptions>, default: () => ({}) },
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
    'block-dragstart',
    'block-drag',
    'block-dragend',
    'block-mouseenter',
    'block-mouseleave',
  ],
  setup(props, { slots, emit, attrs }) {
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

    const scheduleScan = () => {
      scanTick.value++
    }

    onMounted(() => {
      isMounted.value = true
      if (!root.value) return
      unregisterScope = registerScope(scheduleScan)
      // Picks up blocks/ports added, removed or re-marked by anything — a
      // v-if, a v-for, plain data attributes set by third-party markup. Our
      // own layer's churn (paths, overlay slots) is ignored.
      observer = new MutationObserver((records) => {
        if (records.some((record) => !isInsideLayer(record.target))) scheduleScan()
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
        // visualLinkerDefaults first, then props.options on top: an option the
        // caller didn't set (key absent, not just undefined) falls through to
        // the Nuxt-configured default, and one neither set falls through again
        // to @macrulez/visual-linker-core's own default — see config.ts.
        const created = createVisualLinker(el, { ...visualLinkerDefaults, ...props.options })
        created.setConnections(props.connections)
        unsubscribes = [
          created.on('connection:click', ({ connection }) => emit('connection-click', connection)),
          created.on('connection:mouseenter', ({ connection }) => emit('connection-mouseenter', connection)),
          created.on('connection:mouseleave', ({ connection }) => emit('connection-mouseleave', connection)),
          created.on('block:dragstart', (payload) => emit('block-dragstart', payload)),
          created.on('block:drag', (payload) => emit('block-drag', payload)),
          created.on('block:dragend', (payload) => emit('block-dragend', payload)),
          created.on('block:mouseenter', (payload) => emit('block-mouseenter', payload)),
          created.on('block:mouseleave', (payload) => emit('block-mouseleave', payload)),
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
        const next = collectBlocks({ root: root.value, page: props.scope === 'page', name: props.name }, props.blocks)
        if (sameBlocks(next, lastBlocks)) return
        lastBlocks = next
        current.setBlocks(next)
      },
      { flush: 'post' },
    )

    watch(
      () => props.connections,
      (next) => engine.value?.setConnections(next),
      { deep: true },
    )

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
        for (const layout of connectionLayouts.value) {
          const connection = props.connections.find((candidate) => candidate.id === layout.id)
          if (!connection) continue
          children.push(
            h(
              'div',
              {
                key: `label:${layout.id}`,
                class: 'vl-connection-label',
                style: {
                  position: 'absolute',
                  display: 'flex',
                  left: `${layout.mid.x}px`,
                  top: `${layout.mid.y}px`,
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'auto',
                },
              },
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
                  pointerEvents: 'auto',
                },
              },
              portSlot({ blockId: port.blockId, portId: port.portId, point: port.point }),
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
          for (const [position, point, angle, explicit] of [
            ['start', layout.from, layout.fromAngle, connection.style?.startMarker],
            ['end', layout.to, layout.toAngle, connection.style?.endMarker],
          ] as const) {
            if (explicit) continue
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
