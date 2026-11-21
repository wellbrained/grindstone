<script setup lang="ts">
import { buildCheatSheet } from '~/utils/cheat-sheet'
import { fwCheatSource } from '~/utils/frameworks-cheatsheet'

const { t } = useI18n()
useHead({ title: t('fwCheat.title') })
useSeoMeta({ description: t('fwCheat.intro') })

const sections = buildCheatSheet(fwCheatSource, t)
</script>

<template>
  <CheatSheetPage
    track="frameworks"
    prefix="fwCheat"
    :sections="sections"
  />
</template>
