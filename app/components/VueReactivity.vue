<script setup lang="ts">
import type { DebuggingPlaySession, ReactionRow } from '~/composables/useDebuggingPlay'

// The Reactivity panel of a Framework deep dives level (ADR 0010; docs/features/ui.md, "Framework deep dives play
// page"): what Vue did in this load, in order: each component render, computed getter, watch callback and watchEffect
// run, with what triggered it as Vue's own debug hooks report it, and the app's Console lines between them. Computed and
// watcher lines link to where they were made. Text only; a reload empties it.
const props = defineProps<{ play: DebuggingPlaySession }>()

const { t } = useI18n()
const { reactionRows, clearReactions, revealLine, predicting } = props.play
const chrome = inject(PANEL_CHROME, null)
/** From lg, the open one of several panels under the code: Clear sits in the tab row, as the Console's does. */
const inTabRow = computed(() => chrome?.actionsInTabRow('reactivity') ?? false)

const log = useTemplateRef<HTMLElement>('log')
defineExpose({ focus: () => log.value?.focus() })

// new lines keep the end in view (as a terminal does), unless you scrolled up to read
watch(reactionRows, () => {
  const element = log.value
  if (!element) return
  const atEnd = element.scrollHeight - element.scrollTop - element.clientHeight < 24
  if (atEnd) nextTick(() => element.scrollTo({ top: element.scrollHeight }))
})

const summary = computed(() => {
  const rows = reactionRows.value
  const count = (kind: ReactionRow['kind']) => rows.filter(row => row.kind === kind).length
  const renders = count('render')
  const computeds = count('computed')
  const watchers = count('watch') + count('effect')
  return [t('frameworks.reactivity.renders', { n: renders }, renders), t('frameworks.reactivity.computeds', { n: computeds }, computeds), t('frameworks.reactivity.watchers', { n: watchers }, watchers)].join(' · ')
})

const TONE: Record<ReactionRow['kind'], string> = {
  render: 'bg-success/15 text-highlighted',
  computed: 'bg-info/15 text-highlighted',
  watch: 'bg-warning/15 text-highlighted',
  effect: 'bg-warning/15 text-highlighted',
  log: 'bg-elevated text-muted'
}

/** What a line says, in words. */
function describe(row: ReactionRow): string {
  if (row.kind === 'log') return row.text
  if (row.kind === 'render') return t('frameworks.reactivity.render', { name: row.name })
  return t(`frameworks.reactivity.${row.kind}`)
}
const LOG_TONE: Record<string, string> = { warn: 'text-warning', error: 'text-error' }
</script>

<template>
  <section
    :aria-label="t('frameworks.reactivity.label')"
    class="flex min-h-0 flex-col overflow-hidden rounded-lg border border-(--app-terminal-border) bg-(--app-terminal) text-[13px] focus-within:ring-2 focus-within:ring-primary"
  >
    <header class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-(--app-terminal-border) px-3 py-1 text-xs text-muted">
      <span class="flex min-w-0 items-center gap-1.5">
        <UIcon
          name="i-lucide-atom"
          class="size-4 shrink-0"
        />
        <span
          class="font-mono text-pretty tabular-nums"
          data-testid="reactions-summary"
        >{{ summary }}</span>
      </span>
      <Teleport
        defer
        :to="PANEL_ACTIONS_TARGET"
        :disabled="!inTabRow"
      >
        <UButton
          size="xs"
          color="neutral"
          icon="i-lucide-ban"
          :label="t('debugging.console.clear')"
          :aria-label="t('frameworks.reactivity.clear')"
          class="ms-auto pointer-coarse:min-h-11"
          data-testid="reactions-clear"
          @click="clearReactions"
        />
      </Teleport>
    </header>
    <p class="border-b border-(--app-terminal-border) px-3 py-1 text-xs text-dimmed">
      {{ t('frameworks.reactivity.about') }}
    </p>
    <div
      ref="log"
      role="log"
      tabindex="0"
      :aria-label="t('frameworks.reactivity.lines')"
      class="min-h-0 flex-1 overflow-y-auto px-3 py-1.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      data-testid="reactions-log"
    >
      <p
        v-if="!reactionRows.length"
        class="text-dimmed"
      >
        {{ predicting ? t('web.server.waiting') : t('frameworks.reactivity.empty') }}
      </p>
      <p
        v-for="row in reactionRows"
        :key="row.id"
        class="flex items-baseline gap-2 py-0.5"
        :class="row.kind === 'render' ? 'mt-1 first:mt-0' : ''"
        :data-kind="row.kind"
        data-testid="reaction-line"
      >
        <span class="min-w-0 flex-1">
          <span
            class="me-1.5 inline-block rounded px-1.5 font-mono text-xs leading-5"
            :class="TONE[row.kind]"
          >{{ t(`frameworks.reactivity.kind.${row.kind}`) }}</span>
          <span
            class="break-words"
            :class="[row.kind === 'log' ? 'font-mono' : '', row.kind === 'render' ? 'font-medium text-highlighted' : 'text-toned', row.kind === 'log' ? LOG_TONE[row.level] ?? '' : '']"
            data-testid="reaction-text"
          >{{ describe(row) }}</span>
          <span
            v-if="row.kind !== 'log' && row.why.length"
            class="block ps-3 font-mono text-toned"
            data-testid="reaction-why"
          >{{ t('frameworks.reactivity.why', { why: row.why.join(' · ') }) }}</span>
        </span>
        <button
          v-if="row.line"
          type="button"
          class="inline-flex min-h-6 shrink-0 items-center rounded-sm font-mono text-info underline underline-offset-2 hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary pointer-coarse:min-h-11"
          :aria-label="t('debugging.console.open', { path: row.line.path, line: row.line.line })"
          data-testid="reaction-source"
          @click="revealLine(row.line)"
        >
          {{ row.line.path }}:{{ row.line.line }}
        </button>
      </p>
    </div>
  </section>
</template>
