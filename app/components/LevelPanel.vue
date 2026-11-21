<script setup lang="ts">
import { createReusableTemplate } from '@vueuse/core'
import { levelIntro } from '#shared/levels'
import type { Level, LevelPlace } from '#shared/levels'
import { timeText } from '~/utils/track-view'

// Left column of the play page, the same in every track. A scenario: breadcrumb, title, story, the live goal checklist, Hint and Reset, the
// solved card with Show debrief and Next level. A practice task is the compact variant (preview "Stage only app.js"):
// breadcrumb through its scenario, title with "Practice · ~30 s", the task, its goal, one hint shown in place, and once
// solved a one-line why with Next and Again. The ⋯ menu beside the title holds Play again, "practise again" and
// Mark as not solved. The default slot (under the goals) is the track's own (Debugging: revealed hints, a click's verdict),
// the `intro` slot (under the story) too (Web fundamentals: the prediction card).
// `storyCollapsed` (Web fundamentals while the prediction is the step that blocks): the intro comes right under the title
// and the story follows it, cut to the start of its first paragraph with a toggle to read it all, so every answer of the
// prediction is on screen.
const props = withDefaults(defineProps<{
  level: Level
  /** Track, chapter and number of the level, for the breadcrumb back to the track page. */
  place: LevelPlace
  goals: { id: string, label: string, met: boolean }[]
  hintsUsed: number
  solved: boolean
  /** Files with conflicts, each a button that opens it (git); none in other tracks. */
  conflictedFiles?: string[]
  next: Level | null
  storyCollapsed?: boolean
}>(), { conflictedFiles: () => [], storyCollapsed: false })

const emit = defineEmits<{
  hint: []
  reset: []
  again: []
  edit: [path: string]
  debrief: []
}>()

const { t } = useI18n()
const { entryItems } = useProgressActions()

const practice = computed(() => props.level.kind === 'practice' ? props.level : null)
const paragraphs = computed(() => levelIntro(props.level).split(/\n{2,}/))
const metCount = computed(() => props.goals.filter(goal => goal.met).length)
const hintsTotal = computed(() => props.level.hints.length)
const time = computed(() => timeText(t, props.level.minutes))
// Play again restarts this page; Mark as not solved restarts it too (useProgress restarts open play pages)
const menu = computed(() => entryItems(props.place, { onPlayAgain: () => emit('again') }))

const [DefineStory, ReuseStory] = createReusableTemplate()
const storyOpen = ref(false)
watch(() => props.storyCollapsed, (collapsed) => {
  if (!collapsed) storyOpen.value = false
})
const storyShort = computed(() => props.storyCollapsed && !storyOpen.value)

// A click on Hint or Reset hands the focus back to where you were working (the terminal, the Console, the editor, a
// panel): a button that kept it would fire again on the next Enter you type. With the keyboard the focus stays on the
// button, where you put it. `workFocus` is the last such place outside this panel.
const root = useTemplateRef<HTMLElement>('root')
let workFocus: HTMLElement | null = null
function onFocusIn(event: FocusEvent) {
  const target = event.target
  if (!(target instanceof HTMLElement) || root.value?.contains(target) || target.tagName === 'IFRAME') return
  // a field you type in, or a panel's own focusable region (a log, a list); never a button, which Enter would fire again
  const typing = target.matches('input:not([type="button"], [type="submit"], [type="checkbox"], [type="radio"]), textarea, [contenteditable="true"]')
  const region = !target.matches('button, a, select, summary, [role="button"], [role="tab"], [role="menuitem"]') && target.closest('[role="tabpanel"], [role="log"]')
  if (typing || region) workFocus = target
}
onMounted(() => document.addEventListener('focusin', onFocusIn))
onBeforeUnmount(() => document.removeEventListener('focusin', onFocusIn))

function act(event: MouseEvent | PointerEvent, name: 'hint' | 'reset') {
  const button = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  if (name === 'hint') emit('hint')
  else emit('reset')
  // keyboard (Enter or Space give no click count): the focus stays
  if (event.detail === 0) return
  // a tap: refocusing an input would open the phone's keyboard
  if ('pointerType' in event && event.pointerType !== 'mouse' && event.pointerType !== '') return
  nextTick(() => {
    // the parent may have moved the focus on purpose (Reset into the editor): only restore from the button itself
    const active = document.activeElement
    if (active !== button && active !== document.body && active !== null) return
    if (workFocus?.isConnected && !workFocus.closest('[inert]')) workFocus.focus({ preventScroll: true })
    else button?.blur()
  })
}

