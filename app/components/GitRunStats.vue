<script setup lang="ts">
import type { Run } from '#shared/levels'

// The git run in the debrief (DebriefDialog's `stats` slot): this run's commands against the shortest known solution,
// its hints, the best run you ever had (this one included) and a one-line verdict.
const props = defineProps<{
  /** This run (commands, hints), the shortest known solution, and the best run so far. */
  stats: { commands: number, solution: number, hints: number, best: Run | null }
}>()

const { t } = useI18n()

const verdict = computed(() => {
  if (props.stats.commands <= props.stats.solution) return t('debrief.verdictBest')
  return t('debrief.verdictMore', props.stats.commands - props.stats.solution)
})
</script>

<template>
  <dl
    class="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-default bg-muted p-3 text-sm sm:grid-cols-3"
    data-testid="debrief-stats"
  >
    <div>
      <dt class="text-muted">
        {{ t('debrief.commands') }}
      </dt>
      <dd class="font-mono text-lg font-semibold text-highlighted">
        {{ stats.commands }}
        <span class="text-sm font-normal text-muted">/ {{ stats.solution }}</span>
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
    <div v-if="stats.best">
      <dt class="text-muted">
        {{ t('debrief.best') }}
      </dt>
      <dd class="font-mono text-lg font-semibold text-highlighted">
        {{ stats.best.commands }}
        <span class="text-sm font-normal text-muted">{{ t('debrief.bestHints', stats.best.hints) }}</span>
      </dd>
    </div>
    <p class="col-span-2 text-muted sm:col-span-3">
      {{ verdict }}
    </p>
  </dl>
</template>
