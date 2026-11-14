// Practice tasks for Invented APIs (ADR 0008): two per scenario, about 30 s each over one small file. "Spot it":
// Sous calls something that isn't there (a method, an option, an export, a deprecated call, a package); comment on it
// and request changes. "Verdict": does every call exist, and is it used right? Three use only real APIs that look
// invented (`at(-1)` and `findLast`, `Intl.ListFormat`, `structuredClone`) and should be approved; one imports a file
// that isn't there, and one uses a real API the wrong way (`toSorted`'s copy thrown away: a bug, not an invented API).
import { CART, MONEY, PRODUCTS } from '../../debugging/bakery'
import { withEdits } from '../shop'
import { spotIt, verdict } from './tasks'

const SPOT_TASK = 'Sous calls something that isn\'t there. Comment on that line, and request changes.'
const VERDICT_TASK = 'Does every call Sous makes exist, and do what Sous thinks? Approve it, or request changes on the line that doesn\'t, and say why in one line.'

export const noSum = spotIt({
  id: 'ai-practice-no-sum',
  practises: 'ai-16-just-added',
  title: 'Add it all up',
  task: SPOT_TASK,
  pr: {
    number: 76,
    title: 'Show the basket total',
    branch: 'sous/basket-total',
    description: ['The total under the list that Maya asked for, from the basket\'s items.'],
    claims: ['Shows the basket\'s total under the list', 'Only adds `total.js`'],
    base: { 'cart.js': CART },
    head: {
      'cart.js': CART,
      'total.js': `// The basket's total, under the list (Maya).
import { cart } from './cart.js'
import { formatPrice } from './money.js'

const total = document.querySelector('#order-total')

export function renderTotal() {
  total.textContent = formatPrice(cart.items.sum(item => item.price))
}
`
    }
  },
  issues: [{
    id: 'no-sum',
    path: 'total.js',
    lines: [8, 8],
    breaks: [0],
    categories: ['invented-api', 'false-claim'],
    title: 'arrays have no `sum`: this throws, and no total shows',
    explanation: 'JavaScript arrays have no `sum` method: `cart.items.sum` is undefined, and calling it throws “cart.items.sum is not a function”. `reduce` adds up a list.'
  }],
  tempting: [{ path: 'total.js', lines: [3, 3], why: '`money.js` does export `formatPrice`: every price on the page goes through it.' }],
  hint: 'Is `sum` a method arrays have? Which one adds up a list?',
  why: 'Arrays have no `sum`: calling it throws “is not a function”. `cart.items.reduce((sum, item) => sum + item.price, 0)` is the real way.',
  solution: [
    { comment: 'total.js', lines: [8, 8], category: 'invented-api', text: 'Arrays have no sum(): this throws. reduce adds them up.' },
    { submit: 'request-changes' }
  ]
})

export const reallyThere = verdict({
  id: 'ai-practice-really-there',
  practises: 'ai-16-just-added',
  title: 'Really there',
  task: VERDICT_TASK,
  pr: {
    number: 77,
    title: 'Helpers for the newest items',
    branch: 'sous/latest-items',
    description: ['Two small helpers for the basket\'s newest items, for the Just added note and Maya\'s croissant deal.'],
    claims: ['`at(-1)` and `findLast` are built into arrays: no library', 'An empty basket gives undefined, not an error'],
    base: { 'cart.js': CART },
    head: {
      'cart.js': CART,
      'latest.js': `// The basket's newest items, for the "Just added" note and Maya's croissant deal.

// the item added last, or undefined for an empty basket
export function latestItem(items) {
  return items.at(-1)
}

// the latest item of one product, or undefined when there is none
export function latestOf(items, id) {
  return items.findLast(item => item.id === id)
}
`
    }
  },
  issues: [],
  tempting: [
    { path: 'latest.js', lines: [5, 5], why: '`at` is real (every browser since 2022): a negative index counts from the end, so `at(-1)` is the last item, and undefined for an empty list.' },
    { path: 'latest.js', lines: [10, 10], why: '`findLast` is real (every browser since 2022): like `find`, from the end, and undefined when nothing matches.' }
  ],
  hint: 'Before you flag a method you don\'t know, look it up: is `at` real? Is `findLast`?',
  why: 'Both are real: `at(-1)` is the last item and `findLast` searches from the end, and both give undefined for an empty basket. Approve.',
  solution: [{ submit: 'approve', summary: 'at(-1) and findLast are real array methods, and both give undefined for an empty basket.' }]
})

