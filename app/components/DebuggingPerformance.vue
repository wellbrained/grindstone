<script setup lang="ts">
import { durationText, functionRows, profileSummary, renderRows, requestRows, statusLabel, statusTone, timelineEnd } from '#shared/levels'
import type { FunctionPlace, ProfileAction, RequestRow, SourceLine, StatusTone } from '#shared/levels'
import type { DebuggingPlaySession } from '~/composables/useDebuggingPlay'

// Debugging's Performance panel (chapter 6, ADR 0007 "Performance"; docs/features/ui.md, "Performance"): Record reloads
// the app with its code instrumented to count, you use it, Stop shows the profile. Counted, never timed: a unit of work
// is a statement of the app's code that ran, a render is a call of a function that changed the page, and requests sit
// on the server's clock (its scripted delays), so the numbers are the same in every browser, and the panel says so.
// One action at a time or the whole recording: the functions by their work, the renders with the lines that changed
// the page, the requests over time (a waterfall and a repeat say so). Every function, line and request links its line
// in Code (in a find task it is the answer). Tables first; the bars are a picture of the numbers beside them. Text only.
const props = defineProps<{ play: DebuggingPlaySession }>()

const { t } = useI18n()
const { find, checking, toolsFailed, profileStatus, profiling, profileWork, profileOutdated, recordProfile, stopProfile, profileLine } = props.play

/** How many rows a table shows before "… and n more". */
const ROWS = 30

const profile = computed(() => profileStatus.value === 'recorded' ? profiling.value?.profile ?? null : null)
const map = computed(() => profiling.value?.map ?? { points: [], functions: [] })
const requests = computed(() => profiling.value?.requests ?? [])
const skipped = computed(() => profiling.value?.map.skipped ?? [])

/** The action shown: its index, or null for the whole recording (a new profile starts with the whole recording). */
const chosen = ref<number | null>(null)
watch(profile, () => {
  chosen.value = null
})

const number = (n: number) => n.toLocaleString('en')

function actionLabel(action: ProfileAction, index: number): string {
  const label = t(`debugging.performance.action.${action.kind}`, { target: action.target, label: action.label })
  const text = action.more > 0 ? t('debugging.performance.more', { label, n: action.more }) : label
  return `${index + 1}. ${text} · ${t('debugging.performance.units', { n: number(action.work) }, action.work)}`
}

const summary = computed(() => profile.value ? profileSummary(profile.value, requests.value, chosen.value) : null)
const functions = computed(() => profile.value ? functionRows(profile.value, map.value, chosen.value) : [])
const renders = computed(() => profile.value ? renderRows(profile.value, map.value, chosen.value) : [])
const timeline = computed(() => profile.value ? requestRows(profile.value, requests.value, chosen.value) : [])
const axis = computed(() => timelineEnd(timeline.value))
const maxTotal = computed(() => Math.max(1, ...functions.value.map(row => row.total)))
const maxNodes = computed(() => Math.max(1, ...renders.value.map(row => row.nodes)))

const where = (line: SourceLine) => `${line.path}:${line.line}`
const fnName = (place: FunctionPlace) => place.module ? t('debugging.performance.topLevel', { path: place.path }) : place.name
const linkLabel = (name: string, line: SourceLine) => t(find ? 'debugging.performance.answer' : 'debugging.performance.open', { name, path: line.path, line: line.line })
/** A share of the biggest number as a bar's width (at least a sliver, so a small one still shows). */
const share = (value: number, max: number) => `${Math.max(2, Math.round(value / max * 100))}%`

const TONE: Record<StatusTone, string> = { pending: 'text-dimmed', success: 'text-success', neutral: 'text-muted', error: 'text-error' }
/** The name of a request a row shows and what it waited for (by the other request's name). */
const requestName = (row: RequestRow | undefined) => row?.entry ? `${row.entry.method} ${row.entry.name}` : `#${row?.id ?? '?'}`
const byId = computed(() => new Map(timeline.value.map(row => [row.id, row])))
const afterName = (row: RequestRow) => {
  if (row.after === null) return ''
  const other = byId.value.get(row.after)
  return other?.entry?.name ?? `#${row.after}`
}
/** A request's bar on the view's axis: from its start to its answer (to the axis' end while on its way), never past the cell. */
function bar(row: RequestRow) {
  const left = Math.min(row.start / axis.value * 100, 99)
  const length = ((row.end ?? axis.value) - row.start) / axis.value * 100
  return { marginInlineStart: `${left}%`, width: `${Math.min(Math.max(length, 1), 100 - left)}%` }
}
const range = (row: RequestRow) => row.end === null
  ? t('debugging.performance.rangePending', { start: number(row.start) })
  : t('debugging.performance.range', { start: number(row.start), end: number(row.end) })

