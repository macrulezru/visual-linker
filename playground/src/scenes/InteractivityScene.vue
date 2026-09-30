<script setup lang="ts">
import { ref } from 'vue'
import { VisualLinker, VLMarkerShapeEnum, type ConnectionDescriptor } from '@macrulez/visual-linker-vue'
import EventLog from '../components/EventLog.vue'

const lastEvent = ref('—')

const nodes = [
  { id: 'hub', label: 'Hub', top: 180, left: 340, hub: true },
  { id: 'a', label: 'A', top: 24, left: 48 },
  { id: 'b', label: 'B', top: 180, left: 48 },
  { id: 'c', label: 'C', top: 336, left: 48 },
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
        :connections="connections"
        :options="{ draggable: true, dragGridSize: 24, dragBounds: 'container' }"
        @connection-click="lastEvent = `connection-click: ${$event.id}`"
        @connection-mouseenter="lastEvent = `connection-mouseenter: ${$event.id}`"
        @block-dragstart="lastEvent = `block-dragstart: ${$event.blockId}`"
        @block-drag="lastEvent = `block-drag: ${$event.blockId} (${$event.x}, ${$event.y})`"
        @block-dragend="lastEvent = `block-dragend: ${$event.blockId}`"
      >
        <div
          v-for="node in nodes"
          :key="node.id"
          v-vl-block="node.id"
          class="card node"
          :class="{ 'card--hub': node.hub }"
          :style="{ top: `${node.top}px`, left: `${node.left}px` }"
        >
          {{ node.label }}
        </div>
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

.canvas :deep(.vl-container) {
  height: 100%;
}

.node {
  position: absolute;
  width: 120px;
  height: 60px;
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
</style>
