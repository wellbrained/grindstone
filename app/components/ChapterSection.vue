<script setup lang="ts">
import type { RowLanes, ChapterView } from '~/utils/track-view'

// One chapter on the track page: heading with its commit dot and count, the chapter ⋯ menu, a one-line description, the
// rows (scenarios on the main line, practice tasks on side branches). A chapter without levels shows its description
// and a quiet "Coming". The heading takes the focus after a jump from the rail (tabindex -1), so keyboard and screen
// reader users land where they asked to go.
const props = defineProps<{
  view: ChapterView
  /** A level solved for the first time since the page was last shown: its lane draws in once. */
  justSolved?: string | null
}>()

const { t } = useI18n()
const { chapterItems } = useProgressActions()

const headingId = computed(() => `${props.view.chapter.id}-heading`)

type Draw = Partial<Record<keyof RowLanes, number>>

// The lane of a just solved entry draws top-down in four steps: into it from above (0), into its dot (1), out of its dot
// (2), on to the next dot (3). A scenario's line runs on the main lane past its practice tasks; a practice task's on its
// side branch.
const draws = computed((): Map<number, Draw> => {
  const rows = props.view.rows
  const at = rows.findIndex(row => row.place.level.id === props.justSolved)
  const steps = new Map<number, Draw>()
  if (at === -1) return steps
  const add = (index: number, draw: Draw) => {
    if (index >= 0 && index < rows.length) steps.set(index, { ...steps.get(index), ...draw })
  }
  const isScenario = (index: number) => rows[index]?.place.level.kind === 'scenario'

  if (!isScenario(at)) {
    add(at - 1, isScenario(at - 1) ? { fork: 0 } : { sideOut: 0 })
    add(at, { sideIn: 1, sideOut: 2 })
    add(at + 1, { sideIn: 3 })
    return steps
  }
  let previous = at - 1
  while (previous >= 0 && !isScenario(previous)) previous--
  // the first scenario has nothing above it: start with its own lower half
  const shift = previous === -1 ? 2 : 0
  if (previous !== -1) {
    add(previous, { out: 0 })
    for (let i = previous + 1; i < at; i++) add(i, { through: 0 })
    add(at, { in: 1 })
  }
  add(at, { out: 2 - shift, fork: 2 - shift })
  let i = at + 1
  for (; i < rows.length && !isScenario(i); i++) add(i, i === at + 1 ? { through: 3 - shift, sideIn: 3 - shift } : { through: 3 - shift })
  add(i, { in: 3 - shift })
  return steps
})
</script>

<template>
  <section
    :id="view.chapter.id"
    :aria-labelledby="headingId"
    class="scroll-mt-[calc(var(--ui-header-height)+4.5rem)] lg:scroll-mt-[calc(var(--ui-header-height)+2rem)]"
    :data-chapter="view.chapter.id"
  >
    <div class="flex items-start justify-between gap-3">
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
      <MoreMenu
        v-if="!view.coming"
        class="mr-1.5 shrink-0"
        :items="chapterItems(view.chapter)"
        :label="t('menu.chapter.label', { chapter: view.chapter.title })"
      />
    </div>
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
        :draw="draws.get(index)"
      />
    </ol>
  </section>
</template>
