<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  VisualLinker,
  VLConnectionCurveEnum,
  VLFixedSideEnum,
  VLMarkerShapeEnum,
  type ConnectionDescriptor,
  type ConnectionStyle,
  type VisualLinkerConfig,
} from '@macrulez/visual-linker-vue'
import EventLog from '../components/EventLog.vue'

const LEFT = VLFixedSideEnum.LEFT

const lastEvent = ref('—')

// ---------------------------------------------------------------------------
// 1. The board: one diagram that exercises everything dragging touches.
// ---------------------------------------------------------------------------

const snap = ref(true)
const avoid = ref(true)
const jumps = ref(true)
const animated = ref(false)
const spread = ref(true)
const resets = ref(0)

// A diagram's `options` are read once when it mounts, so a toggle rebuilds the
// board (positions reset); the key below is what triggers that.
const boardKey = computed(() =>
  [snap, avoid, jumps, animated, spread, resets].map((flag) => String(flag.value)).join('-'),
)

const boardConfig = computed<VisualLinkerConfig>(() => ({
  blocks: { draggable: true, drag: { bounds: 'container', grid: snap.value ? 24 : undefined } },
  lines: {
    curve: VLConnectionCurveEnum.SMOOTHSTEP,
    smoothstep: { cornerRadius: 10 },
    routing: { avoidObstacles: avoid.value },
    jumps: jumps.value,
    animated: animated.value ? { speed: 45 } : false,
  },
  interaction: { selectable: true, hover: true, highlight: true },
}))

const baseStyle: ConnectionStyle = {
  markers: { end: { shape: VLMarkerShapeEnum.ARROW, selected: { size: 8 } } },
  hover: { width: 3.5 },
  // Layered between the base style and hover; omit it for the default selected look.
  selected: { color: '#e0526c', width: 3 },
}

function link(
  id: string,
  from: ConnectionDescriptor['from'],
  to: ConnectionDescriptor['to'],
  extra: Partial<ConnectionDescriptor> & { style?: ConnectionStyle } = {},
): ConnectionDescriptor {
  const { style, ...rest } = extra
  return { id, from, to, style: { ...baseStyle, ...style }, ...rest }
}

function buildConnections(): ConnectionDescriptor[] {
  return [
    link(
      'orders-parse',
      { blockId: 's1' },
      { blockId: 't1' },
      { labels: [{ id: 'l', position: 'start', text: 'csv' }] },
    ),
    link('users-parse', { blockId: 's2' }, { blockId: 't1' }),
    link('events-enrich', { blockId: 's3' }, { blockId: 't2' }),
    // Runs straight at the pinned cache block: the one to watch with "Avoid obstacles".
    link('users-join', { blockId: 's2' }, { blockId: 'j' }, { style: { color: '#e8a33d', width: 2 } }),
    link('parse-join', { blockId: 't1' }, { blockId: 'j' }, { labels: [{ id: 'l', position: 0.5, text: 'rows' }] }),
    link('enrich-join', { blockId: 't2' }, { blockId: 'j' }),
    link('join-daily', { blockId: 'j' }, { blockId: 'report', portId: 'ra' }),
    link('join-weekly', { blockId: 'j' }, { blockId: 'report', portId: 'rb' }),
    link(
      'join-warehouse',
      { blockId: 'j' },
      { blockId: 'k1' },
      { labels: [{ id: 'l', position: 'middle', text: 'sync' }] },
    ),
    link('join-alerts', { blockId: 'j' }, { blockId: 'k2' }, { style: { dashed: true, color: '#e0526c' } }),
  ]
}

const connections = ref(buildConnections())
const selected = ref<string[]>([])

// The library only *asks* to delete — removing the data is the app's call.
function onDeleteRequest(requested: ConnectionDescriptor[]) {
  const ids = new Set(requested.map((connection) => connection.id))
  connections.value = connections.value.filter((connection) => !ids.has(connection.id))
  lastEvent.value = `connection-delete-request: ${[...ids].join(', ')} (removed by the app)`
}

const plainBlocks = [
  { id: 's1', label: 'Orders', x: 24, y: 36 },
  { id: 's2', label: 'Users', x: 24, y: 190 },
  { id: 's3', label: 'Events', x: 24, y: 344 },
  { id: 't2', label: 'Enrich', x: 232, y: 420 },
  { id: 'k1', label: 'Warehouse', x: 780, y: 320 },
  { id: 'k2', label: 'Alerts', x: 780, y: 432 },
]

// ---------------------------------------------------------------------------
// 2. Small focused demos of the individual drag options.
// ---------------------------------------------------------------------------

const miniConfig: VisualLinkerConfig = { blocks: { draggable: true, drag: { bounds: 'container' } } }
const gridConfig: VisualLinkerConfig = { blocks: { draggable: true, drag: { bounds: 'container', grid: 20 } } }
const pair = (a: string, b: string): ConnectionDescriptor[] => [
  { id: 'c', from: { blockId: a }, to: { blockId: b }, style: { markers: { end: VLMarkerShapeEnum.ARROW } } },
]
const handleConnections = pair('hnd', 'anchor')
const fenceConnections = pair('free', 'fenced')
const insetConnections = pair('inset', 'still')

