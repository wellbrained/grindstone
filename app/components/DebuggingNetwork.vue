<script setup lang="ts">
import { bodyView, durationText, statusLabel, statusTone } from '#shared/levels'
import type { HeaderPair, NetworkEntry, SourceLine, StatusTone } from '#shared/levels'
import type { DebuggingPlaySession } from '~/composables/useDebuggingPlay'

// Debugging's Network panel (docs/features/ui.md, "Network"), in levels with a scripted backend: every request the app
// sent (method, name, status in its colour, time), and for the selected one what was sent and what came back, headers
// and bodies, always as text. The list is a listbox: Up and Down (Home, End) move the selection. Like the Console, a
// reload empties it. Wide enough, the list and the details sit side by side; narrower, the details follow the list.
const props = defineProps<{ play: DebuggingPlaySession }>()

const { t } = useI18n()
const { requests, clearNetwork, openLine, find } = props.play

const selectedId = ref<number | null>(null)
const selected = computed(() => requests.value.find(entry => entry.id === selectedId.value) ?? null)
// a reload (or Clear) empties the list: nothing stays selected
watch(requests, (list) => {
  if (!list.length) selectedId.value = null
})

const list = useTemplateRef<HTMLElement>('list')
const detail = useTemplateRef<HTMLElement>('detail')

defineExpose({ focus: () => list.value?.focus() })

/** A click on a request: its details (narrow: scrolled into view below the list). */
function select(entry: NetworkEntry) {
  selectedId.value = entry.id
  nextTick(() => detail.value?.scrollIntoView({ block: 'nearest' }))
}

/** Up and Down move the selection (it follows the focus), Home and End jump to the ends. */
function onListKey(event: KeyboardEvent) {
  const entries = requests.value
  if (!entries.length) return
  const index = entries.findIndex(entry => entry.id === selectedId.value)
  const to = event.key === 'ArrowDown'
    ? Math.min(index + 1, entries.length - 1)
    : event.key === 'ArrowUp' ? Math.max(index - 1, 0) : event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : -1
  if (to < 0) return
  event.preventDefault()
  selectedId.value = entries[to]!.id
  nextTick(() => list.value?.querySelector<HTMLElement>(`[data-request="${entries[to]!.id}"]`)?.scrollIntoView({ block: 'nearest' }))
}

const TONE: Record<StatusTone, string> = {
  pending: 'text-dimmed',
  success: 'text-success',
  neutral: 'text-muted',
  error: 'text-error'
}

const statusText = (entry: NetworkEntry) => {
  const response = entry.response
  if (!response || response.failure || response.status === null) return statusLabel(entry)
  return `${response.status} ${response.statusText}`.trim()
}

/** What the response section says when there is no body to show. */
const noBodyText = (entry: NetworkEntry) => {
  const response = entry.response
  if (!response) return t('debugging.network.waiting')
  if (response.failure) return t(`debugging.network.failure.${response.failure}`)
  return t('debugging.network.noBody')
}

// a pending request has no time yet: its name ends with the status, without a trailing comma
const spoken = (entry: NetworkEntry) => entry.response
  ? t('debugging.network.row', { method: entry.method, name: entry.name, status: statusText(entry), time: durationText(entry.response.time) })
  : t('debugging.network.rowPending', { method: entry.method, name: entry.name, status: statusText(entry) })

const where = (line: SourceLine) => `${line.path}:${line.line}`
const linkLabel = (line: SourceLine) => find ? t('debugging.console.answer', { path: line.path, line: line.line }) : t('debugging.console.open', { path: line.path, line: line.line })

const sections = computed(() => {
  const entry = selected.value
  if (!entry) return []
  const response = entry.response
  return [
    { id: 'request', title: t('debugging.network.request'), headers: entry.requestHeaders, body: entry.requestBody, none: t('debugging.network.noBody') },
    { id: 'response', title: t('debugging.network.response'), headers: response?.headers ?? [], body: response?.failure ? null : response?.body ?? null, none: noBodyText(entry) }
  ] satisfies { id: string, title: string, headers: HeaderPair[], body: string | null, none: string }[]
})

const viewOf = (body: string, headers: readonly HeaderPair[]) => bodyView(body, headers)
</script>

