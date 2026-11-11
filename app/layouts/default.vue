<script setup lang="ts">
import type { Component } from 'vue'
import type { NavigationMenuItem } from '@nuxt/ui'

const { site } = useAppConfig()

const navigation: NavigationMenuItem[] = [
  { label: 'Home', to: '/', exact: true },
  { label: 'Examples', to: '/examples' }
]

// Optional header actions contributed by layers. A layer registers a *global* component
// (layers/<name>/app/components/global/) and it shows up here; remove the layer and it's gone.
const optionalHeaderActions = ['LanguageSwitcher']

const nuxtApp = useNuxtApp()
const headerActions = optionalHeaderActions
  .map(name => nuxtApp.vueApp.component(name))
  .filter((component): component is Component => !!component)
</script>

<template>
  <div>
    <UHeader :title="site.name">
      <template #title>
        <AppLogo class="w-auto h-6 shrink-0" />
      </template>

      <UNavigationMenu :items="navigation" />

      <template #right>
        <component
          :is="action"
          v-for="(action, index) in headerActions"
          :key="index"
        />
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
