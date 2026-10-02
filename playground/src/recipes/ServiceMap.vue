<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive } from 'vue'
import { VisualLinker, darkTheme, vVlBlock } from '@macrulez/visual-linker-vue'
import type { ConnectionDescriptor, VisualLinkerConfig } from '@macrulez/visual-linker-vue'

type Status = 'ok' | 'slow' | 'down'

const services = [
  { id: 'gateway', title: 'Gateway', x: 0, y: 110 },
  { id: 'api', title: 'API', x: 260, y: 110 },
  { id: 'db', title: 'Database', x: 540, y: 30 },
  { id: 'cache', title: 'Cache', x: 540, y: 190 },
]

const links = [
  { id: 'gateway>api', from: 'gateway', to: 'api' },
  { id: 'api>db', from: 'api', to: 'db' },
  { id: 'api>cache', from: 'api', to: 'cache' },
]

const health = reactive<Record<string, { status: Status; latency: number }>>({
  'gateway>api': { status: 'ok', latency: 12 },
  'api>db': { status: 'ok', latency: 48 },
  'api>cache': { status: 'ok', latency: 3 },
})

const look = {
  ok: { color: '#4ade80', dashed: false, animated: { shape: 'dots', speed: 50 } },
  slow: { color: '#fbbf24', dashed: false, animated: { shape: 'dashes', speed: 20 } },
  down: { color: '#f87171', dashed: true, animated: false, opacity: 0.7 },
} as const

const connections = computed<ConnectionDescriptor[]>(() =>
  links.map(({ id, from, to }) => {
    const { status, latency } = health[id]
    return {
      id,
      from: { blockId: from },
      to: { blockId: to },
      style: { ...look[status], markers: { end: { shape: 'arrow' } } },
      labels: [{ id: 'latency', position: 'middle', text: status === 'down' ? 'down' : `${latency} ms` }],
    }
  }),
)

const config: VisualLinkerConfig = {
  theme: darkTheme,
  lines: { curve: 'smoothstep', width: 2, highlight: { width: 3 } },
  interaction: { highlight: true },
}

let timer: ReturnType<typeof setInterval>
onMounted(() => {
  timer = setInterval(() => {
    const link = links[Math.floor(Math.random() * links.length)]
    const statuses: Status[] = ['ok', 'slow', 'down']
    health[link.id] = {
      status: statuses[Math.floor(Math.random() * 3)],
      latency: Math.round(Math.random() * 400),
    }
  }, 2000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="board">
    <VisualLinker class="diagram" :connections="connections" :config="config">
      <div
        v-for="service in services"
        :key="service.id"
        v-vl-block="service.id"
        class="service"
        :style="{ left: `${service.x}px`, top: `${service.y}px` }"
      >
        {{ service.title }}
      </div>
    </VisualLinker>
  </div>
</template>

<style scoped>
.board {
  padding: 24px;
  border-radius: var(--radius-lg);
  background: #0f172a;
  color: #e2e8f0;
}
.diagram {
  position: relative;
  height: 300px;
}
.service {
  position: absolute;
  width: 120px;
  padding: 12px 14px;
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: var(--radius-md);
  text-align: center;
}
</style>
