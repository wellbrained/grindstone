<script setup lang="ts">
import type { ReviewLevel, SourceLine } from '#shared/levels'
import { testFilesOf, testRunFiles } from '#shared/levels'
import type { RunSide } from '~/utils/review-run'
import { runLevel } from '~/utils/review-run'

// Run the PR (ADR 0008, docs/features/ui.md "Working with AI play page"): the pull request's files run in the Debugging
// track's sandbox, App and Console as they are there, so you review with evidence. It starts when you ask (the sealed
// frame loads nothing before); "This PR" and "main" switch between the files after and before it, each a fresh load.
// A level whose change has no page to run (a practice task's one file) says so instead. A file:line link in its Console
// shows that line in the diff (the side's numbers: after the change, or before it on main) and focuses its number; a
// line the diff does not show is said so under the toggle. A pull request with test files (chapter 3) also gets the
// Tests panel: on This PR its tests run on its code, on main on main's code (a test that passes there too doesn't prove
// the change); its links show their lines the same way (a test file's by the pull request's numbers on either side).
const props = defineProps<{ level: ReviewLevel }>()

const { t } = useI18n()

const runs = props.level.run !== undefined
const started = ref(false)
const side = ref<RunSide>('head')
const app = computed(() => runLevel(props.level, side.value))
const hasTests = runs && testFilesOf(props.level.pr.head).length > 0
/** The files the Tests panel runs on this side: null without tests. */
const tests = computed(() => hasTests ? testRunFiles(props.level.pr, side.value) : null)
const SIDES: RunSide[] = ['head', 'base']

/** The last Console link that pointed at a line the diff does not show. */
const missing = ref<string | null>(null)
watch(side, () => {
  missing.value = null
})

function showLine({ path, line }: SourceLine, which?: 'new' | 'old') {
  const numbers = which ?? (side.value === 'head' ? 'new' : 'old')
  const button = document.querySelector<HTMLElement>(`[data-file="${CSS.escape(path)}"] [data-testid="diff-number"][data-${numbers}="${line}"]`)
  // a collapsed file's rows are not on screen
  if (!button || button.offsetParent === null) {
    missing.value = `${path}:${line}`
    return
  }
  missing.value = null
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  button.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
  button.focus({ preventScroll: true })
}

const toggle = useTemplateRef<HTMLElement>('toggle')
function start() {
  started.value = true
  nextTick(() => toggle.value?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus())
}
</script>

<template>
  <section
    :aria-label="t('review.run.label')"
    class="flex h-full min-h-0 flex-col gap-2"
    data-testid="review-run"
  >
    <header class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-sm font-semibold text-highlighted">
        {{ t('review.run.title') }}
      </h2>
      <div
        v-if="runs && started"
        ref="toggle"
        role="group"
        :aria-label="t('review.run.which')"
        class="flex gap-1 rounded-lg border border-default bg-elevated p-0.5"
      >
        <button
          v-for="each in SIDES"
          :key="each"
          type="button"
          :aria-pressed="side === each"
          class="cursor-pointer rounded-md px-2.5 py-1 text-xs focus-visible:outline-2 focus-visible:outline-primary"
          :class="side === each ? 'bg-accented font-medium text-highlighted' : 'text-muted hover:text-highlighted'"
          :data-side="each"
          @click="side = each"
        >
          {{ t(`review.run.side.${each}`) }}
        </button>
      </div>
    </header>

    <div
      v-if="!runs"
      class="rounded-lg border border-dashed border-default p-4 text-sm text-muted"
    >
      {{ t('review.run.none') }}
    </div>
    <div
      v-else-if="!started"
      class="flex flex-col items-start gap-3 rounded-lg border border-default bg-elevated p-4 text-sm text-toned"
    >
      <p>{{ t(hasTests ? 'review.run.introTests' : 'review.run.intro') }}</p>
      <UButton
        color="neutral"
        icon="i-lucide-play"
        :label="t('review.run.start')"
        data-testid="run-pr"
        @click="start"
      />
    </div>
    <p
      v-if="missing"
      role="status"
      class="text-xs text-muted"
      data-testid="run-line-missing"
    >
      {{ t('review.run.notInDiff', { where: missing }) }}
    </p>
    <ReviewRunApp
      v-if="runs && started && app"
      :key="side"
      :level="app"
      :side="side"
      :tests="tests"
      class="min-h-0 flex-1"
      @line="showLine"
    />
  </section>
</template>
