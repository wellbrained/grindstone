<script setup lang="ts">
import { fileName as fileNameOf } from '#shared/git'
import type { EditorWait } from '#shared/git'
import { editorHelpKey, isCoarsePointer } from '~/utils/play-layout'

// The file git opened in the editor during `git rebase -i` (docs/features/ui.md, "The file git waits for"): the todo list
// or a commit message. A bar with the file name, Cancel (git rebase --abort) and the primary action (Start rebase /
// Save message, also Ctrl/Cmd+S); CodeMirror below. Escape does nothing here, so nothing is cancelled by accident.
// Used in the IDE's editor pane and, in the Terminal layout, inside GitEditorDialog.
const props = defineProps<{ wait: EditorWait }>()

const model = defineModel<string>({ required: true })

const emit = defineEmits<{
  submit: []
  cancel: []
}>()

const { t } = useI18n()

const fileName = computed(() => fileNameOf(props.wait.path))
const todo = computed(() => props.wait.kind === 'todo')

const code = useTemplateRef<{ focus: () => void }>('code')
// phones: do not pop up the keyboard unasked
const autofocus = import.meta.client && !isCoarsePointer()

defineExpose({ focus: () => code.value?.focus() })
</script>

<template>
  <section
    :aria-label="t('gitEditor.label', { file: fileName })"
    class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-(--app-terminal-border) bg-(--app-terminal)"
    data-git-editor
    :data-kind="wait.kind"
  >
    <header class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-(--app-terminal-border) bg-elevated px-3 py-1.5">
      <div class="min-w-0 flex-1 basis-48">
        <p
          class="truncate font-mono text-xs text-highlighted"
          :title="wait.path"
        >
          {{ fileName }}
        </p>
        <p class="text-xs text-muted">
          {{ t(editorHelpKey(wait)) }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <UButton
          size="xs"
          color="neutral"
          variant="outline"
          :label="t('gitEditor.cancel')"
          :aria-label="t('gitEditor.cancelLabel')"
          data-testid="git-editor-cancel"
          @click="emit('cancel')"
        />
        <UButton
          size="xs"
          color="primary"
          variant="solid"
          :icon="todo ? 'i-lucide-play' : 'i-lucide-check'"
          :label="todo ? t('gitEditor.start') : t('gitEditor.saveMessage')"
          :title="t('gitEditor.keys')"
          data-testid="git-editor-submit"
          @click="emit('submit')"
        />
      </div>
    </header>
    <div class="min-h-0 flex-1 focus-within:ring-2 focus-within:ring-primary focus-within:ring-inset">
      <LazyCodeEditor
        ref="code"
        v-model="model"
        :path="wait.path"
        :autofocus="autofocus"
        @save="emit('submit')"
      />
    </div>
  </section>
</template>
