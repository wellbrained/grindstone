<script setup lang="ts">
definePageMeta({
  example: {
    title: 'Fonts',
    description: 'Default font is Public Sans. Inter is self-hosted and applied only where you add the font-inter class.',
    icon: 'i-lucide-type',
    order: 9
  }
})
</script>

<template>
  <ExamplePage
    docs="https://fonts.nuxt.com"
    :files="['app/pages/examples/fonts.vue', 'app/assets/css/main.css', 'nuxt.config.ts']"
  >
    <div class="grid gap-4 sm:grid-cols-2">
      <UCard>
        <p class="text-sm text-muted">
          Public Sans (default)
        </p>
        <p class="mt-2 text-2xl font-semibold">
          The quick brown fox jumps over the lazy dog
        </p>
      </UCard>

      <!-- `font-inter` comes from the `--font-inter` token in main.css -->
      <UCard class="font-inter">
        <p class="text-sm text-muted">
          Inter (font-inter)
        </p>
        <p class="mt-2 text-2xl font-semibold">
          The quick brown fox jumps over the lazy dog
        </p>
      </UCard>
    </div>

    <UCard class="mt-6">
      <template #header>
        <h2 class="font-semibold">
          Adding another font
        </h2>
      </template>

      <ol class="list-decimal space-y-1 ps-5 text-sm">
        <li>Register it in <code>nuxt.config.ts</code> → <code>fonts.families</code> (it is downloaded and self-hosted).</li>
        <li>Add a token in <code>main.css</code> → <code>@theme</code>, e.g. <code>--font-display: 'Font Name', sans-serif;</code></li>
        <li>Use the generated class, e.g. <code>font-display</code>. To change the whole site, set <code>--font-sans</code> instead.</li>
      </ol>
    </UCard>
  </ExamplePage>
</template>
