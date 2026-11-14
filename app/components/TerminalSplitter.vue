<script setup lang="ts">
import { clampHeight, stepTerminalHeight } from '~/utils/terminal-size'

// The drag handle between the IDE's editor and terminal: a horizontal window splitter (role="separator", focusable).
// Drag with the mouse, a finger or a pen, or use the arrow keys (Up: taller terminal, Down: shorter, Shift: bigger steps,
// Home and End: smallest and largest); a double click puts the default sizes back. It only reports heights: `change`
// while moving, `commit` when a drag or a key press is done, `reset` for the default.
const props = defineProps<{
  /** The terminal's height now, in px. */
  value: number
  min: number
  max: number
}>()

const emit = defineEmits<{ change: [value: number], commit: [], reset: [] }>()

const { t } = useI18n()

const dragging = ref(false)
let startY = 0
let startValue = 0

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture(event.pointerId)
  handle.focus({ preventScroll: true })
  dragging.value = true
  startY = event.clientY
  startValue = props.value
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  // dragging up makes the terminal taller
  emit('change', clampHeight(startValue - (event.clientY - startY), props.min, props.max))
}

function onPointerEnd() {
  if (!dragging.value) return
  dragging.value = false
  emit('commit')
}

function onKeydown(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) return
  const next = stepTerminalHeight(event.key, event.shiftKey, props.value, props.min, props.max)
  if (next === null) return
  event.preventDefault()
  if (next !== props.value) {
    emit('change', next)
    emit('commit')
  }
}
</script>

<template>
  <div
    role="separator"
    aria-orientation="horizontal"
    tabindex="0"
    :aria-label="t('play.terminalSize.label')"
    :aria-valuenow="value"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuetext="t('play.terminalSize.value', { px: value })"
    :title="t('play.terminalSize.help')"
    :data-dragging="dragging || undefined"
    data-testid="terminal-splitter"
    class="group relative h-4 cursor-row-resize touch-none rounded-md select-none focus-visible:outline-2 focus-visible:outline-primary"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @keydown="onKeydown"
    @dblclick="emit('reset')"
  >
    <span
      aria-hidden="true"
      class="absolute inset-x-0 top-1/2 mx-auto h-1 w-16 -translate-y-1/2 rounded-full bg-accented transition-colors group-hover:bg-primary group-focus-visible:bg-primary group-data-dragging:bg-primary motion-reduce:transition-none"
    />
  </div>
</template>
