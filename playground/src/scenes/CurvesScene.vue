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

// Same layout twice: a block sits between the endpoints. Drag it (or the others)
// — with avoidObstacles the line re-routes around it live.
const obstacleConnections = (avoidObstacles: boolean): ConnectionDescriptor[] => [
  {
    id: 'c',
    from: { blockId: 'src' },
    to: { blockId: 'dst' },
    style: { curve: VLConnectionCurveEnum.SMOOTHSTEP, endMarker: VLMarkerShapeEnum.ARROW, avoidObstacles },
  },
]

// Two lines crossing: with `jumps` the horizontal one hops over the vertical one.
const crossingConnections = (jumps: boolean): ConnectionDescriptor[] => [
  {
    id: 'h',
    from: { blockId: 'a' },
    to: { blockId: 'b' },
    style: { curve: VLConnectionCurveEnum.SMOOTHSTEP, endMarker: VLMarkerShapeEnum.ARROW, jumps },
  },
  {
    id: 'v',
    from: { blockId: 'c' },
    to: { blockId: 'd' },
    // Both lines opt in: whichever one ends up horizontal after you drag the blocks is the one that hops.
    style: { curve: VLConnectionCurveEnum.SMOOTHSTEP, endMarker: VLMarkerShapeEnum.ARROW, color: '#6d5bf6', jumps },
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

      <div v-for="avoid in [false, true]" :key="String(avoid)" class="demo demo--wide">
        <h3>
          smoothstep <span class="muted">(avoidObstacles: {{ avoid }})</span>
        </h3>
        <p class="caption">
          {{
            avoid
              ? 'routed around the block in the way — drag any block and the line re-routes, still with the fewest turns'
              : 'the default: the line runs straight through whatever is in between'
          }}
        </p>
        <div class="canvas canvas--tall">
          <VisualLinker :connections="obstacleConnections(avoid)" :options="dragOptions">
            <div v-vl-block="'src'" class="card node o-src">Src</div>
            <div v-vl-block="'blocker'" class="card node o-blocker">In the way</div>
            <div v-vl-block="'dst'" class="card node o-dst">Dst</div>
          </VisualLinker>
        </div>
      </div>

      <div v-for="jumps in [false, true]" :key="String(jumps)" class="demo demo--wide">
        <h3>
          smoothstep <span class="muted">(jumps: {{ jumps }})</span>
        </h3>
        <p class="caption">
          {{
            jumps
              ? 'the horizontal line hops over the vertical one, like on a schematic — drag blocks to swap them: whichever line is horizontal hops'
              : 'the default: crossing lines simply pass through each other'
          }}
        </p>
        <div class="canvas canvas--tall">
          <VisualLinker :connections="crossingConnections(jumps)" :options="dragOptions">
            <div v-vl-block="'a'" class="card node x-a">A</div>
            <div v-vl-block="'b'" class="card node x-b">B</div>
            <div v-vl-block="'c'" class="card node x-c">C</div>
            <div v-vl-block="'d'" class="card node x-d">D</div>
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
.canvas--tall {
  height: 220px;
}
.o-src {
  top: 94px;
  left: 16px;
}
.o-blocker {
  top: 72px;
  left: 50%;
  transform: translateX(-50%);
  width: 100px;
  height: 76px;
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
}
.o-dst {
  top: 94px;
  right: 16px;
}

.x-a {
  top: 94px;
  left: 16px;
}
.x-b {
  top: 94px;
  right: 16px;
}
.x-c {
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
}
.x-d {
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
}

.left-mid {
  top: 50%;
  left: 16px;
  transform: translateY(-50%);
}
</style>
