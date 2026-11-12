<script setup lang="ts">
const { site } = useAppConfig()

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  // logo files: docs/adr/0005-logo.md (raster files from scripts/brand/generate-icons.mjs)
  link: [
    { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
    { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }
  ],
  titleTemplate: title => title && title !== site.name ? `${title} · ${site.name}` : site.name
})

useSeoMeta({
  description: site.description,
  ogTitle: site.name,
  ogDescription: site.description,
  ogImage: `${site.url}/og-image.png`,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: 'The Grindstone logo: a skill radar and the word grindstone',
  twitterCard: 'summary_large_image',
  twitterImage: `${site.url}/og-image.png`
})
</script>

<template>
  <!-- html keeps a stable scrollbar gutter (main.css), so modals must not add the scrollbar width as body padding: the page would jump -->
  <UApp :scroll-body="false">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <ConfirmDialog />
  </UApp>
</template>
