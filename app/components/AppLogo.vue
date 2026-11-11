<script setup lang="ts">
const { site } = useAppConfig()
</script>

<!--
  The logo (docs/adr/0005-logo.md): the radar mark (one axis per track, your strengths filled in)
  and the wordmark "grind" (Tektur 900) + "stone" (Tektur 500, ember).
-->
<template>
  <span class="inline-flex items-center gap-2 text-highlighted">
    <svg
      viewBox="0 0 32 32"
      class="size-7 shrink-0"
      fill="none"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path
        d="M16 3 27.3 9.5v13L16 29 4.7 22.5v-13Z"
        stroke="currentColor"
        stroke-width="2.2"
      />
      <path
        d="M16 7.3 23.5 11.6v8.8L16 24.7l-7.5-4.3v-8.8Z M16 11.7 19.7 13.8v4.4L16 20.3l-3.7-2.1v-4.4Z M16 3v26M4.7 9.5l22.6 13M27.3 9.5 4.7 22.5"
        stroke="currentColor"
        stroke-width="1"
        opacity=".35"
      />
      <g class="text-primary">
        <path
          d="M16 5.5 24.5 11.1 21.8 19.4 16 23.6 9.4 19.8 11.2 13.2Z"
          fill="currentColor"
          fill-opacity=".45"
          stroke="currentColor"
          stroke-width="1.8"
        />
        <g fill="currentColor">
          <circle
            cx="16"
            cy="5.5"
            r="1.6"
          />
          <circle
            cx="24.5"
            cy="11.1"
            r="1.6"
          />
          <circle
            cx="21.8"
            cy="19.4"
            r="1.6"
          />
          <circle
            cx="16"
            cy="23.6"
            r="1.6"
          />
          <circle
            cx="9.4"
            cy="19.8"
            r="1.6"
          />
          <circle
            cx="11.2"
            cy="13.2"
            r="1.6"
          />
        </g>
      </g>
    </svg>
    <span class="sr-only">{{ site.name }}</span>
    <span
      class="font-brand text-[1.375rem] leading-none font-black tracking-[-0.01em]"
      aria-hidden="true"
    >grind<span class="font-medium text-primary">stone</span></span>
  </span>
</template>
