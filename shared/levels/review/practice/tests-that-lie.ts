// Practice tasks for Tests that lie (ADR 0008): two per scenario, about 30 s each, a test file and maybe the code it
// tests. "Spot it": one test doesn't test what it says; comment on the line that doesn't (a missing test) and request
// changes. "Verdict": are the tests honest? Three are, and should be approved: two decimals checked with `toBe`, a mock
// of the till (not of the code under test), and a snapshot that changed by the one line asked for.
import { MONEY } from '../../debugging/bakery'
import { withEdits } from '../shop'
import { spotIt, verdict } from './tasks'

const SPOT_TASK = 'One test doesn\'t test what it says. Comment on the line that doesn\'t, and request changes.'
const VERDICT_TASK = 'Do the tests prove what Sous says? Approve it, or request changes on the test that doesn\'t, and say why in one line.'

const DELIVERY = `// Delivery is free from 20 €, otherwise 3.50 €.
export function deliveryFee(total) {
  return total >= 20 ? 0 : 3.5
}
`

export const ifAroundExpect = spotIt({
  id: 'ai-practice-if-around-expect',
  practises: 'ai-11-all-tests-pass',
  title: 'Only when it passes',
  task: SPOT_TASK,
  pr: {
    number: 62,
    title: 'Test the free delivery',
    branch: 'sous/test-free-delivery',
    description: ['A test for the free delivery Maya announced.'],
    claims: ['Tests that orders from 20 € deliver free', 'Only adds a test: `delivery.js` stays as it is'],
    base: { 'delivery.js': DELIVERY },
    head: {
      'delivery.js': DELIVERY,
      'delivery.test.js': `// Tests for delivery.js.
import { deliveryFee } from './delivery.js'

test('orders from 20 € deliver free', () => {
  const fee = deliveryFee(25)
  if (fee === 0) {
    expect(fee).toBe(0)
  }
})
`
    }
  },
  issues: [{
    id: 'if-guard',
    path: 'delivery.test.js',
    lines: [6, 8],
    breaks: [0],
    categories: ['missing-test', 'false-claim'],
    title: 'the check only runs when the fee is already 0: it can never fail',
    explanation: 'With the `if (fee === 0)` around it, the `expect` runs only when it would pass. Were the fee 3.50, the test would skip its check and pass anyway.'
  }],
  tempting: [{ path: 'delivery.test.js', lines: [5, 5], why: '25 € is over 20 €: the right order to try.' }],
  hint: 'When does the `expect` run? What would this test do if `deliveryFee(25)` returned 3.5?',
  why: 'The `expect` sits inside `if (fee === 0)`: when the fee is wrong, the check never runs and the test passes. A check that only runs when it would pass can\'t fail.',
  solution: [
    { comment: 'delivery.test.js', lines: [6, 6], category: 'missing-test', text: 'The expect only runs when the fee is 0: this test can never fail.' },
    { submit: 'request-changes' }
  ]
})

export const honestTest = verdict({
  id: 'ai-practice-honest-test',
  practises: 'ai-11-all-tests-pass',
  title: 'Two decimals',
  task: VERDICT_TASK,
  pr: {
    number: 64,
    title: 'Test the price format',
    branch: 'sous/test-price-format',
    description: ['Tests for `formatPrice`, which every price on the page goes through.'],
    claims: ['Tests that prices show two decimals', 'Only adds tests: `money.js` stays as it is'],
    base: { 'money.js': MONEY },
    head: {
      'money.js': MONEY,
      'money.test.js': `// Tests for money.js.
import { formatPrice } from './money.js'

test('prices show two decimals', () => {
  expect(formatPrice(2.4)).toBe('2.40')
})

test('nothing costs 0.00', () => {
  expect(formatPrice(0)).toBe('0.00')
})
`
    }
  },
  issues: [],
  tempting: [
    { path: 'money.test.js', lines: [5, 5], why: '`toBe` compares strings by their text: \'2.40\' is \'2.40\'. Only objects and arrays need `toEqual`.' },
    { path: 'money.test.js', lines: [9, 9], why: 'the empty basket\'s case: a total of 0 shows as 0.00, and the test checks it.' }
  ],
  hint: 'Does each test call the code and compare what it returns with a value? Is `toBe` right for a string?',
  why: 'Both tests call `formatPrice` and compare its text with what the page must show, the empty case too, and `toBe` is right for strings. Honest tests: approve.',
  solution: [{ submit: 'approve', summary: 'Both tests call formatPrice and check its text, 0 included.' }]
})