<template>
  <section
    :aria-label="t('debugging.network.label')"
    class="@container flex min-h-0 flex-col overflow-hidden rounded-lg border border-(--app-terminal-border) bg-(--app-terminal) text-[13px] focus-within:ring-2 focus-within:ring-primary"
  >
    <header class="flex items-center justify-between gap-3 border-b border-(--app-terminal-border) px-3 py-1 text-xs text-muted">
      <span class="flex items-center gap-1.5">
        <UIcon
          name="i-lucide-arrow-down-up"
          class="size-4"
        />
        {{ t('debugging.network.label') }}
        <span
          class="font-mono text-dimmed tabular-nums"
          data-testid="network-count"
        >{{ t('debugging.network.count', requests.length) }}</span>
      </span>
      <UButton
        size="xs"
        color="neutral"
        icon="i-lucide-ban"
        :label="t('debugging.console.clear')"
        data-testid="network-clear"
        @click="clearNetwork"
      />
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto @xl:grid @xl:grid-cols-[minmax(12rem,2fr)_3fr] @xl:overflow-hidden">
      <!-- the requests, in the order sent -->
      <div class="@xl:min-h-0 @xl:overflow-y-auto @xl:border-e @xl:border-(--app-terminal-border)">
        <p
          v-if="!requests.length"
          class="px-3 py-2 text-xs text-dimmed"
        >
          {{ t('debugging.network.empty') }}
        </p>
        <ul
          v-else
          ref="list"
          role="listbox"
          :aria-label="t('debugging.network.list')"
          :aria-activedescendant="selected ? `request-${selected.id}` : undefined"
          tabindex="0"
          class="py-0.5 font-mono focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          data-testid="network-list"
          @keydown="onListKey"
        >
          <li
            v-for="entry in requests"
            :id="`request-${entry.id}`"
            :key="entry.id"
            role="option"
            :aria-selected="entry.id === selectedId"
            :aria-label="spoken(entry)"
            :data-request="entry.id"
            :data-status="statusLabel(entry)"
            class="grid cursor-pointer grid-cols-[3.25rem_minmax(0,1fr)_5.5rem_3.5rem] items-baseline gap-x-2 border-b border-(--app-terminal-border) px-3 py-1 last:border-b-0"
            :class="entry.id === selectedId ? 'bg-accented text-highlighted' : 'text-toned hover:bg-elevated'"
            @click="select(entry)"
          >
            <span class="text-xs text-muted">{{ entry.method }}</span>
            <span class="truncate">{{ entry.name }}</span>
            <span
              class="text-xs tabular-nums"
              :class="TONE[statusTone(entry)]"
            >
              <UIcon
                v-if="!entry.response"
                name="i-lucide-loader-circle"
                class="me-0.5 inline size-3 animate-spin align-[-0.1em] motion-reduce:animate-none"
              />{{ statusLabel(entry) }}</span>
            <span class="text-end text-xs text-dimmed tabular-nums">{{ entry.response ? durationText(entry.response.time) : '' }}</span>
          </li>
        </ul>
      </div>

      <!-- the selected request: what was sent, what came back -->
      <div
        v-if="selected"
        ref="detail"
        role="region"
        tabindex="0"
        :aria-label="t('debugging.network.details', { name: selected.name })"
        class="border-t border-(--app-terminal-border) px-3 py-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary @xl:min-h-0 @xl:overflow-y-auto @xl:border-t-0"
        data-testid="network-detail"
      >
        <p class="mb-2 font-mono break-all text-highlighted">
          <span class="text-muted">{{ selected.method }}</span> {{ selected.url }}
        </p>
        <dl class="mb-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
          <dt class="text-muted">
            {{ t('debugging.network.status') }}
          </dt>
          <dd
            class="font-mono"
            :class="TONE[statusTone(selected)]"
            data-testid="network-status"
          >
            {{ statusText(selected) }}
          </dd>
          <template v-if="selected.response">
            <dt class="text-muted">
              {{ t('debugging.network.time') }}
            </dt>
            <dd class="font-mono text-toned tabular-nums">
              {{ durationText(selected.response.time) }}
            </dd>
          </template>
          <template v-if="selected.initiator">
            <dt class="text-muted">
              {{ t('debugging.network.initiator') }}
            </dt>
            <dd>
              <button
                type="button"
                class="rounded-sm font-mono text-info underline underline-offset-2 hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
                :aria-label="linkLabel(selected.initiator)"
                data-testid="network-initiator"
                @click="openLine(selected.initiator)"
              >
                {{ where(selected.initiator) }}
              </button>
            </dd>
          </template>
        </dl>

        <section
          v-for="part in sections"
          :key="part.id"
          :aria-label="part.title"
          class="mb-3 last:mb-0"
          :data-testid="`network-${part.id}`"
        >
          <h3 class="mb-1 text-xs font-medium text-highlighted">
            {{ part.title }}
          </h3>
          <dl
            v-if="part.headers.length"
            class="mb-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-mono text-xs"
            :aria-label="t('debugging.network.headers')"
          >
            <template
              v-for="([name, value], index) in part.headers"
              :key="index"
            >
              <dt class="text-muted">
                {{ name }}
              </dt>
              <dd class="break-all text-toned">
                {{ value }}
              </dd>
            </template>
          </dl>
          <pre
            v-if="part.body"
            class="max-h-64 overflow-auto rounded-md border border-(--app-terminal-border) bg-elevated/60 px-2 py-1.5 font-mono text-xs break-words whitespace-pre-wrap text-highlighted"
            :data-testid="`network-${part.id}-body`"
          >{{ viewOf(part.body, part.headers) }}</pre>
          <p
            v-else
            class="text-xs text-dimmed"
          >
            {{ part.none }}
          </p>
        </section>
      </div>
      <p
        v-else-if="requests.length"
        class="hidden px-3 py-2 text-xs text-dimmed @xl:block"
      >
        {{ t('debugging.network.pick') }}
      </p>
    </div>
  </section>
</template>
