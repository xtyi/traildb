<template>
  <div class="breadcrumb-nav">
    <button class="crumb" :disabled="!provinceName" @click="$emit('go-country')">{{ countryLabel }}</button>
    <span v-if="provinceName" class="crumb-divider">/</span>
    <span v-if="provinceName" class="crumb-current">{{ provinceName }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  countryLabel?: string;
  provinceName?: string | null;
}>();

defineEmits<{
  (event: "go-country"): void;
}>();
</script>

<style scoped>
.breadcrumb-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.92rem;
}

.crumb {
  border: 0;
  background: transparent;
  color: var(--accent-strong);
  padding: 0;
  cursor: pointer;
}

.crumb:disabled {
  color: var(--ink-soft);
  cursor: default;
}

.crumb-divider {
  color: var(--ink-soft);
}

.crumb-current {
  color: var(--ink-strong);
  font-weight: 600;
}
</style>
