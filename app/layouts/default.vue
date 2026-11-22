<script setup lang="ts">
import { tracks } from '#shared/levels'
import { navigationItems } from '~/utils/navigation'

const { site } = useAppConfig()
const { appVersion } = useRuntimeConfig().public
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
// A track entry is a menu trigger (a button), so the header gets it without a link of its own; its Levels child is the
// track page. The entry you are in says so (aria-current, not colour alone): the trigger of your track is "true", the
// page you are on "page". The current child carries a filled background in the dropdown as well.
const CHILD_ICONS = ['i-lucide-list', 'i-lucide-scroll-text']
const currentPath = computed(() => route.path.replace(/\/$/, '') || '/')
const ariaCurrent = (value: 'true' | 'page' | false) => value ? { 'aria-current': value } : {}
const menuItems = computed(() => navigation.value.map(item => item.children
  ? {
      // the header's row is narrow: a track may name itself shorter there (the menu and the footer use the full name)
      label: item.short ?? item.label,
      active: item.active,
      ...ariaCurrent(item.active && 'true'),
      children: item.children.map((child, index) => ({
        label: child.label,
        to: child.to,
        icon: CHILD_ICONS[index],
        active: child.current,
        ...ariaCurrent(child.current && 'page'),
        class: child.current ? 'before:bg-accented font-medium' : undefined
      }))
    }
  : { label: item.label, to: item.to, active: item.active, ...ariaCurrent(item.active && 'page') }))

// the mobile menu: one compact row per track, closed on any tap of a link (the page you are on included)
const menuOpen = ref(false)

// the skip link moves the focus to the page's content (a hash link would change the route and restart a play page)
function skipToContent() {
  document.getElementById('main')?.focus()
}
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <!-- the skip link: hidden above the window until it has the focus, then a chip over the header's top-left corner -->
    <a
      href="#main"
      class="fixed top-2 left-2 z-100 -translate-y-[200%] rounded-lg border border-accented bg-elevated px-3.5 py-2 text-sm font-medium text-highlighted focus:translate-y-0 pointer-coarse:py-3"
      data-testid="skip-link"
      @click.prevent="skipToContent"
    >{{ t('layout.skip') }}</a>

    <!-- the nav sits in the header from lg (five tracks need the room); below lg the menu button opens it -->
    <UHeader
      v-model:open="menuOpen"
      :title="site.name"
      to="/"
      :menu="{ title: t('layout.nav.dialog') }"
      :toggle="{ variant: 'outline', class: 'justify-center max-sm:size-11 pointer-coarse:size-11' }"
      :ui="{ container: 'max-w-[110rem]', title: 'pointer-coarse:min-h-11 pointer-coarse:items-center', center: 'hidden lg:flex', toggle: 'lg:hidden', content: 'lg:hidden', overlay: 'lg:hidden' }"
    >
      <template #title>
        <AppLogo class="shrink-0" />
      </template>

      <!-- a track's menu opens under its own entry, as wide as its two links (contentOrientation vertical anchors the
           dropdown to the trigger; the default horizontal one spans the whole nav) -->
      <UNavigationMenu
        :items="menuItems"
        content-orientation="vertical"
        :ui="{ content: 'w-auto min-w-44 p-1', childList: 'gap-0.5', childLink: 'hover:before:bg-accented' }"
        :aria-label="t('layout.nav.label')"
      />

      <template #right>
        <UColorModeButton
          :aria-label="t('layout.colorMode')"
          class="justify-center max-sm:size-11 pointer-coarse:size-11"
        />
      </template>

      <template #body>
        <nav
          :aria-label="t('layout.nav.label')"
          data-testid="mobile-nav"
        >
          <ul class="divide-y divide-default">
            <li
              v-for="item in navigation"
              :key="item.to"
            >
              <div
                v-if="item.children"
                role="group"
                :aria-labelledby="`mobile-nav${item.to.replace(/\//g, '-')}`"
                class="flex items-center gap-1 py-1"
              >
                <span
                  :id="`mobile-nav${item.to.replace(/\//g, '-')}`"
                  class="min-w-0 flex-1 font-medium wrap-break-word"
                  :class="item.active ? 'text-highlighted' : 'text-toned'"
                >{{ item.label }}</span>
                <NuxtLink
                  v-for="child in item.children"
                  :key="child.to"
                  :to="child.to"
                  :aria-current="child.current ? 'page' : undefined"
                  class="inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-sm hover:bg-elevated hover:text-highlighted"
                  :class="child.current ? 'bg-elevated font-medium text-primary' : 'text-muted'"
                  @click="menuOpen = false"
                >{{ child.label }}</NuxtLink>
              </div>
              <NuxtLink
                v-else
                :to="item.to"
                :aria-current="item.active ? 'page' : undefined"
                class="-mx-3 flex min-h-11 items-center rounded-md px-3 font-medium hover:bg-elevated hover:text-highlighted"
                :class="item.active ? 'bg-elevated text-primary' : 'text-toned'"
                @click="menuOpen = false"
              >{{ item.label }}</NuxtLink>
            </li>
          </ul>
        </nav>
      </template>
    </UHeader>

    <!-- min-h-0 overrides UMain's full-screen min height, so the footer sits at the bottom of the screen on short pages (sticky footer);
         the skip link focuses it (tabindex -1, no outline of its own: the next Tab goes to the first control in it) -->
    <UMain
      id="main"
      tabindex="-1"
      class="min-h-0 flex-1"
    >
      <slot />
    </UMain>

    <UFooter
      class="border-t border-default"
      :ui="{ container: 'max-w-[110rem]' }"
    >
      <template #left>
        <p class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted">
          <span>{{ t('layout.footer', { name: site.name }) }}</span>
          <span
            class="font-mono text-xs text-dimmed"
            data-testid="app-version"
          >{{ t('layout.version', { version: appVersion }) }}</span>
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
                :aria-current="item.to === currentPath ? 'page' : undefined"
                class="inline-flex min-h-11 items-center rounded-sm text-muted hover:text-highlighted sm:min-h-6"
                :class="{ 'text-highlighted': item.active }"
              >{{ item.label }}</NuxtLink>
            </li>
          </ul>
        </nav>
      </template>
    </UFooter>
  </div>
</template>
