// Framework deep dives 5.1: the new line that never lights up. Add a line, then mark it new so it flashes: the code
// looks the line up right after the change, before Vue has rendered it. Vue batches DOM updates to the
// next microtask; until then the DOM is the old one. Learn: `await nextTick()` before reading the DOM a change makes.
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from '../web/checks'
import { MENU_SOURCE, VUE_PAGE, vueSite } from './site'
import type { FrameworksScenario } from './types'

/** The lookup right after the change; the fix waits for the render first. */
export const LOOKUP = '      document.querySelector(\'#line-\' + item.id).classList.add(\'new\')'

const APP = `// The quick basket (Jonas): Add puts a line in, and the new line flashes so Ben sees where it went.
import { createApp, reactive } from 'vue'
import { MENU } from './menu.js'

const App = {
  name: 'QuickBasket',
  setup() {
    const lines = reactive([])
    function add(item) {
      lines.push({ id: item.id, name: item.name, quantity: 1 })
${LOOKUP}
    }
    return { menu: MENU, lines, add }
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
      <p v-for="line in lines" :key="line.id" class="line" :id="'line-' + line.id"><span>{{ line.quantity }} × {{ line.name }}</span></p>
    </section>
  \`
}

createApp(App).mount('#app')
`

export const oldDom: FrameworksScenario = {
  id: 'frameworks-13-old-dom',
  track: 'frameworks',
  kind: 'scenario',
  title: 'The new line that never lights up',
  difficulty: 2,
  minutes: 5,
  teaches: 'nextTick',
  story: [
    'Ben takes phone orders on the quick basket: Add puts the line in, and the new line flashes so he sees where it went. He taps Add on the rye loaf. The line appears, it doesn\'t flash, and the Console has a red error.',
    'Predict what happens. Then fix `app.js` so every new line is marked new. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'focus',
      form: 'one',
      prompt: '`add` pushes the line, then runs `document.querySelector(\'#line-\' + item.id).classList.add(\'new\')` on the next line. Ben taps Add on the rye loaf. What happens?',
      options: [
        { id: 'flashes', text: 'The rye loaf\'s line flashes: the push renders it at once.' },
        { id: 'previous', text: 'The line added before flashes instead.' },
        { id: 'error', text: 'A TypeError: Vue renders the new line later, in a microtask after the change, so it isn\'t in the DOM yet and `querySelector` returns null.', fact: { says: 'Uncaught TypeError' } },
        { id: 'nothing', text: 'Nothing at all, and no error: `querySelector` waits until the line exists.' }
      ],
      answer: 'error',
      rule: 'Vue batches DOM updates and applies them in a microtask after the change; `await nextTick()` waits until they are done.'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: [
      { id: 'rye', steps: [{ click: '#add-rye' }, { count: '#line-rye.new' }] },
      { id: 'bun', steps: [{ click: '#add-bun' }, { count: '#line-bun.new' }] },
      { id: 'lines', steps: [{ count: '.line' }] }
    ]
  },
  setup: () => ({ files: vueSite('Quick basket', { 'app.js': APP, 'menu.js': MENU_SOURCE }), observed: null, picked: null }),
  goals: [
    predictedGoal('Predict what happens', 1),
    probesGoal('flash', 'Each new line is marked new as soon as it is added, and no error is left in the Console', { rye: 1, bun: 1, lines: 2 }, { clean: true })
  ],
  hints: [
    'Read the error: what did `querySelector` find? Then look at the Reactivity panel: when does the render come, compared with the error?',
    'The push changes the data; Vue queues one render and runs it in a microtask, after `add` has returned. Until then the page has no line for the rye loaf.',
    'Wait for the render before the lookup on line 11: put `await nextTick()` above it, make `add` `async` (`async function add(item) {`) and import `nextTick` from \'vue\'. Save, then Reload.'
  ],
  debrief: {
    title: 'The DOM catches up in the next microtask',
    paragraphs: [
      'A change to reactive state doesn\'t touch the DOM. It marks the components that read it, and Vue renders them all at once in a microtask after your code is done (that is what lets ten changes in a row cost one render). So right after `lines.push(…)`, the page still has the old list, and the rye loaf\'s line doesn\'t exist yet.',
      '`await nextTick()` waits for that render: after it, the DOM shows every change made before. In a component, a template ref (`ref="lineRows"` on the `v-for`) is the cleaner way to get the element than `querySelector`, but it fills in at the same moment, so the wait is needed either way.',
      'A watcher with `flush: \'post\'` (5.3) or `onUpdated` is the other place where the DOM is up to date; anywhere else, assume it is one render behind.'
    ]
  },
  solution: [
    { predict: 'error' },
    { save: 'app.js', replace: [LOOKUP, '      await nextTick()\n' + LOOKUP] },
    { save: 'app.js', replace: ['    function add(item) {', '    async function add(item) {'] },
    { save: 'app.js', replace: ['import { createApp, reactive } from \'vue\'', 'import { createApp, nextTick, reactive } from \'vue\''] },
    'reload'
  ]
}
