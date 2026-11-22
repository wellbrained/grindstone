// Framework deep dives 6.2: the basket class that breaks Vue. Ben's Basket class keeps its lines in a private field
// (#lines). Jonas makes an instance reactive; every method then runs with the proxy as `this`, and a proxy has no
// private fields: a TypeError at the first render. Learn: a class with private fields (or any object a library owns)
// can't live behind a proxy; keep it raw (markRaw, or a shallowRef) and tell Vue when it changed (triggerRef).
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from '../web/checks'
import { MENU_SOURCE, VUE_PAGE, vueSite } from './site'
import type { FrameworksScenario } from './types'

/** The instance made reactive; the fix keeps it raw in a shallowRef. */
export const DEEP = '    const basket = reactive(new Basket())'

const BASKET = `// The basket as a class (Ben, from the till's code): its lines are private, only its methods change them.
export class Basket {
  #lines = []

  add(item) {
    const line = this.#lines.find(each => each.id === item.id)
    if (line) line.quantity += 1
    else this.#lines.push({ id: item.id, name: item.name, quantity: 1 })
  }

  get count() {
    return this.#lines.reduce((sum, line) => sum + line.quantity, 0)
  }

  get lines() {
    return [...this.#lines]
  }
}
`

const APP = `// The basket page (Jonas): Ben's Basket class, made reactive for the page.
import { createApp, reactive } from 'vue'
import { MENU } from './menu.js'
import { Basket } from './basket.js'

const App = {
  name: 'Basket',
  setup() {
${DEEP}
    function add(item) {
      basket.add(item)
    }
    return { menu: MENU, basket, add }
  },
  template: \`
    <p class="cart" id="count">Basket ({{ basket.count }})</p>
    <ul class="products">
      <li v-for="item in menu" :key="item.id" class="product">
        <span class="photo"></span>
        <span class="name">{{ item.name }}</span>
        <button class="add" type="button" :id="'add-' + item.id" @click="add(item)">Add</button>
      </li>
    </ul>
    <section class="box">
      <h2>Your basket</h2>
      <p v-for="line in basket.lines" :key="line.id" class="line">{{ line.quantity }} × {{ line.name }}</p>
    </section>
  \`
}

createApp(App).mount('#app')
`

export const privateFields: FrameworksScenario = {
  id: 'frameworks-17-private-fields',
  track: 'frameworks',
  kind: 'scenario',
  title: 'The basket class that breaks Vue',
  difficulty: 3,
  minutes: 7,
  teaches: 'markRaw',
  story: [
    'Ben wrote the till\'s basket as a class, `Basket`, with its lines in a private field (`#lines`): only its methods may change them. Jonas reuses it on the website and makes it reactive so the page follows it. The page shows the shop\'s header and nothing else, and the Console has a red error.',
    'Predict what happens. Then fix `app.js` so the page shows the basket and follows every Add. Leave `basket.js` as it is: the till uses Ben\'s class too. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'load',
      form: 'one',
      prompt: '`basket = reactive(new Basket())`, and the template reads `basket.count`, a getter that uses `this.#lines`. What happens when the page loads?',
      options: [
        { id: 'works', text: 'It works: Vue makes the private field reactive too.' },
        { id: 'stale', text: 'The page shows “Basket (0)” and never changes: Vue can\'t see private fields, so it never re-renders.' },
        { id: 'warn', text: 'A Vue warning that classes can\'t be reactive, and the page shows the basket without updates.' },
        { id: 'error', text: 'A TypeError at the first render: the getter runs with the proxy as `this`, and a proxy has none of the class\'s private fields.', fact: { says: 'Uncaught TypeError' } }
      ],
      answer: 'error',
      rule: 'Private fields belong to the object, and a proxy is another object: methods called through `reactive()` throw. Keep such an object raw (`markRaw`, or a `shallowRef`) and trigger the page yourself.'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: [
      { id: 'start', steps: [{ text: '#count' }] },
      { id: 'count', steps: [{ click: '#add-croissant' }, { click: '#add-croissant' }, { click: '#add-rye' }, { text: '#count' }] },
      { id: 'lines', steps: [{ count: '.line' }] }
    ]
  },
  setup: () => ({ files: vueSite('Basket', { 'app.js': APP, 'basket.js': BASKET, 'menu.js': MENU_SOURCE }), observed: null, picked: null }),
  goals: [
    predictedGoal('Predict what happens', 1),
    probesGoal('basket', 'The page shows the basket and follows every Add, with no error', { start: 'Basket (0)', count: 'Basket (3)', lines: 2 }, { clean: true })
  ],
  hints: [
    'Read the error: which object did the getter run on? `reactive()` hands out a proxy, and methods called on it get the proxy as `this`.',
    'A private field can only be read on the very object that has it; the proxy is another object. Keep the basket raw: a `shallowRef` holds the instance as it is, and `triggerRef` tells Vue when it changed.',
    'On line 9, keep the instance raw: `const basket = shallowRef(new Basket())`; in `add`, call `basket.value.add(item)` and then `triggerRef(basket)`; import `shallowRef` and `triggerRef` from \'vue\'. Save, then Reload.'
  ],
  debrief: {
    title: 'Some objects can\'t live behind a proxy',
    paragraphs: [
      '`reactive(obj)` returns a Proxy, and calling `basket.count` through it runs the getter with the proxy as `this`. `this.#lines` then asks the proxy for a private field, and private fields belong only to the instance the class made. The engine throws: “Cannot read private member #lines from an object whose class did not declare it”. Vue itself leaves a `Date`, a DOM node or a frozen object unwrapped; the trap is an object of your own (or a library\'s) class that keeps private state: `reactive()` wraps it, and its methods then run on the proxy.',
      'Keep such objects raw. `shallowRef(new Basket())` holds the instance without wrapping it, and `triggerRef(basket)` after a change re-renders what read it. `markRaw(obj)` is the other tool: it marks an object so Vue never proxies it, even inside reactive state (`reactive({ basket: markRaw(new Basket()) })`), again with something like a version ref to tell Vue it changed.',
      'Libraries\' objects belong here too: a map instance, an editor, a chart, an SDK client. Vue tracking their insides costs time at best and breaks them at worst.'
    ]
  },
  solution: [
    { predict: 'error' },
    { save: 'app.js', replace: [DEEP, '    const basket = shallowRef(new Basket())'] },
    { save: 'app.js', replace: ['      basket.add(item)', '      basket.value.add(item)\n      triggerRef(basket)'] },
    { save: 'app.js', replace: ['import { createApp, reactive } from \'vue\'', 'import { createApp, shallowRef, triggerRef } from \'vue\''] },
    'reload'
  ]
}
