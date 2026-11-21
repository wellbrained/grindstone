// Other edits a player may make to a Framework deep dives level: real fixes the goals must accept (the ones the debriefs
// name among them), and tempting non-fixes they must reject (the page made to render some other way, a comparison that
// still compares identities). The unit tests check that every edit applies to the level's files;
// e2e/frameworks-levels.spec.ts runs them with real Vue in a real browser.

export interface OtherFix {
  /** What the edit does, for the test's message. */
  name: string
  /** Applied in order to the starting files, like a solution's save steps. */
  edits: { save: string, replace: readonly [string, string] }[]
  /** True: every goal passes after a reload (the prediction answered); false: not every goal does. */
  solves: boolean
}

const app = (from: string, to: string) => ({ save: 'app.js', replace: [from, to] as const })

export const otherFixes: Record<string, OtherFix[]> = {
  'frameworks-01-raw-basket': [
    { name: 'one reactive basket, no original kept', solves: true, edits: [app('const basket = { lines: [] }\nconst state = reactive(basket)', 'const state = reactive({ lines: [] })'), app('  const lines = basket.lines', '  const lines = state.lines')] },
    { name: 'basket itself made reactive (the same name for both)', solves: true, edits: [app('const basket = { lines: [] }\nconst state = reactive(basket)', 'const basket = reactive({ lines: [] })\nconst state = basket')] },
    { name: '$forceUpdate after changing the original (the counter\'s computed never hears of it)', solves: false, edits: [app('createApp(App).mount(\'#app\')', 'vm = createApp(App).mount(\'#app\')'), app('// the basket\'s data', 'let vm\n// the basket\'s data'), app('  console.log(\'Added\', item.name)', '  console.log(\'Added\', item.name)\n  vm.$forceUpdate()')] }
  ],
  'frameworks-02-replaced-basket': [
    { name: 'splice(0) on the same array', solves: true, edits: [app('  basket = reactive({ lines: [] })', '  basket.lines.splice(0)')] },
    { name: 'length = 0 on the same array', solves: true, edits: [app('  basket = reactive({ lines: [] })', '  basket.lines.length = 0')] },
    { name: 'a local variable emptied instead', solves: false, edits: [app('  basket = reactive({ lines: [] })', '  let lines = basket.lines\n  lines = []')] }
  ],
  'frameworks-03-special-proxy': [
    { name: 'toRaw(item) === SPECIAL', solves: true, edits: [app('import { createApp, reactive } from \'vue\'', 'import { createApp, reactive, toRaw } from \'vue\''), app('      return item === SPECIAL', '      return toRaw(item) === SPECIAL')] },
    { name: 'the special taken from the reactive menu', solves: true, edits: [app('      return item === SPECIAL', '      return item === menu[2]')] },
    { name: 'loose equality (==)', solves: false, edits: [app('      return item === SPECIAL', '      return item == SPECIAL')] },
    { name: 'Object.is', solves: false, edits: [app('      return item === SPECIAL', '      return Object.is(item, SPECIAL)')] }
  ],
  'frameworks-04-destructured-props': [
    { name: 'toRefs(props), read with .value', solves: true, edits: [{ save: 'line-total.js', replace: ['    const { price, quantity } = props\n    const total = computed(() => formatPrice(price * quantity))', '    const { price, quantity } = toRefs(props)\n    const total = computed(() => formatPrice(price.value * quantity.value))'] }, { save: 'line-total.js', replace: ['import { computed } from \'vue\'', 'import { computed, toRefs } from \'vue\''] }] },
    { name: 'the destructuring moved inside the computed', solves: true, edits: [{ save: 'line-total.js', replace: ['    const { price, quantity } = props\n    const total = computed(() => formatPrice(price * quantity))', '    const total = computed(() => {\n      const { price, quantity } = props\n      return formatPrice(price * quantity)\n    })'] }] },
    { name: 'a method that multiplies the copies on every render', solves: false, edits: [{ save: 'line-total.js', replace: ['    const total = computed(() => formatPrice(price * quantity))', '    const total = () => formatPrice(price * quantity)'] }, { save: 'line-total.js', replace: ['{{ total }} €', '{{ total() }} €'] }] }
  ],
  'frameworks-05-frozen-badge': [
    { name: 'the store kept whole, count read from it', solves: true, edits: [{ save: 'header.js', replace: ['    const { count } = useBasket()\n    return { count }', '    const basket = useBasket()\n    return { basket }'] }, { save: 'header.js', replace: ['Basket ({{ count }})', 'Basket ({{ basket.count }})'] }] },
    { name: 'a computed over the store', solves: true, edits: [{ save: 'header.js', replace: ['    const { count } = useBasket()', '    const basket = useBasket()\n    const count = computed(() => basket.count)'] }, { save: 'header.js', replace: ['import { useBasket } from \'./store.js\'', 'import { computed } from \'vue\'\nimport { useBasket } from \'./store.js\''] }] },
    { name: 'the store spread into what setup returns', solves: false, edits: [{ save: 'header.js', replace: ['    const { count } = useBasket()\n    return { count }', '    return { ...useBasket() }'] }] },
    { name: 'a ref made from the count once', solves: false, edits: [{ save: 'header.js', replace: ['    const { count } = useBasket()', '    const count = ref(useBasket().count)'] }, { save: 'header.js', replace: ['import { useBasket } from \'./store.js\'', 'import { ref } from \'vue\'\nimport { useBasket } from \'./store.js\''] }] }
  ],
  'frameworks-06-passed-value': [
    { name: 'a getter', solves: true, edits: [{ save: 'app.js', replace: ['    const fee = useDeliveryFee(total.value)', '    const fee = useDeliveryFee(() => total.value)'] }] },
    { name: 'a ref of the total made once', solves: false, edits: [{ save: 'app.js', replace: ['    const fee = useDeliveryFee(total.value)', '    const fee = useDeliveryFee(ref(total.value))'] }, { save: 'app.js', replace: ['import { computed, createApp, reactive } from \'vue\'', 'import { computed, createApp, reactive, ref } from \'vue\''] }] }
  ],
  'frameworks-07-plain-setting': [
    { name: 'the setting as a ref', solves: true, edits: [{ save: 'settings.js', replace: ['export const settings = { takeaway: true }', 'import { ref } from \'vue\'\nexport const takeaway = ref(true)\nexport const settings = { get takeaway() { return takeaway.value }, set takeaway(value) { takeaway.value = value } }'] }] },
    { name: 'a method instead of the computed (renders only by luck)', solves: false, edits: [{ save: 'app.js', replace: ['    const total = computed(() => net.value * (settings.takeaway ? 1.07 : 1.19))', '    const total = () => net.value * (settings.takeaway ? 1.07 : 1.19)'] }, { save: 'app.js', replace: ['{{ formatPrice(total) }} € with VAT', '{{ formatPrice(total()) }} € with VAT'] }] }
  ],
  'frameworks-08-sorting-computed': [
    { name: 'toSorted', solves: true, edits: [{ save: 'app.js', replace: ['basket.lines.sort((a, b) => a.price - b.price)', 'basket.lines.toSorted((a, b) => a.price - b.price)'] }] },
    { name: 'slice() before sorting', solves: true, edits: [{ save: 'app.js', replace: ['basket.lines.sort((a, b) => a.price - b.price)', 'basket.lines.slice().sort((a, b) => a.price - b.price)'] }] },
    { name: 'sorting a copy of the proxy object, not the array (Object.assign keeps the array)', solves: false, edits: [{ save: 'app.js', replace: ['basket.lines.sort((a, b) => a.price - b.price)', 'Object.assign({}, basket).lines.sort((a, b) => a.price - b.price)'] }] }
  ],
  'frameworks-09-readonly-computed': [
    { name: 'v-model on the line itself', solves: true, edits: [{ save: 'app.js', replace: ['v-model.number="quantity"', 'v-model.number="line.quantity"'] }] },
    { name: 'a ref copied from the line once', solves: false, edits: [{ save: 'app.js', replace: ['    const quantity = computed(() => line.quantity)', '    const quantity = ref(line.quantity)'] }, { save: 'app.js', replace: ['import { computed, createApp, reactive } from \'vue\'', 'import { computed, createApp, reactive, ref } from \'vue\''] }] }
  ],
  'frameworks-10-watch-source': [
    { name: 'toRef(stock, \'croissant\')', solves: true, edits: [app('    watch(stock.croissant, (left) => {', '    watch(toRef(stock, \'croissant\'), (left) => {'), app('import { createApp, reactive, ref, watch } from \'vue\'', 'import { createApp, reactive, ref, toRef, watch } from \'vue\'')] },
    { name: 'a ref made from the number once', solves: false, edits: [app('    watch(stock.croissant, (left) => {', '    watch(ref(stock.croissant), (left) => {')] }
  ],
  'frameworks-11-shallow-watch': [
    { name: 'deep: 2', solves: true, edits: [app('    })\n    const add', '    }, { deep: 2 })\n    const add')] },
    { name: 'deep: 1 (looks at the object\'s own properties, not into the list)', solves: false, edits: [app('    })\n    const add', '    }, { deep: 1 })\n    const add')] },
    { name: 'the object inside watched (lost when Clear replaces it)', solves: false, edits: [app('    watch(basket, (now) => {', '    watch(basket.value, (now) => {')] }
  ],
  'frameworks-12-stale-search': [
    { name: 'the callback\'s onCleanup', solves: true, edits: [app('    watch(query, async (query) => {\n      results.value = await searchMenu(query)', '    watch(query, async (query, old, onCleanup) => {\n      let stale = false\n      onCleanup(() => { stale = true })\n      const found = await searchMenu(query)\n      if (!stale) results.value = found')] },
    { name: 'the answer kept only for what is in the field now', solves: true, edits: [app('    watch(query, async (query) => {\n      results.value = await searchMenu(query)', '    watch(query, async (asked) => {\n      const found = await searchMenu(asked)\n      if (asked === query.value) results.value = found'), app('console.log(\'Results for\', JSON.stringify(query))', 'console.log(\'Results for\', JSON.stringify(asked))')] },
    { name: 'the results emptied before each search', solves: false, edits: [app('      results.value = await searchMenu(query)', '      results.value = []\n      results.value = await searchMenu(query)')] }
  ],
  'frameworks-13-old-dom': [
    { name: 'nextTick with a callback', solves: true, edits: [app('      document.querySelector(\'#line-\' + item.id).classList.add(\'new\')', '      nextTick(() => document.querySelector(\'#line-\' + item.id).classList.add(\'new\'))'), app('import { createApp, reactive } from \'vue\'', 'import { createApp, nextTick, reactive } from \'vue\'')] },
    { name: 'the lookup guarded with ?. (no error, no flash)', solves: false, edits: [app('      document.querySelector(\'#line-\' + item.id).classList.add(\'new\')', '      document.querySelector(\'#line-\' + item.id)?.classList.add(\'new\')')] },
    { name: 'await Promise.resolve() (a microtask queued after Vue\'s render job, so after the render)', solves: true, edits: [app('    function add(item) {', '    async function add(item) {'), app('      document.querySelector(\'#line-\' + item.id).classList.add(\'new\')', '      await Promise.resolve()\n      document.querySelector(\'#line-\' + item.id).classList.add(\'new\')')] }
  ],
  'frameworks-14-batched-history': [
    { name: 'the history written where the quantity changes', solves: true, edits: [app('      for (let i = 0; i < 3; i++) quantity.value++', '      for (let i = 0; i < 3; i++) { history.push(quantity.value); undoing = true; quantity.value++ }')] },
    { name: 'deep: true (still one run per batch)', solves: false, edits: [app('    })\n    function plusThree', '    }, { deep: true })\n    function plusThree')] }
  ],
  'frameworks-15-chart-behind': [
    { name: 'watchPostEffect', solves: true, edits: [app('    watch(() => orders.length, () => drawChart(\'#orders\', \'#chart\'))', '    watchPostEffect(() => { orders.length; drawChart(\'#orders\', \'#chart\') })'), app('import { createApp, reactive, watch } from \'vue\'', 'import { createApp, reactive, watch, watchPostEffect } from \'vue\'')] },
    { name: 'nextTick inside the watcher', solves: true, edits: [app('() => drawChart(\'#orders\', \'#chart\'))', '() => nextTick(() => drawChart(\'#orders\', \'#chart\')))'), app('import { createApp, reactive, watch } from \'vue\'', 'import { createApp, nextTick, reactive, watch } from \'vue\'')] },
    { name: 'flush: \'sync\' (even earlier)', solves: false, edits: [app('    watch(() => orders.length, () => drawChart(\'#orders\', \'#chart\'))', '    watch(() => orders.length, () => drawChart(\'#orders\', \'#chart\'), { flush: \'sync\' })')] }
  ],
  'frameworks-16-shallow-menu': [
    { name: 'triggerRef after the change', solves: true, edits: [app('      console.log(\'Sold out:\', id)', '      triggerRef(catalogue)\n      console.log(\'Sold out:\', id)'), app('import { createApp, shallowRef } from \'vue\'', 'import { createApp, shallowRef, triggerRef } from \'vue\'')] },
    { name: 'the same array assigned again (no change to shallowRef)', solves: false, edits: [app('      console.log(\'Sold out:\', id)', '      catalogue.value = catalogue.value\n      console.log(\'Sold out:\', id)')] }
  ],
  'frameworks-17-private-fields': [
    { name: 'a ref of the instance (a ref is deep too: the same error)', solves: false, edits: [app('    const basket = reactive(new Basket())\n    function add(item) {\n      basket.add(item)', '    const basket = ref(new Basket())\n    function add(item) {\n      basket.value.add(item)'), app('import { createApp, reactive } from \'vue\'', 'import { createApp, reactive, ref } from \'vue\'')] },
    { name: 'markRaw alone (no error, but the page never follows)', solves: false, edits: [app('    const basket = reactive(new Basket())', '    const basket = reactive(markRaw(new Basket()))'), app('import { createApp, reactive } from \'vue\'', 'import { createApp, markRaw, reactive } from \'vue\'')] }
  ],
  'frameworks-18-readonly-prop': [
    { name: 'a defineEmits-style emit from setup', solves: true, edits: [{ save: 'picker.js', replace: ['  emits: [\'update:quantity\'],', '  emits: [\'update:quantity\'],\n  setup(props, { emit }) {\n    return { more: () => emit(\'update:quantity\', props.quantity + 1) }\n  },'] }, { save: 'picker.js', replace: ['@click="quantity++"', '@click="more"'] }] },
    { name: 'a local copy the child changes (the parent never hears)', solves: false, edits: [{ save: 'picker.js', replace: ['  emits: [\'update:quantity\'],', '  emits: [\'update:quantity\'],\n  data() {\n    return { own: this.quantity }\n  },'] }, { save: 'picker.js', replace: ['@click="quantity++"', '@click="own++"'] }, { save: 'picker.js', replace: ['<span class="out" id="picked">{{ quantity }}</span>', '<span class="out" id="picked">{{ own }}</span>'] }] }
  ]
}
