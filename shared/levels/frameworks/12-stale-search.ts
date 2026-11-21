// Framework deep dives 4.3: results for the wrong word. A watcher on the search field asks the menu search for every
// change; a short word takes longer to answer than a long one, so "c" answers after "cr" and its results win. Learn: an
// async watcher must drop a stale answer: `onWatcherCleanup` (or the callback's third argument) runs before the next
// run, where it can mark the old one cancelled.
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from '../web/checks'
import { VUE_PAGE, shows, vueSite } from './site'
import type { FrameworksScenario } from './types'

/** Where the answer is taken, stale or not; the fix drops a stale one. */
export const TAKES = '      results.value = await searchMenu(query)'

const SEARCH = `// The menu search (Ben's API, as the tablet sees it): a short word matches more and takes longer.
const MENU = ['Butter croissant', 'Cinnamon bun', 'Rye loaf', 'Chocolate croissant', 'Carrot cake']

export function searchMenu(query) {
  const found = MENU.filter(name => name.toLowerCase().includes(query.toLowerCase()))
  const delay = query.length < 2 ? 300 : 60
  return new Promise(resolve => setTimeout(() => resolve(found), delay))
}
`

const APP = `// The menu search (Jonas): type, and the matching items show below.
import { createApp, ref, watch } from 'vue'
import { searchMenu } from './search.js'

const App = {
  name: 'Search',
  setup() {
    const query = ref('')
    const results = ref([])
    watch(query, async (query) => {
${TAKES}
      console.log('Results for', JSON.stringify(query))
    })
    return { query, results }
  },
  template: \`
    <section class="box">
      <label for="search">Search the menu</label>
      <input id="search" type="search" v-model="query" autocomplete="off">
      <ul class="list" id="results"><li v-for="name in results" :key="name" class="line">{{ name }}</li></ul>
    </section>
  \`
}

createApp(App).mount('#app')
`

export const staleSearch: FrameworksScenario = {
  id: 'frameworks-12-stale-search',
  track: 'frameworks',
  kind: 'scenario',
  title: 'Results for the wrong word',
  difficulty: 3,
  minutes: 8,
  teaches: 'watcher cleanup',
  story: [
    'The search field asks the menu search for every change. Lena types “c”, then “cr”, looking for a croissant. For a moment the croissants show, then the list fills with cinnamon buns and carrot cake. The Console says the last results were for “c”.',
    'Predict which results stay. Then fix `app.js` so only the answer for what is in the field now is shown; `search.js` stands for Ben\'s API, so leave it as it is. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'results',
      form: 'one',
      prompt: 'The watcher does `results.value = await searchMenu(query)`. “c” takes 300 ms to answer, “cr” 60 ms. Lena types “c”, then, a moment later, “r” (two keystrokes, “cr” while “c” is still on its way). Which results are on screen half a second later?',
      options: [
        { id: 'cr', text: 'The ones for “cr”: Vue runs the watcher for the latest value only.' },
        { id: 'c', text: 'The ones for “c”: each change started its own search, “cr” answered first, and “c”\'s late answer overwrote it.', fact: shows('results', 'Butter croissantCinnamon bunChocolate croissantCarrot cake') },
        { id: 'both', text: 'Both lists one after the other: a ref keeps every value it was given.' },
        { id: 'none', text: 'None: Vue cancels a watcher that is still waiting when its source changes.' }
      ],
      answer: 'c',
      rule: 'Vue doesn\'t wait for an async watcher or cancel it: every change starts a new run, and the last to finish wins. Register a cleanup (`onWatcherCleanup`) that marks the run stale, and drop its answer.'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: [
      { id: 'results', steps: [{ type: '#search', value: 'c' }, { type: '#search', value: 'cr' }, { wait: 500 }, { text: '#results' }] },
      // and every search still shows its answer when nobody types on
      { id: 'single', steps: [{ type: '#search', value: 'rye' }, { wait: 200 }, { text: '#results' }] },
      { id: 'slow', steps: [{ type: '#search', value: 'c' }, { wait: 500 }, { text: '#results' }] }
    ]
  },
  setup: () => ({ files: vueSite('Search', { 'app.js': APP, 'search.js': SEARCH }), observed: null, picked: null }),
  goals: [
    predictedGoal('Predict which results stay', 1),
    probesGoal('results', 'The results are always for what is in the field: “cr” after “c”, and a slow search on its own still shows', { results: 'Butter croissantChocolate croissant', single: 'Rye loaf', slow: 'Butter croissantCinnamon bunChocolate croissantCarrot cake' }, { clean: true })
  ],
  hints: [
    'Read the Console: in which order did the answers come back? The watcher ran twice, and both runs are still waiting when the second starts.',
    'Vue doesn\'t cancel a watcher\'s earlier run. Before each new run it calls the cleanup the last run registered: that is where the old run can learn it is stale.',
    'On line 11, take the answer only while the run is current: `let stale = false`, `onWatcherCleanup(() => { stale = true })`, then `const found = await searchMenu(query)` and `if (!stale) results.value = found`. Import `onWatcherCleanup` from \'vue\'. Save, then Reload.'
  ],
  debrief: {
    title: 'The last answer to arrive wins, unless you drop it',
    paragraphs: [
      'A watcher\'s callback runs once per change, and an `async` one is just a function that returns a promise: Vue doesn\'t wait for it and doesn\'t stop it. “c” and “cr” started two searches; “cr” answered after 60 ms, “c” after 300 ms, and each run wrote its answer when it came. The slow, stale one came last.',
      'Before running the callback again (and when the watcher stops), Vue calls the cleanup the previous run registered: `onWatcherCleanup(fn)` (Vue 3.5, called before the first `await`), or the third argument of the callback, `(query, old, onCleanup) => …`. Mark the run stale there and ignore its answer, or abort its request (`AbortController`, then `controller.abort()` in the cleanup).',
      'The same race hides in every “fetch when this changes” watcher: a route param, a selected id, a filter. A debounce makes it rarer, never impossible: only dropping the stale answer fixes it.'
    ]
  },
  solution: [
    { predict: 'c' },
    { save: 'app.js', replace: [TAKES, '      let stale = false\n      onWatcherCleanup(() => { stale = true })\n      const found = await searchMenu(query)\n      if (!stale) results.value = found'] },
    { save: 'app.js', replace: ['import { createApp, ref, watch } from \'vue\'', 'import { createApp, onWatcherCleanup, ref, watch } from \'vue\''] },
    'reload'
  ]
}
