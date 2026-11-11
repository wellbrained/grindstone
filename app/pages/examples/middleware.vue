<script setup lang="ts">
definePageMeta({
  example: {
    title: 'Middleware',
    description: 'A route guard that runs before rendering and redirects when you are not "logged in".',
    icon: 'i-lucide-shield',
    order: 5
  }
})

// This page is public. /examples/protected uses the `example-auth` middleware,
// which redirects back here (with ?redirect=…) when you are not logged in.
const route = useRoute()
const { loggedIn, login, logout } = useExampleSession()

const redirectedFrom = computed(() => typeof route.query.redirect === 'string' ? route.query.redirect : undefined)

async function loginAndContinue() {
  login()
  await navigateTo(redirectedFrom.value ?? '/examples/protected')
}
</script>

<template>
  <ExamplePage
    docs="https://nuxt.com/docs/guide/directory-structure/middleware"
    :files="[
      'app/pages/examples/middleware.vue',
      'app/pages/examples/protected.vue',
      'app/middleware/example-auth.ts',
      'app/composables/useExampleSession.ts'
    ]"
  >
    <UCard class="max-w-xl">
      <UAlert
        v-if="redirectedFrom && !loggedIn"
        title="You were redirected"
        :description="`The middleware blocked ${redirectedFrom} because you are not logged in.`"
        color="warning"
        variant="subtle"
        icon="i-lucide-shield-alert"
        class="mb-4"
      />

      <p class="mb-4">
        Status:
        <UBadge
          :label="loggedIn ? 'Logged in' : 'Logged out'"
          :color="loggedIn ? 'success' : 'neutral'"
          variant="subtle"
        />
      </p>

      <div class="flex flex-wrap gap-2">
        <UButton
          to="/examples/protected"
          label="Open protected page"
          icon="i-lucide-lock"
          color="neutral"
          variant="outline"
        />
        <UButton
          v-if="!loggedIn"
          label="Log in (demo)"
          icon="i-lucide-log-in"
          @click="loginAndContinue"
        />
        <UButton
          v-else
          label="Log out"
          icon="i-lucide-log-out"
          color="neutral"
          variant="subtle"
          @click="logout"
        />
      </div>
    </UCard>
  </ExamplePage>
</template>
