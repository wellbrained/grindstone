// Framework deep dives 4.2: the draft that never saves. The basket is a ref holding an object, and a watcher saves a
// draft whenever it changes. `watch(basket, …)` on a ref fires only when `.value` is replaced; adding a line changes the
// object inside, so nothing is saved. Learn: watching a ref is shallow; add `{ deep: true }` (or watch what you need
// with a getter).
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from '../web/checks'
import { MENU_SOURCE, VUE_PAGE, shows, vueSite } from './site'
import type { FrameworksScenario } from './types'

/** The shallow watch; the fix makes it deep. */
export const SHALLOW = '    watch(basket, (now) => {'

const APP = `// The basket with a saved draft (Jonas): if the tablet restarts, the draft brings the basket back.
import { createApp, ref, watch } from 'vue'
import { MENU } from './menu.js'

const App = {
  name: 'Basket',
  setup() {
    const basket = ref({ lines: [] })
    const saved = ref('No draft yet')
${SHALLOW}
      saved.value = 'Draft saved: ' + now.lines.map(line => line.name).join(', ')
      console.log(saved.value)
    })
    const add = item => basket.value.lines.push({ id: item.id, name: item.name })
    const clear = () => { basket.value = { lines: [] } }
    return { menu: MENU, basket, saved, add, clear }
  },
  template: \`
    <ul class="products">
      <li v-for="item in menu" :key="item.id" class="product">
        <span class="photo"></span>
        <span class="name">{{ item.name }}</span>
        <button class="add" type="button" :id="'add-' + item.id" @click="add(item)">Add</button>
      </li>
    </ul>
    <section class="box">
      <h2>Your basket</h2>
      <p id="lines">{{ basket.lines.length }} in the basket</p>
      <button class="action" type="button" id="clear" @click="clear">Clear basket</button>
      <p class="note" id="saved" role="status">{{ saved }}</p>
    </section>
  \`
}

createApp(App).mount('#app')
`

export const shallowWatch: FrameworksScenario = {
  id: 'frameworks-11-shallow-watch',
  track: 'frameworks',
  kind: 'scenario',
  title: 'The draft that never saves',
  difficulty: 2,
  minutes: 6,
  teaches: 'deep watch',
  story: [
    'The kitchen\'s tablet restarts now and then, so Jonas saves a draft of every basket: a watcher on `basket` saves it whenever it changes. Lena adds a croissant and a rye loaf. The page says “2 in the basket” and still “No draft yet”.',
    'Predict what the draft line says. Then fix `app.js` so every Add saves a draft. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'saved',
      form: 'one',
      prompt: '`basket = ref({ lines: [] })`, watched with `watch(basket, …)`. Add pushes into `basket.value.lines`. Lena adds two things. What does the draft line say?',
      options: [
        { id: 'saved', text: '“Draft saved: Butter croissant, Rye loaf”: refs are deeply reactive.' },
        { id: 'first', text: '“Draft saved: Butter croissant”: the watcher fires once, then needs `deep`.' },
        { id: 'warn', text: '“No draft yet”, and Vue warns that a ref of an object needs `deep`.' },
        { id: 'none', text: '“No draft yet”: watching a ref fires when `.value` is replaced; a push changes the object inside, which a ref\'s watcher doesn\'t look into.', fact: shows('saved', 'No draft yet') }
      ],
      answer: 'none',
      rule: 'Watching a ref is shallow (only `.value =` triggers it), though the object inside is reactive; `{ deep: true }`, or a getter of what you need, watches inside it.'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: [
      { id: 'saved', steps: [{ click: '#add-croissant' }, { click: '#add-rye' }, { text: '#saved' }] },
      { id: 'lines', steps: [{ text: '#lines' }] },
      { id: 'cleared', steps: [{ click: '#clear' }, { text: '#saved' }] },
      { id: 'again', steps: [{ click: '#add-bun' }, { text: '#saved' }] }
    ]
  },
  setup: () => ({ files: vueSite('Basket', { 'app.js': APP, 'menu.js': MENU_SOURCE }), observed: null, picked: null }),
  goals: [
    predictedGoal('Predict what the draft line says', 1),
    probesGoal('saved', 'Every Add saves the draft, and so does Clear basket', { saved: 'Draft saved: Butter croissant, Rye loaf', lines: '2 in the basket', cleared: 'Draft saved:', again: 'Draft saved: Cinnamon bun' }, { clean: true })
  ],
  hints: [
    'Tap Clear basket: now the draft saves. What does Clear do that Add doesn\'t?',
    'Clear replaces `basket.value`; Add changes the object inside it. A watcher on a ref compares `.value` with what it was, and that is still the same object after a push.',
    'Watch deeply: pass `{ deep: true }` as the watcher\'s third argument, after the callback. On line 13, `})` becomes `}, { deep: true })`. Save, then Reload.'
  ],
  debrief: {
    title: 'A ref\'s watcher looks at .value only',
    paragraphs: [
      'A ref of an object is reactive all the way down: the template saw the push and showed “2 in the basket”. But `watch(ref, …)` tracks `ref.value` only, so it fires when `.value` is replaced (Clear) and not when the object inside changes (Add). Vue stays shallow on purpose: walking a big object on every change costs time.',
      'Say what you want: `{ deep: true }` walks the whole object and fires on any change inside it; `watch(() => basket.value.lines.length, …)` fires only when the count changes; `watch(() => basket.value.lines.map(line => line.id), …)` when a line is added, removed or replaced. Watching a reactive object (`watch(state, …)`) is deep without asking, and `deep: 1` (Vue 3.5) limits how far down it looks.',
      'With a deep watcher, the callback\'s old and new values are the same object when it was changed in place: compare copies, or the parts you watch, if you need the difference.'
    ]
  },
  solution: [
    { predict: 'none' },
    { save: 'app.js', replace: ['    })\n    const add', '    }, { deep: true })\n    const add'] },
    'reload'
  ]
}
