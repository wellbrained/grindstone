<script setup lang="ts">
// Shared wrapper for the example pages — delete together with them.
// Title/description come from the page's `definePageMeta({ example })` unless passed as props.
const props = defineProps<{
  title?: string
  description?: string
  docs?: string
  files?: string[]
}>()

const route = useRoute()

const title = computed(() => props.title ?? route.meta.example?.title ?? '')
const description = computed(() => props.description ?? route.meta.example?.description)

useSeoMeta({ title, description })
</script>

<template>
  <UContainer class="py-10">
    <UButton
      to="/examples"
      icon="i-lucide-arrow-left"
      label="All examples"
      color="neutral"
      variant="link"
      class="px-0"
    />

    <UPageHeader
      :title="title"
      :description="description"
      :links="docs ? [{ label: 'Docs', to: docs, target: '_blank', icon: 'i-lucide-book-open', color: 'neutral', variant: 'subtle' }] : []"
      class="border-none pt-4"
    />

    <div
      v-if="files?.length"
      class="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted"
    >
      <span>Files:</span>
      <UBadge
        v-for="file in files"
        :key="file"
        :label="file"
        color="neutral"
        variant="subtle"
        class="font-mono"
      />
    </div>

    <slot />
  </UContainer>
</template>
