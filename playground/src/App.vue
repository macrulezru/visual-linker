<script setup lang="ts">
import { ref } from 'vue'
import {
  VisualLinker,
  VLConnectionCurveEnum,
  VLFixedSideEnum,
  VLMarkerShapeEnum,
  type ConnectionDescriptor,
  type VisualLinkerBlock,
} from '@macrulez/visual-linker-vue'

const simpleBlocks = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b17', 'b18', 'b19', 'b20', 'b21']

const lastEvent = ref('—')

// Template refs for Block 13's own root, its drag handle, and its three rows
// — passed directly as `dragHandle`/`anchorEl`/`target` below instead of a
// data-attribute + CSS selector. Each starts out null and resolves once its
// element mounts; the block/port config re-syncs automatically when that
// happens (see VisualLinker.ts's watchEffect).
const groupRef = ref<HTMLElement | null>(null)
const groupTitleRef = ref<HTMLElement | null>(null)
const row14Ref = ref<HTMLElement | null>(null)
const row15Ref = ref<HTMLElement | null>(null)
const row16Ref = ref<HTMLElement | null>(null)

const blocks: VisualLinkerBlock[] = [
  { id: 'b1' },
  { id: 'b2' },
  // 'out' is restricted to ['bottom', 'right']: dragging b3 around never sends
  // its connections out the top or left, even if full auto would prefer that.
  { id: 'b3', draggable: true, ports: [{ id: 'out', side: [VLFixedSideEnum.BOTTOM, VLFixedSideEnum.RIGHT] }] },
  { id: 'b4' },
  { id: 'b5' },
  { id: 'b6' },
  {
    id: 'b13',
    draggable: true,
    dragHandle: groupTitleRef,
    // anchorEl: the connector points sit on the group's own border (not each
    // row's own indented edge), while still tracking each row's real height.
    ports: [
      { id: 'p14', target: row14Ref, side: [VLFixedSideEnum.LEFT, VLFixedSideEnum.RIGHT], anchorEl: groupRef },
      { id: 'p15', target: row15Ref, side: [VLFixedSideEnum.LEFT, VLFixedSideEnum.RIGHT], anchorEl: groupRef },
      { id: 'p16', target: row16Ref, side: [VLFixedSideEnum.LEFT, VLFixedSideEnum.RIGHT], anchorEl: groupRef },
    ],
  },
  { id: 'b17' },
  { id: 'b18' },
  { id: 'b19' },
  { id: 'b20' },
  { id: 'b21' },
]

const connections: ConnectionDescriptor[] = [
  {
    id: 'c1',
    from: { blockId: 'b1' },
    to: { blockId: 'b2' },
    style: {
      curve: VLConnectionCurveEnum.BEZIER,
      startMarker: VLMarkerShapeEnum.SQUARE,
      endMarker: VLMarkerShapeEnum.DIAMOND,
    },
  },
  {
    id: 'c2',
    from: { blockId: 'b3', portId: 'out' },
    to: { blockId: 'b4' },
    style: { curve: VLConnectionCurveEnum.BEZIER },
  },
  {
    id: 'c3',
    from: { blockId: 'b3', portId: 'out' },
    to: { blockId: 'b5' },
    style: { curve: VLConnectionCurveEnum.BEZIER },
  },
  {
    id: 'c4',
    from: { blockId: 'b3', portId: 'out' },
    to: { blockId: 'b6' },
    // Shares b3's 'out' port with c2/c3 — since b5 is the nearer sibling along
    // that trunk, this one's line visibly shares the same initial stretch as
    // c3's before peeling off toward b6 (the group-aware smoothstep branch point).
    style: {
      curve: VLConnectionCurveEnum.BEZIER,
      color: '#c0392b',
      dashed: true,
      endMarker: { shape: VLMarkerShapeEnum.ARROW, color: '#c0392b' },
    },
  },
  {
    id: 'c5',
    from: { blockId: 'b13', portId: 'p14' },
    to: { blockId: 'b17' },
    style: {
      curve: VLConnectionCurveEnum.BEZIER,
      endMarker: VLMarkerShapeEnum.ARROW,
      hoverStyle: { color: '#1f6feb' },
    },
  },
  {
    id: 'c6',
    from: { blockId: 'b13', portId: 'p14' },
    to: { blockId: 'b18' },
    // Shares p14 with c5 — both peel off the same short trunk stub, rounded at the branch point.
    style: { curve: VLConnectionCurveEnum.BEZIER, endMarker: VLMarkerShapeEnum.ARROW },
  },
  {
    id: 'c7',
    from: { blockId: 'b13', portId: 'p15' },
    to: { blockId: 'b19' },
    // A bigger arrow via the marker's own size coefficient (multiples of the line's stroke width).
    style: { curve: VLConnectionCurveEnum.BEZIER, endMarker: { shape: VLMarkerShapeEnum.ARROW } },
  },
  {
    id: 'c8',
    from: { blockId: 'b13', portId: 'p16' },
    to: { blockId: 'b20' },
    // A larger corner radius than the instance default, just on this one connection.
    style: { curve: VLConnectionCurveEnum.BEZIER, endMarker: VLMarkerShapeEnum.ARROW, cornerRadius: 16 },
  },
  {
    id: 'c9',
    from: { blockId: 'b13', portId: 'p16' },
    to: { blockId: 'b21' },
    style: { curve: VLConnectionCurveEnum.BEZIER },
  },
]

function label(id: string) {
  return `Block ${id.slice(1)}`
}
</script>

<template>
  <main>
    <h1>visual-linker playground</h1>
    <p class="event-log">last event: {{ lastEvent }}</p>
    <VisualLinker
      :blocks="blocks"
      :connections="connections"
      @connection-click="lastEvent = `connection-click: ${$event.id}`"
      @connection-mouseenter="lastEvent = `connection-mouseenter: ${$event.id}`"
      @block-dragstart="lastEvent = `block-dragstart: ${$event.blockId}`"
      @block-drag="lastEvent = `block-drag: ${$event.blockId} (${$event.x}, ${$event.y})`"
      @block-dragend="lastEvent = `block-dragend: ${$event.blockId}`"
    >
      <template v-for="id in simpleBlocks" :key="id" #[`block-${id}`]>
        <div class="card">{{ label(id) }}</div>
      </template>

      <template #block-b13>
        <div ref="groupRef" class="card group">
          <div ref="groupTitleRef" class="group-title">Block 13 (drag handle)</div>
          <div ref="row14Ref" class="sub">Block 14</div>
          <div ref="row15Ref" class="sub">Block 15</div>
          <div ref="row16Ref" class="sub">Block 16</div>
        </div>
      </template>
    </VisualLinker>
  </main>
</template>
