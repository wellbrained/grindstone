<script setup lang="ts">
import type { NuxtError } from '#app'
import { tracks } from '#shared/levels'
import { liveTracks } from '~/utils/navigation'
import { notFoundFor } from '~/utils/not-found'

// The error page, inside the site's own layout (header, footer): a 404 says what the address was meant to be (a level
// of a track, a track, a coming track) and where to go instead; anything else says something went wrong. Links to the
// tracks and the cheat sheets either way.
const props = defineProps<{
  error: NuxtError
}>()

const { t } = useI18n()
const route = useRoute()

const missing = computed(() => props.error.statusCode === 404 ? notFoundFor(route.path, tracks) : null)
const text = computed(() => {
  const found = missing.value
  if (!found) return { title: t('notFound.error'), body: t('notFound.errorBody') }
  if (found.kind === 'level') return { title: t('notFound.level', { slug: found.slug, track: found.track.title }), body: t('notFound.levelBody', { track: found.track.title }) }
  if (found.kind === 'track') return { title: t('notFound.track', { slug: found.slug }), body: t('notFound.trackBody') }
  if (found.kind === 'coming') return { title: t('notFound.coming', { track: found.track.title }), body: t('notFound.comingBody') }
  return { title: t('notFound.page'), body: t('notFound.pageBody') }
})
/** The one way back that fits the address: the track's levels for a missing level, else all tracks. */
const back = computed(() => missing.value?.kind === 'level'
  ? { to: `/${missing.value.track.id}`, label: t('notFound.levels', { track: missing.value.track.title }) }
  : { to: '/', label: t('notFound.tracks') })
const sheets = liveTracks(tracks).filter(track => track.cheatSheet)

useHead({ title: () => text.value.title })
</script>

<template>
  <UApp :scroll-body="false">
    <NuxtLayout>
      <div
        class="mx-auto w-full max-w-[110rem] px-4 py-12 sm:px-6 lg:px-8 lg:py-16"
        data-testid="error-page"
      >
        <div class="max-w-2xl">
          <h1 class="text-3xl font-semibold tracking-tight text-balance text-highlighted">
            {{ text.title }}
          </h1>
          <p class="mt-3 text-lg text-toned">
            {{ text.body }}
          </p>
          <p
            v-if="!missing"
            class="mt-2 font-mono text-sm text-muted"
          >
            {{ error.statusCode }} · {{ error.statusMessage || error.message }}
          </p>

          <div class="mt-6 flex flex-wrap gap-2">
            <UButton
              color="primary"
              variant="solid"
              size="lg"
              trailing-icon="i-lucide-arrow-right"
              :to="back.to"
              :label="back.label"
              data-testid="error-back"
            />
            <UButton
              v-if="back.to !== '/'"
              color="neutral"
              size="lg"
              to="/"
              :label="t('notFound.tracks')"
            />
          </div>

          <nav
            class="mt-10 border-t border-default pt-6"
            :aria-label="t('notFound.sheets')"
          >
            <h2 class="text-sm font-semibold text-highlighted">
              {{ t('notFound.sheets') }}
            </h2>
            <ul class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <li
                v-for="track in sheets"
                :key="track.id"
              >
                <NuxtLink
                  :to="track.cheatSheet!"
                  class="inline-flex min-h-11 items-center rounded-sm text-muted underline-offset-4 hover:text-highlighted hover:underline sm:min-h-6"
                >{{ t('notFound.sheet', { track: track.title }) }}</NuxtLink>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </NuxtLayout>
  </UApp>
</template>
