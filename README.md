# **Visual Linker**

![Visual Linker](https://github.com/macrulezru/assets/blob/master/packages-images/visual-linker-vuecraft.png?raw=true)

Framework-agnostic engine that draws smart, auto-routed SVG connector
lines between DOM blocks you already control — with a Vue 3 adapter and a
Nuxt module wrapping it. You own the block markup and position; this only
measures it and draws the lines.

---

## Packages

| Package                                         | Description                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@macrulez/visual-linker-core`](packages/core) | Framework-agnostic engine — `createVisualLinker(container, options)`, no Vue involved.                                                      |
| [`@macrulez/visual-linker-vue`](packages/vue)   | `<VisualLinker>` component (slot per block) and `useVisualLinker()` composable — plus every core export, re-exported.                       |
| [`@macrulez/visual-linker-nuxt`](packages/nuxt) | Nuxt module wrapping the Vue package — auto-imports `<VisualLinker>`/`useVisualLinker`, seeds shared option defaults from `nuxt.config.ts`. |

---

## Features

- **Auto-side port routing** — each connection picks which side of a block to enter/exit on its own, resolved from the other endpoint's position; a candidate-side list narrows the automatic choice, and a bounded angle lean pulls the exit/entry angle toward the real target direction instead of staying rigidly perpendicular
- **Three curve types** — `bezier` (configurable curvature, min/max reach, angle lean), `smoothstep` (orthogonal routing with rounded corners and group-aware branch points for connections sharing a port), and `straight`
- **Block drag & drop** — pointer-driven, with an optional drag handle, a px grid snap, and bounds confined to the container, an element, or an inset box; every connected line re-routes in real time as a block moves
- **A typed event API** — drag/hover/click events, plus a per-render `layout` event carrying every connection's and port's resolved geometry, for building your own overlay content
- **Per-connection styling** — color, width, dashed, start/end markers (four built-in shapes or custom SVG), and a distinct hover style, all overridable per connection on top of instance-wide defaults
- **Resize & scroll reactivity out of the box** — every connection recomputes itself when a block resizes, the window resizes, or the container scrolls — no manual event wiring
- **A component, a composable, and a Nuxt module over one core** — `<VisualLinker>` with a slot per block, the low-level `useVisualLinker()` escape hatch, and a Nuxt module with auto-imports and config-level option defaults; both Vue packages **re-export the full core surface**, so installing just `@macrulez/visual-linker-vue` reaches the framework-agnostic layer too
- **Zero peer dependencies in core** — `@macrulez/visual-linker-core` runs anywhere, including outside a framework entirely

---

## When you'd reach for this

Connections between arbitrary interface blocks — a process map, an entity
diagram, a dependency visualization — usually mean either a heavyweight
diagramming engine with its own node system, or hand-rolled SVG path
drawing on top of ordinary markup, with coordinates recomputed by hand on
every resize and scroll. Visual Linker handles just that mechanics,
leaving the blocks' markup and positioning entirely yours.

- **A process flowchart built from ordinary cards** — Approval stages, a sales funnel, a request-processing pipeline. Lines between the cards route themselves automatically, picking an entry/exit side, and recompute on their own on resize/scroll instead of you recalculating coordinates by hand.
- **A dependency diagram between interface nodes** — System components, scenario steps, graph nodes. `smoothstep` gives strictly orthogonal routing with shared branch points for connections fanning out of one port, instead of a custom SVG path renderer.
- **An interactive diagram with draggable blocks** — The user drags blocks around, and the lines need to follow in real time while still picking their connection side automatically. Drag & drop, hover, and click on the connection itself are already part of the API, with a typed event surface.
- **A consistent connection style across a product's design system** — Each line can have its own color, width, dash pattern, and markers — connections styled with the same level of detail as the blocks themselves, not one hardcoded look.
- **A DOM-measured diagram that needs to survive layout changes** — A sidebar collapsing, a responsive breakpoint, a window resize. Every connection recomputes on `ResizeObserver`/scroll instead of drifting out of sync with the blocks it connects.

---

## Installation

| Peer dependency           | Required                                |
| ------------------------- | --------------------------------------- |
| Node.js `18+`             | always                                  |
| Vue `^3.3.0`              | only for `@macrulez/visual-linker-vue`  |
| Nuxt `^3.9.0 \|\| ^4.0.0` | only for `@macrulez/visual-linker-nuxt` |

Install whichever package matches your project — both Vue packages
already depend on the layer below them, so you don't need to install core
yourself unless you're using it directly, with no framework:

```bash
npm install @macrulez/visual-linker-core   # framework-agnostic core only
npm install @macrulez/visual-linker-vue    # Vue 3
npm install @macrulez/visual-linker-nuxt   # Nuxt (pulls in the Vue adapter)
```

### Quick start — Vanilla / Core

```ts
import { createVisualLinker } from '@macrulez/visual-linker-core'

const container = document.querySelector('#diagram')
const linker = createVisualLinker(container)

linker.setBlocks([
  { id: 'a', el: document.querySelector('#block-a') },
  { id: 'b', el: document.querySelector('#block-b') },
])
linker.setConnections([{ id: 'a-b', from: { blockId: 'a' }, to: { blockId: 'b' } }])
```

### Quick start — Vue

```vue
<script setup lang="ts">
import { VisualLinker } from '@macrulez/visual-linker-vue'

const blocks = [{ id: 'a' }, { id: 'b' }]
const connections = [{ id: 'a-b', from: { blockId: 'a' }, to: { blockId: 'b' } }]
</script>

<template>
  <VisualLinker :blocks="blocks" :connections="connections">
    <template v-for="b in blocks" #[`block-${b.id}`]="{}" :key="b.id">
      <div class="card">{{ b.id }}</div>
    </template>
  </VisualLinker>
</template>
```

### Quick start — Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@macrulez/visual-linker-nuxt'],
  visualLinker: {
    defaultCurve: 'smoothstep',
  },
})
```

```vue
<template>
  <!-- <VisualLinker>/useVisualLinker are auto-imported — no explicit import needed -->
  <VisualLinker :blocks="blocks" :connections="connections">
    <template v-for="b in blocks" #[`block-${b.id}`]="{}" :key="b.id">
      <div class="card">{{ b.id }}</div>
    </template>
  </VisualLinker>
</template>
```

### More examples

#### Auto-routed ports with a candidate side list

A port's `side` can narrow (not just fix) the automatic choice — the line
still picks whichever candidate faces the target best, it just never
considers the excluded sides:

```ts
linker.setBlocks([
  {
    id: 'sidebar',
    el: sidebarEl,
    ports: [{ id: 'out', side: ['right', 'bottom'] }], // never exits top/left
  },
])
```

#### Orthogonal routing with a shared branch point

Connections sharing the same `(block, port, side)` fan out from one
rounded branch point instead of overlapping — the common "one output
feeding several targets" shape:

```ts
linker.setConnections([
  { id: 'src-a', from: { blockId: 'source', portId: 'out' }, to: { blockId: 'a' }, style: { curve: 'smoothstep' } },
  { id: 'src-b', from: { blockId: 'source', portId: 'out' }, to: { blockId: 'b' }, style: { curve: 'smoothstep' } },
])
```

#### Draggable blocks confined to the diagram

```ts
const linker = createVisualLinker(diagramEl, { dragGridSize: 20, dragBounds: 'container' })

linker.setBlocks([{ id: 'a', el: cardEl, draggable: true, dragHandle: '.card-header' }])
```

Every connected line follows in real time — no manual `refresh()`/re-render call is ever needed for a drag.

---

## Documentation & links

- 📖 **Full documentation:** [npm.vuecraft.ru/en/packages/visual-linker](https://npm.vuecraft.ru/en/packages/visual-linker/guide/overview.html)
- 🌐 **VueCraft:** [vuecraft.ru/en](https://vuecraft.ru/en)
- 👤 **Author:** [macrulez.ru/en](https://macrulez.ru/en)
- 💻 **GitHub:** [macrulezru/visual-linker](https://github.com/macrulezru/visual-linker)
- 📦 **NPM:** [@macrulez/visual-linker-core](https://www.npmjs.com/package/@macrulez/visual-linker-core)
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
