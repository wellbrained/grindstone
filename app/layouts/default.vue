<script setup lang="ts">
import { tracks } from '#shared/levels'
import { navigationItems } from '~/utils/navigation'

const { site } = useAppConfig()
const { t } = useI18n()
const route = useRoute()

// One list for the header, the mobile menu and the footer: Tracks, one entry per live track (from the registry, a Levels / Cheat sheet menu), About.
// A track's entry is active on its page, its levels and its cheat sheet.
const navigation = computed(() => navigationItems(route.path, tracks, {
  home: t('layout.nav.tracks'),
  about: t('layout.nav.about'),
  levels: t('layout.nav.levels'),
  cheat: t('layout.nav.cheat')
}))
// A track entry is a menu trigger (a button), so the header and the mobile menu get it without a link of its own; its Levels
// child is the track page. The footer keeps the plain links.
const menuItems = computed(() => navigation.value.map(item => item.children ? { ...item, to: undefined } : item))
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <!-- the nav sits in the header from md; below md the menu button opens it -->
    <UHeader
      :title="site.name"
      to="/"
      :ui="{ container: 'max-w-[110rem]', center: 'hidden md:flex', toggle: 'md:hidden', content: 'md:hidden', overlay: 'md:hidden' }"
    >
      <template #title>
        <AppLogo class="shrink-0" />
      </template>

      <UNavigationMenu
        :items="menuItems"
        :ui="{ childList: 'grid w-44 grid-cols-1 gap-0' }"
        :aria-label="t('layout.nav.label')"
      />

      <template #right>
        <UColorModeButton :aria-label="t('layout.colorMode')" />
      </template>

      <template #body>
        <UNavigationMenu
          :items="menuItems"
          orientation="vertical"
          :aria-label="t('layout.nav.label')"
          class="-mx-2.5"
        />
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
        <nav :aria-label="t('layout.nav.footer')">
          <ul class="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
            <li
              v-for="item in navigation"
              :key="item.to"
            >
              <NuxtLink
                :to="item.to"
                class="rounded-sm text-muted hover:text-highlighted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                :class="{ 'text-highlighted': item.active }"
              >{{ item.label }}</NuxtLink>
            </li>
          </ul>
        </nav>
      </template>
    </UFooter>
  </div>
</template>
