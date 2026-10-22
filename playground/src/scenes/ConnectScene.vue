<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  VisualLinker,
  vVlBlock,
  vVlPort,
  type ConnectionDescriptor,
  type ConnectMode,
  type VisualLinkerConfig,
} from '@macrulez/visual-linker-vue'
import EventLog from '../components/EventLog.vue'

const sources = ['id', 'first_name', 'last_name', 'email', 'phone']
const targets = ['userId', 'givenName', 'familyName', 'mail', 'mobile']

const connections = ref<ConnectionDescriptor[]>([
  { id: 'id>userId', from: { blockId: 'source', portId: 'id' }, to: { blockId: 'target', portId: 'userId' } },
])
const mode = ref<ConnectMode>('both')
const oneIncomingPerTarget = ref(true)
const lastEvent = ref('—')
const linker = ref<{
  startConnect(from: object): boolean
  completeConnect(to: object): boolean
  cancelConnect(): void
  isConnecting(): { active: boolean }
} | null>(null)

const config = computed<VisualLinkerConfig>(() => ({
  lines: { curve: 'bezier', width: 2, hover: { width: 3 } },
  markers: { end: { shape: 'arrow' } },
  interaction: {
    hover: true,
    selectable: true,
    connect: {
      enabled: true,
      mode: mode.value,
      handle: 'always',
      announce: {
        start: 'Connecting from {from}. Press Tab to choose a target, Enter to connect, Escape to cancel.',
        complete: 'Connected {from} to {to}.',
      },
      validate: (_from, to) => {
        if (!oneIncomingPerTarget.value) return true
        const taken = connections.value.some((connection) => connection.to.portId === to.portId)
        return taken ? `${to.portId} already has a source` : true
      },
    },
  },
}))

function create(payload: { from: { portId?: string }; to: { portId?: string }; via: string }) {
  const id = `${payload.from.portId}>${payload.to.portId}`
  lastEvent.value = `create-request ${id} via ${payload.via}`
  if (!connections.value.some((connection) => connection.id === id)) {
    connections.value.push({
      id,
      from: { blockId: 'source', portId: payload.from.portId },
      to: { blockId: 'target', portId: payload.to.portId },
    })
  }
}

function remove(doomed: ConnectionDescriptor[]) {
  const ids = new Set(doomed.map((connection) => connection.id))
  connections.value = connections.value.filter((connection) => !ids.has(connection.id))
}
</script>

<template>
  <section class="scene">
    <p class="intro">
      Drag from a port dot to another port, click one port and then another, or focus a port and press Enter, Tab to a
      target, Enter again. The library only reports the request; this page adds the line. A target accepts one source.
    </p>
    <div class="controls">
      <label>
        mode
        <select v-model="mode">
          <option value="both">both</option>
          <option value="drag">drag</option>
          <option value="click">click</option>
        </select>
      </label>
      <label><input v-model="oneIncomingPerTarget" type="checkbox" /> one source per target (validate)</label>
      <button type="button" @click="linker?.startConnect({ blockId: 'source', portId: 'email' })">
        startConnect(email) from code
      </button>
      <button type="button" @click="linker?.completeConnect({ blockId: 'target', portId: 'mail' })">
        completeConnect(mail)
      </button>
      <button type="button" @click="linker?.cancelConnect()">cancelConnect()</button>
    </div>
    <VisualLinker
      ref="linker"
      class="diagram"
      :connections="connections"
      :config="config"
      @connection-create-request="create"
      @connection-create-cancel="(p) => (lastEvent = `create-cancel: ${p.reason}${p.message ? ` (${p.message})` : ''}`)"
      @connect-start="(p) => (lastEvent = `connect-start from ${p.from.portId ?? p.from.blockId}`)"
      @connection-delete-request="remove"
    >
      <div v-vl-block="'source'" class="panel">
        <h3>Source</h3>
        <div v-for="name in sources" :key="name" v-vl-port="{ id: name, side: 'right' }" class="row">{{ name }}</div>
      </div>
      <div v-vl-block="'target'" class="panel">
        <h3>Target</h3>
        <div v-for="name in targets" :key="name" v-vl-port="{ id: name, side: 'left' }" class="row">{{ name }}</div>
      </div>
    </VisualLinker>
    <EventLog :event="lastEvent" />
  </section>
</template>

<style scoped>
.scene {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.intro {
  color: var(--color-text-muted);
  font-size: 13px;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  font-size: 13px;
}
.diagram {
  position: relative;
  display: flex;
  justify-content: space-between;
  padding: 0 60px;
}
.panel {
  width: 220px;
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
.row {
  padding: 8px 12px;
  border-top: 1px solid var(--color-border);
}
.row[data-vl-connect-state='candidate'] {
  background: #e6f6ee;
}
.row[data-vl-connect-state='target'] {
  background: #c9ecd9;
}
.row[data-vl-connect-state='invalid'] {
  background: #fbe3e3;
}
.row[data-vl-connect-state='source'] {
  background: var(--color-accent-soft);
}
.row:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
</style>
