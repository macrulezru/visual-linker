import type { Plugin } from 'vue'
import type { VisualLinkerConfig } from '@macrulez/visual-linker-core'
import { vVlBlock, vVlPort } from './directives'
import { installVisualLinkerConfig } from './sharedConfig'
import { VisualLinker } from './VisualLinker'

export interface VisualLinkerPluginOptions {
  config?: VisualLinkerConfig
}

export const VisualLinkerPlugin: Plugin<[VisualLinkerPluginOptions?]> = {
  install(app, options) {
    installVisualLinkerConfig(app, options?.config)
    app.component('VisualLinker', VisualLinker)
    app.directive('vl-block', vVlBlock)
    app.directive('vl-port', vVlPort)
  },
}
