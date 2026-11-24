<script setup lang="ts">
import type { Count } from '#shared/levels'

// A solved count drawn as a row of terminal blocks in `currentColor` (the caller sets the colour): any progress shows
// at least one block, only a full count fills them all. Decoration only: the count is always written beside it.
const props = withDefaults(defineProps<{ count: Count, blocks?: number }>(), { blocks: 12 })

const filled = computed(() => {
  const { solved, total } = props.count
  if (!total || !solved) return 0
  if (solved >= total) return props.blocks
  return Math.min(props.blocks - 1, Math.max(1, Math.round(solved / total * props.blocks)))
})
</script>

<template>
  <span
    aria-hidden="true"
    class="inline-flex gap-0.5"
  >
    <span
      v-for="index in blocks"
      :key="index"
      class="h-3 w-1.5 rounded-[1px]"
      :class="index <= filled ? 'bg-current' : 'bg-accented'"
    />
  </span>
</template>
