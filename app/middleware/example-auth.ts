// Named route middleware: runs before navigating to any page that declares
// `definePageMeta({ middleware: 'example-auth' })`.
// Name a file `*.global.ts` instead to run it on every route.
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useExampleSession()

  if (!loggedIn.value) {
    return navigateTo({ path: '/examples/middleware', query: { redirect: to.fullPath } })
  }
})
