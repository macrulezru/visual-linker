import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect, type PropType } from 'vue'
import {
  createVisualLinker,
  type BlockDescriptor,
  type ConnectionDescriptor,
  type VisualLinker as VisualLinkerEngine,
  type VisualLinkerOptions,
} from '@macrulez/visual-linker-core'
import { visualLinkerDefaults } from './config'
import { resolveElement, resolvePortForCore, type RefFriendlyElement, type RefFriendlyPort } from './refPorts'

export interface VisualLinkerBlock {
  id: string
  ports?: RefFriendlyPort[]
  /** Overrides the `options.draggable` default for this block. */
  draggable?: boolean
  /** CSS selector, or a ref/getter to an element within the block's slot content, for the drag handle. */
  dragHandle?: RefFriendlyElement
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

    return () =>
      h(
        'div',
        { ref: container, class: 'vl-container', style: { position: 'relative' } },
        props.blocks.map((block) =>
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
        ),
      )
  },
})
