<script setup lang="ts">
import type { LevelPlace, ReviewLevel } from '#shared/levels'
import { testFilesOf } from '#shared/levels'

// The Working with AI play page (the play page picks it for a level of the track; docs/features/ui.md, "Working with
// AI play page"): in the shared PlayFrame, the level panel left (the story, the goals, your comments, the hints), Sous's
// pull request in the middle (its description, the diff file by file with your comments, the review box), and Run the
// PR on the right (the Debugging sandbox's App and Console). Below lg the level panel comes first, then tabs: Diff (the
// pull request), Review (the review box) and Run, all mounted, so a draft or a comment stays when you switch. No layout
// switch.
// A steer level (chapter 7) changes with Sous's commits: the pull request and Run the PR are mounted anew for each
// round (keyed by it), and after a commit the focus goes to its round in the timeline.
const props = defineProps<{
  level: ReviewLevel
  place: LevelPlace
}>()

const { t } = useI18n()

const play = useReviewPlay(props.level)
const { session, goals, next, stats, falseAlarms, debriefOpen, progressBefore, sparkKey, hint, reset, again, round, runnable } = play
const counters = computed(() => stripCounters({ track: 'ai', falseAlarms: falseAlarms.value }))

/** Below lg: the one pane shown. */
const pane = ref<ReviewPane>('diff')
const shown = (name: ReviewPane) => pane.value === name ? '' : 'max-lg:hidden'
const paneLabels = computed(() => Object.fromEntries(REVIEW_PANES.map(name => [name, t(`review.panes.${name}`)])))
/** Something in a pane is about to be shown or focused (a comment, a diff line, the review box): bring it on screen. */
async function showPane(name: ReviewPane) {
  pane.value = name
  await nextTick()
}
provide(SHOW_REVIEW_PANE, showPane)

/** Run the PR with the Tests panel (chapter 3) needs a taller column on phones. */
const hasTests = computed(() => props.level.run !== undefined && testFilesOf(runnable.value.pr.head).length > 0)

// Sous answered a request for changes: show what it did (its round in the timeline), not the top of the page
watch(round, async (now, before) => {
  if (now <= before) return
  await showPane('diff')
  document.getElementById(`steer-round-${before}`)?.focus()
})

const revealedHints = computed(() => props.level.kind === 'scenario' ? props.level.hints.slice(0, session.value.hintsUsed) : [])

// the debrief and Finish your review give the focus to the review box (where the next look starts)
const reviewBox = useTemplateRef<{ focus: () => void }>('reviewBox')
async function focusReview() {
  await showPane('review')
  reviewBox.value?.focus()
}
</script>

<template>
  <PlayStrip
    icon="i-lucide-git-pull-request"
    :note="t('review.note')"
    :counters="counters"
  />

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
      <!-- below lg: one pane at a time -->
      <PlayTabs
        v-model="pane"
        :names="REVIEW_PANES"
        :labels="paneLabels"
        :label="t('review.panes.label')"
        id-prefix="review"
      />
      <!-- from lg: the pull request and the review box at its end scroll together -->
      <div class="min-w-0 space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
        <div
          id="review-diff"
          role="tabpanel"
          aria-labelledby="review-tab-diff"
          :class="shown('diff')"
        >
          <ReviewPullRequest
            :key="round"
            :play="play"
          />
        </div>
        <div
          id="review-review"
          role="tabpanel"
          aria-labelledby="review-tab-review"
          :class="shown('review')"
        >
          <ReviewSubmit
            ref="reviewBox"
            :key="round"
            :play="play"
          />
        </div>
      </div>
    </template>

    <template #side>
      <div
        id="review-run"
        role="tabpanel"
        aria-labelledby="review-tab-run"
        class="relative h-full"
        :class="[hasTests ? 'max-lg:h-[46rem]' : 'max-lg:h-[36rem]', shown('run')]"
      >
        <ReviewRun
          :key="round"
          :level="runnable"
        />
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
    <template #results>
      <ReviewRunStats :stats="stats" />
    </template>
    <template #details>
      <ReviewIssues :level="level" />
    </template>
  </DebriefDialog>
</template>
