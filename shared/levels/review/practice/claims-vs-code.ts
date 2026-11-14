// Practice tasks for Claims vs. code (ADR 0008): two per scenario, about 30 s each, one small file. "Spot it": one of
// Sous's claims doesn't hold; comment on it (the claim, or the line that breaks it) as a false claim and request
// changes. "Verdict": do the claims hold? Two pull requests keep every claim and should be approved.
import { DESCRIPTION_PATH } from '../diff'
import { spotIt, verdict } from './tasks'

const SPOT_TASK = 'One of Sous\'s claims doesn\'t hold. Comment on it (the claim, or the line that breaks it) as a false claim, and request changes.'
const VERDICT_TASK = 'Do Sous\'s claims hold? Approve it, or request changes on the claim that doesn\'t, and say why in one line.'

export const firstOrder = spotIt({
  id: 'ai-practice-first-order',
  practises: 'ai-06-empty-basket',
  title: 'No orders yet',
  task: SPOT_TASK,
  pr: {
    number: 52,
    title: 'Name the last pickup in the welcome line',
    branch: 'sous/welcome-last-order',
    description: ['The welcome line on the order page also names the pickup time of the customer\'s last order.'],
    claims: ['Shows when the last order was picked up', 'Works for a customer who has never ordered'],
    base: {
      'welcome.js': `// The "Welcome back" line on the order page.
export function welcomeText(customer) {
  return \`Welcome back, \${customer.name}!\`
}
`
    },
    head: {
      'welcome.js': `// The "Welcome back" line on the order page.
export function welcomeText(customer) {
  const last = customer.orders[customer.orders.length - 1]
  return \`Welcome back, \${customer.name}! Your last order was picked up at \${last.pickupAt}.\`
}
`
    }
  },
  issues: [{
    id: 'no-orders',
    path: 'welcome.js',
    lines: [3, 4],
    breaks: [1],
    categories: ['false-claim'],
    title: 'a customer with no orders gets `last.pickupAt` of `undefined`: a TypeError',
    explanation: 'With no orders, `customer.orders[-1]` is `undefined`, and reading `.pickupAt` from it throws. The claim names exactly the case the code never handles.'
  }],
  tempting: [{ claim: 0, why: 'it does, for a customer with orders: the last one is at the end of the list.' }],
  hint: 'For a customer with no orders, what is `customer.orders[customer.orders.length - 1]`, and what does `.pickupAt` do with it?',
  why: 'With no orders, `last` is `undefined`, and `last.pickupAt` throws a TypeError: the claim about new customers names the one case the code never handles.',
  solution: [
    { comment: DESCRIPTION_PATH, lines: [3, 3], category: 'false-claim', text: 'With no orders, last is undefined and last.pickupAt throws.' },
    { submit: 'request-changes' }
  ]
})

export const emptySearch = verdict({
  id: 'ai-practice-empty-search',
  practises: 'ai-06-empty-basket',
  title: 'An empty search',
  task: VERDICT_TASK,
  pr: {
    number: 54,
    title: 'Search anywhere in the name',
    branch: 'sous/search-anywhere',
    description: ['The search box finds a word anywhere in a product\'s name, not only at its start.'],
    claims: ['“croissant” finds “Butter croissant”', 'An empty search still shows every product'],
    base: {
      'search.js': `// The search box above the products.
export function search(products, query) {
  return products.filter(product => product.name.toLowerCase().startsWith(query.toLowerCase()))
}
`
    },
    head: {
      'search.js': `// The search box above the products: a word anywhere in the name counts too (Maya).
export function search(products, query) {
  const wanted = query.trim().toLowerCase()
  return products.filter(product => product.name.toLowerCase().includes(wanted))
}
`
    }
  },
  issues: [],
  tempting: [
    { claim: 1, why: 'it does: every name includes the empty string, so nothing is filtered out.' },
    { path: 'search.js', lines: [4, 4], why: '`includes` is true for the empty string, as `startsWith` was: an empty search keeps every product.' }
  ],
  hint: 'What does `\'Sourdough loaf\'.includes(\'\')` return?',
  why: 'Every string includes the empty string, so an empty search keeps every product as before, and “croissant” is found inside “Butter croissant”: both claims hold. Approve.',
  solution: [{ submit: 'approve', summary: 'Both claims hold: includes(\'\') is true, so an empty search shows everything.' }]
})

