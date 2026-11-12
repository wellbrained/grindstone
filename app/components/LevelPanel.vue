<script setup lang="ts">
import type { Level, LevelPlace } from '#shared/levels'

// Left column of the play page: title, story, the live goal checklist, hints and reset.
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

defineEmits<{
  hint: []
  reset: []
  edit: [path: string]
  debrief: []
}>()

const { t } = useI18n()

const paragraphs = computed(() => props.level.story.split(/\n{2,}/))
const metCount = computed(() => props.goals.filter(goal => goal.met).length)
const hintsTotal = computed(() => props.level.hints.length)
</script>

<template>
  <div class="flex flex-col gap-5">
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
          <li class="flex items-center gap-x-1">
            <UIcon
              name="i-lucide-chevron-right"
              class="size-3 shrink-0 text-dimmed"
            />
            <span aria-current="page"><span class="font-mono tabular-nums">{{ place.number }}</span> {{ level.title }}</span>
          </li>
        </ol>
      </nav>
      <h1 class="mt-1 text-2xl font-semibold text-highlighted">
        {{ level.title }}
      </h1>
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
        {{ t('goals.title') }}
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
            {{ goal.label }}
            <span class="sr-only">{{ goal.met ? t('goals.done') : t('goals.open') }}</span>
          </span>
        </li>
      </ul>
    </section>

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

    <div class="flex flex-wrap gap-2">
      <UButton
        color="neutral"
        icon="i-lucide-lightbulb"
        :label="t('play.hint', { used: hintsUsed, total: hintsTotal })"
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
      v-if="solved"
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
