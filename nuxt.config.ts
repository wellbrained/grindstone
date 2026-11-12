// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/ui',
    '@vueuse/nuxt'
  ],

  // static SPA: no server, everything runs in the browser (docs/adr/0001-plan.md)
  ssr: false,

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
    // Available on server and client
    public: {
      siteUrl: 'http://localhost:4003'
    }
  },

  // ports come from CoreHub: dev 4003
  devServer: { port: 4003 },

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
      { name: 'Inter', provider: 'google', weights: [400, 500, 600, 700] },
      { name: 'JetBrains Mono', provider: 'google', weights: [400, 500, 700] },
      // the wordmark only (AppLogo, docs/adr/0005-logo.md)
      { name: 'Tektur', provider: 'google', weights: [500, 900] }
    ]
  },

  // static SPA: no server to fetch icons from, so every icon must be in the client bundle
  icon: {
    clientBundle: {
      scan: true,
      // the header's menu button (Nuxt UI's own icons are not found by the scan)
      icons: ['simple-icons:github', 'lucide:menu', 'lucide:x']
    }
  }
})
