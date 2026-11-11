<script setup lang="ts">
const { site } = useAppConfig()
const { t } = useI18n()
</script>

<template>
  <UPageHero
    :title="site.name"
    :description="site.description"
  >
    <p class="text-muted">
      {{ t('home.comingSoon') }}
    </p>
  </UPageHero>
</template>
