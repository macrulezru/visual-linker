# Performance

Numbers are measured by `pnpm test:perf` (Playwright, Chromium, headless, no CPU throttling) on the pages
`playground/bench.html` and `playground/src/bench/bench.ts`. The first column is visual-linker 0.4.3 measured with
the same bench before any change (`perf/baseline-0.4.3.json`), the second is the current code. Times are milliseconds.

Machine: AMD Ryzen 7 3700X 8-Core Processor             , 16 threads, Node v22.23.2.

The default look (bezier curves) already met the targets in 0.4.3. The scenarios that were slow are the ones with the
expensive modes switched on — smoothstep with obstacle routing, line jumps, labels, markers and spread ports ("heavy"),
and those are where 0.4.5 changes the numbers.

| Scenario | 0.4.3 | 0.4.5 | Limit | |
| --- | --- | --- | --- | --- |
| render() median, 100 blocks / 100 connections | 2.10 | 0.70 | ≤ 4 | ok |
| render() p95, 100 blocks / 100 connections | 2.80 | 1.30 | ≤ 8 | ok |
| render() median, 300 blocks / 300 connections | 5.70 | 2.20 | ≤ 12 | ok |
| FPS while dragging a block with 20 connections, 300 blocks | 59.84 | 60.44 | ≥ 55 | ok |
| FPS while scrolling columns of 200 blocks, 100 connections | 60.88 | 60.43 | ≥ 55 | ok |
| first render, 1000 blocks / 500 connections | 47.00 | 39.30 | ≤ 400 | ok |
| observed elements for 1000 blocks without connections | — | 1.00 | ≤ 1 | ok |
| render() median, 1000 blocks without connections | — | 0.00 | ≤ 1 | ok |
| heavy styling, 100 / 100: render() median | 10.00 | 2.60 | ≤ 6 | ok |
| heavy styling, 300 / 300: render() median | 41.00 | 5.90 | ≤ 20 | ok |
| heavy styling, 300 / 300: FPS while dragging | 13.51 | 48.61 | ≥ 35 | ok |

## All measured values

- **render-100** — 100 blocks, 100 connections: one render() pass: renderMedianMs 2.10 → 0.70, renderP95Ms 2.80 → 1.30, domNodes 203 → 203, firstMs 16.20 → 22.70, memoryMb 6.53 → 5.87
- **render-300** — 300 blocks, 300 connections: one render() pass: renderMedianMs 5.70 → 2.20, renderP95Ms 7.60 → 3.20, domNodes 603 → 603, firstMs 24.40 → 28.40, toggle50Ms 5.50 → 2.70, memoryMb 12.95 → 10.68
- **drag-300** — Drag a block with 20 connections among 300 blocks: fps 59.84 → 60.44
- **scroll-200** — Scroll columns of 200 blocks each with 100 connections: fps 60.88 → 60.43
- **first-1000** — First render: 1000 blocks, 500 connections: firstMs 47.00 → 39.30, domNodes 1003 → 1003, memoryMb 6.19 → 6.22
- **idle-1000** — 1000 blocks without any connection: renderMedianMs — → 0.00, domNodes — → 3.00, observedElements — → 1.00
- **render-heavy-100** — Heavy styling (smoothstep, obstacle routing, jumps, labels, markers, spread ports), 100 blocks, 100 connections: renderMedianMs 10.00 → 2.60, renderP95Ms 11.80 → 3.90, domNodes 542 → 542, firstMs 112 → 104
- **heavy-300** — Heavy styling, 300 blocks, 300 connections: render pass and block drag: renderMedianMs 41.00 → 5.90, renderP95Ms 57.30 → 8.40, fps 13.51 → 48.61, domNodes 1548 → 1548, firstMs 211 → 268

## Scenarios

- **render-100 / render-300** — N blocks in two scrolling columns, N connections between random rows, default styling;
  one `refresh()` pass with nothing changed, median and p95 of 100 passes.
- **drag-300** — 300 blocks, 300 connections, one block with 20 of them is dragged with synthetic pointer events for one second.
- **scroll-200** — two columns of 200 blocks, 100 connections, both columns scrolled every frame for one second.
- **first-1000** — `setBlocks` plus `setConnections` for 1000 blocks and 500 connections.
- **idle-1000** — 1000 blocks and no connections: the engine must not observe or measure them.
- **render-heavy-100 / heavy-300** — smoothstep, obstacle routing, jumps, a label and an arrow on every line, shown spread ports.
