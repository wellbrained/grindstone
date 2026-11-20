<script setup lang="ts">
import type { DebuggingPlaySession, LoopRow } from '~/composables/useDebuggingPlay'

// The Event loop panel of a Web fundamentals chapter 5 level (docs/features/ui.md, "Web fundamentals play page"): what
// ran on the modelled event loop in this load, in order, each with its time on the scripted clock and its kind: a task
// (the page's script, a timer, a message, a tap, an event of the browser's), a listener of a tap or a message, a
// requestAnimationFrame callback, a frame (style, layout, paint: what it showed of the watched elements, the transitions
// that started), a forced layout (the read that forced it, how often in a row), and the page's own Console lines, marked
// microtask when they ran after their task. Lines link to where they were set up. Text only; a reload empties it.
const props = defineProps<{ play: DebuggingPlaySession }>()

const { t } = useI18n()
const { loopRows, clearLoop, revealLine, predicting } = props.play

const log = useTemplateRef<HTMLElement>('log')
defineExpose({ focus: () => log.value?.focus() })

// new lines keep the end in view (as a terminal does), unless you scrolled up to read
watch(loopRows, () => {
  const element = log.value
  if (!element) return
  const atEnd = element.scrollHeight - element.scrollTop - element.clientHeight < 24
  if (atEnd) nextTick(() => element.scrollTo({ top: element.scrollHeight }))
})

const summary = computed(() => {
  const rows = loopRows.value
  const tasks = rows.filter(row => row.kind === 'task').length
  const frames = rows.filter(row => row.kind === 'render').length
  const forced = rows.reduce((sum, row) => sum + (row.kind === 'layout' ? row.count : 0), 0)
  return [t('web.loop.tasks', { n: tasks }, tasks), t('web.loop.frames', { n: frames }, frames), t('web.loop.forced', { n: forced }, forced)].join(' · ')
})

/** The badge of a line: its kind (a log in a microtask says so). */
const badge = (row: LoopRow) => row.kind === 'log' ? (row.source === 'microtask' ? t('web.loop.kind.microtask') : t('web.loop.kind.log')) : t(`web.loop.kind.${row.kind}`)
const TONE: Record<LoopRow['kind'], string> = {
  task: 'bg-accented text-highlighted',
  listener: 'bg-elevated text-toned ring ring-inset ring-default',
  callback: 'bg-info/15 text-highlighted',
  render: 'bg-success/15 text-highlighted',
  layout: 'bg-error/15 text-highlighted',
  log: 'bg-elevated text-muted',
  note: 'bg-warning/15 text-highlighted'
}
const toneOf = (row: LoopRow) => row.kind === 'log' && row.source === 'microtask' ? 'bg-warning/15 text-highlighted' : TONE[row.kind]

/** What a line says, in words (code stays code). */
function describe(row: LoopRow): string {
  if (row.kind === 'task') {
    if (row.source === 'script') return t('web.loop.script')
    if (row.source === 'tap') return row.target === 'nothing there to tap' ? t('web.loop.tapNothing') : t('web.loop.tap', { target: row.target })
    if (row.source === 'message') return t('web.loop.message', { target: row.target })
    if (row.source === 'event') return t('web.loop.event', { type: row.text, target: row.target })
    if (row.source === 'console') return t('web.loop.console')
    return row.text
  }
  if (row.kind === 'listener') return t('web.loop.listener', { type: row.text, target: row.target })
  if (row.kind === 'render') return t('web.loop.frame', { n: row.count })
  if (row.kind === 'layout') return t('web.loop.forcedRead', { read: row.text })
  if (row.kind === 'note') {
    if (row.source === 'units') return t('web.loop.stoppedUnits', { n: row.count.toLocaleString('en') })
    if (row.source === 'tasks') return t('web.loop.stoppedTasks')
    if (row.source === 'animations') return t('web.loop.stoppedAnimations', { n: row.count })
    return t('web.loop.stoppedEntries')
  }
  return row.text
}
/** Timers and callbacks read as code; the rest as words. */
const isCode = (row: LoopRow) => (row.kind === 'task' && (row.source === 'timeout' || row.source === 'interval')) || row.kind === 'callback' || row.kind === 'log'
const indented = (row: LoopRow) => row.kind === 'listener' || row.kind === 'callback' || row.kind === 'log' || row.kind === 'layout'
const LOG_TONE: Record<string, string> = { warn: 'text-warning', error: 'text-error' }
</script>

