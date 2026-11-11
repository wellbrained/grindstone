<script setup lang="ts">
import type { OutputLine } from '#shared/git'

// One line of terminal output: monospace text, branch names coloured from the branch palette (the refs the engine marks).
const props = defineProps<{ line: OutputLine }>()

interface Segment {
  text: string
  ref?: string
}

const segments = computed<Segment[]>(() => {
  const { text, refs } = props.line
  if (!refs?.length) return [{ text }]
  const result: Segment[] = []
  let at = 0
  for (const span of [...refs].sort((a, b) => a.start - b.start)) {
    if (span.start < at) continue
    if (span.start > at) result.push({ text: text.slice(at, span.start) })
    result.push({ text: text.slice(span.start, span.end), ref: span.ref })
    at = span.end
  }
  if (at < text.length) result.push({ text: text.slice(at) })
  return result
})

const lineClass = computed(() => {
  const { kind, tone } = props.line
  if (kind === 'err') return 'text-error'
  if (kind === 'hint') return 'text-dimmed italic'
  if (tone === 'added') return 'text-success'
  if (tone === 'removed') return 'text-error'
  if (tone === 'meta') return 'text-info'
  return 'text-default'
})

const refClass = (ref: string) => ref === 'HEAD' ? 'text-highlighted' : branchClass(ref)
</script>

<template>
  <div
    class="min-h-lh break-words whitespace-pre-wrap"
    :class="lineClass"
  >
    <span
      v-for="(segment, index) in segments"
      :key="index"
      :class="segment.ref ? [refClass(segment.ref), 'font-semibold'] : undefined"
    >{{ segment.text }}</span>
  </div>
</template>
