<script setup lang="ts">
import type { EditorTabs } from '~/composables/useEditorTabs'
import { isDirty } from '~/utils/editor-tabs'
import type { FileStatus } from '~/utils/file-tree'

// The editor of the IDE and Mix layouts: a strip of open files, a notice when a file changed under unsaved edits,
// and CodeMirror for the active tab. Saving goes through the engine (the page's saveTab) and counts as a command.
const props = defineProps<{
  tabs: EditorTabs
  files: string[]
  statuses: Record<string, FileStatus>
  /** Which empty-state text fits: the IDE has an explorer, Mix only the picker. */
  hasExplorer: boolean
}>()

const emit = defineEmits<{
  save: [path: string]
}>()

const { t } = useI18n()

const { tabs: list, active, activePath } = props.tabs
const pickerOpen = ref(false)
const discarding = ref<string | null>(null)

const code = useTemplateRef<{ focus: () => void, forget: (path: string) => void }>('code')
const wantFocus = ref(false)

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

function focus() {
  if (code.value) code.value.focus()
  else wantFocus.value = true
}

function select(path: string) {
  activePath.value = path
  nextTick(focus)
}

function requestClose(path: string) {
  const tab = list.value.find(candidate => candidate.path === path)
  if (tab && isDirty(tab) && tab.changed?.disk !== null) discarding.value = path
  else close(path)
}

function close(path: string) {
  discarding.value = null
  code.value?.forget(path)
  props.tabs.close(path)
}

function pick(path: string) {
  props.tabs.open(path)
  nextTick(focus)
}

function save() {
  if (active.value) emit('save', active.value.path)
}

defineExpose({ focus })
</script>

<template>
  <section
    :aria-label="t('editor.areaLabel')"
    class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-(--app-terminal-border) bg-(--app-terminal)"
  >
    <header class="flex min-h-9 items-stretch border-b border-(--app-terminal-border) bg-elevated">
      <ul
        :aria-label="t('editor.tabs')"
        class="flex min-w-0 flex-1 items-stretch overflow-x-auto"
      >
        <li
          v-for="tab in list"
          :key="tab.path"
          class="group flex max-w-56 shrink-0 items-center border-r border-(--app-terminal-border) font-mono text-xs"
          :class="tab.path === activePath ? 'bg-(--app-terminal) text-highlighted shadow-[inset_0_2px_0_var(--ui-primary)]' : 'text-muted hover:bg-accented'"
          :data-tab="tab.path"
        >
          <button
            type="button"
            class="flex min-w-0 items-center gap-1.5 py-1.5 ps-3 pe-1.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            :aria-current="tab.path === activePath ? 'true' : undefined"
            :title="tab.path"
            @click="select(tab.path)"
          >
            <UIcon
              v-if="tab.changed"
              name="i-lucide-triangle-alert"
              class="size-3.5 shrink-0 text-warning"
            />
            <span
              class="truncate"
              :class="tab.changed?.disk === null && 'line-through'"
            >{{ fileName(tab.path) }}</span>
            <span
              v-if="isDirty(tab)"
              aria-hidden="true"
              class="text-primary"
            >●</span>
            <span class="sr-only">
              <template v-if="isDirty(tab)">({{ t('editor.unsaved') }})</template>
              <template v-if="tab.changed"> ({{ tab.changed.disk === null ? t('editor.deletedOnDisk') : t('editor.changedOnDisk') }})</template>
            </span>
          </button>
          <button
            type="button"
            class="me-1 rounded p-0.5 text-dimmed hover:bg-accented hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
            :aria-label="t('editor.close', { path: tab.path })"
            @click="requestClose(tab.path)"
          >
            <UIcon
              name="i-lucide-x"
              class="block size-3.5"
            />
          </button>
        </li>
      </ul>
      <div class="flex shrink-0 items-center gap-1 px-1.5">
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-search"
          :label="t('editor.openFile')"
          :ui="{ label: 'max-sm:sr-only' }"
          data-testid="open-file"
          @click="pickerOpen = true"
        />
        <UButton
          size="xs"
          color="primary"
          icon="i-lucide-save"
          :label="t('editor.save')"
          :disabled="!active"
          :title="t('editor.saveKeys')"
          data-testid="save-file"
          @click="save"
        />
      </div>
    </header>

    <UAlert
      v-if="active?.changed"
      role="alert"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="active.changed.disk === null ? t('editor.deletedTitle', { path: active.path }) : t('editor.changedTitle', { path: active.path })"
      :description="active.changed.disk === null ? t('editor.deletedText') : t('editor.changedText')"
      :ui="{ root: 'rounded-none border-b border-(--app-terminal-border) py-2', title: 'font-mono text-xs', description: 'text-xs' }"
      :actions="active.changed.disk === null
        ? [
          { label: t('editor.closeTab'), color: 'neutral', size: 'xs', onClick: () => close(active!.path) },
          { label: t('editor.keepMine'), color: 'warning', size: 'xs', onClick: () => tabs.keep(active!.path) }
        ]
        : [
          { label: t('editor.reload'), color: 'neutral', size: 'xs', onClick: () => tabs.reload(active!.path) },
          { label: t('editor.keepMine'), color: 'warning', size: 'xs', onClick: () => tabs.keep(active!.path) }
        ]"
      orientation="horizontal"
    />

    <div class="min-h-0 flex-1 focus-within:ring-2 focus-within:ring-primary focus-within:ring-inset">
      <LazyCodeEditor
        v-if="active"
        ref="code"
        :model-value="active.draft"
        :path="active.path"
        :autofocus="wantFocus"
        @update:model-value="tabs.setDraft(active!.path, $event)"
        @save="save"
        @ready="wantFocus = false"
      />
      <div
        v-else
        class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted"
      >
        <UIcon
          name="i-lucide-file-code"
          class="size-8 text-dimmed"
        />
        <p class="max-w-xs">
          {{ hasExplorer ? t('editor.emptyIde') : t('editor.emptyMix') }}
        </p>
        <UButton
          size="sm"
          color="neutral"
          icon="i-lucide-search"
          :label="t('editor.openFile')"
          @click="pickerOpen = true"
        />
      </div>
    </div>

    <FilePicker
      v-model:open="pickerOpen"
      :files="files"
      :statuses="statuses"
      @pick="pick"
    />

    <UModal
      :open="discarding !== null"
      :title="t('editor.discardTitle')"
      :description="t('editor.discardText', { path: discarding ?? '' })"
      @update:open="!$event && (discarding = null)"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            :label="t('editor.cancel')"
            @click="discarding = null"
          />
          <UButton
            color="error"
            variant="solid"
            :label="t('editor.discard')"
            @click="discarding && close(discarding)"
          />
        </div>
      </template>
    </UModal>
  </section>
</template>
