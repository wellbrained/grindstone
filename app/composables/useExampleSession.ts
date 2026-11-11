// Demo "session" stored in a cookie so it works on the server and the client.
// Replace with real auth (e.g. nuxt-auth-utils) in a real project.
export function useExampleSession() {
  const session = useCookie<boolean>('example-session', { default: () => false })

  return {
    loggedIn: computed(() => session.value),
    login: () => { session.value = true },
    logout: () => { session.value = false }
  }
}
