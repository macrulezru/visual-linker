import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createVisualLinker } from '../src/visual-linker'
import type { BlockDescriptor, ConnectionDescriptor, VisualLinkerConfig } from '../src/types'

const here = dirname(fileURLToPath(import.meta.url))
const GOLDEN_FILE = resolve(here, '__golden__/svg-0.4.3.json')

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function rectOf(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON() {},
  }
}

interface Scene {
  container: HTMLElement
  blocks: BlockDescriptor[]
  connections: ConnectionDescriptor[]
}

function buildScene(
  blockCount: number,
  connectionCount: number,
  seed: number,
  style: ConnectionDescriptor['style'],
): Scene {
  const random = seeded(seed)
  const container = document.createElement('div')
  container.getBoundingClientRect = () => rectOf(0, 0, 1200, 900)
  document.body.appendChild(container)

  const blocks: BlockDescriptor[] = []
  const columns = Math.ceil(Math.sqrt(blockCount))
  for (let i = 0; i < blockCount; i++) {
    const el = document.createElement('div')
    const left = (i % columns) * 110 + Math.round(random() * 20)
    const top = Math.floor(i / columns) * 60 + Math.round(random() * 10)
    const rect = rectOf(left, top, 90, 36)
    el.getBoundingClientRect = () => rect
    container.appendChild(el)
    blocks.push({ id: `b${i}`, el })
  }

  const connections: ConnectionDescriptor[] = []
  for (let i = 0; i < connectionCount; i++) {
    const from = Math.floor(random() * blockCount)
    let to = Math.floor(random() * blockCount)
    if (to === from) to = (to + 1) % blockCount
    connections.push({
      id: `c${i}`,
      from: { blockId: `b${from}` },
      to: { blockId: `b${to}` },
      style,
      labels: style?.curve === 'smoothstep' ? [{ id: 'l', position: 'middle', text: `c${i}` }] : undefined,
    })
  }
  return { container, blocks, connections }
}

function serialize(container: HTMLElement): string {
  const html = container.querySelector('svg')!.outerHTML
  const ids = new Map<string, string>()
  return html.replace(/vl-marker-\d+-\d+/g, (id) => {
    if (!ids.has(id)) ids.set(id, `vl-marker-#${ids.size}`)
    return ids.get(id)!
  })
}

const scenes: { name: string; make: () => string }[] = [
  {
    name: 'bezier-100',
    make() {
      const scene = buildScene(100, 100, 1, undefined)
      const linker = createVisualLinker(scene.container, { lines: { width: 2 }, ports: { show: true } })
      linker.setBlocks(scene.blocks)
      linker.setConnections(scene.connections)
      const html = serialize(scene.container)
      linker.destroy()
      return html
    },
  },
  {
    name: 'bezier-300-states',
    make() {
      const scene = buildScene(300, 300, 2, { markers: { end: 'arrow' } })
      const config: VisualLinkerConfig = { interaction: { selectable: true, hover: true }, ports: { show: true } }
      const linker = createVisualLinker(scene.container, config)
      linker.setBlocks(scene.blocks)
      linker.setConnections(scene.connections)
      linker.setSelectedConnections(['c3', 'c10'])
      const html = serialize(scene.container)
      linker.destroy()
      return html
    },
  },
  {
    name: 'smoothstep-heavy-60',
    make() {
      const scene = buildScene(40, 60, 3, {
        curve: 'smoothstep',
        routing: { avoidObstacles: true },
        jumps: true,
        markers: { end: 'arrow' },
      })
      const linker = createVisualLinker(scene.container, { ports: { show: true, spread: true } })
      linker.setBlocks(scene.blocks)
      linker.setConnections(scene.connections)
      const html = serialize(scene.container)
      linker.destroy()
      return html
    },
  },
  {
    name: 'straight-with-update',
    make() {
      const scene = buildScene(30, 40, 4, { curve: 'straight', dashed: true })
      const linker = createVisualLinker(scene.container, {})
      linker.setBlocks(scene.blocks)
      linker.setConnections(scene.connections)
      linker.removeConnection('c1')
      linker.addConnection({ id: 'extra', from: { blockId: 'b0' }, to: { blockId: 'b5' } })
      const html = serialize(scene.container)
      linker.destroy()
      return html
    },
  },
]

describe('svg output stays identical to 0.4.3', () => {
  const update = process.env.UPDATE_GOLDEN === '1'
  const golden: Record<string, string> = existsSync(GOLDEN_FILE) ? JSON.parse(readFileSync(GOLDEN_FILE, 'utf8')) : {}

  for (const scene of scenes) {
    it(scene.name, () => {
      const html = scene.make()
      if (update || golden[scene.name] === undefined) {
        golden[scene.name] = html
        mkdirSync(dirname(GOLDEN_FILE), { recursive: true })
        writeFileSync(GOLDEN_FILE, JSON.stringify(golden, null, 1))
        return
      }
      expect(html).toBe(golden[scene.name])
    })
  }
})
