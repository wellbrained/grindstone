<script setup lang="ts">
import type { Run } from '#shared/levels'
import type { ResultItem } from '~/utils/debrief'

// The git run in the debrief's result strip (DebriefDialog's `results` slot): this run's commands beside the shortest
// known solution, its hints, the best run you ever had (this one included) and a one-line verdict. The shortest
// solution is there to compare with, not a score to reach: looking around with status and log counts as commands too.
const props = defineProps<{
  /** This run (commands, hints), the shortest known solution, and the best run so far. */
  stats: { commands: number, solution: number, hints: number, best: Run | null }
}>()

const { t } = useI18n()

const items = computed<ResultItem[]>(() => [
  { label: t('debrief.commands'), value: props.stats.commands, note: t('debrief.shortest', { n: props.stats.solution }) },
  { label: t('debrief.hints'), value: props.stats.hints }
])
const best = computed(() => props.stats.best
  ? `${t('track.counter.commands', props.stats.best.commands)} · ${t('track.counter.hints', props.stats.best.hints)}`
  : null)
const verdict = computed(() => props.stats.commands <= props.stats.solution
  ? t('debrief.verdictBest')
  : t('debrief.verdictMore', props.stats.solution))
</script>

<template>
  <DebriefResults
    :items="items"
    :best="best"
    :verdict="verdict"
  />
</template>
