<script setup lang="ts">
import type { Count } from '#shared/levels'
import { percent } from '~/utils/track-view'

// A thin bar for a solved count. The fill takes `currentColor`, so the caller sets the colour (a chapter's `.branch-c-N`,
// or `text-primary` for a whole track) and the height. Decoration only: the count is always also written out next to it.
defineProps<{ count: Count }>()
</script>

<template>
  <span
    aria-hidden="true"
    class="block overflow-hidden rounded-full bg-accented"
  >
    <span
      class="block h-full rounded-full bg-current"
      :style="{ width: percent(count) }"
    />
  </span>
</template>
