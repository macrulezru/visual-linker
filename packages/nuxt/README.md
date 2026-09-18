# **Visual Linker Nuxt**

![Visual Linker Nuxt](https://github.com/macrulezru/assets/blob/master/packages-images/visual-linker-nuxt-vuecraft.png?raw=true)

Nuxt module wrapping
[`@macrulez/visual-linker-vue`](https://www.npmjs.com/package/@macrulez/visual-linker-vue):
auto-imported `<VisualLinker>`/`useVisualLinker`, and a client-only plugin
that seeds their shared option defaults from your `nuxt.config.ts` — no
manual `<ClientOnly>` wrapping needed, both are already SSR-safe on their
own.

Part of the [visual-linker](https://github.com/macrulezru/visual-linker)
monorepo.

---

## Features

- **Auto-imports `<VisualLinker>` and `useVisualLinker`** — registered/imported from `@macrulez/visual-linker-vue`, no explicit `import` anywhere in your app
- **Module options forwarded through `runtimeConfig`** — `defaultCurve`, `showPorts`, curve-geometry and port/marker-size knobs, `dragGridSize` — set once in `nuxt.config.ts`, applied everywhere
- **A client-only plugin seeds those defaults** — reads the runtime config and calls `setVisualLinkerDefaults(...)` once, on the client
- **Nothing needs `<ClientOnly>`** — the component/composable are SSR-safe on their own; this module's client-only-ness is only about _when_ the defaults get applied

---

## When you'd reach for this

You're already on Nuxt and want `<VisualLinker>`/`useVisualLinker` wired
up with zero manual setup — auto-imports, and one place to configure
curve/port defaults instead of passing the same `options` at every call
site.

- **Passing the same `options` to every `<VisualLinker>` on the page gets old** — Set `defaultCurve`/`showPorts`/etc. once in `nuxt.config.ts` and every instance that doesn't override them picks up your project's defaults automatically.
- **You'd rather not remember to import the component in every page** — Auto-imports mean `<VisualLinker>`/`useVisualLinker()` are just available, the same way Nuxt's own built-ins are.
- **A team member reaches for `<ClientOnly>` out of habit** — There's nothing to wrap. Both already render an SSR-safe no-op and pick up the real diagram after hydration on their own.

---

## Installation

```bash
npm install @macrulez/visual-linker-nuxt
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@macrulez/visual-linker-nuxt'],
  visualLinker: {
    defaultCurve: 'smoothstep',
    showPorts: true,
  },
})
```

Requires Nuxt `^3.9.0 || ^4.0.0`.

### Quick start

Once the module is registered, just use the component — no imports:

```vue
<template>
  <VisualLinker :blocks="blocks" :connections="connections">
    <template v-for="b in blocks" #[`block-${b.id}`]="{}" :key="b.id">
      <div class="card">{{ b.id }}</div>
    </template>
  </VisualLinker>
</template>
```

See
[`@macrulez/visual-linker-vue`'s README](https://www.npmjs.com/package/@macrulez/visual-linker-vue)
for the full component/composable API.

### More examples

#### What the module does

1. **Auto-imports** `<VisualLinker>` as a global component and `useVisualLinker` as an auto-import, both sourced from `@macrulez/visual-linker-vue` — no explicit `import` needed in your components.
2. **Forwards module options** into `runtimeConfig.public.visualLinker`.
3. **Registers a client-only plugin** (`runtime/plugin.client.ts`) that reads that runtime config and calls `setVisualLinkerDefaults(...)` — so every `<VisualLinker>`/`useVisualLinker()` use that doesn't pass its own `options` picks up your configured defaults.

No `defaults` are hardcoded in the module itself — a field left unset in
`nuxt.config.ts` falls all the way through to
`@macrulez/visual-linker-core`'s own built-in default, so a future change
to core's default is never silently shadowed by this module.

#### Module options

| Option                                                                                      | Mirrors                                |                                          |
| ------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------- |
| `defaultCurve`                                                                              | `VisualLinkerOptions.defaultCurve`     | `'bezier' \| 'straight' \| 'smoothstep'` |
| `showPorts`                                                                                 | `VisualLinkerOptions.showPorts`        |                                          |
| `curvature` / `curveMinReach` / `curveMaxReach` / `curveAngleBlend` / `curveAngleMaxOffset` | matching `defaultCurveXxx` fields      | bezier geometry                          |
| `dragGridSize`                                                                              | `VisualLinkerOptions.dragGridSize`     |                                          |
| `portRadius` / `portColor` / `portStrokeColor` / `portStrokeWidth`                          | matching `defaultPortXxx` fields       | built-in port dot look                   |
| `circleMarkerSize` / `squareMarkerSize` / `diamondMarkerSize` / `arrowMarkerSize`           | matching `defaultXxxMarkerSize` fields |                                          |

**Not covered by module options** (set these directly on
`<VisualLinker :options="...">`/`useVisualLinker()` instead):
`defaultCornerRadius`, `defaultMaxTrunkReach`, `draggable`, `dragBounds`.

#### Setting an app-wide curve default

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@macrulez/visual-linker-nuxt'],
  visualLinker: {
    defaultCurve: 'smoothstep',
    dragGridSize: 20,
  },
})
```

Every `<VisualLinker>`/`useVisualLinker()` call in the app now defaults
to orthogonal routing and a 20px drag grid, unless a call site passes its
own `options.defaultCurve`/`dragGridSize` to override it.

---

## Documentation & links

- 📖 **Full documentation:** [npm.vuecraft.ru/en/packages/visual-linker](https://npm.vuecraft.ru/en/packages/visual-linker/guide/nuxt-module.html)
- 🌐 **VueCraft:** [vuecraft.ru/en](https://vuecraft.ru/en)
- 👤 **Author:** [macrulez.ru/en](https://macrulez.ru/en)
- 💻 **GitHub:** [macrulezru/visual-linker/packages/nuxt](https://github.com/macrulezru/visual-linker/tree/master/packages/nuxt)
- 📦 **NPM:** [@macrulez/visual-linker-nuxt](https://www.npmjs.com/package/@macrulez/visual-linker-nuxt)
- 🐛 **Issues:** [github.com/macrulezru/visual-linker/issues](https://github.com/macrulezru/visual-linker/issues)

---

## License

MIT

---

## 💖 Support the project

Open source takes time and effort. If this library saves you time or brings value, consider supporting further development.

<a href="https://donate.cryptocloud.plus/M6O34NIN" target="_blank">
  <img src="https://img.shields.io/badge/Donate-CryptoCloud-8A2BE2?style=for-the-badge&logo=cryptocurrency&logoColor=white" alt="Donate via CryptoCloud">
</a>

Thank you for being part of this journey. ❤️