export const pickupFormat = spotIt({
  id: 'ai-practice-pickup-format',
  practises: 'ai-17-whole-euros',
  title: 'Pick up at 07:00',
  task: 'Sous passes an option that isn\'t there. Comment on that line, and request changes.',
  pr: {
    number: 78,
    title: 'Pickup time on the confirmation',
    branch: 'sous/pickup-time-format',
    description: ['The confirmation names the pickup time, the way the shop writes times.'],
    claims: ['Shows the pickup time as 07:00', 'Uses the browser\'s own `Intl.DateTimeFormat`'],
    base: {},
    head: {
      'pickup.js': `// The pickup time on the confirmation, as the shop writes it: 07:00 (Maya).
const time = new Intl.DateTimeFormat('en-GB', { format: 'HH:mm' })

export function pickupText(order) {
  return \`Pick it up at \${time.format(order.pickupAt)}.\`
}
`
    }
  },
  issues: [{
    id: 'ignored-format',
    path: 'pickup.js',
    lines: [2, 2],
    breaks: [0],
    categories: ['invented-api', 'false-claim'],
    title: '`Intl.DateTimeFormat` has no `format` option: it is ignored, and the date shows instead of 07:00',
    explanation: 'A format string like `HH:mm` is how Moment and Day.js format; Intl ignores an option it doesn\'t know, and writes the date: “Pick it up at 15/11/2026.”'
  }],
  tempting: [{ path: 'pickup.js', lines: [5, 5], why: '`time.format` is real: every Intl formatter has a `format` method. It is the option of that name that isn\'t.' }],
  hint: 'Is `format` an option `Intl.DateTimeFormat` has, or is `HH:mm` how another library writes it? What does Intl do with an option it doesn\'t know?',
  why: 'Intl has no `format` option (format strings are Moment\'s and Day.js\'s way): it ignores it and writes the date. `hour: \'2-digit\', minute: \'2-digit\'` gives 07:00.',
  solution: [
    { comment: 'pickup.js', lines: [2, 2], category: 'invented-api', text: 'Intl has no format option: it is ignored and the date shows. hour and minute: 2-digit.' },
    { submit: 'request-changes' }
  ]
})

export const andList = verdict({
  id: 'ai-practice-and-list',
  practises: 'ai-17-whole-euros',
  title: 'And the last one',
  task: VERDICT_TASK,
  pr: {
    number: 79,
    title: 'The basket in one sentence',
    branch: 'sous/basket-sentence',
    description: ['The confirmation names what was ordered in one sentence.'],
    claims: ['Commas between the names, and “and” before the last', 'No library: the browser\'s own `Intl.ListFormat`'],
    base: {},
    head: {
      'sentence.js': `// The basket in one sentence on the confirmation:
// "Butter croissant, Pain au chocolat and Sourdough loaf" (Maya).
const names = new Intl.ListFormat('en-GB', { style: 'long', type: 'conjunction' })

export function basketSentence(items) {
  return names.format(items.map(item => item.name))
}
`
    }
  },
  issues: [],
  tempting: [
    { path: 'sentence.js', lines: [3, 3], why: '`Intl.ListFormat` and both options are real (every browser since 2021): `conjunction` joins with “and”, and `en-GB` leaves out the comma before it.' },
    { path: 'sentence.js', lines: [6, 6], why: 'the formatter takes a list of strings, so the items\' names go in.' }
  ],
  hint: 'Look it up before you flag it: is `Intl.ListFormat` real, and are `style` and `type` its options?',
  why: '`Intl.ListFormat` is real, with `style` and `type` as its options: “Butter croissant, Pain au chocolat and Sourdough loaf”. Approve.',
  solution: [{ submit: 'approve', summary: 'Intl.ListFormat and its options are real and write the sentence Maya asked for.' }]
})

const RECEIPT = `// One line of the receipt: how many, the name, what they cost.
import { formatPrice } from './money.js'

export function receiptLine(line) {
  return \`\${line.quantity} × \${line.name}  \${formatPrice(line.price * line.quantity)}\`
}
`

