<script setup lang="ts">
import { ref } from 'vue'
import OverviewScene from './scenes/OverviewScene.vue'
import CurvesScene from './scenes/CurvesScene.vue'
import PortsScene from './scenes/PortsScene.vue'
import InteractivityScene from './scenes/InteractivityScene.vue'
import MarkersScene from './scenes/MarkersScene.vue'
import LiveControlsScene from './scenes/LiveControlsScene.vue'

const tabs = [
  { id: 'overview', label: 'Overview', component: OverviewScene },
  { id: 'curves', label: 'Curves', component: CurvesScene },
  { id: 'ports', label: 'Ports & anchoring', component: PortsScene },
  { id: 'interactivity', label: 'Drag & interactivity', component: InteractivityScene },
  { id: 'markers', label: 'Markers & overlays', component: MarkersScene },
  { id: 'live', label: 'Live controls', component: LiveControlsScene },
] as const

const activeTab = ref<(typeof tabs)[number]['id']>('overview')
</script>

<template>
  <main>
    <header class="hero">
      <span class="badge">@macrulez/visual-linker</span>
      <h1>visual-linker playground</h1>
      <p class="subtitle">Smart, auto-routed SVG connector lines between DOM blocks you already control.</p>

      <nav class="tab-bar">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tab"
          :class="{ 'is-active': activeTab === tab.id }"
          type="button"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>
    </header>

    <component :is="tabs.find((tab) => tab.id === activeTab)!.component" />
  </main>
</template>

<style scoped>
main {
  max-width: 1080px;
  margin: 0 auto;
  padding: 40px 24px 80px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.hero h1 {
  font-size: 26px;
}

.subtitle {
  color: var(--color-text-muted);
  font-size: 14px;
  margin-bottom: 8px;
}

.tab-bar {
  margin-top: 4px;
}
</style>