const BASKET = `// The basket's total, from its lines.
export function basketTotal(lines) {
  return lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
}
`

export const mockedTotal = spotIt({
  id: 'ai-practice-mocked-total',
  practises: 'ai-12-mocked',
  title: 'A mock of the answer',
  task: SPOT_TASK,
  pr: {
    number: 66,
    title: 'Test the basket total',
    branch: 'sous/test-basket-total',
    description: ['A first test for the basket total.'],
    claims: ['Tests `basketTotal` with three croissants', '`basket.js` stays as it is'],
    base: { 'basket.js': BASKET },
    head: {
      'basket.js': BASKET,
      'basket.test.js': `// Tests for basket.js.

test('adds up every line', () => {
  const basketTotal = vi.fn().mockReturnValue(7.2)
  const lines = [{ price: 2.4, quantity: 3 }]
  expect(basketTotal(lines)).toBe(7.2)
})
`
    }
  },
  issues: [{
    id: 'mock-not-code',
    path: 'basket.test.js',
    lines: [4, 6],
    breaks: [0],
    categories: ['missing-test', 'false-claim'],
    title: 'the test calls a mock it made, told to return 7.2, never `basket.js`',
    explanation: 'The test never imports `basket.js`: its `basketTotal` is a `vi.fn()` that returns 7.2, and the test checks that it returns 7.2. The real function could return anything.'
  }],
  hint: 'Which `basketTotal` does the test call: the one in `basket.js`, or one it made itself?',
  why: 'The test never imports `basket.js`: its `basketTotal` is a mock told to return 7.2, and the test checks that it does. It tests nothing of the shop.',
  solution: [
    { comment: 'basket.test.js', lines: [4, 4], category: 'missing-test', text: 'This basketTotal is a mock: the real one is never called.' },
    { submit: 'request-changes' }
  ]
})

const ORDER = `// Sends a finished order to the till; the till's own send function is passed in.
export function placeOrder(lines, send) {
  const items = lines.reduce((sum, line) => sum + line.quantity, 0)
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
  send({ items, total })
}
`

export const mockTheTill = verdict({
  id: 'ai-practice-mock-the-till',
  practises: 'ai-12-mocked',
  title: 'Mock the till, not the order',
  task: VERDICT_TASK,
  pr: {
    number: 68,
    title: 'Test what goes to the till',
    branch: 'sous/test-place-order',
    description: ['A test for `placeOrder`, without sending a real order to the till.'],
    claims: ['Tests that an order sends its items and total to the till', 'The till is a mock, so no real order goes out'],
    base: { 'order.js': ORDER },
    head: {
      'order.js': ORDER,
      'order.test.js': `// Tests for order.js: the till is a mock, the order is real.
import { placeOrder } from './order.js'

test('sends the items and the total to the till', () => {
  const send = vi.fn()
  placeOrder([{ price: 2.4, quantity: 2 }], send)
  expect(send).toHaveBeenCalledWith({ items: 2, total: 4.8 })
})
`
    }
  },
  issues: [],
  tempting: [
    { path: 'order.test.js', lines: [5, 5], why: 'a mock of what `placeOrder` talks to, the till, so the test can see what was sent; `placeOrder` itself runs for real.' },
    { claim: 1, why: 'it is: `send` is a `vi.fn()`, so nothing reaches a real till.' }
  ],
  hint: 'Which function is the mock here, and which one is the test about?',
  why: 'The mock stands in for the till that `placeOrder` talks to; `placeOrder` itself runs for real, and the test checks what it sent. That is what mocks are for: approve.',
  solution: [{ submit: 'approve', summary: 'The mock is the till; placeOrder runs for real and its message is checked.' }]
})

const RED_DELIVERY = {
  'delivery.js': `// Delivery is free from 20 €, otherwise 3.50 €.
const FREE_FROM = 10

export function deliveryFee(total) {
  return total >= FREE_FROM ? 0 : 3.5
}
`,
  'delivery.test.js': `// Tests for delivery.js.
import { deliveryFee } from './delivery.js'

test('orders under 20 € pay 3.50 € delivery', () => {
  expect(deliveryFee(12)).toBe(3.5)
})

test('orders from 20 € deliver free', () => {
  expect(deliveryFee(25)).toBe(0)
})
`
}

