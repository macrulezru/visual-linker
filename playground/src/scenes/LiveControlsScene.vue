<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  VisualLinker,
  VLConnectionCurveEnum,
  VLMarkerShapeEnum,
  type ConnectionDescriptor,
  type MarkerConfig,
  type VisualLinkerBlock,
  type VisualLinkerOptions,
} from '@macrulez/visual-linker-vue'

// Draggable, confined to the canvas — 'container' resolves to this
// <VisualLinker>'s own root element.
const linkerOptions: VisualLinkerOptions = { draggable: true, dragBounds: 'container' }

const blocks: VisualLinkerBlock[] = [{ id: 'top' }, { id: 'b1' }, { id: 'b2' }, { id: 'b3' }]
const targets = ['b1', 'b2', 'b3']

// --- curve ---
const curve = ref<VLConnectionCurveEnum>(VLConnectionCurveEnum.BEZIER)
const curvature = ref(0.5)
const curveMinReach = ref(24)
const curveMaxReach = ref(160)
const curveAngleBlend = ref(0.55)
const curveAngleMaxOffset = ref(30)
const cornerRadius = ref(8)

// --- line ---
const lineColor = ref('#1c1e2b')
const lineWidth = ref(2)
const dashed = ref(false)

// --- markers ---
type ShapeChoice = 'none' | VLMarkerShapeEnum
const startShape = ref<ShapeChoice>('none')
const startColor = ref('#1c1e2b')
const startSize = ref(6)
const startStrokeColor = ref('')
const startStrokeWidth = ref(1)

const endShape = ref<ShapeChoice>(VLMarkerShapeEnum.ARROW)
const endColor = ref('#1c1e2b')
const endSize = ref(6)
const endStrokeColor = ref('')
const endStrokeWidth = ref(1)

function markerConfig(
  shape: ShapeChoice,
  color: string,
  size: number,
  strokeColor: string,
  strokeWidth: number,
): MarkerConfig | false | undefined {
  if (shape === 'none') return false
  return { shape, color, size, strokeColor: strokeColor || undefined, strokeWidth }
}

// --- hover ---
const hoverEnabled = ref(true)
const hoverColor = ref('#6d5bf6')
const hoverWidth = ref(4)
const hoverDashed = ref(false)
const hoverMarkerSize = ref(12)

// --- label ---
const labelEnabled = ref(true)
const labelText = ref('payload')

const connections = computed<ConnectionDescriptor[]>(() => {
  const style: ConnectionDescriptor['style'] = {
    curve: curve.value,
    color: lineColor.value,
    width: lineWidth.value,
    dashed: dashed.value,
    ...(curve.value === VLConnectionCurveEnum.BEZIER
      ? {
          curvature: curvature.value,
          curveMinReach: curveMinReach.value,
          curveMaxReach: curveMaxReach.value,
          curveAngleBlend: curveAngleBlend.value,
          curveAngleMaxOffset: curveAngleMaxOffset.value,
        }
      : {}),
    ...(curve.value === VLConnectionCurveEnum.SMOOTHSTEP ? { cornerRadius: cornerRadius.value } : {}),
    startMarker: markerConfig(
      startShape.value,
      startColor.value,
      startSize.value,
      startStrokeColor.value,
      startStrokeWidth.value,
    ),
    endMarker: markerConfig(endShape.value, endColor.value, endSize.value, endStrokeColor.value, endStrokeWidth.value),
    hoverStyle: hoverEnabled.value
      ? {
          color: hoverColor.value,
          width: hoverWidth.value,
          dashed: hoverDashed.value,
          markerSize: hoverMarkerSize.value,
        }
      : undefined,
  }
  return targets.map((targetId) => ({
    id: `top-${targetId}`,
    from: { blockId: 'top' },
    to: { blockId: targetId },
    style,
  }))
})

// A read-only pretty-printed preview of exactly what gets sent to the engine.
const stylePreview = computed(() => JSON.stringify(connections.value[0]!.style, null, 2))

// "Simulate hover" — the public component API has no way to force the active
// state programmatically (by design: that state lives inside the core engine,
// not exposed for a demo to poke at), so this dispatches a real PointerEvent
// at the connection's own invisible hit-area — exactly what a mouse hover
// would do, just triggered from a button for connections too thin to aim at.
const canvasRef = ref<HTMLElement | null>(null)
const hoverPreviewOn = ref(false)
function toggleHoverPreview() {
  const hits = canvasRef.value?.querySelectorAll<HTMLElement>('.vl-connection-hit')
  if (!hits?.length) return
  hoverPreviewOn.value = !hoverPreviewOn.value
  const type = hoverPreviewOn.value ? 'pointerenter' : 'pointerleave'
  for (const hit of hits) {
    hit.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1 }))
  }
}

