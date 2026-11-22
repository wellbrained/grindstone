// Framework deep dives 5.2: undo skips steps. The undo history is a watcher on the quantity; "+3" adds 1 three times in
// one handler. Vue batches: a watcher (flush 'pre') runs once before the next render, with the last value only, so the
// history gets one step for three. Learn: watchers see the state at flush time, not every change; record history where
// the change is made (or use flush: 'sync', knowing it runs on every write).
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from '../web/checks'
import { VUE_PAGE, shows, vueSite } from './site'
import type { FrameworksScenario } from './types'

/** The watcher that records the history; the fix makes it run on every change. */
export const RECORDER = '    watch(quantity, (now, before) => history.push(before))'

const APP = `// The line editor with undo (Jonas): every change of the quantity goes on the history, Undo takes the last one back.
import { createApp, ref, watch } from 'vue'

const App = {
  name: 'LineEditor',
  setup() {
    const quantity = ref(1)
    const history = []
    let undoing = false
${RECORDER.replace('history.push(before))', '{\n      if (!undoing) history.push(before)\n      undoing = false\n    })')}
    function plusThree() {
      for (let i = 0; i < 3; i++) quantity.value++
      console.log('Steps to undo:', history.length)
    }
    function plusOne() {
      quantity.value++
    }
    function undo() {
      if (!history.length) return
      undoing = true
      quantity.value = history.pop()
    }
    return { quantity, plusOne, plusThree, undo }
  },
  template: \`
    <section class="box">
      <h2>Butter croissants</h2>
      <p class="out" id="quantity">{{ quantity }} in the basket</p>
      <p class="row">
        <button class="action" type="button" id="plus-one" @click="plusOne">+1</button>
        <button class="action" type="button" id="plus-three" @click="plusThree">+3, one at a time</button>
        <button class="action" type="button" id="undo" @click="undo">Undo</button>
      </p>
    </section>
  \`
}

createApp(App).mount('#app')
`

export const batchedHistory: FrameworksScenario = {
  id: 'frameworks-14-batched-history',
  track: 'frameworks',
  kind: 'scenario',
  title: 'Undo skips steps',
  difficulty: 2,
  minutes: 6,
  teaches: 'batching',
  story: [
    'The line editor has Undo now: a watcher puts every old quantity on the history. Ben has a “+3, one at a time” button for the office orders; it adds 1 three times. He taps it, then Undo: the quantity jumps from 4 straight back to 1.',
    'Predict where one Undo takes the quantity. Then fix `app.js` so each of the three steps can be undone. Save, then Reload: the Reactivity panel shows how often the watcher ran.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'undo',
      form: 'one',
      prompt: 'A watcher, `watch(quantity, (now, before) => …)`, pushes `before` on the history. Ben taps “+3, one at a time” (three `quantity.value++` in a row), then Undo once. What is the quantity?',
      options: [
        { id: 'three', text: '3: the watcher recorded 1, 2 and 3, and Undo takes back the last step.' },
        { id: 'four', text: '4: Undo needs a render first, so nothing happens yet.' },
        { id: 'none', text: '4: three changes in one handler never reach the watcher at all.' },
        { id: 'one', text: '1: Vue runs the watcher once for the three changes, before the next render, with 4 and 1: one step on the history.', fact: shows('undo', '1 in the basket') }
      ],
      answer: 'one',
      rule: 'Vue batches changes: a watcher (flush \'pre\', the default) runs once before the next render, with the value then and the value before the batch; it never sees the steps in between.'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: [
      { id: 'four', steps: [{ click: '#plus-three' }, { text: '#quantity' }] },
      { id: 'undo', steps: [{ click: '#undo' }, { text: '#quantity' }] },
      { id: 'twice', steps: [{ click: '#undo' }, { text: '#quantity' }] },
      { id: 'thrice', steps: [{ click: '#undo' }, { text: '#quantity' }] },
      // the single steps still go on the history, once each
      { id: 'single', steps: [{ click: '#plus-one' }, { click: '#plus-one' }, { click: '#undo' }, { text: '#quantity' }] }
    ]
  },
  setup: () => ({ files: vueSite('Line', { 'app.js': APP }), observed: null, picked: null }),
  goals: [
    predictedGoal('Predict where one Undo takes the quantity', 1),
    probesGoal('undo', 'Each of the three steps can be undone, one Undo at a time, and +1 still undoes one step', { four: '4 in the basket', undo: '3 in the basket', twice: '2 in the basket', thrice: '1 in the basket', single: '2 in the basket' }, { clean: true })
  ],
  hints: [
    'Tap “+3, one at a time” and count the watch lines in the Reactivity panel. Then read what the watcher gets as `before`.',
    'Three writes in one handler are one batch: Vue runs a watcher once, before the next render, with the value before the batch and the value now. Steps in between are never seen.',
    'Make the watcher run on every write: on line 13, where its callback ends, `})` becomes `}, { flush: \'sync\' })`. Save, then Reload.'
  ],
  debrief: {
    title: 'A watcher sees the batch, not every step',
    paragraphs: [
      'Changing reactive state only queues work. Vue collects every change made in the same tick and then flushes: pre watchers first (the default `flush: \'pre\'`), then the renders, then post watchers. So the three `quantity.value++` in one handler reached the watcher as one call, `(4, 1)`, and the history got one step.',
      '`flush: \'sync\'` runs the watcher on every write, at once, so it saw 1→2, 2→3 and 3→4. That is the point of sync watchers, and their cost: no batching, a call for every write, and they run in the middle of your code. Often cleaner is to record history where the change is made (a `setQuantity()` that pushes before it writes) and keep watchers for reacting to the result.',
      'Batching is why ten changes cost one render. It also means a watcher is the wrong tool for counting changes, logging every step, or anything that needs the in-between values.'
    ]
  },
  solution: [
    { predict: 'one' },
    { save: 'app.js', replace: ['    })\n    function plusThree', '    }, { flush: \'sync\' })\n    function plusThree'] },
    'reload'
  ]
}
