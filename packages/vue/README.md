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

- **`<VisualLinker>`** — one wrapper `<div>` per block (measured by the engine) around a `#block-<id>` slot, plus an SVG overlay with the connections between them — you own the block markup entirely, this only measures and draws
- **`useVisualLinker()`** — the low-level escape hatch for when the component's slot-per-block layout doesn't fit; wires the engine to a container and keeps it in sync with reactive `blocks`/`connections`
- **Ref/getter-friendly everywhere** — a block's `el`, `dragHandle`, `dragBounds`, and a port's `target`/`anchorEl` all accept a Vue template ref directly, not just a CSS selector string
- **Three overlay slots** — `#connection-label`, `#port`, `#marker` — HTML content positioned exactly where the engine's own SVG drawing puts each connection/port, driven by the same per-render `layout` event
- **`setVisualLinkerDefaults()`** — package-wide fallback for most `VisualLinkerOptions` fields, read by both the component and the composable, so you don't repeat the same options at every call site — what [`@macrulez/visual-linker-nuxt`](https://www.npmjs.com/package/@macrulez/visual-linker-nuxt)'s module options configure under the hood
- **The full `@macrulez/visual-linker-core` surface, re-exported** — `createVisualLinker`, every enum (`VLConnectionCurveEnum` etc.), and every type are all available straight from `@macrulez/visual-linker-vue` too, no separate core install needed
- **SSR-safe by design** — both the component and the composable create the engine only inside `onMounted`, no `<ClientOnly>` needed

---

## When you'd reach for this

The core engine's imperative `setBlocks`/`setConnections` API, wired to
Vue's own reactivity — pass reactive data in, get connections drawn
automatically, instead of manually calling engine methods in
`onMounted`/watchers yourself.

- **A `v-for` over blocks, each with its own slot content** — `<VisualLinker>` renders one wrapper per `blocks` entry and lets you fill each with whatever component you already have — no manual DOM measurement.
- **Blocks the user can drag around** — `draggable`/`dragHandle` on a block, and every connected line follows in real time — no drag library, no manual coordinate math.
- **A form/dashboard mostly built already, that just needs connector lines added on top** — `useVisualLinker()` wires the engine to elements you already render yourself, without restructuring your markup into `<VisualLinker>`'s slot-per-block shape.
- **A label or custom marker that needs to live exactly on a connection** — `#connection-label`/`#marker` slots are positioned using the same per-render layout geometry the SVG lines themselves are drawn from, so they never drift out of sync.
- **The same curve/port look needed on every diagram in an app** — `setVisualLinkerDefaults()` sets it once, instead of repeating `options` at every `<VisualLinker>`/`useVisualLinker()` call site.

---

## Installation

Requires Vue `^3.3.0` (for `toValue`/`MaybeRefOrGetter`).

```bash
npm install @macrulez/visual-linker-vue
```

### Quick start

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

The slot name is dynamic (``#[`block-${b.id}`]``, with the brackets) —
required for a `v-for`-rendered `blocks` list; a literal `#block-a` only
works for a hand-written, hardcoded id.

### More examples

#### `<VisualLinker>` props

| Prop          | Type                     |                                                                                                                                                                                |
| ------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `blocks`      | `VisualLinkerBlock[]`    | required — `id`, optional `ports`/`draggable`/`dragHandle`/`dragBounds` (no `el` — the component owns each wrapper itself)                                                     |
| `connections` | `ConnectionDescriptor[]` | required                                                                                                                                                                       |
| `options`     | `VisualLinkerOptions`    | passed straight to `createVisualLinker()` — see [`@macrulez/visual-linker-core`'s README](https://www.npmjs.com/package/@macrulez/visual-linker-core) for the full option list |

Emits mirror the engine's own events 1:1, kebab-cased: `block-dragstart`,
`block-drag`, `block-dragend`, `block-mouseenter`, `block-mouseleave`,
`connection-click`, `connection-mouseenter`, `connection-mouseleave`.

#### Draggable blocks with a template ref handle

```vue
<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { VisualLinker } from '@macrulez/visual-linker-vue'

const handleRef = useTemplateRef('handle')
const blocks = [{ id: 'a', draggable: true, dragHandle: handleRef }]
const connections = []
</script>

<template>
  <VisualLinker :blocks="blocks" :connections="connections">
    <template #block-a="{}">
      <div class="card">
        <div ref="handle" class="card-header">drag me</div>
      </div>
    </template>
  </VisualLinker>
</template>
```

`dragHandle`/`dragBounds`, and a port's `target`/`anchorEl`, all accept a
template ref directly — no need to resolve it to a raw element yourself
first.

#### Overlay slots

```vue
<template>
  <VisualLinker :blocks="blocks" :connections="connections">
    <template v-for="b in blocks" #[`block-${b.id}`]="{}" :key="b.id">
      <div class="card">{{ b.id }}</div>
    </template>
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