export const newExpected = spotIt({
  id: 'ai-practice-new-expected',
  practises: 'ai-13-fixed-the-test',
  title: 'Green again',
  task: SPOT_TASK,
  pr: {
    number: 70,
    title: 'Fix the delivery test',
    branch: 'sous/fix-delivery-test',
    description: ['The delivery test has been red since Tuesday: `deliveryFee(12)` returns 0, and the test expected 3.50. It expects 0 now.'],
    claims: ['CI is green again', 'Only the test changes'],
    base: RED_DELIVERY,
    head: withEdits(RED_DELIVERY, [{ path: 'delivery.test.js', replace: ['expect(deliveryFee(12)).toBe(3.5)', 'expect(deliveryFee(12)).toBe(0)'] }])
  },
  issues: [{
    id: 'bent-to-pass',
    path: 'delivery.test.js',
    lines: [5, 5],
    removed: [5, 5],
    categories: ['missing-test'],
    title: 'the test was changed to expect what the code does: small orders now “deliver free”',
    explanation: 'The test\'s name still says small orders pay 3.50 €; its line now expects 0, because that is what `deliveryFee` returns since Tuesday. The test failed for a reason, and the reason was the code.'
  }],
  hint: 'The test\'s name still says 3.50 €. What does the new line expect, and why was it changed?',
  why: 'The name says small orders pay 3.50 €; the new line expects 0 because that is what the code does now. The test was changed to match a bug in `deliveryFee`, so the bug is now “tested”. Fix the code, not the test.',
  solution: [
    { comment: 'delivery.test.js', lines: [5, 5], category: 'missing-test', text: 'The name says 3.50: the code is wrong, not the test.' },
    { submit: 'request-changes' }
  ]
})
const SEARCH = {
  'search.js': `// The search box above the products.
export function search(products, query) {
  const wanted = query.trim().toLowerCase()
  return products.filter(product => wanted && product.name.toLowerCase().includes(wanted))
}
`,
  'search.test.js': `// Tests for search.js.
import { search } from './search.js'

const PRODUCTS = [{ name: 'Butter croissant' }, { name: 'Sourdough loaf' }]

test('finds a product by a word in its name', () => {
  expect(search(PRODUCTS, 'loaf')).toEqual([{ name: 'Sourdough loaf' }])
})

test('an empty search shows every product', () => {
  expect(search(PRODUCTS, '')).toEqual(PRODUCTS)
})
`
}

export const flakyTest = verdict({
  id: 'ai-practice-flaky-test',
  practises: 'ai-13-fixed-the-test',
  title: 'A flaky test',
  task: VERDICT_TASK,
  pr: {
    number: 72,
    title: 'Remove the flaky search test',
    branch: 'sous/remove-flaky-test',
    description: ['The empty-search test kept failing in CI and blocks the release.'],
    claims: ['Removes a flaky test', '`search.js` stays as it is'],
    base: SEARCH,
    head: withEdits(SEARCH, [{
      path: 'search.test.js',
      replace: [`
test('an empty search shows every product', () => {
  expect(search(PRODUCTS, '')).toEqual(PRODUCTS)
})
`, '']
    }])
  },
  issues: [{
    id: 'deleted-test',
    path: 'search.test.js',
    removed: [10, 12],
    breaks: [0],
    categories: ['missing-test', 'false-claim'],
    title: 'the test that failed every time is deleted: it wasn\'t flaky, it found a bug',
    explanation: 'A flaky test passes and fails at random. This one failed on every run, because an empty search no longer shows every product. Deleting it hides the bug and leaves the empty search untested.'
  }],
  tempting: [{ path: 'search.test.js', lines: [6, 8], why: 'the test that stays is fine: a word in the name finds the loaf.' }],
  hint: 'Is a test that fails on every run flaky? What did it check?',
  why: 'A test that fails every run isn\'t flaky: it found something. An empty search no longer shows every product, and deleting the test hides it. Request changes.',
  solution: [
    { comment: 'search.test.js', removed: [11, 11], category: 'missing-test', text: 'It fails every time because the empty search is broken: keep it.' },
    { submit: 'request-changes', summary: 'The test is not flaky: it fails because an empty search shows nothing.' }
  ]
})

