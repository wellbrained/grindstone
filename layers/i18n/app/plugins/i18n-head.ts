// Keeps <html lang="…"> in sync with the active locale (overrides the low-priority default in app.vue).
export default defineNuxtPlugin((nuxtApp) => {
  const { locale, locales } = nuxtApp.$i18n

  const lang = computed(() => locales.value.find(l => l.code === locale.value)?.language ?? locale.value)

  useHead({ htmlAttrs: { lang } })
})
