<script setup lang="ts">
import type { Files, SourceLine, TestCase, TestRun } from '#shared/levels'
import { TEST_LIMITS, isTestFile, testSummary } from '#shared/levels'
import type { RunSide } from '~/utils/review-run'
import { runTests } from '~/utils/review-tests'

// The Tests panel of Run the PR (ADR 0008, chapter 3; docs/features/ui.md "Working with AI play page"): the pull
// request's test files run in a sealed frame of their own (`runTests`), on this side's code: This PR's, or main's with
// the pull request's tests on top. It runs when it opens and on Run again; it lists each test file and its tests (passed,
// failed, did not finish), the checks each made, a failure's message as text and links to the lines, which show in the
// diff like the Console's (`line`, with the numbers of the side the file comes from: the tests are always the pull
// request's). Nothing here counts.
const props = defineProps<{
  files: Files
  side: RunSide
}>()
const emit = defineEmits<{ line: [line: SourceLine, numbers: 'new' | 'old'] }>()

const { t } = useI18n()

const run = shallowRef<TestRun | null>(null)
const running = ref(false)
let controller: AbortController | null = null

async function start() {
  controller?.abort()
  const mine = new AbortController()
  controller = mine
  running.value = true
  const result = await runTests(props.files, { signal: mine.signal })
  if (controller !== mine) return
  controller = null
  run.value = result
  running.value = false
}

onMounted(start)
onBeforeUnmount(() => controller?.abort())

const summary = computed(() => run.value ? testSummary(run.value) : null)

