<script setup lang="ts">
// The editor panel (opened by `edit <file>` or from the conflicted-files list): a plain monospace textarea, Save and Cancel.
// Conflict markers are ordinary lines in the text; there is no merge UI.
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
      <UTextarea
        v-model="draft"
        :rows="14"
        autofocus
        spellcheck="false"
        autocomplete="off"
        :aria-label="t('editor.label', { path: editor?.path ?? '' })"
        class="w-full"
        :ui="{ base: 'font-mono text-sm whitespace-pre' }"
        @keydown="onKeydown"
      />
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
