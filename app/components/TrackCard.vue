<script setup lang="ts">
import { placeName } from '#shared/levels'
import type { Track } from '#shared/levels'
import { trackCardAction, trackView } from '~/utils/track-view'

// A live track on the home page, from its data alone (title, tagline, description, cheat sheet): its weight, its progress
// and its chapters drawn as in the track page's rail. The primary button never repeats the Continue card above it
// (`trackCardAction`): Start for an untouched track, Open the track once Continue points here.
const props = defineProps<{
  track: Track
  /** The track the page's Continue card points at, if any. */
  continueTrackId: string | null
}>()

const { t } = useI18n()
const { progress } = useProgress()

const view = computed(() => trackView(props.track, progress.value))
const action = computed(() => trackCardAction(props.track, progress.value, props.continueTrackId))
const headingId = computed(() => `track-${props.track.id}-heading`)

const size = computed(() => t('track.size', {
  levels: t('track.levels', view.value.count.total),
  chapters: t('track.chapters', props.track.chapters.length)
}))
const primary = computed(() => {
  const current = action.value
  if (current.kind === 'open') return { to: trackPath(props.track.id), label: t('home.card.open', { track: props.track.title }) }
  const { level } = current.place
  return { to: levelPath(level), label: t(`home.card.${current.kind}`, { name: placeName(current.place) }) }
})
</script>

<template>
  <section
    class="grid gap-8 rounded-2xl border border-default bg-elevated p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-14 lg:p-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]"
    :aria-labelledby="headingId"
    :data-testid="`track-${track.id}`"
  >
    <div class="flex flex-col">
      <h2
        :id="headingId"
        class="text-3xl font-semibold tracking-tight text-highlighted"
      >
        <NuxtLink
          :to="trackPath(track.id)"
          class="rounded-md hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >{{ track.title }}</NuxtLink>
      </h2>
      <p
        v-if="track.tagline"
        class="mt-2 max-w-2xl text-xl text-balance text-highlighted"
      >
        {{ track.tagline }}
      </p>
      <p class="mt-3 max-w-2xl text-pretty text-toned">
        {{ track.description }}
      </p>

      <div class="mt-6 max-w-md">
        <p class="text-sm text-muted tabular-nums">
          {{ size }} <span aria-hidden="true">·</span> {{ t('track.solvedCount', { solved: view.count.solved, total: view.count.total }) }}
        </p>
        <ProgressMeter
          class="mt-2 h-1.5 text-primary"
          :count="view.count"
        />
      </div>

      <div class="mt-7 flex flex-wrap items-center gap-3 lg:mt-auto lg:pt-8">
        <UButton
          size="xl"
          color="primary"
          variant="solid"
          trailing-icon="i-lucide-arrow-right"
          :to="primary.to"
          :label="primary.label"
          :data-testid="`track-${track.id}-primary`"
          :data-action="action.kind"
        />
        <UButton
          v-if="action.kind !== 'open'"
          size="xl"
          color="neutral"
          :to="trackPath(track.id)"
          :label="t('home.card.chapters')"
          :data-testid="`track-${track.id}-open`"
        />
        <NuxtLink
          v-if="track.cheatSheet"
          :to="track.cheatSheet"
          class="inline-flex items-center gap-2 rounded-md px-1 text-sm text-muted hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
        >
          <UIcon
            name="i-lucide-book-open"
            class="size-4"
          />
          {{ t('track.cheat', { track: track.title }) }}
        </NuxtLink>
      </div>
    </div>

    <div class="border-t border-default pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
      <ChapterNav
        class="-mx-3 [--dot-ground:var(--ui-bg-elevated)]"
        :label="t('track.chaptersLabel', { track: track.title })"
        :chapters="view.chapters"
        :track-id="track.id"
      />
    </div>
  </section>
</template>
