<script setup lang="ts">
const { site } = useAppConfig()
</script>

<!-- The mark: a grindstone wheel throwing three sparks -->
<template>
  <span class="inline-flex items-center gap-2 font-mono font-semibold tracking-tight text-highlighted">
    <svg
      viewBox="0 0 24 24"
      class="size-6 shrink-0"
      fill="none"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <circle
        cx="10"
        cy="14"
        r="7.5"
        stroke="currentColor"
        stroke-width="2"
      />
      <circle
        cx="10"
        cy="14"
        r="2"
        fill="currentColor"
      />
      <g
        class="text-primary"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M17.5 6.5 20 4" />
        <path d="M19.5 10.5H23" />
        <path d="M14 3l.8-2.6" />
      </g>
    </svg>
    <span>{{ site.name }}</span>
  </span>
</template>
