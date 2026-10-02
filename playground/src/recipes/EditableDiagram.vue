<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { VisualLinker, vVlBlock } from '@macrulez/visual-linker-vue'
import type { VisualLinkerConfig } from '@macrulez/visual-linker-vue'

type Position = { x: number; y: number }

const STORAGE_KEY = 'diagram-layout'
const defaults = (index: number): Position => ({
  x: 20 + (index % 4) * 200,
  y: 40 + Math.floor(index / 4) * 120 + (index % 2) * 60,
})

const nodes = ref(
  ['Start', 'Process', 'Finish'].map((title, index) => ({
    id: `n${index + 1}`,
    title,
    start: defaults(index),
  })),
)
const positions = ref<Record<string, Position>>({})
const restored = ref(false)

onMounted(() => {
  const saved: Record<string, Position> = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  for (const node of nodes.value) node.start = saved[node.id] ?? node.start
  positions.value = saved
  restored.value = true
})

const connections = computed(() =>
  nodes.value.slice(1).map((node, i) => ({
    id: `${nodes.value[i].id}>${node.id}`,
    from: { blockId: nodes.value[i].id },
    to: { blockId: node.id },
  })),
)

const config: VisualLinkerConfig = {
  lines: { curve: 'smoothstep' },
  markers: { end: { shape: 'arrow' } },
  blocks: { draggable: true, drag: { grid: 10, bounds: 'container' } },
}

function add() {
  const index = nodes.value.length
  nodes.value.push({ id: `n${index + 1}`, title: `Step ${index + 1}`, start: defaults(index) })
}

function removeLast() {
  const last = nodes.value.pop()
  if (last) delete positions.value[last.id]
}

function onDragEnd({ blockId, x, y }: { blockId: string; x: number; y: number }) {
  const node = nodes.value.find((n) => n.id === blockId)!
  positions.value[blockId] = { x: node.start.x + x, y: node.start.y + y }
}

function reset() {
  localStorage.removeItem(STORAGE_KEY)
  location.reload()
}

watch(
  positions,
  (value) => {
    if (restored.value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  },
  { deep: true },
)
</script>

<template>
  <div class="toolbar">
    <button @click="add">Add node</button>
    <button @click="removeLast">Remove last</button>
    <button @click="reset">Reset layout</button>
  </div>

  <VisualLinker class="diagram" :connections="connections" :config="config" @block-dragend="onDragEnd">
    <div
      v-for="node in nodes"
      :key="node.id"
      v-vl-block="node.id"
      class="card"
      :style="{ left: `${node.start.x}px`, top: `${node.start.y}px` }"
    >
      {{ node.title }}
    </div>
  </VisualLinker>
</template>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.diagram {
  position: relative;
  height: 360px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.card {
  position: absolute;
  width: 130px;
  padding: 12px 14px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: grab;
  user-select: none;
}
</style>
