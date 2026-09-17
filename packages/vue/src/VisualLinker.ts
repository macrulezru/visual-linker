import { defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue'
import {
  createVisualLinker,
  type BlockDescriptor,
  type ConnectionDescriptor,
  type PortDescriptor,
  type VisualLinker as VisualLinkerEngine,
  type VisualLinkerOptions,
} from '@macrulez/visual-linker-core'
import { visualLinkerDefaults } from './config'

export interface VisualLinkerBlock {
  id: string
  ports?: PortDescriptor[]
  /** Overrides the `options.draggable` default for this block. */
  draggable?: boolean
  /** CSS selector for the drag handle within the block's slot content. */
  dragHandle?: string
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

    function syncBlocks() {
      if (!engine) return
      const descriptors: BlockDescriptor[] = []
      for (const block of props.blocks) {
        const el = blockEls.get(block.id)
        if (el)
          descriptors.push({
            id: block.id,
            el,
            ports: block.ports,
            draggable: block.draggable,
            dragHandle: block.dragHandle,
          })
      }
      engine.setBlocks(descriptors)
    }

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
      syncBlocks()
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
      for (const unsubscribe of unsubscribes) unsubscribe()
      engine?.destroy()
    })

    watch(
      () => props.connections,
      (next) => engine?.setConnections(next),
      { deep: true },
    )
    watch(
      () => props.blocks,
      () => {
        nextTick(() => syncBlocks())
      },
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
