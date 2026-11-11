<script setup lang="ts">
import { createCodeEditor } from '~/editor/codemirror'
import type { CodeEditorHandle } from '~/editor/codemirror'

// A CodeMirror editor for one file at a time (use it as <LazyCodeEditor>, so CodeMirror loads only when an editor shows).
// Switching `path` keeps each file's own undo history and cursor while the component lives.
const props = defineProps<{
  path: string
  autofocus?: boolean
}>()

const model = defineModel<string>({ required: true })

const emit = defineEmits<{
  save: []
  ready: []
}>()

const { t } = useI18n()

const host = useTemplateRef<HTMLElement>('host')
let editor: CodeEditorHandle | null = null

onMounted(() => {
  editor = createCodeEditor({
    parent: host.value!,
    path: props.path,
    doc: model.value,
    labels: {
      acceptCurrent: t('editor.acceptCurrent'),
      acceptIncoming: t('editor.acceptIncoming'),
      acceptBoth: t('editor.acceptBoth'),
      actionLabel: (choice, block) => t(`editor.action.${choice}`, { block }),
      currentChange: t('editor.currentChange'),
      incomingChange: t('editor.incomingChange'),
      editorLabel: path => t('editor.label', { path })
    },
    onChange: (doc) => {
      model.value = doc
    },
    onSave: () => emit('save')
  })
  if (props.autofocus) editor.focus()
  emit('ready')
})

// one watcher for both, so a tab switch hands over path and text together
watch([() => props.path, model], ([path, doc]) => editor?.show(path, doc))

onBeforeUnmount(() => editor?.destroy())

defineExpose({
  focus: () => editor?.focus(),
  forget: (path: string) => editor?.forget(path)
})
</script>

<template>
  <div
    ref="host"
    class="h-full min-h-0 overflow-hidden"
  />
</template>
