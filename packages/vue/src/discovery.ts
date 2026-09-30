import { toValue } from 'vue'
import type { BlockDescriptor, DragBounds, FixedSide, PortDescriptor, PortSide } from '@macrulez/visual-linker-core'
import {
  resolveDragBoundsForCore,
  resolveElement,
  resolvePortForCore,
  type RefFriendlyDragBounds,
  type RefFriendlyElement,
  type RefFriendlyPort,
} from './refPorts'

/** Every HTML attribute the Vue layer reads (or, for `v-vl-block`/`v-vl-port`, writes) to discover blocks and ports. */
export const VL_ATTR = {
  root: 'data-vl-root',
  linker: 'data-vl-linker',
  block: 'data-vl-block',
  draggable: 'data-vl-draggable',
  dragHandle: 'data-vl-drag-handle',
  dragBounds: 'data-vl-drag-bounds',
  port: 'data-vl-port',
  portBlock: 'data-vl-port-block',
  side: 'data-vl-side',
  offset: 'data-vl-offset',
  anchor: 'data-vl-anchor',
} as const

export const OBSERVED_ATTRS = Object.values(VL_ATTR).filter((attr) => attr !== VL_ATTR.root)

/**
 * A block passed explicitly through `<VisualLinker :blocks>`. With `el` it
 * registers that element directly (a ref/getter, a plain element, or a CSS
 * selector — resolved inside the `<VisualLinker>` area, or across the whole
 * document with `scope="page"`). Without `el` it only adds config (ports,
 * drag options) to a block already marked in the template via `v-vl-block`
 * or `data-vl-block` with the same id.
 */
export interface VisualLinkerBlock {
  id: string
  el?: RefFriendlyElement
  ports?: RefFriendlyPort[]
  /** Overrides the `options.draggable` default for this block. */
  draggable?: boolean
  /** CSS selector (inside the block), or a ref/getter/element, for the drag handle. */
  dragHandle?: RefFriendlyElement
  /** Overrides the `options.dragBounds` default for this block. */
  dragBounds?: RefFriendlyDragBounds
}

export interface BlockDirectiveOptions {
  id: string
  /** Assigns the block to the `<VisualLinker name="...">` with this name, wherever it sits on the page. */
  linker?: string
  draggable?: boolean
  dragHandle?: RefFriendlyElement
  dragBounds?: RefFriendlyDragBounds
}
/** `v-vl-block="'id'"` or `v-vl-block="{ id, ...options }"`. */
export type BlockDirectiveValue = string | BlockDirectiveOptions

export interface PortDirectiveOptions extends Omit<RefFriendlyPort, 'target'> {
  /** Owning block id. Omitted => the nearest ancestor element registered as a block. */
  block?: string
  linker?: string
}
/** `v-vl-port="'id'"` or `v-vl-port="{ id, ...options }"`. */
export type PortDirectiveValue = string | PortDirectiveOptions

// Directive options live off-DOM (they may hold refs/elements an attribute
// can't carry); the directive also mirrors id/linker onto attributes, so one
// DOM scan finds directive-marked and plain data-attribute-marked elements alike.
export const blockDirectiveOptions = new WeakMap<Element, BlockDirectiveOptions>()
export const portDirectiveOptions = new WeakMap<Element, PortDirectiveOptions>()

const liveScopes = new Set<() => void>()

/** Registers a `<VisualLinker>`'s rescan trigger, so directive config changes that touch no attribute still reach it. */
export function registerScope(schedule: () => void): () => void {
  liveScopes.add(schedule)
  return () => liveScopes.delete(schedule)
}

export function notifyScopes() {
  for (const schedule of liveScopes) schedule()
}

export interface DiscoveryScope {
  /** The `<VisualLinker>`'s own root element (carries `data-vl-root`). */
  root: HTMLElement
  /** `scope="page"`: blocks are looked up across the whole document, not just inside `root`. */
  page: boolean
  name?: string
}

/**
 * Which `<VisualLinker>` an element belongs to: an explicit `data-vl-linker`
 * name wins; otherwise the nearest enclosing `<VisualLinker>` area; an
 * element outside every area belongs to page-scoped linkers only.
 */
export function ownsElement(el: Element, scope: DiscoveryScope): boolean {
  const explicit = el.getAttribute(VL_ATTR.linker)
  if (explicit !== null) return explicit === scope.name
  const root = el.closest(`[${VL_ATTR.root}]`)
  if (root) return root === scope.root
  return scope.page
}

const SIDES = new Set(['top', 'right', 'bottom', 'left', 'auto'])

function parseBool(value: string | null): boolean | undefined {
  if (value === null) return undefined
  return value !== 'false'
}

function parseNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** `"left"` => one side; `"left right"` / `"left,right"` => a candidate list. */
function parseSide(value: string | null): PortSide | FixedSide[] | undefined {
  if (!value) return undefined
  const parts = value.split(/[\s,]+/).filter((part) => SIDES.has(part))
  if (parts.length === 0) return undefined
  if (parts.length === 1) return parts[0] as PortSide
  return parts.filter((part) => part !== 'auto') as FixedSide[]
}

function parseDragBounds(value: string | null): DragBounds | undefined {
  if (!value) return undefined
  if (value === 'container') return 'container'
  return document.querySelector<HTMLElement>(value) ?? undefined
}

function searchRoot(scope: DiscoveryScope): ParentNode {
  return scope.page ? document : scope.root
}

function resolveBlockElement(value: RefFriendlyElement, scope: DiscoveryScope): HTMLElement | undefined {
  if (typeof value === 'string') return searchRoot(scope).querySelector<HTMLElement>(value) ?? undefined
  return toValue(value) ?? undefined
}

