<script setup lang="ts">
const { site } = useAppConfig()
const { t } = useI18n()

const navigation = computed(() => [
  { label: t('layout.nav.levels'), to: '/', exact: true },
  { label: t('layout.nav.cheat'), to: '/git/cheat-sheet' },
  { label: t('layout.nav.about'), to: '/about' }
])
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
        <AppLogo class="shrink-0" />
      </template>

      <UNavigationMenu
        :items="navigation"
        :aria-label="t('layout.nav.label')"
        class="hidden sm:flex"
      />

      <template #right>
        <UColorModeButton :aria-label="t('layout.colorMode')" />
      </template>
    </UHeader>

    <!-- min-h-0 overrides UMain's full-screen min height, so the footer sits at the bottom of the screen on short pages (sticky footer) -->
    <UMain class="min-h-0 flex-1">
      <slot />
    </UMain>

    <UFooter
      class="border-t border-default"
      :ui="{ container: 'max-w-[110rem]' }"
    >
      <template #left>
        <p class="text-sm text-muted">
          {{ t('layout.footer', { name: site.name }) }}
        </p>
      </template>

      <template #right>
        <nav
          class="flex gap-4 text-sm"
          :aria-label="t('layout.nav.label')"
        >
          <NuxtLink
            v-for="item in navigation"
            :key="item.to"
            :to="item.to"
            class="text-muted hover:text-highlighted"
          >{{ item.label }}</NuxtLink>
        </nav>
      </template>
    </UFooter>
  </div>
</template>
