<script setup lang="ts">
import type { DebuggingPlaySession, StackFrame } from '~/composables/useDebuggingPlay'
import type { SourceLine } from '#shared/levels'

// Debugging's Debugger (chapter 5, ADR 0007 "Breakpoints"; docs/features/ui.md, "Debugger"): Record reloads the app with
// its code instrumented, you use the app, Stop ends the recording. Then you move through the recorded run: Resume to the
// next (or back to the previous) breakpoint, Step over, into, out and back, or the scrubber; the Scope shows the values
// of that moment, the Call stack who called whom. The app is never paused, and the panel says so. Shortcuts like the
// browser's DevTools where they don't clash: F8, F10, Shift+F11 (and Ctrl+\, Ctrl+', Ctrl+;, Ctrl+Shift+;); plain F11
// stays the browser's full screen, so step into is Ctrl+;. Everything shown is text.
const props = defineProps<{ play: DebuggingPlaySession }>()

const { t } = useI18n()
const {
  find, checking, recordStatus, recording, toolsFailed, stepCount, position, selectedFrame, moveNote, breakpoints, currentStep, callStack, scopes, hits, recordingOutdated,
  store, conditionError, record, stopRecording, goTo, stepOverNext, stepIntoNext, stepOutOf, stepBackOne, resume, resumeBack, selectFrame, toggleBreakpoint,
  removeBreakpoint, setCondition, answerStep, revealLine, pick
} = props.play

const recorded = computed(() => recordStatus.value === 'recorded' && stepCount.value > 0)
const location = computed(() => {
  const frame = callStack.value[0]
  return frame && currentStep.value ? { path: frame.path, line: frame.line } : null
})
/** The text of a line as the recording ran it (as saved now, for a breakpoint before any recording). */
function lineText(line: SourceLine): string {
  const files = recording.value?.files ?? store.value.drafts
  return (files[line.path]?.split('\n')[line.line - 1] ?? '').trim()
}
const where = (line: SourceLine) => `${line.path}:${line.line}`
const hasBreakpointHere = computed(() => location.value !== null && breakpoints.value.some(each => each.path === location.value!.path && each.line === location.value!.line))

/** Said after each move (a polite live region): where the recording is now, and what the move ended on. */
const spoken = computed(() => {
  if (!recorded.value || !location.value) return ''
  const at = t('debugging.debugger.at', { n: position.value + 1, total: stepCount.value, path: location.value.path, line: location.value.line })
  return moveNote.value ? `${at} ${t(`debugging.debugger.note.${moveNote.value}`)}` : at
})

const skipped = computed(() => recording.value?.map.skipped ?? [])

function onScrub(event: Event) {
  goTo(Number((event.target as HTMLInputElement).value) - 1)
}

/** A frame of the call stack: its scope shows and its line opens; in a find task it is an answer. */
function onFrame(frame: StackFrame) {
  selectFrame(frame.index)
  if (find) pick({ path: frame.path, line: frame.line })
}

function onCondition(index: number, event: Event) {
  setCondition(index, (event.target as HTMLInputElement).value)
}

// DevTools' keys, while there is a recording to step through and no dialog is open (the debrief, a confirmation). Shift
// with F8 or F10 is left alone (Shift+F10 opens the context menu), and so is plain F11 (the browser's full screen):
// step into is Ctrl+;
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (!recorded.value || event.altKey || event.metaKey || document.querySelector('[role="dialog"], [role="alertdialog"]')) return
  const { ctrlKey: ctrl, shiftKey: shift, key } = event
  const action = (key === 'F8' && !shift) || (ctrl && key === '\\')
    ? resume
    : (key === 'F10' && !shift) || (ctrl && !shift && key === '\'')
        ? stepOverNext
        : (key === 'F11' && shift) || (ctrl && shift && (key === ':' || key === ';'))
            ? stepOutOf
            : ctrl && !shift && key === ';' ? stepIntoNext : null
  if (!action) return
  event.preventDefault()
  action()
})

// the focus after the debrief: the first control that is there (stepping, else Record, else Stop while recording)
const recordButton = useTemplateRef<{ $el: HTMLElement }>('recordButton')
const stopButton = useTemplateRef<{ $el: HTMLElement }>('stopButton')
const toolbar = useTemplateRef<HTMLElement>('toolbar')
const focus = () => (toolbar.value?.querySelector<HTMLElement>('button:not([disabled])') ?? recordButton.value?.$el ?? stopButton.value?.$el)?.focus()
defineExpose({ focus })
// Stop (the panel's or the App's) is gone once the recording is in, and the focus with it: it goes to the controls
// instead (on a phone the Debugger is the tab on screen by then); focus somewhere real, like the app, stays where it is
watch(recordStatus, (status, was) => {
  if (status !== 'recorded' || (was !== 'recording' && was !== 'stopping')) return
  nextTick(() => {
    const active = document.activeElement
    if (!active || active === document.body) focus()
  })
})

