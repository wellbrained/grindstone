<script setup lang="ts">
import { bodyView, durationText, statusLabel, statusTone } from '#shared/levels'
import type { HeaderPair, NetworkEntry, SourceLine, StatusTone } from '#shared/levels'
import type { DebuggingPlaySession } from '~/composables/useDebuggingPlay'

// Debugging's Network panel (docs/features/ui.md, "Network"), in levels with a scripted backend: every request the app
// sent (method, name, status in its colour, time), and for the selected one what was sent and what came back, headers
// and bodies, always as text. The list is a listbox: Up and Down (Home, End) move the selection. Like the Console, a
// reload empties it. Wide enough, the list and the details sit side by side; narrower, the details follow the list.
// Web fundamentals (ADR 0009): a preflight is a row of its own, tagged "preflight" and linked to the request it asked
// for; a request CORS refused says why in Chrome's words, and still shows what the server sent (the browser kept it from
// the page, the server did answer), or that it was never sent when its preflight was refused. Chapter 2: a request another site's page sent is
// tagged with that site (and a page or an image with its kind), and its details list its cookies (each sent, or why
// not, in Chrome's words) and its answer's Set-Cookie lines (stored, or why not).
const props = defineProps<{ play: DebuggingPlaySession }>()

const { t } = useI18n()
const { requests, clearNetwork, openLine, find, networkSelected: selectedId, requestShown } = props.play

const selected = computed(() => requests.value.find(entry => entry.id === selectedId.value) ?? null)
// a reload (or Clear) empties the list: nothing stays selected
watch(requests, (list) => {
  if (!list.length) selectedId.value = null
})

const list = useTemplateRef<HTMLElement>('list')
const detail = useTemplateRef<HTMLElement>('detail')

// a request shown from a log line (chapter 7): its details, in view, with the focus (you asked to go there)
watch(requestShown, () => nextTick(() => {
  list.value?.querySelector<HTMLElement>(`[data-request="${selectedId.value}"]`)?.scrollIntoView({ block: 'nearest' })
  detail.value?.scrollIntoView({ block: 'nearest' })
  detail.value?.focus({ preventScroll: true })
}))

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
  const text = `${response.status} ${response.statusText}`.trim()
  // chapter 4: as Chrome's Status reads for a copy its cache answered with
  return response.fromCache ? t('web.network.fromDiskCache', { status: text }) : text
}
/** The status column: the code alone (a copy the cache answered with is tagged by its name, as Chrome's Size column marks it). */
const rowStatus = (entry: NetworkEntry) => entry.response?.fromCache ? statusLabel({ ...entry, response: { ...entry.response, fromCache: false } }) : statusLabel(entry)

/**
 * A request CORS refused that the server did answer (Web fundamentals: its answer is shown, kept from the page), or a
 * frame whose answer said it may not be shown there (chapter 7).
 */
const answeredButBlocked = (entry: NetworkEntry) => (entry.response?.failure === 'cors' || entry.response?.failure === 'frame') && entry.response.status !== null && entry.response.reason !== null
/** What kept it: CORS, the page's policy (chapter 7), a frame's headers; or a note on an answer that went through. */
const reasonLabel = (entry: NetworkEntry) => {
  const failure = entry.response?.failure
  return failure === 'cors' || failure === 'csp' || failure === 'frame' ? t(`web.network.blockedBy.${failure}`) : t('web.network.note')
}
/** A request CORS refused before it was sent: its preflight's answer did not allow it. */
const neverSent = (entry: NetworkEntry) => entry.response?.failure === 'cors' && entry.response.status === null && entry.response.reason !== null

/** What the response section says when there is no body to show. */
const noBodyText = (entry: NetworkEntry) => {
  const response = entry.response
  if (!response) return t('debugging.network.waiting')
  if (neverSent(entry)) return t('web.network.neverSent')
  if (answeredButBlocked(entry)) return t('debugging.network.noBody')
  if (response.failure) return t(`debugging.network.failure.${response.failure}`)
  return t('debugging.network.noBody')
}

