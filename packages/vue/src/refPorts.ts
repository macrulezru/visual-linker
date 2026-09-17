import { toValue, type MaybeRefOrGetter } from 'vue'
import type { BlockDescriptor, PortDescriptor } from '@macrulez/visual-linker-core'

/** A CSS selector, or an element handed over as a Vue ref/getter/plain HTMLElement. */
export type RefFriendlyElement = string | MaybeRefOrGetter<HTMLElement | null | undefined>

/** Unwraps a `RefFriendlyElement`, leaving a CSS selector string untouched. */
export function resolveElement(value: RefFriendlyElement | undefined): string | HTMLElement | undefined {
  return typeof value === 'string' ? value : (toValue(value) ?? undefined)
}

/**
 * A `PortDescriptor` whose element-valued fields also accept a Vue ref/getter
 * pointing at a template ref — so a port can target (or anchor to) an element
 * declared in the caller's own template (`ref="row14"`) directly, instead of
 * requiring a `data-*` attribute plus a CSS selector string just to find it.
 * The ref may still be `null`/`undefined` before that element mounts; the
 * port then behaves as if `target`/`anchorEl` were omitted until it resolves.
 */
export interface RefFriendlyPort extends Omit<PortDescriptor, 'target' | 'anchorEl'> {
  target?: RefFriendlyElement
  anchorEl?: MaybeRefOrGetter<HTMLElement | null | undefined>
}

/**
 * Unwraps a `RefFriendlyPort`'s ref/getter fields into the plain
 * `HTMLElement | undefined` values `@macrulez/visual-linker-core` actually
 * understands. Reading `.value` here (via `toValue`, inside `resolveElement`)
 * is what lets a `watchEffect` around this call pick up a template ref that
 * starts `null` and later resolves once its element mounts, even though the
 * surrounding `blocks`/`ports` array itself never changes identity.
 */
export function resolvePortForCore(port: RefFriendlyPort): PortDescriptor {
  const { target, anchorEl, ...rest } = port
  return { ...rest, target: resolveElement(target), anchorEl: toValue(anchorEl) ?? undefined }
}

/**
 * `useVisualLinker`'s block shape: unlike the `<VisualLinker>` component
 * (which always owns a wrapper element per block), this low-level API has no
 * wrapper of its own, so `el`/`dragHandle` need the same ref/getter
 * flexibility as a port's `target` — pass a template ref directly instead of
 * dereferencing it yourself on every call site.
 */
export interface RefFriendlyBlock extends Omit<BlockDescriptor, 'el' | 'ports' | 'dragHandle'> {
  el: MaybeRefOrGetter<HTMLElement | null | undefined>
  ports?: RefFriendlyPort[]
  dragHandle?: RefFriendlyElement
}

/** Unwraps a `RefFriendlyBlock[]`, dropping any block whose `el` hasn't resolved to an element yet. */
export function resolveBlocksForCore(blocks: RefFriendlyBlock[]): BlockDescriptor[] {
  const descriptors: BlockDescriptor[] = []
  for (const block of blocks) {
    const el = toValue(block.el)
    if (el)
      descriptors.push({
        ...block,
        el,
        ports: block.ports?.map(resolvePortForCore),
        dragHandle: resolveElement(block.dragHandle),
      })
  }
  return descriptors
}
