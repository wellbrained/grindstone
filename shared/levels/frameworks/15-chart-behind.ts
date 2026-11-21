// Framework deep dives 5.3: the chart one order behind. The kitchen screen lists today's orders, and a small chart
// library draws a bar per row of that list; a watcher on the orders calls it. A watcher runs before the render by
// default, so the chart reads the old rows, one order behind. Learn: `flush: 'post'` runs a watcher after Vue has
// updated the DOM (watchPostEffect is the same for an effect).
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from '../web/checks'
import { VUE_PAGE, shows, vueSite } from './site'
import type { FrameworksScenario } from './types'

/** The watcher that draws; the fix runs it after the render. */
export const DRAWS = '    watch(() => orders.length, () => drawChart(\'#orders\', \'#chart\'))'

const CHART = `// A tiny chart library (Ben found it): one bar per row of a list already on the page.
export function drawChart(listSelector, chartSelector) {
  const rows = document.querySelectorAll(listSelector + ' li')
  const chart = document.querySelector(chartSelector)
  chart.replaceChildren(...[...rows].map(row => {
    const bar = document.createElement('span')
    bar.className = 'bar'
    bar.style.width = Number(row.dataset.items) * 12 + 'px'
    return bar
  }))
  chart.dataset.bars = String(rows.length)
  chart.setAttribute('aria-label', rows.length + ' bars')
}
`

const STYLE = `
.bar {
  display: block;
  height: 10px;
  margin: 4px 0;
  border-radius: 3px;
  background: #c98a4b;
}
`

const APP = `// The kitchen screen (Jonas): today's orders, and the chart of how big each one is.
import { createApp, reactive, watch } from 'vue'
import { drawChart } from './chart.js'

const App = {
  name: 'Kitchen',
  setup() {
    const orders = reactive([{ id: 1041, items: 3 }, { id: 1042, items: 5 }])
    let next = 1043
${DRAWS}
    const take = () => { orders.push({ id: next++, items: 2 + (next % 4) }) }
    return { orders, take }
  },
  mounted() {
    drawChart('#orders', '#chart')
  },
  template: \`
    <section class="box">
      <h2>Today's orders</h2>
      <ol id="orders"><li v-for="order in orders" :key="order.id" :data-items="order.items">Order {{ order.id }}: {{ order.items }} items</li></ol>
      <button class="action" type="button" id="take" @click="take">Take a phone order</button>
      <h2>Order sizes</h2>
      <div id="chart" role="img"></div>
    </section>
  \`
}

createApp(App).mount('#app')
`

export const chartBehind: FrameworksScenario = {
  id: 'frameworks-15-chart-behind',
  track: 'frameworks',
  kind: 'scenario',
  title: 'The chart one order behind',
  difficulty: 2,
  minutes: 6,
  teaches: 'flush post',
  story: [
    'The kitchen screen lists today\'s orders, and under it a small chart library draws a bar for each row of the list. A watcher on the orders redraws it. Ben takes a phone order: the list gets a third order, the chart still has two bars. After the next order, three.',
    'Predict how many bars the chart has. Then fix `app.js` so the chart always has a bar per order. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'bars',
      form: 'one',
      prompt: 'The watcher `watch(() => orders.length, () => drawChart(…))` redraws the chart from the list\'s `<li>` rows. There are 2 orders; Ben takes one more. How many bars does the chart have?',
      options: [
        { id: 'three', text: '3: the watcher runs after the change.' },
        { id: 'two', text: '2: a watcher runs before the render by default, so the list still has two rows when `drawChart` reads them.', fact: shows('bars', 2) },
        { id: 'zero', text: '0: the chart is emptied while Vue renders the list.' },
        { id: 'four', text: '4: the watcher and `mounted` both add a bar.' }
      ],
      answer: 'two',
      rule: 'A watcher\'s default flush is \'pre\': it runs before Vue updates the DOM. Code that reads the DOM needs `flush: \'post\'` (or `watchPostEffect`).'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: [
      { id: 'start', steps: [{ count: '#chart .bar' }] },
      { id: 'bars', steps: [{ click: '#take' }, { count: '#chart .bar' }] },
      { id: 'more', steps: [{ click: '#take' }, { click: '#take' }, { count: '#chart .bar' }] },
      { id: 'rows', steps: [{ count: '#orders li' }] }
    ]
  },
  setup: () => ({ files: vueSite('Kitchen', { 'app.js': APP, 'chart.js': CHART }, STYLE), observed: null, picked: null }),
  goals: [
    predictedGoal('Predict how many bars the chart has', 1),
    probesGoal('bars', 'The chart has a bar for every order, right after each new one', { start: 2, bars: 3, more: 5, rows: 5 }, { clean: true })
  ],
  hints: [
    'Take an order and read the Reactivity panel: what runs first, the watcher or the Kitchen render?',
    'Watchers run before the render by default (`flush: \'pre\'`), so a watcher sees the new data and the old DOM. `drawChart` reads the DOM.',
    'Run the watcher after the render, line 10: add `{ flush: \'post\' }` as its third argument: `watch(() => orders.length, () => drawChart(\'#orders\', \'#chart\'), { flush: \'post\' })`. Save, then Reload.'
  ],
  debrief: {
    title: 'Post-flush for code that reads the DOM',
    paragraphs: [
      'When the orders changed, Vue queued two jobs: the watcher and the Kitchen render. Pre watchers run first, so the watcher could react before the render (and even change state the render then uses). The chart library, though, reads the `<li>` rows, and they were still the old ones.',
      '`flush: \'post\'` puts the watcher after the renders: the DOM is up to date when it runs. `watchPostEffect` is the same for an effect, `onUpdated` for a whole component. `await nextTick()` inside a pre watcher works too, but says less about why.',
      'Any third-party code that measures or reads the page (charts, maps, a masonry grid, a scroll position) belongs in a post-flush watcher or after nextTick.'
    ]
  },
  solution: [
    { predict: 'two' },
    { save: 'app.js', replace: [DRAWS, '    watch(() => orders.length, () => drawChart(\'#orders\', \'#chart\'), { flush: \'post\' })'] },
    'reload'
  ]
}