// Solved: the card with Next level comes into view inside the rail (it scrolls on its own from lg), smoothly unless you
// asked for reduced motion. On a page that opens already solved it is simply there.
const solvedCard = useTemplateRef<HTMLElement>('solvedCard')
function showSolved(behavior: ScrollBehavior) {
  nextTick(() => solvedCard.value?.scrollIntoView({ block: 'nearest', behavior }))
}
watch(() => props.solved, (solved, was) => {
  if (!solved || was) return
  showSolved(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')
})
onMounted(() => {
  if (props.solved) showSolved('auto')
})
</script>

<template>
  <div
    ref="root"
    class="flex flex-col gap-5"
    :data-kind="level.kind"
  >
    <header>
      <nav :aria-label="t('play.breadcrumb')">
        <ol class="flex items-center gap-x-1 text-xs whitespace-nowrap text-muted">
          <li class="shrink-0">
            <NuxtLink
              :to="trackPath(place.track.id)"
              class="inline-flex min-h-6 items-center rounded-sm hover:text-highlighted hover:underline pointer-coarse:min-h-11"
              data-testid="crumb-track"
            >{{ place.track.title }}</NuxtLink>
          </li>
          <li class="flex min-w-0 items-center gap-x-1">
            <UIcon
              name="i-lucide-chevron-right"
              class="size-3 shrink-0 text-dimmed"
            />
            <NuxtLink
              :to="trackPath(place.track.id, place.chapter.id)"
              class="block min-h-6 min-w-0 truncate rounded-sm leading-6 hover:text-highlighted hover:underline focus-visible:overflow-visible focus-visible:whitespace-normal pointer-coarse:min-h-11 pointer-coarse:leading-11"
              :title="place.chapter.title"
            >{{ place.chapter.title }}</NuxtLink>
          </li>
          <!-- the trail ends one step above this entry: the heading below names it. It stays on one line: the last item
               (the scenario's title, which can be long) is cut with an ellipsis and has its full name as a tooltip. -->
          <li
            v-if="place.scenario"
            class="flex min-w-0 items-center gap-x-1"
          >
            <UIcon
              name="i-lucide-chevron-right"
              class="size-3 shrink-0 text-dimmed"
            />
            <NuxtLink
              :to="levelPath(place.scenario.level)"
              class="block min-h-6 min-w-0 truncate rounded-sm leading-6 hover:text-highlighted hover:underline focus-visible:overflow-visible focus-visible:whitespace-normal pointer-coarse:min-h-11 pointer-coarse:leading-11"
              :title="`${place.scenario.number} ${place.scenario.level.title}`"
            ><span class="font-mono tabular-nums">{{ place.scenario.number }}</span> {{ place.scenario.level.title }}</NuxtLink>
          </li>
        </ol>
      </nav>
      <!-- the ⋯ menu floats beside the title's first line: a long title wraps under it to the full width, a short one
           stays on one line, the same on every track -->
      <div class="mt-1 flow-root">
        <MoreMenu
          class="float-right ms-2 -me-1.5"
          :items="menu"
          :label="t('menu.entry.label', { name: level.title })"
        />
        <h1 class="text-2xl font-semibold text-pretty text-highlighted">
          <span
            v-if="place.number"
            class="mr-2 font-mono font-normal text-muted tabular-nums"
          >{{ place.number }}</span>{{ level.title }}
        </h1>
      </div>
      <p
        v-if="practice"
        class="mt-0.5 font-mono text-xs text-muted tabular-nums"
      >
        {{ t('practice.meta', { time }) }}
      </p>
    </header>

    <!-- the story: under the title; while the track's intro blocks (a prediction to make) it moves under the intro, cut
         to the start of its first paragraph with a toggle. The intro slot itself never moves, so its form keeps its state. -->
    <DefineStory>
      <div class="space-y-3 text-sm text-default">
        <div
          id="level-story"
          class="space-y-3"
          data-testid="level-story"
          :data-collapsed="storyShort || undefined"
        >
          <p
            v-for="(paragraph, index) in storyShort ? paragraphs.slice(0, 1) : paragraphs"
            :key="index"
            :class="{ 'line-clamp-3': storyShort }"
          >
            <InlineText :text="paragraph" />
          </p>
        </div>
        <UButton
          v-if="storyCollapsed"
          size="xs"
          color="neutral"
          :trailing-icon="storyOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          :label="storyOpen ? t('play.storyLess') : t('play.storyMore')"
          aria-controls="level-story"
          :aria-expanded="storyOpen"
          data-testid="story-toggle"
          @click="storyOpen = !storyOpen"
        />
      </div>
    </DefineStory>

    <ReuseStory v-if="!storyCollapsed" />

    <!-- what a track asks before the goals (Web fundamentals: the prediction card) -->
    <slot name="intro" />

    <ReuseStory v-if="storyCollapsed" />

    <section aria-labelledby="goals-heading">
      <h2
        id="goals-heading"
        class="flex items-baseline justify-between gap-2 font-mono text-xs font-medium text-muted"
      >
        {{ practice && goals.length === 1 ? t('goals.one') : t('goals.title') }}
        <span role="status">{{ t('goals.count', { met: metCount, total: goals.length }) }}</span>
      </h2>
      <ul class="mt-2 space-y-1.5">
        <li
          v-for="goal in goals"
          :key="goal.id"
          class="flex items-start gap-2 text-sm"
          :data-goal="goal.id"
          :data-met="goal.met"
        >
          <UIcon
            :name="goal.met ? 'i-lucide-circle-check' : 'i-lucide-circle'"
            class="mt-0.5 size-4 shrink-0"
            :class="goal.met ? 'text-success' : 'text-muted'"
          />
          <span :class="goal.met ? 'text-highlighted' : 'text-default'">
            <InlineText :text="goal.label" />
            <span class="sr-only">{{ goal.met ? t('goals.done') : t('goals.open') }}</span>
          </span>
        </li>
      </ul>
    </section>

    <!-- what a track adds under the goals (Debugging: revealed hints, a find task's verdict) -->
    <slot />

    <!-- a practice task's one hint shows in place once revealed (a git scenario's hints go to the terminal) -->
    <p
      v-if="practice && hintsUsed > 0"
      class="rounded-lg border border-default bg-elevated px-3 py-2 text-sm text-toned"
      data-testid="practice-hint"
    >
      <span class="font-medium text-highlighted">{{ t('practice.hint') }}</span>
      <InlineText :text="practice.hints[0]" />
    </p>

    <section
      v-if="conflictedFiles.length"
      aria-labelledby="conflicts-heading"
    >
      <h2
        id="conflicts-heading"
        class="font-mono text-xs font-medium text-muted"
      >
        {{ t('goals.conflicts') }}
      </h2>
      <ul class="mt-2 flex flex-wrap gap-2">
        <li
          v-for="path in conflictedFiles"
          :key="path"
        >
          <UButton
            size="sm"
            color="warning"
            icon="i-lucide-file-warning"
            class="font-mono"
            :label="path"
            :aria-label="t('goals.openFile', { path })"
            @click="$emit('edit', path)"
          />
        </li>
      </ul>
    </section>

    <div
      v-if="!(practice && solved)"
      class="flex flex-wrap gap-2"
    >
      <UButton
        color="neutral"
        icon="i-lucide-lightbulb"
        :label="practice ? t('practice.showHint') : t('play.hint', { used: hintsUsed, total: hintsTotal })"
        :disabled="!!practice && hintsUsed > 0"
        data-testid="hint-button"
        @click="act($event, 'hint')"
      />
      <UButton
        color="neutral"
        icon="i-lucide-rotate-ccw"
        :label="t('play.reset')"
        @click="act($event, 'reset')"
      />
    </div>

    <div
      v-if="solved && practice"
      ref="solvedCard"
      class="scroll-my-2 space-y-3 rounded-lg border border-success bg-success/10 p-3"
      data-testid="practice-solved"
    >
      <p class="flex items-center gap-2 text-sm font-semibold text-highlighted">
        <UIcon
          name="i-lucide-circle-check"
          class="size-5 shrink-0 text-success"
        />
        {{ t('practice.solved') }}
      </p>
      <p class="text-sm text-toned">
        <InlineText :text="practice.why" />
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="next"
          color="primary"
          variant="solid"
          trailing-icon="i-lucide-arrow-right"
          :to="levelPath(next)"
          :label="t('practice.next')"
        />
        <UButton
          v-else
          color="primary"
          variant="solid"
          :to="trackPath(place.track.id)"
          :label="t('debrief.all')"
        />
        <UButton
          color="neutral"
          icon="i-lucide-rotate-ccw"
          :label="t('practice.again')"
          @click="$emit('again')"
        />
      </div>
    </div>

    <div
      v-else-if="solved"
      ref="solvedCard"
      class="scroll-my-2 space-y-3 rounded-lg border border-success bg-success/10 p-3"
      data-testid="level-solved"
    >
      <p class="flex items-center gap-2 text-sm font-semibold text-highlighted">
        <UIcon
          name="i-lucide-circle-check"
          class="size-5 shrink-0 text-success"
        />
        {{ t('play.solved') }}
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          color="neutral"
          icon="i-lucide-book-open"
          :label="t('play.debrief')"
          @click="$emit('debrief')"
        />
        <UButton
          v-if="next"
          color="primary"
          variant="solid"
          trailing-icon="i-lucide-arrow-right"
          :to="levelPath(next)"
          :label="t('debrief.next')"
        />
        <UButton
          v-else
          color="primary"
          variant="solid"
          :to="trackPath(place.track.id)"
          :label="t('debrief.all')"
        />
      </div>
    </div>
  </div>
</template>
