// Framework deep dives 2.1: the line total that never changes. Jonas's LineTotal component destructures its props in
// setup (`const { price, quantity } = props`) and computes from the two numbers it got then. Props are reactive; the
// numbers taken out of them are not, so the computed never runs again: the component re-renders (its props changed) and
// shows its cached total. Learn: read props where you need them (`props.quantity`), or keep the link with toRefs/toRef.
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from '../web/checks'
import { VUE_PAGE, shows, vueSite } from './site'
import type { FrameworksScenario } from './types'

/** The destructuring line; the fix reads the props where the total is computed. */
export const TAKEN = '    const { price, quantity } = props'

const LINE_TOTAL = `// One line's total (Jonas): the price times how many, as money.
import { computed } from 'vue'
import { formatPrice } from './money.js'

export const LineTotal = {
  name: 'LineTotal',
  props: { price: Number, quantity: Number },
  setup(props) {
${TAKEN}
    const total = computed(() => formatPrice(price * quantity))
    return { total }
  },
  template: '<span class="out">{{ total }} €</span>'
}
`

const APP = `// The basket (Jonas): each line with − and +, its total from LineTotal, and the basket's total.
import { computed, createApp, reactive } from 'vue'
import { formatPrice } from './money.js'
import { LineTotal } from './line-total.js'

const basket = reactive({
  lines: [{ id: 'croissant', name: 'Butter croissant', price: 2.4, quantity: 1 }]
})

const App = {
  name: 'Basket',
  components: { LineTotal },
  setup() {
    const total = computed(() => basket.lines.reduce((sum, line) => sum + line.price * line.quantity, 0))
    const change = (line, by) => { line.quantity = Math.max(1, line.quantity + by) }
    return { basket, total, change, formatPrice }
  },
  template: \`
    <section class="box" id="basket">
      <h2>Your basket</h2>
      <p v-for="line in basket.lines" :key="line.id" class="line" :id="line.id">
        <span>
          <button class="add" type="button" :id="'less-' + line.id" :aria-label="'One ' + line.name + ' less'" @click="change(line, -1)">−</button>
          {{ line.quantity }} × {{ line.name }}
          <button class="add" type="button" :id="'more-' + line.id" :aria-label="'One more ' + line.name" @click="change(line, 1)">+</button>
        </span>
        <LineTotal :price="line.price" :quantity="line.quantity" />
      </p>
      <p><strong id="total">Total {{ formatPrice(total) }} €</strong></p>
    </section>
  \`
}

createApp(App).mount('#app')
`

export const destructuredProps: FrameworksScenario = {
  id: 'frameworks-04-destructured-props',
  track: 'frameworks',
  kind: 'scenario',
  title: 'The line total that never changes',
  difficulty: 2,
  minutes: 6,
  teaches: 'destructured props',
  story: [
    'Jonas split the basket into components: each line\'s total now comes from `LineTotal`, which gets the price and the quantity as props. Lena taps + twice on her croissant. The line says “3 × Butter croissant” and the basket says “Total 7.20 €”, but the line\'s own total still says 2.40 €.',
    'Predict what the line total shows. Then fix `line-total.js` so it follows the quantity. Save, then Reload: the Reactivity panel shows when LineTotal renders and when its computed runs.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'line',
      form: 'one',
      prompt: '`LineTotal` does `const { price, quantity } = props` in setup, then `computed(() => formatPrice(price * quantity))`. Lena taps + twice. What does the line total show?',
      options: [
        { id: 'follows', text: '7.20 €: props are reactive, so the computed follows them.' },
        { id: 'stays', text: '2.40 €: LineTotal renders again with the new props, but its computed only ever read two plain numbers, so it never runs again.', fact: shows('line', '2.40 €') },
        { id: 'warns', text: '2.40 €, and Vue warns that props must not be destructured.' },
        { id: 'error', text: 'Nothing: `quantity` is read-only, so the + throws.' }
      ],
      answer: 'stays',
      rule: 'Destructuring props in setup copies their values once; read `props.quantity` where you need it (or use `toRefs(props)`) so Vue can track it.'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'line-total.js',
    vue: true,
    probes: [
      { id: 'line', steps: [{ click: '#more-croissant' }, { click: '#more-croissant' }, { text: '#croissant .out' }] },
      { id: 'total', steps: [{ text: '#total' }] },
      { id: 'less', steps: [{ click: '#less-croissant' }, { text: '#croissant .out' }] },
      // the computed ran for the change, not only the render
      { id: 'computed', steps: [{ click: '#more-croissant' }, { reactions: 'computed' }] }
    ]
  },
  setup: () => ({ files: vueSite('Basket', { 'app.js': APP, 'line-total.js': LINE_TOTAL }), observed: null, picked: null }),
  goals: [
    predictedGoal('Predict what the line total shows', 1),
    probesGoal('line', 'The line total follows every + and −, and matches the basket\'s total', { line: '7.20 €', total: 'Total 7.20 €', less: '4.80 €', computed: { atLeast: 1 } }, { clean: true })
  ],
  hints: [
    'Tap + and read the Reactivity panel: LineTotal renders (because its props changed), but does its computed run?',
    '`const { price, quantity } = props` copies two numbers out of the reactive props object, once. The computed reads those copies, so Vue saw it read nothing reactive.',
    'In `line-total.js`, line 9, drop the destructuring and read the props inside the computed: `computed(() => formatPrice(props.price * props.quantity))`. Save, then Reload.'
  ],
  debrief: {
    title: 'Destructuring takes the values, not the link',
    paragraphs: [
      '`props` is a reactive object: reading `props.quantity` inside a computed, a watcher or the template is a read Vue tracks. `const { price, quantity } = props` reads both once, in setup, and keeps two plain numbers. The computed then multiplied numbers that never change, so it was never dirty again. LineTotal still rendered every time its props changed (the panel says so), and every time it showed its cached total.',
      'Read the props where you need them (`props.price * props.quantity`), or keep the link: `const { price, quantity } = toRefs(props)` gives refs that follow the props (`price.value`), and `toRef(props, \'quantity\')` gives one. In a `<script setup>` single-file component, Vue 3.5\'s compiler rewrites `const { price } = defineProps()` into `props.price` for you, so there destructuring is safe; in a plain `setup()` function it copies.',
      'The same goes for anything reactive you take apart: `const { count } = store`, `const { x, y } = useMouse()` when it returns a reactive object, a function you call once with `props.quantity` as its argument.'
    ]
  },
  solution: [
    { predict: 'stays' },
    { save: 'line-total.js', replace: [`${TAKEN}\n    const total = computed(() => formatPrice(price * quantity))`, '    const total = computed(() => formatPrice(props.price * props.quantity))'] },
    'reload'
  ]
}
