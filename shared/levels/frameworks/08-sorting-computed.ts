// Framework deep dives 3.2: the basket that reorders itself. The receipt preview lists the lines cheapest first through
// `computed(() => basket.lines.sort(…))`. `sort` sorts the array in place, so the computed reorders the basket itself,
// and the basket (in the order Lena added things) comes out sorted too. Learn: a computed's getter must not change what
// it reads; sort a copy (`[...lines].sort()`, `toSorted()`).
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from '../web/checks'
import { MENU_SOURCE, VUE_PAGE, shows, vueSite } from './site'
import type { FrameworksScenario } from './types'

/** The getter that sorts in place; the fix sorts a copy. */
export const IN_PLACE = '    const cheapestFirst = computed(() => basket.lines.sort((a, b) => a.price - b.price))'

const APP = `// The basket (Jonas): what Lena added, in that order, and the receipt preview cheapest first.
import { computed, createApp, reactive } from 'vue'
import { formatPrice } from './money.js'
import { MENU } from './menu.js'

const App = {
  name: 'Basket',
  setup() {
    const basket = reactive({ lines: [] })
${IN_PLACE}
    function add(item) {
      basket.lines.push({ id: item.id, name: item.name, price: item.price })
    }
    return { menu: MENU, basket, cheapestFirst, add, formatPrice }
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
      <h2>In the order you added them</h2>
      <ol id="added"><li v-for="line in basket.lines" :key="line.id">{{ line.name }}</li></ol>
      <h2>Receipt, cheapest first</h2>
      <ol id="receipt"><li v-for="line in cheapestFirst" :key="line.id">{{ line.name }} {{ formatPrice(line.price) }} €</li></ol>
    </section>
  \`
}

createApp(App).mount('#app')
`

export const sortingComputed: FrameworksScenario = {
  id: 'frameworks-08-sorting-computed',
  track: 'frameworks',
  kind: 'scenario',
  title: 'The basket that reorders itself',
  difficulty: 2,
  minutes: 6,
  teaches: 'computed side effect',
  story: [
    'The basket shows what Lena added in the order she added it, and below it the receipt preview, cheapest first. Lena adds a rye loaf, then a cinnamon bun, then a croissant. The receipt is right. But her basket now lists the croissant first too, as if she had added it first.',
    'Predict the basket\'s order. Then fix `app.js` so the receipt is sorted and the basket keeps her order. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'added',
      form: 'one',
      prompt: 'The receipt is `computed(() => basket.lines.sort((a, b) => a.price - b.price))`, and both lists are on screen. Lena adds a rye loaf (5.00 €), a cinnamon bun (3.20 €) and a croissant (2.40 €). In what order does “In the order you added them” list them?',
      options: [
        { id: 'added', text: 'Rye loaf, cinnamon bun, croissant: the computed works on its own result.' },
        { id: 'loop', text: 'Nothing: sorting inside a computed loops forever, and Vue stops the page.' },
        { id: 'reversed', text: 'Croissant, cinnamon bun, rye loaf, but only until the next render.' },
        { id: 'sorted', text: 'Croissant, cinnamon bun, rye loaf: `sort` reorders the array it is called on, so the getter sorted the basket itself.', fact: shows('added', 'Butter croissantCinnamon bunRye loaf') }
      ],
      answer: 'sorted',
      rule: 'A computed\'s getter should only read: `sort`, `reverse` and `splice` change the reactive array they are called on, so sort a copy (`[...lines].sort(…)` or `lines.toSorted(…)`).'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: [
      { id: 'added', steps: [{ click: '#add-rye' }, { click: '#add-bun' }, { click: '#add-croissant' }, { text: '#added' }] },
      { id: 'receipt', steps: [{ text: '#receipt' }] }
    ]
  },
  setup: () => ({ files: vueSite('Basket', { 'app.js': APP, 'menu.js': MENU_SOURCE }), observed: null, picked: null }),
  goals: [
    predictedGoal('Predict the basket\'s order', 1),
    probesGoal('order', 'The basket keeps the order Lena added things in, and the receipt lists them cheapest first', { added: 'Rye loafCinnamon bunButter croissant', receipt: 'Butter croissant 2.40 €Cinnamon bun 3.20 €Rye loaf 5.00 €' }, { clean: true })
  ],
  hints: [
    'Both lists come from `basket.lines`. Which line of the code changes the order of that array?',
    '`Array.prototype.sort` sorts in place and returns the same array. The computed\'s getter reorders the basket every time it runs, and the basket list shows the result.',
    'Sort a copy in the getter, line 10: `computed(() => [...basket.lines].sort((a, b) => a.price - b.price))`. Save, then Reload.'
  ],
  debrief: {
    title: 'A getter reads, it never writes',
    paragraphs: [
      '`sort` is one of the array methods that change the array they are called on (with `reverse`, `splice`, `push`, `fill`). In a computed\'s getter it reordered `basket.lines`, the reactive array the basket list shows, so every time the receipt was worked out, the basket was rearranged too. Vue went along with it: the write went through the proxy, so the list rendered the new order.',
      'Sort a copy: `[...basket.lines].sort(…)`, or `basket.lines.toSorted(…)` (ES2023), which returns a new array and leaves the original alone. The same rule holds for every getter: no writes to reactive state, no requests, no DOM changes. A computed may run at any time (or not at all, when nobody reads it), so a side effect in it happens when Vue decides, not when you do. For a side effect on a change, use a watcher (chapter 4).',
      'Vue doesn\'t warn here: the write is a legal change to reactive state, only made in the wrong place, so the page is simply wrong. Think of a getter as answering “what is this, given the current state?”; it should never change that state.'
    ]
  },
  solution: [
    { predict: 'sorted' },
    { save: 'app.js', replace: [IN_PLACE, '    const cheapestFirst = computed(() => [...basket.lines].sort((a, b) => a.price - b.price))'] },
    'reload'
  ]
}
