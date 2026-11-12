<script setup lang="ts">
import type { LevelRowView } from '~/utils/track-view'

// One level on the track page; the whole row is the link. Commit dot, number (3.2), title, the commands it practises,
// status. Below md the commands wrap under the title. The status is text, never only the dot's colour.
// The chapter's lane runs through the dots (the signature: the section reads as a branch history): solid between two
// solved levels, dim around open ones. `draw` animates a half of the lane once (a level you just solved): the step says
// when, so the halves of neighbouring rows draw as one line from the dot above, through the new dot, to the one below.
const props = defineProps<{
  row: LevelRowView
  draw?: { in?: number, out?: number }
}>()

const { t } = useI18n()

const status = computed(() => t(`track.status.${props.row.state}`))
const label = computed(() => {
  const { number, level } = props.row.place
  return t('track.rowLabel', { number, title: level.title, status: status.value, commands: props.row.commands.join(', ') })
})

/** The animation of one half, only for a solid stretch with a step. */
function drawOf(half: 'in' | 'out') {
  const step = props.draw?.[half]
  if (step === undefined || props.row.lane[half] !== 'solid') return null
  return { class: 'lane-draw', style: { '--lane-step': String(step) } }
}
</script>

<template>
  <li class="border-t border-muted">
    <NuxtLink
      :to="levelPath(row.place.level)"
      class="relative grid grid-cols-[0.75rem_2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-lg px-3 py-3 transition-colors hover:bg-elevated hover:[--dot-ground:var(--ui-bg-elevated)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary md:grid-cols-[0.75rem_2.75rem_minmax(0,1fr)_minmax(0,15rem)_6rem] md:gap-x-4"
      :class="[paletteClass(row.place.chapter.colour), { 'bg-elevated [--dot-ground:var(--ui-bg-elevated)]': row.state === 'next' }]"
      :aria-label="label"
      :data-level="row.place.level.id"
      :data-state="row.state"
    >
      <!-- the lane: centred on the dot column (px-3 + half of 0.75rem), split at the dot (py-3 + half the 1.5rem first line),
           across the row border into the next row -->
      <span
        v-if="row.lane.in"
        aria-hidden="true"
        class="absolute -top-px left-4.5 h-[calc(1.5rem+1px)] w-0.5 -translate-x-1/2 bg-current"
        :class="[{ 'opacity-35': row.lane.in === 'dim' }, drawOf('in')?.class]"
        :style="drawOf('in')?.style"
      />
      <span
        v-if="row.lane.out"
        aria-hidden="true"
        class="absolute top-6 bottom-0 left-4.5 w-0.5 -translate-x-1/2 bg-current"
        :class="[{ 'opacity-35': row.lane.out === 'dim' }, drawOf('out')?.class]"
        :style="drawOf('out')?.style"
      />
      <CommitDot
        class="mt-1.5 self-start"
        :colour="row.place.chapter.colour"
        :state="row.state"
      />
      <span class="font-mono text-xs text-muted tabular-nums">{{ row.place.number }}</span>
      <span class="col-start-3 row-start-1 min-w-0 font-medium text-highlighted">{{ row.place.level.title }}</span>
      <span class="col-span-2 col-start-3 row-start-2 flex flex-wrap gap-1.5 md:col-span-1 md:col-start-4 md:row-start-1">
        <code
          v-for="command in row.commands"
          :key="command"
          class="rounded-sm border border-default px-1.5 font-mono text-xs leading-5 text-muted"
        >{{ command }}</code>
      </span>
      <span
        class="col-start-4 row-start-1 text-right text-sm md:col-start-5"
        :class="{ 'text-success': row.state === 'solved', 'font-medium text-primary': row.state === 'next', 'text-muted': row.state === 'open' }"
      >{{ status }}</span>
    </NuxtLink>
  </li>
</template>
