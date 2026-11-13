<script setup lang="ts">
import { filterLogs } from '#shared/levels'
import type { LogEntry, LogFilter, LogLevel, SourceLine } from '#shared/levels'
import type { DebuggingPlaySession } from '~/composables/useDebuggingPlay'

// Debugging's Logs panel (docs/features/ui.md, "Logs"), in chapter 7's levels: the shop server's log lines, what it
// logged before you came and then this load's requests, each with its time on the server's clock, level, route,
// request id and message (and a stack: a frame in one of the app's files opens its line; in a find task it is an
// answer). Filter by level and by text; a line's request id selects that request in the Network panel (this load's
// only). Everything is text, from the level's own data.
const props = defineProps<{ play: DebuggingPlaySession }>()

const { t } = useI18n()
const { logLines, logsCut, requests, showRequest, openLine, find, level } = props.play

const levelFilter = ref<LogFilter>('all')
const text = ref('')
const shown = computed(() => filterLogs(logLines.value, levelFilter.value, text.value))
const filtered = computed(() => levelFilter.value !== 'all' || text.value.trim() !== '')
/** The first line of this load, where the divider goes. */
const firstLive = computed(() => shown.value.find(entry => entry.live)?.key ?? null)
const opened = level.sandbox.logs?.now.slice(0, 8) ?? ''

const known = computed(() => new Set(requests.value.map(entry => entry.id)))

const ICONS: Record<LogLevel, string> = { error: 'i-lucide-circle-x', warn: 'i-lucide-triangle-alert', info: 'i-lucide-info' }
const TONE: Record<LogLevel, string> = { error: 'bg-error/8', warn: 'bg-warning/8', info: '' }
const LEVEL_TONE: Record<LogLevel, string> = { error: 'text-error', warn: 'text-warning', info: 'text-info' }

const where = (line: SourceLine) => `${line.path}:${line.line}`
const linkLabel = (line: SourceLine) => find ? t('debugging.console.answer', { path: line.path, line: line.line }) : t('debugging.console.open', { path: line.path, line: line.line })

const filter = useTemplateRef<HTMLInputElement>('filter')
defineExpose({ focus: () => filter.value?.focus() })

// like a log tail: the newest lines in view, unless you scrolled up to read
const scroller = useTemplateRef<HTMLElement>('scroller')
let pinned = true
function onScroll() {
  const el = scroller.value
  if (el) pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 24
}
watch(() => shown.value.length, () => nextTick(() => {
  const el = scroller.value
  if (el && pinned) el.scrollTop = el.scrollHeight
}), { immediate: true })
// a panel shown for the first time (a phone's tab) had no height to scroll in: now it has
useResizeObserver(scroller, () => {
  const el = scroller.value
  if (el && pinned) el.scrollTop = el.scrollHeight
})

/** A stack line around its place: the text before it, the place (the link), the text after it. */
function frameParts(text: string, source: SourceLine): [string, string, string] {
  const at = text.lastIndexOf(where(source))
  if (at < 0) return [text, '', '']
  const rest = text.slice(at)
  const end = /^[\w./-]+:\d+(?::\d+)?/.exec(rest)?.[0].length ?? rest.length
  return [text.slice(0, at), rest.slice(0, end), rest.slice(end)]
}

/** A line's request, when the Network panel has it (this load's). */
const linked = (entry: LogEntry) => entry.requestId !== null && known.value.has(entry.requestId)
</script>

