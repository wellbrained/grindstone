<script setup lang="ts">
import type { CompletionContext } from '~/utils/completion'
import type { LogEntry } from '~/composables/useGitPlay'
import { isCoarsePointer } from '~/utils/play-layout'
import type { Prompt } from '~/utils/terminal'

// The terminal: output lines, one input line with history and Tab completion. Own component, no xterm.js (docs/adr/0001-plan.md).
const props = defineProps<{
  entries: LogEntry[]
  prompt: Prompt
  completion: CompletionContext
}>()

const emit = defineEmits<{
  submit: [line: string]
  clear: []
  candidates: [input: string, list: string[]]
}>()

const { t } = useI18n()

const value = ref('')
const input = useTemplateRef<HTMLInputElement>('input')
const scroller = useTemplateRef<HTMLElement>('scroller')

// ↑/↓ history survives page changes (shared by every level, like one shell session)
const history = useState<string[]>('terminal-history', () => [])
let cursor = history.value.length
let draft = ''

function focus() {
  input.value?.focus({ preventScroll: true })
}

function onPaneClick() {
  // a click that ends a text selection must not steal the selection
  if (window.getSelection()?.toString()) return
  focus()
}

function submit() {
  const line = value.value
  if (line.trim() && history.value.at(-1) !== line) history.value.push(line)
  cursor = history.value.length
  draft = ''
  value.value = ''
  emit('submit', line)
}

function step(direction: -1 | 1) {
  if (!history.value.length) return
  if (cursor === history.value.length) draft = value.value
  cursor = Math.min(history.value.length, Math.max(0, cursor + direction))
  value.value = cursor === history.value.length ? draft : history.value[cursor]!
}

function tab() {
  const result = complete(value.value, props.completion)
  if (result.input !== value.value) value.value = result.input
  else if (result.candidates.length > 1) emit('candidates', value.value, result.candidates)
}

function onKeydown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    step(-1)
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    step(1)
  } else if (event.key === 'Tab' && !event.shiftKey && value.value.trim()) {
    // an empty line lets Tab leave the field, so keyboard users are never trapped
    event.preventDefault()
    tab()
  } else if (event.ctrlKey && key === 'l') {
    event.preventDefault()
    emit('clear')
  } else if (event.ctrlKey && key === 'c' && input.value?.selectionStart === input.value?.selectionEnd) {
    event.preventDefault()
    value.value = ''
  }
}

function scrollToEnd() {
  nextTick(() => {
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
  })
}

watch(() => props.entries.length, scrollToEnd)

// The IDE layout opens the editor above the terminal and the terminal gets shorter: if the log was scrolled to the end,
// keep it there so the prompt stays in view (the browser would keep the old scrollTop and push the prompt out of sight).
// "At the end" is judged against the height before this resize (scroll events during the animation would see the new one).
let lastHeight = 0
let resizeObserver: ResizeObserver | undefined

onBeforeUnmount(() => resizeObserver?.disconnect())

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    const el = scroller.value
    if (!el) return
    const wasAtEnd = el.scrollHeight - el.scrollTop - lastHeight < 8
    lastHeight = el.clientHeight
    if (wasAtEnd) el.scrollTop = el.scrollHeight
  })
  if (scroller.value) resizeObserver.observe(scroller.value)
  scrollToEnd()
  // phones: do not open the keyboard unasked
  if (!isCoarsePointer()) focus()
})

defineExpose({ focus })
</script>

<template>
  <section
    :aria-label="t('terminal.label')"
    class="flex h-full min-h-72 flex-col overflow-hidden rounded-lg border border-(--app-terminal-border) bg-(--app-terminal) font-mono text-sm focus-within:ring-2 focus-within:ring-primary"
    @click="onPaneClick"
  >
    <header class="flex items-center justify-between gap-3 border-b border-(--app-terminal-border) px-3 py-1.5 text-xs text-muted">
      <span class="flex items-center gap-1.5">
        <UIcon
          name="i-lucide-terminal"
          class="size-4"
        />
        {{ t('terminal.title') }}
      </span>
      <span
        id="terminal-keys"
        class="hidden truncate sm:inline"
      >{{ t('terminal.keys') }}</span>
    </header>

    <div
      ref="scroller"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      :aria-label="t('terminal.output')"
      tabindex="0"
      class="min-h-0 flex-1 overflow-y-auto px-3 py-2 leading-relaxed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
    >
      <template
        v-for="entry in entries"
        :key="entry.id"
      >
        <div
          v-if="entry.type === 'intro'"
          class="mb-2 text-dimmed"
        >
          <p>{{ t('terminal.intro') }}</p>
          <p>{{ t('terminal.introHelp') }}</p>
        </div>
        <div
          v-else-if="entry.type === 'input'"
          class="break-words whitespace-pre-wrap text-highlighted"
        >
          <TerminalPrompt :prompt="entry.prompt" />
          {{ ' ' + entry.text }}
        </div>
        <TerminalText
          v-else-if="entry.type === 'line'"
          :line="entry.line"
        />
        <p
          v-else-if="entry.type === 'notice'"
          class="my-1.5 flex items-start gap-2 rounded-md border border-info bg-info/10 px-2.5 py-1.5 font-sans text-highlighted"
        >
          <UIcon
            name="i-lucide-user-round"
            class="mt-0.5 size-4 shrink-0 text-info"
          />
          <span>
            <span class="sr-only">{{ t('terminal.teammate') }}: </span>{{ entry.text }}
          </span>
        </p>
        <p
          v-else-if="entry.type === 'solved'"
          class="my-1.5 flex items-center gap-2 font-sans font-semibold text-success"
        >
          <UIcon
            name="i-lucide-circle-check"
            class="size-4 shrink-0"
          />
          {{ t('terminal.solved') }}
        </p>
      </template>

      <form
        class="flex flex-wrap items-baseline gap-x-2"
        @submit.prevent="submit"
      >
        <TerminalPrompt :prompt="prompt" />
        <input
          ref="input"
          v-model="value"
          type="text"
          name="command"
          :aria-label="t('terminal.input')"
          aria-describedby="terminal-keys"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="send"
          class="min-w-24 flex-1 basis-40 bg-transparent text-highlighted caret-primary outline-none"
          @keydown="onKeydown"
        >
      </form>
    </div>
  </section>
</template>
