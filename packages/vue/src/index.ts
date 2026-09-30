export { VisualLinker } from './VisualLinker'
export type { VisualLinkerBlock, VisualLinkerScope } from './VisualLinker'

export { vVlBlock, vVlPort } from './directives'
export { VisualLinkerPlugin } from './plugin'
export { VL_ATTR } from './discovery'
export type { BlockDirectiveOptions, BlockDirectiveValue, PortDirectiveOptions, PortDirectiveValue } from './discovery'

export { useVisualLinker } from './useVisualLinker'
export type { UseVisualLinkerOptions, UseVisualLinkerReturn } from './useVisualLinker'

export { setVisualLinkerDefaults, visualLinkerDefaults } from './config'
export type { VisualLinkerDefaults } from './config'

export type { RefFriendlyBlock, RefFriendlyDragBounds, RefFriendlyElement, RefFriendlyPort } from './refPorts'

// Every @macrulez/visual-linker-core export is re-exported here too, so
// installing just @macrulez/visual-linker-vue reaches the framework-agnostic
// layer directly, without a separate dependency on @macrulez/visual-linker-core.
export * from '@macrulez/visual-linker-core'
