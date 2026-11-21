// Framework deep dives 1.2: Clear basket clears nothing. Jonas empties the basket by giving the variable a new reactive
// object; the template still holds the old one, so the lines stay, and what is added afterwards goes into an object no
// template shows. Learn: the template holds the object setup returned; change that object (or a ref's `.value`), never
// the variable that once pointed at it.
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from '../web/checks'
import { MENU_SOURCE, VUE_PAGE, shows, vueSite } from './site'
import type { FrameworksScenario } from './types'

/** The clear that replaces the object; the fix empties the same one. */
export const REPLACE = '  basket = reactive({ lines: [] })'

const APP = `// The basket (Jonas): Lena's basket from yesterday, Add buttons, and Clear basket.
import { createApp, reactive } from 'vue'
import { formatPrice } from './money.js'
import { MENU } from './menu.js'

// Lena kept two croissants in her basket since yesterday
let basket = reactive({ lines: [{ id: 'croissant', name: 'Butter croissant', price: 2.4, quantity: 2 }] })

function add(item) {
  const line = basket.lines.find(each => each.id === item.id)
  if (line) line.quantity += 1
  else basket.lines.push({ id: item.id, name: item.name, price: item.price, quantity: 1 })
}

function clear() {
${REPLACE}
  console.log('Basket cleared')
}

const App = {
  name: 'Basket',
  setup() {
    return { menu: MENU, basket, add, clear, formatPrice }
  },
  template: \`
    <ul class="products">
      <li v-for="item in menu" :key="item.id" class="product">
        <span class="photo"></span>
        <span><span class="name">{{ item.name }}</span><span class="price">{{ formatPrice(item.price) }} €</span></span>
        <button class="add" type="button" :id="'add-' + item.id" @click="add(item)">Add</button>
      </li>
    </ul>
    <section class="box" id="basket">
      <h2>Your basket</h2>
      <p v-if="!basket.lines.length" class="note">Your basket is empty.</p>
      <p v-for="line in basket.lines" :key="line.id" class="line">
        <span>{{ line.quantity }} × {{ line.name }}</span><span>{{ formatPrice(line.price * line.quantity) }} €</span>
      </p>
      <button class="action" type="button" id="clear" @click="clear">Clear basket</button>
    </section>
  \`
}

createApp(App).mount('#app')
`

export const KEPT = 'Your basket2 × Butter croissant4.80 €Clear basket'
export const CLEARED = 'Your basketYour basket is empty.Clear basket'
export const RYE = 'Your basket1 × Rye loaf5.00 €Clear basket'

export const replacedBasket: FrameworksScenario = {
  id: 'frameworks-02-replaced-basket',
  track: 'frameworks',
  kind: 'scenario',
  title: 'Clear basket clears nothing',
  difficulty: 1,
  minutes: 5,
  teaches: 'replaced object',
  story: [
    'Lena still has two croissants in her basket from yesterday. Today she wants a rye loaf instead, so she taps Clear basket, then Add on the rye loaf. The croissants stay. The Console says “Basket cleared”.',
    'Predict what the basket shows. Then fix `app.js` so Clear basket empties it and what she adds afterwards shows up. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'basket',
      form: 'one',
      prompt: '`clear` sets `basket = reactive({ lines: [] })`. Lena taps Clear basket, then Add on the rye loaf. What does the basket show?',
      options: [
        { id: 'rye', text: 'Only the rye loaf: the new basket is reactive too.' },
        { id: 'empty', text: '“Your basket is empty.”: the clear worked, but the rye loaf went into the old basket.' },
        { id: 'kept', text: 'Still the two croissants, and no rye loaf: the template holds the basket setup returned; the variable now points at a new one, and Add fills that.', fact: shows('basket', KEPT) },
        { id: 'both', text: 'The croissants and the rye loaf: clearing a reactive object needs `nextTick`.' }
      ],
      answer: 'kept',
      rule: 'The template keeps the object setup returned; assigning a new object to the variable changes nothing it shows, so empty the same object instead (or keep it in a ref and set `.value`).'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: [
      { id: 'start', steps: [{ text: '#basket' }] },
      { id: 'cleared', steps: [{ click: '#clear' }, { text: '#basket' }] },
      { id: 'basket', steps: [{ click: '#add-rye' }, { text: '#basket' }] },
      { id: 'again', steps: [{ click: '#clear' }, { click: '#add-bun' }, { click: '#add-bun' }, { text: '#basket' }] },
      { id: 'renders', steps: [{ click: '#add-rye' }, { reactions: 'render Basket' }] }
    ]
  },
  setup: () => ({ files: vueSite('Basket', { 'app.js': APP, 'menu.js': MENU_SOURCE }), observed: null, picked: null }),
  goals: [
    predictedGoal('Predict what the basket shows', 1),
    probesGoal('cleared', 'Clear basket empties the basket, and what Lena adds afterwards shows up, also after a second clear', { start: KEPT, cleared: CLEARED, basket: RYE, again: 'Your basket2 × Cinnamon bun6.40 €Clear basket', renders: { atLeast: 1 } }, { clean: true })
  ],
  hints: [
    'Tap Clear basket and watch the Reactivity panel: does the Basket render? Then tap Add: which object does `add` change, and which one does the template show?',
    'setup returned the first basket, and the template holds it for good. `basket = reactive(…)` points the variable at a second object no template ever sees.',
    'Empty the same object: in `clear`, line 16, write `basket.lines = []` instead. Save, then Reload.'
  ],
  debrief: {
    title: 'The template holds an object, not a variable',
    paragraphs: [
      'setup ran once and returned `{ basket }`: the object, not the variable. Vue rendered from that object ever since. `basket = reactive({ lines: [] })` made a second reactive object and pointed the variable at it; nothing in the template reads the variable again, so the croissants stayed, and every Add after that filled the second object, which nobody shows.',
      'Change the object the page holds: `basket.lines = []` (a write through the proxy, so the render runs), or `basket.lines.length = 0`, or `basket.lines.splice(0)`. When you really want to swap the whole thing, keep it in a ref: `const basket = ref({ lines: [] })`, then `basket.value = { lines: [] }`. A ref is a box whose `.value` is tracked, so swapping what\'s in it is a change Vue sees.',
      'That is the usual advice: a ref for anything you replace, `reactive` for an object you only change. The same trap waits in a store or a composable that reassigns its reactive state.'
    ]
  },
  solution: [
    { predict: 'kept' },
    { save: 'app.js', replace: [REPLACE, '  basket.lines = []'] },
    'reload'
  ]
}
