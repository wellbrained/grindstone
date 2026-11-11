<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { site } = useAppConfig()

const navigation: NavigationMenuItem[] = [
  { label: 'Home', to: '/', exact: true }
]
</script>

<template>
  <div>
    <UHeader :title="site.name">
      <template #title>
        <AppLogo class="w-auto h-6 shrink-0" />
      </template>

      <UNavigationMenu :items="navigation" />

      <template #right>
        <UColorModeButton />
      </template>

      <template #body>
        <UNavigationMenu
          :items="navigation"
          orientation="vertical"
          class="-mx-2.5"
        />
      </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          © {{ new Date().getFullYear() }} {{ site.name }}
        </p>
      </template>
    </UFooter>
  </div>
</template>
