<script setup lang="ts">
import type { Run } from '#shared/levels'
import type { ResultItem } from '~/utils/debrief'

// The Debugging run in the debrief's result strip (DebriefDialog's `results` slot): this run's hints and reloads, and
// the best run you ever had (fewest hints, then fewest reloads; this one included). No clock (ADR 0007). A Web
// fundamentals run (ADR 0009) has its wrong predictions first, and its best run is the fewest of those, then hints, then
// reloads.
const props = defineProps<{
  stats: { hints: number, reloads: number, wrongPredictions?: number, best: Run | null }
}>()

const { t } = useI18n()
const predictions = computed(() => props.stats.wrongPredictions !== undefined)
const items = computed<ResultItem[]>(() => [
  ...(predictions.value ? [{ label: t('debrief.wrongPredictions'), value: props.stats.wrongPredictions! }] : []),
  { label: t('debrief.hints'), value: props.stats.hints },
  { label: t('debrief.reloads'), value: props.stats.reloads }
])
const best = computed(() => {
  const run = props.stats.best
  if (!run) return null
  return [
    ...(predictions.value ? [t('track.counter.wrongPredictions', run.wrongPredictions ?? 0)] : []),
    t('track.counter.hints', run.hints),
    t('track.counter.reloads', run.reloads ?? 0)
  ].join(' · ')
})
const verdict = computed(() => {
  if (predictions.value) return props.stats.wrongPredictions === 0 && props.stats.hints === 0 ? t('debrief.webClean') : props.stats.wrongPredictions! > 0 ? t('debrief.webWrong') : t('debrief.debugHints')
  return props.stats.hints === 0 ? t('debrief.debugClean') : t('debrief.debugHints')
})
</script>

<template>
  <DebriefResults
    :items="items"
    :best="best"
    :verdict="verdict"
  />
</template>
