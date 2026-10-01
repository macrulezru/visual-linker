<script setup lang="ts">
import { reactive, type ComponentPublicInstance } from 'vue'
import {
  VisualLinker,
  VLConnectionCurveEnum,
  VLFixedSideEnum,
  VLMarkerShapeEnum,
  type ConnectionDescriptor,
  type ConnectionStyle,
} from '@macrulez/visual-linker-vue'
import DemoPanel from '../components/DemoPanel.vue'

// --- 1. Blocks nested inside your own components ---
const columns = [
  { title: 'Sources', items: ['orders.csv', 'users.json', 'events.log'] },
  { title: 'Prepare', items: ['parse', 'enrich'], anchored: true },
  { title: 'Combine', items: ['join'] },
  { title: 'Sinks', items: ['warehouse', 'dashboard'] },
]

// Port dots are the library's own markers — a hollow circle at both ends, and
// at the target end an arrow whose tip stops exactly on that circle's edge.
const portDot = { shape: VLMarkerShapeEnum.CIRCLE, size: 7, color: '#fff', strokeColor: '#6d5bf6', strokeWidth: 2 }
const pipelineStyle: ConnectionStyle = {
  curve: VLConnectionCurveEnum.SMOOTHSTEP,
  color: '#6d5bf6',
  width: 2,
  startMarker: portDot,
  endMarker: { ...portDot, arrow: true },
  // Data flowing through the pipeline: dots travelling from source to sink.
  animated: { shape: 'dots', speed: 50 },
}

function link(from: string, to: string): ConnectionDescriptor {
  return {
    id: `${from}->${to}`,
    from: { blockId: from, portId: 'out' },
    to: { blockId: to, portId: 'in' },
    style: pipelineStyle,
  }
}

const pipeline: ConnectionDescriptor[] = [
  link('orders.csv', 'parse'),
  link('users.json', 'enrich'),
  link('events.log', 'enrich'),
  link('parse', 'join'),
  link('enrich', 'join'),
  link('join', 'warehouse'),
  link('join', 'dashboard'),
]

const inPort = { id: 'in', side: VLFixedSideEnum.LEFT }
const outPort = { id: 'out', side: VLFixedSideEnum.RIGHT }

// Prepare's ports are anchored to the panel itself (anchorEl): the line meets
// the panel's own border, at each row's height, instead of the row's inset edge.
const panelEls = reactive<Record<string, HTMLElement | undefined>>({})
function setPanelEl(title: string, instance: Element | ComponentPublicInstance | null) {
  panelEls[title] = (instance as ComponentPublicInstance | null)?.$el ?? undefined
}
function portFor(base: typeof inPort, column: (typeof columns)[number]) {
  return column.anchored ? { ...base, anchorEl: () => panelEls[column.title] } : base
}

// --- 2. Blocks anywhere on the page (scope="page") ---
const tasks = [
  { id: 'task-api', label: 'Ship public API' },
  { id: 'task-docs', label: 'Write the docs' },
  { id: 'task-ci', label: 'Fix flaky CI' },
]
const owners = [
  { id: 'owner-ann', label: 'Ann' },
  { id: 'owner-ben', label: 'Ben' },
]
const assignments: ConnectionDescriptor[] = [
  ['task-api', 'owner-ann'],
  ['task-docs', 'owner-ben'],
  ['task-ci', 'owner-ann'],
].map(([from, to]) => ({
  id: `${from}->${to}`,
  from: { blockId: from! },
  to: { blockId: to! },
  style: { color: '#1fa97a', endMarker: VLMarkerShapeEnum.ARROW, startMarker: VLMarkerShapeEnum.CIRCLE },
}))

// --- 3. A port scrolled out of its scroller (clipToScrollParents) ---
const scrollTargets = ['Archive', 'Review', 'Publish']
const scrollConnections: ConnectionDescriptor[] = Array.from({ length: 8 }, (_, i) => ({
  id: `item-${i + 1}`,
  from: { blockId: `item-${i + 1}` },
  to: { blockId: scrollTargets[i % scrollTargets.length]! },
  style: { curve: VLConnectionCurveEnum.SMOOTHSTEP, color: '#e0526c', width: 2, endMarker: VLMarkerShapeEnum.ARROW },
}))
</script>

