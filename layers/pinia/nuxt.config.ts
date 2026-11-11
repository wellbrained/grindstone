// Pinia layer — auto-registered because it lives in `layers/`.
// Remove: delete this folder, then `pnpm remove pinia @pinia/nuxt`.
export default defineNuxtConfig({
  modules: ['@pinia/nuxt'],

  pinia: {
    // Relative path = scanned in every layer AND the app: app/stores + layers/*/app/stores.
    // Stores defined there are auto-imported.
    storesDirs: ['stores']
  }
})
