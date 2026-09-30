<script setup lang="ts">
import {
  VisualLinker,
  VLConnectionCurveEnum,
  VLFixedSideEnum,
  VLMarkerShapeEnum,
  type ConnectionDescriptor,
  type VisualLinkerOptions,
} from '@macrulez/visual-linker-vue'

// Every mini-demo below is draggable, confined to its own small canvas.
const dragOptions: VisualLinkerOptions = { draggable: true, dragBounds: 'container' }

// The target sits directly ABOVE the source in both side demos: full auto
// would exit through 'top', but the restricted port never considers it.
const restrictedSides = [VLFixedSideEnum.LEFT, VLFixedSideEnum.RIGHT]
const autoConnections: ConnectionDescriptor[] = [
  { id: 'c', from: { blockId: 'source' }, to: { blockId: 'target' }, style: { endMarker: VLMarkerShapeEnum.ARROW } },
]
const restrictedConnections: ConnectionDescriptor[] = [
  {
    id: 'c',
    from: { blockId: 'source', portId: 'out' },
    to: { blockId: 'target' },
    style: { endMarker: VLMarkerShapeEnum.ARROW },
  },
]

const anchorConnections: ConnectionDescriptor[] = [
  {
    id: 'c1',
    from: { blockId: 'group', portId: 'r1' },
    to: { blockId: 't1' },
    style: { endMarker: VLMarkerShapeEnum.ARROW },
  },
  {
    id: 'c2',
    from: { blockId: 'group', portId: 'r2' },
    to: { blockId: 't2' },
    style: { endMarker: VLMarkerShapeEnum.ARROW },
  },
]

// --- maxTrunkReach: two targets tied in the same column ---
function trunkConnections(maxTrunkReach: number): ConnectionDescriptor[] {
  const style = {
    curve: VLConnectionCurveEnum.SMOOTHSTEP,
    cornerRadius: 6,
    maxTrunkReach,
    endMarker: VLMarkerShapeEnum.ARROW,
  }
  return [
    { id: 'c1', from: { blockId: 'source', portId: 'out' }, to: { blockId: 'top' }, style },
    { id: 'c2', from: { blockId: 'source', portId: 'out' }, to: { blockId: 'bottom' }, style },
  ]
}
</script>

<template>
  <section class="scene">
    <p class="scene-intro">How a connector picks — and sometimes shares — its exit point on a block's border.</p>

    <div class="grid">
      <div class="demo">
        <h3>side: 'auto'</h3>
        <p class="caption">picks whichever side faces the target — here, straight up</p>
        <div class="canvas">
          <VisualLinker :connections="autoConnections" :options="dragOptions">
            <div v-vl-block="'target'" class="card node v-top">Target</div>
            <div v-vl-block="'source'" class="card node v-bottom">Src</div>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>side: ['left', 'right']</h3>
        <p class="caption">same layout, but the candidate list rules out top/bottom entirely</p>
        <div class="canvas">
          <VisualLinker :connections="restrictedConnections" :options="dragOptions">
            <div v-vl-block="'target'" class="card node v-top">Target</div>
            <div v-vl-block="'source'" v-vl-port="{ id: 'out', side: restrictedSides }" class="card node v-bottom">
              Src
            </div>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>anchor on the group</h3>
        <p class="caption">
          plain <code>data-vl-*</code> attributes: both rows' connectors sit on the group's own edge, not their own
          indented one
        </p>
        <div class="canvas">
          <VisualLinker :connections="anchorConnections" :options="dragOptions">
            <div data-vl-block="group" class="card group left-mid">
              <div data-vl-port="r1" data-vl-side="right" data-vl-anchor="group" class="sub">Row 1</div>
              <div data-vl-port="r2" data-vl-side="right" data-vl-anchor="group" class="sub">Row 2</div>
            </div>
            <div data-vl-block="t1" class="card node tr">T1</div>
            <div data-vl-block="t2" class="card node br">T2</div>
          </VisualLinker>
        </div>
      </div>

      <div v-for="reach in [160, 24]" :key="reach" class="demo">
        <h3>maxTrunkReach: {{ reach }}</h3>
        <p class="caption">
          {{
            reach > 100
              ? 'two same-column targets — trunk stretches almost all the way to them'
              : 'same layout, capped — the fan-out stays short and distinct'
          }}
        </p>
        <div class="canvas">
          <VisualLinker :connections="trunkConnections(reach)" :options="dragOptions">
            <div v-vl-block="'source'" v-vl-port="'out'" class="card node left-mid">Src</div>
            <div v-vl-block="'top'" class="card node tr">Top</div>
            <div v-vl-block="'bottom'" class="card node br">Bottom</div>
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

.canvas {
  position: relative;
  height: 220px;
}

.canvas :deep(.vl-container) {
  height: 100%;
}

.caption code {
  font-family: var(--font-mono);
  background: var(--color-surface-alt);
  padding: 1px 5px;
  border-radius: 4px;
}

.node {
  position: absolute;
  width: 56px;
  height: 30px;
}
.tr {
  top: 16px;
  right: 16px;
}
.br {
  bottom: 16px;
  right: 16px;
}
.left-mid {
  position: absolute;
  top: 50%;
  left: 16px;
  transform: translateY(-50%);
}
.v-top,
.v-bottom {
  width: 64px;
  left: 50%;
  transform: translateX(-50%);
}
.v-top {
  top: 16px;
}
.v-bottom {
  bottom: 16px;
}

.card.group {
  width: 96px;
  height: 84px;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 8px;
  padding: 8px;
  background: var(--color-surface-alt);
}

.sub {
  background: var(--color-accent-soft);
  border-radius: var(--radius-sm);
  padding: 4px;
  font-size: 11px;
  text-align: center;
  color: var(--color-accent-dark);
}
</style>
