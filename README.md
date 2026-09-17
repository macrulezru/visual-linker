# visual-linker

Draws smart, auto-routed SVG connector lines between DOM blocks you already
control — for vanilla JS, Vue 3, and Nuxt. You own the block markup and
position; this only measures it and draws the lines.

## Packages

| Package                                         | Description                                                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [`@macrulez/visual-linker-core`](packages/core) | Framework-agnostic engine — `createVisualLinker(container, options)`, no Vue involved.                                |
| [`@macrulez/visual-linker-vue`](packages/vue)   | `<VisualLinker>` component (slot-per-block) and `useVisualLinker()` composable — plus every core export, re-exported. |
| [`@macrulez/visual-linker-nuxt`](packages/nuxt) | Nuxt module auto-importing `<VisualLinker>`/`useVisualLinker`, with module options for default curve/port rendering.  |

See [docs/TECH_SPEC.md](docs/TECH_SPEC.md) for the full design (data model,
routing algorithm, roadmap).

## Status

Overlay mode (you position blocks, the engine draws the connections) is
implemented and tested, including:

- Auto-side port routing, with optional candidate-side restriction and a
  bounded angle lean toward the real target direction.
- Two curve types: bezier (fully configurable curvature/reach/angle) and
  `smoothstep` (orthogonal routing with group-aware branch points for
  connections sharing a port).
- Block drag & drop, connection hover/click, and a typed event API.
- Per-connection styling: color/width/dashed, start/end markers
  (built-in shapes or custom SVG), and a distinct hover style.
- Resize/scroll reactivity, and a Nuxt module with auto-imports and
  module-level defaults.

Mouse-driven connection creation and the auto-layout mode are still on the
roadmap; see [docs/TECH_SPEC.md](docs/TECH_SPEC.md) for the full milestone
list and design details.

## Development

```bash
pnpm install
pnpm build       # builds every package
pnpm test        # runs every package's tests
pnpm typecheck
pnpm dev         # runs the Vue playground
pnpm lint        # eslint across the whole monorepo
pnpm format      # prettier --write across the whole monorepo
```
