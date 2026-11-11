<script setup lang="ts">
// Only reachable when the `example-auth` middleware allows it.
definePageMeta({
  middleware: 'example-auth'
})

const { logout } = useExampleSession()

async function logoutAndLeave() {
  logout()
  await navigateTo('/examples/middleware')
}
</script>

<template>
  <ExamplePage
    title="Protected page"
    description="You can see this because the example-auth middleware let you through."
    :files="['app/pages/examples/protected.vue', 'app/middleware/example-auth.ts']"
  >
    <UButton
      label="Log out"
      icon="i-lucide-log-out"
      color="neutral"
      variant="subtle"
      @click="logoutAndLeave"
    />
  </ExamplePage>
</template>
