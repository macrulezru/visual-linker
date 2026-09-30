import type { Plugin } from 'vue'
import { vVlBlock, vVlPort } from './directives'
import { VisualLinker } from './VisualLinker'

/** `app.use(VisualLinkerPlugin)` — registers `<VisualLinker>` plus the `v-vl-block` / `v-vl-port` directives globally. */
export const VisualLinkerPlugin: Plugin = {
  install(app) {
    app.component('VisualLinker', VisualLinker)
    app.directive('vl-block', vVlBlock)
    app.directive('vl-port', vVlPort)
  },
}
