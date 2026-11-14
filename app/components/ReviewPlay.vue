<script setup lang="ts">
import type { LevelPlace, ReviewLevel } from '#shared/levels'

// The Working with AI play page (the play page picks it for a level of the track; docs/features/ui.md, "Working with
// AI play page"): in the shared PlayFrame, the level panel left (the story, the goals, your comments, the hints), Sous's
// pull request in the middle (its description, the diff file by file with your comments, the review box), and Run the
// PR on the right (the Debugging sandbox's App and Console). Below lg the three stack in that order. No layout switch.
const props = defineProps<{
  level: ReviewLevel
  place: LevelPlace
}>()

const { t } = useI18n()

const play = useReviewPlay(props.level)
const { session, goals, next, stats, falseAlarms, debriefOpen, progressBefore, sparkKey, hint, reset, again } = play

const revealedHints = computed(() => props.level.kind === 'scenario' ? props.level.hints.slice(0, session.value.hintsUsed) : [])

// the debrief gives the focus back to the review box (where the next look starts)
const pullRequest = useTemplateRef<{ focusReview: () => void }>('pullRequest')
const focusReview = () => pullRequest.value?.focusReview()
</script>

<template>
  <div class="mb-3 flex min-h-8 items-center justify-between gap-4">
    <p class="flex min-w-0 items-center gap-2 text-xs text-muted">
      <UIcon
        name="i-lucide-git-pull-request"
        class="size-4 shrink-0"
      />
      {{ t('review.note') }}
    </p>
    <p
      class="shrink-0 rounded-md border border-default px-2.5 py-1 font-mono text-xs text-muted tabular-nums"
      data-testid="false-alarms"
    >
      {{ t('review.falseAlarms', { n: falseAlarms }) }}
    </p>
  </div>

  <PlayFrame tabs>
    <template #panel>
      <LevelPanel
        class="min-w-0 lg:min-h-0 lg:flex-[1_1_0] lg:overflow-y-auto lg:pr-1"
        :level="level"
        :place="place"
        :goals="goals"
        :hints-used="session.hintsUsed"
        :solved="session.solved"
        :next="next"
        @hint="hint"
        @reset="reset"
        @again="again"
        @debrief="debriefOpen = true"
      >
        <ReviewCommentList
          :play="play"
          @review="focusReview"
        />
        <section
          v-if="revealedHints.length"
          aria-labelledby="hints-heading"
        >
          <h2
            id="hints-heading"
            class="font-mono text-xs font-medium text-muted"
          >
            {{ t('debugging.hints') }}
          </h2>
          <ol
            class="mt-2 space-y-2"
            aria-live="polite"
          >
            <li
              v-for="(text, index) in revealedHints"
              :key="index"
              class="rounded-lg border border-default bg-elevated px-3 py-2 text-sm text-toned"
              data-testid="hint"
            >
              <span class="me-1 font-mono text-xs text-muted tabular-nums">{{ index + 1 }}/{{ level.hints.length }}</span>
              <InlineText :text="text" />
            </li>
          </ol>
        </section>
      </LevelPanel>
    </template>

    <template #default>
      <ReviewPullRequest
        ref="pullRequest"
        :play="play"
        class="min-w-0 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1"
      />
    </template>

    <template #side>
      <div class="relative h-full max-lg:h-[36rem]">
        <ReviewRun :level="level" />
        <SparkBurst :trigger="sparkKey" />
      </div>
    </template>
  </PlayFrame>

  <DebriefDialog
    v-if="level.kind === 'scenario'"
    v-model:open="debriefOpen"
    :level="level"
    :place="place"
    :progress-before="progressBefore"
    :next="next"
    :track-to="trackPath(place.track.id)"
    @closed="focusReview"
  >
    <template #stats>
      <ReviewRunStats
        :level="level"
        :stats="stats"
      />
    </template>
  </DebriefDialog>
</template>
