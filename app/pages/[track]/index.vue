<script setup lang="ts">
import { trackById } from '#shared/levels'

// A live track's page (/git): its chapters and levels (app/components/TrackOverview.vue). Any live track in the registry
// gets one from its data; a coming or unknown track is a 404. Levels stay at /<track>/<slug>.
const route = useRoute()
const { t } = useI18n()

const track = trackById(String(route.params.track))
if (!track || track.status !== 'live') throw createError({ statusCode: 404, statusMessage: 'Track not found', fatal: true })
useHead({ title: t('track.title', { track: track.title }) })
useSeoMeta({ description: track.scope })
</script>

<template>
  <TrackOverview :track="track" />
</template>
