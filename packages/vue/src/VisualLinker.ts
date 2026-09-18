import { defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef, watch, watchEffect, type PropType } from 'vue'
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
import {
  resolveDragBoundsForCore,
  resolveElement,
  resolvePortForCore,
  type RefFriendlyDragBounds,
  type RefFriendlyElement,
  type RefFriendlyPort,
} from './refPorts'

export interface VisualLinkerBlock {
  id: string
  ports?: RefFriendlyPort[]
  /** Overrides the `options.draggable` default for this block. */
  draggable?: boolean
  /** CSS selector, or a ref/getter to an element within the block's slot content, for the drag handle. */
  dragHandle?: RefFriendlyElement
  /** Overrides the `options.dragBounds` default for this block — `'container'`, an inset object, or an element/ref/getter to confine dragging within. */
  dragBounds?: RefFriendlyDragBounds
}

/**
 * Renders one wrapper `<div>` per block (measured by the engine) around that
 * block's `#block-<id>` slot, plus an SVG overlay with the connections between
 * them. Block content stays entirely the caller's — this only measures and draws.
 *
 * ```vue
 * <VisualLinker :blocks="blocks" :connections="connections">
 *   <template v-for="b in blocks" #[`block-${b.id}`]="{}" :key="b.id">
 *     <MyCard :data="b" />
 *   </template>
 * </VisualLinker>
 * ```
 */