const shapeOptions: { value: ShapeChoice; label: string }[] = [
  { value: 'none', label: 'none' },
  { value: VLMarkerShapeEnum.CIRCLE, label: 'circle' },
  { value: VLMarkerShapeEnum.SQUARE, label: 'square' },
  { value: VLMarkerShapeEnum.DIAMOND, label: 'diamond' },
  { value: VLMarkerShapeEnum.ARROW, label: 'arrow' },
]
</script>

<template>
  <section class="scene">
    <p class="scene-intro">
      Every field below writes straight into a live <code>ConnectionStyle</code> object — nothing is hardcoded per
      control. Watch the diagram (and the code preview) update as you change something.
    </p>

    <div class="layout">
      <div ref="canvasRef" class="canvas">
        <VisualLinker :blocks="blocks" :connections="connections" :options="linkerOptions">
          <template #block-top><div class="card card--top">Top</div></template>
          <template #block-b1><div class="card">B1</div></template>
          <template #block-b2><div class="card">B2</div></template>
          <template #block-b3><div class="card">B3</div></template>
          <template #connection-label>
            <span v-if="labelEnabled && labelText" class="connection-label">{{ labelText }}</span>
          </template>
        </VisualLinker>
      </div>

      <div class="panels">
        <div class="panel">
          <p class="panel-title">Curve</p>
          <div class="field">
            <label>Type</label>
            <select v-model="curve">
              <option :value="VLConnectionCurveEnum.BEZIER">bezier</option>
              <option :value="VLConnectionCurveEnum.STRAIGHT">straight</option>
              <option :value="VLConnectionCurveEnum.SMOOTHSTEP">smoothstep</option>
            </select>
          </div>

          <template v-if="curve === VLConnectionCurveEnum.BEZIER">
            <div class="field">
              <label
                >curvature <span class="value">{{ curvature.toFixed(2) }}</span></label
              >
              <input v-model.number="curvature" type="range" min="0" max="1" step="0.05" />
            </div>
            <div class="field">
              <label
                >curveMinReach <span class="value">{{ curveMinReach }}</span></label
              >
              <input v-model.number="curveMinReach" type="range" min="0" max="100" step="2" />
            </div>
            <div class="field">
              <label
                >curveMaxReach <span class="value">{{ curveMaxReach }}</span></label
              >
              <input v-model.number="curveMaxReach" type="range" min="40" max="320" step="4" />
            </div>
            <div class="field">
              <label
                >curveAngleBlend <span class="value">{{ curveAngleBlend.toFixed(2) }}</span></label
              >
              <input v-model.number="curveAngleBlend" type="range" min="0" max="1" step="0.05" />
            </div>
            <div class="field">
              <label
                >curveAngleMaxOffset <span class="value">{{ curveAngleMaxOffset }}°</span></label
              >
              <input v-model.number="curveAngleMaxOffset" type="range" min="0" max="60" step="1" />
            </div>
          </template>

          <div v-if="curve === VLConnectionCurveEnum.SMOOTHSTEP" class="field">
            <label
              >cornerRadius <span class="value">{{ cornerRadius }}</span></label
            >
            <input v-model.number="cornerRadius" type="range" min="0" max="24" step="1" />
          </div>
        </div>

        <div class="panel">
          <p class="panel-title">Line</p>
          <div class="field-row">
            <input v-model="lineColor" type="color" />
            <div class="field" style="flex: 1; margin-bottom: 0">
              <label
                >width <span class="value">{{ lineWidth }}</span></label
              >
              <input v-model.number="lineWidth" type="range" min="1" max="8" step="0.5" />
            </div>
          </div>
          <label class="field-row" style="margin-top: 10px; font-size: 12px; color: var(--color-text-muted)">
            <input v-model="dashed" type="checkbox" /> dashed
          </label>
        </div>

        <div class="panel">
          <p class="panel-title">Start marker</p>
          <div class="field">
            <label>shape</label>
            <select v-model="startShape">
              <option v-for="opt in shapeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
          <template v-if="startShape !== 'none'">
            <div class="field-row">
              <input v-model="startColor" type="color" />
              <div class="field" style="flex: 1; margin-bottom: 0">
                <label
                  >size <span class="value">{{ startSize }}</span></label
                >
                <input v-model.number="startSize" type="range" min="2" max="20" step="1" />
              </div>
            </div>
            <div class="field-row" style="margin-top: 10px">
              <input v-model="startStrokeColor" type="color" />
              <div class="field" style="flex: 1; margin-bottom: 0">
                <label
                  >strokeWidth <span class="value">{{ startStrokeWidth }}</span></label
                >
                <input v-model.number="startStrokeWidth" type="range" min="0" max="4" step="0.5" />
              </div>
            </div>
          </template>
        </div>

        <div class="panel">
          <p class="panel-title">End marker</p>
          <div class="field">
            <label>shape</label>
            <select v-model="endShape">
              <option v-for="opt in shapeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
          <template v-if="endShape !== 'none'">
            <div class="field-row">
              <input v-model="endColor" type="color" />
              <div class="field" style="flex: 1; margin-bottom: 0">
                <label
                  >size <span class="value">{{ endSize }}</span></label
                >
                <input v-model.number="endSize" type="range" min="2" max="20" step="1" />
              </div>
            </div>
            <div class="field-row" style="margin-top: 10px">
              <input v-model="endStrokeColor" type="color" />
              <div class="field" style="flex: 1; margin-bottom: 0">
                <label
                  >strokeWidth <span class="value">{{ endStrokeWidth }}</span></label
                >
                <input v-model.number="endStrokeWidth" type="range" min="0" max="4" step="0.5" />
              </div>
            </div>
          </template>
        </div>

        <div class="panel">
          <p class="panel-title">Hover style</p>
          <label class="field-row" style="margin-bottom: 12px; font-size: 12px; color: var(--color-text-muted)">
            <input v-model="hoverEnabled" type="checkbox" /> enabled
          </label>
          <template v-if="hoverEnabled">
            <div class="field-row">
              <input v-model="hoverColor" type="color" />
              <div class="field" style="flex: 1; margin-bottom: 0">
                <label
                  >width <span class="value">{{ hoverWidth }}</span></label
                >
                <input v-model.number="hoverWidth" type="range" min="1" max="10" step="0.5" />
              </div>
            </div>
            <div class="field" style="margin-top: 10px">
              <label
                >markerSize <span class="value">{{ hoverMarkerSize }}</span></label
              >
              <input v-model.number="hoverMarkerSize" type="range" min="2" max="24" step="1" />
            </div>
            <label class="field-row" style="font-size: 12px; color: var(--color-text-muted)">
              <input v-model="hoverDashed" type="checkbox" /> dashed
            </label>
          </template>
          <button
            class="toggle-btn"
            :class="{ 'is-on': hoverPreviewOn }"
            style="margin-top: 12px"
            @click="toggleHoverPreview"
          >
            {{ hoverPreviewOn ? 'Stop hover preview' : 'Simulate hover' }}
          </button>
        </div>

        <div class="panel">
          <p class="panel-title">Label</p>
          <label class="field-row" style="margin-bottom: 12px; font-size: 12px; color: var(--color-text-muted)">
            <input v-model="labelEnabled" type="checkbox" /> show #connection-label
          </label>
          <div v-if="labelEnabled" class="field">
            <input v-model="labelText" type="text" placeholder="label text" />
          </div>
        </div>
      </div>
    </div>

    <div class="preview">
      <p class="panel-title">style: ConnectionStyle</p>
      <pre class="code-preview">{{ stylePreview }}</pre>
    </div>
  </section>
</template>

<style scoped>
.scene {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 16px;
  align-items: start;
}

@media (max-width: 860px) {
  .layout {
    grid-template-columns: 1fr;
  }
}

.canvas {
  position: relative;
  height: 340px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

:deep(.vl-container) {
  position: relative;
  height: 100%;
}

:deep(.vl-block) {
  position: absolute;
  width: 96px;
  height: 52px;
}

:deep(.vl-block:nth-child(1)) {
  top: 28px;
  left: 50%;
  transform: translateX(-50%);
}
:deep(.vl-block:nth-child(2)) {
  bottom: 28px;
  left: 40px;
}
:deep(.vl-block:nth-child(3)) {
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
}
:deep(.vl-block:nth-child(4)) {
  bottom: 28px;
  right: 40px;
}

.card--top {
  background: var(--color-accent);
  color: #fff;
  border-color: var(--color-accent-dark);
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

.panels {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preview {
  max-width: 100%;
}
</style>