const fenceEl = ref<HTMLElement | null>(null)
</script>

<template>
  <section class="scene">
    <p class="scene-intro">
      One board, everything dragging touches. Drag any block: connections re-route every frame, the line from
      <em>Users</em> goes around the pinned <em>Cache</em> block, crossing lines hop over each other, and three lines
      sharing a port spread into virtual ports that re-order as you move things. Hover a block to highlight its lines;
      click a line (Ctrl/Shift-click for several) or Tab to it, Enter/Space to select, <code>Delete</code> to ask for
      its removal, <code>Esc</code> to clear.
    </p>

    <div class="toolbar">
      <label><input v-model="snap" type="checkbox" /> snap to grid <code>blocks.drag.grid: 24</code></label>
      <label><input v-model="avoid" type="checkbox" /> avoid obstacles</label>
      <label><input v-model="jumps" type="checkbox" /> hop over crossings <code>jumps</code></label>
      <label><input v-model="spread" type="checkbox" /> spread shared ports <code>portSpread</code></label>
      <label><input v-model="animated" type="checkbox" /> animated flow</label>
      <button class="toggle-btn" type="button" @click="resets++">Reset layout</button>
      <button class="toggle-btn" type="button" @click="connections = buildConnections()">Restore lines</button>
    </div>
    <p class="hint">
      Diagram options are read once on mount, so flipping a toggle rebuilds the board (positions reset).
    </p>

    <EventLog :event="lastEvent" />
    <p class="selection">
      selected: <code>{{ selected.length ? selected.join(', ') : '—' }}</code>
    </p>

    <div class="board-scroll">
      <div class="canvas board">
        <VisualLinker
          :key="boardKey"
          v-model:selected="selected"
          :connections="connections"
          :config="boardConfig"
          @connection-delete-request="onDeleteRequest"
          @connection-click="lastEvent = `connection-click: ${$event.id}`"
          @connection-selectionchange="lastEvent = `selection: ${$event.join(', ') || '—'}`"
          @block-dragstart="lastEvent = `block-dragstart: ${$event.blockId}`"
          @block-drag="lastEvent = `block-drag: ${$event.blockId} (${$event.x}, ${$event.y})`"
          @block-dragend="lastEvent = `block-dragend: ${$event.blockId}`"
        >
          <div
            v-for="block in plainBlocks"
            :key="block.id"
            v-vl-block="block.id"
            class="card node"
            :style="{ left: `${block.x}px`, top: `${block.y}px` }"
          >
            {{ block.label }}
          </div>

          <div
            v-vl-block="{ id: 't1', portSpread: spread ? { gap: 22 } : undefined }"
            class="card node"
            style="left: 232px; top: 36px"
          >
            Parse
          </div>

          <!-- draggable: false — a pinned block still acts as an obstacle. -->
          <div
            v-vl-block="{ id: 'cache', draggable: false }"
            class="card node card--pinned"
            style="left: 396px; top: 166px; width: 150px; height: 76px"
          >
            Cache <span class="pin">pinned</span>
          </div>

          <div
            v-vl-block="{ id: 'j', portSpread: spread ? { gap: 26, padding: 10 } : undefined }"
            class="card node card--hub"
            style="left: 560px; top: 84px; width: 170px; height: 64px"
          >
            Join
          </div>

          <!-- dragHandle: only the title drags; its rows' ports sit on the group's own border (anchorBlockId). -->
          <div
            v-vl-block="{ id: 'report', dragHandle: '.group-title' }"
            class="card node card--group"
            style="left: 760px; top: 28px; width: 190px; height: 150px"
          >
            <div class="group-title">Report <span class="grip">⠿ drag here</span></div>
            <div v-vl-port="{ id: 'ra', side: LEFT, anchorBlockId: 'report' }" class="sub">Daily</div>
            <div v-vl-port="{ id: 'rb', side: LEFT, anchorBlockId: 'report' }" class="sub">Weekly</div>
          </div>
        </VisualLinker>
      </div>
    </div>

    <h2 class="section-title">Drag options, one at a time</h2>
    <div class="grid">
      <div class="demo">
        <h3>dragHandle</h3>
        <p class="caption">only the grip drags — the body is just content</p>
        <div class="canvas canvas--mini">
          <VisualLinker :connections="handleConnections" :config="miniConfig">
            <div v-vl-block="{ id: 'hnd', dragHandle: '.grip-bar' }" class="card node mini-handle">
              <div class="grip-bar">⠿ grip</div>
              <div class="mini-body">body</div>
            </div>
            <div v-vl-block="{ id: 'anchor', draggable: false }" class="card node mini-fixed">fixed</div>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>dragBounds: element</h3>
        <p class="caption">the left block is fenced into the dashed box; the right one into the whole canvas</p>
        <div class="canvas canvas--mini">
          <div ref="fenceEl" class="fence" />
          <VisualLinker :connections="fenceConnections" :config="miniConfig">
            <div v-vl-block="{ id: 'free', dragBounds: fenceEl }" class="card node mini-a">fenced</div>
            <div v-vl-block="'fenced'" class="card node mini-b">free</div>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>dragBounds: inset + grid</h3>
        <p class="caption">kept 30px from every edge, on a 20px grid</p>
        <div class="canvas canvas--mini canvas--grid20">
          <div class="inset-frame" />
          <VisualLinker :connections="insetConnections" :config="gridConfig">
            <div
              v-vl-block="{ id: 'inset', dragBounds: { top: 30, right: 30, bottom: 30, left: 30 } }"
              class="card node mini-a mini-a--inside"
            >
              inset
            </div>
            <div v-vl-block="{ id: 'still', draggable: false }" class="card node mini-b mini-b--inside">still</div>
          </VisualLinker>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.scene {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.scene-intro em {
  font-style: normal;
  font-weight: 600;
  color: var(--color-text);
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 18px;
  padding: 12px 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  font-size: 12px;
  color: var(--color-text-muted);
}

.toolbar label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.toolbar code,
.caption code {
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--color-surface-alt);
  padding: 1px 5px;
  border-radius: 4px;
}