export const nanIsANumber = spotIt({
  id: 'ai-practice-nan-is-a-number',
  practises: 'ai-14-full-coverage',
  title: 'A number, every time',
  task: SPOT_TASK,
  pr: {
    number: 74,
    title: 'Average price per item',
    branch: 'sous/average-tested',
    description: ['The average price per item for the offices, with a test for the empty basket.'],
    claims: ['Tested: an empty basket averages 0', 'Every line of `average.js` runs in the tests'],
    base: {},
    head: {
      'average.js': `// The average price per item, for the offices' expense forms.
export function averagePrice(lines) {
  const items = lines.reduce((sum, line) => sum + line.quantity, 0)
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
  return items === 0 ? 0 : total / items
}
`,
      'average.test.js': `// Tests for average.js: every line runs.
import { averagePrice } from './average.js'

test('two croissants average 2.40 €', () => {
  expect(averagePrice([{ price: 2.4, quantity: 2 }])).toBe(2.4)
})

test('an empty basket has an average', () => {
  expect(typeof averagePrice([])).toBe('number')
})
`
    }
  },
  issues: [{
    id: 'typeof-number',
    path: 'average.test.js',
    lines: [9, 9],
    breaks: [0],
    categories: ['missing-test', 'false-claim'],
    title: 'the empty basket\'s test only checks that the average is a number, and NaN is one',
    explanation: 'The `typeof` of NaN is \'number\', so the test passes whether an empty basket averages 0 or NaN. It runs the line and checks nothing that matters: `toBe(0)` would.'
  }],
  tempting: [{ path: 'average.js', lines: [5, 5], why: 'right: with no items the average is 0, not 0 divided by 0.' }],
  hint: 'What is `typeof NaN`?',
  why: '`typeof NaN` is \'number\', so the empty basket\'s test passes whether the average is 0 or NaN. It runs the line and checks nothing that matters: `toBe(0)` would.',
  solution: [
    { comment: 'average.test.js', lines: [9, 9], category: 'missing-test', text: 'NaN is a number too: this needs toBe(0).' },
    { submit: 'request-changes' }
  ]
})

const LINE_TOTAL = `// What a basket line costs. No page in here, so the tests can run it.
export function lineTotal(line) {
  return line.price * line.quantity
}
`

export const closeEnough = verdict({
  id: 'ai-practice-close-enough',
  practises: 'ai-14-full-coverage',
  title: 'Close to the euro',
  task: VERDICT_TASK,
  pr: {
    number: 76,
    title: 'Round line totals to the cent',
    branch: 'sous/round-to-cent',
    description: ['Ben\'s till export showed long decimals: line totals are now rounded to the cent, with a test.'],
    claims: ['Line totals are rounded to the nearest cent', 'Tested to the cent: three pains au chocolat cost 8.40 €'],
    base: { 'prices.js': LINE_TOTAL },
    head: {
      'prices.js': `// What a basket line costs, rounded to the nearest cent (the till's export, Ben).
export function lineTotal(line) {
  return Math.round(line.price * line.quantity * 100) / 100
}
`,
      'prices.test.js': `// Tests for prices.js.
import { lineTotal } from './prices.js'

test('three pains au chocolat cost 8.40 €', () => {
  expect(lineTotal({ price: 2.8, quantity: 3 })).toBeCloseTo(8.4, 0)
})
`
    }
  },
  issues: [{
    id: 'to-the-euro',
    path: 'prices.test.js',
    lines: [5, 5],
    breaks: [1],
    categories: ['missing-test', 'false-claim'],
    title: '`toBeCloseTo(8.4, 0)` checks no decimals: 8.39 passes, and so does anything from 7.91 to 8.89',
    explanation: 'The second argument of `toBeCloseTo` is how many decimals must match; 0 means within half a euro. A test of rounding to the cent needs `toBe(8.4)`, or the default of two decimals.'
  }],
  tempting: [{ path: 'prices.js', lines: [3, 3], why: 'right: it rounds to the nearest cent, so three pains au chocolat cost 8.40 €.' }],
  hint: 'What does the second argument of `toBeCloseTo` say: how many decimals have to match?',
  why: '`toBeCloseTo(8.4, 0)` checks no decimals: anything within half a euro passes, 8.39 too. A test of rounding to the cent needs `toBe(8.4)` or the default precision of 2. Request changes.',
  solution: [
    { comment: 'prices.test.js', lines: [5, 5], category: 'missing-test', text: 'Precision 0 is to the euro: 8.39 would pass. This needs toBe(8.4).' },
    { submit: 'request-changes', summary: 'The test checks to the euro, not the cent.' }
  ]
})

const CONFIRMATION_FILES = {
  'confirmation.js': `// The confirmation the customer sees after ordering.
export function confirmationText(order) {
  return \`Thank you, \${order.name}! Order \${order.id} is in.\`
}
`,
  'confirmation.test.js': `// Tests for confirmation.js.
import { confirmationText } from './confirmation.js'

test('thanks the customer', () => {
  expect(confirmationText({ name: 'Ben', id: 'A-17' })).toMatchInlineSnapshot(\`
    Thank you, Ben! Order A-17 is in.
  \`)
})
`
}