/** The request a preflight asked for, by its id. */
const preflightOf = (entry: NetworkEntry) => entry.preflightFor === null ? null : requests.value.find(each => each.id === entry.preflightFor) ?? null

// a row is spoken with the full address (the list shows only its last part, like the browser's panel); a pending
// request has no time yet: its name ends with the status, without a trailing comma
/** A site's tag: its host, with the scheme only when it is not https (http://cornerbakery.shop is another site). */
const host = (origin: string) => origin.replace(/^https:\/\//, '')
const spoken = (entry: NetworkEntry) => {
  const base = entry.preflightFor === null ? entry.url : t('web.network.preflightName', { url: entry.url })
  const kind = entry.destination === 'fetch' ? base : t('web.network.kindName', { name: base, kind: t(`web.network.destination.${entry.destination}`) })
  const name = entry.site === null ? kind : t('web.network.fromName', { name: kind, site: host(entry.site) })
  return entry.response
    ? t('debugging.network.row', { method: entry.method, name, status: statusText(entry), time: durationText(entry.response.time) })
    : t('debugging.network.rowPending', { method: entry.method, name, status: statusText(entry) })
}

const where = (line: SourceLine) => `${line.path}:${line.line}`
const linkLabel = (line: SourceLine) => find ? t('debugging.console.answer', { path: line.path, line: line.line }) : t('debugging.console.open', { path: line.path, line: line.line })

const sections = computed(() => {
  const entry = selected.value
  if (!entry) return []
  const response = entry.response
  return [
    { id: 'request', title: t('debugging.network.request'), headers: entry.requestHeaders, body: entry.requestBody, none: t('debugging.network.noBody') },
    {
      id: 'response',
      title: answeredButBlocked(entry) ? t(entry.response?.failure === 'frame' ? 'web.network.notShown' : 'web.network.keptFromPage') : t('debugging.network.response'),
      headers: response?.headers ?? [],
      body: response?.failure && !answeredButBlocked(entry) ? null : response?.body ?? null,
      none: noBodyText(entry)
    }
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
      <div class="@container/requests @xl:min-h-0 @xl:overflow-y-auto @xl:border-e @xl:border-(--app-terminal-border)">
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
            class="grid cursor-pointer grid-cols-[auto_auto_minmax(0,1fr)] items-baseline gap-x-2 border-b border-(--app-terminal-border) px-3 py-1 [grid-template-areas:'name_name_name'_'method_status_time'] last:border-b-0 @sm/requests:grid-cols-[3.25rem_minmax(0,1fr)_5.5rem_3.5rem] @sm/requests:[grid-template-areas:'method_name_status_time']"
            :class="entry.id === selectedId ? 'bg-accented text-highlighted' : 'text-toned hover:bg-elevated'"
            @click="select(entry)"
          >
            <span class="text-xs text-muted [grid-area:method]">{{ entry.method }}</span>
            <!-- the name never hides: a narrow list gives it a line of its own, a long one wraps -->
            <span
              class="break-all [grid-area:name]"
              :title="entry.url"
              data-testid="network-name"
            >{{ entry.name }}<span
              v-if="entry.preflightFor !== null"
              class="ms-1.5 rounded-sm bg-accented px-1 font-sans text-[11px] text-muted"
              data-testid="network-preflight"
            >{{ t('web.network.preflight') }}</span><span
              v-if="entry.destination !== 'fetch'"
              class="ms-1.5 rounded-sm bg-accented px-1 font-sans text-[11px] text-muted"
              data-testid="network-destination"
            >{{ t(`web.network.destination.${entry.destination}`) }}</span><span
              v-if="entry.site !== null"
              class="ms-1.5 rounded-sm bg-error/15 px-1 font-sans text-[11px] text-highlighted"
              data-testid="network-site"
            >{{ host(entry.site) }}</span><span
              v-if="entry.response?.fromCache"
              class="ms-1.5 rounded-sm bg-accented px-1 font-sans text-[11px] text-muted"
              data-testid="network-cache"
            >{{ t('web.network.diskCache') }}</span></span>
            <span
              class="text-xs tabular-nums [grid-area:status]"
              :class="TONE[statusTone(entry)]"
            >
              <UIcon
                v-if="!entry.response"
                name="i-lucide-loader-circle"
                class="me-0.5 inline size-3 animate-spin align-[-0.1em] motion-reduce:animate-none"
              />{{ rowStatus(entry) }}</span>
            <span class="text-end text-xs text-dimmed tabular-nums [grid-area:time]">{{ entry.response ? durationText(entry.response.time) : '' }}</span>
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
          <template v-if="selected.preflightFor !== null">
            <dt class="text-muted">
              {{ t('web.network.preflightFor') }}
            </dt>
            <dd class="font-mono break-all text-toned">
              {{ preflightOf(selected) ? `${preflightOf(selected)!.method} ${preflightOf(selected)!.name}` : '' }}
            </dd>
          </template>
          <template v-if="selected.site !== null">
            <dt class="text-muted">
              {{ t('web.network.from') }}
            </dt>
            <dd class="font-mono break-all text-toned">
              {{ selected.site }}
            </dd>
          </template>
          <template v-if="selected.destination !== 'fetch'">
            <dt class="text-muted">
              {{ t('web.network.kind') }}
            </dt>
            <dd class="text-toned">
              {{ t(`web.network.destinationLong.${selected.destination}`) }}
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

        <p
          v-if="selected.response?.reason"
          class="mb-3 rounded-md border px-2 py-1.5 text-xs whitespace-pre-line text-highlighted"
          :class="selected.response.failure ? 'border-error/40 bg-error/10' : 'border-warning/40 bg-warning/10'"
          data-testid="network-reason"
        >
          <span
            class="font-medium"
            :class="selected.response.failure ? 'text-error' : 'text-warning'"
          >{{ reasonLabel(selected) }}</span>
          {{ ' ' }}{{ selected.response.reason }}
        </p>
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
        <section
          v-if="selected.cookies.length || selected.response?.cookies.length"
          :aria-label="t('web.network.cookies')"
          class="mt-3"
          data-testid="network-cookies"
        >
          <h3 class="mb-1 text-xs font-medium text-highlighted">
            {{ t('web.network.cookies') }}
          </h3>
          <template v-if="selected.cookies.length">
            <h4 class="mt-1 mb-0.5 text-xs text-muted">
              {{ t('web.network.requestCookies') }}
            </h4>
            <ul class="space-y-1 text-xs">
              <li
                v-for="(cookie, index) in selected.cookies"
                :key="`sent-${index}`"
                :data-sent="cookie.sent"
                data-testid="network-request-cookie"
              >
                <span class="font-mono break-all text-toned">{{ cookie.name }}={{ cookie.value }}</span>
                {{ ' ' }}<span :class="cookie.sent ? 'text-success' : 'text-error'">{{ cookie.sent ? t('web.network.cookieSent') : t('web.network.cookieBlocked') }}</span>
                <span
                  v-if="cookie.reason"
                  class="block text-muted"
                >{{ cookie.reason }}</span>
              </li>
            </ul>
          </template>
          <template v-if="selected.response?.cookies.length">
            <h4 class="mt-2 mb-0.5 text-xs text-muted">
              {{ t('web.network.responseCookies') }}
            </h4>
            <ul class="space-y-1 text-xs">
              <li
                v-for="(cookie, index) in selected.response.cookies"
                :key="`set-${index}`"
                :data-stored="cookie.stored"
                data-testid="network-response-cookie"
              >
                <span class="font-mono break-all text-toned">{{ cookie.line }}</span>
                {{ ' ' }}<span :class="cookie.stored ? 'text-success' : 'text-error'">{{ cookie.stored ? t('web.network.cookieStored') : t('web.network.cookieRefused') }}</span>
                <span
                  v-if="cookie.reason"
                  class="block text-muted"
                >{{ cookie.reason }}</span>
              </li>
            </ul>
          </template>
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