export const VisualLinker = defineComponent({
  name: 'VisualLinker',
  props: {
    blocks: { type: Array as PropType<VisualLinkerBlock[]>, required: true },
    connections: { type: Array as PropType<ConnectionDescriptor[]>, required: true },
    options: { type: Object as PropType<VisualLinkerOptions>, default: () => ({}) },
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
  setup(props, { slots, emit }) {
    const container = ref<HTMLElement | null>(null)
    const blockEls = new Map<string, HTMLElement>()
    const connectionLayouts = shallowRef<ConnectionLayout[]>([])
    const portLayouts = shallowRef<PortLayout[]>([])
    let engine: VisualLinkerEngine | null = null
    let unsubscribes: (() => void)[] = []
    let stopSyncBlocks: (() => void) | null = null

    onMounted(() => {
      if (!container.value || typeof window === 'undefined') return
      // visualLinkerDefaults first, then props.options on top: an option the
      // caller didn't set (key absent, not just undefined) falls through to
      // the Nuxt-configured default, and one neither set falls through again
      // to @macrulez/visual-linker-core's own default — see config.ts.
      engine = createVisualLinker(container.value, {
        ...visualLinkerDefaults,
        ...props.options,
      })

      // watchEffect (not a plain watch on props.blocks) so that a port's
      // target/anchorEl ref — read via resolvePortForCore's toValue() calls
      // during this very callback — is itself tracked as a dependency. That
      // lets a ref/getter port target that starts out null (its element
      // hasn't mounted yet) correctly re-sync once it resolves, even though
      // props.blocks itself never changes identity in that case.
      stopSyncBlocks = watchEffect(() => {
        if (!engine) return
        const descriptors: BlockDescriptor[] = []
        for (const block of props.blocks) {
          const el = blockEls.get(block.id)
          if (el)
            descriptors.push({
              id: block.id,
              el,
              ports: block.ports?.map(resolvePortForCore),
              draggable: block.draggable,
              dragHandle: resolveElement(block.dragHandle),
              dragBounds: resolveDragBoundsForCore(block.dragBounds),
            })
        }
        engine.setBlocks(descriptors)
      })
      engine.setConnections(props.connections)

      unsubscribes = [
        engine.on('connection:click', ({ connection }) => emit('connection-click', connection)),
        engine.on('connection:mouseenter', ({ connection }) => emit('connection-mouseenter', connection)),
        engine.on('connection:mouseleave', ({ connection }) => emit('connection-mouseleave', connection)),
        engine.on('block:dragstart', (payload) => emit('block-dragstart', payload)),
        engine.on('block:drag', (payload) => emit('block-drag', payload)),
        engine.on('block:dragend', (payload) => emit('block-dragend', payload)),
        engine.on('block:mouseenter', (payload) => emit('block-mouseenter', payload)),
        engine.on('block:mouseleave', (payload) => emit('block-mouseleave', payload)),
        // Drives the #connection-label/#port HTML overlay below — fires on
        // every render (not just interaction), so overlay positions stay in
        // sync with drag/resize/scroll the same way the SVG paths themselves do.
        engine.on('layout', ({ connections: layouts, ports }) => {
          connectionLayouts.value = layouts
          portLayouts.value = ports
        }),
      ]
    })

    onBeforeUnmount(() => {
      stopSyncBlocks?.()
      for (const unsubscribe of unsubscribes) unsubscribe()
      engine?.destroy()
    })

    watch(
      () => props.connections,
      (next) => engine?.setConnections(next),
      { deep: true },
    )

    return () => {
      const blockNodes = props.blocks.map((block) =>
        h(
          'div',
          {
            key: block.id,
            class: 'vl-block',
            ref: (el) => {
              if (el) blockEls.set(block.id, el as HTMLElement)
              else blockEls.delete(block.id)
            },
          },
          slots[`block-${block.id}`]?.(),
        ),
      )

      // Only built when at least one of these slots is actually used — it's
      // an HTML overlay sibling to the SVG layer (not inside the SVG:
      // arbitrary Vue content can't render into an <svg> without a
      // <foreignObject>'s cross-browser quirks), absolutely positioned in the
      // exact same local coordinate space the layout event's points already are.
      const labelSlot = slots['connection-label']
      const portSlot = slots['port']
      const markerSlot = slots['marker']
      const overlayChildren: (ReturnType<typeof h> | null)[] = []

      if (labelSlot) {
        for (const layout of connectionLayouts.value) {
          const connection = props.connections.find((candidate) => candidate.id === layout.id)
          if (!connection) continue
          overlayChildren.push(
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
          overlayChildren.push(
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
          // An explicit startMarker/endMarker still wins here too (renders as
          // the native SVG marker it already was) — the slot only fills in
          // where no per-connection marker style was set, mirroring the
          // built-in dot's own suppression rule.
          if (!connection.style?.startMarker) {
            overlayChildren.push(
              h(
                'div',
                {
                  key: `marker:start:${layout.id}`,
                  class: 'vl-marker',
                  style: {
                    position: 'absolute',
                    left: `${layout.from.x}px`,
                    top: `${layout.from.y}px`,
                    transform: `translate(-50%, -50%) rotate(${layout.fromAngle}deg)`,
                    pointerEvents: 'auto',
                  },
                },
                markerSlot({ connection, position: 'start', point: layout.from, angle: layout.fromAngle }),
              ),
            )
          }
          if (!connection.style?.endMarker) {
            overlayChildren.push(
              h(
                'div',
                {
                  key: `marker:end:${layout.id}`,
                  class: 'vl-marker',
                  style: {
                    position: 'absolute',
                    left: `${layout.to.x}px`,
                    top: `${layout.to.y}px`,
                    transform: `translate(-50%, -50%) rotate(${layout.toAngle}deg)`,
                    pointerEvents: 'auto',
                  },
                },
                markerSlot({ connection, position: 'end', point: layout.to, angle: layout.toAngle }),
              ),
            )
          }
        }
      }

      const overlayNode =
        overlayChildren.length > 0
          ? h(
              'div',
              {
                key: '__vl-overlay__',
                class: 'vl-overlay',
                style: { position: 'absolute', inset: '0', pointerEvents: 'none' },
              },
              overlayChildren,
            )
          : null

      return h('div', { ref: container, class: 'vl-container', style: { position: 'relative' } }, [
        ...blockNodes,
        overlayNode,
      ])
    }
  },
})
