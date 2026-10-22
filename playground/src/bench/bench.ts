import { createVisualLinker } from '@macrulez/visual-linker-vue'
import type {
  BlockDescriptor,
  ConnectionDescriptor,
  ConnectionStyle,
  VisualLinkerConfig,
} from '@macrulez/visual-linker-vue'

interface BuildOptions {
  blocks: number
  connections: number
  draggable?: boolean
  dragLinks?: number
  curve?: 'bezier' | 'smoothstep' | 'straight'
  style?: ConnectionStyle
  labels?: boolean
  config?: VisualLinkerConfig
}

interface BuildResult {
  firstMs: number
  domNodes: number
}

interface FrameResult {
  fps: number
  frames: number
  seconds: number
}

type LinkerWithStats = ReturnType<typeof createVisualLinker> & { getStats?: () => unknown }

const stage = document.getElementById('stage') as HTMLElement
const output = document.getElementById('output') as HTMLElement

let engine: LinkerWithStats | null = null
let leftCol: HTMLElement
let rightCol: HTMLElement
let rows: HTMLElement[] = []
let descriptors: BlockDescriptor[] = []
let links: ConnectionDescriptor[] = []

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
}

function teardown() {
  engine?.destroy()
  engine = null
  stage.innerHTML = ''
  rows = []
  descriptors = []
  links = []
}

function build(options: BuildOptions): BuildResult {
  teardown()
  const total = options.blocks
  const leftCount = Math.ceil(total / 2)
  const rightCount = total - leftCount
  leftCol = document.createElement('div')
  rightCol = document.createElement('div')
  leftCol.className = rightCol.className = 'col'
  stage.append(leftCol, rightCol)

  for (let i = 0; i < total; i++) {
    const row = document.createElement('div')
    row.className = 'row'
    row.textContent = `row ${i}`
    row.dataset.index = String(i)
    ;(i < leftCount ? leftCol : rightCol).appendChild(row)
    rows.push(row)
    descriptors.push({ id: `b${i}`, el: row, draggable: options.draggable ?? false })
  }

  const random = seeded(12345)
  links = []
  const dragLinks = options.dragLinks ?? 0
  for (let i = 0; i < options.connections; i++) {
    const useDrag = i < dragLinks
    const from = useDrag ? 0 : Math.floor(random() * leftCount)
    const to = leftCount + Math.floor(random() * Math.max(1, rightCount))
    links.push({
      id: `c${i}`,
      from: { blockId: `b${from}` },
      to: { blockId: `b${Math.min(to, total - 1)}` },
      style: { curve: options.curve, ...options.style },
      ...(options.labels ? { labels: [{ id: 'l', position: 'middle' as const, text: `c${i}` }] } : {}),
    })
  }

  const config: VisualLinkerConfig = {
    lines: { width: 1.5 },
    ports: { show: false },
    ...options.config,
  }
  const startedAt = performance.now()
  engine = createVisualLinker(stage, config) as LinkerWithStats
  engine.setBlocks(descriptors)
  engine.setConnections(links)
  const firstMs = performance.now() - startedAt
  return { firstMs, domNodes: stage.querySelector('svg')?.querySelectorAll('*').length ?? 0 }
}

function measureRender(iterations = 100): { median: number; p95: number; samples: number } {
  const samples: number[] = []
  for (let i = 0; i < 5; i++) engine?.refresh()
  for (let i = 0; i < iterations; i++) {
    const startedAt = performance.now()
    engine?.refresh()
    samples.push(performance.now() - startedAt)
  }
  return { median: median(samples), p95: percentile(samples, 0.95), samples: samples.length }
}

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

async function measureFrames(seconds: number, step: (frame: number) => void): Promise<FrameResult> {
  await nextFrame()
  const startedAt = performance.now()
  let frames = 0
  for (;;) {
    const now = await nextFrame()
    frames++
    step(frames)
    if (now - startedAt >= seconds * 1000) break
  }
  const elapsed = (performance.now() - startedAt) / 1000
  return { fps: frames / elapsed, frames, seconds: elapsed }
}

async function measureDrag(seconds = 1): Promise<FrameResult> {
  const handle = rows[0]!
  const rect = handle.getBoundingClientRect()
  const startX = rect.left + 10
  const startY = rect.top + 10
  const init = (x: number, y: number, extra: PointerEventInit = {}): PointerEventInit => ({
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    bubbles: true,
    cancelable: true,
    ...extra,
  })
  handle.dispatchEvent(new PointerEvent('pointerdown', init(startX, startY)))
  const result = await measureFrames(seconds, (frame) => {
    const x = startX + Math.sin(frame / 12) * 60
    const y = startY + Math.cos(frame / 9) * 40
    handle.dispatchEvent(new PointerEvent('pointermove', init(x, y)))
  })
  handle.dispatchEvent(new PointerEvent('pointerup', init(startX, startY)))
  return result
}

async function measureScroll(seconds = 1): Promise<FrameResult> {
  const max = leftCol.scrollHeight - leftCol.clientHeight
  return measureFrames(seconds, (frame) => {
    leftCol.scrollTop = Math.abs(Math.sin(frame / 40)) * max
    rightCol.scrollTop = Math.abs(Math.cos(frame / 40)) * max
  })
}

function toggleNodes(count = 50): { renderMs: number } {
  const startedAt = performance.now()
  for (let i = 0; i < count; i++) {
    const row = rows[i * 2]
    if (row) row.classList.toggle('hidden')
  }
  engine?.refresh()
  return { renderMs: performance.now() - startedAt }
}

function memoryMb(): number | null {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
  return memory ? memory.usedJSHeapSize / (1024 * 1024) : null
}

function stats(): unknown {
  return engine?.getStats?.() ?? null
}

const api = {
  build,
  measureRender,
  measureDrag,
  measureScroll,
  toggleNodes,
  memoryMb,
  stats,
  engine: () => engine,
  setConnections(list: ConnectionDescriptor[]) {
    links = list
    engine?.setConnections(list)
  },
  links: () => links,
  blocks: () => descriptors,
  rows: () => rows,
}

declare global {
  interface Window {
    __bench: typeof api
  }
}
window.__bench = api

const read = (id: string) => Number((document.getElementById(id) as HTMLInputElement).value)
const show = (value: unknown) => {
  output.textContent = JSON.stringify(value, null, 2)
}
document.getElementById('build')!.addEventListener('click', () => {
  show(build({ blocks: read('blocks'), connections: read('connections'), draggable: true, dragLinks: 20 }))
})
document.getElementById('render')!.addEventListener('click', () => show(measureRender(50)))
document.getElementById('drag')!.addEventListener('click', async () => show(await measureDrag()))
document.getElementById('scroll')!.addEventListener('click', async () => show(await measureScroll()))
document.getElementById('toggle')!.addEventListener('click', () => show(toggleNodes()))
