<script setup lang="ts">
import { continueTarget, hasProgress, levelIntro, placeName, trackLevels } from '#shared/levels'
import type { Track } from '#shared/levels'
import { relativeTime } from '~/utils/relative-time'
import { storyLead } from '~/utils/track-view'

// One button back into practice. Opens the entry you last played while it is unsolved, else next up (the first
// unsolved entry); with nothing played yet it is "Start here"; with nothing unsolved left, an entry you flagged
// "practise again". With every level solved and nothing flagged it says so and points at the cheat sheet (and, on the
// home page, the track page). The entry is the heading; where it sits and when you last played it is a quiet line below.
const props = defineProps<{
  track: Track
  /** home: the meta line names the track too, and the solved state links to the track page. */
  context: 'track' | 'home'
}>()

const { t } = useI18n()
const { progress } = useProgress()

const target = computed(() => continueTarget(props.track, progress.value))
const started = computed(() => hasProgress(progress.value))
const total = computed(() => trackLevels(props.track).length)

const kind = computed(() => {
  const reason = target.value?.reason
  if (reason === 'resume' || reason === 'practise') return reason
  return started.value ? 'next' : 'start'
})
const where = computed(() => {
  const place = target.value?.place
  // a practice task is placed by its scenario: "Basics › 1.1 First commit"
  const chapter = place?.scenario ? `${place.chapter.title} › ${placeName(place.scenario)}` : place?.chapter.title ?? ''
  return props.context === 'home' ? `${props.track.title} › ${chapter}` : chapter
})
const played = computed(() => target.value?.at ? relativeTime(target.value.at, Date.now()) : null)
</script>

<template>
  <section
    class="@container rounded-xl border border-accented bg-elevated p-4 sm:p-5"
    :aria-labelledby="target ? 'continue-meta continue-heading' : 'continue-heading'"
    data-testid="continue-card"
    :data-kind="target ? kind : 'done'"
  >
    <div
      v-if="target"
      class="flex flex-col gap-4 @2xl:flex-row @2xl:items-center @2xl:gap-5"
    >
      <span class="mt-2 hidden self-start @2xl:flex">
        <CommitDot
          class="[--dot-ground:var(--ui-bg-elevated)]"
          :colour="target.place.chapter.colour"
          state="next"
        />
      </span>
      <div class="min-w-0 flex-1">
        <h2
          id="continue-heading"
          class="text-lg font-semibold text-balance text-highlighted"
        >
          <span
            v-if="target.place.number"
            class="mr-1.5 font-mono text-base font-normal text-muted tabular-nums"
          >{{ target.place.number }}</span>{{ target.place.level.title }}
        </h2>
        <p
          id="continue-meta"
          class="mt-0.5 text-sm text-muted"
        >
          {{ t(`continue.${kind}`, { where }) }}<template v-if="played">
            <span aria-hidden="true"> · </span>{{ t('continue.played', { when: played }) }}
          </template>
        </p>
        <p class="mt-2 line-clamp-2 max-w-3xl text-sm text-toned">
          <InlineText :text="storyLead(levelIntro(target.place.level))" />
        </p>
      </div>
      <UButton
        size="lg"
        color="primary"
        variant="solid"
        trailing-icon="i-lucide-arrow-right"
        class="shrink-0 self-start @2xl:self-center"
        :to="levelPath(target.place.level)"
        :label="t(`continue.button.${kind}`)"
        data-testid="continue"
      />
    </div>

    <div
      v-else
      class="flex flex-col gap-4 @2xl:flex-row @2xl:items-center @2xl:gap-5"
    >
      <UIcon
        name="i-lucide-circle-check"
        class="size-6 shrink-0 self-start text-success"
      />
      <div class="min-w-0 flex-1">
        <h2
          id="continue-heading"
          class="text-lg font-semibold text-highlighted"
        >
          {{ t('continue.done.title', { track: track.title }) }}
        </h2>
        <p class="mt-1 max-w-3xl text-sm text-muted">
          {{ t('continue.done.text', { n: total }) }}
        </p>
      </div>
      <div class="flex shrink-0 flex-wrap gap-2">
        <UButton
          v-if="context === 'home'"
          color="primary"
          :to="trackPath(track.id)"
          :label="t('continue.done.track', { track: track.title })"
        />
        <UButton
          v-if="track.cheatSheet"
          color="neutral"
          icon="i-lucide-book-open"
          :to="track.cheatSheet"
          :label="t('continue.done.cheat')"
        />
      </div>
    </div>
  </section>
</template>
