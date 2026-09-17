import { onBeforeUnmount, onMounted, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import {
  createVisualLinker,
  type BlockDescriptor,
  type ConnectionDescriptor,
  type VisualLinker,
  type VisualLinkerOptions,
} from '@macrulez/visual-linker-core'
import { visualLinkerDefaults } from './config'

export interface UseVisualLinkerOptions extends VisualLinkerOptions {
  blocks?: MaybeRefOrGetter<BlockDescriptor[]>
  connections?: MaybeRefOrGetter<ConnectionDescriptor[]>
}

export interface UseVisualLinkerReturn {
  engine: ReturnType<typeof shallowRef<VisualLinker | null>>
}

/**
 * Low-level escape hatch for when the <VisualLinker> component's slot-per-block
 * layout doesn't fit — you own the block elements, this only wires the engine
 * to a container and keeps it in sync with reactive blocks/connections.
 */
export function useVisualLinker(
  container: MaybeRefOrGetter<HTMLElement | null | undefined>,
  options: UseVisualLinkerOptions = {},
): UseVisualLinkerReturn {
  const engine = shallowRef<VisualLinker | null>(null)

  onMounted(() => {
    const el = toValue(container)
    if (!el || typeof window === 'undefined') return

    // visualLinkerDefaults first, then options on top — see config.ts and
    // VisualLinker.ts for why the merge order matters.
    engine.value = createVisualLinker(el, {
      ...visualLinkerDefaults,
      ...options,
    })
    if (options.blocks) engine.value.setBlocks(toValue(options.blocks) ?? [])
    if (options.connections) engine.value.setConnections(toValue(options.connections) ?? [])
  })

  onBeforeUnmount(() => {
    engine.value?.destroy()
    engine.value = null
  })

  if (options.blocks) {
    watch(
      () => toValue(options.blocks),
      (next) => engine.value?.setBlocks(next ?? []),
      { deep: true },
    )
  }
  if (options.connections) {
    watch(
      () => toValue(options.connections),
      (next) => engine.value?.setConnections(next ?? []),
      { deep: true },
    )
  }

  return { engine }
}
