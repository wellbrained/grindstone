<script setup lang="ts">
import { hasProgress, isRadarEmpty, overviewRadar, tracks, trackToContinue } from '#shared/levels'
import { comingTracks, liveTracks } from '~/utils/navigation'
import { trackLook } from '~/utils/track-look'
import { emphasisTrackId } from '~/utils/track-view'

// Home: every track, from the registry (shared/levels/tracks.ts), so a new track needs data only. The hero is the pitch
// (with Continue under it once you have progress) beside your skills: the overview radar (ADR 0008), always shown, an
// empty outline on a first visit. Then each live track as a terminal window (TrackTerminal), two to a row from lg, the
// last window a short word about Grindstone. Coming tracks follow as a quiet list (docs/features/ui.md, "Home").
const { t } = useI18n()
const { progress } = useProgress()

const resumeTrack = computed(() => hasProgress(progress.value) ? trackToContinue(progress.value) : null)
// each track in its own colour (the Track Colour Rule), as in its window
const radar = computed(() => overviewRadar(tracks, progress.value, id => trackLook(id).colour))
const radarEmpty = computed(() => isRadarEmpty(radar.value))
const live = liveTracks(tracks)
const coming = comingTracks(tracks)
const emphasisId = computed(() => emphasisTrackId(live, resumeTrack.value?.id ?? null))
</script>

<template>
  <div class="mx-auto w-full max-w-[110rem] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
    <!-- the pitch (Continue under it) beside your skills from lg; on a phone the radar follows Continue -->
    <header class="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
      <div>
        <h1 class="max-w-3xl text-3xl font-semibold tracking-tight text-balance text-highlighted sm:text-4xl lg:text-5xl lg:leading-[1.1]">
          {{ t('home.title') }}
        </h1>
        <p class="mt-4 max-w-[70ch] text-lg text-pretty text-toned">
          {{ t('home.intro') }}
        </p>
        <p class="mt-3 flex items-center gap-2 text-sm text-muted">
          <UIcon
            name="i-lucide-hard-drive"
            class="size-4 shrink-0"
          />
          {{ t('home.local') }}
        </p>
        <ContinueCard
          v-if="resumeTrack"
          class="mt-8 max-w-2xl"
          :track="resumeTrack"
          context="home"
        />
      </div>

      <!-- your skills: one axis per live track in the track's colour; the picture is decoration, the list says it in words -->
      <section
        class="flex flex-col items-center"
        aria-labelledby="skills-heading"
        data-testid="overview-radar"
      >
        <h2
          id="skills-heading"
          class="sr-only"
        >
          {{ t('home.radar.title') }}
        </h2>
        <SkillRadar
          class="w-full max-w-[26rem] xl:max-w-[30rem]"
          :axes="radar"
          labels
        />
        <p class="mt-1 text-center font-mono text-xs text-muted">
          {{ radarEmpty ? t('home.radar.empty') : t('home.radar.caption') }}
        </p>
        <ul class="sr-only">
          <li
            v-for="axis in radar"
            :key="axis.chapter.id"
            :data-axis-track="axis.chapter.id"
          >
            {{ axis.chapter.title }}: {{ t('home.radar.track', { solved: axis.solved, total: axis.total }) }}
          </li>
        </ul>
      </section>
    </header>

    <!-- every live track as a terminal window -->
    <div class="mt-10 grid gap-5 sm:mt-12 lg:grid-cols-2">
      <TrackTerminal
        v-for="track in live"
        :key="track.id"
        :track="track"
        :continue-track-id="resumeTrack?.id ?? null"
        :emphasis="track.id === emphasisId"
      />

      <!-- the last window: what Grindstone is, in the same voice -->
      <TerminalWindow
        command="grindstone about"
        aria-labelledby="about-heading"
      >
        <h2
          id="about-heading"
          class="mt-2 text-2xl font-semibold tracking-tight text-highlighted"
        >
          {{ t('home.aboutTitle') }}
        </h2>
        <p class="mt-2.5 max-w-[60ch] text-pretty text-toned">
          {{ t('home.aboutText') }}
        </p>
        <p class="mt-4">
          <NuxtLink
            to="/about"
            class="inline-flex min-h-6 items-center gap-1.5 rounded-sm font-medium text-highlighted underline decoration-(--ui-border-accented) underline-offset-4 hover:decoration-current pointer-coarse:min-h-11"
          >
            {{ t('home.about') }}
            <UIcon
              name="i-lucide-arrow-right"
              class="size-4"
            />
          </NuxtLink>
        </p>
        <p
          aria-hidden="true"
          class="mt-auto pt-6 font-mono text-[0.8125rem] text-muted"
        >
          <span class="text-toned">you@grindstone</span> ~ $ <span class="inline-block h-4 w-2 translate-y-0.5 bg-(--ui-text-toned)" />
        </p>
      </TerminalWindow>
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
      <p class="mt-1.5 max-w-[70ch] text-sm text-pretty text-muted">
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
    </section>
  </div>
</template>
