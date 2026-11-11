<script setup lang="ts">
import { gitLevels } from '#shared/levels'

const { t } = useI18n()
const { isSolved, progress } = useProgress()

// Start at the first level you have not solved yet; with everything solved, offer the first one again.
const target = computed(() => gitLevels.find(level => !isSolved(level.id)) ?? gitLevels[0]!)
const started = computed(() => Object.keys(progress.value.levels).length > 0)
const allSolved = computed(() => gitLevels.every(level => isSolved(level.id)))
const startLabel = computed(() => allSolved.value ? t('home.again') : started.value ? t('home.continue', { title: target.value.title }) : t('home.start'))
</script>

<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
    <section>
      <p class="font-mono text-sm text-primary">
        {{ t('home.kicker') }}
      </p>
      <h1 class="mt-3 text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
        {{ t('home.title') }}
      </h1>
      <div class="mt-5 space-y-3 text-base text-toned">
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

    <section
      class="mt-12"
      aria-labelledby="levels-heading"
    >
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
  </div>
</template>
