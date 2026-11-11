<script setup lang="ts">
const { site } = useAppConfig()
</script>

<!-- Placeholder logo — replace with your own SVG or image -->
<template>
  <span class="inline-flex items-center gap-2 font-semibold text-highlighted">
    <UIcon
      name="i-lucide-box"
      class="size-6 text-primary"
    />
    <span>{{ site.name }}</span>
  </span>
</template>