const select = useTemplateRef<HTMLSelectElement>('select')
const recordButton = useTemplateRef<{ $el: HTMLElement }>('recordButton')
const stopButton = useTemplateRef<{ $el: HTMLElement }>('stopButton')
// the focus after the debrief: the view's choice once there is a profile, else Record, else Stop while recording
const focus = () => (select.value ?? recordButton.value?.$el ?? stopButton.value?.$el)?.focus()
defineExpose({ focus })
// Stop (the panel's or the App's) is gone once the profile is in, and the focus with it: it goes to the panel instead
// (on a phone the panel is the tab on screen by then); focus somewhere real, like the app, stays where it is
watch(profileStatus, (status, was) => {
  if (status !== 'recorded' || (was !== 'recording' && was !== 'stopping')) return
  nextTick(() => {
    const active = document.activeElement
    if (!active || active === document.body) focus()
  })
})
</script>

<template>
  <section
    :aria-label="t('debugging.performance.label')"
    class="@container flex min-h-0 flex-col overflow-hidden rounded-lg border border-(--app-terminal-border) bg-(--app-terminal) text-[13px] focus-within:ring-2 focus-within:ring-primary"
    data-testid="performance"
  >
    <header class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-(--app-terminal-border) px-3 py-1 text-xs text-muted">
      <span class="flex items-center gap-1.5">
        <UIcon
          name="i-lucide-gauge"
          class="size-4"
        />
        {{ t('debugging.performance.label') }}
        <span
          v-if="profileStatus === 'recording' || profileStatus === 'stopping'"
          class="font-mono text-dimmed tabular-nums"
          data-testid="performance-count"
        >{{ t('debugging.performance.units', { n: number(profileWork) }, profileWork) }}</span>
      </span>
      <UButton
        v-if="profileStatus === 'recording' || profileStatus === 'stopping'"
        ref="stopButton"
        size="xs"
        color="error"
        icon="i-lucide-square"
        :label="t('debugging.performance.stop')"
        :loading="profileStatus === 'stopping'"
        data-testid="performance-stop"
        @click="stopProfile"
      />
      <UButton
        v-else
        ref="recordButton"
        size="xs"
        color="neutral"
        icon="i-lucide-circle-dot"
        :label="profileStatus === 'recorded' ? t('debugging.performance.recordAgain') : t('debugging.performance.record')"
        :disabled="checking"
        data-testid="performance-record"
        @click="recordProfile"
      />
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <p
        v-if="toolsFailed"
        class="border-b border-(--app-terminal-border) bg-warning/10 px-3 py-1.5 text-xs text-highlighted"
        role="alert"
        data-testid="performance-tools-failed"
      >
        {{ t('debugging.performance.toolsFailed') }}
      </p>
      <p
        v-if="profileStatus === 'idle'"
        class="px-3 py-2 text-xs text-muted"
      >
        {{ t('debugging.performance.intro') }}
      </p>
      <p
        v-else-if="profileStatus === 'recording' || profileStatus === 'stopping'"
        class="flex items-start gap-2 px-3 py-2 text-xs text-highlighted"
        role="status"
      >
        <span
          class="mt-1 size-2 shrink-0 animate-pulse rounded-full bg-error motion-reduce:animate-none"
          aria-hidden="true"
        />
        {{ t('debugging.performance.recording') }}
      </p>
      <template v-else>
        <p
          class="flex items-start gap-2 border-b border-(--app-terminal-border) bg-info/10 px-3 py-1.5 text-xs text-highlighted"
          data-testid="performance-recorded"
        >
          <UIcon
            name="i-lucide-calculator"
            class="mt-px size-3.5 shrink-0 text-info"
          />
          <span>{{ t('debugging.performance.recorded') }}</span>
        </p>
        <p
          v-if="profile?.ended === 'work'"
          class="border-b border-(--app-terminal-border) bg-warning/10 px-3 py-1.5 text-xs text-highlighted"
          data-testid="performance-ended"
        >
          {{ t('debugging.performance.ended', { n: number(profile.work) }) }}
        </p>
        <p
          v-if="profileOutdated"
          class="border-b border-(--app-terminal-border) bg-warning/10 px-3 py-1.5 text-xs text-highlighted"
          data-testid="performance-outdated"
        >
          {{ t('debugging.performance.outdated') }}
        </p>
        <p
          v-for="file in skipped"
          :key="file.path"
          class="border-b border-(--app-terminal-border) bg-warning/10 px-3 py-1.5 text-xs text-highlighted"
        >
          {{ t(`debugging.performance.skipped.${file.reason}`, { path: file.path }) }}
        </p>
        <p
          v-if="!profile"
          class="px-3 py-2 text-xs text-muted"
          data-testid="performance-empty"
        >
          {{ t('debugging.performance.empty') }}
        </p>
      </template>

      <template v-if="profile">
        <!-- which action: one at a time, or the whole recording -->
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-(--app-terminal-border) px-3 py-1.5">
          <label
            for="performance-action"
            class="text-xs text-muted"
          >{{ t('debugging.performance.show') }}</label>
          <select
            id="performance-action"
            ref="select"
            :value="chosen === null ? 'all' : String(chosen)"
            class="min-w-0 flex-1 cursor-pointer rounded-md border border-(--app-terminal-border) bg-(--app-terminal) px-2 py-1 text-xs text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
            data-testid="performance-action"
            @change="chosen = ($event.target as HTMLSelectElement).value === 'all' ? null : Number(($event.target as HTMLSelectElement).value)"
          >
            <option value="all">
              {{ t('debugging.performance.all') }} · {{ t('debugging.performance.units', { n: number(profile.work) }, profile.work) }}
            </option>
            <option
              v-for="(action, index) in profile.actions"
              :key="index"
              :value="String(index)"
            >
              {{ actionLabel(action, index) }}
            </option>
          </select>
          <p class="w-full text-xs text-dimmed">
            {{ t('debugging.performance.actionsNote') }}
          </p>
        </div>

        <!-- the view's totals -->
        <dl
          v-if="summary"
          :aria-label="t('debugging.performance.summary')"
          class="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-(--app-terminal-border) px-3 py-2 text-xs @md:grid-cols-4"
          data-testid="performance-summary"
        >
          <div>
            <dt class="text-muted">
              {{ t('debugging.performance.work') }}
            </dt>
            <dd
              class="font-mono text-highlighted tabular-nums"
              data-testid="performance-work"
            >
              {{ t('debugging.performance.units', { n: number(summary.work) }, summary.work) }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              {{ t('debugging.performance.renders') }}
            </dt>
            <dd
              class="font-mono text-highlighted tabular-nums"
              data-testid="performance-renders"
            >
              {{ t('debugging.performance.rendersValue', { n: number(summary.renders), nodes: number(summary.nodes) }) }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              {{ t('debugging.performance.requests') }}
            </dt>
            <dd
              class="font-mono text-highlighted tabular-nums"
              data-testid="performance-requests"
            >
              {{ number(summary.requests) }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              {{ t('debugging.performance.serverTime') }}
            </dt>
            <dd
              class="font-mono text-highlighted tabular-nums"
              data-testid="performance-server-time"
            >
              {{ summary.serverTime === null ? t('debugging.performance.none') : durationText(summary.serverTime) }}
            </dd>
          </div>
        </dl>

        <!-- functions, the most work first -->
        <section
          aria-labelledby="performance-functions"
          class="border-b border-(--app-terminal-border) px-3 py-2"
        >
          <h3
            id="performance-functions"
            class="text-xs font-medium text-muted"
          >
            {{ t('debugging.performance.functions') }}
          </h3>
          <p class="mb-1 text-xs text-dimmed">
            {{ t('debugging.performance.functionsNote') }}
          </p>
          <p
            v-if="!functions.length"
            class="text-xs text-dimmed"
          >
            {{ t('debugging.performance.noFunctions') }}
          </p>
          <table
            v-else
            class="w-full table-fixed border-collapse text-xs"
            aria-labelledby="performance-functions"
            data-testid="performance-functions"
          >
            <thead>
              <tr class="text-muted">
                <th
                  scope="col"
                  class="py-1 text-start font-normal"
                >
                  {{ t('debugging.performance.function') }}
                </th>
                <th
                  scope="col"
                  class="w-12 py-1 text-end font-normal"
                >
                  {{ t('debugging.performance.calls') }}
                </th>
                <th
                  scope="col"
                  class="w-14 py-1 text-end font-normal"
                >
                  {{ t('debugging.performance.self') }}
                </th>
                <th
                  scope="col"
                  class="w-14 py-1 text-end font-normal"
                >
                  {{ t('debugging.performance.total') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in functions.slice(0, ROWS)"
                :key="row.fn"
                class="border-t border-(--app-terminal-border) align-top"
                :data-function="row.name"
              >
                <td class="min-w-0 py-1 pe-2">
                  <button
                    type="button"
                    class="flex w-full min-w-0 cursor-pointer flex-wrap items-baseline gap-x-2 rounded-sm text-start hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
                    :aria-label="linkLabel(fnName(row), row)"
                    :data-line="where(row)"
                    @click="profileLine(row)"
                  >
                    <span class="min-w-0 font-mono break-all text-highlighted">{{ fnName(row) }}</span>
                    <span class="shrink-0 font-mono text-info">{{ where(row) }}</span>
                  </button>
                  <span
                    class="mt-1 block h-1 rounded-full bg-primary/60"
                    :style="{ width: share(row.total, maxTotal) }"
                    aria-hidden="true"
                  />
                </td>
                <td class="py-1 text-end font-mono tabular-nums">
                  {{ number(row.calls) }}
                </td>
                <td class="py-1 text-end font-mono tabular-nums">
                  {{ number(row.self) }}
                </td>
                <td class="py-1 text-end font-mono text-highlighted tabular-nums">
                  {{ number(row.total) }}
                </td>
              </tr>
            </tbody>
          </table>
          <p
            v-if="functions.length > ROWS"
            class="mt-1 text-xs text-dimmed"
          >
            {{ t('debugging.performance.moreRows', { n: functions.length - ROWS }) }}
          </p>
        </section>

        <!-- renders: the calls that changed the page, and their lines -->
        <section
          aria-labelledby="performance-renders-title"
          class="border-b border-(--app-terminal-border) px-3 py-2"
        >
          <h3
            id="performance-renders-title"
            class="text-xs font-medium text-muted"
          >
            {{ t('debugging.performance.rendersTitle') }}
          </h3>
          <p class="mb-1 text-xs text-dimmed">
            {{ t('debugging.performance.rendersNote') }}
          </p>
          <p
            v-if="!renders.length"
            class="text-xs text-dimmed"
          >
            {{ t('debugging.performance.noRenders') }}
          </p>
          <table
            v-else
            class="w-full table-fixed border-collapse text-xs"
            aria-labelledby="performance-renders-title"
            data-testid="performance-renders-table"
          >
            <thead>
              <tr class="text-muted">
                <th
                  scope="col"
                  class="py-1 text-start font-normal"
                >
                  {{ t('debugging.performance.function') }}
                </th>
                <th
                  scope="col"
                  class="w-16 py-1 text-end font-normal"
                >
                  {{ t('debugging.performance.renders') }}
                </th>
                <th
                  scope="col"
                  class="w-14 py-1 text-end font-normal"
                >
                  {{ t('debugging.performance.nodes') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in renders.slice(0, ROWS)"
                :key="row.fn"
                class="border-t border-(--app-terminal-border) align-top"
                :data-render="row.name"
              >
                <td class="min-w-0 py-1 pe-2">
                  <button
                    type="button"
                    class="flex w-full min-w-0 cursor-pointer flex-wrap items-baseline gap-x-2 rounded-sm text-start hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
                    :aria-label="linkLabel(fnName(row), row)"
                    :data-line="where(row)"
                    @click="profileLine(row)"
                  >
                    <span class="min-w-0 font-mono break-all text-highlighted">{{ fnName(row) }}</span>
                    <span class="shrink-0 font-mono text-info">{{ where(row) }}</span>
                  </button>
                  <span
                    class="mt-1 block h-1 rounded-full bg-secondary/60"
                    :style="{ width: share(row.nodes, maxNodes) }"
                    aria-hidden="true"
                  />
                  <ul class="mt-1 space-y-0.5">
                    <li
                      v-for="line in row.lines"
                      :key="where(line)"
                    >
                      <button
                        type="button"
                        class="cursor-pointer rounded-sm font-mono text-info underline underline-offset-2 hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
                        :aria-label="linkLabel(`${fnName(row)}, ${t('debugging.performance.lineNodes', { n: number(line.nodes) }, line.nodes)}`, line)"
                        :data-line="where(line)"
                        @click="profileLine(line)"
                      >
                        {{ where(line) }}
                      </button>
                      <span class="text-dimmed"> · {{ t('debugging.performance.lineNodes', { n: number(line.nodes) }, line.nodes) }}</span>
                    </li>
                  </ul>
                </td>
                <td class="py-1 text-end font-mono tabular-nums">
                  {{ number(row.renders) }}
                </td>
                <td class="py-1 text-end font-mono text-highlighted tabular-nums">
                  {{ number(row.nodes) }}
                </td>
              </tr>
            </tbody>
          </table>
          <p
            v-if="renders.length > ROWS"
            class="mt-1 text-xs text-dimmed"
          >
            {{ t('debugging.performance.moreRows', { n: renders.length - ROWS }) }}
          </p>
        </section>

        <!-- requests on the server's clock: a simple waterfall -->
        <section
          aria-labelledby="performance-requests-title"
          class="px-3 py-2"
        >
          <h3
            id="performance-requests-title"
            class="text-xs font-medium text-muted"
          >
            {{ t('debugging.performance.requestsTitle') }}
          </h3>
          <p class="mb-1 text-xs text-dimmed">
            {{ t('debugging.performance.requestsNote') }}
          </p>
          <p
            v-if="!timeline.length"
            class="text-xs text-dimmed"
          >
            {{ t('debugging.performance.noRequests') }}
          </p>
          <table
            v-else
            class="w-full table-fixed border-collapse text-xs"
            aria-labelledby="performance-requests-title"
            data-testid="performance-timeline"
          >
            <thead>
              <tr class="text-muted">
                <th
                  scope="col"
                  class="w-[45%] py-1 text-start font-normal"
                >
                  {{ t('debugging.performance.request') }}
                </th>
                <th
                  scope="col"
                  class="py-1 text-start font-normal"
                >
                  {{ t('debugging.performance.time') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in timeline.slice(0, ROWS)"
                :key="row.id"
                class="border-t border-(--app-terminal-border) align-top"
                :data-request="row.id"
              >
                <td class="min-w-0 py-1 pe-2">
                  <span
                    class="block font-mono break-all text-highlighted"
                    :title="row.entry?.url"
                  >{{ requestName(row) }}</span>
                  <span
                    v-if="row.entry"
                    class="font-mono"
                    :class="TONE[statusTone(row.entry)]"
                  >{{ statusLabel(row.entry) }}</span>
                  <button
                    v-if="row.entry?.initiator"
                    type="button"
                    class="ms-2 cursor-pointer rounded-sm font-mono text-info underline underline-offset-2 hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
                    :aria-label="linkLabel(`${requestName(row)}, ${t('debugging.performance.sentFrom')}`, row.entry.initiator)"
                    :data-line="where(row.entry.initiator)"
                    @click="profileLine(row.entry.initiator)"
                  >
                    {{ where(row.entry.initiator) }}
                  </button>
                  <span
                    v-if="row.after !== null"
                    class="block text-dimmed"
                    data-testid="request-after"
                  >{{ t('debugging.performance.after', { name: afterName(row) }) }}</span>
                  <span
                    v-if="row.repeats !== null"
                    class="block text-warning"
                    data-testid="request-repeats"
                  >{{ t('debugging.performance.repeats') }}</span>
                </td>
                <td class="min-w-0 py-1">
                  <span
                    class="block h-2.5 rounded-sm"
                    :class="row.end === null ? 'bg-muted/40' : 'bg-info/70'"
                    :style="bar(row)"
                    aria-hidden="true"
                  />
                  <span
                    class="font-mono text-muted tabular-nums"
                    data-testid="request-range"
                  >{{ range(row) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p
            v-if="timeline.length > ROWS"
            class="mt-1 text-xs text-dimmed"
          >
            {{ t('debugging.performance.moreRows', { n: timeline.length - ROWS }) }}
          </p>
        </section>
      </template>
    </div>
  </section>
</template>
