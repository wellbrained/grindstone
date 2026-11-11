<script setup lang="ts">
definePageMeta({
  example: {
    title: 'i18n (layer)',
    description: 'Translations with @nuxtjs/i18n: interpolation, pluralization and a language switcher. Provided by layers/i18n.',
    icon: 'i-lucide-languages',
    order: 21
  }
})

// In templates you can use $t directly; in <script> use useI18n()
const { t, locale } = useI18n()

const apples = ref(1)
const name = 'Nuxt'
</script>

<template>
  <ExamplePage
    docs="https://i18n.nuxtjs.org/docs/getting-started/usage"
    :files="[
      'layers/i18n/app/pages/examples/i18n.vue',
      'layers/i18n/i18n/locales/en.json',
      'layers/i18n/i18n/locales/de.json',
      'layers/i18n/app/components/global/LanguageSwitcher.vue',
      'layers/i18n/nuxt.config.ts'
    ]"
  >
    <UCard class="max-w-xl">
      <template #header>
        <div class="flex items-center justify-between gap-4">
          <!-- Interpolation: "Hello {name}!" -->
          <h2 class="text-lg font-semibold">
            {{ $t('example.greeting', { name }) }}
          </h2>
          <LanguageSwitcher />
        </div>
      </template>

      <p>{{ t('example.intro') }}</p>

      <!-- Pluralization: "No apples | One apple | {count} apples" -->
      <p class="mt-4 text-2xl font-semibold">
        {{ $t('example.apples', apples) }}
      </p>

      <div class="mt-4 flex gap-2">
        <UButton
          :label="$t('example.add')"
          icon="i-lucide-plus"
          @click="apples++"
        />
        <UButton
          :label="$t('example.reset')"
          color="neutral"
          variant="outline"
          @click="apples = 0"
        />
      </div>

      <template #footer>
        <p class="text-sm text-muted">
          {{ $t('example.current') }}: <code>{{ locale }}</code>
        </p>
      </template>
    </UCard>
  </ExamplePage>
</template>
