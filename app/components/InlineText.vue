<script setup lang="ts">
// Level text (story, debrief) marks commands with `backticks`; show them as monospace code chips.
const props = defineProps<{ text: string }>()

const parts = computed(() => props.text.split(/`([^`]+)`/).map((text, index) => ({ text, code: index % 2 === 1 })))
</script>

<template>
  <span>
    <template
      v-for="(part, index) in parts"
      :key="index"
    >
      <code
        v-if="part.code"
        class="rounded-sm bg-accented px-1 py-0.5 font-mono text-[0.9em] text-highlighted"
      >{{ part.text }}</code>
      <template v-else>{{ part.text }}</template>
    </template>
  </span>
</template>
