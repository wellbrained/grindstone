// Composables in `app/composables/` are auto-imported everywhere in the app.
// `useState` creates SSR-safe state shared by every component that uses the same key —
// a lightweight alternative to Pinia for simple global state.
export function useExampleCounter() {
  const count = useState('example-counter', () => 0)

  const double = computed(() => count.value * 2)

  function increment() {
    count.value++
  }

  function reset() {
    count.value = 0
  }

  return { count, double, increment, reset }
}
