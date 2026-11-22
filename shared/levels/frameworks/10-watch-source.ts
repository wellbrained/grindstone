// Framework deep dives 4.1: the kitchen never hears. A watcher should tell the kitchen when croissants run low, but it
// watches `stock.croissant`, the number it was at setup, not a source Vue can track. Vue warns once and the callback
// never runs. Learn: a watch source is a ref, a reactive object, a getter, or an array of them; a property of a reactive
// object is watched through a getter (`() => stock.croissant`).
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from '../web/checks'
import { VUE_PAGE, vueSite } from './site'
import type { FrameworksScenario } from './types'

/** The watch on a plain number; the fix watches a getter. */
export const SOURCE = '    watch(stock.croissant, (left) => {'

const APP = `// The shop's counter (Jonas): sell croissants; when fewer than 3 are left, tell the kitchen to bake more.
import { createApp, reactive, ref, watch } from 'vue'

const App = {
  name: 'Counter',
  setup() {
    const stock = reactive({ croissant: 5 })
    const kitchen = ref('')
${SOURCE}
      if (left < 3) {
        kitchen.value = \`Kitchen told: \${left} left, bake more croissants\`
        console.log(kitchen.value)
      }
    })
    const sell = () => { if (stock.croissant > 0) stock.croissant-- }
    return { stock, kitchen, sell }
  },
  template: \`
    <section class="box">
      <h2>Butter croissants</h2>
      <p id="left">{{ stock.croissant }} left</p>
      <button class="action" type="button" id="sell" @click="sell">Sell one</button>
      <p class="note" id="kitchen" role="status">{{ kitchen }}</p>
    </section>
  \`
}

createApp(App).mount('#app')
`

export const watchSource: FrameworksScenario = {
  id: 'frameworks-10-watch-source',
  track: 'frameworks',
  kind: 'scenario',
  title: 'The kitchen never hears',
  difficulty: 2,
  minutes: 5,
  teaches: 'watch source',
  story: [
    'At the counter, Mia sells croissants on the tablet. When fewer than 3 are left, a watcher should tell the kitchen to bake more. This morning she sold the last one, and the kitchen never heard. The Console has had a Vue warning since the page loaded.',
    'Predict what the kitchen gets. Then fix `app.js` so the kitchen hears once fewer than 3 are left. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'kitchen',
      form: 'one',
      prompt: 'The watcher is `watch(stock.croissant, (left) => …)`, with `stock = reactive({ croissant: 5 })`. Mia sells three croissants. What happens?',
      options: [
        { id: 'told', text: 'The kitchen is told “2 left” after the third sale.' },
        { id: 'once', text: 'The kitchen is told once, at setup, that 5 are left.' },
        { id: 'never', text: 'Nothing: `stock.croissant` passed the number 5, which Vue can\'t watch; it warns “Invalid watch source” once, at setup, and the callback never runs.', fact: { says: '[Vue warn]: Invalid watch source' } },
        { id: 'every', text: 'The kitchen is told after every sale: the number is watched by value.' }
      ],
      answer: 'never',
      rule: '`watch` takes a ref, a reactive object, a getter or an array of them; to watch one property of a reactive object, pass a getter: `() => stock.croissant`.'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: [
      { id: 'early', steps: [{ click: '#sell' }, { click: '#sell' }, { text: '#kitchen' }] },
      { id: 'kitchen', steps: [{ click: '#sell' }, { text: '#kitchen' }] },
      { id: 'left', steps: [{ text: '#left' }] },
      { id: 'later', steps: [{ click: '#sell' }, { text: '#kitchen' }] },
      { id: 'watched', steps: [{ click: '#sell' }, { reactions: 'watch' }] }
    ]
  },
  setup: () => ({ files: vueSite('Counter', { 'app.js': APP }), observed: null, picked: null }),
  goals: [
    predictedGoal('Predict what the kitchen gets', 1),
    probesGoal('kitchen', 'The kitchen hears once fewer than 3 are left, and after each sale from then on, not before', { early: '', kitchen: 'Kitchen told: 2 left, bake more croissants', left: '2 left', later: 'Kitchen told: 1 left, bake more croissants', watched: { atLeast: 1 } }, { clean: true })
  ],
  hints: [
    'Read the Vue warning in the Console: what did `watch` get as its first argument?',
    '`stock.croissant` is read right there, in setup: `watch` gets the number 5, not something it can follow. Vue can watch a ref, a reactive object or a function it calls to read the value.',
    'Watch a getter, line 9: `watch(() => stock.croissant, (left) => {`. Save, then Reload.'
  ],
  debrief: {
    title: 'Watch a getter for one property',
    paragraphs: [
      '`watch(source, callback)` needs a source it can call or follow: a ref (it reads `.value`), a reactive object (it reads it deeply), a getter function (it calls it and tracks what it reads), or an array of those. `stock.croissant` is evaluated before `watch` is even called, so it got the number 5. Vue said so, “Invalid watch source: 5”, once, at setup, where nobody looks, and then watched nothing.',
      'A getter, `() => stock.croissant`, is called inside Vue\'s effect: the read is tracked, and the callback runs whenever the value it returns changes, with the new and the old value. The same getter shape watches a computed expression (`() => basket.lines.length`) or a prop (`() => props.id`).',
      'The warning is the clue: Vue\'s development build tells you about most of these mistakes in the Console. A production build stays silent and just does nothing.'
    ]
  },
  solution: [
    { predict: 'never' },
    { save: 'app.js', replace: [SOURCE, '    watch(() => stock.croissant, (left) => {'] },
    'reload'
  ]
}
