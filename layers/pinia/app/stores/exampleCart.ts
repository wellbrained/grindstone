// Setup-style store (recommended): state = refs, getters = computed, actions = functions.
// Auto-imported as `useExampleCartStore()` everywhere in the app.
export interface CartItem {
  id: number
  name: string
  price: number
  quantity: number
}

export const useExampleCartStore = defineStore('example-cart', () => {
  const items = ref<CartItem[]>([])

  const count = computed(() => items.value.reduce((sum, item) => sum + item.quantity, 0))
  const total = computed(() => items.value.reduce((sum, item) => sum + item.price * item.quantity, 0))

  function add(product: Omit<CartItem, 'quantity'>) {
    const existing = items.value.find(item => item.id === product.id)
    if (existing) {
      existing.quantity++
    } else {
      items.value.push({ ...product, quantity: 1 })
    }
  }

  function remove(id: number) {
    items.value = items.value.filter(item => item.id !== id)
  }

  function clear() {
    items.value = []
  }

  return { items, count, total, add, remove, clear }
})
