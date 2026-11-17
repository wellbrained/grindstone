<script setup lang="ts">
import type { DebuggingPlaySession, ServerLine } from '~/composables/useDebuggingPlay'

// The Server panel of a Web fundamentals level (docs/features/ui.md, "Web fundamentals play page"): what the level's
// server.js did in this load, like the terminal that runs `node server.js`: an access line per request it answered
// (`OPTIONS /orders 204`), what its own console wrote, and its errors, each with a link to its line in server.js. A
// request the browser refused at its preflight never shows up here: that is the lesson. Text only; a reload empties it.
const props = defineProps<{ play: DebuggingPlaySession }>()

const { t } = useI18n()
const { serverLines, clearServer, openLine, level, predicting } = props.play
const api = level.sandbox.web?.api ?? ''
const server = level.sandbox.web?.server ?? 'server.js'

const log = useTemplateRef<HTMLElement>('log')
defineExpose({ focus: () => log.value?.focus() })

// new lines keep the end in view (as a terminal does), unless you scrolled up to read
watch(serverLines, () => {
  const element = log.value
  if (!element) return
  const atEnd = element.scrollHeight - element.scrollTop - element.clientHeight < 24
  if (atEnd) nextTick(() => element.scrollTo({ top: element.scrollHeight }))
})

const TONE: Record<ServerLine['level'], string> = { access: 'text-toned', log: 'text-muted', warn: 'text-warning', error: 'text-error' }
</script>

<template>
  <section
    :aria-label="t('web.server.label')"
    class="flex min-h-0 flex-col overflow-hidden rounded-lg border border-(--app-terminal-border) bg-(--app-terminal) text-[13px] focus-within:ring-2 focus-within:ring-primary"
  >
    <header class="flex items-center justify-between gap-3 border-b border-(--app-terminal-border) px-3 py-1 text-xs text-muted">
      <span class="flex min-w-0 items-center gap-1.5">
        <UIcon
          name="i-lucide-server"
          class="size-4 shrink-0"
        />
        <span class="truncate"><span class="font-mono">{{ server }}</span> · <span class="font-mono">{{ api.replace(/^https:\/\//, '') }}</span></span>
      </span>
      <UButton
        size="xs"
        color="neutral"
        icon="i-lucide-ban"
        :label="t('debugging.console.clear')"
        data-testid="server-clear"
        @click="clearServer"
      />
    </header>
    <div
      ref="log"
      role="log"
      tabindex="0"
      :aria-label="t('web.server.lines')"
      class="min-h-0 flex-1 overflow-y-auto px-3 py-1.5 font-mono text-xs focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      data-testid="server-log"
    >
      <p
        v-if="!serverLines.length"
        class="font-sans text-dimmed"
      >
        {{ predicting ? t('web.server.waiting') : t('web.server.empty') }}
      </p>
      <p
        v-for="line in serverLines"
        :key="line.id"
        class="flex items-baseline gap-2 py-0.5 break-words"
        :class="TONE[line.level]"
        :data-level="line.level"
        data-testid="server-line"
      >
        <span
          class="w-10 shrink-0 text-dimmed"
          aria-hidden="true"
        >{{ line.level === 'access' ? '→' : line.level === 'log' ? '' : line.level }}</span>
        <span
          class="min-w-0 flex-1"
          data-testid="server-text"
        >{{ line.text }}</span>
        <button
          v-if="line.line !== null"
          type="button"
          class="shrink-0 rounded-sm text-info underline underline-offset-2 hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
          :aria-label="t('debugging.console.open', { path: server, line: line.line })"
          data-testid="server-source"
          @click="openLine({ path: server, line: line.line })"
        >
          {{ server }}:{{ line.line }}
        </button>
      </p>
    </div>
  </section>
</template>
