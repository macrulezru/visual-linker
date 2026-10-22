import { addComponent, addImports, addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'
import type { NuxtModule } from '@nuxt/schema'
import type { ConnectConfig, InteractionConfig, VisualLinkerConfig } from '@macrulez/visual-linker-vue'

export type SerializableConnectConfig = Omit<ConnectConfig, 'validate'>

export type SerializableInteractionConfig = Omit<InteractionConfig, 'connect'> & {
  connect?: SerializableConnectConfig
}

export type ModuleOptions = Omit<VisualLinkerConfig, 'interaction'> & {
  interaction?: SerializableInteractionConfig
}

const visualLinkerModule: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@macrulez/visual-linker-nuxt',
    configKey: 'visualLinker',
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    addComponent({ name: 'VisualLinker', export: 'VisualLinker', filePath: '@macrulez/visual-linker-vue' })
    addImports({ name: 'useVisualLinker', from: '@macrulez/visual-linker-vue' })

    const connect = (options as { interaction?: { connect?: { validate?: unknown } } } | undefined)?.interaction
      ?.connect
    if (typeof connect?.validate === 'function') {
      console.warn(
        '[visual-linker] interaction.connect.validate cannot be set in the Nuxt module options (runtimeConfig is JSON only) and was dropped — pass it in the config of <VisualLinker> instead.',
      )
    }

    nuxt.options.runtimeConfig.public.visualLinker = JSON.parse(JSON.stringify(options ?? {}))

    addPlugin(resolver.resolve('./runtime/plugin'))
  },
})

export default visualLinkerModule
