// Framework deep dives 1.1: the basket that never fills. Jonas makes the basket reactive (`state = reactive(basket)`)
// but `add` keeps changing `basket`, the original object. The data changes; nothing tells Vue, so nothing renders.
// Learn: reactive() returns a proxy; only changes made through the proxy are tracked. Keep one name for the data, the
// reactive one.
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from '../web/checks'
import { MENU_SOURCE, VUE_PAGE, shows, vueSite } from './site'
import type { FrameworksScenario } from './types'

/** The line that changes the original object; the fix changes the proxy. */
export const RAW_ADD = '  const lines = basket.lines'

const APP = `// The basket (Jonas): today's menu, Add buttons, and Lena's basket below.
import { computed, createApp, reactive } from 'vue'
import { formatPrice } from './money.js'
import { MENU } from './menu.js'

// the basket's data, and the reactive basket the page reads
const basket = { lines: [] }
const state = reactive(basket)

function add(item) {
${RAW_ADD}
  const line = lines.find(each => each.id === item.id)
  if (line) line.quantity += 1
  else lines.push({ id: item.id, name: item.name, price: item.price, quantity: 1 })
  console.log('Added', item.name)
}

const App = {
  name: 'Basket',
  setup() {
    const count = computed(() => state.lines.reduce((sum, line) => sum + line.quantity, 0))
    const total = computed(() => state.lines.reduce((sum, line) => sum + line.price * line.quantity, 0))
    return { menu: MENU, state, add, count, total, formatPrice }
  },
  template: \`
    <p class="cart" id="count">Basket ({{ count }})</p>
    <ul class="products">
      <li v-for="item in menu" :key="item.id" class="product">
        <span class="photo"></span>
        <span><span class="name">{{ item.name }}</span><span class="price">{{ formatPrice(item.price) }} €</span></span>
        <button class="add" type="button" :id="'add-' + item.id" @click="add(item)">Add</button>
      </li>
    </ul>
    <section class="box" id="basket">
      <h2>Your basket</h2>
      <p v-if="!state.lines.length" class="note">Your basket is empty.</p>
      <p v-for="line in state.lines" :key="line.id" class="line">
        <span>{{ line.quantity }} × {{ line.name }}</span><span>{{ formatPrice(line.price * line.quantity) }} €</span>
      </p>
      <p><strong>Total {{ formatPrice(total) }} €</strong></p>
    </section>
  \`
}

createApp(App).mount('#app')
`

export const FILLED = 'Your basket2 × Butter croissant4.80 €1 × Rye loaf5.00 €Total 9.80 €'
export const EMPTY = 'Your basketYour basket is empty.Total 0.00 €'

export const rawBasket: FrameworksScenario = {
  id: 'frameworks-01-raw-basket',
  track: 'frameworks',
  kind: 'scenario',
  title: 'The basket that never fills',
  difficulty: 1,
  minutes: 5,
  teaches: 'proxy',
  story: [
    'Jonas is moving the shop\'s basket to Vue. He keeps the data in a plain object, `basket`, and gives the page `state = reactive(basket)`, so the page updates when the basket changes. Lena taps Add on a croissant. Nothing happens. The Console says “Added Butter croissant”.',
    'Predict what the basket shows. Then fix `app.js` so every Add shows up, in the basket and in the counter at the top. Save, then Reload: the Reactivity panel shows each time Vue rendered, and why.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'basket',
      form: 'one',
      prompt: 'Lena taps Add on the croissant twice and on the rye loaf once. `add` pushes the lines into `basket.lines`, the object `reactive()` was given. What does the basket show?',
      options: [
        { id: 'filled', text: 'Two croissants and a rye loaf, 9.80 €: `state` and `basket` are the same object.' },
        { id: 'warns', text: 'A Vue warning in the Console that `basket` is not reactive, and nothing on the page.' },
        { id: 'last', text: 'Only the rye loaf: Vue renders once, for the last change.' },
        { id: 'empty', text: '“Your basket is empty.”: the lines are in the object, but only a change made through the proxy `state` tells Vue to render again.', fact: shows('basket', EMPTY) }
      ],
      answer: 'empty',
      rule: '`reactive(obj)` returns a proxy that tracks reads and triggers on writes; the original object changes the same data without telling anyone.'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: [
      { id: 'basket', steps: [{ click: '#add-croissant' }, { click: '#add-croissant' }, { click: '#add-rye' }, { text: '#basket' }] },
      { id: 'count', steps: [{ text: '#count' }] },
      // and Vue rendered it: a page that writes the basket itself is no fix
      { id: 'renders', steps: [{ click: '#add-bun' }, { reactions: 'render Basket' }] },
      { id: 'after', steps: [{ text: '#count' }] }
    ]
  },
  setup: () => ({ files: vueSite('Basket', { 'app.js': APP, 'menu.js': MENU_SOURCE }), observed: null, picked: null }),
  goals: [
    predictedGoal('Predict what the basket shows', 1),
    probesGoal('basket', 'Every Add shows up in the basket and in the counter, rendered by Vue', { basket: FILLED, count: 'Basket (3)', renders: { atLeast: 1 }, after: 'Basket (4)' }, { clean: true })
  ],
  hints: [
    'Open the Reactivity panel and tap Add: does the Basket render at all after a tap? The Console says `add` ran.',
    '`state` is a proxy around `basket`. Vue only hears about changes made through the proxy; `basket.lines.push(…)` changes the same array behind Vue\'s back.',
    'In `add`, line 11, take the lines from the proxy: `const lines = state.lines`. Save, then Reload.'
  ],
  debrief: {
    title: 'Only the proxy tells Vue',
    paragraphs: [
      '`reactive(basket)` doesn\'t make `basket` reactive: it returns a new object, a Proxy, that reads and writes the same data. Each read through the proxy is tracked (the render and the computeds note what they read), and each write through it triggers what read it. `basket.lines.push(…)` writes the same array, but not through the proxy, so the data changed and nobody was told. The Console line ran; the page never rendered again.',
      'It gets worse the moment something else renders: then the template reads the changed array and shows the lines, while a computed that cached its result (the counter) still shows the old number. Bugs like that look random. Keep one name for the data, the reactive one (`const basket = reactive({ lines: [] })`), and never keep the original around.',
      'The same holds for anything you hand to `reactive()`: an object from an API, a store\'s state, a class instance. If code elsewhere keeps a reference to the original and changes it, Vue never hears of it.'
    ]
  },
  solution: [
    { predict: 'empty' },
    { save: 'app.js', replace: [RAW_ADD, '  const lines = state.lines'] },
    'reload'
  ]
}
