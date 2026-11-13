<script setup lang="ts">
import { formatCredit, radarGain, trackRadar } from '#shared/levels'
import type { Level, LevelPlace, Progress, Scenario } from '#shared/levels'

// Shown when a level is solved, in every track: why the solution works, the skill radar with this chapter's axis lit (it
// grows once from the shape before the solve, ADR 0007), how you did (the `stats` slot: each track counts its own run,
// git: GitRunStats) and where to go next.
const props = defineProps<{
  level: Scenario
  /** Where the level sits: its track's radar, its chapter's axis. */
  place: LevelPlace
  /** The progress right before this solve; null when the debrief is shown again without a new solve. */
  progressBefore: Progress | null
  next: Level | null
  /** Where "Back to the track" goes after the last available level. */
  trackTo: string
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

      <slot name="stats" />
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