<template>
  <section
    :aria-label="t('debugging.logs.label')"
    class="flex min-h-0 flex-col overflow-hidden rounded-lg border border-(--app-terminal-border) bg-(--app-terminal) text-[13px] focus-within:ring-2 focus-within:ring-primary"
  >
    <header class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-(--app-terminal-border) px-3 py-1.5 text-xs text-muted">
      <span class="flex items-center gap-1.5">
        <UIcon
          name="i-lucide-scroll-text"
          class="size-4"
        />
        {{ t('debugging.logs.label') }}
        <span
          class="font-mono text-dimmed tabular-nums"
          data-testid="logs-count"
        >{{ filtered ? t('debugging.logs.countOf', { n: shown.length, total: logLines.length }) : t('debugging.logs.count', logLines.length) }}</span>
      </span>
      <div class="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
        <select
          v-model="levelFilter"
          :aria-label="t('debugging.logs.levelFilter')"
          class="cursor-pointer rounded-md border border-default bg-default px-1.5 py-0.5 text-xs text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
          data-testid="logs-level"
        >
          <option value="all">
            {{ t('debugging.logs.levels.all') }}
          </option>
          <option value="warn">
            {{ t('debugging.logs.levels.warn') }}
          </option>
          <option value="error">
            {{ t('debugging.logs.levels.error') }}
          </option>
        </select>
        <label class="flex min-w-0 flex-[1_1_9rem] items-center gap-1.5 rounded-md border border-default bg-default px-1.5 py-0.5 focus-within:outline-2 focus-within:outline-primary">
          <UIcon
            name="i-lucide-search"
            class="size-3.5 shrink-0 text-dimmed"
          />
          <span class="sr-only">{{ t('debugging.logs.textFilter') }}</span>
          <input
            ref="filter"
            v-model="text"
            type="search"
            maxlength="200"
            :placeholder="t('debugging.logs.placeholder')"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            class="min-w-0 flex-1 bg-transparent font-mono text-xs text-highlighted outline-none placeholder:text-dimmed"
            data-testid="logs-filter"
          >
        </label>
      </div>
    </header>

    <div
      ref="scroller"
      tabindex="0"
      role="region"
      :aria-label="t('debugging.logs.lines')"
      class="min-h-0 flex-1 overflow-y-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      data-testid="logs-list"
      @scroll="onScroll"
    >
      <p
        v-if="!logLines.length"
        class="px-3 py-2 text-xs text-dimmed"
      >
        {{ t('debugging.logs.empty') }}
      </p>
      <p
        v-else-if="!shown.length"
        class="px-3 py-2 text-xs text-dimmed"
        data-testid="logs-none"
      >
        {{ t('debugging.logs.noMatch') }}
      </p>
      <ol
        v-else
        class="font-mono"
      >
        <template
          v-for="entry in shown"
          :key="entry.key"
        >
          <li
            v-if="entry.key === firstLive"
            class="border-b border-(--app-terminal-border) bg-elevated/60 px-3 py-0.5 font-sans text-xs text-muted"
            data-testid="logs-divider"
          >
            {{ t('debugging.logs.opened', { time: opened }) }}
          </li>
          <li
            class="border-b border-(--app-terminal-border) px-3 py-1 last:border-b-0"
            :class="TONE[entry.level]"
            :data-level="entry.level"
            :data-request="entry.request ?? undefined"
            data-testid="log-line"
          >
            <div class="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span class="text-dimmed tabular-nums">{{ entry.time }}</span>
              <span
                class="inline-flex items-center gap-1 font-medium uppercase"
                :class="LEVEL_TONE[entry.level]"
              >
                <UIcon
                  :name="ICONS[entry.level]"
                  class="size-3 self-center"
                />{{ t(`debugging.logs.level.${entry.level}`) }}
              </span>
              <span
                v-if="entry.route"
                class="break-all text-muted"
              >{{ entry.route }}</span>
              <button
                v-if="entry.request && linked(entry)"
                type="button"
                class="rounded-sm text-info underline underline-offset-2 hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
                :aria-label="t('debugging.logs.showRequest', { id: entry.request })"
                data-testid="log-request"
                @click="showRequest(entry.requestId!)"
              >
                {{ entry.request }}
              </button>
              <span
                v-else-if="entry.request"
                class="text-muted"
              >{{ entry.request }}</span>
            </div>
            <p
              class="mt-0.5 break-words whitespace-pre-wrap"
              :class="entry.level === 'info' ? 'text-toned' : LEVEL_TONE[entry.level]"
            >
              {{ entry.message }}
            </p>
            <ol
              v-if="entry.stack.length"
              class="mt-0.5 space-y-px ps-4 text-xs text-muted"
              :aria-label="t('debugging.logs.stack')"
            >
              <li
                v-for="(frame, index) in entry.stack"
                :key="index"
                class="break-words"
              >
                <template v-if="frame.source">
                  {{ frameParts(frame.text, frame.source)[0] }}<button
                    type="button"
                    class="rounded-sm text-info underline underline-offset-2 hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
                    :aria-label="linkLabel(frame.source)"
                    :data-frame="where(frame.source)"
                    @click="openLine(frame.source)"
                    v-text="frameParts(frame.text, frame.source)[1]"
                  />{{ frameParts(frame.text, frame.source)[2] }}
                </template>
                <template v-else>
                  {{ frame.text }}
                </template>
              </li>
            </ol>
          </li>
        </template>
      </ol>
      <p
        v-if="logsCut"
        class="px-3 py-1.5 text-xs text-warning"
      >
        {{ t('debugging.logs.cut') }}
      </p>
    </div>
  </section>
</template>
