// Other edits a player may make to a Debugging level (State & async): real fixes the goals must accept (the ones the
// debriefs name among them), and tempting non-fixes they must reject. The unit tests check that every edit applies to
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
  ]
}