.hint {
  font-size: 12px;
  color: var(--color-text-faint);
  margin-top: -8px;
}

.selection {
  font-size: 12px;
  color: var(--color-text-muted);
}

.selection code {
  font-family: var(--font-mono);
}

.section-title {
  font-size: 16px;
  margin-top: 8px;
}

.board-scroll {
  overflow-x: auto;
}

.canvas {
  position: relative;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background: var(--color-surface-alt);
  background-image:
    linear-gradient(rgba(28, 30, 43, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(28, 30, 43, 0.07) 1px, transparent 1px);
  background-size: 24px 24px;
  overflow: hidden;
}

.board {
  width: 980px;
  height: 540px;
}

.canvas :deep(.vl-container) {
  height: 100%;
}

.node {
  position: absolute;
  width: 120px;
  height: 52px;
}

.card {
  background: var(--color-surface);
  border: 1.5px solid var(--color-text-faint);
  box-shadow: var(--shadow-md);
  font-weight: 600;
}

.card--hub {
  background: var(--color-accent);
  color: #fff;
  border-color: var(--color-accent-dark);
}

.card--pinned {
  flex-direction: column;
  gap: 2px;
  border-style: dashed;
  cursor: not-allowed;
  background: repeating-linear-gradient(135deg, var(--color-surface) 0 8px, var(--color-surface-alt) 8px 16px);
}

.pin {
  font-size: 10px;
  font-weight: 500;
  color: var(--color-text-faint);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.card--group {
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 8px;
  padding: 10px;
  background: var(--color-surface-alt);
}

.group-title {
  text-align: center;
  font-size: 13px;
  cursor: grab;
}

.grip {
  font-size: 10px;
  font-weight: 500;
  color: var(--color-text-faint);
}

.sub {
  background: var(--color-accent-soft);
  border-radius: var(--radius-sm);
  padding: 9px;
  font-size: 12px;
  text-align: center;
  color: var(--color-accent-dark);
}

/* --- the small demos --- */

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.demo {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.demo h3 {
  font-size: 14px;
  font-family: var(--font-mono);
  font-weight: 500;
}

.caption {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 8px;
  line-height: 1.4;
}

.canvas--mini {
  height: 200px;
}

.canvas--grid20 {
  background-size: 20px 20px;
}

.mini-a {
  left: 16px;
  top: 76px;
  width: 80px;
  height: 44px;
}

.mini-b {
  right: 16px;
  top: 76px;
  width: 80px;
  height: 44px;
}

.mini-handle {
  left: 16px;
  top: 52px;
  width: 100px;
  height: 84px;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  padding: 0;
  overflow: hidden;
}

.grip-bar {
  background: var(--color-accent);
  color: #fff;
  font-size: 11px;
  padding: 5px 8px;
  cursor: grab;
}

.mini-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-muted);
  cursor: default;
}

.mini-a--inside {
  left: 44px;
}

.mini-b--inside {
  right: 44px;
}

.mini-fixed {
  right: 16px;
  top: 76px;
  width: 80px;
  height: 44px;
  cursor: not-allowed;
}

.fence {
  position: absolute;
  left: 8px;
  top: 8px;
  width: 52%;
  height: calc(100% - 16px);
  border: 2px dashed var(--color-accent);
  border-radius: var(--radius-md);
  background: rgba(109, 91, 246, 0.05);
  pointer-events: none;
}

.inset-frame {
  position: absolute;
  inset: 30px;
  border: 2px dashed var(--color-accent);
  border-radius: var(--radius-md);
  pointer-events: none;
}
</style>
