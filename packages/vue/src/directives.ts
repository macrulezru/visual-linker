import type { ObjectDirective } from 'vue'
import {
  blockDirectiveOptions,
  notifyScopes,
  portDirectiveOptions,
  VL_ATTR,
  type BlockDirectiveOptions,
  type BlockDirectiveValue,
  type PortDirectiveOptions,
  type PortDirectiveValue,
} from './discovery'

function normalize<T extends { id: string }>(value: string | T): T {
  return (typeof value === 'string' ? { id: value } : value) as T
}

function setOptionalAttribute(el: HTMLElement, name: string, next: string | undefined, previous: string | undefined) {
  if (next !== undefined) el.setAttribute(name, next)
  else if (previous !== undefined) el.removeAttribute(name)
}

/** Only the attributes a server render can emit ahead of hydration — the rest of the options stay off-DOM. */
function blockSsrAttributes(options: BlockDirectiveOptions): Record<string, string> {
  return { [VL_ATTR.block]: options.id, ...(options.linker !== undefined ? { [VL_ATTR.linker]: options.linker } : {}) }
}

function portSsrAttributes(options: PortDirectiveOptions): Record<string, string> {
  return {
    [VL_ATTR.port]: options.id,
    ...(options.block !== undefined ? { [VL_ATTR.portBlock]: options.block } : {}),
    ...(options.linker !== undefined ? { [VL_ATTR.linker]: options.linker } : {}),
  }
}

function applyBlock(el: HTMLElement, value: BlockDirectiveValue, oldValue?: BlockDirectiveValue | null) {
  const options = normalize<BlockDirectiveOptions>(value)
  const previous = oldValue ? normalize<BlockDirectiveOptions>(oldValue) : undefined
  el.setAttribute(VL_ATTR.block, options.id)
  setOptionalAttribute(el, VL_ATTR.linker, options.linker, previous?.linker)
  blockDirectiveOptions.set(el, options)
  notifyScopes()
}

function applyPort(el: HTMLElement, value: PortDirectiveValue, oldValue?: PortDirectiveValue | null) {
  const options = normalize<PortDirectiveOptions>(value)
  const previous = oldValue ? normalize<PortDirectiveOptions>(oldValue) : undefined
  el.setAttribute(VL_ATTR.port, options.id)
  setOptionalAttribute(el, VL_ATTR.portBlock, options.block, previous?.block)
  setOptionalAttribute(el, VL_ATTR.linker, options.linker, previous?.linker)
  portDirectiveOptions.set(el, options)
  notifyScopes()
}

/**
 * Marks any element — at any depth, inside any wrapper component — as a
 * block of the nearest enclosing `<VisualLinker>` (or of the one named by
 * `linker`). `v-vl-block="'b1'"` or `v-vl-block="{ id: 'b1', draggable: true }"`.
 */
export const vVlBlock: ObjectDirective<HTMLElement, BlockDirectiveValue> = {
  mounted: (el, { value }) => applyBlock(el, value),
  updated: (el, { value, oldValue }) => applyBlock(el, value, oldValue),
  unmounted(el) {
    blockDirectiveOptions.delete(el)
    notifyScopes()
  },
  getSSRProps: ({ value }) => blockSsrAttributes(normalize<BlockDirectiveOptions>(value)),
}

/**
 * Marks an element as a connection port. It belongs to the nearest ancestor
 * block unless `block` names one explicitly. `v-vl-port="'out'"` or
 * `v-vl-port="{ id: 'out', side: ['left', 'right'] }"`.
 */
export const vVlPort: ObjectDirective<HTMLElement, PortDirectiveValue> = {
  mounted: (el, { value }) => applyPort(el, value),
  updated: (el, { value, oldValue }) => applyPort(el, value, oldValue),
  unmounted(el) {
    portDirectiveOptions.delete(el)
    notifyScopes()
  },
  getSSRProps: ({ value }) => portSsrAttributes(normalize<PortDirectiveOptions>(value)),
}
