<script setup lang="ts">
definePageMeta({
  example: {
    title: 'VueUse',
    description: 'Clipboard, localStorage, window size, time and debounce helpers — 200+ auto-imported composables.',
    icon: 'i-lucide-wrench',
    order: 8
  }
})

// All VueUse composables are auto-imported via @vueuse/nuxt — no import needed.
// Full list: https://vueuse.org/functions

// Clipboard (`legacy` adds a fallback for browsers without the Clipboard API).
// Note: don't bind UI state to `isSupported` — it's false on the server and causes a hydration mismatch.
const { copy, copied } = useClipboard({ copiedDuring: 1500, legacy: true })

// Persisted in localStorage — survives page reloads
const note = useLocalStorage('example-note', '')

// Reactive window size
const { width, height } = useWindowSize()

// Current time, formatted
const now = useNow()
const time = useDateFormat(now, 'HH:mm:ss')

// Debounced value: updates 500ms after typing stops
const search = ref('')
const debouncedSearch = refDebounced(search, 500)
</script>

<template>
  <ExamplePage
    docs="https://vueuse.org/functions"
    :files="['app/pages/examples/vueuse.vue']"
  >
    <div class="grid gap-6 lg:grid-cols-2">
      <UCard>
        <template #header>
          <h2 class="font-semibold">
            useClipboard
          </h2>
        </template>

        <UButton
          :label="copied ? 'Copied!' : 'Copy text'"
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          @click="copy('Hello from VueUse')"
        />
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            useLocalStorage
          </h2>
        </template>

        <!-- localStorage only exists in the browser: render client-side to avoid hydration mismatches -->
        <ClientOnly>
          <UInput
            v-model="note"
            placeholder="Type, then reload the page"
            class="w-full"
          />
          <template #fallback>
            <USkeleton class="h-8 w-full" />
          </template>
        </ClientOnly>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            useWindowSize & useNow
          </h2>
        </template>

        <ClientOnly>
          <p class="font-mono text-sm">
            {{ width }} × {{ height }} px — {{ time }}
          </p>
          <template #fallback>
            <USkeleton class="h-5 w-48" />
          </template>
        </ClientOnly>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            refDebounced
          </h2>
        </template>

        <UInput
          v-model="search"
          placeholder="Search…"
          icon="i-lucide-search"
          class="w-full"
        />
        <p class="mt-2 text-sm text-muted">
          Debounced value: <span class="font-mono">{{ debouncedSearch || '—' }}</span>
        </p>
      </UCard>
    </div>
  </ExamplePage>
</template>
