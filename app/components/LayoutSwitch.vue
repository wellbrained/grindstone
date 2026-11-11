<script setup lang="ts">
import { PLAY_LAYOUTS } from '~/utils/play-layout'
import type { PlayLayout } from '~/utils/play-layout'

// The segmented control above the play page: Terminal / IDE. A radio group: Tab reaches it, arrows move the choice.
const model = defineModel<PlayLayout>({ required: true })

const { t } = useI18n()

const icons: Record<PlayLayout, string> = {
  terminal: 'i-lucide-terminal',
  ide: 'i-lucide-panels-top-left'
}

const buttons = useTemplateRef<HTMLButtonElement[]>('buttons')

function onKeydown(event: KeyboardEvent) {
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
  if (!step) return
  event.preventDefault()
  const index = (PLAY_LAYOUTS.indexOf(model.value) + step + PLAY_LAYOUTS.length) % PLAY_LAYOUTS.length
  const next = PLAY_LAYOUTS[index]!
  model.value = next
  nextTick(() => buttons.value?.find(button => button.dataset.layout === next)?.focus())
}
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="t('play.layout.label')"
    class="inline-flex items-center gap-0.5 rounded-md border border-default bg-elevated p-0.5"
    @keydown="onKeydown"
  >
    <button
      v-for="layout in PLAY_LAYOUTS"
      ref="buttons"
      :key="layout"
      type="button"
      role="radio"
      :aria-checked="model === layout"
      :tabindex="model === layout ? 0 : -1"
      :title="t(`play.layout.${layout}Help`)"
      :data-layout="layout"
      class="flex items-center gap-1.5 rounded px-2 py-1 font-mono text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
      :class="model === layout ? 'bg-primary/15 text-highlighted ring-1 ring-primary/60' : 'text-muted hover:bg-accented hover:text-highlighted'"
      @click="model = layout"
    >
      <UIcon
        :name="icons[layout]"
        class="size-3.5 shrink-0"
      />
      {{ t(`play.layout.${layout}`) }}
    </button>
  </div>
</template>