export const noDefault = spotIt({
  id: 'ai-practice-no-default',
  practises: 'ai-18-money-helper',
  title: 'No default',
  task: 'Sous imports something that isn\'t there. Comment on that line, and request changes.',
  pr: {
    number: 80,
    title: 'A total line on the receipt',
    branch: 'sous/receipt-total',
    description: ['Adds the receipt\'s last line, the total.'],
    claims: ['Prices still go through `formatPrice` from `money.js`', '`money.js` stays as it is'],
    base: { 'money.js': MONEY, 'receipt.js': RECEIPT },
    head: withEdits({ 'money.js': MONEY, 'receipt.js': RECEIPT }, [
      { path: 'receipt.js', replace: ['import { formatPrice } from \'./money.js\'', 'import money from \'./money.js\''] },
      { path: 'receipt.js', replace: ['${formatPrice(line.price', '${money.formatPrice(line.price'] },
      {
        path: 'receipt.js',
        replace: ['quantity)}`\n}\n', `quantity)}\`
}

// the receipt's last line
export function totalLine(total) {
  return \`Total  \${money.formatPrice(total)}\`
}
`]
      }
    ])
  },
  issues: [{
    id: 'no-default',
    path: 'receipt.js',
    lines: [2, 2],
    also: [{ path: 'receipt.js', lines: [5, 5] }, { path: 'receipt.js', lines: [10, 10] }],
    breaks: [0],
    categories: ['invented-api', 'false-claim'],
    title: '`money.js` has no default export: the import fails, and nothing that uses it runs',
    explanation: '`money.js` has one named export, `formatPrice`. `import money from` asks for a default export it doesn\'t have, and the browser refuses it as the modules load (“does not provide an export named \'default\'”).'
  }],
  tempting: [{ path: 'receipt.js', lines: [8, 9], why: 'a new function for the receipt\'s last line is what the pull request is for; what it calls is the question.' }],
  hint: 'What does `money.js` export? Look at the line the change removed: is there a default to import?',
  why: '`money.js` has only the named export `formatPrice`, no default: `import money from` fails as the page loads. `import * as money` (or the named import, as before) is the real way.',
  solution: [
    { comment: 'receipt.js', lines: [2, 2], category: 'invented-api', text: 'money.js has no default export: this import fails. import * as money, or keep the named import.' },
    { submit: 'request-changes' }
  ]
})

export const noExtension = verdict({
  id: 'ai-practice-no-extension',
  practises: 'ai-18-money-helper',
  title: 'Which file?',
  task: VERDICT_TASK,
  pr: {
    number: 81,
    title: 'A tip under the products',
    branch: 'sous/cheapest-tip',
    description: ['Maya wants a tip under the products: the cheapest thing on the menu.'],
    claims: ['Shows the cheapest product under the list', 'Only adds `tip.js`'],
    base: { 'products.js': PRODUCTS, 'money.js': MONEY },
    head: {
      'products.js': PRODUCTS,
      'money.js': MONEY,
      'tip.js': `// The tip under the products: the cheapest thing on the menu (Maya).
import { products } from './products'
import { formatPrice } from './money.js'

export function tipText() {
  const cheapest = products.reduce((best, product) => product.price < best.price ? product : best)
  return \`Something small? \${cheapest.name}, \${formatPrice(cheapest.price)} €\`
}
`
    }
  },
  issues: [{
    id: 'no-extension',
    path: 'tip.js',
    lines: [2, 2],
    breaks: [0],
    categories: ['invented-api', 'bug', 'false-claim'],
    title: 'there is no file `./products`: without a bundler the browser loads exactly the name, and the page doesn\'t run',
    explanation: 'A bundler would find `products.js` for `./products`; the shop has none, so the browser asks for a file called `products`, which isn\'t there, and no module of the page runs. The import needs `./products.js`, as the one below it has.'
  }],
  tempting: [{ path: 'tip.js', lines: [6, 6], why: 'it keeps the cheaper of the two each time: the cheapest product, without sorting the list.' }],
  hint: 'A browser loads exactly the file an import names. Is there a file called `products`? Compare the two imports.',
  why: 'Without a bundler, `./products` is a file of exactly that name, and there is none: the page doesn\'t load. It needs `./products.js`, like the import below it.',
  solution: [
    { comment: 'tip.js', lines: [2, 2], category: 'invented-api', text: 'There is no file ./products: without a bundler this needs ./products.js.' },
    { submit: 'request-changes', summary: 'The import names a file that isn\'t there, so the page won\'t load.' }
  ]
})

