<script setup lang="ts">
// Lists every route that declares `definePageMeta({ example: { … } })` —
// example pages contributed by layers (layers/*) show up here automatically.
useSeoMeta({ title: 'Examples' })

const router = useRouter()

const examples = router.getRoutes()
  .filter(route => route.meta.example)
  .map(route => ({ ...route.meta.example!, to: route.path }))
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.title.localeCompare(b.title))
</script>

<template>
  <UContainer class="py-10">
    <UPageHeader
      title="Examples"
      description="One small, commented example per library and feature in this template. Open a page, then read its source files (listed at the top of each page)."
      class="border-none"
    />

    <UPageGrid>
      <UPageCard
        v-for="example in examples"
        :key="example.to"
        :title="example.title"
        :description="example.description"
        :icon="example.icon"
        :to="example.to"
        variant="subtle"
      />
    </UPageGrid>
  </UContainer>
</template>
