<script setup lang="ts">
import type { Track } from '#shared/levels'
import { trackView } from '~/utils/track-view'

// A track page (docs/features/ui.md, "Track page"): the whole track and your place in it at once. From lg a sticky rail
// (title, scope, overall progress, the chapters) beside the Continue card and the chapter sections; below lg the rail's
// heading scrolls away and its chapters become a horizontal strip that sticks under the header.
const props = defineProps<{ track: Track }>()

const { t } = useI18n()
const { progress, takeJustSolved } = useProgress()
// back from a level solved for the first time: its lane draws in once (LevelRow.vue)
const justSolved = takeJustSolved()
const motion = usePreferredReducedMotion()

const view = computed(() => trackView(props.track, progress.value))
const { active, pin } = useActiveSection(() => props.track.chapters.map(chapter => chapter.id))

const size = computed(() => t('track.size', {
  levels: t('track.levels', view.value.count.total),
  chapters: t('track.chapters', props.track.chapters.length)
}))

const behavior = (): ScrollBehavior => motion.value === 'reduce' ? 'auto' : 'smooth'

/** A chapter picked in the rail or the strip: scroll to its section, keep the URL shareable, move the focus there. */
function jump(id: string) {
  const section = document.getElementById(id)
  if (!section) return
  pin(id)
  section.scrollIntoView({ behavior: behavior(), block: 'start' })
  // vue-router keeps its own entry in history.state, so it is passed on unchanged
  history.replaceState(history.state, '', `#${id}`)
  document.getElementById(`${id}-heading`)?.focus({ preventScroll: true })
}

function onStripClick(event: MouseEvent, id: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  jump(id)
}

// keep the strip's current chapter in view (below lg)
const strip = useTemplateRef<HTMLElement>('strip')
watch(active, (id) => {
  const list = strip.value
  const chip = list?.querySelector<HTMLElement>(`[data-chip="${id}"]`)
  if (!list || !chip || list.offsetParent === null) return
  list.scrollTo({ left: chip.offsetLeft - (list.clientWidth - chip.offsetWidth) / 2, behavior: behavior() })
}, { flush: 'post' })
</script>

<template>
  <div class="mx-auto w-full max-w-[110rem] px-4 pb-16 sm:px-6 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-x-12 lg:px-8 lg:pb-24 xl:grid-cols-[18.75rem_minmax(0,1fr)] xl:gap-x-14">
    <aside class="pt-8 sm:pt-10 lg:sticky lg:top-(--ui-header-height) lg:max-h-[calc(100dvh-var(--ui-header-height))] lg:self-start lg:overflow-y-auto lg:pr-1 lg:pb-8">
      <header>
        <h1 class="text-3xl font-semibold tracking-tight text-highlighted lg:text-[2.125rem] lg:leading-tight">
          {{ track.title }}
        </h1>
        <p class="mt-1 max-w-xl text-sm text-muted">
          {{ size }} <span aria-hidden="true">·</span> {{ track.scope }}
        </p>
        <ProgressMeter
          class="mt-4 h-1.5 max-w-sm text-primary"
          :count="view.count"
        />
        <p
          class="mt-1.5 font-mono text-xs text-muted tabular-nums"
          data-testid="track-progress"
        >
          {{ t('track.solvedCount', { solved: view.count.solved, total: view.count.total }) }}
        </p>
      </header>

      <ChapterNav
        class="mt-6 hidden lg:block"
        :label="t('track.chaptersLabel', { track: track.title })"
        :chapters="view.chapters"
        :active="active"
        @jump="jump"
      />

      <NuxtLink
        v-if="track.cheatSheet"
        :to="track.cheatSheet"
        class="mt-6 hidden items-center gap-2 rounded-md px-3 text-sm text-muted hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary lg:flex"
      >
        <UIcon
          name="i-lucide-book-open"
          class="size-4"
        />
        {{ t('track.cheat', { track: track.title }) }}
      </NuxtLink>
    </aside>

    <!-- below lg: the chapters as a strip that sticks under the header and scrolls sideways -->
    <nav
      data-chapter-strip
      class="sticky top-(--ui-header-height) z-10 -mx-4 mt-6 border-y border-default bg-default/90 backdrop-blur-sm sm:-mx-6 lg:hidden"
      :aria-label="t('track.chaptersLabel', { track: track.title })"
    >
      <ol
        ref="strip"
        class="relative flex gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:thin] sm:px-6"
      >
        <li
          v-for="item in view.chapters"
          :key="item.chapter.id"
          class="shrink-0"
        >
          <a
            :href="`#${item.chapter.id}`"
            class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            :class="active === item.chapter.id ? 'border-accented bg-elevated font-medium text-highlighted' : 'border-transparent text-toned hover:bg-elevated'"
            :aria-current="active === item.chapter.id ? 'true' : undefined"
            :data-chip="item.chapter.id"
            @click="onStripClick($event, item.chapter.id)"
          >
            <CommitDot
              size="sm"
              :colour="item.chapter.colour"
              :state="item.state"
            />
            {{ item.chapter.title }}
            <span
              v-if="!item.coming"
              class="font-mono text-xs font-normal text-muted tabular-nums"
            >
              <span aria-hidden="true">{{ item.count.solved }}/{{ item.count.total }}</span>
              <span class="sr-only">{{ t('track.solvedCount', { solved: item.count.solved, total: item.count.total }) }}</span>
            </span>
            <span
              v-else
              class="text-xs font-normal text-muted"
            >{{ t('track.coming') }}</span>
          </a>
        </li>
      </ol>
    </nav>

    <div class="min-w-0 pt-6 lg:pt-10">
      <ContinueCard
        :track="track"
        context="track"
      />
      <div class="mt-10 space-y-12 sm:mt-12 sm:space-y-14">
        <ChapterSection
          v-for="chapter in view.chapters"
          :key="chapter.chapter.id"
          :view="chapter"
          :just-solved="justSolved"
        />
      </div>
      <p
        v-if="track.cheatSheet"
        class="mt-14 text-sm text-muted lg:hidden"
      >
        <NuxtLink
          :to="track.cheatSheet"
          class="inline-flex items-center gap-2 text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <UIcon
            name="i-lucide-book-open"
            class="size-4"
          />
          {{ t('track.cheat', { track: track.title }) }}
        </NuxtLink>
      </p>
    </div>
  </div>
</template>
