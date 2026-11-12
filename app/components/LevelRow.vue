<script setup lang="ts">
import { placeName } from '#shared/levels'
import type { LevelRowView, RowLanes } from '~/utils/track-view'
import { timeLabel } from '~/utils/track-view'

// One entry on the track page; the whole row is the link, the ⋯ menu sits beside it (outside the link).
// A scenario: commit dot on the chapter's main line, number (1.2), title with the commands it practises, difficulty and
// time, status. A practice task (preview G2): a smaller dot on a short side branch that forks off its scenario, no
// number, its title and time. The status is text ("Solved · best 3 cmds"), never only the dot's colour.
// Lanes: solid between two solved entries, dim around open ones. `draw` animates parts of the lane once (an entry you
// just solved); the step says when, so neighbouring rows draw as one line.
const props = defineProps<{
  row: LevelRowView
  draw?: Partial<Record<keyof RowLanes, number>>
}>()

const { t } = useI18n()
const { entryItems } = useProgressActions()

const practice = computed(() => props.row.place.level.kind === 'practice')
const best = computed(() => props.row.state === 'solved' ? props.row.progress?.best ?? null : null)
const flagged = computed(() => props.row.progress?.practiseAgain === true)
const time = computed(() => timeLabel(props.row.place.level.minutes))
const timeText = computed(() => t(`track.time.${time.value.unit}`, { n: time.value.value }))
const difficulty = computed(() => props.row.place.level.difficulty)

const status = computed(() => t(`track.status.${props.row.state}`))
const label = computed(() => {
  const { place } = props.row
  const parts = [
    practice.value && place.scenario
      ? t('track.practiceName', { scenario: `${place.scenario.number} ${place.scenario.level.title}`, title: place.level.title })
      : placeName(place),
    best.value ? t('track.statusBest', { status: status.value, n: best.value.commands }) : status.value
  ]
  if (flagged.value) parts.push(t('track.flagged'))
  const spoken = t(`track.timeLong.${time.value.unit}`, { n: time.value.value })
  const meta = practice.value
    ? t('track.aboutTime', { time: spoken })
    : t('track.difficultyTime', { n: difficulty.value, time: spoken })
  return `${parts.join(', ')}. ${meta}. ${t('track.practises', { commands: props.row.commands.join(', ') })}`
})

/** The animation of one lane part, only for a solid stretch with a step. */
function drawOf(part: keyof RowLanes) {
  const step = props.draw?.[part]
  if (step === undefined || props.row.lane[part] !== 'solid') return null
  return { class: 'lane-draw', style: { '--lane-step': String(step) } }
}
const titleColumn = computed(() => practice.value ? 'col-span-2 col-start-2 md:col-span-1 md:col-start-3' : 'col-start-3')
const laneClass = (part: keyof RowLanes) => [{ 'opacity-35': props.row.lane[part] === 'dim' }, drawOf(part)?.class]
</script>

