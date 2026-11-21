<script setup lang="ts" generic="T extends string">
import { TAB_COLUMNS, tabAfterKey } from '~/utils/tabs'

// The phone tab set of a play page (docs/features/ui.md, "Play page layouts"): below lg the centre and right columns
// show one panel at a time (Debugging: App, Console, Code …; Working with AI: Diff, Review, Run). Every panel stays
// mounted, so a switch never reloads the app or drops what you typed; this only picks the one on screen. Tab `name`
// controls `<idPrefix>-<name>` and is `<idPrefix>-tab-<name>`. The `tab` slot draws a tab's content (default: `labels`).
const model = defineModel<T>({ required: true })

const props = defineProps<{
  names: readonly T[]
  /** The tab set's name for screen readers. */
  label: string
  idPrefix: string
  labels?: Partial<Record<T, string>>
}>()

defineSlots<{ tab?: (props: { tab: T, selected: boolean }) => unknown }>()

const list = useTemplateRef<HTMLElement>('list')

function onKeydown(event: KeyboardEvent) {
  const next = tabAfterKey(props.names, model.value, event.key)
  if (!next) return
  event.preventDefault()
  model.value = next
  nextTick(() => list.value?.querySelector<HTMLElement>(`[data-panel="${next}"]`)?.focus())
}
</script>

<template>
  <div
    ref="list"
    role="tablist"
    :aria-label="label"
    class="mb-3 grid gap-1 rounded-lg border border-default bg-elevated p-1 lg:hidden"
    :class="TAB_COLUMNS[names.length]"
    @keydown="onKeydown"
  >
    <button
      v-for="name in names"
      :id="`${idPrefix}-tab-${name}`"
      :key="name"
      type="button"
      role="tab"
      :aria-selected="model === name"
      :aria-controls="`${idPrefix}-${name}`"
      :tabindex="model === name ? 0 : -1"
      :data-panel="name"
      class="relative min-w-0 cursor-pointer rounded-md px-1 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-primary sm:px-3"
      :class="model === name ? 'bg-accented font-medium text-highlighted' : 'text-muted hover:text-highlighted'"
      @click="model = name"
    >
      <slot
        name="tab"
        :tab="name"
        :selected="model === name"
      >
        {{ labels?.[name] ?? name }}
      </slot>
    </button>
  </div>
</template>
