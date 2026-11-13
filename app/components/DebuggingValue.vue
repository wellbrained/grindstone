<script setup lang="ts">
import { isExpandable, valueChildren, valuePreview, valueTone } from '#shared/levels'
import type { RecordedValue } from '#shared/levels'

// One variable or property in the Debugger's Scope (docs/features/ui.md, "Debugger"): its name and a one-line preview of
// the value it held at that step, like the browser's; an object opens into its entries (a <details>, so the keyboard and
// screen readers know it). Everything is text from the recording; nothing of it ever becomes markup or a style.
defineProps<{
  name: string
  value: RecordedValue
}>()

const { t } = useI18n()

/** Children render only once opened (a big recording has many objects nobody opens). */
const open = ref(false)

const TONE: Record<ReturnType<typeof valueTone>, string> = {
  string: 'text-success',
  number: 'text-warning',
  empty: 'text-dimmed',
  function: 'text-info',
  other: 'text-highlighted'
}
</script>

<template>
  <details
    v-if="isExpandable(value)"
    class="group"
    @toggle="open = ($event.target as HTMLDetailsElement).open"
  >
    <summary class="flex cursor-pointer list-none items-baseline gap-1 rounded-sm px-1 hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
      <UIcon
        name="i-lucide-chevron-right"
        class="size-3 shrink-0 self-center text-dimmed transition-transform group-open:rotate-90 motion-reduce:transition-none"
      />
      <span class="shrink-0 text-toned">{{ name }}:</span>
      <span
        class="min-w-0 truncate"
        :class="TONE[valueTone(value)]"
      >{{ valuePreview(value) }}</span>
    </summary>
    <div
      v-if="open"
      class="ms-2 border-s border-(--app-terminal-border) ps-2"
    >
      <DebuggingValue
        v-for="[key, inner] in valueChildren(value).entries"
        :key="key"
        :name="key"
        :value="inner"
      />
      <p
        v-if="valueChildren(value).more > 0"
        class="px-1 text-dimmed"
      >
        {{ t('debugging.debugger.more', valueChildren(value).more) }}
      </p>
    </div>
  </details>
  <div
    v-else
    class="flex items-baseline gap-1 px-1 ps-5"
  >
    <span class="shrink-0 text-toned">{{ name }}:</span>
    <span
      class="min-w-0 break-words"
      :class="TONE[valueTone(value)]"
    >{{ valuePreview(value) }}</span>
  </div>
</template>