<template>
  <li class="relative border-t border-muted">
    <NuxtLink
      :to="levelPath(row.place.level)"
      class="relative grid grid-cols-[2rem_2.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-lg pr-11 pl-3 transition-colors hover:bg-elevated hover:[--dot-ground:var(--ui-bg-elevated)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary md:grid-cols-[2rem_2.75rem_minmax(0,1fr)_5.5rem_12rem] md:gap-x-4 xl:grid-cols-[2rem_2.75rem_minmax(0,1fr)_5.5rem_16rem]"
      :class="[paletteClass(row.place.chapter.colour), practice ? 'py-2' : 'py-3', { 'bg-elevated [--dot-ground:var(--ui-bg-elevated)]': row.state === 'next' }]"
      :aria-label="label"
      :data-level="row.place.level.id"
      :data-kind="row.place.level.kind"
      :data-state="row.state"
    >
      <!-- the lanes: the main line is centred on the scenario dot (pl-3 + half of 0.75rem = 18px), the side branch 14px
           to its right (32px). A scenario's dot centre is 24px down (py-3 + half the first line), a practice dot's 20px. -->
      <span
        v-if="row.lane.in"
        aria-hidden="true"
        class="absolute -top-px left-4.5 h-[calc(1.5rem+1px)] w-0.5 -translate-x-1/2 bg-current"
        :class="laneClass('in')"
        :style="drawOf('in')?.style"
      />
      <span
        v-if="row.lane.out"
        aria-hidden="true"
        class="absolute top-6 bottom-0 left-4.5 w-0.5 -translate-x-1/2 bg-current"
        :class="laneClass('out')"
        :style="drawOf('out')?.style"
      />
      <span
        v-if="row.lane.through"
        aria-hidden="true"
        class="absolute -top-px bottom-0 left-4.5 w-0.5 -translate-x-1/2 bg-current"
        :class="laneClass('through')"
        :style="drawOf('through')?.style"
      />
      <template v-if="row.lane.fork">
        <!-- the fork: a curve from the dot (18px, 24px) to the branch (32px, 40px), then straight down -->
        <svg
          aria-hidden="true"
          class="absolute top-6 left-4 h-4 w-4.5 overflow-visible"
          :class="laneClass('fork')"
          :style="drawOf('fork')?.style"
          viewBox="0 0 18 16"
          fill="none"
        >
          <path
            d="M2 0C2 9 16 7 16 16"
            stroke="currentColor"
            stroke-width="2"
          />
        </svg>
        <span
          aria-hidden="true"
          class="absolute top-10 bottom-0 left-8 w-0.5 -translate-x-1/2 bg-current"
          :class="laneClass('fork')"
          :style="drawOf('fork')?.style"
        />
      </template>
      <span
        v-if="row.lane.sideIn"
        aria-hidden="true"
        class="absolute -top-px left-8 h-[calc(1.25rem+1px)] w-0.5 -translate-x-1/2 bg-current"
        :class="laneClass('sideIn')"
        :style="drawOf('sideIn')?.style"
      />
      <span
        v-if="row.lane.sideOut"
        aria-hidden="true"
        class="absolute top-5 bottom-0 left-8 w-0.5 -translate-x-1/2 bg-current"
        :class="laneClass('sideOut')"
        :style="drawOf('sideOut')?.style"
      />

      <CommitDot
        v-if="practice"
        class="mt-2 ml-4 self-start"
        size="xs"
        :colour="row.place.chapter.colour"
        :state="row.state"
      />
      <CommitDot
        v-else
        class="mt-1.5 self-start"
        :colour="row.place.chapter.colour"
        :state="row.state"
      />
      <!-- a practice task has no number: below md its title takes that column, from md the titles line up -->
      <span
        class="self-start pt-0.5 font-mono text-xs leading-5 text-muted tabular-nums"
        :class="{ 'hidden md:block': practice }"
      >{{ row.place.number }}</span>

      <span
        class="row-start-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
        :class="titleColumn"
      >
        <span
          class="min-w-0"
          :class="practice ? 'text-toned' : 'font-medium text-highlighted'"
        >{{ row.place.level.title }}</span>
        <code
          v-for="command in row.commands"
          :key="command"
          class="rounded-sm border border-default px-1.5 font-mono text-xs leading-5 text-muted"
        >{{ command }}</code>
      </span>

      <!-- below md one line under the title (status first); from md two columns of their own -->
      <span
        class="row-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 md:contents"
        :class="titleColumn"
      >
        <span
          class="flex flex-wrap items-center gap-x-1.5 text-sm md:col-start-5 md:row-start-1 md:justify-end md:text-right"
          data-testid="row-status"
        >
          <span :class="{ 'text-success': row.state === 'solved', 'font-medium text-primary': row.state === 'next', 'text-muted': row.state === 'open' }">{{ status }}</span>
          <span
            v-if="best"
            class="font-mono text-xs text-muted tabular-nums"
          ><span aria-hidden="true">· </span>{{ t('track.best', best.commands) }}</span>
          <span
            v-if="flagged"
            class="flex items-center gap-1 text-xs whitespace-nowrap text-warning"
          >
            <UIcon
              name="i-lucide-flag"
              class="size-3.5"
            />
            {{ t('track.flagged') }}
          </span>
        </span>
        <!-- difficulty and time: a scenario shows both, a practice task its time -->
        <span class="flex items-center gap-2 font-mono text-xs text-muted tabular-nums md:col-start-4 md:row-start-1 md:justify-end">
          <span
            v-if="!practice"
            class="flex gap-0.5"
            :title="t('track.difficulty', { n: difficulty })"
          >
            <span
              v-for="n in 3"
              :key="n"
              class="size-1.5 rounded-full border border-current"
              :class="n <= difficulty ? 'bg-current text-toned' : 'text-dimmed'"
            />
          </span>
          <span class="whitespace-nowrap">{{ timeText }}</span>
        </span>
      </span>
    </NuxtLink>
    <MoreMenu
      class="absolute right-1.5"
      :class="practice ? 'top-1.5' : 'top-2.5'"
      :items="entryItems(row.place)"
      :label="t('menu.entry.label', { name: placeName(row.place) })"
    />
  </li>
</template>
