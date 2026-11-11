<script setup lang="ts">
definePageMeta({
  example: {
    title: 'Pinia (layer)',
    description: 'A typed global store with state, getters and actions. Provided by layers/pinia — remove the folder to drop Pinia.',
    icon: 'i-lucide-shopping-cart',
    order: 20
  }
})

const cart = useExampleCartStore()

// storeToRefs keeps reactivity when destructuring state/getters (actions can be destructured directly)
const { items, count, total } = storeToRefs(cart)

const products = [
  { id: 1, name: 'Keyboard', price: 89 },
  { id: 2, name: 'Mouse', price: 39 },
  { id: 3, name: 'Monitor', price: 249 }
]

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
</script>

<template>
  <ExamplePage
    docs="https://pinia.vuejs.org/core-concepts/"
    :files="['layers/pinia/app/pages/examples/pinia.vue', 'layers/pinia/app/stores/exampleCart.ts', 'layers/pinia/nuxt.config.ts']"
  >
    <div class="grid gap-6 lg:grid-cols-2">
      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Products
          </h2>
        </template>

        <ul class="space-y-2">
          <li
            v-for="product in products"
            :key="product.id"
            class="flex items-center justify-between"
          >
            <span>{{ product.name }} — {{ currency.format(product.price) }}</span>
            <UButton
              label="Add"
              icon="i-lucide-plus"
              size="sm"
              @click="cart.add(product)"
            />
          </li>
        </ul>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold">
              Cart
            </h2>
            <UBadge
              :label="`${count} items`"
              variant="subtle"
            />
          </div>
        </template>

        <p
          v-if="!items.length"
          class="text-sm text-muted"
        >
          The cart is empty. State survives navigation — add items, visit another page, come back.
        </p>

        <ul
          v-else
          class="space-y-2"
        >
          <li
            v-for="item in items"
            :key="item.id"
            class="flex items-center justify-between"
          >
            <span>{{ item.quantity }} × {{ item.name }}</span>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="`Remove ${item.name}`"
              @click="cart.remove(item.id)"
            />
          </li>
        </ul>

        <template #footer>
          <div class="flex items-center justify-between">
            <span class="font-semibold">Total: {{ currency.format(total) }}</span>
            <UButton
              label="Clear"
              color="neutral"
              variant="outline"
              size="sm"
              :disabled="!items.length"
              @click="cart.clear()"
            />
          </div>
        </template>
      </UCard>
    </div>
  </ExamplePage>
</template>
