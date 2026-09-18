<script setup lang="ts">
import { ref } from 'vue'
import {
  VisualLinker,
  VLMarkerShapeEnum,
  type ConnectionDescriptor,
  type VisualLinkerBlock,
} from '@macrulez/visual-linker-vue'
import EventLog from '../components/EventLog.vue'

const lastEvent = ref('—')

const blocks: VisualLinkerBlock[] = [
  { id: 'hub', draggable: true },
  { id: 'a', draggable: true },
  { id: 'b', draggable: true },
  { id: 'c', draggable: true },
]

const connections: ConnectionDescriptor[] = [
  { id: 'ha', from: { blockId: 'hub' }, to: { blockId: 'a' }, style: { endMarker: VLMarkerShapeEnum.ARROW } },
  { id: 'hb', from: { blockId: 'hub' }, to: { blockId: 'b' }, style: { endMarker: VLMarkerShapeEnum.ARROW } },
  { id: 'hc', from: { blockId: 'hub' }, to: { blockId: 'c' }, style: { endMarker: VLMarkerShapeEnum.ARROW } },
]
</script>

<template>
  <section class="scene">
    <p class="scene-intro">
      Drag any block — movement snaps to a 24px grid (<code>dragGridSize</code>), connections redraw every frame, and
      hovering a block highlights its incident connections. Click a line to log a
      <code>connection:click</code>.
    </p>
    <EventLog :event="lastEvent" />

    <div class="canvas">
      <VisualLinker
        :blocks="blocks"
        :connections="connections"
        :options="{ draggable: true, dragGridSize: 24, dragBounds: 'container' }"
        @connection-click="lastEvent = `connection-click: ${$event.id}`"
        @connection-mouseenter="lastEvent = `connection-mouseenter: ${$event.id}`"
        @block-dragstart="lastEvent = `block-dragstart: ${$event.blockId}`"
        @block-drag="lastEvent = `block-drag: ${$event.blockId} (${$event.x}, ${$event.y})`"
        @block-dragend="lastEvent = `block-dragend: ${$event.blockId}`"
      >
        <template #block-hub><div class="card card--hub">Hub</div></template>
        <template #block-a><div class="card">A</div></template>
        <template #block-b><div class="card">B</div></template>
        <template #block-c><div class="card">C</div></template>
      </VisualLinker>
    </div>
  </section>
</template>

<style scoped>
.scene {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.canvas {
  position: relative;
  height: 420px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background: var(--color-surface-alt);
  background-image:
    linear-gradient(rgba(28, 30, 43, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(28, 30, 43, 0.07) 1px, transparent 1px);
  background-size: 24px 24px;
  overflow: hidden;
}

:deep(.vl-container) {
  height: 100%;
  position: relative;
}

:deep(.vl-block) {
  position: absolute;
  width: 120px;
  height: 60px;
}
:deep(.vl-block:nth-child(1)) {
  top: 180px;
  left: 340px;
}
:deep(.vl-block:nth-child(2)) {
  top: 24px;
  left: 48px;
}
:deep(.vl-block:nth-child(3)) {
  top: 180px;
  left: 48px;
}
:deep(.vl-block:nth-child(4)) {
  top: 336px;
  left: 48px;
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

:deep(.vl-draggable) {
  cursor: grab;
}
:deep(.vl-dragging) {
  cursor: grabbing;
}
</style>
