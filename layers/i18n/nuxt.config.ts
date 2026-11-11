// i18n layer — auto-registered because it lives in `layers/`.
// Remove: delete this folder, then `pnpm remove @nuxtjs/i18n`.
export default defineNuxtConfig({
  modules: ['@nuxtjs/i18n'],

  i18n: {
    // 'no_prefix' keeps URLs unchanged (locale is stored in a cookie), so removing
    // this layer never breaks links. For SEO-friendly /de/... URLs use 'prefix_except_default'
    // and build links with localePath() / <NuxtLinkLocale>.
    strategy: 'no_prefix',
    defaultLocale: 'en',
    // Translation files: layers/i18n/i18n/locales/<file>. Your app can add its own in i18n/locales/.
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' }
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_locale',
      fallbackLocale: 'en'
    }
  }
})