function closestBlock(el: Element, blocksByEl: Map<Element, BlockDescriptor>): BlockDescriptor | undefined {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const block = blocksByEl.get(node)
    if (block) return block
  }
  return undefined
}

function discoverBlock(el: HTMLElement, id: string): BlockDescriptor {
  const directive = blockDirectiveOptions.get(el)
  return {
    id,
    el,
    draggable: directive?.draggable ?? parseBool(el.getAttribute(VL_ATTR.draggable)),
    dragHandle:
      directive?.dragHandle !== undefined
        ? resolveElement(directive.dragHandle)
        : (el.getAttribute(VL_ATTR.dragHandle) ?? undefined),
    dragBounds:
      directive?.dragBounds !== undefined
        ? resolveDragBoundsForCore(directive.dragBounds)
        : parseDragBounds(el.getAttribute(VL_ATTR.dragBounds)),
  }
}

function discoverPort(el: HTMLElement, id: string): PortDescriptor {
  const fromAttributes: PortDescriptor = {
    id,
    target: el,
    side: parseSide(el.getAttribute(VL_ATTR.side)),
    offset: parseNumber(el.getAttribute(VL_ATTR.offset)),
    anchorBlockId: el.getAttribute(VL_ATTR.anchor) ?? undefined,
  }
  const directive = portDirectiveOptions.get(el)
  if (!directive) return fromAttributes
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { block, linker, ...portOptions } = directive
  const fromDirective = resolvePortForCore({ ...portOptions, id, target: el })
  return {
    ...fromAttributes,
    ...Object.fromEntries(Object.entries(fromDirective).filter(([, value]) => value !== undefined)),
  } as PortDescriptor
}

/**
 * Builds the engine's block list from every source at once: elements marked
 * with `v-vl-block`/`data-vl-block` anywhere in scope (any nesting depth,
 * inside any wrapper components), then the explicit `blocks` prop on top
 * (wins per field for the same id), then every `v-vl-port`/`data-vl-port`
 * attached to its owning block. Reads refs via `toValue`, so calling this
 * inside a `watchEffect` tracks them.
 */
export function collectBlocks(scope: DiscoveryScope, explicit: readonly VisualLinkerBlock[]): BlockDescriptor[] {
  const root = searchRoot(scope)
  const byId = new Map<string, BlockDescriptor>()

  for (const el of root.querySelectorAll<HTMLElement>(`[${VL_ATTR.block}]`)) {
    const id = el.getAttribute(VL_ATTR.block)
    if (id && ownsElement(el, scope)) byId.set(id, discoverBlock(el, id))
  }

  for (const block of explicit) {
    const discovered = byId.get(block.id)
    const el = (block.el !== undefined ? resolveBlockElement(block.el, scope) : undefined) ?? discovered?.el
    if (!el) continue
    byId.set(block.id, {
      id: block.id,
      el,
      ports: block.ports?.map(resolvePortForCore) ?? discovered?.ports,
      draggable: block.draggable ?? discovered?.draggable,
      dragHandle: block.dragHandle !== undefined ? resolveElement(block.dragHandle) : discovered?.dragHandle,
      dragBounds: block.dragBounds !== undefined ? resolveDragBoundsForCore(block.dragBounds) : discovered?.dragBounds,
    })
  }

  const blocksByEl = new Map<Element, BlockDescriptor>()
  for (const block of byId.values()) blocksByEl.set(block.el, block)

  for (const el of root.querySelectorAll<HTMLElement>(`[${VL_ATTR.port}]`)) {
    const id = el.getAttribute(VL_ATTR.port)
    if (!id || !ownsElement(el, scope)) continue
    const ownerId = portDirectiveOptions.get(el)?.block ?? el.getAttribute(VL_ATTR.portBlock) ?? undefined
    const owner = ownerId !== undefined ? byId.get(ownerId) : closestBlock(el, blocksByEl)
    if (!owner) continue
    // Appended after any `blocks`-prop ports, so an explicitly configured
    // port with the same id keeps precedence (the engine uses the first match).
    owner.ports = [...(owner.ports ?? []), discoverPort(el, id)]
  }

  return [...byId.values()]
}

function sameSide(a: PortDescriptor['side'], b: PortDescriptor['side']): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.join() === b.join()
  return a === b
}

function sameBounds(a: DragBounds | undefined, b: DragBounds | undefined): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  if (a instanceof HTMLElement || b instanceof HTMLElement) return false
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left
}

function samePorts(a: PortDescriptor[] = [], b: PortDescriptor[] = []): boolean {
  return (
    a.length === b.length &&
    a.every((port, i) => {
      const other = b[i]!
      return (
        port.id === other.id &&
        port.target === other.target &&
        sameSide(port.side, other.side) &&
        port.offset === other.offset &&
        port.anchorBlockId === other.anchorBlockId &&
        port.anchorEl === other.anchorEl
      )
    })
  )
}

/** Structural equality of two block lists — lets a rescan that found nothing new skip re-registering every block with the engine. */
export function sameBlocks(a: readonly BlockDescriptor[], b: readonly BlockDescriptor[]): boolean {
  return (
    a.length === b.length &&
    a.every((block, i) => {
      const other = b[i]!
      return (
        block.id === other.id &&
        block.el === other.el &&
        block.draggable === other.draggable &&
        block.dragHandle === other.dragHandle &&
        sameBounds(block.dragBounds, other.dragBounds) &&
        samePorts(block.ports, other.ports)
      )
    })
  )
}
