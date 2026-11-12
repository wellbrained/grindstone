<script setup lang="ts">
const { t } = useI18n()
useHead({ title: t('about.title') })
useSeoMeta({ description: t('about.intro') })

const points = ['teammates', 'real', 'graph', 'ide'] as const
const later = ['levels', 'disasters', 'workflows', 'tracks', 'profile'] as const
</script>

<template>
  <div class="mx-auto w-full max-w-[110rem] px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
    <!-- full page width like the header (docs/features/ui.md, "Page width") -->
    <p class="font-mono text-sm text-primary">
      {{ t('about.kicker') }}
    </p>
    <h1 class="mt-3 text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
      {{ t('about.title') }}
    </h1>
    <p class="mt-4 max-w-3xl text-lg text-toned">
      {{ t('about.intro') }}
    </p>

    <div class="mt-12 grid gap-x-16 gap-y-12 lg:grid-cols-2 xl:grid-cols-3">
      <section>
        <h2 class="font-mono text-sm font-medium text-muted">
          {{ t('about.differentTitle') }}
        </h2>
        <ul class="mt-4 space-y-5">
          <li
            v-for="point in points"
            :key="point"
          >
            <h3 class="font-semibold text-highlighted">
              {{ t(`about.different.${point}.title`) }}
            </h3>
            <p class="mt-1 text-toned">
              {{ t(`about.different.${point}.text`) }}
            </p>
          </li>
        </ul>
      </section>

      <div class="space-y-12">
        <section>
          <h2 class="font-mono text-sm font-medium text-muted">
            {{ t('about.howTitle') }}
          </h2>
          <p class="mt-4 text-toned">
            {{ t('about.how') }}
          </p>
        </section>

        <ProgressBackup />

        <section>
          <h2 class="font-mono text-sm font-medium text-muted">
            {{ t('about.laterTitle') }}
          </h2>
          <ul class="mt-4 list-disc space-y-1.5 pl-5 text-toned marker:text-primary">
            <li
              v-for="item in later"
              :key="item"
            >
              {{ t(`about.later.${item}`) }}
            </li>
          </ul>
        </section>
      </div>

      <section class="self-start rounded-lg border border-default bg-elevated p-5 lg:col-span-2 xl:col-span-1">
        <h2 class="font-mono text-sm font-medium text-muted">
          {{ t('about.byTitle') }}
        </h2>
        <p class="mt-3 text-toned">
          {{ t('about.by') }}
        </p>
        <div class="mt-5 flex flex-wrap gap-3">
          <UButton
            :label="t('about.links.portfolio')"
            to="https://dkiessling.de"
            target="_blank"
            trailing-icon="i-lucide-arrow-up-right"
            color="primary"
          />
          <UButton
            :label="t('about.links.code')"
            to="https://github.com/wellbrained/grindstone"
            target="_blank"
            icon="i-simple-icons-github"
            color="neutral"
          />
          <UButton
            :label="t('about.links.profile')"
            to="https://github.com/wellbrained"
            target="_blank"
            icon="i-simple-icons-github"
            color="neutral"
          />
        </div>
      </section>
    </div>
  </div>
</template>
