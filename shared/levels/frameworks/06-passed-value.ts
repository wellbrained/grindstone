// Framework deep dives 2.3: delivery is never free. Jonas's composable `useDeliveryFee(amount)` takes a number, a ref
// or a getter (it reads it with toValue), and the basket calls it with `total.value`: the number the total had when the
// basket was set up. The fee never sees the total grow. Learn: pass the ref (or a getter) to a composable, never its
// `.value`.
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from '../web/checks'
import { MENU_SOURCE, VUE_PAGE, shows, vueSite } from './site'
import type { FrameworksScenario } from './types'

/** The call that hands over the number; the fix hands over the ref. */
export const CALL = '    const fee = useDeliveryFee(total.value)'

const DELIVERY = `// Delivery (Maya's rule): free from 10 €, else 3.50 €.
// \`amount\` can be a number, a ref or a getter: toValue reads any of them.
import { computed, toValue } from 'vue'

export function useDeliveryFee(amount) {
  return computed(() => toValue(amount) >= 10 ? 0 : 3.5)
}
`

const APP = `// The basket with delivery (Jonas): free delivery from 10 €.
import { computed, createApp, reactive } from 'vue'
import { formatPrice } from './money.js'
import { MENU } from './menu.js'
import { useDeliveryFee } from './delivery.js'

const App = {
  name: 'Basket',
  setup() {
    const basket = reactive({ lines: [] })
    const total = computed(() => basket.lines.reduce((sum, line) => sum + line.price * line.quantity, 0))
${CALL}
    function add(item) {
      const line = basket.lines.find(each => each.id === item.id)
      if (line) line.quantity += 1
      else basket.lines.push({ ...item, quantity: 1 })
    }
    return { menu: MENU, total, fee, add, formatPrice }
  },
  template: \`
    <ul class="products">
      <li v-for="item in menu" :key="item.id" class="product">
        <span class="photo"></span>
        <span><span class="name">{{ item.name }}</span><span class="price">{{ formatPrice(item.price) }} €</span></span>
        <button class="add" type="button" :id="'add-' + item.id" @click="add(item)">Add</button>
      </li>
    </ul>
    <section class="box">
      <p id="subtotal">Items {{ formatPrice(total) }} €</p>
      <p id="fee">Delivery {{ fee === 0 ? 'free' : formatPrice(fee) + ' €' }}</p>
    </section>
  \`
}

createApp(App).mount('#app')
`

export const passedValue: FrameworksScenario = {
  id: 'frameworks-06-passed-value',
  track: 'frameworks',
  kind: 'scenario',
  title: 'Delivery is never free',
  difficulty: 2,
  minutes: 6,
  teaches: 'passing .value',
  story: [
    'Maya\'s rule: delivery is free from 10 €. Jonas wrote it as a composable, `useDeliveryFee`, which takes a number, a ref or a getter. Lena adds two rye loaves: “Items 10.00 €”, and still “Delivery 3.50 €”.',
    'Predict what the delivery line shows. Then fix `app.js` so delivery is 3.50 € under 10 € and free from 10 €. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'fee',
      form: 'one',
      prompt: 'The basket calls `useDeliveryFee(total.value)` in setup, when the basket is empty. `useDeliveryFee` returns `computed(() => toValue(amount) >= 10 ? 0 : 3.5)`. Lena adds two rye loaves (10 €). What does the delivery line show?',
      options: [
        { id: 'free', text: '“Delivery free”: `toValue` reads the total each time.' },
        { id: 'fee', text: '“Delivery 3.50 €”: `total.value` was 0 when setup ran; the composable got that number, and `toValue(0)` stays 0.', fact: shows('fee', 'Delivery 3.50 €') },
        { id: 'warn', text: '“Delivery 3.50 €”, and Vue warns that a composable got a plain number.' },
        { id: 'nan', text: '“Delivery NaN €”: a number can\'t be compared after the basket changed.' }
      ],
      answer: 'fee',
      rule: '`.value` is a read: passing it hands over the number of that moment. Pass the ref itself, or a getter (`() => total.value`), and let the composable read it inside its computed.'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: [
      { id: 'small', steps: [{ click: '#add-croissant' }, { text: '#fee' }] },
      { id: 'fee', steps: [{ click: '#add-rye' }, { click: '#add-rye' }, { text: '#fee' }] },
      { id: 'subtotal', steps: [{ text: '#subtotal' }] }
    ]
  },
  setup: () => ({ files: vueSite('Basket', { 'app.js': APP, 'delivery.js': DELIVERY, 'menu.js': MENU_SOURCE }), observed: null, picked: null }),
  goals: [
    predictedGoal('Predict what the delivery line shows', 1),
    probesGoal('fee', 'Delivery costs 3.50 € under 10 € and is free from 10 €', { small: 'Delivery 3.50 €', fee: 'Delivery free', subtotal: 'Items 12.40 €' }, { clean: true })
  ],
  hints: [
    'Read `delivery.js`: the computed reads `toValue(amount)` every time it runs. What is `amount` when the basket calls it?',
    '`total.value` reads the total once, in setup, when it is 0. The composable got the number 0, and `toValue(0)` is 0 forever. Nothing reactive was read, so the computed never runs again.',
    'In `app.js`, line 12, hand over the ref: `const fee = useDeliveryFee(total)`. Save, then Reload.'
  ],
  debrief: {
    title: 'Pass the ref, not its value',
    paragraphs: [
      '`total` is a computed ref; `total.value` is what it holds right now. Writing `useDeliveryFee(total.value)` reads it once and passes a number, so the composable could only ever compare 0 with 10. `toValue` is there to accept a ref or a getter as well as a plain value; given a plain value it can only return it.',
      'Pass the ref (`useDeliveryFee(total)`) or a getter (`useDeliveryFee(() => total.value)`), and read it inside the computed with `toValue`. A getter is handy for something that isn\'t a ref yet: `useDeliveryFee(() => basket.lines.length * 2.5)` or `() => props.amount`.',
      'It is the same rule as destructuring: the moment you read a value out (`.value`, `props.x`, `const { x } = …`) outside a computed, a watcher or the template, you hold a copy.'
    ]
  },
  solution: [
    { predict: 'fee' },
    { save: 'app.js', replace: [CALL, '    const fee = useDeliveryFee(total)'] },
    'reload'
  ]
}
