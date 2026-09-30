<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <section class="panel-box">
    <header class="panel-head">{{ title }}</header>
    <div class="panel-body"><slot /></div>
  </section>
</template>

<style scoped>
.panel-box {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  min-width: 180px;
}

.panel-head {
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-faint);
  border-bottom: 1px solid var(--color-border);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--color-surface-alt);
}

.panel-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}
</style>
