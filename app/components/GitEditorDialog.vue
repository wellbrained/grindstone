<script setup lang="ts">
import { fileName } from '#shared/git'
import type { EditorWait } from '#shared/git'
import { editorHelpKey } from '~/utils/play-layout'

// The Terminal layout's view of the file git waits for (`git rebase -i`), like the editor panel `edit <file>` opens:
// GitEditor in a modal. It closes only through its buttons (or once git stops waiting): no close button, and
// Escape or a click outside do not cancel the rebase silently.
defineProps<{ wait: EditorWait | null }>()

const model = defineModel<string>({ required: true })

const emit = defineEmits<{
  submit: []
  cancel: []
  closed: []
}>()

const { t } = useI18n()

// the dialog would hand the focus back to the element that had it; the page decides instead (back to the terminal)
function onCloseAutoFocus(event: Event) {
  event.preventDefault()
  emit('closed')
}
</script>

<template>
  <UModal
    :open="wait !== null"
    :title="wait ? t('gitEditor.dialogTitle', { file: fileName(wait.path) }) : ''"
    :description="t(editorHelpKey(wait))"
    :close="false"
    :dismissible="false"
    :ui="{ content: 'sm:max-w-3xl', header: 'sr-only', body: 'p-0 sm:p-0' }"
    :content="{ onCloseAutoFocus }"
  >
    <template #body>
      <GitEditor
        v-if="wait"
        v-model="model"
        class="h-[min(28rem,70dvh)] rounded-none border-0"
        :wait="wait"
        @submit="emit('submit')"
        @cancel="emit('cancel')"
      />
    </template>
  </UModal>
</template>
