<script setup lang="ts">
import type { CommandPaletteItem } from '@nuxt/ui'
import { STATUS_LETTER } from '~/utils/file-tree'
import type { FileStatus } from '~/utils/file-tree'

// "Open file": a quick picker over the working tree (the Mix layout has no explorer). Type to filter, Enter opens.
const props = defineProps<{
  files: string[]
  statuses: Record<string, FileStatus>
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  pick: [path: string]
}>()

const { t } = useI18n()

const groups = computed(() => [{
  id: 'files',
  items: props.files.map((path): CommandPaletteItem => {
    const status = props.statuses[path]
    return {
      label: path,
      icon: status === 'conflicted' ? 'i-lucide-file-warning' : 'i-lucide-file',
      suffix: status ? `${STATUS_LETTER[status]} · ${t(`explorer.status.${status}`)}` : undefined,
      onSelect: () => {
        open.value = false
        emit('pick', path)
      }
    }
  })
}])
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('editor.openFile')"
    :description="t('editor.openFileHelp')"
    :ui="{ content: 'sm:max-w-lg', header: 'sr-only' }"
  >
    <template #content>
      <UCommandPalette
        :groups="groups"
        :placeholder="t('editor.openFilePlaceholder')"
        :ui="{ input: '[&_input]:font-mono', itemLabel: 'font-mono text-sm' }"
        class="h-80"
        close
        @update:open="open = $event"
      >
        <template #empty>
          <p class="px-4 py-6 text-center text-sm text-muted">
            {{ files.length ? t('editor.noMatch') : t('explorer.empty') }}
          </p>
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>