export const justARename = spotIt({
  id: 'ai-practice-just-a-rename',
  practises: 'ai-07-just-a-refactor',
  title: 'Just a rename',
  task: SPOT_TASK,
  pr: {
    number: 56,
    title: 'Name the cents',
    branch: 'sous/name-the-cents',
    description: ['A clearer name for the variable in `lineTotal`.'],
    claims: ['Renames `cents` to `totalInCents`', 'No behaviour change'],
    base: {
      'receipt.js': `// What a basket line costs, rounded to the cent.
export function lineTotal(line) {
  const cents = Math.round(line.price * line.quantity * 100)
  return cents / 100
}
`
    },
    head: {
      'receipt.js': `// What a basket line costs, rounded to the cent.
export function lineTotal(line) {
  const totalInCents = Math.floor(line.price * line.quantity * 100)
  return totalInCents / 100
}
`
    }
  },
  issues: [{
    id: 'floor',
    path: 'receipt.js',
    lines: [3, 3],
    breaks: [1],
    categories: ['false-claim'],
    title: '`Math.floor` instead of `Math.round`: totals round down now',
    explanation: '`Math.floor` always rounds down, `Math.round` to the nearest cent. A rename that also changes how totals round is a behaviour change.'
  }],
  tempting: [
    { claim: 0, why: 'it does rename it, on both lines.' },
    { path: 'receipt.js', lines: [4, 4], removed: [4, 4], why: 'the same division, by the new name.' }
  ],
  hint: 'Compare the old and the new line 3 word by word, past the name.',
  why: 'The new line 3 also swaps `Math.round` for `Math.floor`, so totals round down: a rename that changes behaviour. Read every token of a “rename only” change.',
  solution: [
    { comment: 'receipt.js', lines: [3, 3], category: 'false-claim', text: 'Math.floor instead of Math.round: not just a rename.' },
    { submit: 'request-changes' }
  ]
})

export const reduceRefactor = verdict({
  id: 'ai-practice-reduce-refactor',
  practises: 'ai-07-just-a-refactor',
  title: 'The loop as a reduce',
  task: VERDICT_TASK,
  pr: {
    number: 58,
    title: 'Count the receipt\'s items with reduce',
    branch: 'sous/reduce-items',
    description: ['The loop in `itemsOnReceipt` becomes one `reduce`, like the totals next to it.'],
    claims: ['No behaviour change', 'An empty receipt still counts 0'],
    base: {
      'receipt.js': `// How many items a receipt lists.
export function itemsOnReceipt(lines) {
  let count = 0
  for (const line of lines) count += line.quantity
  return count
}
`
    },
    head: {
      'receipt.js': `// How many items a receipt lists.
export function itemsOnReceipt(lines) {
  return lines.reduce((count, line) => count + line.quantity, 0)
}
`
    }
  },
  issues: [],
  tempting: [
    { claim: 1, why: 'it does: with the start value `0`, `reduce` returns 0 for an empty list.' },
    { path: 'receipt.js', lines: [3, 3], why: '`reduce` starts at `0` and adds every quantity, as the loop did.' }
  ],
  hint: 'What does `reduce` return for an empty list when it is given a start value?',
  why: 'With `0` as its start value, `reduce` adds every quantity to 0 and returns 0 for an empty receipt, like the loop: no behaviour change. Approve.',
  solution: [{ submit: 'approve', summary: 'Same count: reduce starts at 0, so an empty receipt is still 0.' }]
})

