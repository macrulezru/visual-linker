<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  VisualLinker,
  VLMarkerShapeEnum,
  darkTheme,
  defineTheme,
  lightTheme,
  useVisualLinkerConfig,
  type ConnectionDescriptor,
  type Theme,
  type VisualLinkerConfig,
} from '@macrulez/visual-linker-vue'

const shared = useVisualLinkerConfig()

const midnight = defineTheme(
  { line: '#8b9bff', lineHover: '#c4ccff', lineSelected: '#ffd479', portFill: '#14162a', portStroke: '#8b9bff' },
  darkTheme,
)
const themes: Record<string, Theme> = { light: lightTheme, dark: darkTheme, midnight }
const themeName = ref<keyof typeof themes>('light')

watch(
  themeName,
  (name) => {
    shared.theme = themes[name]
  },
  { immediate: true },
)

const states: VisualLinkerConfig = {
  blocks: { draggable: true, drag: { bounds: 'container' } },
  interaction: { selectable: true },
  lines: {
    width: 2,
    highlight: { width: 3 },
    hover: { width: 4, dashed: true },
    selected: { width: 3 },
    focus: { width: 5 },
  },
  markers: {
    end: {
      shape: VLMarkerShapeEnum.CIRCLE,
      size: 5,
      highlight: { size: 7 },
      hover: { shape: VLMarkerShapeEnum.DIAMOND, size: 9 },
      selected: { shape: VLMarkerShapeEnum.ARROW, size: 8 },
    },
  },
  ports: { radius: 4, highlight: { radius: 6 }, hover: { radius: 7 } },
  labels: { hover: { fontSize: 13 }, highlight: { fontSize: 12 } },
}

const connections: ConnectionDescriptor[] = [
  {
    id: 'ab',
    from: { blockId: 'a' },
    to: { blockId: 'b' },
    labels: [{ id: 'l', position: 'middle', text: 'hover me' }],
  },
  { id: 'ac', from: { blockId: 'a' }, to: { blockId: 'c' }, style: { opacity: 0.55, hover: { opacity: 1 } } },
]
</script>

<template>
  <section class="scene">
    <p class="scene-intro">
      One shared configuration (<code>useVisualLinkerConfig()</code>) drives the theme of every diagram; hover a
      <em>block</em> to <strong>highlight</strong> its lines (smaller changes), hover a <em>line</em> to see the
      <strong>hover</strong> state (the marker changes shape), click or Tab + Enter to <strong>select</strong>.
    </p>

    <div class="switch">
      <button
        v-for="(_, name) in themes"
        :key="name"
        type="button"
        class="tab"
        :class="{ 'is-active': themeName === name }"
        @click="themeName = name"
      >
        {{ name }}
      </button>
    </div>

    <div class="canvas" :class="{ 'canvas--dark': themeName !== 'light' }">
      <VisualLinker :connections="connections" :config="states">
        <div v-vl-block="'a'" class="card node a">A</div>
        <div v-vl-block="'b'" class="card node b">B</div>
        <div v-vl-block="'c'" class="card node c">C</div>
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

.switch {
  display: flex;
  gap: 8px;
}

.canvas {
  position: relative;
  height: 280px;
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  transition: background 0.2s;
}

.canvas--dark {
  background: #14162a;
}

.canvas :deep(.vl-container) {
  height: 100%;
}

.node {
  position: absolute;
  width: 64px;
  height: 36px;
}

.a {
  top: 30px;
  left: 30px;
}

.b {
  top: 30px;
  right: 30px;
}

.c {
  bottom: 30px;
  right: 120px;
}
</style>
