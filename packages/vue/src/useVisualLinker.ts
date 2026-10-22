import { onBeforeUnmount, onMounted, shallowRef, toValue, watch, watchEffect, type MaybeRefOrGetter } from 'vue'
import {
  createVisualLinker,
  type ConnectCancelReason,
  type ConnectionDescriptor,
  type ConnectionEndpoint,
  type VisualLinker,
  type VisualLinkerStats,
  mergeConfig,
  type VisualLinkerConfig,
} from '@macrulez/visual-linker-core'
import { injectSharedConfig } from './sharedConfig'
import { resolveBlocksForCore, type RefFriendlyBlock } from './refPorts'
import { connectionsSignature, createConnectionsSync } from './connectionsSync'

export interface UseVisualLinkerOptions {
  config?: MaybeRefOrGetter<VisualLinkerConfig | undefined>
  blocks?: MaybeRefOrGetter<RefFriendlyBlock[]>
  connections?: MaybeRefOrGetter<ConnectionDescriptor[]>
}

export interface UseVisualLinkerReturn {
  engine: ReturnType<typeof shallowRef<VisualLinker | null>>
  stats: () => VisualLinkerStats
  startConnect: (from: ConnectionEndpoint) => boolean
  completeConnect: (to: ConnectionEndpoint) => boolean
  cancelConnect: (reason?: ConnectCancelReason) => void
  isConnecting: () => { active: boolean; from?: ConnectionEndpoint }
  batch: (fn: () => void) => void
}

const EMPTY_STATS: VisualLinkerStats = {
  blocks: 0,
  connections: 0,
  rendered: 0,
  culled: 0,
  proxied: 0,
  lastRenderMs: 0,
  medianRenderMs: 0,
  observedElements: 0,
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
  const connectionsSync = createConnectionsSync(() => engine.value)
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
    if (options.connections) {
      const initial = toValue(options.connections) ?? []
      createdEngine.setConnections(initial)
      connectionsSync.reset(initial)
    }
  })

  onBeforeUnmount(() => {
    stopSyncBlocks?.()
    engine.value?.destroy()
    engine.value = null
  })

  watch(effectiveConfig, (next) => engine.value?.replaceConfig(next))

  if (options.connections) {
    watch(
      () => connectionsSignature(toValue(options.connections) ?? []),
      () => connectionsSync.sync(toValue(options.connections) ?? []),
    )
    watch(
      () => toValue(options.connections),
      (next) => connectionsSync.sync(next ?? []),
    )
  }

  return {
    engine,
    stats: () => engine.value?.getStats() ?? { ...EMPTY_STATS },
    startConnect: (from) => engine.value?.startConnect(from) ?? false,
    completeConnect: (to) => engine.value?.completeConnect(to) ?? false,
    cancelConnect: (reason) => engine.value?.cancelConnect(reason),
    isConnecting: () => engine.value?.isConnecting() ?? { active: false },
    batch: (fn) => (engine.value ? engine.value.batch(fn) : fn()),
  }
}
