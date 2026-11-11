<script setup lang="ts">
// Global component: the default layout picks it up automatically for the header
// (see `optionalHeaderActions` in app/layouts/default.vue). Remove the layer and it disappears.
const { locale, locales, setLocale, t } = useI18n()

const items = computed(() => locales.value.map(l => ({ label: l.name ?? l.code, value: l.code })))
</script>

<template>
  <USelect
    :model-value="locale"
    :items="items"
    :aria-label="t('language')"
    icon="i-lucide-languages"
    variant="ghost"
    size="sm"
    class="w-32"
    @update:model-value="setLocale($event)"
  />
</template>
