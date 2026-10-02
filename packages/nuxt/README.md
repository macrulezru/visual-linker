# **Visual Linker Nuxt**

![Visual Linker Nuxt](https://github.com/macrulezru/assets/blob/master/packages-images/visual-linker-nuxt-vuecraft.png?raw=true)

Nuxt module wrapping
[`@macrulez/visual-linker-vue`](https://www.npmjs.com/package/@macrulez/visual-linker-vue):
auto-imported `<VisualLinker>`/`useVisualLinker`, and a shared configuration
of every diagram taken from your `nuxt.config.ts` — no manual `<ClientOnly>`
wrapping needed, both are already SSR-safe on their own.

Part of the [visual-linker](https://github.com/macrulezru/visual-linker)
monorepo.

---

## Features

- **Auto-imports `<VisualLinker>` and `useVisualLinker`** — registered/imported from `@macrulez/visual-linker-vue`, no explicit `import` anywhere in your app
- **Registers `v-vl-block` / `v-vl-port` globally** — on the server too, so the `data-vl-*` discovery attributes are already in the server-rendered HTML
- **The whole configuration, set once** — `visualLinker` in `nuxt.config.ts` takes the same structure as the engine (`theme`, `lines`, `markers`, `ports`, `labels`, `blocks`, `interaction`), applied to every diagram
- **The configuration is shared through Vue's `provide`** — one reactive object per app, which `useVisualLinkerConfig()` exposes for runtime changes (a theme switch re-styles every diagram)
- **Nothing needs `<ClientOnly>`** — the component/composable are SSR-safe on their own

---

## When you'd reach for this

You're already on Nuxt and want `<VisualLinker>`/`useVisualLinker` wired
up with zero manual setup — auto-imports, and one place to configure
style, theme and behavior in one structured config instead of passing the
same `config` at every call site.

- **Passing the same `config` to every `<VisualLinker>` on the page gets old** — Set `lines`/`ports`/`theme`/etc. once in `nuxt.config.ts` and every instance that doesn't override them picks up your project's defaults automatically.
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
    lines: { curve: 'smoothstep' },
    ports: { show: true },
  },
})
```

Requires Nuxt `^3.9.0 || ^4.0.0`.

### Quick start

Once the module is registered, just use the component — no imports:

```vue
<template>
  <VisualLinker :connections="connections">
    <div v-for="b in blocks" :key="b.id" v-vl-block="b.id" class="card">{{ b.id }}</div>
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
3. **Registers one universal plugin** (`runtime/plugin.ts`): the `v-vl-block` / `v-vl-port` directives — on the server too, so the `data-vl-*` attributes are already in the SSR markup — and the app-wide shared config, taken from that runtime config. Every `<VisualLinker>`/`useVisualLinker()` merges it under its own `config`, and `useVisualLinkerConfig()` (from `@macrulez/visual-linker-vue`) hands you the same reactive object to change at runtime, e.g. to switch the theme.

No `defaults` are hardcoded in the module itself — a field left unset in
`nuxt.config.ts` falls all the way through to
`@macrulez/visual-linker-core`'s own built-in default, so a future change
to core's default is never silently shadowed by this module.

#### Module options

The `visualLinker` key is a `VisualLinkerConfig` — exactly the object
`createVisualLinker()` and `<VisualLinker :config>` take, so there is no
separate list of module-only names to learn:

| Group         | What it configures                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| `theme`       | color tokens, written as CSS variables — `lightTheme`/`darkTheme` or your own                                 |
| `lines`       | curve, color/width/dashed, `hover`/`selected`/`focus`, `bezier`, `smoothstep`, `routing`, `jumps`, `animated` |
| `markers`     | `start`/`end` markers (with their own states) and per-shape `sizes`                                           |
| `ports`       | the built-in dot (`show`, `radius`, `fill`, `stroke`, states), default `side`/`offset`, `spread`              |
| `labels`      | the look of library-drawn connection labels, with states                                                      |
| `blocks`      | `draggable`, `drag: { grid, bounds }` (values must be plain data — `'container'` or an inset object)          |
| `interaction` | `hover`, `highlight`, `selectable`, `clipToScrollParents`                                                     |

Everything is optional and nothing is hardcoded in the module: a field left
out falls through to `@macrulez/visual-linker-core`'s own built-in default.
The options travel through `runtimeConfig.public.visualLinker`, so they must
be JSON-serializable (no `HTMLElement` for `drag.bounds`).

#### An app-wide look

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@macrulez/visual-linker-nuxt'],
  visualLinker: {
    theme: { line: '#6366f1', lineHover: '#312e81' },
    lines: { curve: 'smoothstep', smoothstep: { cornerRadius: 10 }, jumps: true },
    markers: { end: { shape: 'arrow', hover: { size: 10 } } },
    blocks: { draggable: true, drag: { grid: 20 } },
  },
})
```

Every `<VisualLinker>`/`useVisualLinker()` call in the app starts from this,
and a call site's own `config` overrides it field by field. The values are
also reactive at runtime: `useVisualLinkerConfig().theme = darkTheme`
(from `@macrulez/visual-linker-vue`) re-themes every diagram on the page.

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
