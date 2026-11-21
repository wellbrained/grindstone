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
// after the 404 above the error page takes over; the template's guard keeps this page from rendering without a track
</script>

<template>
  <TrackOverview
    v-if="track"
    :track="track"
  />
</template>