export const getYear = spotIt({
  id: 'ai-practice-get-year',
  practises: 'ai-19-one-listener',
  title: 'The year 126',
  task: 'Sous calls something deprecated that doesn\'t do what Sous thinks. Comment on that line, and request changes.',
  pr: {
    number: 82,
    title: 'This year in the footer',
    branch: 'sous/footer-year',
    description: ['Maya wants this year in the footer, so the page doesn\'t look abandoned.'],
    claims: ['Shows this year in the footer: © 2026 Corner Bakery', 'Only adds `footer.js`'],
    base: {},
    head: {
      'footer.js': `// The footer: the shop's name and this year (Maya: "so the page doesn't look abandoned").
const footer = document.querySelector('#footer')

export function renderFooter() {
  footer.textContent = \`© \${new Date().getYear()} Corner Bakery\`
}
`
    }
  },
  issues: [{
    id: 'get-year',
    path: 'footer.js',
    lines: [5, 5],
    breaks: [0],
    categories: ['invented-api', 'false-claim'],
    title: '`getYear()` is deprecated: it gives the year minus 1900, so the footer says © 126',
    explanation: '`getYear` is a leftover from the first JavaScript, kept so old pages don\'t break: it returns the year minus 1900, 126 in 2026. `getFullYear()` is the one to use.'
  }],
  tempting: [{ path: 'footer.js', lines: [2, 2], why: 'the page\'s footer, found once, when the module loads.' }],
  hint: 'What does `getYear()` return in 2026? Is it the call Sous thinks it is?',
  why: '`getYear()` is deprecated and returns the year minus 1900: © 126. `getFullYear()` gives 2026.',
  solution: [
    { comment: 'footer.js', lines: [5, 5], category: 'invented-api', text: 'getYear() is deprecated and gives 126: use getFullYear().' },
    { submit: 'request-changes' }
  ]
})

const MENU = `// Today's products in the order Maya lists them.
import { products } from './products.js'

export function menu() {
  return products
}
`

export const sortedCopy = verdict({
  id: 'ai-practice-sorted-copy',
  practises: 'ai-19-one-listener',
  title: 'Sorted, but where?',
  task: VERDICT_TASK,
  pr: {
    number: 83,
    title: 'Cheapest first',
    branch: 'sous/cheapest-first',
    description: ['Maya wants the menu cheapest first: the small things sell the big ones.'],
    claims: ['Lists the products cheapest first', 'Maya\'s own list in `products.js` stays in her order'],
    base: { 'menu.js': MENU },
    head: withEdits({ 'menu.js': MENU }, [
      { path: 'menu.js', replace: ['// Today\'s products in the order Maya lists them.', '// Today\'s products, cheapest first (Maya: "the small things sell the big ones").'] },
      { path: 'menu.js', replace: ['  return products\n', '  products.toSorted((a, b) => a.price - b.price)\n  return products\n'] }
    ])
  },
  issues: [{
    id: 'copy-thrown-away',
    path: 'menu.js',
    lines: [5, 6],
    breaks: [0],
    categories: ['bug', 'false-claim'],
    title: '`toSorted` returns a sorted copy, which is thrown away: the menu comes back unsorted',
    explanation: '`toSorted` is real (2023): it leaves `products` alone and returns a sorted copy. Nothing keeps the copy, so `menu()` returns the list in Maya\'s order. A real API used the wrong way is a bug, not an invented API: `return products.toSorted(…)`.'
  }],
  hint: 'Is `toSorted` real? And what does it do: sort `products`, or return a sorted copy?',
  why: '`toSorted` is real, and returns a sorted copy (so Maya\'s list stays as it is, as the second claim says), but the copy is thrown away and `menu()` returns the list unsorted: a bug. Request changes.',
  solution: [
    { comment: 'menu.js', lines: [5, 5], category: 'bug', text: 'toSorted returns a copy, and the copy is thrown away: return products.toSorted(…).' },
    { submit: 'request-changes', summary: 'The sorted copy is never used, so the menu isn\'t sorted.' }
  ]
})

