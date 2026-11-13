// Other edits a player may make to a Debugging level (State & async, Breakpoints & stepping): real fixes the goals must
// accept (the ones the debriefs name among them), and tempting non-fixes they must reject. The unit tests check that every edit applies to
// the level's files; e2e/debugging-levels.spec.ts runs them in a real browser.

export interface OtherFix {
  /** What the edit does, for the test's message. */
  name: string
  /** Applied in order to the starting files, like a solution's save steps. */
  edits: { save: string, replace: readonly [string, string] }[]
  /** True: every goal passes after a reload; false: not every goal does. */
  solves: boolean
}

const ORDER_CHAIN = [
  'export function placeOrder() {',
  '  status.textContent = \'Sending your order…\'',
  '  const items = cart.items.map(line => ({ id: line.id, quantity: 1 }))',
  '  fetch(\'/api/orders\', {',
  '    method: \'POST\',',
  '    headers: { \'Content-Type\': \'application/json\' },',
  '    body: JSON.stringify({ items })',
  '  })',
  '    .then((response) => {',
  '      if (!response.ok) throw new Error(`The server answered ${response.status}`)',
  '      response.json()',
  '    })',
  '    .then((order) => {',
  '      status.textContent = `Thanks! Order ${order.number} is in. Pick it up tomorrow from 7:00.`',
  '      clearCart()',
  '    })',
  '    .catch(() => {',
  '      status.textContent = \'Sorry, your order did not go through. Please try again.\'',
  '    })',
  '}'
].join('\n')

const ORDER_AWAIT = [
  'export async function placeOrder() {',
  '  status.textContent = \'Sending your order…\'',
  '  const items = cart.items.map(line => ({ id: line.id, quantity: 1 }))',
  '  try {',
  '    const response = await fetch(\'/api/orders\', {',
  '      method: \'POST\',',
  '      headers: { \'Content-Type\': \'application/json\' },',
  '      body: JSON.stringify({ items })',
  '    })',
  '    if (!response.ok) throw new Error(`The server answered ${response.status}`)',
  '    const order = await response.json()',
  '    status.textContent = `Thanks! Order ${order.number} is in. Pick it up tomorrow from 7:00.`',
  '    clearCart()',
  '  } catch (error) {',
  '    console.error(error)',
  '    status.textContent = \'Sorry, your order did not go through. Please try again.\'',
  '  }',
  '}'
].join('\n')

const SEARCH_ASKS = '  const response = await fetch(`/api/search?q=${encodeURIComponent(words)}`)\n  const products = await response.json()\n  showResults(words, products)\n'

