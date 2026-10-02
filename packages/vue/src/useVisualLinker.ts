import { onBeforeUnmount, onMounted, shallowRef, toValue, watch, watchEffect, type MaybeRefOrGetter } from 'vue'
import {
  createVisualLinker,
  type ConnectionDescriptor,
  type VisualLinker,
  mergeConfig,
  type VisualLinkerConfig,
} from '@macrulez/visual-linker-core'
import { injectSharedConfig } from './sharedConfig'
import { resolveBlocksForCore, type RefFriendlyBlock } from './refPorts'

export interface UseVisualLinkerOptions {
  config?: MaybeRefOrGetter<VisualLinkerConfig | undefined>
  blocks?: MaybeRefOrGetter<RefFriendlyBlock[]>
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
  const shared = injectSharedConfig()
  const effectiveConfig = () => mergeConfig<VisualLinkerConfig>(shared, toValue(options.config))
  let stopSyncBlocks: (() => void) | null = null

  onMounted(() => {
    const el = toValue(container)
    if (!el || typeof window === 'undefined') return

    // The shared config from the app first, then this call's own config on top.
    const createdEngine = createVisualLinker(el, effectiveConfig())
    engine.value = createdEngine

    // watchEffect (not a plain watch on options.blocks) so that a block/port's
    // el/target/anchorEl ref — read via toValue() inside resolveBlocksForCore
    // during this very callback — is itself tracked as a dependency. That
    // lets a ref that starts out null resolve correctly once its element
    // mounts, even though the surrounding `blocks` array itself never changes
    // identity in that case.
    if (options.blocks) {
      stopSyncBlocks = watchEffect(() => {
        createdEngine.setBlocks(resolveBlocksForCore(toValue(options.blocks) ?? []))
      })
    }
    if (options.connections) createdEngine.setConnections(toValue(options.connections) ?? [])
  })

  onBeforeUnmount(() => {
    stopSyncBlocks?.()
    engine.value?.destroy()
    engine.value = null
  })

  watch(effectiveConfig, (next) => engine.value?.replaceConfig(next))

  if (options.connections) {
    watch(
      () => toValue(options.connections),
      (next) => engine.value?.setConnections(next ?? []),
      { deep: true },
    )
  }

  return { engine }
}
