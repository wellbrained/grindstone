<script setup lang="ts">
const { site } = useAppConfig()
const { t } = useI18n()
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <UHeader
      :title="site.name"
      to="/"
      :toggle="false"
      :ui="{ container: 'max-w-[110rem]' }"
    >
      <template #title>
        <AppLogo class="h-6 w-auto shrink-0" />
      </template>

      <template #right>
        <UColorModeButton :aria-label="t('layout.colorMode')" />
      </template>
    </UHeader>

    <UMain class="flex-1">
      <slot />
    </UMain>

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          {{ t('layout.footer', { name: site.name }) }}
        </p>
      </template>
    </UFooter>
  </div>
</template>
