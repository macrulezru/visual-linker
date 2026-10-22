import { toRaw } from 'vue'
import type { ConnectionDescriptor, VisualLinker } from '@macrulez/visual-linker-core'

export function connectionSignature(connection: ConnectionDescriptor): string {
  try {
    return JSON.stringify([
      connection.id,
      connection.from,
      connection.to,
      connection.style,
      connection.labels,
      connection.hoverable,
      connection.ariaLabel,
    ])
  } catch {
    return String(connection.id)
  }
}

export function connectionsSignature(connections: readonly ConnectionDescriptor[]): string {
  return connections.map(connectionSignature).join('\n')
}

type SyncTarget = Pick<VisualLinker, 'setConnections'> &
  Partial<Pick<VisualLinker, 'addConnection' | 'removeConnection' | 'batch'>>

export function createConnectionsSync(getEngine: () => SyncTarget | null | undefined) {
  let known = new Map<string, string>()
  let lastRaw: readonly ConnectionDescriptor[] | null = null

  function sync(next: readonly ConnectionDescriptor[]) {
    const engine = getEngine()
    if (!engine) return
    const raw = toRaw(next)
    const replaced = lastRaw !== null && raw !== lastRaw
    lastRaw = raw

    const nextKnown = new Map<string, string>()
    const changed: ConnectionDescriptor[] = []
    for (const connection of next) {
      const signature = connectionSignature(connection)
      nextKnown.set(connection.id, signature)
      if (known.get(connection.id) !== signature) changed.push(connection)
    }
    const removed = [...known.keys()].filter((id) => !nextKnown.has(id))
    const order = next.map((connection) => connection.id).join('\u0000')
    const previousOrder = [...known.keys()].join('\u0000')
    known = nextKnown

    const fullReplace =
      !engine.addConnection ||
      !engine.removeConnection ||
      (replaced && changed.length + removed.length > next.length / 2) ||
      (removed.length === 0 && changed.length === 0 && order !== previousOrder)
    if (changed.length === 0 && removed.length === 0 && !fullReplace) return
    if (fullReplace) {
      engine.setConnections([...next])
      return
    }
    const apply = () => {
      for (const id of removed) engine.removeConnection!(id)
      for (const connection of changed) engine.addConnection!(connection)
    }
    if (engine.batch) engine.batch(apply)
    else apply()
  }

  return {
    sync,
    reset(next: readonly ConnectionDescriptor[]) {
      known = new Map(next.map((connection) => [connection.id, connectionSignature(connection)]))
      lastRaw = toRaw(next)
    },
  }
}
