// Breakpoints & stepping 5.5: the café's weekly bread order is priced by weight, twelve breads in a loop. The total is
// 4.80 € too low because the 7th bread's weight was typed in kilos (0.75) instead of grams (750). Nothing is red.
// Learn: a conditional breakpoint stops only in the round where something is off, instead of stepping through twelve.
import { ORDER_PAGE, orderSite } from './bakery'
import { probeGoal } from './checks'
import type { DebugScenario } from './types'

/** What the café's order should cost (the twelve breads at their weights). */
export const WHOLESALE_TOTAL = '61.92'

const BREADS = `// The café next door orders these every Monday, priced by weight (Maya types
// them in from the café's email: grams, and the price per kilo).
export const breads = [
  { name: 'Sourdough loaf', grams: 900, perKg: 7.2 },
  { name: 'Country white', grams: 800, perKg: 5.5 },
  { name: 'Spelt loaf', grams: 750, perKg: 8.4 },
  { name: 'Seeded loaf', grams: 800, perKg: 7.8 },
  { name: 'Baguette', grams: 250, perKg: 9.6 },
  { name: 'Walnut loaf', grams: 600, perKg: 11.5 },
  { name: 'Rye loaf', grams: 0.75, perKg: 6.4 },
  { name: 'Brioche', grams: 500, perKg: 10.8 },
  { name: 'Potato bread', grams: 700, perKg: 6.6 },
  { name: 'Olive ciabatta', grams: 450, perKg: 10.2 },
  { name: 'Milk rolls (6)', grams: 360, perKg: 9.5 },
  { name: 'Fruit loaf', grams: 650, perKg: 9.8 }
]
`

const WHOLESALE = `// The café's weekly order: every bread priced by its weight, then the total.
import { breads } from './breads.js'
import { formatPrice } from './money.js'

export function orderTotal() {
  let total = 0
  for (const bread of breads) {
    const price = bread.grams / 1000 * bread.perKg
    total += price
  }
  return total
}

document.querySelector('#count').textContent = String(breads.length)
document.querySelector('#wholesale-total').textContent = formatPrice(orderTotal())
`

const APP = `// The café's order page (only Maya and the café see it).
import { orderTotal } from './wholesale.js'

// Handy while debugging: type orderTotal() in the Console.
Object.assign(window, { orderTotal })
`

export const seventhItem: DebugScenario = {
  id: 'debugging-25-seventh-item',
  track: 'debugging',
  kind: 'scenario',
  title: 'It only goes wrong on the 7th item',
  difficulty: 3,
  minutes: 7,
  teaches: 'conditional',
  story: [
    'The café next door pays our bread bill every Monday. Their owner: “Your page says 57.12 €. By our own sums it should be 61.92 €. We\'d rather pay what is right.”',
    'Twelve breads, one loop: stepping through every round is slow. Record (the total is worked out as the page loads), Stop, and put a breakpoint with a condition on the loop\'s price line, so it stops only where a price looks wrong. Fix what you find, then Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'wholesale.js',
    debugger: true,
    probes: [{ id: 'total', steps: [{ text: '#wholesale-total' }] }]
  },
  setup: () => ({
    files: orderSite({ 'app.js': APP, 'wholesale.js': WHOLESALE, 'breads.js': BREADS }, {
      main: ['<section class="summary" aria-label="The café\'s order">', '  <h2>Café order, this Monday</h2>', '  <p><span id="count"></span> breads, total <strong id="wholesale-total"></strong> €</p>', '</section>']
    }, ['cart.js', 'products.js']),
    observed: null,
    picked: null
  }),
  goals: [probeGoal('total', `The café's order totals “${WHOLESALE_TOTAL}”`, 'total', WHOLESALE_TOTAL)],
  hints: [
    'The total is 4.80 € too low, so one bread\'s price is off. In `wholesale.js`, put a breakpoint on line 9 (`total += price`), Record, Stop, then type a condition for it in the Debugger\'s Breakpoints list: `price < 1`. Resume (F8): which bread is it?',
    'It stops once, with `bread` the Rye loaf: `grams` is `0.75`, and 0.75 g of bread costs almost nothing. Maya typed its weight in kilos; every other bread is in grams.',
    'In `breads.js`, line 10, the Rye loaf should weigh `750` grams: `{ name: \'Rye loaf\', grams: 750, perKg: 6.4 }`. Save, then Reload.'
  ],
  debrief: {
    title: 'Let the breakpoint do the waiting',
    paragraphs: [
      'The code was right; one row of data was not, and only one round of the loop went wrong. Stepping through twelve rounds to find it works, but it is slow, and with a thousand rows it does not work at all.',
      'A conditional breakpoint stops only where its condition holds, here `price < 1`. In a recording it is checked on the values each round had, so it found the 7th bread at once; `bread.grams < 10` or `bread.name === \'Rye loaf\'` would have found it too.',
      'When a total is a bit off, look for the one row that is: a unit mixed up (kilos and grams), a missing zero, a comma for a point. A check that refuses odd data (a loaf of under 10 g) would have caught it before a customer did.'
    ]
  },
  solution: [{ save: 'breads.js', replace: ['grams: 0.75', 'grams: 750'] }, 'reload']
}
