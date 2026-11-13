<script setup lang="ts">
// The frame every play page shares (docs/features/ui.md, "Play page"): the level panel on the left, the main work in the
// centre, a view of the result on the right (git: terminal and commit graph; Debugging: Code and Console, the App). On
// phones they stack: level, right, centre from md, level, centre, right below. A track's workbench fills the slots.
</script>

<template>
  <div class="grid gap-4 lg:h-[calc(100dvh-var(--ui-header-height)-9.5rem)] lg:min-h-[32rem] lg:grid-cols-[16rem_minmax(0,1fr)_20rem] lg:grid-rows-1 xl:grid-cols-[18rem_minmax(0,1fr)_24rem] 2xl:grid-cols-[20rem_minmax(0,1fr)_30rem]">
    <div class="order-1 flex min-w-0 flex-col lg:min-h-0">
      <slot name="panel" />
    </div>
    <div class="order-2 flex min-w-0 flex-col md:order-3 lg:order-2 lg:min-h-0">
      <slot />
    </div>
    <div class="order-3 h-80 min-w-0 md:order-2 lg:order-3 lg:h-full">
      <slot name="side" />
    </div>
  </div>
</template>
