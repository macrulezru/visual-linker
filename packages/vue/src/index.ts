export { VisualLinker } from './VisualLinker'
export type { VisualLinkerBlock } from './VisualLinker'

export { useVisualLinker } from './useVisualLinker'
export type { UseVisualLinkerOptions, UseVisualLinkerReturn } from './useVisualLinker'

export { setVisualLinkerDefaults, visualLinkerDefaults } from './config'
export type { VisualLinkerDefaults } from './config'

// Every @macrulez/visual-linker-core export is re-exported here too, so
// installing just @macrulez/visual-linker-vue reaches the framework-agnostic
// layer directly, without a separate dependency on @macrulez/visual-linker-core.
export * from '@macrulez/visual-linker-core'
