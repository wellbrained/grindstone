<script setup lang="ts">
import type { DebugLevel, LevelPlace } from '#shared/levels'

// The Debugging play page (the play page picks it for a Debugging level; docs/features/ui.md, "Debugging play page"):
// in the shared PlayFrame, the level panel left, Code above the Console in the middle, the App on the right. Below lg
// the three are tabs (App, Console, Code), all mounted, so switching never reloads the app. No layout switch.
const props = defineProps<{
  level: DebugLevel
  place: LevelPlace
}>()

const { t } = useI18n()

const play = useDebuggingPlay(props.level)
const { session, store, goals, next, stats, reloads, find, debriefOpen, progressBefore, sparkKey, mark, hint, reset, again } = play

type Panel = 'app' | 'console' | 'code'
const PANELS: Panel[] = ['app', 'console', 'code']
const panel = ref<Panel>('app')
// a line opened from the Console (or a find task's answer) shows the Code panel on phones
watch(mark, (line) => {
  if (line) panel.value = 'code'
})

const tabList = useTemplateRef<HTMLElement>('tabList')
function onTabKey(event: KeyboardEvent) {
  const index = PANELS.indexOf(panel.value)
  const to = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : -1
  if (to < 0) return
  event.preventDefault()
  panel.value = PANELS[to]!
  nextTick(() => tabList.value?.querySelector<HTMLElement>(`[data-panel="${PANELS[to]}"]`)?.focus())
}
// the debrief gives focus back to the page (like Git's terminal): the Console input, where the next look starts
const consolePanel = useTemplateRef<{ focus: () => void }>('consolePanel')
const focusConsole = () => consolePanel.value?.focus()

const shown = (name: Panel) => panel.value === name ? '' : 'max-lg:hidden'

const revealedHints = computed(() => props.level.kind === 'scenario' ? props.level.hints.slice(0, session.value.hintsUsed) : [])
</script>

<template>
  <div class="mb-3 flex min-h-8 items-center justify-between gap-4">
    <p class="flex min-w-0 items-center gap-2 text-xs text-muted">
      <UIcon
        :name="find ? 'i-lucide-mouse-pointer-click' : 'i-lucide-bug'"
        class="size-4 shrink-0"
      />
      {{ find ? t('debugging.findNote') : t('debugging.note') }}
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
        class="mb-3 grid grid-cols-3 gap-1 rounded-lg border border-default bg-elevated p-1 lg:hidden"
        @keydown="onTabKey"
      >
        <button
          v-for="name in PANELS"
          :key="name"
          type="button"
          :id="`debugging-tab-${name}`"
          role="tab"
          :aria-selected="panel === name"
          :aria-controls="`debugging-${name}`"
          :tabindex="panel === name ? 0 : -1"
          :data-panel="name"
          class="cursor-pointer rounded-md px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-primary"
          :class="panel === name ? 'bg-accented font-medium text-highlighted' : 'text-muted hover:text-highlighted'"
          @click="panel = name"
        >
          {{ t(`debugging.panel.${name}`) }}
        </button>
      </div>
      <div class="flex min-h-0 flex-1 flex-col gap-4">
        <DebuggingCode
          id="debugging-code"
          role="tabpanel"
          aria-labelledby="debugging-tab-code"
          :play="play"
          class="max-lg:h-[28rem] lg:min-h-40 lg:flex-[1.6_1_0]"
          :class="shown('code')"
        />
        <DebuggingConsole
          id="debugging-console"
          ref="consolePanel"
          role="tabpanel"
          aria-labelledby="debugging-tab-console"
          :play="play"
          class="max-lg:h-[26rem] lg:min-h-44 lg:flex-[1_1_0]"
          :class="shown('console')"
        />
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
