// Framework deep dives 3.3: the quantity field that won't take a number. Jonas binds the quantity field with v-model to
// a computed that only has a getter. Typing writes to the computed; Vue refuses (a warning in the Console), the field
// shows what was typed, and the basket never changes. Learn: a computed is read-only unless it has a setter; give it
// `{ get, set }` (or bind v-model to the state itself).
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from '../web/checks'
import { VUE_PAGE, vueSite } from './site'
import type { FrameworksScenario } from './types'

/** The getter-only computed; the fix gives it a setter. */
export const GETTER_ONLY = '    const quantity = computed(() => line.quantity)'

const APP = `// The line editor (Jonas): type how many croissants, and the total follows.
import { computed, createApp, reactive } from 'vue'
import { formatPrice } from './money.js'

const App = {
  name: 'LineEditor',
  setup() {
    const line = reactive({ name: 'Butter croissant', price: 2.4, quantity: 1 })
${GETTER_ONLY}
    const total = computed(() => line.price * line.quantity)
    return { line, quantity, total, formatPrice }
  },
  template: \`
    <section class="box">
      <h2>Butter croissant</h2>
      <label for="qty">How many?</label>
      <input id="qty" type="number" min="1" v-model.number="quantity">
      <p><strong id="total">Total {{ formatPrice(total) }} €</strong></p>
    </section>
  \`
}

createApp(App).mount('#app')
`

export const readonlyComputed: FrameworksScenario = {
  id: 'frameworks-09-readonly-computed',
  track: 'frameworks',
  kind: 'scenario',
  title: 'The field that won\'t take a number',
  difficulty: 2,
  minutes: 5,
  teaches: 'writable computed',
  story: [
    'Lena wants four croissants for the office. Jonas\'s line editor has a field: How many? It is bound with `v-model` to `quantity`, a computed of the line\'s quantity. Lena types 4. The field says 4, the total still says 2.40 €, and the Console has a warning in it.',
    'Predict the total. Then fix `app.js` so typing a number changes the line. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'total',
      form: 'one',
      prompt: '`quantity` is `computed(() => line.quantity)`, and the field has `v-model.number="quantity"`. Lena types 4. What happens?',
      options: [
        { id: 'works', text: 'The total says 9.60 €: v-model writes through the computed to the line.' },
        { id: 'error', text: 'A TypeError, and the field goes back to 1.' },
        { id: 'stale', text: 'The total says 9.60 € once, then the field snaps back to 1.' },
        { id: 'refused', text: 'The total stays 2.40 €, and Vue warns “Write operation failed: computed value is readonly”: a computed without a setter can\'t be written.', fact: { says: '[Vue warn] Write operation failed: computed value is readonly' } }
      ],
      answer: 'refused',
      rule: 'A computed made from a getter is read-only: writing its `.value` changes nothing and Vue warns. Give it a setter (`computed({ get, set })`) or bind v-model to the state itself.'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: [
      { id: 'total', steps: [{ type: '#qty', value: '4' }, { text: '#total' }] },
      { id: 'again', steps: [{ type: '#qty', value: '2' }, { text: '#total' }] }
    ]
  },
  setup: () => ({ files: vueSite('Line', { 'app.js': APP }), observed: null, picked: null }),
  goals: [
    predictedGoal('Predict the total', 1),
    probesGoal('typed', 'Typing a number changes the line: 4 croissants are 9.60 €, then 2 are 4.80 €', { total: 'Total 9.60 €', again: 'Total 4.80 €' }, { clean: true })
  ],
  hints: [
    'Read the Console after typing: what does Vue say about the write?',
    'v-model on a computed sets `quantity.value` on every input. A computed made from one function has no setter, so the write is refused; the field just keeps what was typed.',
    'Give the computed a setter, line 9: `const quantity = computed({ get: () => line.quantity, set: value => { line.quantity = value } })`. Save, then Reload.'
  ],
  debrief: {
    title: 'A computed is read-only until it has a setter',
    paragraphs: [
      '`computed(getter)` makes a read-only ref: its value is whatever the getter returns, and setting `.value` is refused with a warning (in production, silently). v-model is sugar for `:value="quantity"` plus `@input` that sets `quantity = $event.target.value` (a number, with `.number`), so every keystroke tried to write the computed. The field showed what Lena typed only because the input element keeps its own text.',
      'A writable computed takes both halves: `computed({ get: () => line.quantity, set: value => { line.quantity = value } })`. The setter is where a rule goes (`Math.max(1, value)`, rounding, a request), and the getter still decides what is shown. When there is nothing to add, skip the computed and bind the state itself: `v-model.number="line.quantity"`.',
      'Vue 3.4\'s `defineModel()` in a `<script setup>` component is the same idea for a component\'s own v-model: a ref whose writes go up to the parent as an event.'
    ]
  },
  solution: [
    { predict: 'refused' },
    { save: 'app.js', replace: [GETTER_ONLY, '    const quantity = computed({ get: () => line.quantity, set: value => { line.quantity = value } })'] },
    'reload'
  ]
}