export const snapshotUndefined = spotIt({
  id: 'ai-practice-snapshot-undefined',
  practises: 'ai-15-snapshot-updated',
  title: 'Pick it up when?',
  task: SPOT_TASK,
  pr: {
    number: 78,
    title: 'Pickup time in the confirmation',
    branch: 'sous/confirmation-pickup',
    description: ['The confirmation now says when to pick the order up. The snapshot is updated.'],
    claims: ['Adds the pickup time to the confirmation', 'Snapshot updated: it shows the pickup time'],
    base: CONFIRMATION_FILES,
    head: withEdits(CONFIRMATION_FILES, [
      { path: 'confirmation.js', replace: ['is in.`', 'is in.\\nPick it up at ${order.pickupAt}.`'] },
      { path: 'confirmation.test.js', replace: ['    Thank you, Ben! Order A-17 is in.\n', '    Thank you, Ben! Order A-17 is in.\n    Pick it up at undefined.\n'] }
    ])
  },
  issues: [{
    id: 'undefined-in-snapshot',
    path: 'confirmation.test.js',
    lines: [7, 7],
    breaks: [1],
    categories: ['missing-test', 'false-claim'],
    title: 'the snapshot recorded “Pick it up at undefined.”: the test\'s order has no pickup time',
    explanation: 'The test\'s order has no `pickupAt`, so the code printed undefined, and the snapshot was updated to that. It now expects the wrong text and checks nothing about the pickup time.'
  }],
  tempting: [{ path: 'confirmation.js', lines: [3, 3], why: 'right: real orders have a `pickupAt`. It is the test\'s order that lacks one.' }],
  hint: 'Read the new snapshot line word by word: where would its pickup time come from in the test\'s order?',
  why: 'The test\'s order has no `pickupAt`, so the snapshot recorded “Pick it up at undefined.” and Sous accepted it. A snapshot keeps whatever the code printed, mistakes too: read it before you trust it.',
  solution: [
    { comment: 'confirmation.test.js', lines: [7, 7], category: 'missing-test', text: 'The snapshot says undefined: the test order needs a pickupAt.' },
    { submit: 'request-changes' }
  ]
})

const RECEIPT_FILES = {
  'money.js': MONEY,
  'receipt.js': `// The receipt the till prints for an order, as text.
import { formatPrice } from './money.js'

export function receiptText(lines) {
  const rows = lines.map(line => \`\${line.quantity} × \${line.name}  \${formatPrice(line.price * line.quantity)}\`)
  return rows.join('\\n')
}
`,
  'receipt.test.js': `// Tests for receipt.js.
import { receiptText } from './receipt.js'

test('prints a line per product', () => {
  expect(receiptText([{ name: 'Butter croissant', price: 2.4, quantity: 2 }])).toMatchInlineSnapshot(\`
    2 × Butter croissant  4.80
  \`)
})
`
}

export const snapshotAsAsked = verdict({
  id: 'ai-practice-snapshot-as-asked',
  practises: 'ai-15-snapshot-updated',
  title: 'The line Maya asked for',
  task: VERDICT_TASK,
  pr: {
    number: 80,
    title: 'Pickup line on the receipt',
    branch: 'sous/receipt-pickup',
    description: ['Maya wants every receipt to end with when to pick the order up.'],
    claims: ['Adds Maya\'s pickup line at the end of the receipt', 'Snapshot updated: the only new line is the pickup line'],
    base: RECEIPT_FILES,
    head: withEdits(RECEIPT_FILES, [
      { path: 'receipt.js', replace: ['  return rows.join(\'\\n\')', '  return [...rows, \'Pick up tomorrow from 7:00\'].join(\'\\n\')'] },
      { path: 'receipt.test.js', replace: ['    2 × Butter croissant  4.80\n', '    2 × Butter croissant  4.80\n    Pick up tomorrow from 7:00\n'] }
    ])
  },
  issues: [],
  tempting: [
    { path: 'receipt.test.js', lines: [7, 7], why: 'the new line is exactly the one asked for, and the line above stayed as it was: updating a snapshot is fine once you have read what changed.' },
    { path: 'receipt.js', lines: [6, 6], why: 'the pickup line goes after every product\'s line, as Maya asked.' }
  ],
  hint: 'Compare the snapshot before and after: which line changed, and was it asked for?',
  why: 'The snapshot changed by one line, the one Maya asked for, and the croissants still cost 4.80. An updated snapshot is fine once you have read it. Approve.',
  solution: [{ submit: 'approve', summary: 'One new line, the one asked for; the amounts are as before.' }]
})
