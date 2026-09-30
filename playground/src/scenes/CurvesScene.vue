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
          <VisualLinker :connections="bezierDefault" :options="dragOptions">
            <div v-vl-block="'a'" class="card node tl">A</div>
            <div v-vl-block="'b'" class="card node br">B</div>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>bezier <span class="muted">(wider bow)</span></h3>
        <p class="caption"><code>curvature: 0.75</code>, <code>curveMaxReach: 260</code></p>
        <div class="canvas">
          <VisualLinker :connections="bezierWide" :options="dragOptions">
            <div v-vl-block="'a'" class="card node tl">A</div>
            <div v-vl-block="'b'" class="card node br">B</div>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>straight</h3>
        <p class="caption">no control points at all</p>
        <div class="canvas">
          <VisualLinker :connections="straightConnections" :options="dragOptions">
            <div v-vl-block="'a'" class="card node tl">A</div>
            <div v-vl-block="'b'" class="card node br">B</div>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>smoothstep <span class="muted">(solo)</span></h3>
        <p class="caption">orthogonal routing, rounded 90° bends (<code>cornerRadius</code>)</p>
        <div class="canvas">
          <VisualLinker :connections="smoothstepSolo" :options="dragOptions">
            <div v-vl-block="'a'" class="card node tl">A</div>
            <div v-vl-block="'b'" class="card node br">B</div>
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
          <VisualLinker :connections="fanoutConnections" :options="dragOptions">
            <div v-vl-block="'src'" v-vl-port="'out'" class="card node left-mid">Src</div>
            <div v-vl-block="'t1'" class="card node tr">T1</div>
            <div v-vl-block="'t2'" class="card node br">T2</div>
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

.canvas :deep(.vl-container) {
  height: 100%;
}

.node {
  position: absolute;
  width: 56px;
  height: 32px;
}
.tl {
  top: 16px;
  left: 16px;
}
.tr {
  top: 16px;
  right: 16px;
}
.br {
  bottom: 16px;
  right: 16px;
}
/* Its own transform composes with the drag offset, which uses `translate`. */
.left-mid {
  top: 50%;
  left: 16px;
  transform: translateY(-50%);
}
</style>
