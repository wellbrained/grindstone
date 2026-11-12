<script setup lang="ts">
import type { Level, LevelPlace } from '#shared/levels'
import { timeLabel } from '~/utils/track-view'

// Left column of the play page. A scenario: breadcrumb, title, story, the live goal checklist, Hint and Reset, the
// solved card with Show debrief and Next level. A practice task is the compact variant (preview "Stage only app.js"):
// breadcrumb through its scenario, title with "Practice · ~30 s", the task, its goal, one hint shown in place, and once
// solved a one-line why with Next and Again. The ⋯ menu beside the title holds Play again, "practise again" and
// Mark as not solved.
const props = defineProps<{
  level: Level
  /** Track, chapter and number of the level, for the breadcrumb back to the track page. */
  place: LevelPlace
  goals: { id: string, label: string, met: boolean }[]
  hintsUsed: number
  solved: boolean
  conflictedFiles: string[]
  next: Level | null
}>()

const emit = defineEmits<{
  hint: []
  reset: []
  again: []
  edit: [path: string]
  debrief: []
}>()

const { t } = useI18n()
const { entryItems } = useProgressActions()

const practice = computed(() => props.level.kind === 'practice' ? props.level : null)
const paragraphs = computed(() => props.level.kind === 'scenario' ? props.level.story.split(/\n{2,}/) : [props.level.task])
const metCount = computed(() => props.goals.filter(goal => goal.met).length)
const hintsTotal = computed(() => props.level.hints.length)
const time = computed(() => {
  const { value, unit } = timeLabel(props.level.minutes)
  return t(`track.time.${unit}`, { n: value })
})
// Play again restarts this page; Mark as not solved restarts it too (useProgress restarts open play pages)
const menu = computed(() => entryItems(props.place, { onPlayAgain: () => emit('again') }))
</script>

