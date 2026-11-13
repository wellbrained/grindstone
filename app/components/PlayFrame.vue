<script setup lang="ts">
// The frame every play page shares (docs/features/ui.md, "Play page"): the level panel on the left, the main work in the
// centre, a view of the result on the right (git: terminal and commit graph; Debugging: Code and Console, the App). On
// phones they stack: level, right, centre from md, level, centre, right below. A track's workbench fills the slots.
// `tabs` (Debugging): below lg the track shows one panel at a time as tabs, so the right column follows the centre and
// takes only the height its own panel gives it.
const props = defineProps<{ tabs?: boolean }>()

const centreClass = computed(() => props.tabs ? 'order-2' : 'order-2 md:order-3 lg:order-2')
const sideClass = computed(() => props.tabs ? 'order-3 lg:h-full' : 'order-3 h-80 md:order-2 lg:order-3 lg:h-full')
</script>

<template>
  <div class="grid gap-4 lg:h-[calc(100dvh-var(--ui-header-height)-9.5rem)] lg:min-h-[32rem] lg:grid-cols-[16rem_minmax(0,1fr)_20rem] lg:grid-rows-1 xl:grid-cols-[18rem_minmax(0,1fr)_24rem] 2xl:grid-cols-[20rem_minmax(0,1fr)_30rem]">
    <div class="order-1 flex min-w-0 flex-col lg:min-h-0">
      <slot name="panel" />
    </div>
    <div
      class="flex min-w-0 flex-col lg:min-h-0"
      :class="centreClass"
    >
      <slot />
    </div>
    <div
      class="min-w-0"
      :class="sideClass"
    >
      <slot name="side" />
    </div>
  </div>
</template>
