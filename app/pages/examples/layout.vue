<script setup lang="ts">
// Use a different layout for this page (app/layouts/blank.vue instead of default.vue).
definePageMeta({
  layout: 'blank',
  example: {
    title: 'Layouts',
    description: 'Switch a page to a different layout (no header/footer) with definePageMeta.',
    icon: 'i-lucide-layout-template',
    order: 6
  }
})

useSeoMeta({ title: 'Layouts' })
</script>

<template>
  <UCard class="m-4 max-w-md">
    <template #header>
      <h1 class="text-lg font-semibold">
        Blank layout
      </h1>
    </template>

    <p class="text-sm">
      This page uses <code>app/layouts/blank.vue</code> — no header, no footer. It is selected with
      <code>definePageMeta({ layout: 'blank' })</code>. Pages without it use <code>default.vue</code>.
    </p>
    <p class="mt-2 text-sm text-muted">
      Files: app/pages/examples/layout.vue, app/layouts/blank.vue, app/layouts/default.vue
    </p>

    <template #footer>
      <UButton
        to="/examples"
        icon="i-lucide-arrow-left"
        label="Back to examples"
        color="neutral"
        variant="subtle"
      />
    </template>
  </UCard>
</template>
