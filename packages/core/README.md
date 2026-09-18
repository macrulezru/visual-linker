# **Visual Linker Core**

![Visual Linker Core](https://github.com/macrulezru/assets/blob/master/packages-images/visual-linker-vuecraft.png?raw=true)

Framework-agnostic engine that draws auto-routed SVG connector lines
between DOM blocks you already control. No Vue — just
`createVisualLinker(container, options)`, returning a small imperative
API any framework adapter (or vanilla code) can drive directly.

Part of the [visual-linker](https://github.com/macrulezru/visual-linker)
monorepo. Framework adapter:
[`@macrulez/visual-linker-vue`](https://www.npmjs.com/package/@macrulez/visual-linker-vue)
(which also wires up
[`@macrulez/visual-linker-nuxt`](https://www.npmjs.com/package/@macrulez/visual-linker-nuxt)).

---

## Features

- **`createVisualLinker(container, options?)`** — measures the blocks you hand it (`setBlocks`) and draws the SVG path between their resolved ports (`setConnections`), batched onto a shared `ResizeObserver` + `requestAnimationFrame` render loop
- **Auto-side port routing** — `side: 'auto'` (the default) picks whichever side of a block best faces the other endpoint on every render; a `FixedSide[]` narrows the automatic choice to a subset instead of fixing it outright
- **Three curve types** — `bezier` (configurable curvature/reach/angle-lean), `smoothstep` (orthogonal routing with rounded corners and shared branch points for siblings on one port), `straight`
- **Per-connection styling** — color, width, dashed, start/end markers (`circle`/`square`/`diamond`/`arrow`, or raw custom SVG), and a distinct hover style — instance-wide defaults, overridable per connection
- **Pointer-driven drag & drop** — an optional `dragHandle`, a `dragGridSize` snap, and `dragBounds` confined to the container/an element/an inset box, re-resolved live on every pointer move
- **A typed event API** — drag/hover/click events, plus a `layout` event fired on every render pass with every connection's and port's resolved geometry (points, angles, midpoints), for positioning your own overlay content
- **Auto-managed positioning** — sets `container`'s CSS position to `relative` for you if it's still `static`, so the SVG overlay lines up with your blocks with zero required setup CSS
- **Zero runtime dependencies, zero peer dependencies** — usable standalone in any environment, including outside a framework entirely

---

## When you'd reach for this

You're writing a framework adapter of your own, working somewhere Vue
isn't an option, or just want the raw engine without a component/composable
layer on top.

- **A vanilla script with no build step or framework at all** — Not every diagram needs Vue for one set of connector lines. `createVisualLinker()` works the same way loaded straight from a `<script type="module">`.
- **Building an adapter for something not already covered** — Svelte, a vanilla web component, a custom internal framework. The engine exposes a plain imperative API (`setBlocks`/`setConnections`/`on`) with no assumptions about your reactivity — wrapping it is a thin layer, not a rewrite.
- **You need direct control over exactly when a render happens** — `refresh()` forces an immediate recompute, bypassing the engine's own `requestAnimationFrame` batching — useful right before taking a screenshot of the diagram.

---

## Installation

```bash
npm install @macrulez/visual-linker-core
```

No peer dependencies. Requires Node.js `18+` if built in a Node/SSR
context; in the browser, any environment with `ResizeObserver` and
`requestAnimationFrame` works.

### Quick start

```ts
import { createVisualLinker } from '@macrulez/visual-linker-core'

const container = document.querySelector('#diagram')
const linker = createVisualLinker(container, { defaultCurve: 'smoothstep' })

linker.setBlocks([
  { id: 'a', el: document.querySelector('#block-a') },
  { id: 'b', el: document.querySelector('#block-b') },
])
linker.setConnections([{ id: 'a-b', from: { blockId: 'a' }, to: { blockId: 'b' } }])

linker.on('connection:click', ({ connection }) => console.log(connection.id))

// later: linker.destroy()
```

### More examples

#### Blocks and ports

```ts
interface BlockDescriptor {
  id: string
  el: HTMLElement
  ports?: PortDescriptor[] // omit → connections anchor to the block's own border, side 'auto'
  draggable?: boolean // overrides the instance-wide default for this block
  dragHandle?: string | HTMLElement
  dragBounds?: 'container' | HTMLElement | { top?: number; right?: number; bottom?: number; left?: number }
}

interface PortDescriptor {
  id: string
  target?: string | HTMLElement // CSS selector or element — default: the block's own el
  side?: 'auto' | FixedSide | FixedSide[] // FixedSide = 'top' | 'right' | 'bottom' | 'left'
  offset?: number // 0..1 along the resolved side, default 0.5
  anchorBlockId?: string // draw the point on ANOTHER block's border, still tracking target's real position
  anchorEl?: HTMLElement
}
```

A port's `target` lets a connection anchor somewhere more specific than a
block's own border — a particular row in a list, a specific field in a
form:

```ts
linker.setBlocks([
  {
    id: 'form',
    el: formEl,
    ports: [
      { id: 'email-field', target: '#email-row', side: 'right' },
      { id: 'submit', target: '.submit-btn', side: 'bottom' },
    ],
  },
])
```

#### Connections and curves

```ts
linker.setConnections([
  { id: 'c1', from: { blockId: 'a' }, to: { blockId: 'b' } }, // bezier, the default
  { id: 'c2', from: { blockId: 'a' }, to: { blockId: 'c' }, style: { curve: 'smoothstep' } }, // orthogonal
  { id: 'c3', from: { blockId: 'a' }, to: { blockId: 'd' }, style: { curve: 'straight' } }, // plain line
])
```

`bezier`'s `curvature`/`curveMinReach`/`curveMaxReach` control how far the
curve bows out; `curveAngleBlend`/`curveAngleMaxOffset` control how much
the exit/entry angle leans toward the target instead of staying
perpendicular to the block's border. `smoothstep`'s `cornerRadius` sets
the bend radius, and `maxTrunkReach` caps how far a shared trunk extends
before splitting — relevant only when 2+ connections share the same
`(block, port, side)`.

#### Markers and hover styling

```ts
linker.setConnections([
  {
    id: 'a-b',
    from: { blockId: 'a' },
    to: { blockId: 'b' },
    style: {
      color: '#6366f1',
      endMarker: { shape: 'arrow', size: 8 },
      hoverStyle: { color: '#312e81', width: 3 },
    },
  },
])
```

`startMarker`/`endMarker` accept a bare shape name, a full `MarkerConfig`
(`shape`/`size`/`color`/`strokeColor`/`strokeWidth`/`className`/`svg`/`orient`),
or `false` to suppress even the built-in port dot. `hoverStyle` overrides
`color`/`width`/`dashed`/`markerSize` while the connection is hovered or
its incident block is — falling back to the base style for any field left
unset.

#### Drag & drop

```ts
const linker = createVisualLinker(diagramEl, {
  draggable: true, // every block draggable by default
  dragGridSize: 20, // snap to a 20px grid while dragging
  dragBounds: 'container',
})

linker.setBlocks([{ id: 'a', el: cardEl, dragHandle: '.card-header' }])

linker.on('block:drag', ({ blockId, x, y }) => console.log(blockId, x, y))
```

Connected lines re-route in real time as a block moves — no manual
`refresh()` call needed. `dragBounds` also accepts a specific
`HTMLElement` (a drop-zone elsewhere in the layout) or an inset object
(`{ top, right, bottom, left }`, shrinking the container's own box).

#### Events

```ts
linker.on('layout', ({ connections, ports }) => {
  // fired on EVERY render pass — connections: ConnectionLayout[] (from/to/mid points, angles),
  // ports: PortLayout[] (resolved port points) — for positioning your own overlay content
})
```

`block:dragstart`/`drag`/`dragend`, `block:mouseenter`/`mouseleave`,
`connection:click`/`mouseenter`/`mouseleave`, and `layout` — every `on()`
call returns its own unsubscribe function.

---

## Documentation & links

- 📖 **Full documentation:** [npm.vuecraft.ru/en/packages/visual-linker](https://npm.vuecraft.ru/en/packages/visual-linker/guide/engine-api.html)
- 🌐 **VueCraft:** [vuecraft.ru/en](https://vuecraft.ru/en)
- 👤 **Author:** [macrulez.ru/en](https://macrulez.ru/en)
- 💻 **GitHub:** [macrulezru/visual-linker/packages/core](https://github.com/macrulezru/visual-linker/tree/master/packages/core)
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
