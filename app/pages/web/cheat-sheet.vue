<script setup lang="ts">
import { buildCheatSheet } from '~/utils/cheat-sheet'
import { webCheatSource } from '~/utils/web-cheatsheet'

const { t } = useI18n()
useHead({ title: t('webCheat.title') })
useSeoMeta({ description: t('webCheat.intro') })

const sections = buildCheatSheet(webCheatSource, t)
</script>

<template>
  <CheatSheetPage
    track="web"
    prefix="webCheat"
    :sections="sections"
  />
</template>
