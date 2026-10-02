import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    module: 'src/module.ts',
    'runtime/plugin': 'src/runtime/plugin.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node18',
  external: ['@nuxt/kit', '@nuxt/schema', 'nuxt', 'nuxt/app', 'vue', '@macrulez/visual-linker-vue'],
})