export const coffeeBeans = spotIt({
  id: 'ai-practice-coffee-beans',
  practises: 'ai-08-all-sizes',
  title: 'Every bag size',
  task: SPOT_TASK,
  pr: {
    number: 60,
    title: 'Larger bags of coffee beans',
    branch: 'sous/bean-bags',
    description: ['Adds the larger bags of beans the shop sells now.'],
    claims: ['The 250 g bag costs 6.50 € as before', 'Tested with every size: 250 g, 500 g and 1 kg'],
    base: {
      'beans.js': `// Coffee beans to take home.
export const BAGS = { '250 g': 6.5 }

export function bagPrice(size) {
  return BAGS[size]
}
`
    },
    head: {
      'beans.js': `// Coffee beans to take home: larger bags since June.
export const BAGS = { '250 g': 6.5, '500 g': 12 }

export function bagPrice(size) {
  return BAGS[size]
}
`
    }
  },
  issues: [{
    id: 'no-kilo',
    path: 'beans.js',
    lines: [2, 2],
    breaks: [1],
    says: [0],
    categories: ['false-claim'],
    title: '`BAGS` has no 1 kg bag: its price is `undefined`',
    explanation: '`BAGS` lists 250 g and 500 g only, so `bagPrice(\'1 kg\')` is `undefined`. A test of every size could not have passed.'
  }],
  tempting: [{ claim: 0, why: 'it does: `\'250 g\': 6.5`, as before.' }],
  hint: 'Which sizes does `BAGS` have a price for? Compare them with the sizes the test report names.',
  why: '`BAGS` has no 1 kg bag, so its price is `undefined`: a test of every size could not have passed. Check a test report\'s cases against the code.',
  solution: [
    { comment: DESCRIPTION_PATH, lines: [3, 3], category: 'false-claim', text: 'There is no 1 kg bag in BAGS, so this test can\'t have passed.' },
    { submit: 'request-changes' }
  ]
})

export const testedAtTwelve = verdict({
  id: 'ai-practice-tested-at-twelve',
  practises: 'ai-08-all-sizes',
  title: 'Free from twelve',
  task: VERDICT_TASK,
  pr: {
    number: 62,
    title: 'Free delivery for big orders',
    branch: 'sous/free-delivery-12',
    description: ['Jonas wants big orders delivered for free.'],
    claims: ['Free delivery from 12 items', 'Tested with 11 items (3.50 €) and 12 items (free)', 'Smaller orders still pay 3.50 €'],
    base: {
      'delivery.js': `// Delivery by bike costs 3.50 €.
export function deliveryFee(count) {
  return 3.5
}
`
    },
    head: {
      'delivery.js': `// Delivery by bike costs 3.50 €, and is free from 12 items (Jonas).
export function deliveryFee(count) {
  if (count > 12) return 0
  return 3.5
}
`
    }
  },
  issues: [{
    id: 'from-thirteen',
    path: 'delivery.js',
    lines: [3, 3],
    breaks: [0, 1],
    categories: ['false-claim'],
    title: '`count > 12` makes delivery free from 13 items, not 12',
    explanation: '`12 > 12` is false, so 12 items pay 3.50 €: the test report says 12 was free. From 12 is `count >= 12`.'
  }],
  hint: 'Work out `deliveryFee(12)`.',
  why: '`count > 12` is false for 12 items, so they pay 3.50 €: the report says 12 was free, and that can\'t be. Request changes.',
  solution: [
    { comment: 'delivery.js', lines: [3, 3], category: 'false-claim', text: '12 > 12 is false: 12 items still pay.' },
    { submit: 'request-changes', summary: '12 items aren\'t free: the test report can\'t be right.' }
  ]
})

