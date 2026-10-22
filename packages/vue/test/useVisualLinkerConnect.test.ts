import { effectScope, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useVisualLinkerConnect } from '../src/useVisualLinkerConnect'

function fakeEngine() {
  const handlers = new Map<string, ((payload: never) => void)[]>()
  return {
    on: (event: string, handler: (payload: never) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler])
      return () =>
        handlers.set(
          event,
          (handlers.get(event) ?? []).filter((h) => h !== handler),
        )
    },
    emit: (event: string, payload: unknown) => handlers.get(event)?.forEach((h) => h(payload as never)),
    count: () => [...handlers.values()].reduce((sum, list) => sum + list.length, 0),
  }
}

describe('useVisualLinkerConnect', () => {
  it('follows the gesture of an engine, a component-like object and a ref', async () => {
    const engine = fakeEngine()
    const scope = effectScope()
    const linker = ref<unknown>({ engine })
    const state = scope.run(() => useVisualLinkerConnect(linker))!
    await nextTick()
    await nextTick()

    engine.emit('connect:start', { from: { blockId: 'a', portId: 'p' }, via: 'drag' })
    expect(state.connecting.value).toBe(true)
    expect(state.from.value).toEqual({ blockId: 'a', portId: 'p' })
    expect(state.via.value).toBe('drag')

    engine.emit('connect:candidate', { from: state.from.value, candidate: { blockId: 'b' }, valid: true })
    expect(state.candidate.value).toEqual({ blockId: 'b' })

    engine.emit('connection:create-request', {})
    expect(state.connecting.value).toBe(false)
    expect(state.from.value).toBeNull()
    expect(state.candidate.value).toBeNull()
    expect(state.via.value).toBeNull()

    engine.emit('connect:start', { from: { blockId: 'a' }, via: 'api' })
    engine.emit('connection:create-cancel', {})
    expect(state.connecting.value).toBe(false)

    linker.value = null
    await nextTick()
    await nextTick()
    expect(engine.count()).toBe(0)
    scope.stop()
  })

  it('accepts the engine itself', async () => {
    const engine = fakeEngine()
    const scope = effectScope()
    const state = scope.run(() => useVisualLinkerConnect(engine as never))!
    await nextTick()
    engine.emit('connect:start', { from: { blockId: 'a' }, via: 'click' })
    expect(state.via.value).toBe('click')
    scope.stop()
  })
})
