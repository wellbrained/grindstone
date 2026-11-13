<script setup lang="ts">
import type { LevelPlace } from '#shared/levels'
import type { GitPlaySession } from '~/composables/useGitPlay'
import { fileStatuses } from '~/utils/file-tree'
import type { PlayLayout } from '~/utils/play-layout'
import { isCoarsePointer, revealIfStacked } from '~/utils/play-layout'

// The git play area in both layouts (docs/adr/0004-editor-layouts.md, docs/features/ui.md), in the shared PlayFrame. One
// skeleton for Terminal and IDE: level panel left, terminal centre, commit graph right. IDE only opens two panels in place: Files below the level panel and
// the editor above the terminal. Nothing is rebuilt on a switch, so the terminal, the editor tabs and the scroll positions stay.
// Closed panels are `inert` (no focus, hidden from screen readers) and take no space; the opening motion is the `.reveal` CSS in main.css.
const props = defineProps<{
  play: GitPlaySession
  layout: PlayLayout
  place: LevelPlace
}>()

const {
  level, session, log, prompt, completion, fileTree, workdir, tabs, goals, conflictedFiles, next, graph, hasOrigin, showOrigin,
  debriefOpen, sparkKey, run, saveTab, listCandidates, clearTerminal, hint, reset, again, edit, gitEditor, gitDraft, submitGitEditor,
  cancelGitEditor
} = props.play

const ide = computed(() => props.layout === 'ide')

const statuses = computed(() => fileStatuses(session.value.state))
const files = computed(() => Object.keys(workdir.value).sort())

const terminal = useTemplateRef<{ focus: () => void }>('terminal')
const editorArea = useTemplateRef<{ focus: () => void, $el: HTMLElement }>('editorArea')

/** A file was opened in the IDE (explorer, `edit <file>`, the conflicted-files list): bring the editor into view and focus it. */
function showEditor() {
  nextTick(() => {
    revealIfStacked(editorArea.value?.$el)
    // phones: do not pop up the keyboard unasked
    if (!isCoarsePointer()) editorArea.value?.focus()
  })
}

function openFile(path: string) {
  tabs.open(path)
  showEditor()
}

// The file git waits for (git rebase -i): in the IDE it takes the editor pane's place (the tabs stay as they were) and is
// brought into view like an opened file; in the Terminal layout the page shows it in a dialog. Once git stops waiting,
// the focus goes back to the terminal input.
const gitPane = useTemplateRef<{ $el: HTMLElement }>('gitPane')
watch(() => gitEditor.value?.path ?? null, (path, previous) => {
  if (path && !previous && ide.value) nextTick(() => revealIfStacked(gitPane.value?.$el))
  if (!path && previous) nextTick(() => terminal.value?.focus())
})

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
  <PlayFrame :data-layout="layout">
    <!-- left: the level, Files below it in the IDE -->
    <template #panel>
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
    </template>

    <!-- centre: the editor above the terminal in the IDE -->
    <template #default>
      <div
        class="reveal reveal-editor"
        :data-open="ide || undefined"
        :inert="!ide || undefined"
      >
        <div>
          <GitEditor
            v-if="gitEditor && ide"
            ref="gitPane"
            v-model="gitDraft"
            class="mb-4 scroll-mt-4 max-lg:h-[26rem]"
            :wait="gitEditor"
            @submit="submitGitEditor"
            @cancel="cancelGitEditor"
          />
          <EditorArea
            v-show="!(gitEditor && ide)"
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
    </template>

    <!-- right: the commit graph, the same in both layouts -->
    <template #side>
      <CommitGraph
        v-model:show-origin="showOrigin"
        :layout="graph"
        :has-origin="hasOrigin"
      />
    </template>
  </PlayFrame>
</template>
