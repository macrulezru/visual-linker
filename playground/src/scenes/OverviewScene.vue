<script setup lang="ts">
import { ref } from 'vue'
import {
  VisualLinker,
  VLConnectionCurveEnum,
  VLFixedSideEnum,
  VLMarkerShapeEnum,
  type ConnectionDescriptor,
} from '@macrulez/visual-linker-vue'
import EventLog from '../components/EventLog.vue'

const simpleBlocks = ['b1', 'b2', 'b4', 'b5', 'b6', 'b17', 'b18', 'b19', 'b20', 'b21']

const lastEvent = ref('—')

// b3's shared 'out' port is restricted to ['bottom', 'right']: dragging b3 around never
// sends its connections out the top or left, even if full auto would prefer that.
const outSides = [VLFixedSideEnum.BOTTOM, VLFixedSideEnum.RIGHT]
// Block 13's rows: each port tracks its own row's height, but anchorBlockId puts
// the connector point on the group's own border, not the row's indented edge.
const rowSides = [VLFixedSideEnum.LEFT, VLFixedSideEnum.RIGHT]

const connections: ConnectionDescriptor[] = [
  {
    id: 'c1',
    from: { blockId: 'b1' },
    to: { blockId: 'b2' },
    style: {
      curve: VLConnectionCurveEnum.BEZIER,
      // strokeColor/strokeWidth: an outline on top of the fill, same knobs
      // VisualLinkerOptions.defaultPortXxx uses for the built-in port dot.
      startMarker: { shape: VLMarkerShapeEnum.SQUARE, strokeColor: '#fff', strokeWidth: 1.5 },
      endMarker: { shape: VLMarkerShapeEnum.DIAMOND, strokeColor: '#fff', strokeWidth: 1.5 },
      hoverStyle: { markerSize: 13 },
    },
  },
  {
    id: 'c2',
    from: { blockId: 'b3', portId: 'out' },
    to: { blockId: 'b4' },
    style: { curve: VLConnectionCurveEnum.BEZIER },
  },
  {
    id: 'c3',
    from: { blockId: 'b3', portId: 'out' },
    to: { blockId: 'b5' },
    style: { curve: VLConnectionCurveEnum.BEZIER },
  },
  {
    id: 'c4',
    from: { blockId: 'b3', portId: 'out' },
    to: { blockId: 'b6' },
    // Shares b3's 'out' port with c2/c3 — since b5 is the nearer sibling along
    // that trunk, this one's line visibly shares the same initial stretch as
    // c3's before peeling off toward b6 (the group-aware smoothstep branch point).
    style: {
      curve: VLConnectionCurveEnum.BEZIER,
      color: '#e0526c',
      dashed: true,
      endMarker: { shape: VLMarkerShapeEnum.ARROW, color: '#e0526c' },
    },
  },
  {
    id: 'c5',
    from: { blockId: 'b13', portId: 'p14' },
    to: { blockId: 'b17' },
    style: {
      curve: VLConnectionCurveEnum.BEZIER,
      endMarker: { shape: VLMarkerShapeEnum.ARROW, size: 6 },
      // markerSize grows the arrow specifically on hover, on top of the
      // automatic strokeWidth-linked growth every marker already gets for
      // free from the line itself getting thicker while active.
      hoverStyle: { color: '#1f6feb', markerSize: 12 },
    },
  },
  {
    id: 'c6',
    from: { blockId: 'b13', portId: 'p14' },
    to: { blockId: 'b18' },
    // Shares p14 with c5 — both peel off the same short trunk stub, rounded at the branch point.
    style: { curve: VLConnectionCurveEnum.BEZIER, endMarker: VLMarkerShapeEnum.ARROW },
  },
  {
    id: 'c7',
    from: { blockId: 'b13', portId: 'p15' },
    to: { blockId: 'b19' },
    // A bigger arrow via the marker's own size coefficient (multiples of the line's stroke width).
    style: { curve: VLConnectionCurveEnum.BEZIER, endMarker: { shape: VLMarkerShapeEnum.ARROW } },
  },
  {
    id: 'c8',
    from: { blockId: 'b13', portId: 'p16' },
    to: { blockId: 'b20' },
    // A larger corner radius than the instance default, just on this one connection.
    style: { curve: VLConnectionCurveEnum.BEZIER, endMarker: VLMarkerShapeEnum.ARROW, cornerRadius: 16 },
  },
  {
    id: 'c9',
    from: { blockId: 'b13', portId: 'p16' },
    to: { blockId: 'b21' },
    // endMarker: false — suppresses the built-in dot at this end too (not
    // just "no native marker"), leaving a bare point for #marker below to
    // draw into alone, instead of layering its custom shape over the dot.
    style: { curve: VLConnectionCurveEnum.BEZIER, endMarker: false },
  },
]

function label(id: string) {
  return `Block ${id.slice(1)}`
}
</script>

