<script setup lang="ts">
import { createCodeEditor } from '~/editor/codemirror'
import type { BreakpointMark, CodeEditorHandle, LineTone } from '~/editor/codemirror'

// A CodeMirror editor for one file at a time (use it as <LazyCodeEditor>, so CodeMirror loads only when an editor shows).
// Switching `path` keeps each file's own undo history and cursor while the component lives.
// Debugging adds: `mark` (a line opened from a stack trace, a new object each time so the same line can be shown again),
// and for find tasks `readOnly` plus `pickable` (a click on a line, or Enter, emits `pick` with its number). Chapter 5
// adds `breakpoints` (the dots of this file; given at all, the gutter, the line numbers and Ctrl/Cmd+B emit `breakpoint`)
// and `stepLine` (the line the Debugger is at, scrolled into view).
const props = defineProps<{
  path: string
  autofocus?: boolean
  readOnly?: boolean
  pickable?: boolean
  mark?: { line: number, tone?: LineTone } | null
  breakpoints?: readonly BreakpointMark[] | null
  stepLine?: number | null
}>()

const model = defineModel<string>({ required: true })

const emit = defineEmits<{
  save: []
  ready: []
  pick: [line: number]
  breakpoint: [line: number]
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
      editorLabel: path => props.pickable ? t('editor.pickLabel', { path }) : props.breakpoints ? t('editor.breakpointLabel', { path }) : t('editor.label', { path })
    },
    onChange: (doc) => {
      model.value = doc
    },
    onSave: () => emit('save'),
    readOnly: props.readOnly,
    onPickLine: props.pickable ? line => emit('pick', line) : undefined,
    onToggleBreakpoint: props.breakpoints ? line => emit('breakpoint', line) : undefined
  })
  if (props.mark) editor.mark(props.mark.line, props.mark.tone)
  if (props.breakpoints) editor.breakpoints(props.breakpoints)
  if (props.stepLine) editor.step(props.stepLine)
  if (props.autofocus) editor.focus()
  emit('ready')
})

// one watcher for both, so a tab switch hands over path and text together
watch([() => props.path, model], ([path, doc]) => editor?.show(path, doc))
// after the watcher above (same flush, registered later), so a mark in a newly opened file lands in that file
watch([() => props.path, () => props.mark], () => editor?.mark(props.mark?.line ?? null, props.mark?.tone))
watch([() => props.path, () => props.breakpoints], () => {
  if (props.breakpoints) editor?.breakpoints(props.breakpoints)
})
watch([() => props.path, () => props.stepLine], () => editor?.step(props.stepLine ?? null))

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
