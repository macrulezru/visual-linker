import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { chromium, expect, test } from '@playwright/test'

interface BuildResult {
  firstMs: number
  domNodes: number
}
interface RenderResult {
  median: number
  p95: number
}
interface FrameResult {
  fps: number
}

export interface PerfRow {
  id: string
  title: string
  metrics: Record<string, number | null>
}

const OUT = process.env.VL_PERF_OUT ?? resolve('perf/results.json')
const rows: PerfRow[] = []

async function openBench(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await page.goto('/bench.html')
  await page.waitForFunction(() => Boolean((window as unknown as { __bench?: unknown }).__bench))
  return page
}

test.describe.configure({ mode: 'serial' })

test('collect performance numbers', async ({ baseURL }) => {
  const browser = await chromium.launch({ args: ['--enable-precise-memory-info'] })
  const run = async <T>(
    blocks: number,
    connections: number,
    options: Record<string, unknown>,
    body: (api: 'bench', build: BuildResult, page: Awaited<ReturnType<typeof openBench>>) => Promise<T>,
  ) => {
    const page = await openBench(browser)
    expect(baseURL).toBeTruthy()
    const build = await page.evaluate(
      ([b, c, o]) =>
        (
          window as unknown as {
            __bench: { build(options: Record<string, unknown>): { firstMs: number; domNodes: number } }
          }
        ).__bench.build({ blocks: b as number, connections: c as number, ...(o as object) }),
      [blocks, connections, options] as const,
    )
    await page.waitForTimeout(300)
    try {
      return await body('bench', build, page)
    } finally {
      await page.close()
    }
  }

  const call = <T>(page: Awaited<ReturnType<typeof openBench>>, fn: string, ...args: unknown[]) =>
    page.evaluate(
      ([name, params]) =>
        (window as unknown as { __bench: Record<string, (...a: unknown[]) => unknown> }).__bench[name as string]!(
          ...(params as unknown[]),
        ),
      [fn, args] as const,
    ) as Promise<T>

  rows.push(
    await run(100, 100, {}, async (_api, build, page) => {
      const render = await call<RenderResult>(page, 'measureRender', 100)
      return {
        id: 'render-100',
        title: '100 blocks, 100 connections: one render() pass',
        metrics: {
          renderMedianMs: render.median,
          renderP95Ms: render.p95,
          domNodes: build.domNodes,
          firstMs: build.firstMs,
          memoryMb: await call<number | null>(page, 'memoryMb'),
        },
      }
    }),
  )

  rows.push(
    await run(300, 300, {}, async (_api, build, page) => {
      const render = await call<RenderResult>(page, 'measureRender', 100)
      const toggle = await call<{ renderMs: number }>(page, 'toggleNodes', 50)
      return {
        id: 'render-300',
        title: '300 blocks, 300 connections: one render() pass',
        metrics: {
          renderMedianMs: render.median,
          renderP95Ms: render.p95,
          domNodes: build.domNodes,
          firstMs: build.firstMs,
          toggle50Ms: toggle.renderMs,
          memoryMb: await call<number | null>(page, 'memoryMb'),
        },
      }
    }),
  )

  rows.push(
    await run(300, 300, { draggable: true, dragLinks: 20 }, async (_api, _build, page) => {
      const drag = await call<FrameResult>(page, 'measureDrag', 1)
      return {
        id: 'drag-300',
        title: 'Drag a block with 20 connections among 300 blocks',
        metrics: { fps: drag.fps },
      }
    }),
  )

  rows.push(
    await run(400, 100, {}, async (_api, _build, page) => {
      const scroll = await call<FrameResult>(page, 'measureScroll', 1)
      return {
        id: 'scroll-200',
        title: 'Scroll columns of 200 blocks each with 100 connections',
        metrics: { fps: scroll.fps },
      }
    }),
  )

  rows.push(
    await run(1000, 500, {}, async (_api, build, page) => ({
      id: 'first-1000',
      title: 'First render: 1000 blocks, 500 connections',
      metrics: {
        firstMs: build.firstMs,
        domNodes: build.domNodes,
        memoryMb: await call<number | null>(page, 'memoryMb'),
      },
    })),
  )

  rows.push(
    await run(1000, 0, {}, async (_api, build, page) => {
      const render = await call<RenderResult>(page, 'measureRender', 100)
      const stats = await call<{ observedElements: number } | null>(page, 'stats')
      return {
        id: 'idle-1000',
        title: '1000 blocks without any connection',
        metrics: {
          renderMedianMs: render.median,
          domNodes: build.domNodes,
          observedElements: stats?.observedElements ?? null,
        },
      }
    }),
  )

  const heavy = {
    curve: 'smoothstep',
    style: { routing: { avoidObstacles: true }, jumps: true, markers: { end: 'arrow' } },
    labels: true,
    config: { ports: { show: true, spread: true } },
  }

  rows.push(
    await run(100, 100, heavy, async (_api, build, page) => {
      const render = await call<RenderResult>(page, 'measureRender', 30)
      return {
        id: 'render-heavy-100',
        title:
          'Heavy styling (smoothstep, obstacle routing, jumps, labels, markers, spread ports), 100 blocks, 100 connections',
        metrics: {
          renderMedianMs: render.median,
          renderP95Ms: render.p95,
          domNodes: build.domNodes,
          firstMs: build.firstMs,
        },
      }
    }),
  )

  rows.push(
    await run(300, 300, { ...heavy, draggable: true, dragLinks: 20 }, async (_api, build, page) => {
      const render = await call<RenderResult>(page, 'measureRender', 20)
      const drag = await call<FrameResult>(page, 'measureDrag', 1)
      return {
        id: 'heavy-300',
        title: 'Heavy styling, 300 blocks, 300 connections: render pass and block drag',
        metrics: {
          renderMedianMs: render.median,
          renderP95Ms: render.p95,
          fps: drag.fps,
          domNodes: build.domNodes,
          firstMs: build.firstMs,
        },
      }
    }),
  )

  await browser.close()
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify({ rows }, null, 2))
})