<template>
  <div
    class="flex flex-col gap-5"
    :data-kind="level.kind"
  >
    <header>
      <nav :aria-label="t('play.breadcrumb')">
        <ol class="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-muted">
          <li>
            <NuxtLink
              :to="trackPath(place.track.id)"
              class="rounded-sm hover:text-highlighted hover:underline focus-visible:outline-2 focus-visible:outline-primary"
              data-testid="crumb-track"
            >{{ place.track.title }}</NuxtLink>
          </li>
          <li class="flex items-center gap-x-1">
            <UIcon
              name="i-lucide-chevron-right"
              class="size-3 shrink-0 text-dimmed"
            />
            <NuxtLink
              :to="trackPath(place.track.id, place.chapter.id)"
              class="rounded-sm hover:text-highlighted hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            >{{ place.chapter.title }}</NuxtLink>
          </li>
          <li
            v-if="place.scenario"
            class="flex items-center gap-x-1"
          >
            <UIcon
              name="i-lucide-chevron-right"
              class="size-3 shrink-0 text-dimmed"
            />
            <NuxtLink
              :to="levelPath(place.scenario.level)"
              class="rounded-sm hover:text-highlighted hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            ><span class="font-mono tabular-nums">{{ place.scenario.number }}</span> {{ place.scenario.level.title }}</NuxtLink>
          </li>
          <!-- a practice task's trail ends at its scenario (the heading names the task, and it stays on one line) -->
          <li
            v-if="!place.scenario"
            class="flex items-center gap-x-1"
          >
            <UIcon
              name="i-lucide-chevron-right"
              class="size-3 shrink-0 text-dimmed"
            />
            <span aria-current="page"><span
              v-if="place.number"
              class="font-mono tabular-nums"
            >{{ place.number }}</span>{{ place.number ? ' ' : '' }}{{ level.title }}</span>
          </li>
        </ol>
      </nav>
      <div class="mt-1 flex items-start justify-between gap-2">
        <h1 class="text-2xl font-semibold text-balance text-highlighted">
          {{ level.title }}
        </h1>
        <MoreMenu
          class="-mr-1.5 shrink-0"
          :items="menu"
          :label="t('menu.entry.label', { name: level.title })"
        />
      </div>
      <p
        v-if="practice"
        class="mt-0.5 font-mono text-xs text-muted tabular-nums"
      >
        {{ t('practice.meta', { time }) }}
      </p>
    </header>

    <div class="space-y-3 text-sm text-default">
      <p
        v-for="(paragraph, index) in paragraphs"
        :key="index"
      >
        <InlineText :text="paragraph" />
      </p>
    </div>

    <section aria-labelledby="goals-heading">
      <h2
        id="goals-heading"
        class="flex items-baseline justify-between gap-2 font-mono text-xs font-medium text-muted"
      >
        {{ practice && goals.length === 1 ? t('goals.one') : t('goals.title') }}
        <span role="status">{{ t('goals.count', { met: metCount, total: goals.length }) }}</span>
      </h2>
      <ul class="mt-2 space-y-1.5">
        <li
          v-for="goal in goals"
          :key="goal.id"
          class="flex items-start gap-2 text-sm"
          :data-goal="goal.id"
          :data-met="goal.met"
        >
          <UIcon
            :name="goal.met ? 'i-lucide-circle-check' : 'i-lucide-circle'"
            class="mt-0.5 size-4 shrink-0"
            :class="goal.met ? 'text-success' : 'text-muted'"
          />
          <span :class="goal.met ? 'text-highlighted' : 'text-default'">
            <InlineText :text="goal.label" />
            <span class="sr-only">{{ goal.met ? t('goals.done') : t('goals.open') }}</span>
          </span>
        </li>
      </ul>
    </section>

    <!-- a practice task's one hint shows in place once revealed (a scenario's hints go to the terminal) -->
    <p
      v-if="practice && hintsUsed > 0"
      class="rounded-lg border border-default bg-elevated px-3 py-2 text-sm text-toned"
      data-testid="practice-hint"
    >
      <span class="font-medium text-highlighted">{{ t('practice.hint') }}</span>
      <InlineText :text="practice.hints[0]" />
    </p>

    <section
      v-if="conflictedFiles.length"
      aria-labelledby="conflicts-heading"
    >
      <h2
        id="conflicts-heading"
        class="font-mono text-xs font-medium text-muted"
      >
        {{ t('goals.conflicts') }}
      </h2>
      <ul class="mt-2 flex flex-wrap gap-2">
        <li
          v-for="path in conflictedFiles"
          :key="path"
        >
          <UButton
            size="sm"
            color="warning"
            icon="i-lucide-file-warning"
            class="font-mono"
            :label="path"
            :aria-label="t('goals.openFile', { path })"
            @click="$emit('edit', path)"
          />
        </li>
      </ul>
    </section>

    <div
      v-if="!(practice && solved)"
      class="flex flex-wrap gap-2"
    >
      <UButton
        color="neutral"
        icon="i-lucide-lightbulb"
        :label="practice ? t('practice.showHint') : t('play.hint', { used: hintsUsed, total: hintsTotal })"
        :disabled="!!practice && hintsUsed > 0"
        @click="$emit('hint')"
      />
      <UButton
        color="neutral"
        icon="i-lucide-rotate-ccw"
        :label="t('play.reset')"
        @click="$emit('reset')"
      />
    </div>

    <div
      v-if="solved && practice"
      class="space-y-3 rounded-lg border border-success bg-success/10 p-3"
      data-testid="practice-solved"
    >
      <p class="flex items-center gap-2 text-sm font-semibold text-highlighted">
        <UIcon
          name="i-lucide-circle-check"
          class="size-5 shrink-0 text-success"
        />
        {{ t('practice.solved') }}
      </p>
      <p class="text-sm text-toned">
        <InlineText :text="practice.why" />
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="next"
          color="primary"
          variant="solid"
          trailing-icon="i-lucide-arrow-right"
          :to="levelPath(next)"
          :label="t('practice.next')"
        />
        <UButton
          v-else
          color="primary"
          variant="solid"
          :to="trackPath(place.track.id)"
          :label="t('debrief.all')"
        />
        <UButton
          color="neutral"
          icon="i-lucide-rotate-ccw"
          :label="t('practice.again')"
          @click="$emit('again')"
        />
      </div>
    </div>

    <div
      v-else-if="solved"
      class="space-y-3 rounded-lg border border-success bg-success/10 p-3"
    >
      <p class="flex items-center gap-2 text-sm font-semibold text-highlighted">
        <UIcon
          name="i-lucide-circle-check"
          class="size-5 shrink-0 text-success"
        />
        {{ t('play.solved') }}
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          color="neutral"
          icon="i-lucide-book-open"
          :label="t('play.debrief')"
          @click="$emit('debrief')"
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
          :to="trackPath(place.track.id)"
          :label="t('debrief.all')"
        />
      </div>
    </div>
  </div>
</template>
