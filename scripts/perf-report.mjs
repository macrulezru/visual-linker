import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { cpus } from 'node:os'

const root = resolve(import.meta.dirname, '..')
const baselinePath = resolve(root, 'perf/baseline-0.4.3.json')
const resultsPath = resolve(root, 'perf/results.json')
const outPath = resolve(root, 'docs/PERFORMANCE.md')

if (!existsSync(resultsPath)) {
  console.error('perf/results.json is missing: run the perf suite first (playwright test -c playwright.perf.config.ts)')
  process.exit(1)
}

const baseline = Object.fromEntries(JSON.parse(readFileSync(baselinePath, 'utf8')).rows.map((row) => [row.id, row]))
const results = JSON.parse(readFileSync(resultsPath, 'utf8')).rows

const limits = [
  { id: 'render-100', metric: 'renderMedianMs', max: 4, label: 'render() median, 100 blocks / 100 connections' },
  { id: 'render-100', metric: 'renderP95Ms', max: 8, label: 'render() p95, 100 blocks / 100 connections' },
  { id: 'render-300', metric: 'renderMedianMs', max: 12, label: 'render() median, 300 blocks / 300 connections' },
  { id: 'drag-300', metric: 'fps', min: 55, label: 'FPS while dragging a block with 20 connections, 300 blocks' },
  { id: 'scroll-200', metric: 'fps', min: 55, label: 'FPS while scrolling columns of 200 blocks, 100 connections' },
  { id: 'first-1000', metric: 'firstMs', max: 400, label: 'first render, 1000 blocks / 500 connections' },
  {
    id: 'idle-1000',
    metric: 'observedElements',
    max: 1,
    label: 'observed elements for 1000 blocks without connections',
  },
  { id: 'idle-1000', metric: 'renderMedianMs', max: 1, label: 'render() median, 1000 blocks without connections' },
  { id: 'render-heavy-100', metric: 'renderMedianMs', max: 6, label: 'heavy styling, 100 / 100: render() median' },
  { id: 'heavy-300', metric: 'renderMedianMs', max: 20, label: 'heavy styling, 300 / 300: render() median' },
  { id: 'heavy-300', metric: 'fps', min: 35, label: 'heavy styling, 300 / 300: FPS while dragging' },
]

const byId = Object.fromEntries(results.map((row) => [row.id, row]))
const fmt = (value) =>
  value == null ? '—' : Number(value) >= 100 ? Number(value).toFixed(0) : Number(value).toFixed(2)

let failed = 0
const lines = []
for (const limit of limits) {
  const now = byId[limit.id]?.metrics[limit.metric]
  const before = baseline[limit.id]?.metrics[limit.metric]
  const ok =
    now != null && (limit.max === undefined || now <= limit.max) && (limit.min === undefined || now >= limit.min)
  if (!ok) failed++
  const target = limit.max !== undefined ? `≤ ${limit.max}` : `≥ ${limit.min}`
  lines.push(`| ${limit.label} | ${fmt(before)} | ${fmt(now)} | ${target} | ${ok ? 'ok' : '**FAIL**'} |`)
}

const detail = results
  .map((row) => {
    const before = baseline[row.id]?.metrics ?? {}
    const cells = Object.entries(row.metrics)
      .map(([name, value]) => `${name} ${fmt(before[name])} → ${fmt(value)}`)
      .join(', ')
    return `- **${row.id}** — ${row.title}: ${cells}`
  })
  .join('\n')

const md = `# Performance

Numbers are measured by \`pnpm test:perf\` (Playwright, Chromium, headless, no CPU throttling) on the pages
\`playground/bench.html\` and \`playground/src/bench/bench.ts\`. The first column is visual-linker 0.4.3 measured with
the same bench before any change (\`perf/baseline-0.4.3.json\`), the second is the current code. Times are milliseconds.

Machine: ${cpus()[0]?.model ?? 'unknown CPU'}, ${cpus().length} threads, Node ${process.version}.

The default look (bezier curves) already met the targets in 0.4.3. The scenarios that were slow are the ones with the
expensive modes switched on — smoothstep with obstacle routing, line jumps, labels, markers and spread ports ("heavy"),
and those are where 0.4.5 changes the numbers.

| Scenario | 0.4.3 | 0.4.5 | Limit | |
| --- | --- | --- | --- | --- |
${lines.join('\n')}

## All measured values

${detail}

## Scenarios

- **render-100 / render-300** — N blocks in two scrolling columns, N connections between random rows, default styling;
  one \`refresh()\` pass with nothing changed, median and p95 of 100 passes.
- **drag-300** — 300 blocks, 300 connections, one block with 20 of them is dragged with synthetic pointer events for one second.
- **scroll-200** — two columns of 200 blocks, 100 connections, both columns scrolled every frame for one second.
- **first-1000** — \`setBlocks\` plus \`setConnections\` for 1000 blocks and 500 connections.
- **idle-1000** — 1000 blocks and no connections: the engine must not observe or measure them.
- **render-heavy-100 / heavy-300** — smoothstep, obstacle routing, jumps, a label and an arrow on every line, shown spread ports.
`

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, md)
console.log(
  md
    .split('\n')
    .slice(10, 10 + limits.length + 2)
    .join('\n'),
)
if (failed > 0) {
  console.error(`\n${failed} performance limit(s) exceeded`)
  process.exit(1)
}
