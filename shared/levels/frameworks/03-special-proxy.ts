// Framework deep dives 1.3: today's special never shows. The menu is reactive (Maya edits it in place), and the page
// marks the item that `=== SPECIAL`, an object taken from the plain list. Every item the template gets is a proxy, and a
// proxy is never the object it wraps. Learn: compare ids (or toRaw) across the reactive boundary, never identities.
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from '../web/checks'
import { MENU_SOURCE, VUE_PAGE, shows, vueSite } from './site'
import type { FrameworksScenario } from './types'

/** The identity check; the fix compares ids. */
export const SAME = '      return item === SPECIAL'

const APP = `// The menu (Jonas): Maya can sell out an item, and today's special gets its badge.
import { createApp, reactive } from 'vue'
import { formatPrice } from './money.js'
import { MENU } from './menu.js'

// Maya picks today's special every morning
const SPECIAL = MENU[2]

const App = {
  name: 'Menu',
  setup() {
    // reactive, so Sold out shows as soon as Maya marks it
    const menu = reactive(MENU)
    function isSpecial(item) {
${SAME}
    }
    function sellOut(item) {
      item.soldOut = true
    }
    console.log('Special today:', SPECIAL.name)
    return { menu, isSpecial, sellOut, formatPrice }
  },
  template: \`
    <ul class="products" id="menu">
      <li v-for="item in menu" :key="item.id" class="product" :id="item.id">
        <span class="photo"></span>
        <span>
          <span class="name">{{ item.name }}<span v-if="isSpecial(item)" class="special">Today's special</span></span>
          <span class="price">{{ item.soldOut ? 'Sold out' : formatPrice(item.price) + ' €' }}</span>
        </span>
        <button class="add" type="button" :id="'sell-' + item.id" @click="sellOut(item)">Mark sold out</button>
      </li>
    </ul>
  \`
}

createApp(App).mount('#app')
`

export const specialProxy: FrameworksScenario = {
  id: 'frameworks-03-special-proxy',
  track: 'frameworks',
  kind: 'scenario',
  title: 'Today\'s special never shows',
  difficulty: 2,
  minutes: 6,
  teaches: 'proxy identity',
  story: [
    'Maya picks the cinnamon bun as today\'s special, and the menu should give it a badge. Jonas made the menu reactive so Sold out shows the moment Maya taps it, and marks the special with `item === SPECIAL`. The Console says “Special today: Cinnamon bun”, but no item has a badge.',
    'Predict which item gets the badge. Then fix `app.js` so the special has its badge and Mark sold out still works. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'badge',
      form: 'one',
      prompt: '`SPECIAL` is `MENU[2]`, the cinnamon bun from the plain list; the menu the template loops over is `reactive(…)` and holds that very object. `isSpecial(item)` returns `item === SPECIAL`. Which item gets the badge?',
      options: [
        { id: 'none', text: 'None: every item the template gets from a reactive list is a proxy, and a proxy is never `===` the object it wraps.', fact: shows('badges', 0) },
        { id: 'bun', text: 'The cinnamon bun: the reactive menu holds the same object.' },
        { id: 'all', text: 'All three: a proxy compares equal to anything.' },
        { id: 'error', text: 'None, and a TypeError in the Console: proxies can\'t be compared.' }
      ],
      answer: 'none',
      rule: 'A reactive object hands out proxies for what it holds; a proxy and its original are two values, so compare ids (or `toRaw(item) === SPECIAL`) across the reactive boundary.'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: [
      { id: 'badges', steps: [{ count: '.special' }] },
      { id: 'bun', steps: [{ count: '#bun .special' }] },
      { id: 'sold', steps: [{ click: '#sell-bun' }, { text: '#bun .price' }] },
      { id: 'still', steps: [{ count: '#bun .special' }] }
    ]
  },
  setup: () => ({ files: vueSite('Menu', { 'app.js': APP, 'menu.js': MENU_SOURCE }), observed: null, picked: null }),
  goals: [
    predictedGoal('Predict which item gets the badge', 1),
    probesGoal('badge', 'The cinnamon bun, and only it, has the Today\'s special badge, also once it is sold out', { badges: 1, bun: 1, sold: 'Sold out', still: 1 }, { clean: true })
  ],
  hints: [
    'The Reactivity panel shows the Menu render, and `isSpecial` runs for every item in it. Which value does the loop hand `isSpecial`: the bun from `MENU`, or something else?',
    '`reactive()` wraps each object you read from it in a proxy: `item` in the loop is the bun\'s proxy, `SPECIAL` the bun itself. Two values, the same data.',
    'Compare what stays the same on both sides, the id: line 15, `return item.id === SPECIAL.id`. Save, then Reload.'
  ],
  debrief: {
    title: 'A proxy is not the object it wraps',
    paragraphs: [
      'The reactive menu holds the plain cinnamon bun, but it never hands it out: every object you read from a reactive object comes back wrapped in its own proxy (made once and cached, so it is the same proxy each time). `item === SPECIAL` compares the proxy with the plain object, two different values, so it was false for every item.',
      'Compare something both sides share: an id (`item.id === SPECIAL.id`), or unwrap the proxy first (`toRaw(item) === SPECIAL`). Or keep the special inside the reactive world (`const special = menu[2]`, a proxy too), so both sides are proxies. Vue\'s own array methods do the unwrapping for you: `menu.includes(SPECIAL)` and `menu.indexOf(SPECIAL)` find the plain object, which makes mixing the two look safe until an `===` doesn\'t.',
      'The same trap: a `Set` or `Map` keyed by plain objects, asked with a proxy; selection state (`selected === item`) when one side came from an API and the other from the store; `===` in a test between what you passed in and what the component holds.'
    ]
  },
  solution: [
    { predict: 'none' },
    { save: 'app.js', replace: [SAME, '      return item.id === SPECIAL.id'] },
    'reload'
  ]
}
