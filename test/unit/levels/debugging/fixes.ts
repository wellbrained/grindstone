// Other edits a player may make to a Debugging level (State & async, Breakpoints & stepping, Performance, Incidents): real fixes the
// goals must accept (the ones the debriefs name among them), and tempting non-fixes they must reject. The unit tests check that every edit applies to
// the level's files; e2e/debugging-levels.spec.ts runs them in a real browser.

export interface OtherFix {
  /** What the edit does, for the test's message. */
  name: string
  /** Chapter 7: roll back to this deploy first (its files replace the starting files), as Roll back does. */
  rollback?: string
  /** Applied in order to the starting files (or the rolled back ones), like a solution's save steps. */
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
  ],
  'debugging-26-request-per-key': [
    { name: 'search on change (Enter, or leaving the field)', edits: [{ save: 'search.js', replace: ['field.addEventListener(\'input\', search)', 'field.addEventListener(\'change\', search)'] }], solves: true },
    { name: 'search when Enter is pressed', edits: [{ save: 'search.js', replace: ['field.addEventListener(\'input\', search)', 'field.addEventListener(\'keydown\', (event) => {\n  if (event.key === \'Enter\') search()\n})'] }], solves: true },
    { name: 'a debounce shorter than the time between two keys (20 ms)', edits: [{ save: 'search.js', replace: ['field.addEventListener(\'input\', search)\n', 'let timer = null\nfield.addEventListener(\'input\', () => {\n  clearTimeout(timer)\n  timer = setTimeout(search, 20)\n})\n'] }], solves: false },
    { name: 'search only from nine letters on', edits: [{ save: 'search.js', replace: ['if (words.length < 3) return', 'if (words.length < 9) return'] }], solves: false }
  ],
  'debugging-practice-check-once': [
    { name: 'a debounce', edits: [{ save: 'voucher.js', replace: ['field.addEventListener(\'input\', checkVoucher)', 'let timer = null\nfield.addEventListener(\'input\', () => {\n  clearTimeout(timer)\n  timer = setTimeout(checkVoucher, 300)\n})'] }], solves: true },
    { name: 'check only from eight letters on', edits: [{ save: 'voucher.js', replace: ['  const code = field.value.trim().toUpperCase()\n', '  const code = field.value.trim().toUpperCase()\n  if (code.length < 8) return\n'] }], solves: false }
  ],
  'debugging-27-redraws-menu': [
    {
      name: 'draw the menu only when its HTML changed',
      edits: [
        { save: 'app.js', replace: ['function renderMenu() {\n  menu.innerHTML = products.map(', 'function renderMenu() {\n  const html = products.map('] },
        { save: 'app.js', replace: ['    </li>`).join(\'\')\n}\n', '    </li>`).join(\'\')\n  if (menu.innerHTML !== html) menu.innerHTML = html\n}\n'] }
      ],
      solves: true
    },
    { name: 'render() without the menu (it is never drawn)', edits: [{ save: 'app.js', replace: ['function render() {\n  renderMenu()\n  renderBasket()\n}', 'function render() {\n  renderBasket()\n}'] }], solves: false },
    { name: 'nothing drawn on Add', edits: [{ save: 'app.js', replace: ['.dataset.id))\n  render()\n', '.dataset.id))\n'] }], solves: false },
    { name: 'the menu drawn again a moment later (review 2026-11-13)', edits: [{ save: 'app.js', replace: ['function render() {\n  renderMenu()\n', 'function render() {\n  if (menu.children.length) setTimeout(renderMenu, 200)\n  else renderMenu()\n'] }], solves: false }
  ],
  'debugging-28-formatted-thousands': [
    {
      name: 'the prices formatted once, still looked up with find',
      edits: [{
        save: 'prices.js',
        replace: [
          'export function priceLabel(id) {\n  const labels = PRICES.map(entry => ({ id: entry.id, label: formatPrice(entry.cents) }))\n',
          'const labels = PRICES.map(entry => ({ id: entry.id, label: formatPrice(entry.cents) }))\n\nexport function priceLabel(id) {\n'
        ]
      }],
      solves: true
    },
    {
      name: 'a cache inside formatPrice (the loop around it stays)',
      edits: [
        { save: 'money.js', replace: ['export function formatPrice(cents) {\n', 'const written = new Map()\n\nexport function formatPrice(cents) {\n  if (written.has(cents)) return written.get(cents)\n'] },
        { save: 'money.js', replace: ['  return `${euros}.${rest} €`\n', '  written.set(cents, `${euros}.${rest} €`)\n  return written.get(cents)\n'] }
      ],
      solves: false
    },
    {
      name: 'the labels made by eval, where nothing counts (review 2026-11-13)',
      edits: [{ save: 'prices.js', replace: ['  const labels = PRICES.map(entry => ({ id: entry.id, label: formatPrice(entry.cents) }))\n', '  const labels = eval(\'PRICES.map(entry => ({ id: entry.id, label: formatPrice(entry.cents) }))\')\n'] }],
      solves: false
    },
    {
      name: 'the labels made by new Function, where nothing counts (review 2026-11-13)',
      edits: [{ save: 'prices.js', replace: ['  const labels = PRICES.map(entry => ({ id: entry.id, label: formatPrice(entry.cents) }))\n', '  const labels = new Function(\'PRICES\', \'formatPrice\', \'return PRICES.map(entry => ({ id: entry.id, label: formatPrice(entry.cents) }))\')(PRICES, formatPrice)\n'] }],
      solves: false
    },
    {
      name: 'the first label kept for every product',
      edits: [
        { save: 'prices.js', replace: ['export function priceLabel(id) {\n', 'let kept = null\n\nexport function priceLabel(id) {\n  if (kept) return kept\n'] },
        { save: 'prices.js', replace: ['  return labels.find(entry => entry.id === id).label\n', '  kept = labels.find(entry => entry.id === id).label\n  return kept\n'] }
      ],
      solves: false
    }
  ],
  'debugging-practice-only-the-counter': [
    { name: 'the list drawn only on load, the counter not at all', edits: [{ save: 'app.js', replace: ['.dataset.id)\n  renderPage()', '.dataset.id)'] }], solves: false },
    { name: 'the counter at once, the list drawn again a moment later (review 2026-11-13)', edits: [{ save: 'app.js', replace: ['.dataset.id)\n  renderPage()', '.dataset.id)\n  renderBadge()\n  setTimeout(renderPage, 300)'] }], solves: false }
  ],
  'debugging-practice-map-lookup': [
    { name: 'the lookup made by new Function, where nothing counts (review 2026-11-13)', edits: [{ save: 'total.js', replace: ['    const cents = PRICES.find(entry => entry.id === line.id).cents', '    const cents = new Function(\'PRICES\', \'id\', \'return PRICES.find(entry => entry.id === id).cents\')(PRICES, line.id)'] }], solves: false }
  ],
  'debugging-29-one-after-another': [
    {
      name: 'every request started first, then each awaited',
      edits: [{
        save: 'load.js',
        replace: [
          '  const menu = await getJson(\'/api/menu\')\n  const specials = await getJson(\'/api/specials\')\n  const hours = await getJson(\'/api/hours\')\n',
          '  const menuRequest = getJson(\'/api/menu\')\n  const specialsRequest = getJson(\'/api/specials\')\n  const hoursRequest = getJson(\'/api/hours\')\n  const menu = await menuRequest\n  const specials = await specialsRequest\n  const hours = await hoursRequest\n'
        ]
      }],
      solves: true
    },
    {
      name: 'each part drawn as its answer arrives',
      edits: [{
        save: 'load.js',
        replace: [
          '  const menu = await getJson(\'/api/menu\')\n  const specials = await getJson(\'/api/specials\')\n  const hours = await getJson(\'/api/hours\')\n  showMenu(menu)\n  showSpecials(specials)\n  showHours(hours)\n',
          '  getJson(\'/api/menu\').then(showMenu)\n  getJson(\'/api/specials\').then(showSpecials)\n  getJson(\'/api/hours\').then(showHours)\n'
        ]
      }],
      solves: true
    },
    {
      name: 'the menu and the specials together, then the hours',
      edits: [{ save: 'load.js', replace: ['  const menu = await getJson(\'/api/menu\')\n  const specials = await getJson(\'/api/specials\')\n', '  const [menu, specials] = await Promise.all([getJson(\'/api/menu\'), getJson(\'/api/specials\')])\n'] }],
      solves: false
    },
    {
      name: 'only the menu asked for, the specials and hours written into the code (review 2026-11-13)',
      edits: [{
        save: 'load.js',
        replace: [
          '  const specials = await getJson(\'/api/specials\')\n  const hours = await getJson(\'/api/hours\')\n',
          '  const specials = [{ name: \'Plum cake\', note: \'with the last plums of the season\' }]\n  const hours = { weekdays: \'7:00–18:00\', saturday: \'7:00–13:00\' }\n'
        ]
      }],
      solves: false
    },
    {
      name: 'the hours left out',
      edits: [{ save: 'load.js', replace: ['  const menu = await getJson(\'/api/menu\')\n  const specials = await getJson(\'/api/specials\')\n  const hours = await getJson(\'/api/hours\')\n  showMenu(menu)\n  showSpecials(specials)\n  showHours(hours)\n', '  const [menu, specials] = await Promise.all([getJson(\'/api/menu\'), getJson(\'/api/specials\')])\n  showMenu(menu)\n  showSpecials(specials)\n'] }],
      solves: false
    }
  ],
  'debugging-practice-both-at-once': [
    { name: 'the stock written into the code (review 2026-11-13)', edits: [{ save: 'breads.js', replace: ['  const stock = await getJson(\'/api/stock\')\n', '  const stock = { sourdough: 4, rye: 7 }\n'] }], solves: false },
    { name: 'the stock first, then the breads', edits: [{ save: 'breads.js', replace: ['  const breads = await getJson(\'/api/breads\')\n  const stock = await getJson(\'/api/stock\')\n', '  const stock = await getJson(\'/api/stock\')\n  const breads = await getJson(\'/api/breads\')\n'] }], solves: false }
  ],
  'debugging-30-asks-again': [
    {
      name: 'the lists kept (not their promises)',
      edits: [{
        save: 'tabs.js',
        replace: [
          'async function showTab(name) {\n  const response = await fetch(`/api/${name}`)\n  const items = await response.json()\n',
          'const lists = {}\n\nasync function showTab(name) {\n  if (!lists[name]) lists[name] = await (await fetch(`/api/${name}`)).json()\n  const items = lists[name]\n'
        ]
      }],
      solves: true
    },
    {
      name: 'one answer kept for both tabs',
      edits: [{
        save: 'tabs.js',
        replace: [
          'async function showTab(name) {\n  const response = await fetch(`/api/${name}`)\n  const items = await response.json()\n',
          'let kept = null\n\nasync function showTab(name) {\n  kept ??= await (await fetch(`/api/${name}`)).json()\n  const items = kept\n'
        ]
      }],
      solves: false
    },
    {
      name: 'only the menu kept',
      edits: [{
        save: 'tabs.js',
        replace: [
          'async function showTab(name) {\n  const response = await fetch(`/api/${name}`)\n  const items = await response.json()\n',
          'let menu = null\n\nasync function showTab(name) {\n  const items = name === \'menu\' ? (menu ??= await (await fetch(\'/api/menu\')).json()) : await (await fetch(`/api/${name}`)).json()\n'
        ]
      }],
      solves: false
    }
  ],
  'debugging-31-checkout-errors': [
    {
      name: 'the variable called items again',
      edits: [
        { save: 'order.js', replace: ['  const lines = cart.items.map', '  const items = cart.items.map'] },
        { save: 'order.js', replace: ['JSON.stringify({ lines, note })', 'JSON.stringify({ items, note })'] }
      ],
      solves: true
    },
    { name: 'rolled back to a1f0c93: orders work, the notes are gone', rollback: 'a1f0c93', edits: [], solves: false },
    { name: 'the note left out of the order', edits: [{ save: 'order.js', replace: ['JSON.stringify({ lines, note })', 'JSON.stringify({ items: lines })'] }], solves: false },
    { name: 'the thank-you shown whatever the server says', edits: [{ save: 'order.js', replace: ['  if (!response.ok) {', '  if (false) {'] }], solves: false }
  ],
  'debugging-practice-field-the-server-reads': [
    { name: 'a value written into the code', edits: [{ save: 'gift.js', replace: ['JSON.stringify({ amount: Number(amount.value) })', 'JSON.stringify({ value: 20 })'] }], solves: false }
  ],
  'debugging-32-which-deploy': [
    { name: 'Number(total.toFixed(2))', edits: [{ save: 'order.js', replace: ['  const total = Number(formatPrice(basketTotal()))', '  const total = Number(basketTotal().toFixed(2))'] }], solves: true },
    { name: 'rolled back to c41e9a2: orders work, the euro signs and the basket total are gone', rollback: 'c41e9a2', edits: [], solves: false },
    { name: 'rolled back to 8d03f5b: the culprit is still there', rollback: '8d03f5b', edits: [], solves: false },
    { name: 'formatPrice without the euro sign again', edits: [{ save: 'money.js', replace: ['  return `${amount.toFixed(2)} €`', '  return amount.toFixed(2)'] }], solves: false },
    { name: 'a total written into the code', edits: [{ save: 'order.js', replace: ['  const total = Number(formatPrice(basketTotal()))', '  const total = 4.8'] }], solves: false },
    { name: 'no total in the order', edits: [{ save: 'order.js', replace: ['JSON.stringify({ items, total })', 'JSON.stringify({ items })'] }], solves: false }
  ],
  'debugging-practice-keep-the-euro-sign': [
    { name: 'the euro sign cut off before reading the number', edits: [{ save: 'delivery.js', replace: ['  const amount = parseFloat(formatPrice(total))', '  const amount = parseFloat(formatPrice(total).replace(\'€\', \'\'))'] }], solves: true },
    { name: 'rolled back to 3e8b2f1: the euro sign is gone', rollback: '3e8b2f1', edits: [], solves: false },
    { name: 'NaN let through as free', edits: [{ save: 'delivery.js', replace: ['amount >= 25 ?', '!(amount < 25) ?'] }], solves: false }
  ],
  'debugging-33-roll-back-now': [
    { name: 'rolled back too far, to 2c7d9e4: yesterday\'s thank-you is gone', rollback: '2c7d9e4', edits: [], solves: false },
    { name: 'the new checkout patched to go on without pickup times', edits: [{ save: 'order.js', replace: ['  const slots = await response.json()\n', '  const slots = response.ok ? await response.json() : [\'tomorrow from 7:00\']\n'] }], solves: false }
  ],
  'debugging-practice-roll-it-back': [
    { name: 'the old address typed back by hand', edits: [{ save: 'specials.js', replace: ['fetch(\'/api/v2/specials\')', 'fetch(\'/api/specials\')'] }], solves: true }
  ],
  'debugging-34-some-customers': [
    {
      name: 'backslashes, quotes and line breaks escaped by hand',
      edits: [{ save: 'order.js', replace: ['  const note = document.querySelector(\'#note\').value.trim()\n', String.raw`  const note = document.querySelector('#note').value.trim().replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')` + '\n'] }],
      solves: true
    },
    { name: 'quotes and line breaks escaped, backslashes not (review 2026-11-13)', edits: [{ save: 'order.js', replace: ['  const note = document.querySelector(\'#note\').value.trim()\n', String.raw`  const note = document.querySelector('#note').value.trim().replaceAll('"', '\\"').replaceAll('\n', '\\n')` + '\n'] }], solves: false },
    { name: 'only the quotes escaped', edits: [{ save: 'order.js', replace: ['  const note = document.querySelector(\'#note\').value.trim()\n', String.raw`  const note = document.querySelector('#note').value.trim().replaceAll('"', '\\"')` + '\n'] }], solves: false },
    { name: 'quotes turned into apostrophes, line breaks into spaces', edits: [{ save: 'order.js', replace: ['  const note = document.querySelector(\'#note\').value.trim()\n', '  const note = document.querySelector(\'#note\').value.trim().replaceAll(\'"\', "\'").replaceAll(\'\\n\', \' \')\n'] }], solves: false },
    { name: 'the note left out', edits: [{ save: 'order.js', replace: ['    body: \'{"items":\' + JSON.stringify(items) + \',"note":"\' + note + \'"}\'', '    body: JSON.stringify({ items })'] }], solves: false },
    { name: 'rolled back to 6d2e0a1: the notes deploy itself', rollback: '6d2e0a1', edits: [], solves: false }
  ],
  'debugging-practice-escape-the-name': [
    { name: 'the quotes taken out of the name', edits: [{ save: 'newsletter.js', replace: ['  const name = document.querySelector(\'#name\').value.trim()\n', '  const name = document.querySelector(\'#name\').value.trim().replaceAll(\'"\', \'\')\n'] }], solves: false }
  ],
  'debugging-35-only-in-production': [
    { name: 'the production flags looked up by their new name', edits: [{ save: 'config.js', replace: ['export const flags = FLAGS[ENVIRONMENT] ?? FLAGS.staging', 'export const flags = FLAGS[ENVIRONMENT === \'production\' ? \'live\' : ENVIRONMENT]'] }], solves: true },
    { name: 'rolled back to 7a3c5e9: the gift cards are off again', rollback: '7a3c5e9', edits: [], solves: false },
    { name: 'env.js says live: the shop calls itself a test site', edits: [{ save: 'env.js', replace: ['export const ENVIRONMENT = \'production\'', 'export const ENVIRONMENT = \'live\''] }], solves: false },
    { name: 'the stamp\'s 404 ignored: production still calls staging\'s service', edits: [{ save: 'order.js', replace: ['      if (!stamp.ok) throw new Error(`The stamp was answered with ${stamp.status}`)\n', ''] }], solves: false },
    { name: 'no fallback at all', edits: [{ save: 'config.js', replace: [' ?? FLAGS.staging', ''] }], solves: false }
  ],
  'debugging-practice-switch-it-off': [
    { name: 'env.js says staging', edits: [{ save: 'env.js', replace: ['export const ENVIRONMENT = \'production\'', 'export const ENVIRONMENT = \'staging\''] }], solves: false },
    { name: 'the reviews\' 404 caught, the request still sent', edits: [{ save: 'app.js', replace: ['  const reviews = await response.json()\n', '  if (!response.ok) return\n  const reviews = await response.json()\n'] }], solves: false }
  ]
}
