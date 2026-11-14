<script setup lang="ts">
import type { DebugLevel, Files, SourceLine } from '#shared/levels'
import type { RunSide } from '~/utils/review-run'

// One load of the pull request's app (ReviewRun): the Debugging track's App and Console, unchanged, on a play session
// that only runs (`useDebuggingPlay(level, { runOnly: true })`: the sealed frame, the bridge and its port, Reload; no
// goals, nothing recorded). A new instance per side, so switching starts the app from scratch. A file:line link in the
// Console (which opens Code in the Debugging track) is handed up: Run the PR shows that line in the diff. A pull request
// with test files (chapter 3) also has the Tests panel (`tests`: the files its tests run on, this side's), as a tab
// before the Console, open first; it runs its tests when it opens.
const props = defineProps<{
  level: DebugLevel
  side: RunSide
  tests?: Files | null
}>()
const emit = defineEmits<{ line: [line: SourceLine, numbers?: 'new' | 'old'] }>()

const { t } = useI18n()
const play = useDebuggingPlay(props.level, { runOnly: true })
// every link click sets a new mark, also for the same line
watch(play.mark, (mark) => {
  if (mark) emit('line', { path: mark.path, line: mark.line })
})

type Lower = 'tests' | 'console'
const LOWER: Lower[] = props.tests ? ['tests', 'console'] : ['console']
const lower = ref<Lower>(LOWER[0]!)
const tabList = useTemplateRef<HTMLElement>('tabList')

/** Arrow keys move between the two tabs (they wrap), Home and End jump to the ends; the new tab gets the focus. */
function onTabKey(event: KeyboardEvent) {
  const index = LOWER.indexOf(lower.value)
  const to = event.key === 'ArrowRight'
    ? (index + 1) % LOWER.length
    : event.key === 'ArrowLeft' ? (index + LOWER.length - 1) % LOWER.length : event.key === 'Home' ? 0 : event.key === 'End' ? LOWER.length - 1 : -1
  if (to < 0) return
  event.preventDefault()
  lower.value = LOWER[to]!
  nextTick(() => tabList.value?.querySelector<HTMLElement>(`[data-panel="${LOWER[to]}"]`)?.focus())
}
</script>

<template>
  <div
    class="flex min-h-0 flex-col gap-2"
    :data-run-side="side"
  >
    <p class="text-xs text-muted">
      {{ t(`review.run.running.${side}`) }}
    </p>
    <div
      class="min-h-56"
      :class="tests ? 'flex-[1_1_0]' : 'flex-[1.4_1_0]'"
    >
      <DebuggingApp :play="play" />
    </div>
    <div
      v-if="LOWER.length > 1"
      ref="tabList"
      role="tablist"
      :aria-label="t('review.tests.tabs')"
      class="flex gap-1 self-start rounded-lg border border-default bg-elevated p-0.5"
      @keydown="onTabKey"
    >
      <button
        v-for="name in LOWER"
        :id="`review-run-tab-${side}-${name}`"
        :key="name"
        type="button"
        role="tab"
        :aria-selected="lower === name"
        :aria-controls="`review-run-${side}-${name}`"
        :tabindex="lower === name ? 0 : -1"
        :data-panel="name"
        data-testid="run-tab"
        class="cursor-pointer rounded-md px-3 py-1 text-xs focus-visible:outline-2 focus-visible:outline-primary"
        :class="lower === name ? 'bg-accented font-medium text-highlighted' : 'text-muted hover:text-highlighted'"
        @click="lower = name"
      >
        {{ name === 'tests' ? t('review.tests.label') : t('debugging.panel.console') }}
      </button>
    </div>
    <ReviewTests
      v-if="tests"
      v-show="lower === 'tests'"
      :id="`review-run-${side}-tests`"
      role="tabpanel"
      :aria-labelledby="`review-run-tab-${side}-tests`"
      :files="tests"
      :side="side"
      class="min-h-56 flex-[1.3_1_0]"
      @line="(line, numbers) => emit('line', line, numbers)"
    />
    <DebuggingConsole
      v-show="lower === 'console'"
      :id="`review-run-${side}-console`"
      :role="LOWER.length > 1 ? 'tabpanel' : undefined"
      :aria-labelledby="LOWER.length > 1 ? `review-run-tab-${side}-console` : undefined"
      :play="play"
      class="min-h-40 flex-[1_1_0]"
    />
  </div>
</template>
