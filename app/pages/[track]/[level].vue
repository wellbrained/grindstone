<script setup lang="ts">
import { isDebugLevel, isGitLevel, isReviewLevel, levelPlace } from '#shared/levels'

definePageMeta({ key: route => route.fullPath })

const route = useRoute()

// any live track's level: /<track>/<slug>. The page picks the track's play component (git: GitPlay, Debugging:
// DebuggingPlay, Working with AI: ReviewPlay); they share the level panel, the frame, the debrief with the radar,
// progress and the stats events (usePlaySession).
const level = levelFromRoute(String(route.params.track), String(route.params.level))
const place = level ? levelPlace(level.id) : null
if (!level || !place) throw createError({ statusCode: 404, statusMessage: 'Level not found', fatal: true })
useHead({ title: level.title })

const gitLevel = isGitLevel(level) ? level : null
const debugLevel = isDebugLevel(level) ? level : null
const reviewLevel = isReviewLevel(level) ? level : null
if (!gitLevel && !debugLevel && !reviewLevel) throw createError({ statusCode: 404, statusMessage: 'Level not found', fatal: true })
</script>

<template>
  <div class="mx-auto w-full max-w-[110rem] px-4 py-4 sm:px-6 lg:px-8">
    <GitPlay
      v-if="gitLevel"
      :level="gitLevel"
      :place="place"
    />
    <DebuggingPlay
      v-else-if="debugLevel"
      :level="debugLevel"
      :place="place"
    />
    <ReviewPlay
      v-else-if="reviewLevel"
      :level="reviewLevel"
      :place="place"
    />
  </div>
</template>
