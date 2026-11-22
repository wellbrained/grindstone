// Framework deep dives 6.1: sold out, still for sale. The wholesale catalogue is big, so Jonas keeps it in a shallowRef
// (Vue doesn't track 400 items for nothing). Marking an item sold out changes the item inside: a shallowRef only reacts
// to `.value` being replaced, so the page never renders. Learn: with shallowRef, replace `.value` (or call triggerRef
// after changing what is inside).
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from '../web/checks'
import { VUE_PAGE, shows, vueSite } from './site'
import type { FrameworksScenario } from './types'

/** The change inside the shallowRef; the fix replaces the list. */
export const INSIDE = '      catalogue.value.find(item => item.id === id).soldOut = true'

const CATALOGUE = `// The wholesale catalogue (Maya's spreadsheet): 400 items in the real shop, a few here.
export function loadCatalogue() {
  return [
    { id: 'rye-5', name: 'Rye loaves, 5', price: 22, soldOut: false },
    { id: 'croissant-20', name: 'Croissants, 20', price: 40, soldOut: false },
    { id: 'bun-12', name: 'Cinnamon buns, 12', price: 30, soldOut: false }
  ]
}
`

const APP = `// The wholesale page (Jonas): a big catalogue in a shallowRef, so Vue doesn't proxy every item.
import { createApp, shallowRef } from 'vue'
import { formatPrice } from './money.js'
import { loadCatalogue } from './catalogue.js'

const App = {
  name: 'Wholesale',
  setup() {
    const catalogue = shallowRef(loadCatalogue())
    function sellOut(id) {
${INSIDE}
      console.log('Sold out:', id)
    }
    return { catalogue, sellOut, formatPrice }
  },
  template: \`
    <ul class="products">
      <li v-for="item in catalogue" :key="item.id" class="product" :id="item.id">
        <span class="photo"></span>
        <span><span class="name">{{ item.name }}</span><span class="price">{{ item.soldOut ? 'Sold out' : formatPrice(item.price) + ' €' }}</span></span>
        <button class="add" type="button" :id="'sell-' + item.id" @click="sellOut(item.id)">Mark sold out</button>
      </li>
    </ul>
  \`
}

createApp(App).mount('#app')
`

export const shallowMenu: FrameworksScenario = {
  id: 'frameworks-16-shallow-menu',
  track: 'frameworks',
  kind: 'scenario',
  title: 'Sold out, still for sale',
  difficulty: 2,
  minutes: 5,
  teaches: 'shallowRef',
  story: [
    'The wholesale catalogue has 400 items, so Jonas keeps it in a `shallowRef`: Vue doesn\'t have to track every item. Maya marks the croissants sold out. The Console says so; the page still sells them for 40.00 €.',
    'Predict what the croissants\' price line says. Then fix `app.js` so Mark sold out shows on the page, keeping the catalogue in its shallowRef. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'price',
      form: 'one',
      prompt: '`catalogue = shallowRef(loadCatalogue())`. Mark sold out does `catalogue.value.find(…).soldOut = true`. What does the croissants\' price line say?',
      options: [
        { id: 'sold', text: '“Sold out”: the item\'s `soldOut` changed, and the template reads it.' },
        { id: 'error', text: 'A TypeError: the items of a shallowRef are frozen.' },
        { id: 'price', text: '“40.00 €”: a shallowRef tracks `.value` only; the items inside are plain objects, so changing one triggers nothing.', fact: shows('price', '40.00 €') },
        { id: 'warn', text: '“40.00 €”, and Vue warns that a shallowRef was changed inside.' }
      ],
      answer: 'price',
      rule: 'A shallowRef reacts only to `.value =`; its contents are not reactive. Replace the value, or call `triggerRef` after changing it in place.'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: [
      { id: 'price', steps: [{ click: '#sell-croissant-20' }, { text: '#croissant-20 .price' }] },
      { id: 'others', steps: [{ text: '#rye-5 .price' }] },
      { id: 'second', steps: [{ click: '#sell-bun-12' }, { text: '#bun-12 .price' }] }
    ]
  },
  setup: () => ({ files: vueSite('Wholesale', { 'app.js': APP, 'catalogue.js': CATALOGUE }), observed: null, picked: null }),
  goals: [
    predictedGoal('Predict what the price line says', 1),
    probesGoal('sold', 'Mark sold out shows “Sold out” on that item, every time, and on no other', { price: 'Sold out', others: '22.00 €', second: 'Sold out' }, { clean: true })
  ],
  hints: [
    'Tap Mark sold out and read the Reactivity panel: does Wholesale render?',
    'A shallowRef is reactive at `.value` only. `catalogue.value.find(…).soldOut = true` changes a plain object inside it, which Vue never sees.',
    'Replace the list instead, line 11: `catalogue.value = catalogue.value.map(item => item.id === id ? { ...item, soldOut: true } : item)`. Save, then Reload.'
  ],
  debrief: {
    title: 'Shallow means only .value counts',
    paragraphs: [
      '`shallowRef` skips what makes `ref` expensive for big data: it doesn\'t turn its value into a deep proxy. Reading `catalogue.value` is tracked, and so is assigning it; everything inside is a plain array of plain objects. Setting `soldOut` on one of them was an ordinary write nobody watches.',
      'Treat a shallowRef like immutable data: make a new value and assign it (`catalogue.value = catalogue.value.map(…)`), which is one trigger for any number of changes. Or change it in place and say so: `triggerRef(catalogue)` runs everything that read it. `shallowReactive` is the same idea for an object: its own properties are reactive, nested objects are not.',
      'Shallow is a performance choice for large lists, data from a library, or values you only ever replace (a chart\'s data, an API response). Deep is the default for a reason: most state is edited in place. (A plain `ref` would have worked here too, at the cost the shallowRef was there to avoid.)'
    ]
  },
  solution: [
    { predict: 'price' },
    { save: 'app.js', replace: [INSIDE, '      catalogue.value = catalogue.value.map(item => item.id === id ? { ...item, soldOut: true } : item)'] },
    'reload'
  ]
}
