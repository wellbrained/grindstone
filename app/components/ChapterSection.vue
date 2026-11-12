<script setup lang="ts">
import type { ChapterView } from '~/utils/track-view'

// One chapter on the track page: heading with its commit dot and count, a one-line description, the level rows.
// A chapter without levels shows its description and a quiet "Coming". The heading takes the focus after a jump from
// the rail (tabindex -1), so keyboard and screen reader users land where they asked to go.
const props = defineProps<{
  view: ChapterView
  /** A level solved for the first time since the page was last shown: its lane draws in once. */
  justSolved?: string | null
}>()

const { t } = useI18n()

const headingId = computed(() => `${props.view.chapter.id}-heading`)

// the lane of a just solved level draws top-down in four halves: the row above (out), its own (in, out), the row below (in)
const solvedAt = computed(() => props.view.rows.findIndex(row => row.place.level.id === props.justSolved))
function drawOf(index: number) {
  const at = solvedAt.value
  if (at === -1) return undefined
  // the first row has no half above it: start with its own lower half
  const first = at === 0 ? 2 : 0
  if (index === at - 1) return { out: 0 }
  if (index === at) return { in: 1, out: 2 - first }
  if (index === at + 1) return { in: 3 - first }
  return undefined
}
</script>

<template>
  <section
    :id="view.chapter.id"
    :aria-labelledby="headingId"
    class="scroll-mt-[calc(var(--ui-header-height)+4.5rem)] lg:scroll-mt-[calc(var(--ui-header-height)+2rem)]"
    :data-chapter="view.chapter.id"
  >
    <h2
      :id="headingId"
      tabindex="-1"
      class="flex w-fit flex-wrap items-center gap-x-3 gap-y-1 rounded-md font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
      :class="view.coming ? 'text-lg text-toned' : 'text-xl text-highlighted'"
    >
      <CommitDot
        :colour="view.chapter.colour"
        :state="view.state"
      />
      <span><span class="sr-only">{{ t('track.chapterNumber', { n: view.chapter.number }) }}</span>{{ view.chapter.title }}</span>
      <span
        v-if="!view.coming"
        class="font-mono text-xs font-normal text-muted tabular-nums"
      >{{ t('track.solvedCount', { solved: view.count.solved, total: view.count.total }) }}</span>
      <span
        v-else
        class="rounded-sm border border-default px-1.5 text-xs leading-5 font-normal text-muted"
      >{{ t('track.coming') }}</span>
    </h2>
    <p class="mt-1.5 max-w-2xl text-sm text-pretty text-muted">
      {{ view.chapter.description }}
    </p>
    <ol
      v-if="view.rows.length"
      class="mt-4"
    >
      <LevelRow
        v-for="(row, index) in view.rows"
        :key="row.place.level.id"
        :row="row"
        :draw="drawOf(index)"
      />
    </ol>
  </section>
</template>
