<script setup lang="ts">
import type { ChapterColour } from '#shared/levels'

// A level (or chapter) drawn as a commit in its chapter's colour: filled when solved, hollow when open, ringed in ember
// when it is next up; a coming chapter is a plain grey ring. Decoration only: the state is always also in text.
// A hollow dot is filled with the ground behind it (`--dot-ground`, default the page), so a lane under it does not show
// through.
const props = withDefaults(defineProps<{
  colour: ChapterColour
  state: 'solved' | 'open' | 'next' | 'coming'
  size?: 'sm' | 'md'
}>(), { size: 'md' })

const classes = computed(() => [
  props.state === 'coming' ? 'text-dimmed' : paletteClass(props.colour),
  props.size === 'sm' ? 'size-2.5' : 'size-3',
  props.state === 'solved' ? 'bg-current' : 'bg-[var(--dot-ground,var(--ui-bg))]',
  { 'outline-2 outline-offset-2 outline-primary': props.state === 'next' }
])
</script>

<template>
  <span
    aria-hidden="true"
    class="relative inline-block shrink-0 rounded-full border-2 border-current"
    :class="classes"
  />
</template>