<template>
  <section class="scene">
    <p class="scene-intro">
      Blocks don't need to be direct children of <code>&lt;VisualLinker&gt;</code>, or even inside it. Mark any element
      with <code>v-vl-block</code> / <code>data-vl-block</code> (ports with <code>v-vl-port</code> /
      <code>data-vl-port</code>) wherever it sits in your template.
    </p>

    <h2 class="section-title">Nested inside your own components</h2>
    <p class="scene-intro">
      Every row below lives three components deep (<code>&lt;DemoPanel&gt;</code> → header/body wrappers → row), with
      invisible <code>in</code>/<code>out</code> port anchors on its edges. The dots and arrows are markers:
      <code>endMarker: { shape: 'circle', arrow: true }</code> stops the arrow right at the circle's edge. In
      <em>Prepare</em> the ports use <code>anchorEl</code>: lines meet the panel's own border, at each row's height.
    </p>
    <VisualLinker :connections="pipeline" :options="{ showPorts: false, defaultCornerRadius: 10 }">
      <div class="pipeline">
        <DemoPanel
          v-for="column in columns"
          :key="column.title"
          :ref="(instance) => setPanelEl(column.title, instance)"
          :title="column.title"
        >
          <div v-for="item in column.items" :key="item" v-vl-block="item" class="row">
            <span v-vl-port="portFor(inPort, column)" class="port-anchor port-anchor--in" />
            {{ item }}
            <span v-vl-port="portFor(outPort, column)" class="port-anchor port-anchor--out" />
          </div>
        </DemoPanel>
      </div>
    </VisualLinker>

    <h2 class="section-title">Anywhere on the page — <code>scope="page"</code></h2>
    <p class="scene-intro">
      Neither column below is inside a <code>&lt;VisualLinker&gt;</code>. A page-scoped instance named
      <code>assign</code> finds them by <code>v-vl-block="{ id, linker: 'assign' }"</code> (left) and plain
      <code>data-vl-block</code> + <code>data-vl-linker</code> attributes (right), and draws in a fixed layer teleported
      to <code>&lt;body&gt;</code>.
    </p>
    <div class="page-demo">
      <DemoPanel title="Tasks">
        <div v-for="task in tasks" :key="task.id" v-vl-block="{ id: task.id, linker: 'assign' }" class="chip">
          {{ task.label }}
        </div>
      </DemoPanel>
      <div />
      <DemoPanel title="Owners">
        <div v-for="owner in owners" :key="owner.id" :data-vl-block="owner.id" data-vl-linker="assign" class="chip">
          {{ owner.label }}
        </div>
      </DemoPanel>
    </div>
    <VisualLinker scope="page" name="assign" :connections="assignments" :options="{ showPorts: false }" />

    <h2 class="section-title">Scrolled out of view — <code>clipToScrollParents</code></h2>
    <p class="scene-intro">
      Scroll the list: a row that leaves the scroller's visible area doesn't leave a line dangling over the page — its
      end is pulled to the scroller's edge and its dot and arrow are dropped (<code>'pin'</code>, the default;
      <code>'hide'</code> hides the whole line instead).
    </p>
    <VisualLinker :connections="scrollConnections" :options="{ defaultCornerRadius: 10 }">
      <div class="scroll-demo">
        <div class="scroller">
          <div v-for="n in 8" :key="n" v-vl-block="`item-${n}`" class="chip">Item {{ n }}</div>
        </div>
        <div class="scroll-targets">
          <div v-for="target in scrollTargets" :key="target" v-vl-block="target" class="chip">{{ target }}</div>
        </div>
      </div>
    </VisualLinker>
  </section>
</template>

<style scoped>
.scene {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-title {
  font-size: 16px;
  margin-top: 8px;
}

.section-title code,
.scene-intro code {
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--color-surface);
  padding: 1px 5px;
  border-radius: 4px;
}

.pipeline {
  display: flex;
  gap: 72px;
  align-items: flex-start;
}

.row {
  position: relative;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  background: var(--color-accent-soft);
  color: var(--color-accent-dark);
  font-size: 12px;
  font-family: var(--font-mono);
}

/* Zero-size port targets on the row's edges — the visible dots are markers. */
.port-anchor {
  position: absolute;
  top: 50%;
  width: 0;
  height: 0;
}
.port-anchor--in {
  left: 0;
}
.port-anchor--out {
  right: 0;
}

.page-demo {
  display: grid;
  grid-template-columns: 220px 1fr 220px;
  max-width: 760px;
}

.scroll-demo {
  display: flex;
  gap: 160px;
  align-items: center;
  max-width: 560px;
}

.scroller {
  width: 200px;
  height: 170px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.scroller .chip {
  flex-shrink: 0;
}

.scroll-targets {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.chip {
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  font-size: 13px;
}
</style>
