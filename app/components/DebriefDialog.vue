<script setup lang="ts">
import type { Level } from '#shared/levels'

// Shown when a level is solved: why the solution works, how you did, and where to go next.
const props = defineProps<{
  level: Level
  next: Level | null
  stats: { commands: number, solution: number, hints: number }
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ closed: [] }>()

const { t } = useI18n()

// the dialog would hand the focus back to the button that opened it; the page decides instead (back to the terminal)
function onCloseAutoFocus(event: Event) {
  event.preventDefault()
  emit('closed')
}

const verdict = computed(() => {
  if (props.stats.commands <= props.stats.solution) return t('debrief.verdictBest')
  return t('debrief.verdictMore', props.stats.commands - props.stats.solution)
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="level.debrief.title"
    :description="t('debrief.solved', { title: level.title })"
    :ui="{ content: 'sm:max-w-xl' }"
    :content="{ onCloseAutoFocus }"
  >
    <template #body>
      <div class="space-y-3 text-default">
        <p
          v-for="(paragraph, index) in level.debrief.paragraphs"
          :key="index"
        >
          <InlineText :text="paragraph" />
        </p>
      </div>

      <dl class="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-default bg-muted p-3 text-sm">
        <div>
          <dt class="text-muted">
            {{ t('debrief.commands') }}
          </dt>
          <dd class="font-mono text-lg font-semibold text-highlighted">
            {{ stats.commands }}
            <span class="text-sm font-normal text-muted">/ {{ stats.solution }}</span>
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            {{ t('debrief.hints') }}
          </dt>
          <dd class="font-mono text-lg font-semibold text-highlighted">
            {{ stats.hints }}
          </dd>
        </div>
        <p class="col-span-2 text-muted">
          {{ verdict }}
        </p>
      </dl>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-end gap-2">
        <UButton
          color="neutral"
          :label="t('debrief.stay')"
          @click="open = false"
        />
        <UButton
          v-if="next"
          color="primary"
          variant="solid"
          trailing-icon="i-lucide-arrow-right"
          :to="levelPath(next)"
          :label="t('debrief.next')"
        />
        <UButton
          v-else
          color="primary"
          variant="solid"
          to="/"
          :label="t('debrief.all')"
        />
      </div>
    </template>
  </UModal>
</template>
