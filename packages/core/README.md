# **Visual Linker Core**

![Visual Linker Core](https://github.com/macrulezru/assets/blob/master/packages-images/visual-linker-vuecraft.png?raw=true)

Framework-agnostic engine that draws auto-routed SVG connector lines
between DOM blocks you already control. No Vue — just
`createVisualLinker(container, config)`, returning a small imperative
API any framework adapter (or vanilla code) can drive directly.

Part of the [visual-linker](https://github.com/macrulezru/visual-linker)
monorepo. Framework adapter:
[`@macrulez/visual-linker-vue`](https://www.npmjs.com/package/@macrulez/visual-linker-vue)
(which also wires up
[`@macrulez/visual-linker-nuxt`](https://www.npmjs.com/package/@macrulez/visual-linker-nuxt)).

---

## Features

- **`createVisualLinker(container, config?)`** — measures the blocks you hand it (`setBlocks`) and draws the SVG path between their resolved ports (`setConnections`), batched onto a shared `ResizeObserver` + `requestAnimationFrame` render loop
- **Auto-side port routing** — `side: 'auto'` (the default) picks whichever side of a block best faces the other endpoint on every render; a `FixedSide[]` narrows the automatic choice to a subset instead of fixing it outright
- **Three curve types** — `bezier` (configurable curvature/reach/angle-lean), `smoothstep` (orthogonal routing with rounded corners and shared branch points for siblings on one port), `straight`
- **Per-connection styling** — color, width, dashed, start/end markers (`circle`/`square`/`diamond`/`arrow`, or raw custom SVG), and and a distinct look for the hover, selected and focus states — one structured configuration for lines, markers, ports, labels and colors, overridable per connection, and changeable at runtime
- **Pointer-driven drag & drop** — an optional `dragHandle`, a `blocks.drag.grid` snap, and `blocks.drag.bounds` confined to the container/an element/an inset box, re-resolved live on every pointer move
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
const linker = createVisualLinker(container, { lines: { curve: 'smoothstep' } })

linker.setBlocks([
  { id: 'a', el: document.querySelector('#block-a') },
  { id: 'b', el: document.querySelector('#block-b') },
])
linker.setConnections([{ id: 'a-b', from: { blockId: 'a' }, to: { blockId: 'b' } }])

linker.on('connection:click', ({ connection }) => console.log(connection.id))

// later: linker.destroy()
```

### Configuration

One structured object configures everything, grouped by what it styles:

```ts
const linker = createVisualLinker(el, {
  theme: darkTheme, // colors in one place — see Themes below
  lines: {
    curve: 'smoothstep',
    color: '#6fcf97',
    width: 2,
    dashed: false,
    highlight: { width: 2.5 },
    hover: { width: 3 },
    selected: { color: '#8ab4ff' },
    focus: { width: 4 },
    opacity: 1,
    bezier: { curvature: 0.5, minReach: 24, maxReach: 160, angleBlend: 0.55, angleMaxOffset: 30 },
    smoothstep: { cornerRadius: 8, maxTrunkReach: 48 },
    routing: { avoidObstacles: true, padding: 12 },
    jumps: { radius: 6 },
    animated: { shape: 'dots', speed: 50 },
  },
  markers: { end: { shape: 'arrow', hover: { size: 10 } }, sizes: { arrow: 8 } },
  ports: { show: true, radius: 4, fill: '#fff', stroke: '#2e8b57', hover: { radius: 6 }, spread: { gap: 16 } },
  labels: { background: '#fff', color: '#1c1e2b', fontSize: 11, hover: { background: '#eef' } },
  blocks: { draggable: true, drag: { grid: 20, bounds: 'container' } },
  interaction: { hover: true, highlight: true, selectable: true, clipToScrollParents: 'pin' },
})
```

`ConnectionDescriptor.style` has the same shape as `lines` (plus
`markers: { start, end }`), so anything that can be set for every line can be
set for one — in the same words. Resolution, from the strongest: the field on
the connection (or port, block, label) → the group in the configuration →
the theme token → a CSS variable of your own → the built-in value. The
state buckets merge field by field at every level.

#### Changing the configuration at runtime

```ts
linker.setConfig({ lines: { color: '#e0526c' } }) // deep-merges; `undefined` unsets a key
linker.replaceConfig(nextConfig) // replaces everything
linker.getConfig() // a copy of what is in effect
```

Everything re-renders, and the listeners behind `blocks`/`interaction`
(dragging, selection) are re-attached or removed to match.

#### Themes

A theme is a set of color tokens — `line`, `lineHover`, `lineSelected`,
`selectedHalo`, `focusRing`, `portFill`, `portStroke`, `labelBackground`,
`labelBorder`, `labelText` — written to CSS variables (`--vl-line-color`, …)
on the diagram, so plain CSS can still override them. `lightTheme` and
`darkTheme` are included, `defineTheme(overrides, base = lightTheme)` makes
your own, and switching is one call:

```ts
import { createVisualLinker, darkTheme, defineTheme } from '@macrulez/visual-linker-core'

const midnight = defineTheme({ line: '#8b9bff', lineHover: '#c4ccff', portFill: '#1b1d2b' }, darkTheme)
createVisualLinker(el, { theme: midnight })
linker.setConfig({ theme: lightTheme })
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

#### Spreading lines that share a port

By default every connection attached to the same port side meets at one
point. `portSpread` gives each of them its own virtual port along that side
instead — `gap` px apart, centered on the port's own point, ordered by where
each line's other end is (so they don't cross, and they re-order as blocks
are dragged). If the row wouldn't fit inside the side minus `padding` at
both corners, the gap shrinks until it does. Top/bottom and left/right
sides alike.

```ts
linker.setBlocks([
  { id: 'hub', el: hubEl, portSpread: { gap: 24, padding: 8 } }, // whole block
  { id: 'list', el: listEl, ports: [{ id: 'out', spread: true }] }, // one port only
])
createVisualLinker(el, { ports: { spread: true } }) // every block; `spread: false` opts a port back out
```

Priority: port `spread` > block `portSpread` > `ports.spread`; `false` at
any level switches an inherited setting off. Defaults: `gap: 16`, `padding: 8`.

#### Hops at crossings

```ts
createVisualLinker(el, { lines: { jumps: true } }) // or { lines: { jumps: { radius: 8 } } }
{ curve: 'smoothstep', jumps: false } // opt a single line out
```

Where a `smoothstep` line crosses another connection's line, its horizontal
stretch makes a small semicircular hop over the vertical one — as on electrical
schematics. Lines running along each other (a shared trunk), T-junctions and
crossings too close to a bend are left alone. Combine with `routing.avoidObstacles` for
tidy diagrams.

#### Routing around blocks

```ts
createVisualLinker(el, { lines: { routing: { avoidObstacles: true, padding: 12 } } })
{ curve: 'smoothstep', routing: { avoidObstacles: false } } // opt a single connection out
```

By default `smoothstep` lines run straight through any block that happens to
be in between. With `routing.avoidObstacles` they are routed around the other blocks
(A* over the blocks' padded edges, fewest turns first), re-routing live as
blocks are dragged. A line whose plain route is already clear is left exactly
as it was; blocks that are an endpoint of the line (or contain / sit inside
one) are not obstacles; and when no route exists the plain one is kept, so a
line never disappears. Only blocks within ~240px of a line are considered.

#### Labels along a line

```ts
{
  id: 'a-b', from, to,
  labels: [
    { id: 'method', position: 'start', text: 'POST' },
    { id: 'name', position: 0.5, text: 'follows the line', rotate: true, offset: -14 },
    { id: 'custom', position: 'end' }, // no text: just a position, for your own content
  ],
}
```

`position` is `'start'` / `'middle'` / `'end'` (start/end sit a little in from
the endpoint, clear of its marker) or a 0..1 fraction of the line's length;
`offset` moves the label along the line's normal (positive = right of the
direction of travel); `rotate` turns it to follow the line, kept upright.
A label with `text` is drawn by the library as an SVG pill (style it with
`--vl-label-bg` / `--vl-label-border` / `--vl-label-color`, or `className`
and `.vl-label-bg` / `.vl-label-text`). Every label's resolved position is in
`ConnectionLayout.labels` of the `layout` event, for rendering your own.

#### Animated flow

```ts
{ id: 'a-b', from, to, style: { animated: true } }
{ id: 'a-c', from, to, style: { animated: { shape: 'dots', speed: 50, direction: 'forward' } } }
createVisualLinker(el, { lines: { animated: true } }) // every line; `animated: false` opts one out
```

A pattern travels along the line from `from` to `to` (or back with
`direction: 'backward'`) — handy for live traffic and for showing direction.
By default the pattern takes the line's own color and the line underneath is
dimmed, so it reads on any background; give `color` to draw it in that color
over the unchanged line instead. It is a separate overlay, so it composes with
`dashed`, the hover state and markers; pure CSS (no per-frame JS) and switched off
for `prefers-reduced-motion`.

#### Selecting connections, keyboard and screen readers

```ts
const linker = createVisualLinker(el, { interaction: { selectable: true } })
linker.on('connection:selectionchange', ({ selectedIds }) => {})
linker.on('connection:delete-request', ({ connections }) => {}) // you remove them — or don't
linker.setSelectedConnections(['a-b']) // controlled use; emits nothing
```

With `interaction.selectable`, every connection is a focusable button (Tab order = the
order of `connections`). Click or Enter/Space selects it (Ctrl/Cmd/Shift
toggles within a multi-selection); Escape or a click elsewhere clears the
selection; Delete/Backspace asks to delete the selection — the library never
removes data. Style a selected line with `style.selected` (same fields
as `hover`, hover wins while both apply); the default is a width bump
plus a halo (`--vl-selected-color`, focus ring: `--vl-focus-color`). Lines
always carry `role="img"` and an `aria-label` — `ariaLabel` on the
connection, or "Connection: {from} → {to}".

#### Ports scrolled out of view

A port inside an `overflow: auto/scroll/hidden/clip` element (a row in a
scrolling list, say) that has scrolled out of the visible area no longer
leaves a line dangling over unrelated content. By default
(`interaction.clipToScrollParents: 'pin'`) that end is pulled to the edge of the visible
area — the line "continues off-screen" — and its marker and port dot are
dropped; `'hide'` hides the whole connection; `false` ignores clipping. The
`layout` event flags such ends as `fromClipped`/`toClipped`.

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

#### Markers and states

```ts
linker.setConnections([
  {
    id: 'a-b',
    from: { blockId: 'a' },
    to: { blockId: 'b' },
    style: {
      color: '#6366f1',
      hover: { color: '#312e81', width: 3 },
      markers: {
        end: { shape: 'arrow', size: 8, hover: { size: 11, color: '#312e81' } },
      },
    },
  },
])
```

`markers.start` / `markers.end` accept a bare shape name, a full marker config
(`shape`/`size`/`color`/`strokeColor`/`strokeWidth`/`className`/`svg`/`orient`/`arrow`),
or `false` to suppress even the built-in port dot. Every visual entity has the
same four state buckets — `highlight`, `hover`, `selected`, `focus` — with the fields of the
entity itself, so a marker can change its shape, size, colors or whole `svg` while
its connection is hovered or selected. `hover` is the pointer over the line
itself; `highlight` is a line lit because the pointer is on one of its blocks
(it behaves like `hover` until a `highlight` bucket is set). Both are off by default — turn them on
with `interaction: { hover: true, highlight: true }`, or per entity with `hoverable` on a connection and
`highlightable` on a block (the local value wins); without them a diagram does not react to the pointer and
shows no pointer cursor, while the events still fire. States stack as base →
`selected` → `highlight` → `hover` → `focus`, falling back to the base for any field left unset; a marker
follows the line's color of the current state unless it sets its own.

A shape marker can carry a direction arrow too — the shape stays on the
endpoint, and the arrow's tip stops exactly on the shape's outer edge
(outline included), instead of the two overlapping:

```ts
markers: { end: { shape: 'circle', color: '#fff', strokeColor: '#6366f1', strokeWidth: 2, arrow: true } }
markers: { end: { shape: 'square', arrow: { color: '#e0526c', gap: 1 } } } // own color, 1 unit of air before the edge
```

The arrow follows the line's direction, so a marker with `arrow` always
uses `orient: 'auto'`. For a custom `svg` marker the edge can't be
measured — set `arrow.gap` to the distance from the endpoint instead.

#### Drag & drop

```ts
const linker = createVisualLinker(diagramEl, {
  blocks: {
    draggable: true, // every block draggable by default
    drag: { grid: 20, bounds: 'container' }, // snap to a 20px grid, stay inside the container
  },
})

linker.setBlocks([{ id: 'a', el: cardEl, dragHandle: '.card-header' }])

linker.on('block:drag', ({ blockId, x, y }) => console.log(blockId, x, y))
```

Connected lines re-route in real time as a block moves — no manual
`refresh()` call needed. `drag.bounds` also accepts a specific
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
`connection:click`/`mouseenter`/`mouseleave`/`selectionchange`/`delete-request`, and `layout` — every `on()`
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
