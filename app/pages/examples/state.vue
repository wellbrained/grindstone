<script setup lang="ts">
definePageMeta({
  example: {
    title: 'State & runtime config',
    description: 'Shared, SSR-safe state with useState composables and environment-based runtimeConfig.',
    icon: 'i-lucide-database',
    order: 4
  }
})

// Shared state: every component calling useExampleCounter() sees the same count,
// also across page navigations. Navigate away and back — the value stays.
const { count, double, increment, reset } = useExampleCounter()

// Runtime config: `public` keys are readable in the browser.
// Set NUXT_PUBLIC_SITE_URL in .env to override the default from nuxt.config.ts.
const config = useRuntimeConfig()

// Private keys are only readable on the server — so we ask an API route.
const { data: serverConfig } = await useFetch('/api/examples/config')
</script>

<template>
  <ExamplePage
    docs="https://nuxt.com/docs/getting-started/state-management"
    :files="[
      'app/pages/examples/state.vue',
      'app/composables/useExampleCounter.ts',
      'server/api/examples/config.get.ts',
      'nuxt.config.ts',
      '.env.example'
    ]"
  >
    <div class="grid gap-6 lg:grid-cols-2">
      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Shared state (useState)
          </h2>
        </template>

        <p class="text-3xl font-semibold tabular-nums">
          {{ count }}
        </p>
        <p class="text-sm text-muted">
          Double: {{ double }}
        </p>

        <div class="mt-4 flex gap-2">
          <UButton
            label="Increment"
            icon="i-lucide-plus"
            @click="increment"
          />
          <UButton
            label="Reset"
            color="neutral"
            variant="outline"
            @click="reset"
          />
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Runtime config
          </h2>
        </template>

        <dl class="space-y-2 text-sm">
          <div>
            <dt class="text-muted">
              Public: runtimeConfig.public.siteUrl
            </dt>
            <dd class="font-mono">
              {{ config.public.siteUrl }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              Server-only: runtimeConfig.exampleSecret is set
            </dt>
            <dd class="font-mono">
              {{ serverConfig?.exampleSecretIsSet }}
            </dd>
          </div>
        </dl>
      </UCard>
    </div>
  </ExamplePage>
</template>
