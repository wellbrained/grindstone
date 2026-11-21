<script setup lang="ts">
import { statusTone } from '#shared/levels'
import type { DebugLevel, LevelPlace, WebLevel } from '#shared/levels'

// The Debugging play page (the play page picks it for a Debugging level; docs/features/ui.md, "Debugging play page"):
// in the shared PlayFrame, the level panel left, Code above the Console in the middle, the App on the right. A level
// with a backend has a Network panel too, a level of chapter 3 an Elements panel, one of chapter 5 the Debugger, one of
// chapter 6 the Performance panel, one of chapter 7 the Logs and Deploys panels, as tabs next to the Console (the
// chapter's own panels first, the first one open). Below lg the panels are tabs (App, Elements, Debugger or Performance,
// Logs, Deploys, Console, Network, Code; the ones the level has), all mounted, so switching never reloads the app. In
// chapter 7 the level panel also lists the colleagues' messages. No layout switch.
// A Web fundamentals level (ADR 0009) plays here too: its prediction card under the story (the app runs once it is
// answered), the Network panel with preflights and refusals, and a Server panel (what server.js did) after it; in
// chapter 2 also the Application panel (cookies) and the Other site panel (the attacker's page, a webmail); in chapter 5
// the Event loop panel (what ran, in order) instead of Network and Server; in chapter 6 the Accessibility panel (the
// tree, what the screen reader said, the modelled keyboard's keys) instead of them.
const props = defineProps<{
  level: DebugLevel | WebLevel
  place: LevelPlace
}>()

const { t } = useI18n()

const play = useDebuggingPlay(props.level)
const { session, store, goals, next, stats, reloads, find, webLevel, predictionOnly, predicting, hasNetwork, hasServer, hasApplication, hasSites, hasLoop, hasA11y, hasSecurity, hasElements, hasDebugger, hasPerformance, hasLogs, hasDeploys, requests, requestShown, picking, pickedAt, recordStatus, profileStatus, debriefOpen, progressBefore, sparkKey, mark, hint, reset, again } = play

