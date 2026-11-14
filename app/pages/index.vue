<script setup lang="ts">
import { hasProgress, overviewRadar, tracks, trackToContinue } from '#shared/levels'
import { comingTracks, liveTracks } from '~/utils/navigation'

// Home: every track, from the registry (shared/levels/tracks.ts), so a new track needs data only. A short pitch, Continue
// once you have progress, your skills across the tracks (the overview radar, ADR 0008: an axis per live track, once you
// have progress), each live track as a TrackCard, the coming tracks as a quiet list (docs/features/ui.md, "Home").
const { t } = useI18n()
const { progress } = useProgress()

const resumeTrack = computed(() => hasProgress(progress.value) ? trackToContinue(progress.value) : null)
const radar = computed(() => overviewRadar(tracks, progress.value))
const highlighted = ref<string | null>(null)
const live = liveTracks(tracks)
const coming = comingTracks(tracks)
</script>

<template>
  <div class="mx-auto w-full max-w-[110rem] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
    <header
      class="grid gap-8 lg:items-end lg:gap-16"
      :class="{ 'lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)]': resumeTrack }"
    >
      <div>
        <h1 class="max-w-3xl text-3xl font-semibold tracking-tight text-balance text-highlighted sm:text-4xl lg:text-5xl lg:leading-[1.1]">
          {{ t('home.title') }}
        </h1>
        <p class="mt-4 max-w-2xl text-lg text-pretty text-toned">
          {{ t('home.intro') }}
        </p>
        <p class="mt-3 flex items-center gap-2 text-sm text-muted">
          <UIcon
            name="i-lucide-hard-drive"
            class="size-4 shrink-0"
          />
          {{ t('home.local') }}
        </p>
      </div>
      <ContinueCard
        v-if="resumeTrack"
        :track="resumeTrack"
        context="home"
      />
    </header>

    <!-- your skills across the tracks: one axis per live track, once there is something to draw -->
    <section
      v-if="resumeTrack"
      class="mt-12 flex flex-col items-center gap-6 rounded-2xl border border-default p-5 sm:mt-14 sm:flex-row sm:gap-10 sm:p-8"
      aria-labelledby="skills-heading"
      data-testid="overview-radar"
    >
      <SkillRadar
        class="w-44 shrink-0 sm:w-48"
        :axes="radar"
        :highlight="highlighted"
        hoverable
        @highlight="highlighted = $event"
      />
      <div class="w-full min-w-0">
        <h2
          id="skills-heading"
          class="text-xl font-semibold tracking-tight text-highlighted"
        >
          {{ t('home.radar.title') }}
        </h2>
        <p class="mt-1.5 max-w-xl text-sm text-pretty text-muted">
          {{ t('home.radar.intro') }}
        </p>
        <ul class="mt-4 max-w-md space-y-1">
          <li
            v-for="axis in radar"
            :key="axis.chapter.id"
            :data-axis-track="axis.chapter.id"
          >
            <NuxtLink
              :to="trackPath(axis.chapter.id)"
              class="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
              :class="{ 'bg-elevated': highlighted === axis.chapter.id }"
              @mouseenter="highlighted = axis.chapter.id"
              @mouseleave="highlighted = null"
              @focus="highlighted = axis.chapter.id"
              @blur="highlighted = null"
            >
              <CommitDot
                size="sm"
                :colour="axis.chapter.colour"
                :state="axis.solved === axis.total ? 'solved' : 'open'"
              />
              <span class="min-w-0 flex-1 font-medium text-highlighted">{{ axis.chapter.title }}</span>
              <span class="font-mono text-xs text-muted tabular-nums">{{ t('home.radar.track', { solved: axis.solved, total: axis.total }) }}</span>
            </NuxtLink>
          </li>
        </ul>
      </div>
    </section>

    <!-- every live track carries its own weight; a second one needs data only -->
    <div class="mt-12 space-y-8 sm:mt-16">
      <TrackCard
        v-for="track in live"
        :key="track.id"
        :track="track"
        :continue-track-id="resumeTrack?.id ?? null"
      />
    </div>

    <!-- the coming tracks: honest, quiet, one line each -->
    <section
      v-if="coming.length"
      class="mt-14 sm:mt-20"
      aria-labelledby="coming-heading"
    >
      <h2
        id="coming-heading"
        class="text-xl font-semibold tracking-tight text-highlighted"
      >
        {{ t('home.coming.title') }}
      </h2>
      <p class="mt-1.5 max-w-2xl text-sm text-pretty text-muted">
        {{ t('home.coming.intro') }}
      </p>
      <ul class="mt-5 grid border-t border-default md:grid-cols-2 md:gap-x-12">
        <li
          v-for="track in coming"
          :key="track.id"
          class="flex items-start gap-4 border-b border-default py-4"
          :data-track="track.id"
        >
          <span
            aria-hidden="true"
            class="mt-1.5 inline-block size-2.5 shrink-0 rounded-full border-2 border-current text-dimmed"
          />
          <div class="min-w-0 flex-1">
            <h3 class="flex flex-wrap items-center gap-x-3 gap-y-1 font-medium text-toned">
              {{ track.title }}
              <span class="rounded-sm border border-default px-1.5 text-xs leading-5 font-normal text-muted">{{ t('track.coming') }}</span>
            </h3>
            <p class="mt-1 text-sm text-muted">
              {{ track.scope }}
            </p>
          </div>
        </li>
      </ul>
      <p class="mt-6 text-sm">
        <NuxtLink
          to="/about"
          class="inline-flex items-center gap-1.5 rounded-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
        >
          {{ t('home.about') }}
          <UIcon
            name="i-lucide-arrow-right"
            class="size-4"
          />
        </NuxtLink>
      </p>
    </section>
  </div>
</template>
