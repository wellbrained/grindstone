<script setup lang="ts">
import { gitLevels } from '#shared/levels'

const { t } = useI18n()
const { isSolved, progress } = useProgress()

// Start at the first level you have not solved yet; with everything solved, offer the first one again.
const target = computed(() => gitLevels.find(level => !isSolved(level.id)) ?? gitLevels[0]!)
const started = computed(() => Object.keys(progress.value.levels).length > 0)
const allSolved = computed(() => gitLevels.every(level => isSolved(level.id)))
const points = ['teammates', 'real', 'graph', 'ide'] as const
const startLabel = computed(() => allSolved.value ? t('home.again') : started.value ? t('home.continue', { title: target.value.title }) : t('home.start'))
</script>

<template>
  <div class="mx-auto w-full max-w-[110rem] px-4 sm:px-6 lg:px-8 grid gap-x-16 gap-y-12 py-10 sm:py-16 lg:grid-cols-2 lg:items-start 2xl:grid-cols-3">
    <!-- full page width like the header: pitch | levels | why, from 2xl; why goes below on smaller screens -->
    <section class="lg:sticky lg:top-24">
      <p class="font-mono text-sm text-primary">
        {{ t('home.kicker') }}
      </p>
      <h1 class="mt-3 text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
        {{ t('home.title') }}
      </h1>
      <div class="mt-5 max-w-2xl space-y-3 text-base text-toned">
        <p>{{ t('home.pitch') }}</p>
        <p>{{ t('home.teammates') }}</p>
      </div>

      <div class="mt-7 flex flex-wrap items-center gap-3">
        <ClientOnly>
          <UButton
            size="xl"
            color="primary"
            variant="solid"
            trailing-icon="i-lucide-arrow-right"
            :to="levelPath(target)"
            :label="startLabel"
            data-testid="start"
          />
          <template #fallback>
            <UButton
              size="xl"
              color="primary"
              variant="solid"
              trailing-icon="i-lucide-arrow-right"
              :to="levelPath(gitLevels[0]!)"
              :label="t('home.start')"
            />
          </template>
        </ClientOnly>
        <p class="text-sm text-muted">
          {{ t('home.local') }}
        </p>
      </div>
    </section>

    <section aria-labelledby="levels-heading">
      <h2
        id="levels-heading"
        class="mb-3 font-mono text-sm font-medium text-muted"
      >
        {{ t('home.track') }}
      </h2>
      <ClientOnly>
        <LevelList show-progress />
        <template #fallback>
          <LevelList :show-progress="false" />
        </template>
      </ClientOnly>
    </section>

    <section
      class="lg:col-span-2 2xl:col-span-1"
      aria-labelledby="why-heading"
    >
      <h2
        id="why-heading"
        class="mb-3 font-mono text-sm font-medium text-muted"
      >
        {{ t('about.differentTitle') }}
      </h2>
      <ul class="grid gap-x-10 gap-y-5 sm:grid-cols-2 2xl:grid-cols-1">
        <li
          v-for="point in points"
          :key="point"
        >
          <h3 class="font-semibold text-highlighted">
            {{ t(`about.different.${point}.title`) }}
          </h3>
          <p class="mt-1 text-sm text-toned">
            {{ t(`about.different.${point}.text`) }}
          </p>
        </li>
      </ul>
      <div class="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <NuxtLink
          to="/git/cheat-sheet"
          class="text-primary hover:underline"
        >{{ t('layout.nav.cheat') }} →</NuxtLink>
        <NuxtLink
          to="/about"
          class="text-primary hover:underline"
        >{{ t('layout.nav.about') }} →</NuxtLink>
      </div>
    </section>
  </div>
</template>
