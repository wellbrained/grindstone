<script setup lang="ts">
import type { ReviewLevel, Run } from '#shared/levels'
import { placeShort } from '~/utils/review-view'

// The review in the debrief (DebriefDialog's `stats` slot): what was wrong in the pull request (each planted issue,
// where and why), then this run's hints and false alarms and the best run you ever had (fewest hints, then fewest false
// alarms; this one included). No clock (ADR 0008).
const props = defineProps<{
  level: ReviewLevel
  stats: { hints: number, falseAlarms: number, best: Run | null }
}>()

const { t } = useI18n()

const where = (issue: ReviewLevel['issues'][number]) => placeShort({
  path: issue.path,
  head: issue.lines ? { start: issue.lines[0], end: issue.lines[1] } : null,
  base: issue.removed ? { start: issue.removed[0], end: issue.removed[1] } : null
})

const verdict = computed(() => {
  if (props.stats.hints === 0 && props.stats.falseAlarms === 0) return t('debrief.reviewClean')
  if (props.stats.falseAlarms > 0) return t('debrief.reviewAlarms')
  return t('debrief.reviewHints')
})
</script>

<template>
  <section
    v-if="level.issues.length"
    class="mt-5"
    aria-labelledby="debrief-issues-heading"
  >
    <h3
      id="debrief-issues-heading"
      class="text-sm font-semibold text-highlighted"
    >
      {{ t('debrief.issues') }}
    </h3>
    <ul
      class="mt-2 space-y-2 text-sm"
      data-testid="debrief-issues"
    >
      <li
        v-for="issue in level.issues"
        :key="issue.id"
        class="rounded-lg border border-default p-2.5"
      >
        <p class="font-medium text-highlighted">
          <span class="me-1.5 font-mono text-xs font-normal text-muted">{{ where(issue) }}</span><InlineText :text="issue.title" />
        </p>
        <p class="mt-1 text-toned">
          <InlineText :text="issue.explanation" />
        </p>
      </li>
    </ul>
  </section>
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
        {{ t('debrief.falseAlarms') }}
      </dt>
      <dd class="font-mono text-lg font-semibold text-highlighted">
        {{ stats.falseAlarms }}
      </dd>
    </div>
    <div v-if="stats.best">
      <dt class="text-muted">
        {{ t('debrief.best') }}
      </dt>
      <dd class="font-mono text-sm font-semibold text-highlighted">
        {{ t('track.counter.hints', stats.best.hints) }} · {{ t('track.counter.falseAlarms', stats.best.falseAlarms ?? 0) }}
      </dd>
    </div>
    <p class="col-span-2 text-muted sm:col-span-3">
      {{ verdict }}
    </p>
  </dl>
</template>
