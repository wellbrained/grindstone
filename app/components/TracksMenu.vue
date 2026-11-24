<script setup lang="ts">
import { trackProgress, tracks } from '#shared/levels'
import { liveTracks } from '~/utils/navigation'
import { trackLook } from '~/utils/track-look'

// The header's one menu (DESIGN.md, "Navigation (rail, strip, header)"): "Tracks" opens a panel with every live track, its tagline, your progress
// and its cheat sheet. A row's main link opens the track; the cheat sheet is its own link beside it. The track you are in
// is marked (aria-current, and a filled row). The panel closes on any link in it (the page you are on too) and on a page change.
const props = defineProps<{ currentTrackId: string | null }>()

const { t } = useI18n()
const { progress } = useProgress()
const route = useRoute()

const open = ref(false)
watch(() => route.fullPath, () => {
  open.value = false
})

const rows = computed(() => liveTracks(tracks).map(track => ({
  track,
  count: trackProgress(track, progress.value),
  current: track.id === props.currentTrackId
})))
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ align: 'start', sideOffset: 10 }"
    :ui="{ content: 'w-[min(40rem,calc(100vw-2rem))] p-1.5' }"
  >
    <button
      type="button"
      class="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-2.5 font-medium transition-colors hover:bg-elevated hover:text-highlighted pointer-coarse:min-h-11 data-[state=open]:bg-elevated data-[state=open]:text-highlighted"
      :class="currentTrackId ? 'text-toned' : 'text-highlighted'"
      data-testid="tracks-menu"
    >
      {{ t('layout.nav.tracks') }}
      <UIcon
        name="i-lucide-chevron-down"
        class="size-4 transition-transform duration-200 motion-reduce:transition-none"
        :class="{ 'rotate-180': open }"
      />
    </button>

    <template #content>
      <ul
        class="space-y-0.5"
        data-testid="tracks-panel"
      >
        <li
          v-for="row in rows"
          :key="row.track.id"
          class="relative flex items-center gap-2 rounded-lg transition-colors hover:bg-elevated"
          :class="{ 'bg-elevated': row.current }"
          :data-track="row.track.id"
        >
          <NuxtLink
            :to="trackPath(row.track.id)"
            :aria-current="row.current ? 'true' : undefined"
            class="grid min-w-0 flex-1 grid-cols-[2.5rem_minmax(0,1fr)_7rem] items-center gap-x-3.5 rounded-lg py-2.5 pl-2.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            @click="open = false"
          >
            <TrackIcon :track-id="row.track.id" />
            <span class="min-w-0">
              <span class="block font-semibold text-highlighted">{{ row.track.title }}</span>
              <span class="block truncate text-sm text-muted">{{ row.track.tagline }}</span>
            </span>
            <span class="text-right">
              <span class="font-mono text-xs text-muted tabular-nums">
                <span aria-hidden="true">{{ row.count.solved }}/{{ row.count.total }}</span>
                <span class="sr-only">{{ t('track.solvedCount', { solved: row.count.solved, total: row.count.total }) }}</span>
              </span>
              <ProgressMeter
                class="mt-1.5 h-1"
                :class="trackLook(row.track.id).class"
                :count="row.count"
              />
            </span>
          </NuxtLink>
          <NuxtLink
            v-if="row.track.cheatSheet"
            :to="row.track.cheatSheet"
            :aria-label="t('track.cheat', { track: row.track.title })"
            class="mr-1.5 inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted hover:bg-accented hover:text-highlighted pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            @click="open = false"
          >
            <UIcon
              name="i-lucide-book-open"
              class="size-4"
            />
            <span class="max-sm:sr-only">{{ t('layout.nav.cheat') }}</span>
          </NuxtLink>
        </li>
      </ul>
      <p class="mt-1.5 flex items-center justify-between gap-4 border-t border-default px-2.5 pt-2.5 pb-1.5 text-sm">
        <NuxtLink
          to="/"
          class="inline-flex min-h-8 items-center gap-1.5 rounded-sm text-muted hover:text-highlighted pointer-coarse:min-h-11"
          @click="open = false"
        >
          {{ t('layout.nav.allTracks') }}
          <UIcon
            name="i-lucide-arrow-right"
            class="size-4"
          />
        </NuxtLink>
      </p>
    </template>
  </UPopover>
</template>
