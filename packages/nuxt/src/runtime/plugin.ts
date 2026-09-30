import { vVlBlock, vVlPort } from '@macrulez/visual-linker-vue'
import { defineNuxtPlugin } from 'nuxt/app'

// Universal (not client-only): the directives' getSSRProps put the
// data-vl-* discovery attributes straight into server-rendered markup.
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('vl-block', vVlBlock)
  nuxtApp.vueApp.directive('vl-port', vVlPort)
})
