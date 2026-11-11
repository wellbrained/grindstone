<script setup lang="ts">
import { levels } from '#shared/levels'

definePageMeta({ key: route => route.fullPath })

const route = useRoute()
const { t } = useI18n()

const level = levelFromRoute('git', String(route.params.level))
if (!level) throw createError({ statusCode: 404, statusMessage: 'Level not found', fatal: true })
useHead({ title: level.title })

// Terminal (default) / IDE / Mix, remembered per viewer (docs/adr/0004-editor-layouts.md)
const { layout, setLayout } = usePlayLayout()
const layoutModel = computed({ get: () => layout.value, set: setLayout })

const workbench = useTemplateRef<{ showEditor: () => void, focusTerminal: () => void }>('workbench')

// `edit <file>` and the conflicted-files list: the editor panel in the Terminal layout, a tab in IDE and Mix
function openFile(path: string) {
  if (layout.value === 'terminal') {
    play.openEditor(path)
    return
  }
  play.tabs.open(path)
  workbench.value?.showEditor()
}

const play = useLevelPlay(level, { onEdit: openFile })
const {
  session, log, prompt, completion, conflictedFiles, hasOrigin, showOrigin, next, goals, stats, graph,
  editor, debriefOpen, sparkKey, run, save, listCandidates, clearTerminal, reset, hint
} = play

const number = levels.findIndex(candidate => candidate.id === level.id) + 1
const terminal = useTemplateRef<{ focus: () => void }>('terminal')

// back to typing once a dialog has fully closed (earlier, the dialog would hand the focus back to the button that opened it)
const focusTerminal = () => layout.value === 'terminal' ? terminal.value?.focus() : workbench.value?.focusTerminal()
</script>

<template>
  <div class="mx-auto w-full max-w-[110rem] px-4 py-4 sm:px-6 lg:px-8">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p
        v-if="layout === 'terminal'"
        class="flex items-center gap-2 text-xs text-muted md:hidden"
      >
        <UIcon
          name="i-lucide-keyboard"
          class="size-4 shrink-0"
        />
        {{ t('play.keyboard') }}
      </p>
      <LayoutSwitch
        v-model="layoutModel"
        class="ms-auto"
      />
    </div>

    <div
      v-if="layout === 'terminal'"
      class="grid gap-4 lg:h-[calc(100dvh-var(--ui-header-height)-9.5rem)] lg:min-h-[32rem] lg:grid-rows-1 lg:grid-cols-[16rem_minmax(0,1fr)_20rem] xl:grid-cols-[18rem_minmax(0,1fr)_24rem] 2xl:grid-cols-[20rem_minmax(0,1fr)_30rem]"
    >
      <LevelPanel
        class="order-1 min-w-0 lg:overflow-y-auto lg:pr-1"
        :level="level"
        :number="number"
        :total="levels.length"
        :goals="goals"
        :hints-used="session.hintsUsed"
        :solved="session.solved"
        :conflicted-files="conflictedFiles"
        :next="next"
        @hint="hint"
        @reset="reset"
        @edit="openFile"
        @debrief="debriefOpen = true"
      />

      <div class="relative order-2 h-[28rem] min-w-0 md:order-3 lg:order-2 lg:h-full">
        <TerminalPane
          ref="terminal"
          :entries="log"
          :prompt="prompt"
          :completion="completion"
          @submit="run"
          @clear="clearTerminal"
          @candidates="listCandidates"
        />
        <SparkBurst :trigger="sparkKey" />
      </div>

      <div class="order-3 h-80 min-w-0 md:order-2 lg:order-3 lg:h-full">
        <CommitGraph
          v-model:show-origin="showOrigin"
          :layout="graph"
          :has-origin="hasOrigin"
        />
      </div>
    </div>

    <PlayWorkbench
      v-else
      ref="workbench"
      :key="layout"
      :play="play"
      :variant="layout"
      :number="number"
      :total="levels.length"
    />

    <FileEditor
      :editor="editor"
      @save="save"
      @cancel="editor = null"
      @closed="focusTerminal"
    />
    <DebriefDialog
      v-model:open="debriefOpen"
      :level="level"
      :next="next"
      :stats="stats"
      @closed="focusTerminal"
    />
  </div>
</template>
