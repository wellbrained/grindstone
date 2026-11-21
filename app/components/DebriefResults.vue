<script setup lang="ts">
import type { ResultItem } from '~/utils/debrief'

// The debrief's first line, in every track (DebriefDialog's `results` slot, filled by the track's run stats): solved,
// the run's counts, the best run so far, then a one-sentence verdict. Counts are mono data, labels are text; the strip
// wraps on narrow screens, every count keeps its label beside it.
defineProps<{
  items: ResultItem[]
  /** The best run so far, as one line ('no hints · 1 reload'); none before the first solve is recorded. */
  best?: string | null
  verdict: string
}>()

const { t } = useI18n()
</script>

<template>
  <div data-testid="debrief-results">
    <dl
      class="flex flex-wrap items-baseline gap-x-5 gap-y-1.5 rounded-lg border border-default bg-muted px-3 py-2 text-sm"
      data-testid="debrief-stats"
    >
      <div class="self-center">
        <dt class="sr-only">
          {{ t('debrief.result') }}
        </dt>
        <dd class="flex items-center gap-1.5 font-medium text-highlighted">
          <UIcon
            name="i-lucide-circle-check"
            class="size-4 shrink-0 text-success"
          />
          {{ t('debrief.solvedShort') }}
        </dd>
      </div>
      <div
        v-for="item in items"
        :key="item.label"
        class="flex items-baseline gap-1.5"
      >
        <dt class="text-muted">
          {{ item.label }}
        </dt>
        <dd class="font-mono font-semibold text-highlighted tabular-nums">
          <span :data-testid="item.testid">{{ item.value }}</span><span
            v-if="item.note"
            class="font-normal text-muted"
          > · {{ item.note }}</span>
        </dd>
      </div>
      <div
        v-if="best"
        class="flex min-w-0 items-baseline gap-1.5"
      >
        <dt class="shrink-0 text-muted">
          {{ t('debrief.best') }}
        </dt>
        <dd class="font-mono text-xs font-semibold text-highlighted tabular-nums">
          {{ best }}
        </dd>
      </div>
    </dl>
    <p class="mt-2 text-sm text-toned">
      {{ verdict }}
    </p>
  </div>
</template>
