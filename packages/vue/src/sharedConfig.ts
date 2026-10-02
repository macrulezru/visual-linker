import { inject, provide, reactive, type App, type InjectionKey } from 'vue'
import { mergeConfig, type VisualLinkerConfig } from '@macrulez/visual-linker-core'

export const VISUAL_LINKER_CONFIG_KEY: InjectionKey<VisualLinkerConfig> = Symbol('visual-linker-config')

export function createSharedConfig(initial?: VisualLinkerConfig): VisualLinkerConfig {
  return reactive<VisualLinkerConfig>(mergeConfig<VisualLinkerConfig>(initial))
}

export function provideVisualLinkerConfig(initial?: VisualLinkerConfig): VisualLinkerConfig {
  const shared = createSharedConfig(initial)
  provide(VISUAL_LINKER_CONFIG_KEY, shared)
  return shared
}

export function installVisualLinkerConfig(app: App, initial?: VisualLinkerConfig): VisualLinkerConfig {
  const shared = createSharedConfig(initial)
  app.provide(VISUAL_LINKER_CONFIG_KEY, shared)
  return shared
}

export function useVisualLinkerConfig(): VisualLinkerConfig {
  const shared = inject(VISUAL_LINKER_CONFIG_KEY, null)
  if (!shared) {
    throw new Error(
      '[visual-linker] no shared config: install VisualLinkerPlugin or call provideVisualLinkerConfig() in an ancestor',
    )
  }
  return shared
}

export function injectSharedConfig(): VisualLinkerConfig | undefined {
  return inject(VISUAL_LINKER_CONFIG_KEY, null) ?? undefined
}
