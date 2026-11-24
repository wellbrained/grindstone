<script setup lang="ts">
import { trackById, trackProgress, tracks } from '#shared/levels'
import { navigationItems } from '~/utils/navigation'
import { trackLook } from '~/utils/track-look'

const { site } = useAppConfig()
const { appVersion } = useRuntimeConfig().public
const { t } = useI18n()
const route = useRoute()

// One list for the header trail, the mobile menu and the footer: Tracks (home), one entry per live track (from the registry, its Levels and Cheat sheet), About.
// A track's entry is active on its page, its levels and its cheat sheet.
const navigation = computed(() => navigationItems(route.path, tracks, {
  home: t('layout.nav.tracks'),
  about: t('layout.nav.about'),
  levels: t('layout.nav.levels'),
  cheat: t('layout.nav.cheat')
}))
// The header (DESIGN.md, "Navigation (rail, strip, header)"): the Tracks menu, then inside a track its name and its two pages as a trail
// ("Tracks / Git · Levels · Cheat sheet"), the page you are on marked with aria-current="page"; About at the nav's right end.
const currentPath = computed(() => route.path.replace(/\/$/, '') || '/')
const currentTrack = computed(() => navigation.value.find(item => item.children && item.active) ?? null)
const currentTrackId = computed(() => currentTrack.value?.to.slice(1) ?? null)
const { progress } = useProgress()
// the mobile menu's counts per track ("12/85", and the same in words for a screen reader)
const countOf = (to: string) => {
  const track = trackById(to.slice(1))
  const { solved, total } = track ? trackProgress(track, progress.value) : { solved: 0, total: 0 }
  return { short: `${solved}/${total}`, spoken: t('track.solvedCount', { solved, total }) }
}

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

    <!-- the nav sits in the header from md (one menu and a short trail); below md the menu button opens it -->
    <UHeader
      v-model:open="menuOpen"
      :title="site.name"
      to="/"
      :menu="{ title: t('layout.nav.dialog') }"
      :toggle="{ variant: 'outline', class: 'justify-center max-sm:size-11 pointer-coarse:size-11' }"
      :ui="{ container: 'max-w-[110rem]', title: 'pointer-coarse:min-h-11 pointer-coarse:items-center', left: 'lg:flex-none', right: 'lg:flex-none', center: 'hidden md:flex md:flex-1 lg:ml-6', toggle: 'md:hidden', content: 'md:hidden', overlay: 'md:hidden' }"
    >
      <template #title>
        <AppLogo class="shrink-0" />
      </template>

      <nav
        :aria-label="t('layout.nav.label')"
        class="flex w-full min-w-0 items-center gap-1"
        data-testid="header-nav"
      >
        <TracksMenu :current-track-id="currentTrackId" />
        <template v-if="currentTrack">
          <span
            aria-hidden="true"
            class="px-1 text-dimmed"
          >/</span>
          <span class="inline-flex min-w-0 items-center gap-2 px-1.5 font-medium text-highlighted">
            <UIcon
              :name="trackLook(currentTrackId!).icon"
              class="size-4 shrink-0"
              :class="trackLook(currentTrackId!).class"
            />
            <span class="truncate">{{ currentTrack.label }}</span>
          </span>
          <NuxtLink
            v-for="child in currentTrack.children"
            :key="child.to"
            :to="child.to"
            :aria-current="child.current ? 'page' : undefined"
            class="inline-flex min-h-9 shrink-0 items-center rounded-md px-2.5 text-sm hover:bg-elevated hover:text-highlighted pointer-coarse:min-h-11"
            :class="child.current ? 'bg-elevated font-medium text-highlighted' : 'text-muted'"
          >{{ child.label }}</NuxtLink>
        </template>
        <NuxtLink
          to="/about"
          :aria-current="currentPath === '/about' ? 'page' : undefined"
          class="ml-auto inline-flex min-h-9 shrink-0 items-center rounded-md px-2.5 font-medium hover:bg-elevated hover:text-highlighted pointer-coarse:min-h-11"
          :class="currentPath === '/about' ? 'bg-elevated text-highlighted' : 'text-toned'"
        >{{ t('layout.nav.about') }}</NuxtLink>
      </nav>

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
          <ul class="space-y-1">
            <li
              v-for="item in navigation"
              :key="item.to"
            >
              <div
                v-if="item.children"
                role="group"
                :aria-labelledby="`mobile-nav-${item.to.slice(1)}`"
                class="rounded-lg p-2"
                :class="{ 'bg-elevated': item.active }"
              >
                <div class="flex items-center gap-3">
                  <TrackIcon
                    :track-id="item.to.slice(1)"
                    size="sm"
                  />
                  <span
                    :id="`mobile-nav-${item.to.slice(1)}`"
                    class="min-w-0 flex-1 font-medium wrap-break-word text-highlighted"
                  >{{ item.label }}</span>
                  <span class="font-mono text-xs text-muted tabular-nums">
                    <span aria-hidden="true">{{ countOf(item.to).short }}</span>
                    <span class="sr-only">{{ countOf(item.to).spoken }}</span>
                  </span>
                </div>
                <div class="mt-1 flex gap-1 pl-9">
                  <NuxtLink
                    v-for="child in item.children"
                    :key="child.to"
                    :to="child.to"
                    :aria-current="child.current ? 'page' : undefined"
                    class="inline-flex min-h-11 items-center rounded-md px-3 text-sm hover:bg-accented hover:text-highlighted"
                    :class="child.current ? 'bg-accented font-medium text-highlighted' : 'text-muted'"
                    @click="menuOpen = false"
                  >{{ child.label }}</NuxtLink>
                </div>
              </div>
              <NuxtLink
                v-else
                :to="item.to"
                :aria-current="item.to === currentPath ? 'page' : undefined"
                class="flex min-h-11 items-center rounded-lg px-2 font-medium hover:bg-elevated hover:text-highlighted"
                :class="item.to === currentPath ? 'bg-elevated text-highlighted' : 'text-toned'"
                @click="menuOpen = false"
              >{{ item.to === '/' ? t('layout.nav.allTracks') : item.label }}</NuxtLink>
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
