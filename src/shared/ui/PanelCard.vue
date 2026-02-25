<template>
  <section class="panel-card">
    <header v-if="title || description" class="panel-head">
      <h2 v-if="title">{{ title }}</h2>
      <p v-if="description">{{ description }}</p>
    </header>
    <div class="panel-body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title?: string;
  description?: string;
}>();
</script>

<style scoped>
.panel-card {
  background: rgba(255, 255, 255, 0.68);
  border: 1px solid rgba(22, 36, 46, 0.12);
  border-radius: 16px;
}

.panel-head {
  padding: 14px 16px 8px;
}

.panel-head h2 {
  margin: 0;
  font-size: 1rem;
}

.panel-head p {
  margin: 5px 0 0;
  font-size: 0.88rem;
  color: var(--ink-soft);
}

.panel-body {
  padding: 10px 16px 16px;
}
</style>
