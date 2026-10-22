import type { BlockDescriptor, PortDescriptor } from '@macrulez/visual-linker-core'
import {
  blockDirectiveOptions,
  collectBlocks,
  discoverBlock,
  discoverPort,
  mergeExplicit,
  ownsElement,
  portDirectiveOptions,
  searchRoot,
  VL_ATTR,
  type DiscoveryScope,
  type ScopeChange,
  type VisualLinkerBlock,
} from './discovery'

export interface BlockRegistry {
  fullScan(): BlockDescriptor[]
  apply(changes: Iterable<ScopeChange>): BlockDescriptor[] | null
  list(): BlockDescriptor[]
  readonly recomputations: number
}

function byDocumentOrder(a: HTMLElement, b: HTMLElement): number {
  if (a === b) return 0
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
}

export function isDirectiveManaged(el: Element): boolean {
  return blockDirectiveOptions.has(el) || portDirectiveOptions.has(el)
}

export function createBlockRegistry(
  scope: DiscoveryScope,
  explicit: () => readonly VisualLinkerBlock[],
): BlockRegistry {
  const descriptors = new Map<string, BlockDescriptor>()
  const blockEls = new Map<HTMLElement, string>()
  const idToEl = new Map<string, HTMLElement>()
  const portOwner = new Map<HTMLElement, string>()
  const ownerPorts = new Map<string, Set<HTMLElement>>()
  let recomputations = 0

  function ownerPortList(id: string): PortDescriptor[] {
    const set = ownerPorts.get(id)
    if (!set || set.size === 0) return []
    return [...set].sort(byDocumentOrder).map((el) => discoverPort(el, el.getAttribute(VL_ATTR.port)!))
  }

  function build(id: string, el: HTMLElement): BlockDescriptor {
    const discovered = discoverBlock(el, id)
    const explicitBlock = explicit().find((block) => block.id === id)
    const base = explicitBlock ? (mergeExplicit(scope, explicitBlock, discovered) ?? discovered) : discovered
    const ports = ownerPortList(id)
    if (ports.length > 0) base.ports = [...(base.ports ?? []), ...ports]
    return base
  }

  function ownerOfPort(el: HTMLElement): string | undefined {
    const explicitOwner = portDirectiveOptions.get(el)?.block ?? el.getAttribute(VL_ATTR.portBlock) ?? undefined
    if (explicitOwner !== undefined) return idToEl.has(explicitOwner) ? explicitOwner : undefined
    for (let node: Element | null = el; node; node = node.parentElement) {
      const id = blockEls.get(node as HTMLElement)
      if (id !== undefined) return id
    }
    return undefined
  }

  function unlinkPort(el: HTMLElement, touched: Set<string>) {
    const previous = portOwner.get(el)
    if (previous === undefined) return
    ownerPorts.get(previous)?.delete(el)
    portOwner.delete(el)
    touched.add(previous)
  }

  function linkPort(el: HTMLElement, touched: Set<string>) {
    const id = el.getAttribute(VL_ATTR.port)
    const live = Boolean(id) && el.isConnected && ownsElement(el, scope)
    const owner = live ? ownerOfPort(el) : undefined
    const previous = portOwner.get(el)
    if (previous === owner) {
      if (owner !== undefined) touched.add(owner)
      return
    }
    unlinkPort(el, touched)
    if (owner === undefined) return
    portOwner.set(el, owner)
    let set = ownerPorts.get(owner)
    if (!set) ownerPorts.set(owner, (set = new Set()))
    set.add(el)
    touched.add(owner)
  }

  function fullScan(): BlockDescriptor[] {
    recomputations++
    const list = collectBlocks(scope, explicit())
    descriptors.clear()
    blockEls.clear()
    idToEl.clear()
    portOwner.clear()
    ownerPorts.clear()
    for (const block of list) {
      descriptors.set(block.id, block)
      blockEls.set(block.el, block.id)
      idToEl.set(block.id, block.el)
    }
    const touched = new Set<string>()
    for (const el of searchRoot(scope).querySelectorAll<HTMLElement>(`[${VL_ATTR.port}]`)) linkPort(el, touched)
    return list
  }

  function apply(changes: Iterable<ScopeChange>): BlockDescriptor[] | null {
    recomputations++
    const touched = new Set<string>()
    const removed = new Set<string>()
    const orphans: HTMLElement[] = []
    const added: HTMLElement[] = []
    const portChanges: ScopeChange[] = []

    function dropBlock(id: string) {
      const el = idToEl.get(id)
      descriptors.delete(id)
      idToEl.delete(id)
      if (el) blockEls.delete(el)
      removed.add(id)
      for (const port of [...(ownerPorts.get(id) ?? [])]) {
        unlinkPort(port, touched)
        orphans.push(port)
      }
      ownerPorts.delete(id)
    }

    for (const change of changes) {
      if (change.kind === 'port') {
        portChanges.push(change)
        continue
      }
      const { el, op } = change
      const id = el.getAttribute(VL_ATTR.block)
      const previous = blockEls.get(el)
      const live = op === 'update' && Boolean(id) && el.isConnected && ownsElement(el, scope)
      if (!live) {
        if (previous !== undefined) dropBlock(previous)
        continue
      }
      if (previous !== undefined && previous !== id) dropBlock(previous)
      blockEls.set(el, id!)
      idToEl.set(id!, el)
      removed.delete(id!)
      touched.add(id!)
      added.push(el)
    }

    for (const el of added) {
      for (const port of el.querySelectorAll<HTMLElement>(`[${VL_ATTR.port}]`)) linkPort(port, touched)
    }
    for (const port of orphans) linkPort(port, touched)
    for (const { el, op } of portChanges) {
      if (op === 'remove') unlinkPort(el, touched)
      else linkPort(el, touched)
    }

    let changed = removed.size > 0
    for (const id of touched) {
      const el = idToEl.get(id)
      if (!el) continue
      descriptors.set(id, build(id, el))
      changed = true
    }
    return changed ? list() : null
  }

  function list(): BlockDescriptor[] {
    return [...descriptors.values()]
  }

  return {
    fullScan,
    apply,
    list,
    get recomputations() {
      return recomputations
    },
  }
}
