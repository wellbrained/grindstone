// Framework deep dives 3.1: the VAT that never switches. The total is a computed that reads `settings.takeaway` from a
// plain settings object; the Eat in / Take away switch changes that object. A computed tracks only reactive reads, so it
// keeps its cached total. Learn: a computed is as reactive as what it reads: make the setting reactive (or a ref).
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from '../web/checks'
import { VUE_PAGE, shows, vueSite } from './site'
import type { FrameworksScenario } from './types'

/** The plain settings object; the fix makes it reactive. */
export const PLAIN = 'export const settings = { takeaway: true }'

const SETTINGS = `// The shop's settings (Jonas): take away by default.
${PLAIN}
`

const APP = `// The checkout (Jonas): Eat in or Take away, and the total with VAT (7 % to take away, 19 % to eat in).
import { computed, createApp, reactive } from 'vue'
import { formatPrice } from './money.js'
import { settings } from './settings.js'

const App = {
  name: 'Checkout',
  setup() {
    const basket = reactive({ lines: [{ name: 'Butter croissant', price: 2.4, quantity: 2 }, { name: 'Flat white', price: 3.6, quantity: 1 }] })
    const net = computed(() => basket.lines.reduce((sum, line) => sum + line.price * line.quantity, 0))
    const total = computed(() => net.value * (settings.takeaway ? 1.07 : 1.19))
    function choose(takeaway) {
      settings.takeaway = takeaway
      console.log(takeaway ? 'Take away' : 'Eat in')
    }
    return { basket, total, choose, formatPrice }
  },
  template: \`
    <section class="box">
      <h2>Your order</h2>
      <p v-for="line in basket.lines" :key="line.name" class="line"><span>{{ line.quantity }} × {{ line.name }}</span><span>{{ formatPrice(line.price * line.quantity) }} €</span></p>
      <p class="row">
        <button class="action" type="button" id="eat-in" @click="choose(false)">Eat in</button>
        <button class="action" type="button" id="take-away" @click="choose(true)">Take away</button>
      </p>
      <p><strong id="total">Total {{ formatPrice(total) }} € with VAT</strong></p>
    </section>
  \`
}

createApp(App).mount('#app')
`

export const plainSetting: FrameworksScenario = {
  id: 'frameworks-07-plain-setting',
  track: 'frameworks',
  kind: 'scenario',
  title: 'The VAT that never switches',
  difficulty: 2,
  minutes: 5,
  teaches: 'untracked read',
  story: [
    'Corner Bakery has a few tables now, and in this story eating in costs 19 % VAT, taking away 7 %. Jonas added Eat in and Take away to the checkout, and the total is a computed that reads `settings.takeaway`. Lena taps Eat in. The Console says “Eat in”, the total stays at 8.99 €.',
    'Predict the total. Then fix the code so the total follows Eat in and Take away. Save, then Reload: the Reactivity panel shows whether the computed runs again.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'total',
      form: 'one',
      prompt: '`total` is `computed(() => net.value * (settings.takeaway ? 1.07 : 1.19))`, and `settings` is the plain object `{ takeaway: true }` from settings.js. Lena taps Eat in, which sets `settings.takeaway = false`. What does the total show?',
      options: [
        { id: 'eat', text: '10.00 € (19 %): the computed reads `settings.takeaway` every time it is shown.' },
        { id: 'warn', text: '8.99 €, and Vue warns that a computed read a plain object.' },
        { id: 'same', text: '8.99 € (7 %): the computed tracked `net` only; `settings` is no reactive object, so nothing tells it to run again, and it keeps its cached total.', fact: shows('total', 'Total 8.99 € with VAT') },
        { id: 'nan', text: 'NaN: `settings` changed while the computed was cached.' }
      ],
      answer: 'same',
      rule: 'A computed re-runs only when something reactive it read changes; a plain object, a module variable or `Date.now()` is read, but never tracked.'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: [
      { id: 'start', steps: [{ text: '#total' }] },
      { id: 'total', steps: [{ click: '#eat-in' }, { text: '#total' }] },
      { id: 'back', steps: [{ click: '#take-away' }, { text: '#total' }] }
    ]
  },
  setup: () => ({ files: vueSite('Checkout', { 'app.js': APP, 'settings.js': SETTINGS }), observed: null, picked: null }),
  goals: [
    predictedGoal('Predict the total', 1),
    probesGoal('total', 'The total is 8.99 € to take away and 10.00 € to eat in, both ways round', { start: 'Total 8.99 € with VAT', total: 'Total 10.00 € with VAT', back: 'Total 8.99 € with VAT' }, { clean: true })
  ],
  hints: [
    'Tap Eat in and read the Reactivity panel: does the computed run again? What did it read the first time that Vue could track?',
    'A computed remembers the reactive things it read. `net.value` is one; `settings.takeaway` is a property of a plain object, so Vue never noticed the read, and never hears of the change.',
    'Make the settings reactive: in `settings.js`, line 2, `export const settings = reactive({ takeaway: true })`, with `import { reactive } from \'vue\'` above it. Save, then Reload.'
  ],
  debrief: {
    title: 'A computed is as reactive as what it reads',
    paragraphs: [
      'When a computed runs, Vue notes every reactive read it makes: `net.value`, a property of a reactive object, a ref. Those are its dependencies; when one changes, the computed is marked dirty and runs again the next time someone reads it. Otherwise it hands out its cached value. `settings.takeaway` was read, but from a plain object, so it was no dependency, and changing it changed nothing Vue knew about.',
      'Make the source reactive (`reactive({ takeaway: true })`, or a ref) and the computed follows it. The same trap waits in anything a computed reads that Vue can\'t see: `Date.now()` (the "open now" sign that never flips), `localStorage`, `window.innerWidth`, a value from a library\'s own store. Bring it into Vue first: a ref that a timer, an event listener or a watcher keeps up to date.',
      'Caching is the point of a computed: it runs only when it must. A method in the template would not help here: it runs only when the checkout renders, and a change to a plain object renders nothing.'
    ]
  },
  solution: [
    { predict: 'same' },
    { save: 'settings.js', replace: [PLAIN, 'import { reactive } from \'vue\'\nexport const settings = reactive({ takeaway: true })'] },
    'reload'
  ]
}