export const otherFixes: Record<string, OtherFix[]> = {
  'debugging-16-object-promise': [
    {
      name: 'waits with .then instead of await',
      edits: [
        { save: 'basket.js', replace: ['  const price = priceOf(product.id)\n', '  priceOf(product.id).then((price) => {\n'] },
        { save: 'basket.js', replace: ['  badge.textContent = String(cart.items.length)\n}', '  badge.textContent = String(cart.items.length)\n  })\n}'] }
      ],
      solves: true
    },
    { name: 'await without async (a SyntaxError)', edits: [{ save: 'basket.js', replace: ['const price = priceOf(', 'const price = await priceOf('] }], solves: false },
    { name: 'async without await', edits: [{ save: 'basket.js', replace: ['export function addToCart', 'export async function addToCart'] }], solves: false }
  ],
  'debugging-17-wrong-results': [
    {
      name: 'cancels the old request, and ignores its AbortError',
      edits: [{
        save: 'search.js',
        replace: [SEARCH_ASKS, '  controller?.abort()\n  controller = new AbortController()\n  try {\n    const response = await fetch(`/api/search?q=${encodeURIComponent(words)}`, { signal: controller.signal })\n    const products = await response.json()\n    showResults(words, products)\n  } catch (error) {\n    if (error.name !== \'AbortError\') throw error\n  }\n']
      }, { save: 'search.js', replace: ['async function search() {', 'let controller = null\n\nasync function search() {'] }],
      solves: true
    },
    {
      name: 'a counter: only the latest search may show its answer',
      edits: [
        { save: 'search.js', replace: ['async function search() {\n', 'let latest = 0\n\nasync function search() {\n  const ticket = ++latest\n'] },
        { save: 'search.js', replace: ['  showResults(words, products)\n}', '  if (ticket !== latest) return\n  showResults(words, products)\n}'] }
      ],
      solves: true
    },
    {
      name: 'cancels the old request but leaves its AbortError uncaught (red in the Console)',
      edits: [
        { save: 'search.js', replace: ['async function search() {', 'let controller = null\n\nasync function search() {'] },
        { save: 'search.js', replace: ['  const response = await fetch(`/api/search?q=${encodeURIComponent(words)}`)', '  controller?.abort()\n  controller = new AbortController()\n  const response = await fetch(`/api/search?q=${encodeURIComponent(words)}`, { signal: controller.signal })'] }
      ],
      solves: false
    },
    {
      name: 'searching only from four letters on (no request for "cro", the race stays)',
      edits: [{ save: 'search.js', replace: ['if (words.length < 3) return', 'if (words.length < 4) return'] }],
      solves: false
    },
    {
      name: 'a 300 ms debounce alone (the pause is longer)',
      edits: [{ save: 'search.js', replace: ['field.addEventListener(\'input\', search)', 'let timer = null\nfield.addEventListener(\'input\', () => {\n  clearTimeout(timer)\n  timer = setTimeout(search, 300)\n})'] }],
      solves: false
    }
  ],
  'debugging-18-adds-sourdough': [
    { name: 'let instead of const', edits: [{ save: 'app.js', replace: ['  var product = products[i]', '  let product = products[i]'] }], solves: true },
    { name: 'a for…of loop with const', edits: [{ save: 'app.js', replace: ['for (var i = 0; i < products.length; i++) {\n  var product = products[i]\n', 'for (const product of products) {\n'] }], solves: true },
    { name: 'let i alone (product is still shared)', edits: [{ save: 'app.js', replace: ['for (var i = 0;', 'for (let i = 0;'] }], solves: false }
  ],
  'debugging-19-changes-both': [
    { name: 'structuredClone of the defaults', edits: [{ save: 'cart.js', replace: ['{ ...DEFAULTS, id', '{ ...structuredClone(DEFAULTS), id'] }], solves: true },
    { name: 'new options instead of changing the shared ones', edits: [{ save: 'cart.js', replace: ['  line.options.sliced = !line.options.sliced', '  line.options = { ...line.options, sliced: !line.options.sliced }'] }], solves: true },
    { name: 'Object.assign (still a shallow copy)', edits: [{ save: 'cart.js', replace: ['{ ...DEFAULTS, id: product.id, name: product.name }', 'Object.assign({}, DEFAULTS, { id: product.id, name: product.name })'] }], solves: false }
  ],
  'debugging-20-says-it-failed': [
    { name: 'async and await with try/catch', edits: [{ save: 'order.js', replace: [ORDER_CHAIN, ORDER_AWAIT] }], solves: true },
    { name: 'only logging in the catch', edits: [{ save: 'order.js', replace: ['    .catch(() => {\n', '    .catch((error) => {\n      console.error(error)\n'] }], solves: false },
    { name: 'no catch at all', edits: [{ save: 'order.js', replace: ['    .catch(() => {\n      status.textContent = \'Sorry, your order did not go through. Please try again.\'\n    })\n', ''] }], solves: false },
    { name: 'a catch that always thanks', edits: [{ save: 'order.js', replace: ['      status.textContent = \'Sorry, your order did not go through. Please try again.\'', '      status.textContent = \'Thanks! Order 1042 is in. Pick it up tomorrow from 7:00.\'\n      clearCart()'] }], solves: false }
  ],
  'debugging-practice-drop-the-old-day': [
    { name: 'compares with the day the heading shows', edits: [{ save: 'slots.js', replace: ['  const times = await response.json()\n', '  const times = await response.json()\n  if (heading.textContent !== DAYS[day]) return\n'] }], solves: true }
  ],
  'debugging-practice-copy-last-week': [
    { name: 'a copy through JSON', edits: [{ save: 'reorder.js', replace: ['const order = lastWeek', 'const order = JSON.parse(JSON.stringify(lastWeek))'] }], solves: true },
    { name: 'a spread (the items are still shared)', edits: [{ save: 'reorder.js', replace: ['const order = lastWeek', 'const order = { ...lastWeek }'] }], solves: false }
  ],
  'debugging-practice-catch-the-rejection': [
    { name: 'handled where it happens, in reserve.js', edits: [{ save: 'reserve.js', replace: ['if (!response.ok) throw new Error(answer.error)', 'if (!response.ok) return showMessage(answer.error)'] }], solves: true }
  ],
  'debugging-21-discount-twice': [
    { name: 'the discount kept on the page only (deleted from basketTotal)', edits: [{ save: 'cart.js', replace: ['  if (card.checked) total = applyDiscount(total)\n', ''] }], solves: true },
    { name: 'a smaller discount (5%)', edits: [{ save: 'loyalty.js', replace: ['LOYALTY_DISCOUNT = 0.1', 'LOYALTY_DISCOUNT = 0.05'] }], solves: false },
    {
      name: 'no discount anywhere',
      edits: [
        { save: 'cart.js', replace: ['  if (card.checked) total = applyDiscount(total)\n', ''] },
        { save: 'checkout.js', replace: ['  if (card.checked) total = applyDiscount(total)\n', ''] }
      ],
      solves: false
    }
  ],
  'debugging-practice-count-once': [
    { name: 'the stamp left to placeOrder only', edits: [{ save: 'order.js', replace: ['  addStamp()\n', ''] }], solves: true }
  ],
  'debugging-22-misses-last-item': [
    { name: '<= with - 1', edits: [{ save: 'receipt.js', replace: ['i < items.length - 1', 'i <= items.length - 1'] }], solves: true },
    {
      name: 'for…of',
      edits: [{ save: 'receipt.js', replace: ['  for (let i = 0; i < items.length - 1; i++) {\n    const line = document.createElement(\'li\')\n    line.textContent = `${items[i].name} · ${formatPrice(items[i].price)}`\n    list.append(line)\n    total += items[i].price\n  }', '  for (const item of items) {\n    const line = document.createElement(\'li\')\n    line.textContent = `${item.name} · ${formatPrice(item.price)}`\n    list.append(line)\n    total += item.price\n  }'] }],
      solves: true
    },
    { name: 'one round too many (<= items.length)', edits: [{ save: 'receipt.js', replace: ['i < items.length - 1', 'i <= items.length'] }], solves: false }
  ],
  'debugging-practice-no-extra-size': [
    { name: '<= with - 1', edits: [{ save: 'sizes.js', replace: ['i <= sizes.length', 'i <= sizes.length - 1'] }], solves: true }
  ],
  'debugging-23-no-free-delivery': [
    { name: 'the sum rounded to cents as it adds up', edits: [{ save: 'cart.js', replace: ['(sum, item) => sum + item.price', '(sum, item) => Math.round((sum + item.price) * 100) / 100'] }], solves: true },
    { name: 'the total compared as the page shows it', edits: [{ save: 'delivery.js', replace: ['if (total >= FREE_FROM)', 'if (Number(total.toFixed(2)) >= FREE_FROM)'] }], solves: true },
    { name: 'rounded down (Math.floor)', edits: [{ save: 'delivery.js', replace: ['if (total >= FREE_FROM)', 'if (Math.floor(total) >= FREE_FROM)'] }], solves: false },
    { name: 'parseInt', edits: [{ save: 'delivery.js', replace: ['if (total >= FREE_FROM)', 'if (parseInt(total) >= FREE_FROM)'] }], solves: false },
    { name: 'the threshold lowered to 24', edits: [{ save: 'delivery.js', replace: ['export const FREE_FROM = 25', 'export const FREE_FROM = 24'] }], solves: false },
    { name: 'the threshold lowered to 20', edits: [{ save: 'delivery.js', replace: ['export const FREE_FROM = 25', 'export const FREE_FROM = 20'] }], solves: false }
  ],
  'debugging-practice-box-from-six': [
    { name: 'from six, written out', edits: [{ save: 'box.js', replace: ['count > BOX_FROM', 'count >= 6'] }], solves: true }
  ],
  'debugging-24-always-pickup': [
    { name: '== instead of ===', edits: [{ save: 'order.js', replace: ['if (order.method = \'pickup\')', 'if (order.method == \'pickup\')'] }], solves: true },
    { name: 'the value first (\'pickup\' === order.method)', edits: [{ save: 'order.js', replace: ['if (order.method = \'pickup\')', 'if (\'pickup\' === order.method)'] }], solves: true },
    { name: 'the assignment in extra brackets (the linter\'s "I meant it")', edits: [{ save: 'order.js', replace: ['if (order.method = \'pickup\')', 'if ((order.method = \'pickup\'))'] }], solves: false }
  ],
  'debugging-practice-compare-the-day': [
    { name: '== instead of ===', edits: [{ save: 'hours.js', replace: ['if (day = \'Sunday\')', 'if (day == \'Sunday\')'] }], solves: true }
  ],
  'debugging-25-seventh-item': [
    { name: 'a weight under 10 read as kilos', edits: [{ save: 'wholesale.js', replace: ['const price = bread.grams / 1000 * bread.perKg', 'const price = (bread.grams < 10 ? bread.grams * 1000 : bread.grams) / 1000 * bread.perKg'] }], solves: true },
    { name: 'every bread at least 1 €', edits: [{ save: 'wholesale.js', replace: ['    total += price', '    total += Math.max(price, 1)'] }], solves: false }
  ],
  'debugging-practice-comma-price': [
    { name: 'the price as a string with a point', edits: [{ save: 'pastries.js', replace: ['price: \'3,20\'', 'price: \'3.20\''] }], solves: true }
  ]
}
