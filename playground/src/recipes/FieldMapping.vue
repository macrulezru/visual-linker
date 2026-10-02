<script setup lang="ts">
import { ref } from 'vue'
import { VisualLinker, vVlBlock, vVlPort } from '@macrulez/visual-linker-vue'
import type { ConnectionDescriptor, VisualLinkerConfig } from '@macrulez/visual-linker-vue'

const sourceFields = [
  'first_name',
  'last_name',
  'email_address',
  'phone',
  'company',
  'job_title',
  'city',
  'country',
  'zip',
  'notes',
]
const targetFields = [
  'givenName',
  'familyName',
  'email',
  'mobile',
  'organization',
  'position',
  'town',
  'countryCode',
  'postalCode',
  'comment',
]

const mappings = ref<ConnectionDescriptor[]>([
  {
    id: 'first_name>givenName',
    from: { blockId: 'source', portId: 'first_name' },
    to: { blockId: 'target', portId: 'givenName' },
  },
  {
    id: 'email_address>email',
    from: { blockId: 'source', portId: 'email_address' },
    to: { blockId: 'target', portId: 'email' },
  },
  {
    id: 'notes>comment',
    from: { blockId: 'source', portId: 'notes' },
    to: { blockId: 'target', portId: 'comment' },
  },
])

const config: VisualLinkerConfig = {
  lines: { curve: 'bezier', width: 2, hover: { width: 3 } },
  markers: { start: { shape: 'circle' }, end: { shape: 'circle' } },
  interaction: { hover: true, selectable: true, clipToScrollParents: 'pin' },
}

const picked = ref<string | null>(null)

function pickSource(field: string) {
  picked.value = picked.value === field ? null : field
}

function mapTo(field: string) {
  if (!picked.value) return
  const id = `${picked.value}>${field}`
  if (!mappings.value.some((m) => m.id === id)) {
    mappings.value.push({
      id,
      from: { blockId: 'source', portId: picked.value },
      to: { blockId: 'target', portId: field },
    })
  }
  picked.value = null
}

function remove(doomed: ConnectionDescriptor[]) {
  const ids = new Set(doomed.map((c) => c.id))
  mappings.value = mappings.value.filter((m) => !ids.has(m.id))
}
</script>

<template>
  <VisualLinker class="diagram" :connections="mappings" :config="config" @connection-delete-request="remove">
    <div v-vl-block="'source'" class="panel">
      <h3>CSV columns</h3>
      <div
        v-for="field in sourceFields"
        :key="field"
        v-vl-port="{ id: field, side: 'right' }"
        class="row"
        :class="{ picked: picked === field }"
        @click="pickSource(field)"
      >
        {{ field }}
      </div>
    </div>
    <div v-vl-block="'target'" class="panel">
      <h3>Database fields</h3>
      <div
        v-for="field in targetFields"
        :key="field"
        v-vl-port="{ id: field, side: 'left' }"
        class="row"
        @click="mapTo(field)"
      >
        {{ field }}
      </div>
    </div>
  </VisualLinker>
</template>

<style scoped>
.diagram {
  position: relative;
  display: flex;
  justify-content: space-between;
  padding: 0 40px;
}
.panel {
  width: 240px;
  height: 260px;
  overflow-y: auto;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.panel h3 {
  position: sticky;
  top: 0;
  margin: 0;
  padding: 8px 12px;
  background: var(--color-surface-alt);
  font-size: 13px;
}
.row {
  padding: 8px 12px;
  border-top: 1px solid var(--color-border);
  cursor: pointer;
}
.row:hover {
  background: var(--color-surface-alt);
}
.row.picked {
  background: var(--color-accent-soft);
}
</style>
