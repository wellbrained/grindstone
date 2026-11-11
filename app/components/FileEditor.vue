<script setup lang="ts">
// The editor panel of the Terminal layout (opened by `edit <file>` or from the conflicted-files list): CodeMirror in a modal,
// Save (Ctrl/Cmd+S or Ctrl+Enter) and Cancel. Conflict blocks get the same accept actions as the editor tabs.
const props = defineProps<{ editor: { path: string, content: string } | null }>()

const emit = defineEmits<{
  save: [content: string]
  cancel: []
  closed: []
}>()

const { t } = useI18n()

const draft = ref('')
watch(() => props.editor, (editor) => {
  if (editor) draft.value = editor.content
}, { immediate: true })

const hasMarkers = computed(() => /^(?:<{7}|={7}|>{7})/m.test(draft.value))

function onOpenChange(open: boolean) {
  if (!open) emit('cancel')
}

// the dialog would hand the focus back to the button that opened it; the page decides instead (back to the terminal)
function onCloseAutoFocus(event: Event) {
  event.preventDefault()
  emit('closed')
}

// Ctrl+Enter saved in the old textarea panel; keep it (captured before CodeMirror inserts a line)
function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    emit('save', draft.value)
  }
}
</script>

<template>
  <UModal
    :open="editor !== null"
    :title="editor?.path ?? ''"
    :description="t('editor.description')"
    :ui="{ content: 'sm:max-w-3xl' }"
    :content="{ onCloseAutoFocus }"
    @update:open="onOpenChange"
  >
    <template #body>
      <UAlert
        v-if="hasMarkers"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="t('editor.markers')"
        :description="t('editor.markersHelp')"
        class="mb-3"
      />
      <div
        class="h-[min(26rem,60dvh)] overflow-hidden rounded-md border border-(--app-terminal-border) focus-within:ring-2 focus-within:ring-primary"
        @keydown.capture="onKeydown"
      >
        <LazyCodeEditor
          v-if="editor"
          v-model="draft"
          :path="editor.path"
          autofocus
          @save="emit('save', draft)"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton
          color="neutral"
          :label="t('editor.cancel')"
          @click="emit('cancel')"
        />
        <UButton
          color="primary"
          variant="solid"
          icon="i-lucide-save"
          :label="t('editor.save')"
          @click="emit('save', draft)"
        />
      </div>
    </template>
  </UModal>
</template>
