<script setup lang="ts">
import type { Run } from '#shared/levels'
import type { ResultItem } from '~/utils/debrief'

// The review in the debrief's result strip (DebriefDialog's `results` slot): this run's hints and false alarms, a steer
// level's (chapter 7) rounds of changes Sous pushed, and the best run you ever had (fewest hints, then fewest false
// alarms; this one included). No clock (ADR 0008). What was wrong in the pull request is ReviewIssues, after the lesson.
const props = defineProps<{
  stats: { hints: number, falseAlarms: number, rounds?: number, best: Run | null }
}>()

const { t } = useI18n()

const items = computed<ResultItem[]>(() => [
  { label: t('debrief.hints'), value: props.stats.hints },
  { label: t('debrief.falseAlarms'), value: props.stats.falseAlarms },
  ...(props.stats.rounds !== undefined ? [{ label: t('debrief.rounds'), value: props.stats.rounds, testid: 'debrief-rounds' }] : [])
])
const best = computed(() => {
  const run = props.stats.best
  if (!run) return null
  return [
    t('track.counter.hints', run.hints),
    t('track.counter.falseAlarms', run.falseAlarms ?? 0),
    ...(run.rounds !== undefined ? [t('track.counter.rounds', run.rounds)] : [])
  ].join(' · ')
})
const verdict = computed(() => {
  if (props.stats.rounds !== undefined && props.stats.hints === 0 && props.stats.falseAlarms === 0) return t(props.stats.rounds <= 1 ? 'debrief.steerClean' : 'debrief.steerRounds')
  if (props.stats.hints === 0 && props.stats.falseAlarms === 0) return t('debrief.reviewClean')
  if (props.stats.falseAlarms > 0) return t('debrief.reviewAlarms')
  return t('debrief.reviewHints')
})
</script>

<template>
  <DebriefResults
    :items="items"
    :best="best"
    :verdict="verdict"
  />
</template>
