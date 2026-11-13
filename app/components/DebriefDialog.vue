<script setup lang="ts">
import { formatCredit, radarGain, trackRadar } from '#shared/levels'
import type { Level, LevelPlace, Progress, Run, Scenario } from '#shared/levels'

// Shown when a level is solved: why the solution works, how you did, the skill radar with this chapter's axis lit (it
// grows once from the shape before the solve, ADR 0007), and where to go next.
const props = defineProps<{
  level: Scenario
  /** Where the level sits: its track's radar, its chapter's axis. */
  place: LevelPlace
  /** The progress right before this solve; null when the debrief is shown again without a new solve. */
  progressBefore: Progress | null
  next: Level | null
  /** Where "Back to the track" goes after the last available level. */
  trackTo: string
  /** This run (commands, hints), the shortest known solution, and the best run you ever had (this one included). */
  stats: { commands: number, solution: number, hints: number, best: Run | null }
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ closed: [] }>()

const { t } = useI18n()
const { progress } = useProgress()

const radar = computed(() => trackRadar(props.place.track, progress.value))
const radarBefore = computed(() => props.progressBefore ? trackRadar(props.place.track, props.progressBefore) : null)
// the axis this solve moved; null when it stayed (a replay that changed nothing)
const gain = computed(() => radarBefore.value ? radarGain(radarBefore.value, radar.value, props.place.chapter.id) : null)
const gainText = computed(() => {
  if (!gain.value) return null
  const values = { chapter: gain.value.chapter.title, from: formatCredit(gain.value.from), to: formatCredit(gain.value.to), total: gain.value.total }
  return { short: t('debrief.radarGain', values), long: t('debrief.radarGainLong', values) }
})

// the dialog would hand the focus back to the button that opened it; the page decides instead (back to the terminal)
function onCloseAutoFocus(event: Event) {
  event.preventDefault()
  emit('closed')
}

const verdict = computed(() => {
  if (props.stats.commands <= props.stats.solution) return t('debrief.verdictBest')
  return t('debrief.verdictMore', props.stats.commands - props.stats.solution)
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="level.debrief.title"
    :description="t('debrief.solved', { title: level.title })"
    :ui="{ content: 'sm:max-w-2xl' }"
    :content="{ onCloseAutoFocus }"
  >
    <template #body>
      <div class="sm:grid sm:grid-cols-[minmax(0,1fr)_11.875rem] sm:items-center sm:gap-6">
        <div>
          <div class="space-y-3 text-default">
            <p
              v-for="(paragraph, index) in level.debrief.paragraphs"
              :key="index"
            >
              <InlineText :text="paragraph" />
            </p>
          </div>
          <p
            v-if="gain && gainText"
            class="mt-3 font-mono text-xs tabular-nums"
            :class="paletteClass(gain.chapter.colour)"
            data-testid="radar-gain"
          >
            <span aria-hidden="true">{{ gainText.short }}</span>
            <span class="sr-only">{{ gainText.long }}</span>
          </p>
        </div>
        <SkillRadar
          class="mx-auto mt-5 w-47.5 sm:mt-0"
          :axes="radar"
          :from="gain ? radarBefore : null"
          :highlight="place.chapter.id"
        />
      </div>

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
    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-end gap-2">
        <UButton
          color="neutral"
          :label="t('debrief.stay')"
          @click="open = false"
        />
        <UButton
          v-if="next"
          color="primary"
          variant="solid"
          trailing-icon="i-lucide-arrow-right"
          :to="levelPath(next)"
          :label="t('debrief.next')"
        />
        <UButton
          v-else
          color="primary"
          variant="solid"
          :to="trackTo"
          :label="t('debrief.all')"
        />
      </div>
    </template>
  </UModal>
</template>
