<script setup lang="ts">
import {
  VisualLinker,
  VLConnectionCurveEnum,
  VLMarkerShapeEnum,
  type ConnectionDescriptor,
  type VisualLinkerOptions,
} from '@macrulez/visual-linker-vue'

// Every mini-demo below is draggable, confined to its own small canvas —
// 'container' resolves to the <VisualLinker>'s own root element, i.e. exactly
// the `.canvas` card each one renders into.
const dragOptions: VisualLinkerOptions = { draggable: true, dragBounds: 'container' }

const diagonalBlocks = [{ id: 'a' }, { id: 'b' }]

const bezierDefault: ConnectionDescriptor[] = [
  {
    id: 'c',
    from: { blockId: 'a' },
    to: { blockId: 'b' },
    style: { curve: VLConnectionCurveEnum.BEZIER, endMarker: VLMarkerShapeEnum.ARROW },
  },
]
const bezierWide: ConnectionDescriptor[] = [
  {
    id: 'c',
    from: { blockId: 'a' },
    to: { blockId: 'b' },
    style: {
      curve: VLConnectionCurveEnum.BEZIER,
      curvature: 0.75,
      curveMaxReach: 260,
      endMarker: VLMarkerShapeEnum.ARROW,
    },
  },
]
const straightConnections: ConnectionDescriptor[] = [
  {
    id: 'c',
    from: { blockId: 'a' },
    to: { blockId: 'b' },
    style: { curve: VLConnectionCurveEnum.STRAIGHT, endMarker: VLMarkerShapeEnum.ARROW },
  },
]
const smoothstepSolo: ConnectionDescriptor[] = [
  {
    id: 'c',
    from: { blockId: 'a' },
    to: { blockId: 'b' },
    style: { curve: VLConnectionCurveEnum.SMOOTHSTEP, endMarker: VLMarkerShapeEnum.ARROW },
  },
]

const fanoutBlocks = [{ id: 'src', ports: [{ id: 'out' }] }, { id: 't1' }, { id: 't2' }]
const fanoutConnections: ConnectionDescriptor[] = [
  {
    id: 'c1',
    from: { blockId: 'src', portId: 'out' },
    to: { blockId: 't1' },
    style: { curve: VLConnectionCurveEnum.SMOOTHSTEP, endMarker: VLMarkerShapeEnum.ARROW },
  },
  {
    id: 'c2',
    from: { blockId: 'src', portId: 'out' },
    to: { blockId: 't2' },
    style: { curve: VLConnectionCurveEnum.SMOOTHSTEP, endMarker: VLMarkerShapeEnum.ARROW },
  },
]
</script>

<template>
  <section class="scene">
    <p class="scene-intro">
      Three curve types, same block layout. <code>bezier</code> is the flexible default; <code>straight</code> is a
      plain line; <code>smoothstep</code> routes orthogonally and groups connections that share a port into one
      branching trunk.
    </p>

    <div class="grid">
      <div class="demo">
        <h3>bezier <span class="muted">(default)</span></h3>
        <p class="caption"><code>curvature: 0.5</code>, <code>curveMaxReach: 160</code></p>
        <div class="canvas">
          <VisualLinker :blocks="diagonalBlocks" :connections="bezierDefault" :options="dragOptions">
            <template #block-a><div class="card">A</div></template>
            <template #block-b><div class="card">B</div></template>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>bezier <span class="muted">(wider bow)</span></h3>
        <p class="caption"><code>curvature: 0.75</code>, <code>curveMaxReach: 260</code></p>
        <div class="canvas">
          <VisualLinker :blocks="diagonalBlocks" :connections="bezierWide" :options="dragOptions">
            <template #block-a><div class="card">A</div></template>
            <template #block-b><div class="card">B</div></template>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>straight</h3>
        <p class="caption">no control points at all</p>
        <div class="canvas">
          <VisualLinker :blocks="diagonalBlocks" :connections="straightConnections" :options="dragOptions">
            <template #block-a><div class="card">A</div></template>
            <template #block-b><div class="card">B</div></template>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>smoothstep <span class="muted">(solo)</span></h3>
        <p class="caption">orthogonal routing, rounded 90° bends (<code>cornerRadius</code>)</p>
        <div class="canvas">
          <VisualLinker :blocks="diagonalBlocks" :connections="smoothstepSolo" :options="dragOptions">
            <template #block-a><div class="card">A</div></template>
            <template #block-b><div class="card">B</div></template>
          </VisualLinker>
        </div>
      </div>

      <div class="demo demo--wide">
        <h3>smoothstep <span class="muted">(shared port)</span></h3>
        <p class="caption">
          two connections leaving the same port share one trunk, splitting at a computed branch point (<code
            >maxTrunkReach</code
          >
          caps how far it can stretch)
        </p>
        <div class="canvas canvas--fanout">
          <VisualLinker :blocks="fanoutBlocks" :connections="fanoutConnections" :options="dragOptions">
            <template #block-src><div class="card">Src</div></template>
            <template #block-t1><div class="card">T1</div></template>
            <template #block-t2><div class="card">T2</div></template>
          </VisualLinker>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.scene {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.demo {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.demo--wide {
  grid-column: span 2;
}

.demo h3 {
  font-size: 14px;
}

.muted {
  color: var(--color-text-faint);
  font-weight: 400;
}

.caption {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.caption code {
  font-family: var(--font-mono);
  background: var(--color-surface-alt);
  padding: 1px 5px;
  border-radius: 4px;
}

.canvas {
  position: relative;
  height: 220px;
}

:deep(.vl-container) {
  position: relative;
  height: 100%;
}

:deep(.vl-block) {
  position: absolute;
  width: 56px;
  height: 32px;
}

:deep(.vl-block:nth-child(1)) {
  top: 16px;
  left: 16px;
}
:deep(.vl-block:nth-child(2)) {
  bottom: 16px;
  right: 16px;
}

.canvas--fanout {
  height: 220px;
}

.canvas--fanout :deep(.vl-block:nth-child(1)) {
  top: 50%;
  left: 16px;
  transform: translateY(-50%);
}
.canvas--fanout :deep(.vl-block:nth-child(2)) {
  top: 16px;
  right: 16px;
  bottom: auto;
}
.canvas--fanout :deep(.vl-block:nth-child(3)) {
  bottom: 16px;
  right: 16px;
}
</style>
