import { createVisualLinker } from '@macrulez/visual-linker-vue'
import type { ConnectConfig, ConnectionDescriptor } from '@macrulez/visual-linker-vue'

type Engine = ReturnType<typeof createVisualLinker>

interface LoggedEvent {
  type: string
  payload: unknown
}

const stage = document.getElementById('stage') as HTMLElement
const events: LoggedEvent[] = []
let engine: Engine | null = null
let lastPointerId = 1
document.addEventListener('pointerdown', (event) => (lastPointerId = event.pointerId), true)

function setup(options: ConnectConfig & { reject?: string } = {}, connections: ConnectionDescriptor[] = []) {
  const { reject, ...connect } = options
  engine?.destroy()
  events.length = 0
  engine = createVisualLinker(stage, {
    ports: { show: false },
    interaction: {
      connect: { enabled: true, handle: 'always', ...connect, ...(reject ? { validate: () => reject } : {}) },
    },
  })
  const sides = { src: 'right', dst: 'left' } as const
  engine.setBlocks(
    (['src', 'dst'] as const).map((id) => ({
      id,
      el: document.getElementById(id)!,
      ports: [...document.querySelectorAll<HTMLElement>(`#${id} .port`)].map((el) => ({
        id: el.id,
        target: el,
        side: sides[id],
      })),
    })),
  )
  engine.setConnections(connections)
  for (const type of ['connect:start', 'connection:create-request', 'connection:create-cancel'] as const) {
    engine.on(type, (payload) => events.push({ type, payload }))
  }
}

function handleCenter(key: string): { x: number; y: number } {
  const hit = stage.querySelector(`[data-vl-handle="${key}"] .vl-handle-hit`)!.getBoundingClientRect()
  return { x: hit.left + hit.width / 2, y: hit.top + hit.height / 2 }
}

function leftovers() {
  return {
    connecting: stage.getAttribute('data-vl-connecting'),
    states: document.querySelectorAll('[data-vl-connect-state]').length,
    previews: stage.querySelectorAll('.vl-connect-preview').length,
    paths: stage.querySelectorAll('path.vl-connection').length,
  }
}

const api = {
  setup,
  events,
  handleCenter,
  leftovers,
  engine: () => engine,
  liveText: () => stage.querySelector('.vl-live')?.textContent ?? '',
  cancelPointer() {
    document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: lastPointerId, bubbles: true }))
  },
}

declare global {
  interface Window {
    __stand: typeof api
  }
}
window.__stand = api
setup()
