import { onScopeDispose, shallowRef, toValue, unref, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import type { ConnectionEndpoint, ConnectVia, VisualLinker } from '@macrulez/visual-linker-core'

export interface UseVisualLinkerConnectReturn {
  connecting: Ref<boolean>
  from: Ref<ConnectionEndpoint | null>
  candidate: Ref<ConnectionEndpoint | null>
  via: Ref<ConnectVia | 'api' | null>
}

type LinkerSource = VisualLinker | { engine?: unknown } | null | undefined

function engineOf(source: LinkerSource): VisualLinker | null {
  if (!source) return null
  if (typeof (source as VisualLinker).on === 'function') return source as VisualLinker
  const inner = unref((source as { engine?: unknown }).engine) as VisualLinker | null | undefined
  return inner && typeof inner.on === 'function' ? inner : null
}

export function useVisualLinkerConnect(linker: MaybeRefOrGetter<LinkerSource>): UseVisualLinkerConnectReturn {
  const connecting = shallowRef(false)
  const from = shallowRef<ConnectionEndpoint | null>(null)
  const candidate = shallowRef<ConnectionEndpoint | null>(null)
  const via = shallowRef<ConnectVia | 'api' | null>(null)
  let off: (() => void)[] = []

  const reset = () => {
    connecting.value = false
    from.value = null
    candidate.value = null
    via.value = null
  }

  const detach = () => {
    for (const fn of off) fn()
    off = []
  }

  const attach = (engine: VisualLinker | null) => {
    detach()
    reset()
    if (!engine) return
    off = [
      engine.on('connect:start', (payload) => {
        connecting.value = true
        from.value = payload.from
        candidate.value = null
        via.value = payload.via
      }),
      engine.on('connect:candidate', (payload) => {
        candidate.value = payload.candidate
      }),
      engine.on('connection:create-request', reset),
      engine.on('connection:create-cancel', reset),
    ]
  }

  watch(() => engineOf(toValue(linker)), attach, { immediate: true, flush: 'post' })
  onScopeDispose(detach)

  return { connecting, from, candidate, via }
}