<template>
  <section
    :aria-label="t('web.loop.label')"
    class="flex min-h-0 flex-col overflow-hidden rounded-lg border border-(--app-terminal-border) bg-(--app-terminal) text-[13px] focus-within:ring-2 focus-within:ring-primary"
  >
    <header class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-(--app-terminal-border) px-3 py-1 text-xs text-muted">
      <span class="flex min-w-0 items-center gap-1.5">
        <UIcon
          name="i-lucide-repeat"
          class="size-4 shrink-0"
        />
        <span
          class="truncate font-mono tabular-nums"
          data-testid="loop-summary"
        >{{ summary }}</span>
      </span>
      <UButton
        size="xs"
        color="neutral"
        icon="i-lucide-ban"
        :label="t('debugging.console.clear')"
        data-testid="loop-clear"
        @click="clearLoop"
      />
    </header>
    <p class="border-b border-(--app-terminal-border) px-3 py-1 text-xs text-dimmed">
      {{ t('web.loop.clock') }}
    </p>
    <div
      ref="log"
      role="log"
      tabindex="0"
      :aria-label="t('web.loop.lines')"
      class="min-h-0 flex-1 overflow-y-auto px-3 py-1.5 text-xs focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      data-testid="loop-log"
    >
      <p
        v-if="!loopRows.length"
        class="text-dimmed"
      >
        {{ predicting ? t('web.server.waiting') : t('web.loop.empty') }}
      </p>
      <p
        v-for="row in loopRows"
        :key="row.id"
        class="flex items-baseline gap-2 py-0.5"
        :class="row.kind === 'task' || row.kind === 'render' ? 'mt-1 first:mt-0' : ''"
        :data-kind="row.kind"
        :data-source="row.source"
        data-testid="loop-line"
      >
        <span class="min-w-16 shrink-0 text-end font-mono whitespace-nowrap text-dimmed tabular-nums">{{ t('web.loop.at', { ms: row.at.toFixed(1) }) }}</span>
        <span
          class="min-w-0 flex-1"
          :class="indented(row) ? 'ps-3' : ''"
        >
          <span
            class="me-1.5 inline-block rounded px-1.5 font-mono text-[11px] leading-5"
            :class="toneOf(row)"
          >{{ badge(row) }}</span>
          <span
            class="break-words"
            :class="[isCode(row) ? 'font-mono' : '', row.kind === 'task' || row.kind === 'render' ? 'font-medium text-highlighted' : 'text-toned', row.kind === 'log' ? LOG_TONE[row.target] ?? '' : '']"
            data-testid="loop-text"
          >{{ describe(row) }}</span>
          <span
            v-if="row.kind === 'task' && row.clamped"
            class="ms-1 text-warning"
          >· {{ t('web.loop.clamped') }}</span>
          <span
            v-if="row.kind === 'layout' && row.count > 1"
            class="ms-1 font-mono font-medium text-error tabular-nums"
            data-testid="loop-times"
          >{{ t('web.loop.times', { n: row.count }) }}</span>
          <span
            v-if="row.kind === 'render'"
            class="block text-muted"
            data-testid="loop-painted"
          >{{ row.painted.length ? t('web.loop.painted', { items: row.painted.join(' · ') }) : t('web.loop.paintedNothing') }}</span>
          <span
            v-if="row.kind === 'render' && row.started.length"
            class="block text-muted"
            data-testid="loop-started"
          >{{ t('web.loop.started', { items: row.started.join(' · ') }) }}</span>
        </span>
        <button
          v-if="row.line"
          type="button"
          class="shrink-0 rounded-sm font-mono text-info underline underline-offset-2 hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
          :aria-label="t('debugging.console.open', { path: row.line.path, line: row.line.line })"
          data-testid="loop-source"
          @click="revealLine(row.line)"
        >
          {{ row.line.path }}:{{ row.line.line }}
        </button>
      </p>
    </div>
  </section>
</template>
