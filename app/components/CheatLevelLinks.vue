<script setup lang="ts">
import { levelNumber } from '#shared/levels'
import type { Level } from '#shared/levels'

// The "Practise it in:" row of a cheat sheet card (all four sheets): one small outlined, neutral link per level, the
// level number in mono. At least 24px tall, 44px on a coarse pointer (docs/features/ui.md, "Tap targets"); not ember,
// which only marks what is active or next.
defineProps<{
  levels: readonly Level[]
  /** "Practise it in:" */
  label: string
}>()
</script>

<template>
  <div
    v-if="levels.length"
    class="mt-3 flex flex-wrap items-center gap-1.5"
    data-testid="cheat-practise"
  >
    <span class="me-0.5 text-xs text-muted">{{ label }}</span>
    <UButton
      v-for="level in levels"
      :key="level.id"
      :to="levelPath(level)"
      color="neutral"
      variant="outline"
      size="xs"
      class="min-h-6 max-w-full text-left text-toned pointer-coarse:min-h-11"
      data-testid="cheat-level-link"
    >
      <span class="font-mono tabular-nums">{{ levelNumber(level.id) }}</span>
      <span class="min-w-0 wrap-break-word">{{ level.title }}</span>
    </UButton>
  </div>
</template>
