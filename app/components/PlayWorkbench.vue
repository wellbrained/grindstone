<script setup lang="ts">
import type { LevelPlay } from '~/composables/useLevelPlay'
import { fileStatuses } from '~/utils/file-tree'

// The IDE and Mix layouts of the play page (docs/adr/0004-editor-layouts.md, docs/features/ui.md).
// IDE: explorer | editor over a bottom terminal | level side panel. Mix: editor | terminal as equals | collapsible side panel.
// Below md both become one panel at a time behind tabs (Files / Editor / Terminal / Level). Every panel is rendered once
// and only hidden on phones, so the terminal and the editor keep their state when the tab changes.
const props = defineProps<{
  play: LevelPlay
  variant: 'ide' | 'mix'
  number: number
  total: number
}>()

const { t } = useI18n()

const { session, log, prompt, completion, fileTree, workdir, tabs, sparkKey, run, saveTab, listCandidates, clearTerminal } = props.play

type MobileTab = 'files' | 'editor' | 'terminal' | 'level'
const mobileTab = ref<MobileTab>('terminal')
const mobileTabs = computed(() => [
  { value: 'files', label: t('play.tabs.files') },
  { value: 'editor', label: t('play.tabs.editor') },
  { value: 'terminal', label: t('play.tabs.terminal') },
  { value: 'level', label: t('play.tabs.level') }
])
const hiddenOnPhone = (tab: MobileTab) => mobileTab.value !== tab && 'max-md:hidden'

const statuses = computed(() => fileStatuses(session.value.state))
const files = computed(() => Object.keys(workdir.value).sort())

const sideCollapsed = ref(false)

const terminal = useTemplateRef<{ focus: () => void }>('terminal')
const editorArea = useTemplateRef<{ focus: () => void }>('editorArea')

/** A file was opened (explorer, `edit <file>`, the conflicted-files list): show the editor and put the cursor there. */
function showEditor() {
  mobileTab.value = 'editor'
  // phones: do not pop up the keyboard unasked
  if (!window.matchMedia('(pointer: coarse)').matches) nextTick(() => editorArea.value?.focus())
}

function openFile(path: string) {
  tabs.open(path)
  showEditor()
}

defineExpose({
  showEditor,
  focusTerminal: () => terminal.value?.focus()
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <UTabs
      v-model="mobileTab"
      :items="mobileTabs"
      :content="false"
      size="sm"
      color="neutral"
      variant="link"
      class="md:hidden"
      :ui="{ list: 'w-full', trigger: 'flex-1 min-w-0', label: 'truncate' }"
    />

    <div
      class="grid gap-3"
      :class="variant === 'ide'
        ? 'md:grid-cols-[12rem_minmax(0,1fr)] md:grid-rows-[30rem_18rem_auto] lg:h-[calc(100dvh-var(--ui-header-height)-9.5rem)] lg:min-h-[34rem] lg:grid-cols-[13rem_minmax(0,1fr)_18rem] lg:grid-rows-[minmax(0,1fr)_minmax(10rem,38%)] xl:grid-cols-[15rem_minmax(0,1fr)_22rem] 2xl:grid-cols-[16rem_minmax(0,1fr)_26rem]'
        : ['md:grid-cols-2 md:grid-rows-[32rem_auto] lg:h-[calc(100dvh-var(--ui-header-height)-9.5rem)] lg:min-h-[34rem] lg:grid-rows-1',
           sideCollapsed ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_22rem]']"
    >
      <FileExplorer
        :class="[hiddenOnPhone('files'), variant === 'ide' ? 'md:row-span-2' : 'md:hidden']"
        class="max-md:h-[calc(100dvh-14rem)] max-md:min-h-80"
        :tree="fileTree"
        :active-path="tabs.activePath.value"
        :is-repo="session.state.repo !== null"
        @open="openFile"
      />

      <EditorArea
        ref="editorArea"
        :class="hiddenOnPhone('editor')"
        class="max-md:h-[calc(100dvh-14rem)] max-md:min-h-80"
        :tabs="tabs"
        :files="files"
        :statuses="statuses"
        :has-explorer="variant === 'ide'"
        @save="saveTab"
      />

      <div
        class="relative min-w-0 max-md:h-[calc(100dvh-14rem)] max-md:min-h-80"
        :class="hiddenOnPhone('terminal')"
      >
        <TerminalPane
          ref="terminal"
          :entries="log"
          :prompt="prompt"
          :completion="completion"
          :class="variant === 'ide' && 'md:min-h-0'"
          @submit="run"
          @clear="clearTerminal"
          @candidates="listCandidates"
        />
        <SparkBurst :trigger="sparkKey" />
      </div>

      <PlaySidePanel
        v-model:collapsed="sideCollapsed"
        :class="[hiddenOnPhone('level'), variant === 'ide' ? 'md:col-span-2 lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:row-start-1' : 'md:col-span-2 lg:col-span-1']"
        :play="play"
        :number="number"
        :total="total"
        :collapsible="variant === 'mix'"
      />
    </div>
  </div>
</template>
