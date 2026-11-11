<script setup lang="ts">
import type { Prompt } from '~/utils/terminal'

// you@grindstone ~/project (feature/login) $ : the branch in its palette colour.
defineProps<{ prompt: Prompt }>()
</script>

<template>
  <span class="whitespace-pre-wrap select-none">
    <span class="text-primary">you@grindstone</span>
    <span class="text-muted"> ~/project</span>
    <template v-if="prompt.branch">
      <span class="text-muted"> (</span>
      <span
        class="font-semibold"
        :class="prompt.colorKey === 'HEAD' ? 'text-highlighted' : branchClass(prompt.colorKey)"
      >{{ prompt.branch }}</span>
      <span
        v-if="prompt.operation"
        class="font-semibold text-warning"
      >|{{ prompt.operation }}</span>
      <span class="text-muted">)</span>
    </template>
    <span class="text-muted"> $</span>
  </span>
</template>
