// GET /api/examples/config — shows how to read runtime config on the server.
// Private keys (outside `public`) are only available here, never in the browser.
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)

  return {
    // Never return the secret itself — only whether it is set
    exampleSecretIsSet: config.exampleSecret.length > 0
  }
})
