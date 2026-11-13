<script setup lang="ts">
import { isGitLevel, levelPlace } from '#shared/levels'

definePageMeta({ key: route => route.fullPath })

const route = useRoute()

// any live track's level: /<track>/<slug>. The page picks the track's play component (git: GitPlay); they share the
// level panel, the frame, the debrief with the radar, progress and the stats events (usePlaySession).
const level = levelFromRoute(String(route.params.track), String(route.params.level))
const place = level ? levelPlace(level.id) : null
if (!level || !place) throw createError({ statusCode: 404, statusMessage: 'Level not found', fatal: true })
useHead({ title: level.title })

const gitLevel = isGitLevel(level) ? level : null
if (!gitLevel) throw createError({ statusCode: 404, statusMessage: 'Level not found', fatal: true })
</script>

<template>
  <div class="mx-auto w-full max-w-[110rem] px-4 py-4 sm:px-6 lg:px-8">
    <GitPlay
      :level="gitLevel"
      :place="place"
    />
  </div>
</template>
