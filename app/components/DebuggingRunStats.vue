<script setup lang="ts">
import type { Run } from '#shared/levels'

// The Debugging run in the debrief (DebriefDialog's `stats` slot): this run's hints and reloads, and the best run you
// ever had (fewest hints, then fewest reloads; this one included). No clock (ADR 0007).
defineProps<{
  stats: { hints: number, reloads: number, best: Run | null }
}>()

const { t } = useI18n()
</script>

<template>
  <dl
    class="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-default bg-muted p-3 text-sm sm:grid-cols-3"
    data-testid="debrief-stats"
  >
    <div>
      <dt class="text-muted">
        {{ t('debrief.hints') }}
      </dt>
      <dd class="font-mono text-lg font-semibold text-highlighted">
        {{ stats.hints }}
      </dd>
    </div>
    <div>
      <dt class="text-muted">
        {{ t('debrief.reloads') }}
      </dt>
      <dd class="font-mono text-lg font-semibold text-highlighted">
        {{ stats.reloads }}
      </dd>
    </div>
    <div v-if="stats.best">
      <dt class="text-muted">
        {{ t('debrief.best') }}
      </dt>
      <dd class="font-mono text-sm font-semibold text-highlighted">
        {{ t('track.counter.hints', stats.best.hints) }} · {{ t('track.counter.reloads', stats.best.reloads ?? 0) }}
      </dd>
    </div>
    <p class="col-span-2 text-muted sm:col-span-3">
      {{ stats.hints === 0 ? t('debrief.debugClean') : t('debrief.debugHints') }}
    </p>
  </dl>
</template>
