<script setup lang="ts">
import type { Run } from '#shared/levels'

// The Debugging run in the debrief (DebriefDialog's `stats` slot): this run's hints and reloads, and the best run you
// ever had (fewest hints, then fewest reloads; this one included). No clock (ADR 0007). A Web fundamentals run (ADR
// 0009) has its wrong predictions first, and its best run is the fewest of those, then hints, then reloads.
const props = defineProps<{
  stats: { hints: number, reloads: number, wrongPredictions?: number, best: Run | null }
}>()

const { t } = useI18n()
const predictions = computed(() => props.stats.wrongPredictions !== undefined)
const verdict = computed(() => {
  if (predictions.value) return props.stats.wrongPredictions === 0 && props.stats.hints === 0 ? t('debrief.webClean') : props.stats.wrongPredictions! > 0 ? t('debrief.webWrong') : t('debrief.debugHints')
  return props.stats.hints === 0 ? t('debrief.debugClean') : t('debrief.debugHints')
})
</script>

<template>
  <dl
    class="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-default bg-muted p-3 text-sm"
    :class="predictions ? 'sm:grid-cols-4' : 'sm:grid-cols-3'"
    data-testid="debrief-stats"
  >
    <div v-if="predictions">
      <dt class="text-muted">
        {{ t('debrief.wrongPredictions') }}
      </dt>
      <dd class="font-mono text-lg font-semibold text-highlighted">
        {{ stats.wrongPredictions }}
      </dd>
    </div>
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
        <template v-if="predictions">
          {{ t('track.counter.wrongPredictions', stats.best.wrongPredictions ?? 0) }} ·
        </template>{{ t('track.counter.hints', stats.best.hints) }} · {{ t('track.counter.reloads', stats.best.reloads ?? 0) }}
      </dd>
    </div>
    <p
      class="col-span-2 text-muted"
      :class="predictions ? 'sm:col-span-4' : 'sm:col-span-3'"
    >
      {{ verdict }}
    </p>
  </dl>
</template>
