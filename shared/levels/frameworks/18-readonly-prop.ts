// Framework deep dives 6.3: the + that does nothing. The QuantityPicker component gets the quantity as a prop and its +
// does `quantity++` on it. Props are read-only in the child: Vue refuses the write and warns. Learn: data goes down as
// props, changes go up as events; the parent owns the state (`emit('update:quantity', …)` and `v-model:quantity`).
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from '../web/checks'
import { VUE_PAGE, vueSite } from './site'
import type { FrameworksScenario } from './types'

/** The child's + that writes its prop; the fix sends an event up. */
export const WRITES = '      <button class="add" type="button" id="more" aria-label="One more" @click="quantity++">+</button>'

const PICKER = `// The quantity picker (Jonas): − and + around a number, for any line.
export const QuantityPicker = {
  name: 'QuantityPicker',
  props: { quantity: Number },
  emits: ['update:quantity'],
  template: \`
    <span class="row">
      <button class="add" type="button" id="less" aria-label="One less" @click="$emit('update:quantity', Math.max(1, quantity - 1))">−</button>
      <span class="out" id="picked">{{ quantity }}</span>
${WRITES}
    </span>
  \`
}
`

const APP = `// The croissant line (Jonas): the picker sets how many, the total follows.
import { computed, createApp, reactive } from 'vue'
import { formatPrice } from './money.js'
import { QuantityPicker } from './picker.js'

const App = {
  name: 'Line',
  components: { QuantityPicker },
  setup() {
    const line = reactive({ name: 'Butter croissant', price: 2.4, quantity: 2 })
    const total = computed(() => line.price * line.quantity)
    return { line, total, formatPrice }
  },
  template: \`
    <section class="box">
      <h2>{{ line.name }}</h2>
      <QuantityPicker v-model:quantity="line.quantity" />
      <p><strong id="total">Total {{ formatPrice(total) }} €</strong></p>
    </section>
  \`
}

createApp(App).mount('#app')
`

export const readonlyProp: FrameworksScenario = {
  id: 'frameworks-18-readonly-prop',
  track: 'frameworks',
  kind: 'scenario',
  title: 'The + that does nothing',
  difficulty: 2,
  minutes: 5,
  teaches: 'readonly props',
  story: [
    'Jonas made a quantity picker to use on every line: − and + around a number. The parent binds it with `v-model:quantity`. − works. + does nothing, and each tap adds a Vue warning to the Console.',
    'Predict what + does. Then fix `picker.js` so + adds one, the way − takes one away. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'more',
      form: 'one',
      prompt: 'In QuantityPicker, − emits `update:quantity` with one less; + does `quantity++` on its prop. Lena has 2 croissants and taps + once. What happens?',
      options: [
        { id: 'refused', text: 'Still 2, and Vue warns that props are read-only: a component may not change its props; it asks its parent with an event.', fact: { says: '[Vue warn]: Attempting to mutate prop "quantity"' } },
        { id: 'three', text: '3 croissants, 7.20 €: the prop is the parent\'s value, so the change goes up.' },
        { id: 'local', text: 'The picker shows 3, the total stays at 4.80 €: the child keeps its own copy.' },
        { id: 'error', text: 'A TypeError: props are frozen objects.' }
      ],
      answer: 'refused',
      rule: 'Props are read-only in the child: Vue refuses the write and warns. The child emits an event (`update:quantity`), and the parent, which owns the state, changes it.'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'picker.js',
    vue: true,
    probes: [
      { id: 'more', steps: [{ click: '#more' }, { text: '#picked' }] },
      { id: 'total', steps: [{ text: '#total' }] },
      { id: 'less', steps: [{ click: '#less' }, { click: '#less' }, { text: '#picked' }] },
      { id: 'again', steps: [{ click: '#more' }, { click: '#more' }, { text: '#total' }] }
    ]
  },
  setup: () => ({ files: vueSite('Line', { 'app.js': APP, 'picker.js': PICKER }), observed: null, picked: null }),
  goals: [
    predictedGoal('Predict what + does', 1),
    probesGoal('more', '+ adds one and − takes one away, and the total follows, with no warning left', { more: '3', total: 'Total 7.20 €', less: '1', again: 'Total 7.20 €' }, { clean: true })
  ],
  hints: [
    'Read the Vue warning after a tap on +. Then compare + with −: what does − do differently?',
    'A prop belongs to the parent. The child can\'t write it; it can only ask, with an event. `v-model:quantity` on the parent listens for `update:quantity` and sets `line.quantity`.',
    'On line 10 of `picker.js`, ask like − does: `@click="$emit(\'update:quantity\', quantity + 1)"`. Save, then Reload.'
  ],
  debrief: {
    title: 'Props down, events up',
    paragraphs: [
      'A component\'s props are the parent\'s data, lent for display. Vue refuses writes to props in the child (with a warning in development), so `quantity++` was refused with “Attempting to mutate prop "quantity". Props are readonly.” If it had worked, the child and the parent would disagree about who owns the number.',
      'The child asks instead: `emit(\'update:quantity\', quantity + 1)`. `v-model:quantity="line.quantity"` on the parent is shorthand for passing `:quantity` and listening for `@update:quantity`, so the parent writes its own state and the new prop comes back down. In `<script setup>`, `defineModel(\'quantity\')` gives the child a ref that does exactly this.',
      'One trap remains: readonly is shallow. A prop that is an object (`:line="line"`) can still have its properties changed by the child (`line.quantity++` works, and changes the parent\'s data behind its back). It works, but Vue\'s docs advise against it for the same reason: events up keep one owner.'
    ]
  },
  solution: [
    { predict: 'refused' },
    { save: 'picker.js', replace: [WRITES, WRITES.replace('@click="quantity++"', '@click="$emit(\'update:quantity\', quantity + 1)"')] },
    'reload'
  ]
}