/** The summary line: "1 failed · 2 passed", files that could not run, or that nothing ran. */
const summaryText = computed(() => {
  const counts = summary.value
  if (!counts) return ''
  const parts = [
    counts.failed ? t('review.tests.summary.failed', { n: counts.failed }) : '',
    counts.unfinished ? t('review.tests.summary.unfinished', { n: counts.unfinished }) : '',
    counts.passed ? t('review.tests.summary.passed', { n: counts.passed }) : '',
    counts.broken ? t('review.tests.summary.broken', { n: counts.broken }, counts.broken) : ''
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : t('review.tests.summary.none')
})

// green only for a run that got through every test and had no problem: one that stopped early may hide failures
const tone = computed(() => {
  const counts = summary.value
  if (!counts || !run.value) return 'text-muted'
  if (counts.failed || counts.unfinished || counts.broken) return 'text-error'
  if (!run.value.finished) return 'text-warning'
  return counts.passed ? 'text-success' : 'text-muted'
})

/** The test files with their tests, in path order. */
const groups = computed(() => (run.value?.files ?? []).map(file => ({ ...file, tests: run.value!.tests.filter(test => test.path === file.path) })))

const ICONS: Record<TestCase['status'], string> = {
  passed: 'i-lucide-circle-check',
  failed: 'i-lucide-circle-x',
  unfinished: 'i-lucide-timer-off'
}
const TONES: Record<TestCase['status'], string> = {
  passed: 'text-success',
  failed: 'text-error',
  unfinished: 'text-warning'
}

const where = (line: SourceLine) => `${line.path}:${line.line}`
/** The tests are the pull request's files on either side; the code is main's on main. */
const numbersFor = (path: string): 'new' | 'old' => props.side === 'head' || isTestFile(path) ? 'new' : 'old'
const open = (line: SourceLine) => emit('line', line, numbersFor(line.path))
</script>

<template>
  <section
    :aria-label="t('review.tests.label')"
    class="flex min-h-0 flex-col overflow-hidden rounded-lg border border-(--app-terminal-border) bg-(--app-terminal) font-mono text-[13px]"
    data-testid="tests-panel"
    :aria-busy="running"
  >
    <header class="flex items-center justify-between gap-3 border-b border-(--app-terminal-border) px-3 py-1 font-sans text-xs text-muted">
      <span class="flex items-center gap-1.5">
        <UIcon
          name="i-lucide-flask-conical"
          class="size-4"
        />
        {{ t('review.tests.label') }}
      </span>
      <UButton
        size="xs"
        color="neutral"
        icon="i-lucide-rotate-cw"
        :label="t('review.tests.again')"
        :loading="running"
        :disabled="running"
        data-testid="tests-run"
        @click="start"
      />
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2 leading-relaxed">
      <p class="font-sans text-xs text-muted">
        {{ t(`review.tests.on.${side}`) }}
      </p>
      <p
        role="status"
        class="mt-1.5 font-sans text-sm font-medium"
        :class="running ? 'text-muted' : tone"
        data-testid="tests-summary"
      >
        {{ running ? t('review.tests.running') : summaryText }}
      </p>
      <p
        v-if="!running && run && !run.finished"
        class="mt-1 font-sans text-xs text-warning"
        data-testid="tests-stopped"
      >
        {{ t('review.tests.stopped') }}
      </p>
      <p
        v-if="!running && run && run.dropped"
        class="mt-1 font-sans text-xs text-muted"
      >
        {{ t('review.tests.dropped', { n: run.dropped, max: TEST_LIMITS.maxTests }) }}
      </p>

      <ul
        v-if="run && !running"
        class="mt-2 space-y-3"
      >
        <li
          v-for="group in groups"
          :key="group.path"
          :data-test-file="group.path"
        >
          <h3 class="text-xs font-medium text-highlighted">
            {{ group.path }}
          </h3>
          <p
            v-if="group.error"
            class="mt-0.5 rounded-md bg-error/8 px-2 py-1 break-words whitespace-pre-wrap text-error"
            data-testid="test-file-error"
          >
            {{ t('review.tests.fileError') }} {{ group.error }}
          </p>
          <p
            v-else-if="group.timeout"
            class="mt-0.5 rounded-md bg-warning/8 px-2 py-1 font-sans text-xs text-warning"
            data-testid="test-file-error"
          >
            {{ t('review.tests.fileTimeout', { s: TEST_LIMITS.loadMs / 1000 }) }}
          </p>
          <p
            v-else-if="group.missing"
            class="mt-0.5 font-sans text-xs text-muted"
          >
            {{ t('review.tests.notReached') }}
          </p>
          <ol class="mt-1 space-y-1">
            <li
              v-for="(test, index) in group.tests"
              :key="index"
              class="rounded-md px-1.5 py-0.5"
              :class="{ 'bg-error/8': test.status === 'failed', 'bg-warning/8': test.status === 'unfinished' }"
              data-testid="test-case"
              :data-status="test.status"
            >
              <div class="flex items-start gap-2">
                <UIcon
                  :name="ICONS[test.status]"
                  class="mt-[0.2rem] size-3.5 shrink-0"
                  :class="TONES[test.status]"
                />
                <span class="min-w-0 flex-1 break-words text-toned">
                  <span class="sr-only">{{ t(`review.tests.status.${test.status}`) }}: </span>{{ test.name }}
                  <span
                    v-if="test.status !== 'unfinished'"
                    class="ms-1 font-sans text-xs whitespace-nowrap"
                    :class="test.checks === 0 && test.status === 'passed' ? 'text-warning' : 'text-dimmed'"
                    data-testid="test-checks"
                  >{{ test.checks === 0 && test.status === 'passed' ? t('review.tests.noChecks') : t('review.tests.checks', { n: test.checks }, test.checks) }}</span>
                </span>
                <button
                  v-if="test.line !== null"
                  type="button"
                  class="shrink-0 rounded-sm text-info underline underline-offset-2 hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
                  :aria-label="t('review.tests.open', { path: test.path, line: test.line })"
                  data-testid="test-link"
                  @click="open({ path: test.path, line: test.line })"
                >
                  {{ where({ path: test.path, line: test.line }) }}
                </button>
              </div>
              <p
                v-if="test.status === 'unfinished'"
                class="mt-0.5 ps-5.5 font-sans text-xs text-warning"
              >
                {{ test.leaked ? t('review.tests.leaked') : t('review.tests.unfinished', { s: TEST_LIMITS.testMs / 1000 }) }}
              </p>
              <p
                v-else-if="test.leaked"
                class="mt-0.5 ps-5.5 font-sans text-xs text-warning"
              >
                {{ t('review.tests.leaked') }}
              </p>
              <div
                v-if="test.message !== null"
                class="mt-1 ps-5.5"
              >
                <pre
                  class="font-mono text-xs break-words whitespace-pre-wrap text-error"
                  data-testid="test-failure"
                >{{ test.message }}</pre>
                <p
                  v-if="test.failure"
                  class="mt-0.5 text-xs text-muted"
                >
                  {{ t('review.tests.at') }} <button
                    type="button"
                    class="rounded-sm text-info underline underline-offset-2 hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
                    :aria-label="t('review.tests.open', { path: test.failure.path, line: test.failure.line })"
                    :data-failure="where(test.failure)"
                    data-testid="test-failure-link"
                    @click="open(test.failure)"
                    v-text="where(test.failure)"
                  />
                </p>
              </div>
            </li>
          </ol>
        </li>
      </ul>
    </div>

    <p class="border-t border-(--app-terminal-border) px-3 py-1.5 font-sans text-xs text-dimmed">
      {{ t('review.tests.note', { s: TEST_LIMITS.testMs / 1000 }) }}
    </p>
  </section>
</template>
