<script setup lang="ts">
import { levels } from '#shared/levels'

definePageMeta({ key: route => route.fullPath })

const route = useRoute()
const { t } = useI18n()

const level = levelFromRoute('git', String(route.params.level))
if (!level) throw createError({ statusCode: 404, statusMessage: 'Level not found', fatal: true })
useHead({ title: level.title })

const {
  session, log, prompt, completion, conflictedFiles, hasOrigin, showOrigin, next, goals, stats, graph,
  editor, debriefOpen, sparkKey, run, save, openEditor, listCandidates, clearTerminal, reset, hint
} = useLevelPlay(level)

const number = levels.findIndex(candidate => candidate.id === level.id) + 1
const terminal = useTemplateRef<{ focus: () => void }>('terminal')

// back to typing once a dialog has fully closed (earlier, the dialog would hand the focus back to the button that opened it)
const focusTerminal = () => terminal.value?.focus()
</script>

<template>
  <div class="mx-auto w-full max-w-[110rem] px-4 py-4 sm:px-6 lg:px-8">
    <p class="mb-3 flex items-center gap-2 text-xs text-muted md:hidden">
      <UIcon
        name="i-lucide-keyboard"
        class="size-4 shrink-0"
      />
      {{ t('play.keyboard') }}
    </p>

    <div
      class="grid gap-4 lg:h-[calc(100dvh-var(--ui-header-height)-7.5rem)] lg:min-h-[32rem] lg:grid-rows-1 lg:grid-cols-[16rem_minmax(0,1fr)_20rem] xl:grid-cols-[18rem_minmax(0,1fr)_24rem] 2xl:grid-cols-[20rem_minmax(0,1fr)_30rem]"
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
        @edit="openEditor"
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
