<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  VisualLinker,
  vVlBlock,
  vVlPort,
  type ConnectionDescriptor,
  type ConnectionEndpoint,
  type VisualLinkerConfig,
} from '@macrulez/visual-linker-vue'
import EventLog from '../components/EventLog.vue'

interface Field {
  id: string
  label: string
  parent?: string
}

const sourceFields: Field[] = [
  { id: 'user', label: 'user' },
  { id: 'user.name', label: 'name', parent: 'user' },
  { id: 'user.name.first', label: 'first', parent: 'user.name' },
  { id: 'user.name.last', label: 'last', parent: 'user.name' },
  { id: 'user.contacts', label: 'contacts', parent: 'user' },
  { id: 'user.contacts.email', label: 'email', parent: 'user.contacts' },
  { id: 'user.contacts.phone', label: 'phone', parent: 'user.contacts' },
  { id: 'order', label: 'order' },
  { id: 'order.id', label: 'id', parent: 'order' },
  { id: 'order.total', label: 'total', parent: 'order' },
  ...Array.from({ length: 30 }, (_, i) => ({ id: `extra.f${i}`, label: `extra field ${i}`, parent: undefined })),
]
const targetFields: Field[] = [
  { id: 'person', label: 'person' },
  { id: 'person.fullName', label: 'fullName', parent: 'person' },
  { id: 'person.mail', label: 'mail', parent: 'person' },
  { id: 'person.tel', label: 'tel', parent: 'person' },
  { id: 'purchase', label: 'purchase' },
  { id: 'purchase.number', label: 'number', parent: 'purchase' },
  { id: 'purchase.sum', label: 'sum', parent: 'purchase' },
]

const collapsed = ref(new Set<string>())
const rules = ref<ConnectionDescriptor[]>([
  rule('user.name.first', 'person.fullName', 'accepted'),
  rule('user.contacts.email', 'person.mail', 'accepted'),
  rule('order.total', 'purchase.sum', 'suggested'),
  rule('user.contacts.phone', 'person.mail', 'conflict'),
])
const lastEvent = ref('—')

function ancestors(fields: Field[], id: string): string[] {
  const chain: string[] = []
  for (let field = fields.find((f) => f.id === id); field?.parent;) {
    chain.push(field.parent)
    field = fields.find((f) => f.id === field!.parent)
  }
  return chain
}

function endpoint(side: 'source' | 'target', fieldId: string): ConnectionEndpoint {
  const fields = side === 'source' ? sourceFields : targetFields
  return {
    blockId: `${side}:${fieldId}`,
    portId: 'p',
    fallback: ancestors(fields, fieldId).map((id) => ({ blockId: `${side}:${id}`, portId: 'p' })),
  }
}

function rule(from: string, to: string, status: 'accepted' | 'suggested' | 'conflict'): ConnectionDescriptor {
  return {
    id: `${from}>${to}`,
    from: endpoint('source', from),
    to: endpoint('target', to),
    style: {
      color: status === 'conflict' ? '#e0526c' : undefined,
      dashed: status === 'suggested',
    },
    labels: [{ id: 'status', position: 'middle', text: status }],
  }
}

function visible(fields: Field[], field: Field): boolean {
  return ancestors(fields, field.id).every((id) => !collapsed.value.has(id))
}

function toggle(id: string) {
  const next = new Set(collapsed.value)
  if (!next.delete(id)) next.add(id)
  collapsed.value = next
}

const config = computed<VisualLinkerConfig>(() => ({
  lines: { curve: 'bezier', width: 2, hover: { width: 3 }, proxied: { dashed: true, opacity: 0.55 } },
  markers: { end: { shape: 'arrow' } },
  interaction: {
    hover: true,
    selectable: true,
    clipToScrollParents: 'pin',
    connect: { enabled: true, handle: 'hover' },
  },
  performance: { cull: true },
}))

function create(payload: { from: ConnectionEndpoint; to: ConnectionEndpoint; via: string }) {
  const from = payload.from.blockId.slice('source:'.length)
  const to = payload.to.blockId.slice('target:'.length)
  lastEvent.value = `create-request ${from} → ${to} (${payload.via})`
  if (!rules.value.some((item) => item.id === `${from}>${to}`)) rules.value.push(rule(from, to, 'accepted'))
}

function remove(doomed: ConnectionDescriptor[]) {
  const ids = new Set(doomed.map((item) => item.id))
  rules.value = rules.value.filter((item) => !ids.has(item.id))
}

function depth(fields: Field[], field: Field) {
  return ancestors(fields, field.id).length
}

function hasChildren(fields: Field[], field: Field) {
  return fields.some((candidate) => candidate.parent === field.id)
}
</script>

<template>
  <section class="scene">
    <p class="intro">
      Field mapping: fold a tree node and the lines of its children move to the folded node and turn faded. Drag from a
      row to a row on the other side, scroll the lists, select a line and press Delete.
    </p>
    <VisualLinker
      class="diagram"
      :connections="rules"
      :config="config"
      @connection-create-request="create"
      @connection-delete-request="remove"
    >
      <div class="column">
        <h3>Source</h3>
        <div class="scroller">
          <template v-for="field in sourceFields" :key="field.id">
            <div
              v-if="visible(sourceFields, field)"
              v-vl-block="{ id: `source:${field.id}` }"
              v-vl-port="{ id: 'p', side: 'right' }"
              class="row"
              :style="{ paddingLeft: `${12 + depth(sourceFields, field) * 16}px` }"
            >
              <button v-if="hasChildren(sourceFields, field)" type="button" class="fold" @click.stop="toggle(field.id)">
                {{ collapsed.has(field.id) ? '▸' : '▾' }}
              </button>
              {{ field.label }}
            </div>
          </template>
        </div>
      </div>
      <div class="column">
        <h3>Target</h3>
        <div class="scroller">
          <template v-for="field in targetFields" :key="field.id">
            <div
              v-if="visible(targetFields, field)"
              v-vl-block="{ id: `target:${field.id}` }"
              v-vl-port="{ id: 'p', side: 'left' }"
              class="row"
              :style="{ paddingLeft: `${12 + depth(targetFields, field) * 16}px` }"
            >
              <button v-if="hasChildren(targetFields, field)" type="button" class="fold" @click.stop="toggle(field.id)">
                {{ collapsed.has(field.id) ? '▸' : '▾' }}
              </button>
              {{ field.label }}
            </div>
          </template>
        </div>
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
.diagram {
  position: relative;
  display: flex;
  justify-content: space-between;
  padding: 0 60px;
}
.column {
  width: 280px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.column h3 {
  margin: 0;
  padding: 8px 12px;
  background: var(--color-surface-alt);
  font-size: 13px;
}
.scroller {
  height: 300px;
  overflow-y: auto;
}
.row {
  padding: 6px 12px;
  border-top: 1px solid var(--color-border);
  font-size: 13px;
}
.row[data-vl-connect-state='candidate'] {
  background: #e6f6ee;
}
.row[data-vl-connect-state='target'] {
  background: #c9ecd9;
}
.row[data-vl-connect-state='source'] {
  background: var(--color-accent-soft);
}
.fold {
  border: 0;
  background: none;
  cursor: pointer;
  padding: 0 4px 0 0;
}
</style>
