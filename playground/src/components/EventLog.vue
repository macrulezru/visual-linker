<script setup lang="ts">
defineProps<{ event: string }>()
</script>

<template>
  <p class="event-log">last event: {{ event }}</p>
</template>
