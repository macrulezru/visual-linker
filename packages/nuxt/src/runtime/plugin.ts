import { installVisualLinkerConfig, vVlBlock, vVlPort, type VisualLinkerConfig } from '@macrulez/visual-linker-vue'
import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('vl-block', vVlBlock)
  nuxtApp.vueApp.directive('vl-port', vVlPort)
  const config = useRuntimeConfig().public.visualLinker as VisualLinkerConfig | undefined
  installVisualLinkerConfig(nuxtApp.vueApp, config)
})
