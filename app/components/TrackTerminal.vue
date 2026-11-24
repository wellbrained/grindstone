<script setup lang="ts">
import { placeName } from '#shared/levels'
import type { Track } from '#shared/levels'
import { trackLook } from '~/utils/track-look'
import { trackCardAction, trackView } from '~/utils/track-view'

// A live track on the home page as a terminal window (DESIGN.md, "Track terminal"): its tab names the track's folder and
// your count, the output of `grindstone show <track>` is the pitch (title, tagline, description) and the chapters as a
// tree, each a link to its section on the track page with its progress in blocks. The primary action never repeats the
// Continue card above it (`trackCardAction`), and only a first visit's first track gets the ember one (One Ember Rule).
const props = defineProps<{
  track: Track
  /** The track the page's Continue card points at, if any. */
  continueTrackId: string | null
  /** This window holds the page's one ember action (a first visit's first track). */
  emphasis?: boolean
}>()

const { t } = useI18n()
const { progress } = useProgress()

const view = computed(() => trackView(props.track, progress.value))
const action = computed(() => trackCardAction(props.track, progress.value, props.continueTrackId))
const look = computed(() => trackLook(props.track.id))
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
  <TerminalWindow
    :command="`grindstone show ${track.id}`"
    :aria-labelledby="headingId"
    :data-testid="`track-${track.id}`"
  >
    <!-- the window's tab: the track's folder, its size and your count -->
    <template #tab>
      <UIcon
        :name="look.icon"
        class="size-4 shrink-0"
        :class="look.class"
      />
      <span
        aria-hidden="true"
        class="text-toned"
      >~/{{ track.id }}</span>
      <!-- a phone's tab has room for the count only -->
      <span class="ml-auto truncate tabular-nums">
        <span class="max-sm:hidden">{{ size }} <span aria-hidden="true">·</span>&nbsp;</span>{{ t('track.solvedCount', { solved: view.count.solved, total: view.count.total }) }}
      </span>
    </template>

    <h2
      :id="headingId"
      class="mt-2 text-2xl font-semibold tracking-tight text-highlighted"
    >
      <NuxtLink
        :to="trackPath(track.id)"
        class="rounded-md hover:underline hover:decoration-(--ui-border-accented) hover:underline-offset-4 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
      >{{ track.title }}</NuxtLink>
    </h2>
    <p
      v-if="track.tagline"
      class="mt-0.5 text-lg text-balance"
      :class="look.class"
    >
      {{ track.tagline }}
    </p>
    <p class="mt-2.5 max-w-[68ch] text-pretty text-toned">
      {{ track.description }}
    </p>

    <!-- the chapters as a tree: each one jumps to its section on the track page -->
    <ol
      class="mt-4 font-mono text-[0.8125rem]"
      :aria-label="t('track.chaptersLabel', { track: track.title })"
    >
      <li
        v-for="(item, index) in view.chapters"
        :key="item.chapter.id"
      >
        <NuxtLink
          :to="`${trackPath(track.id)}#${item.chapter.id}`"
          class="-mx-2 grid min-h-7 grid-cols-[1rem_1.25rem_minmax(0,1fr)_3rem] sm:grid-cols-[1rem_1.25rem_minmax(0,1fr)_auto_3rem] items-center gap-x-1 rounded-md px-2 hover:bg-elevated pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          :data-chapter="item.chapter.id"
        >
          <span
            aria-hidden="true"
            :class="look.class"
          >{{ index === view.chapters.length - 1 ? '└' : '├' }}</span>
          <span
            aria-hidden="true"
            class="text-dimmed"
          >{{ index + 1 }}</span>
          <span
            class="truncate"
            :class="item.count.solved ? 'text-highlighted' : 'text-toned'"
          >{{ item.chapter.title }}</span>
          <template v-if="!item.coming">
            <BlockMeter
              class="max-sm:hidden"
              :class="look.class"
              :count="item.count"
            />
            <span class="text-right text-muted tabular-nums">
              <span aria-hidden="true">{{ item.count.solved }}/{{ item.count.total }}</span>
              <span class="sr-only">{{ t('track.solvedCount', { solved: item.count.solved, total: item.count.total }) }}</span>
            </span>
          </template>
          <span
            v-else
            class="text-right font-sans text-xs text-muted sm:col-span-2"
          >{{ t('track.coming') }}</span>
        </NuxtLink>
      </li>
    </ol>

    <div class="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-5">
      <UButton
        size="lg"
        :color="emphasis ? 'primary' : 'neutral'"
        :variant="emphasis ? 'solid' : 'outline'"
        trailing-icon="i-lucide-arrow-right"
        :to="primary.to"
        :label="primary.label"
        :data-testid="`track-${track.id}-primary`"
        :data-action="action.kind"
        :data-emphasis="emphasis ? 'true' : 'false'"
      />
      <UButton
        v-if="action.kind !== 'open'"
        size="lg"
        color="neutral"
        :to="trackPath(track.id)"
        :label="t('home.card.chapters')"
        :data-testid="`track-${track.id}-open`"
      />
      <NuxtLink
        v-if="track.cheatSheet"
        :to="track.cheatSheet"
        class="inline-flex min-h-6 items-center gap-2 rounded-md px-1 text-sm text-muted hover:text-highlighted pointer-coarse:min-h-11"
      >
        <UIcon
          name="i-lucide-book-open"
          class="size-4"
        />
        <!-- the window names the track already; a screen reader hears the whole name -->
        <span aria-hidden="true">{{ t('layout.nav.cheat') }}</span>
        <span class="sr-only">{{ t('track.cheat', { track: track.title }) }}</span>
      </NuxtLink>
    </div>
  </TerminalWindow>
</template>
