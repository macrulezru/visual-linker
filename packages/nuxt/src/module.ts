import { addComponent, addImports, addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'
import type { NuxtModule } from '@nuxt/schema'
import type { VisualLinkerConfig } from '@macrulez/visual-linker-vue'

export type ModuleOptions = VisualLinkerConfig

const visualLinkerModule: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@macrulez/visual-linker-nuxt',
    configKey: 'visualLinker',
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    addComponent({ name: 'VisualLinker', export: 'VisualLinker', filePath: '@macrulez/visual-linker-vue' })
    addImports({ name: 'useVisualLinker', from: '@macrulez/visual-linker-vue' })

    nuxt.options.runtimeConfig.public.visualLinker = JSON.parse(JSON.stringify(options ?? {}))

    addPlugin(resolver.resolve('./runtime/plugin'))
  },
})

export default visualLinkerModule
