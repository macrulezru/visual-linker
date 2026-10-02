<script setup lang="ts">
import {
  VisualLinker,
  VLMarkerShapeEnum,
  type ConnectionDescriptor,
  type VisualLinkerConfig,
} from '@macrulez/visual-linker-vue'

// Every mini-demo below is draggable, confined to its own small canvas.
const dragConfig: VisualLinkerConfig = { blocks: { draggable: true, drag: { bounds: 'container' } } }
const hoverConfig: VisualLinkerConfig = { ...dragConfig, interaction: { hover: true } }
const portSlotConfig: VisualLinkerConfig = { ...dragConfig, ports: { show: false } }

function single(style: ConnectionDescriptor['style']): ConnectionDescriptor[] {
  return [{ id: 'c', from: { blockId: 'a' }, to: { blockId: 'b' }, style }]
}

const shapeDemos = [
  { title: 'circle', connections: single({ markers: { end: VLMarkerShapeEnum.CIRCLE } }) },
  {
    title: 'square + outline',
    connections: single({
      markers: { end: { shape: VLMarkerShapeEnum.SQUARE, size: 10, strokeColor: '#fff', strokeWidth: 1.5 } },
    }),
  },
  { title: 'diamond', connections: single({ markers: { end: VLMarkerShapeEnum.DIAMOND } }) },
  { title: 'arrow', connections: single({ markers: { end: VLMarkerShapeEnum.ARROW } }) },
  {
    title: 'custom svg',
    connections: single({
      markers: { end: { svg: '<path d="M4,4 L16,10 L4,16 L8,10 Z" fill="#6d5bf6" />' } },
    }),
  },
]

const hoverConnections: ConnectionDescriptor[] = single({
  color: '#1c1e2b',
  width: 2,
  markers: { end: { shape: VLMarkerShapeEnum.ARROW, size: 6, hover: { size: 9 } } },
  hover: { color: '#6d5bf6', width: 4, dashed: true },
})

const bareEndConnections: ConnectionDescriptor[] = single({ markers: { end: false } })

const labelConnections: ConnectionDescriptor[] = single({ markers: { end: VLMarkerShapeEnum.ARROW } })

const portSlotConnections: ConnectionDescriptor[] = single({})

// Several labels per line, anywhere on it. Those with `text` are drawn by the
// library itself (no Vue needed); the one without is positioned for the slot.
const multiLabelConnections: ConnectionDescriptor[] = [
  {
    id: 'c',
    from: { blockId: 'a' },
    to: { blockId: 'b' },
    style: { markers: { end: VLMarkerShapeEnum.ARROW } },
    labels: [
      { id: 'from', position: 'start', text: 'POST' },
      { id: 'rate', position: 0.5, text: 'follows the line', rotate: true, offset: -14 },
      { id: 'status', position: 0.82, offset: 16 },
    ],
  },
]
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
          <VisualLinker :connections="demo.connections" :config="dragConfig">
            <div v-vl-block="'a'" class="card node tl">A</div>
            <div v-vl-block="'b'" class="card node br">B</div>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>hover states</h3>
        <p class="caption">hover the line — color, width, dashed and marker size all change together</p>
        <div class="canvas">
          <VisualLinker :connections="hoverConnections" :config="hoverConfig">
            <div v-vl-block="'a'" class="card node tl">A</div>
            <div v-vl-block="'b'" class="card node br">B</div>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>#marker slot</h3>
        <p class="caption"><code>markers: { end: false</code> leaves a bare point for this custom shape to fill</p>
        <div class="canvas">
          <VisualLinker :connections="bareEndConnections" :config="dragConfig">
            <div v-vl-block="'a'" class="card node tl">A</div>
            <div v-vl-block="'b'" class="card node br">B</div>
            <template #marker="{ position }">
              <span v-if="position === 'end'" class="custom-marker" />
            </template>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>#port slot</h3>
        <p class="caption">full replacement for the built-in dot (here: <code>ports.show: false</code>)</p>
        <div class="canvas">
          <VisualLinker :connections="portSlotConnections" :config="portSlotConfig">
            <div v-vl-block="'a'" class="card node tl">A</div>
            <div v-vl-block="'b'" class="card node br">B</div>
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
          <VisualLinker :connections="labelConnections" :config="dragConfig">
            <div v-vl-block="'a'" class="card node tl">A</div>
            <div v-vl-block="'b'" class="card node br">B</div>
            <template #connection-label>
              <span class="connection-label">42ms</span>
            </template>
          </VisualLinker>
        </div>
      </div>

      <div class="demo demo--wide">
        <h3>labels</h3>
        <p class="caption">
          <code>labels: [{ position: 'start' | 'middle' | 'end' | 0..1, offset, rotate, text }]</code> — any number,
          anywhere on the line. With <code>text</code> the library draws them; without it the
          <code>#connection-label</code> slot is called once per label.
        </p>
        <div class="canvas">
          <VisualLinker :connections="multiLabelConnections" :config="dragConfig">
            <div v-vl-block="'a'" class="card node tl">A</div>
            <div v-vl-block="'b'" class="card node br">B</div>
            <template #connection-label>
              <span class="connection-label">200 OK</span>
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

.demo--wide {
  grid-column: span 2;
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

.canvas :deep(.vl-container) {
  height: 100%;
}

.node {
  position: absolute;
  width: 52px;
  height: 30px;
}
.tl {
  top: 16px;
  left: 16px;
}
.br {
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
}