export const closedOnMondays = spotIt({
  id: 'ai-practice-closed-on-mondays',
  practises: 'ai-09-linked-issue',
  title: 'Closed on Mondays',
  task: 'Read issue #150 under the description first. One of Sous\'s claims doesn\'t hold: comment on it as a false claim, and request changes.',
  pr: {
    number: 151,
    title: 'Correct the opening times in the header',
    branch: 'sous/fix-150',
    description: ['Changes the opening times in the header.'],
    claims: ['Fixes #150', 'Only the header changes'],
    fixes: {
      number: 150,
      title: 'The header says we are open on Mondays',
      author: 'Ben',
      body: ['The header reads “Open Monday to Saturday”. We are closed on Mondays and open on Sundays.']
    },
    base: {
      'hours.js': `// The opening times in the header.
export function openingText() {
  return 'Open Monday to Saturday, 7:00 to 18:00'
}
`
    },
    head: {
      'hours.js': `// The opening times in the header.
export function openingText() {
  return 'Open Monday to Saturday, 7:00 to 19:00'
}
`
    }
  },
  issues: [{
    id: 'wrong-part',
    path: 'hours.js',
    lines: [3, 3],
    breaks: [0],
    categories: ['false-claim'],
    title: 'it changes the closing hour; #150 is about the days',
    explanation: 'Issue #150 says the days are wrong: closed Monday, open Sunday. The pull request moves 18:00 to 19:00 and leaves “Monday to Saturday” as it was.'
  }],
  tempting: [{ claim: 1, why: 'it does: one line of `hours.js`, the header\'s text.' }],
  hint: 'Which part of the header does issue #150 say is wrong, and which part does the pull request change?',
  why: 'Issue #150 is about the days; the pull request changes the closing hour. “Fixes #150” is checked against the issue, not against the diff.',
  solution: [
    { comment: DESCRIPTION_PATH, lines: [2, 2], category: 'false-claim', text: '#150 is about the days (closed Monday, open Sunday); this changes the hour.' },
    { submit: 'request-changes' }
  ]
})

export const greyedOut = verdict({
  id: 'ai-practice-greyed-out',
  practises: 'ai-09-linked-issue',
  title: 'Greyed out',
  task: VERDICT_TASK,
  pr: {
    number: 153,
    title: 'Grey out sold-out products',
    branch: 'sous/fix-152',
    description: ['Sold-out products are shown at half opacity, so customers see they are gone.'],
    claims: ['Fixes #152', 'Products in stock look as before'],
    fixes: {
      number: 152,
      title: 'Sold-out products can still be ordered',
      author: 'Maya',
      body: ['The sourdough was sold out at 10:00, and three more were ordered after that. Sold-out products must not go into the basket.']
    },
    base: {
      'stock.js': `// Sold-out products (Maya marks them in the morning).
export function markSoldOut(item, product) {
  item.classList.toggle('sold-out', product.left === 0)
}
`
    },
    head: {
      'stock.js': `// Sold-out products (Maya marks them in the morning).
export function markSoldOut(item, product) {
  item.classList.toggle('sold-out', product.left === 0)
  // greyed out, so customers see it is gone
  item.style.opacity = product.left === 0 ? '0.5' : '1'
}
`
    }
  },
  issues: [{
    id: 'still-orderable',
    path: 'stock.js',
    lines: [4, 5],
    breaks: [0],
    categories: ['false-claim'],
    title: 'greyed out, but Add still works: #152 asks that sold-out products can\'t be ordered',
    explanation: 'The change only makes a sold-out product look faded. Its Add button works as before, so the sourdough from #152 still goes into the basket.'
  }],
  tempting: [{ claim: 1, why: 'they do: opacity `1` is how they looked before.' }],
  hint: 'What does issue #152 ask for, and what can a customer still do with a greyed-out product?',
  why: 'Greying it out changes how a product looks; #152 is that sold-out products still go into the basket. Add works as before, so this doesn\'t fix it. Request changes.',
  solution: [
    { comment: DESCRIPTION_PATH, lines: [2, 2], category: 'false-claim', text: 'Add still works on a sold-out product: #152 isn\'t fixed.' },
    { submit: 'request-changes', summary: 'Greyed out isn\'t sold out: customers can still order it.' }
  ]
})

