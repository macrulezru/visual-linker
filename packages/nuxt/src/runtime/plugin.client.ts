import { setVisualLinkerDefaults, type VisualLinkerDefaults } from '@macrulez/visual-linker-vue'
import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig().public.visualLinker as VisualLinkerDefaults | undefined
  if (config) setVisualLinkerDefaults(config)
})
