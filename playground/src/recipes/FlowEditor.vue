<script setup lang="ts">
import { ref } from 'vue'
import { VisualLinker, vVlBlock } from '@macrulez/visual-linker-vue'
import type { ConnectionDescriptor, VisualLinkerConfig } from '@macrulez/visual-linker-vue'

const nodes = [
  { id: 'trigger', title: 'Trigger', note: 'on webhook', x: 20, y: 150 },
  { id: 'fetch', title: 'Fetch', note: 'GET /orders', x: 260, y: 40 },
  { id: 'filter', title: 'Filter', note: 'status = paid', x: 260, y: 260 },
  { id: 'save', title: 'Save', note: 'to database', x: 520, y: 150 },
]

const connections = ref<ConnectionDescriptor[]>([
  { id: 'trigger>fetch', from: { blockId: 'trigger' }, to: { blockId: 'fetch' } },
  { id: 'trigger>filter', from: { blockId: 'trigger' }, to: { blockId: 'filter' } },
  { id: 'fetch>save', from: { blockId: 'fetch' }, to: { blockId: 'save' } },
])

const config: VisualLinkerConfig = {
  lines: {
    curve: 'smoothstep',
    routing: { avoidObstacles: true },
    jumps: true,
    animated: { shape: 'dots', speed: 40 },
    selected: { color: '#6366f1' },
  },
  markers: { end: { shape: 'arrow' } },
  blocks: { draggable: true, drag: { grid: 20, bounds: 'container' } },
  interaction: { selectable: true },
}

const source = ref<string | null>(null)

function pick(id: string) {
  if (!source.value || source.value === id) return
  const connectionId = `${source.value}>${id}`
  if (!connections.value.some((c) => c.id === connectionId)) {
    connections.value.push({
      id: connectionId,
      from: { blockId: source.value },
      to: { blockId: id },
    })
  }
  source.value = null
}

function remove(doomed: ConnectionDescriptor[]) {
  const ids = new Set(doomed.map((c) => c.id))
  connections.value = connections.value.filter((c) => !ids.has(c.id))
}
</script>

<template>
  <VisualLinker
    class="diagram"
    :connections="connections"
    :config="config"
    @connection-delete-request="remove"
    @keydown.esc="source = null"
  >
    <div
      v-for="node in nodes"
      :key="node.id"
      v-vl-block="{ id: node.id, dragHandle: '.node-body' }"
      class="node"
      :class="{ source: source === node.id }"
      :style="{ left: `${node.x}px`, top: `${node.y}px` }"
      @click="pick(node.id)"
    >
      <div class="node-body">
        <strong>{{ node.title }}</strong>
        <small>{{ node.note }}</small>
      </div>
      <button class="node-connect" @click.stop="source = source === node.id ? null : node.id">Connect</button>
    </div>
  </VisualLinker>
  <p class="hint">Press Connect on a node, then click another node. Select a line and press Delete to remove it.</p>
</template>

<style scoped>
.diagram {
  position: relative;
  height: 420px;
}
.node {
  position: absolute;
  width: 150px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  user-select: none;
}
.node.source {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-soft);
}
.node-body {
  padding: 10px 14px;
  cursor: grab;
}
.node-body small {
  display: block;
  color: var(--color-text-muted);
}
.node-connect {
  display: block;
  width: 100%;
  padding: 6px;
  border: 0;
  border-top: 1px solid var(--color-border);
  background: none;
  color: var(--color-accent);
  cursor: pointer;
}
.hint {
  margin: 12px 0 0;
  color: var(--color-text-muted);
  font-size: 13px;
}
</style>