export const rememberedSearch = spotIt({
  id: 'ai-practice-remembered-search',
  practises: 'ai-10-same-but-faster',
  title: 'Remembered search',
  task: SPOT_TASK,
  pr: {
    number: 64,
    title: 'Remember search results',
    branch: 'sous/search-cache',
    description: ['Each search result is kept, so typing on does not filter the products again.'],
    claims: ['Faster while you type', 'Same results as before'],
    base: {
      'search.js': `// The search box above the products.
export function search(products, query) {
  return products.filter(product => product.name.toLowerCase().includes(query.toLowerCase()))
}
`
    },
    head: {
      'search.js': `// The search box above the products. Results are kept, so typing on is faster.
const results = {}

export function search(products, query) {
  const key = query.toLowerCase()[0]
  results[key] ??= products.filter(product => product.name.toLowerCase().includes(query.toLowerCase()))
  return results[key]
}
`
    }
  },
  issues: [{
    id: 'first-letter',
    path: 'search.js',
    lines: [5, 5],
    breaks: [1],
    categories: ['false-claim'],
    title: 'the key is the first letter only: “cro” gets the results kept for “c”',
    explanation: 'Every search that starts with the same letter shares one result: “cro” answers with everything “c” found, the pain au chocolat too. The key has to be the whole query.'
  }],
  tempting: [{ claim: 0, why: 'it is faster, for a search it remembers. Whether it is right is the other claim.' }],
  hint: 'What is `key` for `c`, and for `cro`? Which results does `cro` get?',
  why: 'The key is the first letter only, so `cro` gets the results kept for `c`. A cache is right only when its key holds everything the answer depends on.',
  solution: [
    { comment: 'search.js', lines: [5, 5], category: 'false-claim', text: 'The key is the first letter: cro gets the results of c.' },
    { submit: 'request-changes' }
  ]
})

export const todayOnce = verdict({
  id: 'ai-practice-today-once',
  practises: 'ai-10-same-but-faster',
  title: 'Open today?',
  task: VERDICT_TASK,
  pr: {
    number: 66,
    title: 'Work out “open today” once',
    branch: 'sous/open-today-once',
    description: ['The header asks `openToday` on every render, and the till tablet keeps the page open all week.'],
    claims: ['Same answer as before', 'Faster: the date is read once'],
    base: {
      'hours.js': `// "Open today" in the header. We are closed on Mondays.
export function openToday() {
  return new Date().getDay() !== 1
}
`
    },
    head: {
      'hours.js': `// "Open today" in the header. We are closed on Mondays.
// worked out once, not on every render (Sous)
const OPEN_TODAY = new Date().getDay() !== 1

export function openToday() {
  return OPEN_TODAY
}
`
    }
  },
  issues: [{
    id: 'day-of-loading',
    path: 'hours.js',
    lines: [3, 3],
    breaks: [0],
    categories: ['false-claim'],
    title: '`OPEN_TODAY` is the answer of the day the page loaded, all week long',
    explanation: 'It is worked out once, when the page loads. On the till tablet the page stays open for days, so on Monday it still says what Sunday said.'
  }],
  tempting: [{ claim: 1, why: 'it is read once now. The question is whether once is enough.' }],
  hint: 'The till tablet keeps the page open all week. When is `OPEN_TODAY` worked out, and when again?',
  why: '`OPEN_TODAY` is worked out once, when the page loads, so a page open all week keeps the first day\'s answer. A value that changes with time can\'t be kept forever. Request changes.',
  solution: [
    { comment: 'hours.js', lines: [3, 3], category: 'false-claim', text: 'Worked out once: a page open over Monday still says open.' },
    { submit: 'request-changes', summary: 'The answer goes stale after midnight on a page that stays open.' }
  ]
})
