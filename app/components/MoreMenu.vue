<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

// A ⋯ button that opens a menu (entry, chapter, track actions). `label` names what it is for ("More for 1.2 ...").
defineProps<{
  items: DropdownMenuItem[][]
  label: string
}>()
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'end' }"
    :ui="{ content: 'min-w-56' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      size="sm"
      icon="i-lucide-ellipsis"
      class="text-muted hover:text-highlighted"
      :aria-label="label"
      data-testid="more-menu"
    />
  </UDropdownMenu>
</template>
