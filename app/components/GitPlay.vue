<script setup lang="ts">
import type { GitLevel, LevelPlace } from '#shared/levels'

// The git play page (the play page picks it for a git level): the layout switch, the workbench, the editor panel, the
// file git waits for and the debrief with the git run.
const props = defineProps<{
  level: GitLevel
  place: LevelPlace
}>()

const { t } = useI18n()

// Terminal (default) / IDE, remembered per viewer (docs/adr/0004-editor-layouts.md)
const { layout, setLayout } = usePlayLayout()
const layoutModel = computed({ get: () => layout.value, set: setLayout })

const workbench = useTemplateRef<{ showEditor: () => void, focusTerminal: () => void }>('workbench')

// `edit <file>` and the conflicted-files list: the editor panel in the Terminal layout, a tab in the IDE
function openFile(path: string) {
  if (layout.value === 'terminal') {
    play.openEditor(path)
    return
  }
  play.tabs.open(path)
  workbench.value?.showEditor()
}

const play = useGitPlay(props.level, { onEdit: openFile })
const { session, editor, debriefOpen, progressBefore, stats, next, save, gitEditor, gitDraft, submitGitEditor, cancelGitEditor } = play
const counters = computed(() => stripCounters({ track: 'git', commands: session.value.commandCount }))

// the file git waits for (git rebase -i): a dialog in the Terminal layout, the editor pane in the IDE (GitWorkbench)
const gitDialog = computed(() => layout.value === 'terminal' ? gitEditor.value : null)

// back to typing once a dialog has fully closed (earlier, the dialog would hand the focus back to the button that opened it)
const focusTerminal = () => workbench.value?.focusTerminal()
</script>

<template>
  <!-- the switch is the strip's last item in both layouts, so it never moves under the cursor -->
  <PlayStrip
    icon="i-lucide-keyboard"
    :note="t('play.keyboard')"
    :counters="counters"
  >
    <template #end>
      <LayoutSwitch
        v-model="layoutModel"
        class="shrink-0"
      />
    </template>
  </PlayStrip>

  <GitWorkbench
    ref="workbench"
    :play="play"
    :layout="layout"
    :place="place"
  />

  <FileEditor
    :editor="editor"
    @save="save"
    @cancel="editor = null"
    @closed="focusTerminal"
  />
  <GitEditorDialog
    v-model="gitDraft"
    :wait="gitDialog"
    @submit="submitGitEditor"
    @cancel="cancelGitEditor"
    @closed="focusTerminal"
  />
  <DebriefDialog
    v-if="level.kind === 'scenario'"
    v-model:open="debriefOpen"
    :level="level"
    :place="place"
    :progress-before="progressBefore"
    :next="next"
    :track-to="trackPath(place.track.id)"
    @closed="focusTerminal"
  >
    <template #results>
      <GitRunStats :stats="stats" />
    </template>
  </DebriefDialog>
</template>
