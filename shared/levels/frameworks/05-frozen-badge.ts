// Framework deep dives 2.2: the badge that froze at 0. The basket lives in a small store (`useBasket()` returns one
// reactive object), and the header's badge takes `const { count } = useBasket()`. The list below reads the store and
// updates; the badge kept the number count had when the header was set up. Learn: destructure a reactive object
// through toRefs (or keep the object and read `basket.count`).
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from '../web/checks'
import { MENU_SOURCE, VUE_PAGE, shows, vueSite } from './site'
import type { FrameworksScenario } from './types'

/** The header's destructuring; the fix goes through toRefs. */
export const BADGE_TAKES = '    const { count } = useBasket()'

const STORE = `// The basket store (Jonas): one reactive basket the whole page shares.
import { reactive } from 'vue'

const basket = reactive({ lines: [], count: 0 })

export function useBasket() {
  return basket
}

export function add(item) {
  const line = basket.lines.find(each => each.id === item.id)
  if (line) line.quantity += 1
  else basket.lines.push({ id: item.id, name: item.name, quantity: 1 })
  basket.count += 1
}
`

const HEADER = `// The header's badge (Jonas): how many things are in the basket.
import { useBasket } from './store.js'

export const BasketBadge = {
  name: 'BasketBadge',
  setup() {
${BADGE_TAKES}
    return { count }
  },
  template: '<p class="cart" id="badge">Basket ({{ count }})</p>'
}
`

const APP = `// The menu page (Jonas): the badge on top, the menu, and what is in the basket.
import { createApp } from 'vue'
import { MENU } from './menu.js'
import { BasketBadge } from './header.js'
import { add, useBasket } from './store.js'

const App = {
  name: 'Menu',
  components: { BasketBadge },
  setup() {
    return { menu: MENU, basket: useBasket(), add }
  },
  template: \`
    <BasketBadge />
    <ul class="products">
      <li v-for="item in menu" :key="item.id" class="product">
        <span class="photo"></span>
        <span class="name">{{ item.name }}</span>
        <button class="add" type="button" :id="'add-' + item.id" @click="add(item)">Add</button>
      </li>
    </ul>
    <section class="box" id="basket">
      <h2>Your basket</h2>
      <p v-for="line in basket.lines" :key="line.id" class="line">{{ line.quantity }} × {{ line.name }}</p>
    </section>
  \`
}

createApp(App).mount('#app')
`

export const frozenBadge: FrameworksScenario = {
  id: 'frameworks-05-frozen-badge',
  track: 'frameworks',
  kind: 'scenario',
  title: 'The badge that froze at 0',
  difficulty: 2,
  minutes: 5,
  teaches: 'destructured reactive',
  story: [
    'The basket now lives in a small store, `store.js`: `useBasket()` hands every component the same reactive basket. Lena adds a croissant and a rye loaf. The basket below the menu lists both, but the badge in the header still says “Basket (0)”.',
    'Predict what the badge shows. Then fix `header.js` so the badge counts along. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'badge',
      form: 'one',
      prompt: 'The header does `const { count } = useBasket()` in setup and shows `{{ count }}`. Lena adds two things. What does the badge show?',
      options: [
        { id: 'two', text: '“Basket (2)”: `useBasket()` returns the reactive basket, so `count` is reactive too.' },
        { id: 'one', text: '“Basket (1)”: Vue renders the header once more, for the first change.' },
        { id: 'blank', text: '“Basket ()”: a destructured value is undefined in the template.' },
        { id: 'zero', text: '“Basket (0)”: destructuring read `basket.count` once, in setup, and kept the number 0.', fact: shows('badge', 'Basket (0)') }
      ],
      answer: 'zero',
      rule: 'Destructuring a reactive object copies its values; `toRefs(obj)` turns each property into a ref linked to it, so destructuring keeps the link.'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'header.js',
    vue: true,
    probes: [
      { id: 'badge', steps: [{ click: '#add-croissant' }, { click: '#add-rye' }, { text: '#badge' }] },
      { id: 'basket', steps: [{ text: '#basket' }] },
      { id: 'more', steps: [{ click: '#add-croissant' }, { text: '#badge' }] },
      { id: 'renders', steps: [{ click: '#add-bun' }, { reactions: 'render BasketBadge' }] }
    ]
  },
  setup: () => ({ files: vueSite('Menu', { 'app.js': APP, 'header.js': HEADER, 'store.js': STORE, 'menu.js': MENU_SOURCE }), observed: null, picked: null }),
  goals: [
    predictedGoal('Predict what the badge shows', 1),
    probesGoal('badge', 'The badge counts every Add, rendered by Vue, while the basket lists them', { badge: 'Basket (2)', basket: 'Your basket1 × Butter croissant1 × Rye loaf', more: 'Basket (3)', renders: { atLeast: 1 } }, { clean: true })
  ],
  hints: [
    'Add something and read the Reactivity panel: Menu renders, but does BasketBadge?',
    '`const { count } = useBasket()` reads `basket.count` once, when the header is set up, and keeps the number. The template then shows a plain 0 that nothing can change.',
    'In `header.js`, line 7, destructure through refs: `const { count } = toRefs(useBasket())`, and import `toRefs` from \'vue\' on line 2. Save, then Reload.'
  ],
  debrief: {
    title: 'toRefs keeps what destructuring breaks',
    paragraphs: [
      '`useBasket()` returned the reactive basket, but `const { count } = …` is just a read: it took the value `count` had at that moment, 0, and put it in a new variable. A variable is never reactive; only a read through the proxy (or a ref\'s `.value`) is tracked. The list kept working because it reads `basket.lines` in its template, every render.',
      '`toRefs(basket)` returns an object of refs, one per property, each reading and writing that property of the reactive object. Destructuring that keeps refs, and the template unwraps them: `const { count } = toRefs(useBasket())`. Or don\'t destructure: `const basket = useBasket()` and `{{ basket.count }}`. Pinia has the same trap, and `storeToRefs(store)` is its `toRefs`.',
      'Spreading is the same mistake: `return { ...useBasket() }` copies every value once.'
    ]
  },
  solution: [
    { predict: 'zero' },
    { save: 'header.js', replace: [BADGE_TAKES, '    const { count } = toRefs(useBasket())'] },
    { save: 'header.js', replace: ['import { useBasket } from \'./store.js\'', 'import { toRefs } from \'vue\'\nimport { useBasket } from \'./store.js\''] },
    'reload'
  ]
}
