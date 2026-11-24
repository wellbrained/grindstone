<script setup lang="ts">
// A window of the home page's terminal look (DESIGN.md, "Track terminal"): a tab strip, then a prompt line with the
// command whose output the window shows. The tab and the prompt are decoration; the content carries the names.
defineProps<{ command: string }>()
</script>

<template>
  <section class="flex flex-col overflow-hidden rounded-xl border border-(--app-terminal-border) bg-(--app-terminal)">
    <div class="flex min-h-9 items-center gap-2 border-b border-(--app-terminal-border) px-4 py-2 font-mono text-xs text-muted">
      <slot name="tab">
        <span
          aria-hidden="true"
          class="text-toned"
        >~</span>
      </slot>
    </div>
    <div class="flex flex-1 flex-col px-4 pt-4 pb-5 sm:px-6 sm:pt-5">
      <p
        aria-hidden="true"
        class="truncate font-mono text-[0.8125rem] text-muted"
      >
        <span class="text-toned">you@grindstone</span> ~ $ <span class="text-highlighted">{{ command }}</span>
      </p>
      <slot />
    </div>
  </section>
</template>
