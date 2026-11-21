<script setup lang="ts">
import { trackById } from '#shared/levels'
import { filterCheatSheet } from '~/utils/cheat-sheet'
import type { CheatSectionView } from '~/utils/cheat-sheet'

// The page body of the Debugging and Web fundamentals cheat sheets (docs/features/ui.md, "Debugging cheat sheet"): the
// header's width, a filter, the section chips, and the sections in the chips' order, each a grid of cards. The pages
// only name their track and hand over the translated sections (`buildCheatSheet`).
const props = defineProps<{
  track: 'debugging' | 'web' | 'frameworks'
  /** The sheet's i18n prefix: `debugCheat`, `webCheat`, `fwCheat`. */
  prefix: string
  sections: readonly CheatSectionView[]
}>()

const { t } = useI18n()
const trackTitle = trackById(props.track)!.title
const query = ref('')
const shown = computed(() => filterCheatSheet(props.sections, query.value))
</script>

<template>
  <div class="mx-auto w-full max-w-[110rem] px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
    <!-- no kicker above the title: the way back to the track's levels instead (a link, muted) -->
    <nav :aria-label="t('play.breadcrumb')">
      <NuxtLink
        :to="`/${track}`"
        class="-ms-1 inline-flex min-h-6 items-center gap-1 rounded-sm px-1 text-sm text-muted hover:text-highlighted pointer-coarse:min-h-11"
        data-testid="cheat-back"
      >
        <UIcon
          name="i-lucide-arrow-left"
          class="size-4"
        />
        {{ t('track.levelsOf', { track: trackTitle }) }}
      </NuxtLink>
    </nav>
    <h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
      {{ t(`${prefix}.title`) }}
    </h1>
    <p class="mt-4 max-w-3xl text-toned">
      {{ t(`${prefix}.intro`) }}
    </p>

    <div class="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
      <UInput
        v-model="query"
        icon="i-lucide-search"
        :placeholder="t(`${prefix}.search`)"
        :aria-label="t(`${prefix}.search`)"
        class="w-full sm:max-w-xs"
      />
      <nav
        class="flex flex-wrap gap-x-1 gap-y-0.5 text-sm"
        :aria-label="t(`${prefix}.sections`)"
      >
        <a
          v-for="section in sections"
          :key="section.id"
          :href="`#${section.id}`"
          class="inline-flex min-h-6 items-center rounded-sm px-1.5 text-muted hover:text-highlighted pointer-coarse:min-h-11"
          data-testid="cheat-chip"
        >{{ section.title }}</a>
      </nav>
    </div>

    <p
      v-if="shown.length === 0"
      class="mt-10 text-muted"
    >
      {{ t(`${prefix}.none`, { query }) }}
    </p>

    <!-- sections stacked in the order of the chips above; inside a section the cards flow in columns of at least 20rem
         (down a column, then the next), so a short card never leaves a hole beside a tall one -->
    <section
      v-for="section in shown"
      :id="section.id"
      :key="section.id"
      class="scroll-mt-20 pt-8"
      data-testid="cheat-group"
    >
      <h2 class="text-xl font-semibold tracking-tight text-highlighted">
        {{ section.title }}
      </h2>
      <ul class="mt-4 gap-x-4 sm:columns-[20rem]">
        <CheatCard
          v-for="card in section.cards"
          :key="card.id"
          :card="card"
          :prefix="prefix"
        />
      </ul>
    </section>
  </div>
</template>
