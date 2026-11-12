<script setup lang="ts">
import type { LevelPlace } from '#shared/levels'
import type { LevelPlay } from '~/composables/useLevelPlay'
import { fileStatuses } from '~/utils/file-tree'
import type { PlayLayout } from '~/utils/play-layout'

// The play area of both layouts (docs/adr/0004-editor-layouts.md, docs/features/ui.md). One skeleton for Terminal and IDE:
// level panel left, terminal centre, commit graph right. IDE only opens two panels in place: Files below the level panel and
// the editor above the terminal. Nothing is rebuilt on a switch, so the terminal, the editor tabs and the scroll positions stay.
// Closed panels are `inert` (no focus, hidden from screen readers) and take no space; the opening motion is the `.reveal` CSS in main.css.
const props = defineProps<{
  play: LevelPlay
  layout: PlayLayout
  place: LevelPlace
}>()

const {
  level, session, log, prompt, completion, fileTree, workdir, tabs, goals, conflictedFiles, next, graph, hasOrigin, showOrigin,
  debriefOpen, sparkKey, run, saveTab, listCandidates, clearTerminal, hint, reset, again, edit
} = props.play

const ide = computed(() => props.layout === 'ide')

const statuses = computed(() => fileStatuses(session.value.state))
const files = computed(() => Object.keys(workdir.value).sort())

const terminal = useTemplateRef<{ focus: () => void }>('terminal')
const editorArea = useTemplateRef<{ focus: () => void, $el: HTMLElement }>('editorArea')

/** A file was opened in the IDE (explorer, `edit <file>`, the conflicted-files list): bring the editor into view and focus it. */
function showEditor() {
  nextTick(() => {
    // stacked layouts (below lg): the editor may be out of view
    if (!window.matchMedia('(min-width: 64rem)').matches) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      editorArea.value?.$el?.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' })
    }
    // phones: do not pop up the keyboard unasked
    if (!window.matchMedia('(pointer: coarse)').matches) editorArea.value?.focus()
  })
}

function openFile(path: string) {
  tabs.open(path)
  showEditor()
}

/** Again: the same entry from the start, and back to typing. */
function onAgain() {
  again()
  nextTick(() => terminal.value?.focus())
}

defineExpose({
  showEditor,
  focusTerminal: () => terminal.value?.focus()
})
</script>

<template>
  <div
    class="grid gap-4 lg:h-[calc(100dvh-var(--ui-header-height)-9.5rem)] lg:min-h-[32rem] lg:grid-cols-[16rem_minmax(0,1fr)_20rem] lg:grid-rows-1 xl:grid-cols-[18rem_minmax(0,1fr)_24rem] 2xl:grid-cols-[20rem_minmax(0,1fr)_30rem]"
    :data-layout="layout"
  >
    <!-- left: the level, Files below it in the IDE -->
    <div class="order-1 flex min-w-0 flex-col lg:min-h-0">
      <LevelPanel
        class="min-w-0 lg:min-h-0 lg:flex-[1_1_0] lg:overflow-y-auto lg:pr-1"
        :level="level"
        :place="place"
        :goals="goals"
        :hints-used="session.hintsUsed"
        :solved="session.solved"
        :conflicted-files="conflictedFiles"
        :next="next"
        @hint="hint"
        @reset="reset"
        @again="onAgain"
        @edit="edit"
        @debrief="debriefOpen = true"
      />
      <div
        class="reveal reveal-files"
        :data-open="ide || undefined"
        :inert="!ide || undefined"
      >
        <div>
          <FileExplorer
            class="mt-4 max-lg:h-56 md:max-lg:h-64"
            :tree="fileTree"
            :active-path="tabs.activePath.value"
            :is-repo="session.state.repo !== null"
            @open="openFile"
          />
        </div>
      </div>
    </div>

    <!-- centre: the editor above the terminal in the IDE -->
    <div class="order-2 flex min-w-0 flex-col md:order-3 lg:order-2 lg:min-h-0">
      <div
        class="reveal reveal-editor"
        :data-open="ide || undefined"
        :inert="!ide || undefined"
      >
        <div>
          <EditorArea
            ref="editorArea"
            class="mb-4 scroll-mt-4 max-lg:h-[26rem]"
            :tabs="tabs"
            :files="files"
            :statuses="statuses"
            @save="saveTab"
          />
        </div>
      </div>
      <div class="relative h-[28rem] min-w-0 lg:h-auto lg:min-h-40 lg:flex-[1_1_0]">
        <TerminalPane
          ref="terminal"
          class="lg:min-h-0"
          :entries="log"
          :prompt="prompt"
          :completion="completion"
          @submit="run"
          @clear="clearTerminal"
          @candidates="listCandidates"
        />
        <SparkBurst :trigger="sparkKey" />
      </div>
    </div>

    <!-- right: the commit graph, the same in both layouts -->
    <div class="order-3 h-80 min-w-0 md:order-2 lg:order-3 lg:h-full">
      <CommitGraph
        v-model:show-origin="showOrigin"
        :layout="graph"
        :has-origin="hasOrigin"
      />
    </div>
  </div>
</template>
