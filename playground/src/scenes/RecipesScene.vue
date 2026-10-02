<script setup lang="ts">
import { ref } from 'vue'
import ErDiagram from '../recipes/ErDiagram.vue'
import FlowEditor from '../recipes/FlowEditor.vue'
import FieldMapping from '../recipes/FieldMapping.vue'
import EditableDiagram from '../recipes/EditableDiagram.vue'
import ServiceMap from '../recipes/ServiceMap.vue'

const recipes = [
  {
    id: 'er',
    label: 'ER diagram',
    component: ErDiagram,
    intro:
      'Tables are blocks, columns are ports. Drag a table by its title; point at a table to highlight its relations.',
  },
  {
    id: 'flow',
    label: 'Flow editor',
    component: FlowEditor,
    intro:
      'Press Connect on a node, then click another node. Select a line and press Delete. Lines route around nodes and hop over each other.',
  },
  {
    id: 'mapping',
    label: 'Field mapping',
    component: FieldMapping,
    intro: 'Click a source row, then a target row. Scroll a list: lines of rows that left the view pin to its edge.',
  },
  {
    id: 'editable',
    label: 'Add, remove, save',
    component: EditableDiagram,
    intro: 'Add and remove nodes, drag them around, reload the page: the layout is restored from localStorage.',
  },
  {
    id: 'monitoring',
    label: 'Live service map',
    component: ServiceMap,
    intro: 'Every two seconds a random link changes status; its color, dashes, animation and label follow the data.',
  },
] as const

const active = ref<(typeof recipes)[number]['id']>('er')
const current = () => recipes.find((recipe) => recipe.id === active.value)!
</script>

<template>
  <section class="scene">
    <p class="scene-intro">
      Complete, copy-ready examples from the documentation's Recipes group — each one is a single Vue component.
    </p>

    <div class="switch">
      <button
        v-for="recipe in recipes"
        :key="recipe.id"
        type="button"
        class="tab"
        :class="{ 'is-active': active === recipe.id }"
        @click="active = recipe.id"
      >
        {{ recipe.label }}
      </button>
    </div>

    <p class="recipe-intro">{{ current().intro }}</p>

    <div class="stage">
      <component :is="current().component" :key="active" />
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
  flex-wrap: wrap;
  gap: 8px;
}

.recipe-intro {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 14px;
}

.stage {
  padding: 24px;
  overflow-x: auto;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
</style>
