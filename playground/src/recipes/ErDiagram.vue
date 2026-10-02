<script setup lang="ts">
import { VisualLinker, vVlBlock, vVlPort } from '@macrulez/visual-linker-vue'
import type { ConnectionDescriptor, VisualLinkerConfig } from '@macrulez/visual-linker-vue'

const tables = [
  { id: 'users', x: 0, y: 20, fields: ['id', 'email', 'name'] },
  { id: 'orders', x: 320, y: 0, fields: ['id', 'user_id', 'status', 'total'] },
  { id: 'order_items', x: 640, y: 40, fields: ['id', 'order_id', 'product_id', 'qty'] },
  { id: 'products', x: 320, y: 230, fields: ['id', 'title', 'price'] },
]

const relations: [[string, string], [string, string]][] = [
  [
    ['orders', 'user_id'],
    ['users', 'id'],
  ],
  [
    ['order_items', 'order_id'],
    ['orders', 'id'],
  ],
  [
    ['order_items', 'product_id'],
    ['products', 'id'],
  ],
]

const connections: ConnectionDescriptor[] = relations.map(([from, to]) => ({
  id: `${from.join('.')}->${to.join('.')}`,
  from: { blockId: from[0], portId: from[1] },
  to: { blockId: to[0], portId: to[1] },
  labels: [
    { id: 'many', position: 'start', text: 'N' },
    { id: 'one', position: 'end', text: '1' },
  ],
}))

const config: VisualLinkerConfig = {
  lines: { curve: 'smoothstep', highlight: { width: 2.5 }, hover: { width: 3 } },
  markers: { end: { shape: 'arrow' } },
  ports: { spread: true },
  blocks: { draggable: true, drag: { grid: 10, bounds: 'container' } },
}
</script>

<template>
  <VisualLinker class="diagram" :connections="connections" :config="config">
    <div
      v-for="table in tables"
      :key="table.id"
      v-vl-block="{ id: table.id, dragHandle: '.table-title' }"
      class="table"
      :style="{ left: `${table.x}px`, top: `${table.y}px` }"
    >
      <div class="table-title">{{ table.id }}</div>
      <div
        v-for="field in table.fields"
        :key="field"
        v-vl-port="{ id: field, side: ['left', 'right'] }"
        class="row"
        :class="{ key: field.endsWith('id') }"
      >
        {{ field }}
      </div>
    </div>
  </VisualLinker>
</template>

<style scoped>
.diagram {
  position: relative;
  height: 420px;
}
.table {
  position: absolute;
  width: 190px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.table-title {
  padding: 8px 12px;
  font-weight: 600;
  background: var(--color-surface-alt);
  cursor: grab;
}
.row {
  padding: 6px 12px;
  border-top: 1px solid var(--color-border);
}
.key {
  font-weight: 600;
}
</style>
