<script setup lang="ts">
import { buildCheatSheet } from '~/utils/cheat-sheet'
import { debugCheatSource } from '~/utils/debugging-cheatsheet'

const { t } = useI18n()
useHead({ title: t('debugCheat.title') })
useSeoMeta({ description: t('debugCheat.intro') })

const sections = buildCheatSheet(debugCheatSource, t)
</script>

<template>
  <CheatSheetPage
    track="debugging"
    prefix="debugCheat"
    :sections="sections"
  />
</template>