const STEP_BUTTONS = computed(() => [
  { id: 'resume-back', icon: 'i-lucide-skip-back', label: t('debugging.debugger.resumeBack'), run: resumeBack },
  { id: 'step-back', icon: 'i-lucide-step-back', label: t('debugging.debugger.stepBack'), run: stepBackOne },
  { id: 'resume', icon: 'i-lucide-play', label: t('debugging.debugger.resume'), run: resume },
  { id: 'step-over', icon: 'i-lucide-redo-dot', label: t('debugging.debugger.stepOver'), run: stepOverNext },
  { id: 'step-into', icon: 'i-lucide-arrow-down-to-dot', label: t('debugging.debugger.stepInto'), run: stepIntoNext },
  { id: 'step-out', icon: 'i-lucide-arrow-up-from-dot', label: t('debugging.debugger.stepOut'), run: stepOutOf }
])
</script>

<template>
  <section
    :aria-label="t('debugging.debugger.label')"
    class="@container flex min-h-0 flex-col overflow-hidden rounded-lg border border-(--app-terminal-border) bg-(--app-terminal) text-[13px] focus-within:ring-2 focus-within:ring-primary"
    data-testid="debugger"
  >
    <header class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-(--app-terminal-border) px-3 py-1 text-xs text-muted">
      <span class="flex items-center gap-1.5">
        <UIcon
          name="i-lucide-bug-play"
          class="size-4"
        />
        {{ t('debugging.debugger.label') }}
        <span
          v-if="recordStatus === 'recording' || recordStatus === 'stopping'"
          class="font-mono text-dimmed tabular-nums"
          data-testid="debugger-count"
        >{{ t('debugging.debugger.steps', stepCount) }}</span>
      </span>
      <UButton
        v-if="recordStatus === 'recording' || recordStatus === 'stopping'"
        ref="stopButton"
        size="xs"
        color="error"
        icon="i-lucide-square"
        :label="t('debugging.debugger.stop')"
        :loading="recordStatus === 'stopping'"
        data-testid="debugger-stop"
        @click="stopRecording"
      />
      <UButton
        v-else
        ref="recordButton"
        size="xs"
        color="neutral"
        icon="i-lucide-circle-dot"
        :label="recordStatus === 'recorded' ? t('debugging.debugger.recordAgain') : t('debugging.debugger.record')"
        :disabled="checking"
        data-testid="debugger-record"
        @click="record"
      />
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <p
        v-if="toolsFailed"
        class="border-b border-(--app-terminal-border) bg-warning/10 px-3 py-1.5 text-xs text-highlighted"
        role="alert"
        data-testid="debugger-tools-failed"
      >
        {{ t('debugging.debugger.toolsFailed') }}
      </p>
      <!-- what this is: a recording, never a paused app -->
      <p
        v-if="recordStatus === 'idle'"
        class="px-3 py-2 text-xs text-muted"
      >
        {{ t('debugging.debugger.intro') }}
      </p>
      <p
        v-else-if="recordStatus === 'recording' || recordStatus === 'stopping'"
        class="flex items-start gap-2 px-3 py-2 text-xs text-highlighted"
        role="status"
      >
        <span
          class="mt-1 size-2 shrink-0 animate-pulse rounded-full bg-error motion-reduce:animate-none"
          aria-hidden="true"
        />
        {{ t('debugging.debugger.recording') }}
      </p>
      <template v-else>
        <p
          class="flex items-start gap-2 border-b border-(--app-terminal-border) bg-info/10 px-3 py-1.5 text-xs text-highlighted"
          data-testid="debugger-recorded"
        >
          <UIcon
            name="i-lucide-film"
            class="mt-px size-3.5 shrink-0 text-info"
          />
          <span>{{ t('debugging.debugger.recorded') }}</span>
        </p>
        <p
          v-if="recording?.ended === 'steps' || recording?.ended === 'slow'"
          class="border-b border-(--app-terminal-border) bg-warning/10 px-3 py-1.5 text-xs text-highlighted"
          data-testid="debugger-ended"
        >
          {{ t(`debugging.debugger.ended.${recording.ended}`, { n: stepCount }) }}
        </p>
        <p
          v-if="recordingOutdated"
          class="border-b border-(--app-terminal-border) bg-warning/10 px-3 py-1.5 text-xs text-highlighted"
          data-testid="debugger-outdated"
        >
          {{ t('debugging.debugger.outdated') }}
        </p>
        <p
          v-for="file in skipped"
          :key="file.path"
          class="border-b border-(--app-terminal-border) bg-warning/10 px-3 py-1.5 text-xs text-highlighted"
        >
          {{ t(`debugging.debugger.skipped.${file.reason}`, { path: file.path }) }}
        </p>
        <p
          v-if="!stepCount"
          class="px-3 py-2 text-xs text-muted"
        >
          {{ t('debugging.debugger.empty') }}
        </p>
      </template>

      <template v-if="recorded">
        <!-- moving through the recording -->
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-(--app-terminal-border) px-3 py-1.5">
          <div
            ref="toolbar"
            role="toolbar"
            :aria-label="t('debugging.debugger.controls')"
            class="flex items-center gap-0.5"
          >
            <UButton
              v-for="button in STEP_BUTTONS"
              :key="button.id"
              size="xs"
              color="neutral"
              :icon="button.icon"
              :aria-label="button.label"
              :title="button.label"
              :data-testid="`debugger-${button.id}`"
              @click="button.run"
            />
          </div>
          <label class="flex min-w-48 flex-1 items-center gap-2 font-mono text-xs text-muted tabular-nums">
            <span
              class="shrink-0"
              data-testid="debugger-position"
            >{{ t('debugging.debugger.position', { n: position + 1, total: stepCount }) }}</span>
            <input
              type="range"
              min="1"
              :max="stepCount"
              :value="position + 1"
              :aria-label="t('debugging.debugger.scrubber')"
              :aria-valuetext="spoken"
              class="min-w-0 flex-1 cursor-pointer accent-(--ui-primary)"
              data-testid="debugger-scrubber"
              @input="onScrub"
            >
          </label>
        </div>

        <!-- where it is: the line about to run -->
        <div
          v-if="location"
          class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-(--app-terminal-border) px-3 py-1.5"
        >
          <span
            class="font-mono text-info"
            data-testid="debugger-location"
          >{{ where(location) }}</span>
          <code class="min-w-0 flex-1 truncate font-mono text-xs text-toned">{{ lineText(location) }}</code>
          <UButton
            size="xs"
            color="neutral"
            :icon="hasBreakpointHere ? 'i-lucide-circle-minus' : 'i-lucide-circle-plus'"
            :label="hasBreakpointHere ? t('debugging.debugger.removeHere') : t('debugging.debugger.addHere')"
            data-testid="debugger-toggle-here"
            @click="toggleBreakpoint(location)"
          />
          <UButton
            v-if="find"
            size="xs"
            color="primary"
            icon="i-lucide-mouse-pointer-click"
            :label="t('debugging.debugger.answer', { where: where(location) })"
            data-testid="debugger-answer"
            @click="answerStep"
          />
        </div>
        <p
          class="sr-only"
          role="status"
          aria-live="polite"
        >
          {{ spoken }}
        </p>
        <p
          v-if="moveNote"
          class="border-b border-(--app-terminal-border) px-3 py-1 text-xs text-muted"
          data-testid="debugger-note"
        >
          {{ t(`debugging.debugger.note.${moveNote}`) }}
        </p>
      </template>

      <div class="@xl:grid @xl:grid-cols-[3fr_2fr]">
        <!-- the values at that moment -->
        <section
          v-if="recorded"
          :aria-label="t('debugging.debugger.scope')"
          class="min-w-0 border-b border-(--app-terminal-border) px-2 py-1.5 font-mono text-xs @xl:border-e @xl:border-b-0"
          data-testid="debugger-scope"
        >
          <h3 class="px-1 pb-1 font-sans text-xs font-medium text-muted">
            {{ t('debugging.debugger.scope') }}
          </h3>
          <p
            v-if="!scopes.length"
            class="px-1 font-sans text-dimmed"
          >
            {{ t('debugging.debugger.noScope') }}
          </p>
          <details
            v-for="scope in scopes"
            :key="`${scope.kind}:${scope.name}`"
            :open="scope.kind !== 'module'"
            class="mb-1"
            :data-scope="scope.kind"
          >
            <summary class="cursor-pointer rounded-sm px-1 font-sans text-muted hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary">
              {{ t(`debugging.debugger.scopeKind.${scope.kind}`, { name: scope.name ?? '' }) }}
            </summary>
            <DebuggingValue
              v-for="[name, value] in scope.entries"
              :key="name"
              :name="name"
              :value="value"
            />
          </details>
        </section>

        <div class="min-w-0">
          <!-- who called whom -->
          <section
            v-if="recorded"
            :aria-label="t('debugging.debugger.callStack')"
            class="border-b border-(--app-terminal-border) px-2 py-1.5 text-xs"
          >
            <h3 class="px-1 pb-1 font-medium text-muted">
              {{ t('debugging.debugger.callStack') }}
            </h3>
            <ol data-testid="debugger-stack">
              <li
                v-for="(frame, at) in callStack"
                :key="frame.index"
              >
                <p
                  v-if="frame.async && !callStack[at - 1]?.async"
                  class="px-1 pt-1 font-mono text-dimmed"
                >
                  {{ t('debugging.debugger.async') }}
                </p>
                <button
                  type="button"
                  class="flex w-full min-w-0 cursor-pointer items-baseline justify-between gap-2 rounded-sm px-1 py-0.5 text-start hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
                  :class="frame.index === selectedFrame ? 'bg-accented text-highlighted' : 'text-toned'"
                  :aria-current="frame.index === selectedFrame ? 'true' : undefined"
                  :aria-label="find ? t('debugging.console.answer', { path: frame.path, line: frame.line }) : t('debugging.debugger.frame', { name: frame.name, path: frame.path, line: frame.line })"
                  :data-frame="where(frame)"
                  @click="onFrame(frame)"
                >
                  <span class="min-w-0 truncate font-mono">{{ frame.name }}</span>
                  <span class="shrink-0 font-mono text-info">{{ where(frame) }}</span>
                </button>
              </li>
            </ol>
          </section>

          <!-- the breakpoints, with their conditions -->
          <section
            :aria-label="t('debugging.debugger.breakpoints')"
            class="px-2 py-1.5 text-xs"
          >
            <h3 class="px-1 pb-1 font-medium text-muted">
              {{ t('debugging.debugger.breakpoints') }}
            </h3>
            <p
              v-if="!breakpoints.length"
              class="px-1 text-dimmed"
            >
              {{ t('debugging.debugger.noBreakpoints') }}
            </p>
            <ul
              v-else
              class="space-y-1.5"
              data-testid="debugger-breakpoints"
            >
              <li
                v-for="(breakpoint, index) in breakpoints"
                :key="where(breakpoint)"
                class="rounded-md border border-(--app-terminal-border) px-2 py-1"
                :data-breakpoint="where(breakpoint)"
              >
                <div class="flex items-center gap-2">
                  <span
                    class="size-2.5 shrink-0 rounded-full"
                    :class="breakpoint.condition ? 'bg-warning' : 'bg-info'"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    class="shrink-0 rounded-sm font-mono text-info underline underline-offset-2 hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
                    :aria-label="t('debugging.console.open', { path: breakpoint.path, line: breakpoint.line })"
                    @click="revealLine(breakpoint)"
                  >
                    {{ where(breakpoint) }}
                  </button>
                  <code class="min-w-0 flex-1 truncate font-mono text-muted">{{ lineText(breakpoint) }}</code>
                  <span
                    v-if="recordStatus === 'recorded'"
                    class="shrink-0 text-dimmed tabular-nums"
                    data-testid="breakpoint-hits"
                  >{{ t('debugging.debugger.hits', hits[index] ?? 0) }}</span>
                  <UButton
                    size="xs"
                    color="neutral"
                    icon="i-lucide-x"
                    :aria-label="t('debugging.debugger.remove', { where: where(breakpoint) })"
                    :title="t('debugging.debugger.remove', { where: where(breakpoint) })"
                    @click="removeBreakpoint(index)"
                  />
                </div>
                <input
                  type="text"
                  :value="breakpoint.condition"
                  :aria-label="t('debugging.debugger.condition', { where: where(breakpoint) })"
                  :placeholder="t('debugging.debugger.conditionPlaceholder')"
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck="false"
                  class="mt-1 w-full rounded-sm border border-(--app-terminal-border) bg-transparent px-1.5 py-0.5 font-mono text-xs text-highlighted placeholder:text-dimmed focus-visible:outline-2 focus-visible:outline-primary"
                  data-testid="breakpoint-condition"
                  @change="onCondition(index, $event)"
                  @keydown.enter="onCondition(index, $event)"
                >
                <p
                  v-if="conditionError(breakpoint)"
                  class="mt-0.5 text-error"
                  data-testid="breakpoint-condition-error"
                >
                  {{ conditionError(breakpoint) }}
                </p>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </section>
</template>
