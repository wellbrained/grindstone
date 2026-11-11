<script setup lang="ts">
import type { DropdownMenuItem, TabsItem } from '@nuxt/ui'

definePageMeta({
  example: {
    title: 'Nuxt UI components',
    description: 'Buttons, modal, toast, tabs, dropdown, tooltip, alerts, icons, shortcuts and color mode.',
    icon: 'i-lucide-component',
    order: 1
  }
})

// All `U*` components are auto-imported. Browse the full list at https://ui.nuxt.com/docs/components

// Modal: controlled with v-model:open
const modalOpen = ref(false)

// Toast: `useToast()` is provided by Nuxt UI (needs <UApp> in app.vue, already set up)
const toast = useToast()

function showToast() {
  toast.add({ title: 'Saved', description: 'Your changes have been saved.', icon: 'i-lucide-check', color: 'success' })
}

// Color mode: useColorMode() is auto-imported (preference = 'system' | 'light' | 'dark')
const colorMode = useColorMode()

// Typed items for Tabs and DropdownMenu
const tabs: TabsItem[] = [
  { label: 'Account', icon: 'i-lucide-user', slot: 'account' },
  { label: 'Password', icon: 'i-lucide-lock', slot: 'password' }
]

const menuItems: DropdownMenuItem[][] = [
  [
    { label: 'Profile', icon: 'i-lucide-user' },
    { label: 'Settings', icon: 'i-lucide-settings', kbds: [','] }
  ],
  [
    { label: 'Log out', icon: 'i-lucide-log-out', color: 'error', onSelect: () => toast.add({ title: 'Logged out' }) }
  ]
]

// Keyboard shortcut: press "m" anywhere on this page to open the modal
defineShortcuts({
  m: () => { modalOpen.value = true }
})
</script>

<template>
  <ExamplePage
    docs="https://ui.nuxt.com/docs/components"
    :files="['app/pages/examples/components.vue', 'app/app.config.ts']"
  >
    <div class="grid gap-6 lg:grid-cols-2">
      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Buttons & badges
          </h2>
        </template>

        <div class="flex flex-wrap gap-2">
          <UButton label="Primary" />
          <UButton
            label="Neutral"
            color="neutral"
            variant="outline"
          />
          <UButton
            label="Soft"
            variant="soft"
            icon="i-lucide-sparkles"
          />
          <UButton
            label="Loading"
            loading
          />
          <UButton
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            aria-label="Delete"
          />
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <UBadge label="New" />
          <UBadge
            label="Success"
            color="success"
            variant="subtle"
          />
          <UBadge
            label="Warning"
            color="warning"
            variant="outline"
          />
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Overlays & feedback
          </h2>
        </template>

        <div class="flex flex-wrap gap-2">
          <UModal
            v-model:open="modalOpen"
            title="Example modal"
            description="Close with Esc, the X button or by clicking outside."
          >
            <UButton label="Open modal" />
            <template #body>
              <p>Modal content goes here.</p>
            </template>
            <template #footer>
              <UButton
                label="Close"
                color="neutral"
                variant="outline"
                @click="modalOpen = false"
              />
            </template>
          </UModal>

          <UButton
            label="Show toast"
            color="neutral"
            variant="subtle"
            @click="showToast"
          />

          <UDropdownMenu :items="menuItems">
            <UButton
              label="Menu"
              color="neutral"
              variant="subtle"
              trailing-icon="i-lucide-chevron-down"
            />
          </UDropdownMenu>

          <UTooltip text="Tooltips work on any element">
            <UButton
              icon="i-lucide-info"
              color="neutral"
              variant="ghost"
              aria-label="Info"
            />
          </UTooltip>
        </div>

        <p class="mt-3 text-sm text-muted">
          Shortcut: press <UKbd value="M" /> to open the modal.
        </p>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Tabs
          </h2>
        </template>

        <UTabs
          :items="tabs"
          class="w-full"
        >
          <template #account>
            <p class="pt-2 text-sm">
              Account settings would go here.
            </p>
          </template>
          <template #password>
            <p class="pt-2 text-sm">
              Password settings would go here.
            </p>
          </template>
        </UTabs>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Color mode
          </h2>
        </template>

        <div class="flex flex-wrap items-center gap-4">
          <UColorModeSelect />
          <UColorModeSwitch />
        </div>
        <!-- The active mode is only known in the browser — render client-side to avoid a hydration mismatch -->
        <ClientOnly>
          <p class="mt-3 text-sm text-muted">
            Preference: <code>{{ colorMode.preference }}</code>, active: <code>{{ colorMode.value }}</code>
          </p>
        </ClientOnly>
      </UCard>

      <div class="space-y-3 lg:col-span-2">
        <UAlert
          title="Heads up"
          description="Alerts support a title, description, icon, actions and every theme color."
          icon="i-lucide-info"
          variant="subtle"
        />
        <UAlert
          title="Something went wrong"
          icon="i-lucide-circle-alert"
          color="error"
          variant="subtle"
        />
      </div>

      <UCard class="lg:col-span-2">
        <template #header>
          <h2 class="font-semibold">
            Icons
          </h2>
        </template>

        <!-- Any Iconify icon works; lucide + simple-icons are installed locally (see package.json) -->
        <div class="flex flex-wrap items-center gap-4 text-2xl">
          <UIcon name="i-lucide-house" />
          <UIcon
            name="i-lucide-heart"
            class="text-error"
          />
          <UIcon
            name="i-lucide-star"
            class="text-warning"
          />
          <UIcon
            name="i-lucide-check-circle"
            class="text-success"
          />
          <UIcon name="i-simple-icons-github" />
          <UIcon
            name="i-simple-icons-nuxtdotjs"
            class="text-primary"
          />
        </div>
        <p class="mt-3 text-sm text-muted">
          Find icon names at <ULink
            to="https://icones.js.org/collection/lucide"
            target="_blank"
          >icones.js.org</ULink>.
        </p>
      </UCard>
    </div>
  </ExamplePage>
</template>