<template>
  <section class="scene">
    <p class="scene-intro">
      Everything at once: bezier curves, a group with a shared fan-out port, per-connection markers, hover styling, and
      the <code>#connection-label</code>/<code>#port</code>/<code>#marker</code> overlay slots.
    </p>
    <EventLog :event="lastEvent" />

    <VisualLinker
      :connections="connections"
      :options="{
        dragGridSize: 20,
        defaultPortRadius: 5,
        defaultPortColor: '#6d5bf6',
        defaultPortStrokeColor: '#fff',
        defaultPortStrokeWidth: 2,
        // Instance-wide default size for c1's square/diamond markers below —
        // no need to repeat `size` on every single connection using them.
        defaultSquareMarkerSize: 10,
        defaultDiamondMarkerSize: 10,
      }"
      @connection-click="lastEvent = `connection-click: ${$event.id}`"
      @connection-mouseenter="lastEvent = `connection-mouseenter: ${$event.id}`"
      @block-dragstart="lastEvent = `block-dragstart: ${$event.blockId}`"
      @block-drag="lastEvent = `block-drag: ${$event.blockId} (${$event.x}, ${$event.y})`"
      @block-dragend="lastEvent = `block-dragend: ${$event.blockId}`"
    >
      <!-- Blocks are plain elements placed straight into the grid — no wrappers.
           v-vl-block marks them; the grid itself lives on .vl-container. -->
      <div v-for="id in simpleBlocks" :key="id" v-vl-block="id" class="card" :style="{ gridArea: id }">
        {{ label(id) }}
      </div>

      <div
        v-vl-block="{ id: 'b3', draggable: true }"
        v-vl-port="{ id: 'out', side: outSides }"
        class="card"
        style="grid-area: b3"
      >
        Block 3
      </div>

      <div
        v-vl-block="{ id: 'b13', draggable: true, dragHandle: '.group-title' }"
        class="card group"
        style="grid-area: b13"
      >
        <div class="group-title">Block 13 (drag handle)</div>
        <div v-vl-port="{ id: 'p14', side: rowSides, anchorBlockId: 'b13' }" class="sub">Block 14</div>
        <div v-vl-port="{ id: 'p15', side: rowSides, anchorBlockId: 'b13' }" class="sub">Block 15</div>
        <div v-vl-port="{ id: 'p16', side: rowSides, anchorBlockId: 'b13' }" class="sub">Block 16</div>
      </div>

      <!-- #connection-label: arbitrary HTML positioned at the connection's
           actual midpoint (curve-aware), tracked live off the 'layout' event
           — only rendered for the one connection that opts in here. -->
      <template #connection-label="{ connection }">
        <span v-if="connection.id === 'c3'" class="connection-label">1-to-1</span>
      </template>

      <!-- #marker: full replacement for a connection's start/end marker (the
           wrapper div is pre-rotated to the line's own tangent, via CSS
           rotate() off the 'layout' event's fromAngle/toAngle) — only used
           for c9's end here, everywhere else keeps its native SVG marker
           (or the built-in dot) since those still have an explicit
           startMarker/endMarker style, which always takes precedence over
           this slot. c9 itself sets `endMarker: false` (not just omits it) —
           that's what stops the built-in dot from also drawing under this
           custom shape; leaving endMarker unset entirely would still show
           the default dot layered beneath it. -->
      <template #marker="{ connection, position }">
        <span v-if="connection.id === 'c9' && position === 'end'" class="custom-marker" />
      </template>
    </VisualLinker>

    <div class="callout">
      <span class="badge">Also available</span>
      <p>
        <code>useVisualLinker()</code> is a low-level composable for when you'd rather not render a
        <code>&lt;VisualLinker&gt;</code> at all — same engine, wired straight to your own container element:
      </p>
      <pre class="code-preview"><span class="k">const</span> { engine } = useVisualLinker(containerRef, {
  blocks: <span class="k">computed</span>(() =&gt; [{ id: <span class="s">'a'</span>, el: aRef.value! }, ...]),
  connections: <span class="k">computed</span>(() =&gt; [...]),
})</pre>
    </div>
  </section>
</template>

<style scoped>
.scene {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

:deep(.vl-container) {
  display: grid;
  grid-template-columns: repeat(4, 180px);
  grid-auto-rows: 90px;
  gap: 24px 200px;
  grid-template-areas:
    'b1  b3  .   .'
    'b2  b4  b5  b6'
    '.   .   .   .'
    'b13 b17 .   .'
    'b13 b18 .   .'
    'b13 b19 .   .'
    'b13 b20 .   .'
    'b13 b21 .   .';
}

.card.group {
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  padding: 12px;
  gap: 8px;
  background: var(--color-surface-alt);
}

.group-title {
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 4px;
}

.sub {
  background: var(--color-accent-soft);
  border-radius: var(--radius-sm);
  padding: 10px;
  font-size: 12px;
  text-align: center;
  color: var(--color-accent-dark);
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

/* Points right (0°) by default — the .vl-marker wrapper's own rotate() from
   fromAngle/toAngle aligns it to the line's actual direction of travel. */
:deep(.custom-marker) {
  display: block;
  width: 0;
  height: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 10px solid #8e44ad;
}

.callout {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 20px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  max-width: 640px;
}

.callout p {
  font-size: 13px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.callout code {
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--color-surface-alt);
  padding: 1px 5px;
  border-radius: 4px;
}
</style>