type Lower = 'loop' | 'a11y' | 'elements' | 'debugger' | 'performance' | 'logs' | 'deploys' | 'console' | 'network' | 'server' | 'application' | 'site'
type Panel = 'app' | Lower | 'code'
/** The panels under the code (from lg one at a time, as tabs): the ones this level has, the chapter's own panel first. */
const LOWER: Lower[] = [
  ...(hasLoop ? ['loop' as const] : []),
  ...(hasA11y ? ['a11y' as const] : []),
  ...(hasElements ? ['elements' as const] : []),
  ...(hasDebugger ? ['debugger' as const] : []),
  ...(hasPerformance ? ['performance' as const] : []),
  ...(hasLogs ? ['logs' as const] : []),
  ...(hasDeploys ? ['deploys' as const] : []),
  'console',
  ...(hasNetwork ? ['network' as const] : []),
  ...(hasServer ? ['server' as const] : []),
  ...(hasApplication ? ['application' as const] : []),
  ...(hasSites ? ['site' as const] : [])
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
// a request shown from a log line: the Network panel, on phones and from lg
watch(requestShown, () => {
  panel.value = 'network'
  lower.value = 'network'
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
const lowerList = useTemplateRef<HTMLElement>('lowerList')
/** Arrow keys move along the lower tab set (they wrap), Home and End jump to its ends; the new tab gets the focus. */
function onLowerKey(event: KeyboardEvent) {
  // Alt+arrows go back and forward, Ctrl/Cmd/Shift arrows are the browser's or the system's
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const next = tabAfterKey(LOWER, lower.value, event.key)
  if (!next) return
  event.preventDefault()
  lower.value = next
  nextTick(() => lowerList.value?.querySelector<HTMLElement>(`[data-panel="${next}"]`)?.focus())
}

/** Some request failed (a 4xx or 5xx, CORS, no connection): the Network tab says so. */
const networkFailed = computed(() => requests.value.some(entry => statusTone(entry) === 'error'))
// the debrief gives focus back to the page (like Git's terminal): the open lower panel, where the next look starts (the
// others are hidden from lg, display: none, and can't take focus)
const consolePanel = useTemplateRef<{ focus: () => void }>('consolePanel')
const networkPanel = useTemplateRef<{ focus: () => void }>('networkPanel')
const elementsPanel = useTemplateRef<{ focus: () => void }>('elementsPanel')
const debuggerPanel = useTemplateRef<{ focus: () => void }>('debuggerPanel')
const performancePanel = useTemplateRef<{ focus: () => void }>('performancePanel')
const logsPanel = useTemplateRef<{ focus: () => void }>('logsPanel')
const deploysPanel = useTemplateRef<{ focus: () => void }>('deploysPanel')
const serverPanel = useTemplateRef<{ focus: () => void }>('serverPanel')
const applicationPanel = useTemplateRef<{ focus: () => void }>('applicationPanel')
const sitePanel = useTemplateRef<{ focus: () => void }>('sitePanel')
const loopPanel = useTemplateRef<{ focus: () => void }>('loopPanel')
const a11yPanel = useTemplateRef<{ focus: () => void }>('a11yPanel')
const focusConsole = () => ({ loop: loopPanel, a11y: a11yPanel, console: consolePanel, network: networkPanel, elements: elementsPanel, debugger: debuggerPanel, performance: performancePanel, logs: logsPanel, deploys: deploysPanel, server: serverPanel, application: applicationPanel, site: sitePanel })[lower.value].value?.focus()

const shown = (name: Panel) => panel.value === name ? '' : 'max-lg:hidden'
/** A lower panel: shown below lg as a tab of its own, from lg as the chosen one under the code. */
const shownLower = (name: Lower) => [shown(name), LOWER.length > 1 && lower.value !== name ? 'lg:hidden' : '']
/** The tab that names a panel: the phone's tab below lg, the lower tab from lg. */
const labelledBy = (name: Lower) => wide.value && LOWER.length > 1 ? `debugging-lower-tab-${name}` : `debugging-tab-${name}`
// a tab names every panel below lg, and from lg when there are several under the code: their headers drop the name
// then, and the open one's actions (Clear) sit in the tab row (utils/panel-chrome.ts)
provide(PANEL_CHROME, {
  nameClass: LOWER.length > 1 ? 'hidden' : 'max-lg:hidden',
  actionsInTabRow: name => wide.value && LOWER.length > 1 && lower.value === name
})

const revealedHints = computed(() => props.level.kind === 'scenario' ? props.level.hints.slice(0, session.value.hintsUsed) : [])
/** Where a wrong answer was: a line, or (chapter 7) a deploy. */
const answerWhere = computed(() => {
  const answer = store.value.answer
  if (!answer) return ''
  return 'deploy' in answer ? answer.deploy : `${answer.path}:${answer.line}`
})
const topNote = computed(() => {
  if (predictionOnly) return t('web.practiceNote')
  if (webLevel && hasLoop) return t('web.loopNote')
  if (webLevel && hasA11y) return t('web.a11yNote')
  if (webLevel && hasSecurity) return t('web.securityNote')
  if (webLevel) return t('web.note')
  if (find) return t('debugging.findNote')
  if (hasDebugger) return t('debugging.debuggerNote')
  if (hasPerformance) return t('debugging.performanceNote')
  if (hasLogs) return t('debugging.incidentNote')
  return t('debugging.note')
})
const counters = computed(() => stripCounters(webLevel
  ? { track: 'web', wrongPredictions: session.value.wrongPredictions ?? 0, reloads: reloads.value, predictionOnly }
  : { track: 'debugging', reloads: reloads.value }))
</script>

<template>
  <PlayStrip
    :icon="webLevel ? 'i-lucide-telescope' : find ? 'i-lucide-mouse-pointer-click' : 'i-lucide-bug'"
    :note="topNote"
    :counters="counters"
  />

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
        :story-collapsed="predicting"
        @hint="hint"
        @reset="reset"
        @again="again"
        @debrief="debriefOpen = true"
      >
        <template #intro>
          <WebPrediction
            v-if="webLevel"
            :play="play"
          />
        </template>
        <DebuggingTeam :play="play" />
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
          <span class="font-medium text-highlighted">{{ t('debugging.notIt', { where: answerWhere }) }}</span>
          {{ ' ' }}<InlineText :text="store.answer.why ?? ''" />
        </p>
      </LevelPanel>
    </template>

    <template #default>
      <!-- below lg: one panel at a time -->
      <PlayTabs
        v-model="panel"
        :names="PANELS"
        :label="t('debugging.panels')"
        id-prefix="debugging"
      >
        <template #tab="{ tab }">
          <template v-if="tab === 'performance'">
            <span aria-hidden="true">{{ t('debugging.panelShort.performance') }}</span><span class="sr-only">{{ t('debugging.panel.performance') }}</span>
          </template>
          <template v-else>
            {{ t(`debugging.panel.${tab}`) }}
          </template><span
            v-if="tab === 'network' && networkFailed"
            class="absolute top-1 right-1 size-1.5 rounded-full bg-error"
          ><span class="sr-only">, {{ t('debugging.network.failed') }}</span></span>
        </template>
      </PlayTabs>
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
          <!-- from lg: the panels under the code as tabs, the open one's actions (the Console's and Network's Clear) at
               the right end of their row -->
          <div
            v-if="LOWER.length > 1"
            class="flex min-h-7 items-center justify-between gap-2 max-lg:hidden"
          >
            <div
              ref="lowerList"
              role="tablist"
              :aria-label="lowerLabel"
              class="flex gap-1 rounded-lg border border-default bg-elevated p-0.5"
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
                {{ t(`debugging.panel.${name}`) }}<UIcon
                  v-if="name === 'network' && networkFailed"
                  name="i-lucide-circle-alert"
                  class="ms-1.5 size-3.5 align-[-0.125rem] text-error"
                /><span
                  v-if="name === 'network' && requests.length"
                  class="ms-1 font-mono tabular-nums"
                  :class="lower === name ? 'text-toned' : 'text-muted'"
                >{{ requests.length }}</span><span
                  v-if="name === 'network' && networkFailed"
                  class="sr-only"
                >, {{ t('debugging.network.failed') }}</span>
              </button>
            </div>
            <div
              id="debugging-lower-actions"
              class="flex shrink-0 items-center gap-1.5"
            />
          </div>
          <WebLoop
            v-if="hasLoop"
            id="debugging-loop"
            ref="loopPanel"
            role="tabpanel"
            :aria-labelledby="labelledBy('loop')"
            :play="play"
            class="max-lg:h-[30rem] lg:min-h-0 lg:flex-1"
            :class="shownLower('loop')"
          />
          <WebA11y
            v-if="hasA11y"
            id="debugging-a11y"
            ref="a11yPanel"
            role="tabpanel"
            :aria-labelledby="labelledBy('a11y')"
            :play="play"
            class="max-lg:h-[34rem] lg:min-h-0 lg:flex-1"
            :class="shownLower('a11y')"
          />
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
          <DebuggingLogs
            v-if="hasLogs"
            id="debugging-logs"
            ref="logsPanel"
            role="tabpanel"
            :aria-labelledby="labelledBy('logs')"
            :play="play"
            class="max-lg:h-[30rem] lg:min-h-0 lg:flex-1"
            :class="shownLower('logs')"
          />
          <DebuggingDeploys
            v-if="hasDeploys"
            id="debugging-deploys"
            ref="deploysPanel"
            role="tabpanel"
            :aria-labelledby="labelledBy('deploys')"
            :play="play"
            class="max-lg:h-[30rem] lg:min-h-0 lg:flex-1"
            :class="shownLower('deploys')"
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
          <DebuggingServer
            v-if="hasServer"
            id="debugging-server"
            ref="serverPanel"
            role="tabpanel"
            :aria-labelledby="labelledBy('server')"
            :play="play"
            class="max-lg:h-[22rem] lg:min-h-0 lg:flex-1"
            :class="shownLower('server')"
          />
          <WebApplication
            v-if="hasApplication"
            id="debugging-application"
            ref="applicationPanel"
            role="tabpanel"
            :aria-labelledby="labelledBy('application')"
            :play="play"
            class="max-lg:h-[28rem] lg:min-h-0 lg:flex-1"
            :class="shownLower('application')"
          />
          <WebSite
            v-if="hasSites"
            id="debugging-site"
            ref="sitePanel"
            role="tabpanel"
            :aria-labelledby="labelledBy('site')"
            :play="play"
            class="max-lg:h-[30rem] lg:min-h-0 lg:flex-1"
            :class="shownLower('site')"
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
    <template #results>
      <DebuggingRunStats :stats="stats" />
    </template>
  </DebriefDialog>
</template>
