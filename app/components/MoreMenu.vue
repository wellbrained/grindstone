<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

// A ⋯ button that opens a menu (entry, chapter, track actions). `label` names what it is for ("More for 1.2 ...").
// The button is 28px on a desktop and 36px on a phone or a touch screen (a row's menu is positioned absolutely, so the row keeps its height).
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
      class="text-muted hover:text-highlighted max-sm:size-9 pointer-coarse:size-9"
      :aria-label="label"
      data-testid="more-menu"
    />
  </UDropdownMenu>
</template>
