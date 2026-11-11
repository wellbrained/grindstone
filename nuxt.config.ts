// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/ui',
    '@vueuse/nuxt'
  ],

  devtools: {
    enabled: true
  },

  app: {
    head: {
      // Default document language; useHead() calls (e.g. from layers/i18n) override it
      htmlAttrs: { lang: 'en' }
    }
  },

  css: ['~/assets/css/main.css'],

  // Values are overridden by env vars at runtime: NUXT_<KEY> / NUXT_PUBLIC_<KEY> (see .env.example)
  runtimeConfig: {
    // Server-only (never sent to the browser)
    exampleSecret: '',
    // Available on server and client
    public: {
      siteUrl: 'http://localhost:3000'
    }
  },

  routeRules: {
    '/': { prerender: true }
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  // @nuxt/fonts is registered by Nuxt UI. Fonts listed here are downloaded and self-hosted.
  fonts: {
    families: [
      { name: 'Inter', provider: 'google', weights: [400, 500, 600, 700] }
    ]
  }
})
