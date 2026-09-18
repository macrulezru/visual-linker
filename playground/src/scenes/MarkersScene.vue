<script setup lang="ts">
import {
  VisualLinker,
  VLMarkerShapeEnum,
  type ConnectionDescriptor,
  type VisualLinkerOptions,
} from '@macrulez/visual-linker-vue'

// Every mini-demo below is draggable, confined to its own small canvas.
const dragOptions: VisualLinkerOptions = { draggable: true, dragBounds: 'container' }
const portSlotOptions: VisualLinkerOptions = { ...dragOptions, showPorts: false }

const pair = [{ id: 'a' }, { id: 'b' }]

function single(style: ConnectionDescriptor['style']): ConnectionDescriptor[] {
  return [{ id: 'c', from: { blockId: 'a' }, to: { blockId: 'b' }, style }]
}

const shapeDemos = [
  { title: 'circle', connections: single({ endMarker: VLMarkerShapeEnum.CIRCLE }) },
  {
    title: 'square + outline',
    connections: single({
      endMarker: { shape: VLMarkerShapeEnum.SQUARE, size: 10, strokeColor: '#fff', strokeWidth: 1.5 },
    }),
  },
  { title: 'diamond', connections: single({ endMarker: VLMarkerShapeEnum.DIAMOND }) },
  { title: 'arrow', connections: single({ endMarker: VLMarkerShapeEnum.ARROW }) },
  {
    title: 'custom svg',
    connections: single({
      endMarker: { svg: '<path d="M4,4 L16,10 L4,16 L8,10 Z" fill="#6d5bf6" />' },
    }),
  },
]

const hoverConnections: ConnectionDescriptor[] = single({
  color: '#1c1e2b',
  width: 2,
  endMarker: { shape: VLMarkerShapeEnum.ARROW, size: 6 },
  hoverStyle: { color: '#6d5bf6', width: 4, dashed: true, markerSize: 9 },
})

const bareEndConnections: ConnectionDescriptor[] = single({ endMarker: false })

const labelConnections: ConnectionDescriptor[] = single({ endMarker: VLMarkerShapeEnum.ARROW })

const portSlotBlocks = pair
const portSlotConnections: ConnectionDescriptor[] = single({})
</script>

<template>
  <section class="scene">
    <p class="scene-intro">
      Every built-in marker shape, plus the three overlay slots (<code>#marker</code>, <code>#port</code>,
      <code>#connection-label</code>) that hand full rendering control to your own Vue components.
    </p>

    <div class="grid">
      <div v-for="demo in shapeDemos" :key="demo.title" class="demo">
        <h3>{{ demo.title }}</h3>
        <div class="canvas">
          <VisualLinker :blocks="pair" :connections="demo.connections" :options="dragOptions">
            <template #block-a><div class="card">A</div></template>
            <template #block-b><div class="card">B</div></template>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>hoverStyle</h3>
        <p class="caption">hover the line — color, width, dashed and marker size all change together</p>
        <div class="canvas">
          <VisualLinker :blocks="pair" :connections="hoverConnections" :options="dragOptions">
            <template #block-a><div class="card">A</div></template>
            <template #block-b><div class="card">B</div></template>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>#marker slot</h3>
        <p class="caption"><code>endMarker: false</code> leaves a bare point for this custom shape to fill</p>
        <div class="canvas">
          <VisualLinker :blocks="pair" :connections="bareEndConnections" :options="dragOptions">
            <template #block-a><div class="card">A</div></template>
            <template #block-b><div class="card">B</div></template>
            <template #marker="{ position }">
              <span v-if="position === 'end'" class="custom-marker" />
            </template>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>#port slot</h3>
        <p class="caption">full replacement for the built-in dot (here: <code>showPorts: false</code>)</p>
        <div class="canvas">
          <VisualLinker :blocks="portSlotBlocks" :connections="portSlotConnections" :options="portSlotOptions">
            <template #block-a><div class="card">A</div></template>
            <template #block-b><div class="card">B</div></template>
            <template #port>
              <span class="custom-port" />
            </template>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>#connection-label slot</h3>
        <p class="caption">arbitrary HTML positioned at the curve's real (curve-aware) midpoint</p>
        <div class="canvas">
          <VisualLinker :blocks="pair" :connections="labelConnections" :options="dragOptions">
            <template #block-a><div class="card">A</div></template>
            <template #block-b><div class="card">B</div></template>
            <template #connection-label>
              <span class="connection-label">42ms</span>
            </template>
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
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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

.demo h3 {
  font-size: 14px;
  font-family: var(--font-mono);
  font-weight: 500;
}

.caption {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 8px;
  line-height: 1.4;
}

.caption code {
  font-family: var(--font-mono);
  background: var(--color-surface-alt);
  padding: 1px 5px;
  border-radius: 4px;
}

.canvas {
  position: relative;
  height: 180px;
}

:deep(.vl-container) {
  position: relative;
  height: 100%;
}

:deep(.vl-block) {
  position: absolute;
  width: 52px;
  height: 30px;
}
:deep(.vl-block:nth-child(1)) {
  top: 16px;
  left: 16px;
}
:deep(.vl-block:nth-child(2)) {
  bottom: 16px;
  right: 16px;
}

:deep(.custom-marker) {
  display: block;
  width: 0;
  height: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 10px solid #8e44ad;
}

:deep(.custom-port) {
  display: block;
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: #e8a33d;
  transform: rotate(45deg);
}

:deep(.connection-label) {
  background: var(--color-accent);
  color: #fff;
  font-size: 11px;
  font-family: var(--font-mono);
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
  box-shadow: var(--shadow-sm);
}
</style>
