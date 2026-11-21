<script setup lang="ts">
import type { StripCounter } from '~/utils/play-strip'
import { STRIP_TESTID } from '~/utils/play-strip'

// The slim strip above every play page (docs/features/ui.md, "Play strip"; DESIGN.md "Play strip"): what to do, in one
// short line on the left, the run's counters on the right (stripCounters), and a track's own control after them (git:
// the Terminal / IDE switch, last, so it never moves under the cursor when a count grows). One height on every track.
defineProps<{
  icon: string
  note: string
  counters: StripCounter[]
}>()

const { t } = useI18n()
</script>

<template>
  <div
    class="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2"
    data-testid="play-strip"
  >
    <p
      class="flex min-w-0 flex-1 basis-48 items-center gap-2 text-xs text-muted"
      data-testid="play-note"
    >
      <UIcon
        :name="icon"
        class="size-4 shrink-0"
      />
      {{ note }}
    </p>
    <div class="ms-auto flex shrink-0 items-center gap-2">
      <p
        v-for="counter in counters"
        :key="counter.id"
        class="rounded-md border border-default px-2.5 py-1 font-mono text-xs text-muted tabular-nums"
        :data-testid="STRIP_TESTID[counter.id]"
      >
        {{ t(`play.counter.${counter.id}`, { n: counter.n }) }}
      </p>
      <slot name="end" />
    </div>
  </div>
</template>
