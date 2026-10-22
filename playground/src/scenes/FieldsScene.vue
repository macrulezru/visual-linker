<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  VisualLinker,
  useVisualLinkerConnect,
  vVlBlock,
  vVlPort,
  type ConnectionDescriptor,
  type VisualLinkerConfig,
} from '@macrulez/visual-linker-vue'

const sources = Array.from({ length: 14 }, (_, index) => `source_field_${index + 1}`)
const targets = Array.from({ length: 14 }, (_, index) => `targetField${index + 1}`)

const connections = ref<ConnectionDescriptor[]>([
  {
    id: 'source_field_1>targetField2',
    from: { blockId: 'source', portId: 'source_field_1' },
    to: { blockId: 'target', portId: 'targetField2' },
  },
])
const linker = ref<{ engine: unknown } | null>(null)
const { connecting, from, candidate, via } = useVisualLinkerConnect(linker)
const removed = ref('—')

const config = computed<VisualLinkerConfig>(() => ({
  lines: { curve: 'bezier', width: 2, endGap: 2, hover: { width: 3 } },
  ports: {
    show: 'all',
    radius: 5,
    strokeWidth: 2,
    stroke: '#ffffff',
    clearance: 'auto',
    fadeEdge: 24,
    sides: { source: 'right', target: 'left' },
    source: { fill: '#3b6fd4' },
    target: { fill: '#2f9e6b' },
    connected: { radius: 6 },
    connect: { candidate: { radius: 7 }, source: { radius: 7 } },
  },
  interaction: {
    hover: true,
    connect: { enabled: true, handle: 'never', dimOthers: 0.3 },
  },
}))

function create(payload: { from: { portId?: string }; to: { portId?: string } }) {
  const id = `${payload.from.portId}>${payload.to.portId}`
  if (!connections.value.some((connection) => connection.id === id)) {
    connections.value.push({
      id,
      from: { blockId: 'source', portId: payload.from.portId },
      to: { blockId: 'target', portId: payload.to.portId },
    })
  }
}
</script>

<template>
  <section class="scene">
    <p class="intro">
      Two scrolling field lists. Every row is a connectable port with its own colour by role, the buttons inside rows
      keep working, and the row of a hovered line or of the connection candidate is highlighted through the block
      attributes — no <code>:has</code> needed.
    </p>
    <p class="status">
      connecting: <b>{{ connecting }}</b> · from: <b>{{ from?.portId ?? '—' }}</b> · candidate:
      <b>{{ candidate?.portId ?? '—' }}</b> · via: <b>{{ via ?? '—' }}</b> · last removed: <b>{{ removed }}</b>
    </p>
    <VisualLinker
      ref="linker"
      class="diagram"
      :connections="connections"
      :config="config"
      @connection-create-request="create"
    >
      <div v-vl-block="{ id: 'source', connect: 'source' }" class="panel">
        <h3>Source</h3>
        <div class="list">
          <div v-for="name in sources" :key="name" v-vl-port="{ id: name, connect: 'source' }" class="row">
            <span>{{ name }}</span>
            <button type="button" @click="removed = name">×</button>
          </div>
        </div>
      </div>
      <div v-vl-block="{ id: 'target', connect: 'target' }" class="panel">
        <h3>Target</h3>
        <div class="list">
          <div v-for="name in targets" :key="name" v-vl-port="{ id: name, connect: 'target' }" class="row">
            <span>{{ name }}</span>
            <button type="button" @click="removed = name">×</button>
          </div>
        </div>
      </div>
      <template #port="{ role, connected, state }">
        <span v-if="state === 'candidate'" class="badge-dot" :data-role="role" :data-connected="connected" />
      </template>
    </VisualLinker>
  </section>
</template>

<style scoped>
.scene {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.intro,
.status {
  color: var(--color-text-muted);
  font-size: 13px;
}
.diagram {
  position: relative;
  display: flex;
  justify-content: space-between;
  padding: 0 80px;
}
.panel {
  width: 240px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.panel h3 {
  margin: 0;
  padding: 8px 12px;
  background: var(--color-surface-alt);
  font-size: 13px;
}
.list {
  max-height: 280px;
  overflow-y: auto;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-top: 1px solid var(--color-border);
}
.row[data-vl-hover='line'],
.row[data-vl-connect-state='candidate'] {
  background: #e6f6ee;
}
.row[data-vl-connect-state='target'] {
  background: #c9ecd9;
}
.row[data-vl-connect-state='source'] {
  background: var(--color-accent-soft);
}
.badge-dot {
  display: block;
  width: 0;
  height: 0;
}
</style>
