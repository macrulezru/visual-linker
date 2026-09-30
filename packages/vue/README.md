# **Visual Linker Vue**

![Visual Linker Vue](https://github.com/macrulezru/assets/blob/master/packages-images/visual-linker-vue-vuecraft.png?raw=true)

Vue 3 component and composable for drawing smart, auto-routed SVG
connector lines between DOM blocks you already control, built on top of
[`@macrulez/visual-linker-core`](https://www.npmjs.com/package/@macrulez/visual-linker-core).
SSR-safe: the engine is only ever created client-side, once mounted.

Part of the [visual-linker](https://github.com/macrulezru/visual-linker)
monorepo. See also
[`@macrulez/visual-linker-nuxt`](https://www.npmjs.com/package/@macrulez/visual-linker-nuxt)
if you're on Nuxt, and the
[`playground`](https://github.com/macrulezru/visual-linker/tree/master/playground)
for a live example (curve types, port routing, markers, drag & drop, live
option tuning).

---

## Features

- **`<VisualLinker>` around your own markup** — put any template in its default slot; blocks can sit at any depth, inside any wrapper components. No per-block wrappers, no per-block slots
- **Three ways to mark blocks and ports** — the `v-vl-block` / `v-vl-port` directives, plain `data-vl-*` attributes, or the `blocks` prop with a template ref / getter / CSS selector — mix them freely
- **Two scopes** — `scope="container"` (default) draws inside the component's own box; `scope="page"` links elements anywhere in the document, drawing in a fixed layer teleported to `<body>`
- **Live discovery** — blocks and ports added, removed or re-marked later (`v-if`, `v-for`, third-party markup) are picked up automatically
- **Ref/getter-friendly everywhere** — a block's `el`, `dragHandle`, `dragBounds`, and a port's `target`/`anchorEl` all accept a Vue template ref directly
- **Three overlay slots** — `#connection-label`, `#port`, `#marker` — HTML content positioned exactly where the engine's own SVG drawing puts each connection/port
- **`useVisualLinker()`** — the low-level composable, wired straight to a container element you render yourself
- **`setVisualLinkerDefaults()`** — package-wide fallback for most `VisualLinkerOptions` fields — what [`@macrulez/visual-linker-nuxt`](https://www.npmjs.com/package/@macrulez/visual-linker-nuxt)'s module options configure under the hood
- **The full `@macrulez/visual-linker-core` surface, re-exported** — `createVisualLinker`, every enum and every type, no separate core install needed
- **SSR-safe by design** — the engine and its drawing layer only exist client-side after mount; the directives emit their `data-vl-*` attributes during SSR too

---

## When you'd reach for this

- **Connector lines on top of a layout you already have** — cards inside panels inside grid columns: mark the cards with `v-vl-block`, keep your components and CSS as they are.
- **Rows or handles inside a block as connection points** — `v-vl-port` on the row; it attaches to the nearest block around it.
- **Elements in completely different parts of the page** — a sidebar list and a main area rendered by different components: `scope="page"` connects them without restructuring anything.
- **Blocks the user can drag around** — `draggable`/`dragHandle`/`dragBounds`, and every connected line follows in real time.
- **A label or custom marker that must sit exactly on a connection** — `#connection-label`/`#marker` slots use the same per-render geometry as the SVG lines.

---

## Installation

Requires Vue `^3.3.0`.

```bash
npm install @macrulez/visual-linker-vue
```

Register the component and directives globally:

```ts
import { createApp } from 'vue'
import { VisualLinkerPlugin } from '@macrulez/visual-linker-vue'

createApp(App).use(VisualLinkerPlugin).mount('#app')
```

…or import them per component — in `<script setup>`, `vVlBlock`/`vVlPort` become `v-vl-block`/`v-vl-port` automatically:

```ts
import { VisualLinker, vVlBlock, vVlPort } from '@macrulez/visual-linker-vue'
```

### Quick start

```vue
<script setup lang="ts">
const connections = [{ id: 'a-b', from: { blockId: 'a' }, to: { blockId: 'b' } }]
</script>

<template>
  <VisualLinker :connections="connections">
    <MyLayout>
      <MyCard v-vl-block="'a'" />
      <SidePanel>
        <div data-vl-block="b">Plain HTML works too</div>
      </SidePanel>
    </MyLayout>
  </VisualLinker>
</template>
```

### Marking blocks and ports

All three methods feed the same registry and can be mixed in one diagram.

**1. Directives**

```vue
<div v-vl-block="{ id: 'b13', draggable: true, dragHandle: '.title', dragBounds: 'container' }">
  <div class="title">Drag me</div>
  <!-- belongs to the nearest block around it -->
  <div v-vl-port="{ id: 'row1', side: ['left', 'right'], anchorBlockId: 'b13' }">Row 1</div>
</div>
<!-- or attach a port to a block explicitly -->
<span v-vl-port="{ id: 'out', block: 'b13' }" />
```

`v-vl-block="'b13'"` / `v-vl-port="'row1'"` is the shorthand for an id with no options.

**2. Data attributes** — no JavaScript at all, handy for server-rendered or third-party markup:

| Attribute                         | On         | Meaning                                                |
| --------------------------------- | ---------- | ------------------------------------------------------ |
| `data-vl-block="id"`              | block      | registers the element as a block                       |
| `data-vl-draggable`               | block      | `""`/`"true"` → draggable, `"false"` → not             |
| `data-vl-drag-handle=".sel"`      | block      | drag handle, a selector inside the block               |
| `data-vl-drag-bounds="container"` | block      | `container`, or a CSS selector of the fence element    |
| `data-vl-port="id"`               | port       | registers a port on the nearest block around it        |
| `data-vl-port-block="id"`         | port       | …or on this block explicitly                           |
| `data-vl-side="left right"`       | port       | one side, or a space/comma-separated candidate list    |
| `data-vl-offset="0.3"`            | port       | position along the side, 0..1                          |
| `data-vl-anchor="id"`             | port       | `anchorBlockId` — draw on that block's border instead  |
| `data-vl-linker="name"`           | block/port | assign to the `<VisualLinker name="…">` with this name |

**3. The `blocks` prop** — for refs held in `<script>`, or elements you can't add attributes to:

```ts
const cardRef = useTemplateRef('card')
const blocks = [
  { id: 'a', el: cardRef, ports: [{ id: 'p', target: rowRef }] }, // a template ref
  { id: 'b', el: '#legacy-widget' }, // a CSS selector
  { id: 'c', draggable: false }, // no el: extra config for a block marked in the template
]
```

For the same id, the `blocks` prop wins over directive options, which win over data attributes.

> Drag offsets are applied with the CSS `translate` property, so they compose with any `transform` a block already has. Avoid a _string_ `:style` binding on a draggable block — Vue replaces the whole inline style whenever that string changes.

### `scope`: where blocks can live

```vue
<!-- default: blocks anywhere inside the component; lines drawn inside its own box -->
<VisualLinker :connections="connections">…</VisualLinker>

<!-- blocks anywhere in the document -->
<VisualLinker scope="page" name="assign" :connections="connections" :z-index="10" />
<TaskList><li v-vl-block="{ id: 't1', linker: 'assign' }">…</li></TaskList>
<OwnerList><li data-vl-block="ann" data-vl-linker="assign">…</li></OwnerList>
```

Ownership rules: an explicit `data-vl-linker` / `linker` name wins; otherwise an element belongs to the nearest enclosing `<VisualLinker>` (so nested instances never take each other's blocks); an element outside every `<VisualLinker>` belongs to page-scoped instances. With several page-scoped instances on one page, give each a `name`.

In page scope the lines are drawn in a `position: fixed` layer covering the viewport, teleported to `<body>` — so ancestors' `overflow: hidden` or `transform` can't clip or offset it; `zIndex` sets its stacking order. `dragBounds: 'container'` then means the viewport.

#### `<VisualLinker>` props

| Prop          | Type                     |                                                                                                                                                    |
| ------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connections` | `ConnectionDescriptor[]` | required                                                                                                                                           |
| `blocks`      | `VisualLinkerBlock[]`    | optional — `id`, `el?` (ref/getter/element/selector), `ports`, `draggable`, `dragHandle`, `dragBounds`                                             |
| `options`     | `VisualLinkerOptions`    | passed to `createVisualLinker()` once, on mount — see [`@macrulez/visual-linker-core`](https://www.npmjs.com/package/@macrulez/visual-linker-core) |
| `scope`       | `'container' \| 'page'`  | default `'container'`                                                                                                                              |
| `name`        | `string`                 | lets elements elsewhere claim this instance via `data-vl-linker` / the directives' `linker`                                                        |
| `zIndex`      | `number \| string`       | stacking order of the drawing layer                                                                                                                |

Emits mirror the engine's own events 1:1, kebab-cased: `block-dragstart`,
`block-drag`, `block-dragend`, `block-mouseenter`, `block-mouseleave`,
`connection-click`, `connection-mouseenter`, `connection-mouseleave`.

#### Overlay slots

```vue
<template>
  <VisualLinker :connections="connections">
    <div v-for="item in items" :key="item.id" v-vl-block="item.id" class="card">{{ item.id }}</div>
    <template #connection-label="{ connection, point }">
      <span class="badge">{{ connection.id }}</span>
    </template>
    <template #marker="{ position }">
      <span v-if="position === 'end'" class="dot" />
    </template>
  </VisualLinker>
</template>
```

Each slot is only built if actually used. `#marker` only renders for an
endpoint without an explicit `startMarker`/`endMarker` in its `style` —
an explicit style still wins.

#### `useVisualLinker(container, options?)`

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useVisualLinker } from '@macrulez/visual-linker-vue'

const containerEl = ref<HTMLElement | null>(null)
const blockAEl = ref<HTMLElement | null>(null)
const blockBEl = ref<HTMLElement | null>(null)

const blocks = computed(() => [
  { id: 'a', el: blockAEl },
  { id: 'b', el: blockBEl },
])
const connections = ref([{ id: 'a-b', from: { blockId: 'a' }, to: { blockId: 'b' } }])

const { engine } = useVisualLinker(containerEl, { blocks, connections })
</script>

<template>
  <div ref="containerEl" style="position: relative">
    <div ref="blockAEl">A</div>
    <div ref="blockBEl">B</div>
  </div>
</template>
```

`engine` is a `ShallowRef<VisualLinker | null>` — `null` until mount. Omit
`options.blocks`/`options.connections` to manage them yourself via
`engine.value.setBlocks(...)`/`setConnections(...)` instead of the
reactive sync.

#### `setVisualLinkerDefaults` / `visualLinkerDefaults`

```ts
import { setVisualLinkerDefaults } from '@macrulez/visual-linker-vue'

setVisualLinkerDefaults({ defaultCurve: 'smoothstep', showPorts: false })
```

Read by both `<VisualLinker>` and `useVisualLinker()` as the base layer
under an explicit `options` prop/argument. Covers most — but not all —
of `VisualLinkerOptions`: `defaultCornerRadius`, `defaultMaxTrunkReach`,
`draggable`, and `dragBounds` aren't part of this shared-defaults
mechanism and must be passed directly at each call site.

---

## Documentation & links

- 📖 **Full documentation:** [npm.vuecraft.ru/en/packages/visual-linker](https://npm.vuecraft.ru/en/packages/visual-linker/guide/component.html)
- 🌐 **VueCraft:** [vuecraft.ru/en](https://vuecraft.ru/en)
- 👤 **Author:** [macrulez.ru/en](https://macrulez.ru/en)
- 💻 **GitHub:** [macrulezru/visual-linker/packages/vue](https://github.com/macrulezru/visual-linker/tree/master/packages/vue)
- 📦 **NPM:** [@macrulez/visual-linker-vue](https://www.npmjs.com/package/@macrulez/visual-linker-vue)
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
