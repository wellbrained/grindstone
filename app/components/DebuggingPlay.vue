<script setup lang="ts">
import { statusTone } from '#shared/levels'
import type { DebugLevel, LevelPlace } from '#shared/levels'

// The Debugging play page (the play page picks it for a Debugging level; docs/features/ui.md, "Debugging play page"):
// in the shared PlayFrame, the level panel left, Code above the Console in the middle, the App on the right. A level
// with a backend has a Network panel too, a level of chapter 3 an Elements panel, one of chapter 5 the Debugger, one of
// chapter 6 the Performance panel, as tabs next to the Console (the chapter's own panel first and open first). Below lg
// the panels are tabs (App, Elements, Debugger or Performance, Console, Network, Code; the ones the level has), all
// mounted, so switching never reloads the app. No layout switch.
const props = defineProps<{
  level: DebugLevel
  place: LevelPlace
}>()

const { t } = useI18n()

const play = useDebuggingPlay(props.level)
const { session, store, goals, next, stats, reloads, find, hasNetwork, hasElements, hasDebugger, hasPerformance, requests, picking, pickedAt, recordStatus, profileStatus, debriefOpen, progressBefore, sparkKey, mark, hint, reset, again } = play

type Lower = 'elements' | 'debugger' | 'performance' | 'console' | 'network'
type Panel = 'app' | Lower | 'code'
/** The panels under the code (from lg one at a time, as tabs): the ones this level has, the chapter's own panel first. */
const LOWER: Lower[] = [
  ...(hasElements ? ['elements' as const] : []),
  ...(hasDebugger ? ['debugger' as const] : []),
  ...(hasPerformance ? ['performance' as const] : []),
  'console',
  ...(hasNetwork ? ['network' as const] : [])
]
const PANELS: Panel[] = ['app', ...LOWER, 'code']
const isLower = (name: Panel): name is Lower => (LOWER as Panel[]).includes(name)
/** Below lg: the one panel shown. */
const panel = ref<Panel>('app')
/** From lg: the panel under the code (Elements in chapter 3, else the Console). */
const lower = ref<Lower>(LOWER[0]!)
// the two tab sets agree on the lower panel, so a resize keeps what you were looking at
watch(panel, (name) => {
  if (isLower(name)) lower.value = name
})
watch(lower, (name) => {
  if (isLower(panel.value)) panel.value = name
})
// a line opened from the Console, the Network or the Elements panel (or a find task's answer) shows Code on phones
watch(mark, (line) => {
  if (line) panel.value = 'code'
})
const wide = useMediaQuery('(min-width: 1024px)')
// pick mode on a phone: the App to click in, then back to the Elements panel with what you picked
watch(picking, (on, was) => {
  if (wide.value) return
  if (on) {
    panel.value = 'app'
    nextTick(() => document.getElementById('debugging-app')?.scrollIntoView({ block: 'nearest' }))
  } else if (was && panel.value === 'app') {
    panel.value = 'elements'
  }
})
watch(pickedAt, () => {
  if (!wide.value) panel.value = 'elements'
})
// recording on a phone: the App to use, then back to the Debugger to step through what it recorded
watch(recordStatus, (status, was) => {
  if (wide.value) return
  if (status === 'recording') panel.value = 'app'
  else if (status === 'recorded' && (was === 'recording' || was === 'stopping')) panel.value = 'debugger'
})
// a counted run on a phone (chapter 6): the App to use, then back to the Performance panel with its profile
watch(profileStatus, (status, was) => {
  if (wide.value) return
  if (status === 'recording') panel.value = 'app'
  else if (status === 'recorded' && (was === 'recording' || was === 'stopping')) panel.value = 'performance'
})
/** The Elements panel is the one on screen (its outline shows in the app only then). */
const elementsShown = computed(() => hasElements && (wide.value ? lower.value === 'elements' : panel.value === 'elements'))
/** The lower tab set's name: its panels ("Console and Network", "Debugger, Console and Network"). */
const lowerLabel = computed(() => {
  const names = LOWER.map(name => t(`debugging.panel.${name}`))
  return names.length > 1 ? t('debugging.lowerList', { first: names.slice(0, -1).join(', '), last: names.at(-1) }) : names[0]!
})
const TAB_COLUMNS: Record<number, string> = { 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' }

/** Arrow keys move along a tab set (they wrap), Home and End jump to its ends; the new tab gets the focus. */
function moveTab<T extends string>(event: KeyboardEvent, names: readonly T[], current: T, choose: (name: T) => void, list: HTMLElement | null) {
  const index = names.indexOf(current)
  const count = names.length
  const to = event.key === 'ArrowRight'
    ? (index + 1) % count
    : event.key === 'ArrowLeft' ? (index + count - 1) % count : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : -1
  if (to < 0) return
  event.preventDefault()
  choose(names[to]!)
  nextTick(() => list?.querySelector<HTMLElement>(`[data-panel="${names[to]}"]`)?.focus())
}
const tabList = useTemplateRef<HTMLElement>('tabList')
const lowerList = useTemplateRef<HTMLElement>('lowerList')
const onTabKey = (event: KeyboardEvent) => moveTab(event, PANELS, panel.value, (name) => {
  panel.value = name
}, tabList.value)
const onLowerKey = (event: KeyboardEvent) => moveTab(event, LOWER, lower.value, (name) => {
  lower.value = name
}, lowerList.value)

/** Some request failed (a 4xx or 5xx, CORS, no connection): the Network tab says so. */
const networkFailed = computed(() => requests.value.some(entry => statusTone(entry) === 'error'))
// the debrief gives focus back to the page (like Git's terminal): the open lower panel, where the next look starts (the
// others are hidden from lg, display: none, and can't take focus)
const consolePanel = useTemplateRef<{ focus: () => void }>('consolePanel')
const networkPanel = useTemplateRef<{ focus: () => void }>('networkPanel')
const elementsPanel = useTemplateRef<{ focus: () => void }>('elementsPanel')
const debuggerPanel = useTemplateRef<{ focus: () => void }>('debuggerPanel')
const performancePanel = useTemplateRef<{ focus: () => void }>('performancePanel')
const focusConsole = () => ({ console: consolePanel, network: networkPanel, elements: elementsPanel, debugger: debuggerPanel, performance: performancePanel })[lower.value].value?.focus()

const shown = (name: Panel) => panel.value === name ? '' : 'max-lg:hidden'
/** A lower panel: shown below lg as a tab of its own, from lg as the chosen one under the code. */
const shownLower = (name: Lower) => [shown(name), LOWER.length > 1 && lower.value !== name ? 'lg:hidden' : '']
/** The tab that names a panel: the phone's tab below lg, the lower tab from lg. */
const labelledBy = (name: Lower) => wide.value && LOWER.length > 1 ? `debugging-lower-tab-${name}` : `debugging-tab-${name}`

const revealedHints = computed(() => props.level.kind === 'scenario' ? props.level.hints.slice(0, session.value.hintsUsed) : [])
</script>

<template>
  <div class="mb-3 flex min-h-8 items-center justify-between gap-4">
    <p class="flex min-w-0 items-center gap-2 text-xs text-muted">
      <UIcon
        :name="find ? 'i-lucide-mouse-pointer-click' : 'i-lucide-bug'"
        class="size-4 shrink-0"
      />
      {{ find ? t('debugging.findNote') : hasDebugger ? t('debugging.debuggerNote') : hasPerformance ? t('debugging.performanceNote') : t('debugging.note') }}
    </p>
    <p
      class="shrink-0 rounded-md border border-default px-2.5 py-1 font-mono text-xs text-muted tabular-nums"
      data-testid="reloads"
    >
      {{ t('debugging.reloads', { n: reloads }) }}
    </p>
  </div>

  <PlayFrame tabs>
    <template #panel>
      <LevelPanel
        class="min-w-0 lg:min-h-0 lg:flex-[1_1_0] lg:overflow-y-auto lg:pr-1"
        :level="level"
        :place="place"
        :goals="goals"
        :hints-used="session.hintsUsed"
        :solved="session.solved"
        :next="next"
        @hint="hint"
        @reset="reset"
        @again="again"
        @debrief="debriefOpen = true"
      >
        <section
          v-if="revealedHints.length"
          aria-labelledby="hints-heading"
        >
          <h2
            id="hints-heading"
            class="font-mono text-xs font-medium text-muted"
          >
            {{ t('debugging.hints') }}
          </h2>
          <ol
            class="mt-2 space-y-2"
            aria-live="polite"
          >
            <li
              v-for="(text, index) in revealedHints"
              :key="index"
              class="rounded-lg border border-default bg-elevated px-3 py-2 text-sm text-toned"
              data-testid="hint"
            >
              <span class="me-1 font-mono text-xs text-muted tabular-nums">{{ index + 1 }}/{{ level.hints.length }}</span>
              <InlineText :text="text" />
            </li>
          </ol>
        </section>
        <p
          v-if="store.answer && !store.answer.right"
          role="status"
          class="rounded-lg border border-warning bg-warning/10 px-3 py-2 text-sm text-toned"
          data-testid="pick-verdict"
        >
          <span class="font-medium text-highlighted">{{ t('debugging.notIt', { where: `${store.answer.path}:${store.answer.line}` }) }}</span>
          {{ ' ' }}<InlineText :text="store.answer.why ?? ''" />
        </p>
      </LevelPanel>
    </template>

    <template #default>
      <!-- below lg: one panel at a time -->
      <div
        ref="tabList"
        role="tablist"
        :aria-label="t('debugging.panels')"
        class="mb-3 grid gap-1 rounded-lg border border-default bg-elevated p-1 lg:hidden"
        :class="TAB_COLUMNS[PANELS.length]"
        @keydown="onTabKey"
      >
        <button
          v-for="name in PANELS"
          :id="`debugging-tab-${name}`"
          :key="name"
          type="button"
          role="tab"
          :aria-selected="panel === name"
          :aria-controls="`debugging-${name}`"
          :tabindex="panel === name ? 0 : -1"
          :data-panel="name"
          class="relative min-w-0 cursor-pointer rounded-md px-1 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-primary sm:px-3"
          :class="panel === name ? 'bg-accented font-medium text-highlighted' : 'text-muted hover:text-highlighted'"
          @click="panel = name"
        >
          <template v-if="name === 'performance'">
            <span aria-hidden="true">{{ t('debugging.panelShort.performance') }}</span><span class="sr-only">{{ t('debugging.panel.performance') }}</span>
          </template>
          <template v-else>
            {{ t(`debugging.panel.${name}`) }}
          </template><span
            v-if="name === 'network' && networkFailed"
            class="absolute top-1 right-1 size-1.5 rounded-full bg-error"
          ><span class="sr-only">, {{ t('debugging.network.failed') }}</span></span>
        </button>
      </div>
      <div class="flex min-h-0 flex-1 flex-col gap-4">
        <DebuggingCode
          id="debugging-code"
          role="tabpanel"
          aria-labelledby="debugging-tab-code"
          :play="play"
          class="max-lg:h-[28rem] lg:min-h-40"
          :class="[shown('code'), hasElements || hasDebugger || hasPerformance ? 'lg:flex-[1.1_1_0]' : 'lg:flex-[1.6_1_0]']"
        />
        <div class="flex min-h-0 flex-col gap-2 max-lg:contents lg:min-h-44 lg:flex-[1_1_0]">
          <!-- from lg: Elements, Console or Network under the code -->
          <div
            v-if="LOWER.length > 1"
            ref="lowerList"
            role="tablist"
            :aria-label="lowerLabel"
            class="flex gap-1 self-start rounded-lg border border-default bg-elevated p-0.5 max-lg:hidden"
            @keydown="onLowerKey"
          >
            <button
              v-for="name in LOWER"
              :id="`debugging-lower-tab-${name}`"
              :key="name"
              type="button"
              role="tab"
              :aria-selected="lower === name"
              :aria-controls="`debugging-${name}`"
              :tabindex="lower === name ? 0 : -1"
              :data-panel="name"
              data-testid="lower-tab"
              class="cursor-pointer rounded-md px-3 py-1 text-xs focus-visible:outline-2 focus-visible:outline-primary"
              :class="lower === name ? 'bg-accented font-medium text-highlighted' : 'text-muted hover:text-highlighted'"
              @click="lower = name"
            >
              {{ t(`debugging.panel.${name}`) }}<span
                v-if="name === 'network' && requests.length"
                class="ms-1.5 font-mono tabular-nums"
                :class="networkFailed ? 'text-error' : 'text-dimmed'"
              >{{ requests.length }}</span><span
                v-if="name === 'network' && networkFailed"
                class="sr-only"
              >, {{ t('debugging.network.failed') }}</span>
            </button>
          </div>
          <DebuggingElements
            v-if="hasElements"
            id="debugging-elements"
            ref="elementsPanel"
            role="tabpanel"
            :aria-labelledby="labelledBy('elements')"
            :play="play"
            :active="elementsShown"
            class="max-lg:h-[30rem] lg:min-h-0 lg:flex-1"
            :class="shownLower('elements')"
          />
          <DebuggingDebugger
            v-if="hasDebugger"
            id="debugging-debugger"
            ref="debuggerPanel"
            role="tabpanel"
            :aria-labelledby="labelledBy('debugger')"
            :play="play"
            class="max-lg:h-[32rem] lg:min-h-0 lg:flex-1"
            :class="shownLower('debugger')"
          />
          <DebuggingPerformance
            v-if="hasPerformance"
            id="debugging-performance"
            ref="performancePanel"
            role="tabpanel"
            :aria-labelledby="labelledBy('performance')"
            :play="play"
            class="max-lg:h-[34rem] lg:min-h-0 lg:flex-1"
            :class="shownLower('performance')"
          />
          <DebuggingConsole
            id="debugging-console"
            ref="consolePanel"
            role="tabpanel"
            :aria-labelledby="labelledBy('console')"
            :play="play"
            class="max-lg:h-[26rem] lg:min-h-0 lg:flex-1"
            :class="shownLower('console')"
          />
          <DebuggingNetwork
            v-if="hasNetwork"
            id="debugging-network"
            ref="networkPanel"
            role="tabpanel"
            :aria-labelledby="labelledBy('network')"
            :play="play"
            class="max-lg:h-[26rem] lg:min-h-0 lg:flex-1"
            :class="shownLower('network')"
          />
        </div>
      </div>
    </template>

    <template #side>
      <div
        id="debugging-app"
        role="tabpanel"
        aria-labelledby="debugging-tab-app"
        class="relative h-full max-lg:h-[32rem]"
        :class="shown('app')"
      >
        <DebuggingApp :play="play" />
        <SparkBurst :trigger="sparkKey" />
      </div>
    </template>
  </PlayFrame>

  <DebriefDialog
    v-if="level.kind === 'scenario'"
    v-model:open="debriefOpen"
    :level="level"
    :place="place"
    :progress-before="progressBefore"
    :next="next"
    :track-to="trackPath(place.track.id)"
    @closed="focusConsole"
  >
    <template #stats>
      <DebuggingRunStats :stats="stats" />
    </template>
  </DebriefDialog>
</template>
