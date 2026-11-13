<script setup lang="ts">
import type { ConsoleEntry, DebuggingPlaySession } from '~/composables/useDebuggingPlay'
import type { SourceLine } from '#shared/levels'

// Debugging's Console (docs/features/ui.md, "Console"): what the app logged, its warnings and errors (red, with the
// source link on the right and the stack's frames below it; each opens the file at that line), Clear, and an input line
// that runs an expression inside the app. No filters or groups yet (ADR 0007). Everything from the app is text.
const props = defineProps<{ play: DebuggingPlaySession }>()

const { t } = useI18n()
const { entries, evaluate, clearConsole, openLine, find } = props.play

const value = ref('')
const history: string[] = []
let back = 0

const scroller = useTemplateRef<HTMLElement>('scroller')
const input = useTemplateRef<HTMLInputElement>('input')

// stay at the newest line, unless you scrolled up to read
let pinned = true
function onScroll() {
  const el = scroller.value
  if (el) pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 24
}
watch(() => entries.value.length, () => nextTick(() => {
  const el = scroller.value
  if (el && pinned) el.scrollTop = el.scrollHeight
}))

function run() {
  const code = value.value
  if (!code.trim()) return
  if (history.at(-1) !== code) history.push(code)
  back = 0
  value.value = ''
  pinned = true
  evaluate(code)
}

/** Up and Down walk the inputs of this visit, like the browser's Console. */
function walk(step: -1 | 1, event: KeyboardEvent) {
  if (!history.length) return
  event.preventDefault()
  back = Math.min(Math.max(back - step, 0), history.length)
  value.value = back === 0 ? '' : history[history.length - back]!
}

const ICONS: Partial<Record<ConsoleEntry['level'], string>> = {
  error: 'i-lucide-circle-x',
  warn: 'i-lucide-triangle-alert',
  info: 'i-lucide-info'
}

const rowClass = (entry: ConsoleEntry) => ({
  'bg-error/8 text-error': entry.level === 'error',
  'bg-warning/8 text-warning': entry.level === 'warn',
  'text-highlighted': entry.level === 'input',
  'text-muted': entry.level === 'result' || entry.level === 'debug',
  'text-toned': entry.level === 'log' || entry.level === 'info'
})

const where = (line: SourceLine) => `${line.path}:${line.line}`
const linkLabel = (line: SourceLine) => find ? t('debugging.console.answer', { path: line.path, line: line.line }) : t('debugging.console.open', { path: line.path, line: line.line })

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <section
    :aria-label="t('debugging.console.label')"
    class="flex min-h-0 flex-col overflow-hidden rounded-lg border border-(--app-terminal-border) bg-(--app-terminal) font-mono text-[13px] focus-within:ring-2 focus-within:ring-primary"
  >
    <header class="flex items-center justify-between gap-3 border-b border-(--app-terminal-border) px-3 py-1 font-sans text-xs text-muted">
      <span class="flex items-center gap-1.5">
        <UIcon
          name="i-lucide-square-chevron-right"
          class="size-4"
        />
        {{ t('debugging.console.label') }}
      </span>
      <UButton
        size="xs"
        color="neutral"
        icon="i-lucide-ban"
        :label="t('debugging.console.clear')"
        data-testid="console-clear"
        @click="clearConsole"
      />
    </header>

    <div
      ref="scroller"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      :aria-label="t('debugging.console.log')"
      tabindex="0"
      class="min-h-0 flex-1 overflow-y-auto py-1 leading-relaxed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      data-testid="console-log"
      @scroll="onScroll"
    >
      <p
        v-if="!entries.length"
        class="px-3 py-1 font-sans text-xs text-dimmed"
      >
        {{ t('debugging.console.empty') }}
      </p>
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="border-b border-(--app-terminal-border) px-3 py-1 last:border-b-0"
        :class="rowClass(entry)"
        :data-level="entry.level"
      >
        <div class="flex items-start gap-2">
          <UIcon
            v-if="ICONS[entry.level]"
            :name="ICONS[entry.level]!"
            class="mt-[0.2rem] size-3.5 shrink-0"
          />
          <span
            v-else
            aria-hidden="true"
            class="w-3.5 shrink-0 text-center"
            :class="entry.level === 'input' ? 'text-primary' : 'text-dimmed'"
          >{{ entry.level === 'input' ? '›' : entry.level === 'result' ? '←' : '' }}</span>
          <span class="min-w-0 flex-1 break-words whitespace-pre-wrap"><span class="sr-only">{{ t(`debugging.console.level.${entry.level}`) }}: </span>{{ entry.text }}</span>
          <button
            v-if="entry.source"
            type="button"
            class="shrink-0 rounded-sm text-info underline underline-offset-2 hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
            :aria-label="linkLabel(entry.source)"
            data-testid="console-source"
            @click="openLine(entry.source)"
          >
            {{ where(entry.source) }}
          </button>
        </div>
        <ol
          v-if="entry.frames.length"
          class="mt-0.5 mb-0.5 space-y-px ps-5.5 text-xs"
          :aria-label="t('debugging.console.trace')"
        >
          <li
            v-for="(frame, index) in entry.frames"
            :key="index"
            class="break-words"
          >
            {{ t('debugging.console.at') }} {{ frame.fn }} (<button
              type="button"
              class="rounded-sm text-info underline underline-offset-2 hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
              :aria-label="linkLabel(frame)"
              :data-frame="where(frame)"
              @click="openLine(frame)"
              v-text="where(frame)"
            />)
          </li>
        </ol>
      </div>
    </div>

    <form
      class="flex items-center gap-2 border-t border-(--app-terminal-border) px-3 py-1.5"
      @submit.prevent="run"
    >
      <span
        aria-hidden="true"
        class="text-primary"
      >›</span>
      <input
        ref="input"
        v-model="value"
        type="text"
        name="console"
        :aria-label="t('debugging.console.input')"
        :placeholder="t('debugging.console.placeholder')"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        enterkeyhint="go"
        class="min-w-0 flex-1 bg-transparent text-highlighted caret-primary outline-none placeholder:text-dimmed"
        data-testid="console-input"
        @keydown.up="walk(-1, $event)"
        @keydown.down="walk(1, $event)"
      >
    </form>
  </section>
</template>
