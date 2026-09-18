<script setup lang="ts">
import { ref } from 'vue'
import {
  VisualLinker,
  VLConnectionCurveEnum,
  VLFixedSideEnum,
  VLMarkerShapeEnum,
  type ConnectionDescriptor,
  type VisualLinkerBlock,
  type VisualLinkerOptions,
} from '@macrulez/visual-linker-vue'

// Every mini-demo below is draggable, confined to its own small canvas.
const dragOptions: VisualLinkerOptions = { draggable: true, dragBounds: 'container' }

// --- side: 'auto' vs a restricted candidate list ---
// The target sits directly ABOVE the source in both mini-canvases: full auto
// would exit through 'top', but the restricted port never considers it.
const autoBlocks: VisualLinkerBlock[] = [{ id: 'target' }, { id: 'source' }]
const autoConnections: ConnectionDescriptor[] = [
  { id: 'c', from: { blockId: 'source' }, to: { blockId: 'target' }, style: { endMarker: VLMarkerShapeEnum.ARROW } },
]
const restrictedBlocks: VisualLinkerBlock[] = [
  { id: 'target' },
  { id: 'source', ports: [{ id: 'out', side: [VLFixedSideEnum.LEFT, VLFixedSideEnum.RIGHT] }] },
]
const restrictedConnections: ConnectionDescriptor[] = [
  {
    id: 'c',
    from: { blockId: 'source', portId: 'out' },
    to: { blockId: 'target' },
    style: { endMarker: VLMarkerShapeEnum.ARROW },
  },
]

// --- anchorEl: connector sits on the group's own border, not each row's own ---
const groupRef = ref<HTMLElement | null>(null)
const row1Ref = ref<HTMLElement | null>(null)
const row2Ref = ref<HTMLElement | null>(null)
const anchorBlocks = [
  {
    id: 'group',
    ports: [
      { id: 'r1', target: row1Ref, side: VLFixedSideEnum.RIGHT, anchorEl: groupRef },
      { id: 'r2', target: row2Ref, side: VLFixedSideEnum.RIGHT, anchorEl: groupRef },
    ],
  },
  { id: 't1' },
  { id: 't2' },
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
const trunkBlocks = [{ id: 'source', ports: [{ id: 'out' }] }, { id: 'top' }, { id: 'bottom' }]
function trunkConnections(maxTrunkReach: number): ConnectionDescriptor[] {
  return [
    {
      id: 'c1',
      from: { blockId: 'source', portId: 'out' },
      to: { blockId: 'top' },
      style: {
        curve: VLConnectionCurveEnum.SMOOTHSTEP,
        cornerRadius: 6,
        maxTrunkReach,
        endMarker: VLMarkerShapeEnum.ARROW,
      },
    },
    {
      id: 'c2',
      from: { blockId: 'source', portId: 'out' },
      to: { blockId: 'bottom' },
      style: {
        curve: VLConnectionCurveEnum.SMOOTHSTEP,
        cornerRadius: 6,
        maxTrunkReach,
        endMarker: VLMarkerShapeEnum.ARROW,
      },
    },
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
        <div class="canvas canvas--vertical">
          <VisualLinker :blocks="autoBlocks" :connections="autoConnections" :options="dragOptions">
            <template #block-target><div class="card">Target</div></template>
            <template #block-source><div class="card">Src</div></template>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>side: ['left', 'right']</h3>
        <p class="caption">same layout, but the candidate list rules out top/bottom entirely</p>
        <div class="canvas canvas--vertical">
          <VisualLinker :blocks="restrictedBlocks" :connections="restrictedConnections" :options="dragOptions">
            <template #block-target><div class="card">Target</div></template>
            <template #block-source><div class="card">Src</div></template>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>anchorEl</h3>
        <p class="caption">both rows' connectors sit on the group's own edge, not their own indented one</p>
        <div class="canvas canvas--anchor">
          <VisualLinker :blocks="anchorBlocks" :connections="anchorConnections" :options="dragOptions">
            <template #block-group>
              <div ref="groupRef" class="card group">
                <div ref="row1Ref" class="sub">Row 1</div>
                <div ref="row2Ref" class="sub">Row 2</div>
              </div>
            </template>
            <template #block-t1><div class="card">T1</div></template>
            <template #block-t2><div class="card">T2</div></template>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>maxTrunkReach: 160</h3>
        <p class="caption">two same-column targets — trunk stretches almost all the way to them</p>
        <div class="canvas">
          <VisualLinker :blocks="trunkBlocks" :connections="trunkConnections(160)" :options="dragOptions">
            <template #block-source><div class="card">Src</div></template>
            <template #block-top><div class="card">Top</div></template>
            <template #block-bottom><div class="card">Bottom</div></template>
          </VisualLinker>
        </div>
      </div>

      <div class="demo">
        <h3>maxTrunkReach: 24</h3>
        <p class="caption">same layout, capped — the fan-out stays short and distinct</p>
        <div class="canvas">
          <VisualLinker :blocks="trunkBlocks" :connections="trunkConnections(24)" :options="dragOptions">
            <template #block-source><div class="card">Src</div></template>
            <template #block-top><div class="card">Top</div></template>
            <template #block-bottom><div class="card">Bottom</div></template>
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

:deep(.vl-container) {
  position: relative;
  height: 100%;
}

:deep(.vl-block) {
  position: absolute;
  width: 56px;
  height: 30px;
}

:deep(.vl-block:nth-child(1)) {
  top: 50%;
  left: 16px;
  transform: translateY(-50%);
}
:deep(.vl-block:nth-child(2)) {
  top: 16px;
  right: 16px;
}
:deep(.vl-block:nth-child(3)) {
  bottom: 16px;
  right: 16px;
}

.canvas--vertical :deep(.vl-block) {
  left: 50%;
  transform: translateX(-50%);
  width: 64px;
}
.canvas--vertical :deep(.vl-block:nth-child(1)) {
  top: 16px;
}
.canvas--vertical :deep(.vl-block:nth-child(2)) {
  top: auto;
  bottom: 16px;
}

.canvas--anchor :deep(.vl-block:nth-child(1)) {
  width: 96px;
  height: 84px;
  top: 50%;
  left: 16px;
  transform: translateY(-50%);
}

.card.group {
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