export const openNow = spotIt({
  id: 'ai-practice-open-now',
  practises: 'ai-20-date-library',
  title: 'Open now?',
  task: 'Sous imports a package that isn\'t there. Comment on that line, and request changes.',
  pr: {
    number: 84,
    title: 'Open now, or closed',
    branch: 'sous/open-now',
    description: ['“Open now” or “Closed” next to the opening hours, as Maya asked.'],
    claims: ['Uses `is-shop-open`, a small, popular package', 'Closed on Mondays'],
    base: {},
    head: {
      'hours.js': `// "Open now" or "Closed" next to the opening hours (Maya).
import { isOpen } from 'is-shop-open'

// Tuesday to Sunday (0 is Sunday), 7:00 to 18:00
const OPENING = { days: [2, 3, 4, 5, 6, 0], from: 7, to: 18 }

export function openText(now = new Date()) {
  return isOpen(now, OPENING) ? 'Open now' : 'Closed'
}
`
    }
  },
  issues: [{
    id: 'made-up-package',
    path: 'hours.js',
    lines: [2, 2],
    also: [{ path: 'hours.js', lines: [8, 8] }],
    breaks: [0],
    categories: ['invented-api', 'security', 'false-claim'],
    title: '`is-shop-open` is a package Sous made up: the page can\'t load it',
    explanation: 'The shop has no such package and no build step: the browser can\'t resolve a bare name, and nothing runs. If someone published a package under that name, its code would run in the shop. `getDay()` and `getHours()` do it in two lines.'
  }],
  tempting: [{ path: 'hours.js', lines: [5, 5], why: '`getDay()` counts from Sunday, 0, so Tuesday to Sunday is 2 to 6 and 0, and Monday (1) is left out.' }],
  hint: 'The shop has no build step and no `package.json`. Where would `is-shop-open` come from, and does it exist?',
  why: 'Sous made the package up: the browser can\'t resolve a bare name, and a package someone published under it would run their code in the shop. `getDay()` and `getHours()` are enough.',
  solution: [
    { comment: 'hours.js', lines: [2, 2], category: 'invented-api', text: 'There is no is-shop-open package here, and nobody checked it exists. getDay() and getHours() do it.' },
    { submit: 'request-changes' }
  ]
})

const COPY = `// A copy of the basket for the till, so the till's changes don't touch the page's basket.
export function basketCopy(cart) {
  return JSON.parse(JSON.stringify(cart))
}
`

export const structuredCopy = verdict({
  id: 'ai-practice-structured-clone',
  practises: 'ai-20-date-library',
  title: 'No package needed',
  task: VERDICT_TASK,
  pr: {
    number: 85,
    title: 'Copy the basket with structuredClone',
    branch: 'sous/structured-clone',
    description: ['The till got the pickup time as a string: a JSON copy turns dates into text.'],
    claims: ['A deep copy: changing the copy leaves the basket as it is', '`pickupAt` stays a date', 'No package: `structuredClone` is built into browsers'],
    base: { 'till.js': COPY },
    head: withEdits({ 'till.js': COPY }, [
      { path: 'till.js', replace: ['basket.\n', 'basket.\n// structuredClone keeps dates (JSON turned pickupAt into a string).\n'] },
      { path: 'till.js', replace: ['  return JSON.parse(JSON.stringify(cart))', '  return structuredClone(cart)'] }
    ])
  },
  issues: [],
  tempting: [
    { path: 'till.js', lines: [4, 4], why: '`structuredClone` is real, in every browser since 2022: a deep copy that keeps dates, maps and sets, which a JSON round trip turns into strings and empty objects.' },
    { path: 'till.js', lines: [2, 2], why: 'a comment that says why the change was made: what a reviewer wants to read.' }
  ],
  hint: 'Look it up before you flag it: is `structuredClone` built into browsers, and does it copy deeply?',
  why: '`structuredClone` is real and built in: a deep copy that keeps `pickupAt` a date, with no package. Approve.',
  solution: [{ submit: 'approve', summary: 'structuredClone is built in, copies deeply and keeps dates.' }]
})
