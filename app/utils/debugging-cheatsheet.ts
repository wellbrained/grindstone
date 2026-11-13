// Structure of the Debugging cheat sheet (/debugging/cheat-sheet): one group per panel or skill, the entries in each, and
// the error messages the levels quote (data, not translated), plus the levels that teach each entry. Every visible
// text lives in the i18n locales under `debugCheat.*`; the key helpers below say where. What the panels do:
// docs/features/ui.md ("Debugging play page").
import { levelById } from '../../shared/levels'
import type { Level } from '../../shared/levels'

export interface DebugCheatExample {
  /** A Console input, a snippet, a selector, a key or a status word (data, not translated). Its note is an i18n key, see `debugNoteKey`. */
  line: string
  /** false: shown as a plain row (a key, a status word) instead of a line you click to copy. */
  copy?: false
}

export interface DebugCheatEntry {
  /** Unique over the whole sheet; the i18n key part. */
  id: string
  examples: DebugCheatExample[]
  /** Level ids (scenarios) that teach it, in level order. */
  levels: string[]
}

export interface DebugCheatGroup {
  id: string
  entries: DebugCheatEntry[]
}

export interface ErrorType {
  /** Unique among the errors; the i18n key part. */
  id: string
  /** The message as Chrome words it, as the levels quote it (data, not translated). */
  message: string
  levels: string[]
}

const line = (text: string): DebugCheatExample => ({ line: text })
const plain = (text: string): DebugCheatExample => ({ line: text, copy: false })

export const debugCheatGroups: DebugCheatGroup[] = [
  {
    id: 'console',
    entries: [
      { id: 'read-trace', examples: [], levels: ['debugging-01-add-to-cart', 'debugging-04-error-in-money'] },
      { id: 'syntax', examples: [], levels: ['debugging-05-blank-page'] },
      {
        id: 'input',
        examples: [line('formatPrice'), line('typeof formatPrice'), line('cart.items[0].options === cart.items[1].options')],
        levels: ['debugging-02-prices-vanished', 'debugging-19-changes-both']
      },
      {
        id: 'await',
        examples: [line('await priceOf(\'croissant\')'), line('priceOf(\'croissant\')'), line('const total = await priceOf(\'croissant\')')],
        levels: ['debugging-16-object-promise']
      },
      { id: 'log', examples: [line('console.error(error)'), line('console.log(\'items\', items)')], levels: ['debugging-20-says-it-failed'] }
    ]
  },
  {
    id: 'network',
    entries: [
      {
        id: 'status',
        examples: [plain('200 OK'), plain('201 Created'), plain('400 Bad Request'), plain('404 Not Found'), plain('409 Conflict'), plain('422 Unprocessable Entity'), plain('500 Internal Server Error'), plain('503 Service Unavailable')],
        levels: ['debugging-06-menu-wont-load', 'debugging-07-nothing-happens', 'debugging-08-wrong-quantity', 'debugging-20-says-it-failed', 'debugging-32-which-deploy']
      },
      {
        id: 'no-code',
        examples: [plain('pending'), plain('CORS error'), plain('failed'), plain('canceled')],
        levels: ['debugging-09-works-on-my-machine', 'debugging-10-orders-twice', 'debugging-17-wrong-results']
      },
      { id: 'details', examples: [], levels: ['debugging-06-menu-wont-load', 'debugging-08-wrong-quantity'] },
      { id: 'address', examples: [line('fetch(\'/api/menu\')')], levels: ['debugging-06-menu-wont-load'] },
      { id: 'ok', examples: [line('if (!response.ok) {'), line('response.status')], levels: ['debugging-06-menu-wont-load', 'debugging-07-nothing-happens'] },
      { id: 'payload', examples: [line('quantity: Number(input.value)')], levels: ['debugging-08-wrong-quantity'] },
      {
        id: 'cors',
        examples: [line('Access-Control-Allow-Origin: https://cornerbakery.shop'), line('fetch(\'/api/newsletter\')')],
        levels: ['debugging-09-works-on-my-machine']
      },
      { id: 'double', examples: [line('button.disabled = true')], levels: ['debugging-10-orders-twice'] }
    ]
  },
  {
    id: 'elements',
    entries: [
      { id: 'tree', examples: [], levels: ['debugging-11-invisible-order', 'debugging-14-gone-on-phones', 'debugging-15-long-name'] },
      { id: 'styles', examples: [], levels: ['debugging-11-invisible-order', 'debugging-13-style-doesnt-apply'] },
      {
        id: 'specificity',
        examples: [line('#products .price'), line('.special .price'), line('.products .price'), line('p')],
        levels: ['debugging-13-style-doesnt-apply']
      },
      { id: 'variables', examples: [line('background: var(--brown)')], levels: ['debugging-11-invisible-order'] },
      { id: 'computed', examples: [], levels: ['debugging-11-invisible-order', 'debugging-12-cant-click', 'debugging-15-long-name'] },
      { id: 'pick', examples: [], levels: ['debugging-12-cant-click'] },
      {
        id: 'covered',
        examples: [line('pointer-events: none'), line('pointer-events: auto'), line('z-index: 10')],
        levels: ['debugging-12-cant-click']
      },
      {
        id: 'box',
        examples: [line('min-width: 0'), line('text-overflow: ellipsis'), line('overflow-wrap: anywhere')],
        levels: ['debugging-15-long-name']
      },
      { id: 'media', examples: [line('@media (min-width: 600px)'), line('@media (max-width: 600px)')], levels: ['debugging-14-gone-on-phones'] }
    ]
  },
  {
    id: 'async',
    entries: [
      {
        id: 'missing-await',
        examples: [line('const price = await priceOf(product.id)'), line('priceOf(product.id).then(price => {')],
        levels: ['debugging-16-object-promise']
      },
      {
        id: 'race',
        examples: [
          line('const ticket = ++latest'),
          line('if (ticket !== latest) return'),
          line('controller?.abort()'),
          line('controller = new AbortController()'),
          line('fetch(url, { signal: controller.signal })'),
          line('if (error.name === \'AbortError\') return')
        ],
        levels: ['debugging-17-wrong-results']
      },
      {
        id: 'closure',
        examples: [line('for (const product of products) {'), line('products.forEach(product => {')],
        levels: ['debugging-18-adds-sourdough']
      },
      {
        id: 'copy',
        examples: [line('structuredClone(DEFAULTS)'), line('options: { ...DEFAULTS.options }'), line('line.options = { ...line.options, sliced: true }')],
        levels: ['debugging-19-changes-both']
      },
      {
        id: 'chain',
        examples: [line('return response.json()'), line('const order = await response.json()'), line('.catch((error) => { console.error(error)')],
        levels: ['debugging-20-says-it-failed']
      }
    ]
  },
  {
    id: 'debugger',
    entries: [
      { id: 'record', examples: [], levels: ['debugging-21-discount-twice'] },
      { id: 'breakpoints', examples: [], levels: ['debugging-21-discount-twice', 'debugging-22-misses-last-item'] },
      {
        id: 'condition',
        examples: [line('price < 1'), line('bread.grams < 10'), line('bread.name === \'Rye loaf\'')],
        levels: ['debugging-25-seventh-item']
      },
      { id: 'stepping', examples: [], levels: ['debugging-22-misses-last-item', 'debugging-24-always-pickup'] },
      {
        id: 'shortcuts',
        examples: [plain('F8 · Ctrl+\\'), plain('F10 · Ctrl+\''), plain('Ctrl+;'), plain('Shift+F11 · Ctrl+Shift+;')],
        levels: []
      },
      { id: 'scope', examples: [], levels: ['debugging-23-no-free-delivery', 'debugging-24-always-pickup'] },
      { id: 'stack', examples: [], levels: ['debugging-21-discount-twice'] }
    ]
  },
  {
    id: 'performance',
    entries: [
      { id: 'units', examples: [], levels: ['debugging-26-request-per-key'] },
      { id: 'functions', examples: [], levels: ['debugging-28-formatted-thousands'] },
      { id: 'renders', examples: [], levels: ['debugging-27-redraws-menu'] },
      {
        id: 'requests',
        examples: [line('const [menu, specials] = await Promise.all(['), line('clearTimeout(timer)'), line('answers[name] ??= fetch(`/api/${name}`).then(response => response.json())')],
        levels: ['debugging-26-request-per-key', 'debugging-29-one-after-another', 'debugging-30-asks-again']
      }
    ]
  },
  {
    id: 'incidents',
    entries: [
      { id: 'logs', examples: [line('req-4093')], levels: ['debugging-31-checkout-errors', 'debugging-34-some-customers'] },
      { id: 'deploys', examples: [], levels: ['debugging-31-checkout-errors', 'debugging-32-which-deploy'] },
      { id: 'which', examples: [], levels: ['debugging-32-which-deploy'] },
      { id: 'rollback', examples: [], levels: ['debugging-33-roll-back-now'] },
      {
        id: 'flags',
        examples: [line('const flags = FLAGS[environment]'), line('if (!flags) throw new Error(`No flags for ${environment}`)')],
        levels: ['debugging-35-only-in-production']
      },
      {
        id: 'json',
        examples: [line('JSON.stringify({ note })'), line('element.textContent = note')],
        levels: ['debugging-34-some-customers']
      }
    ]
  }
]

/** The error messages the levels quote, in the order the chapters meet them. */
export const debugErrorTypes: ErrorType[] = [
  { id: 'cannot-read', message: 'TypeError: Cannot read properties of undefined (reading \'push\')', levels: ['debugging-01-add-to-cart', 'debugging-31-checkout-errors'] },
  { id: 'not-a-function', message: 'TypeError: formatPrice is not a function', levels: ['debugging-02-prices-vanished'] },
  { id: 'wrong-value', message: 'TypeError: amount.toFixed is not a function', levels: ['debugging-04-error-in-money'] },
  { id: 'map-not-a-function', message: 'TypeError: slots.map is not a function', levels: ['debugging-16-object-promise'] },
  { id: 'not-iterable', message: 'TypeError: specials is not iterable', levels: ['debugging-20-says-it-failed'] },
  { id: 'not-defined', message: 'ReferenceError: total is not defined', levels: ['debugging-03-total-not-defined'] },
  { id: 'before-init', message: 'ReferenceError: Cannot access \'hours\' before initialization', levels: ['debugging-03-total-not-defined'] },
  { id: 'unexpected-export', message: 'SyntaxError: Unexpected token \'export\'', levels: ['debugging-05-blank-page'] },
  { id: 'missing-export', message: 'SyntaxError: The requested module \'./money.js\' does not provide an export named \'formatEuro\'', levels: [] },
  { id: 'not-json', message: 'SyntaxError: Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON', levels: ['debugging-06-menu-wont-load'] },
  { id: 'not-found', message: 'GET https://cornerbakery.shop/api/products 404 (Not Found)', levels: ['debugging-06-menu-wont-load'] },
  { id: 'failed-fetch', message: 'TypeError: Failed to fetch', levels: ['debugging-09-works-on-my-machine'] },
  {
    id: 'cors-blocked',
    message: 'Access to fetch at \'https://api.cornerbakery.shop/specials\' from origin \'https://cornerbakery.shop\' has been blocked by CORS policy: No \'Access-Control-Allow-Origin\' header is present on the requested resource. If an opaque response serves your needs, set the request\'s mode to \'no-cors\' to fetch the resource with CORS disabled.',
    levels: ['debugging-09-works-on-my-machine']
  },
  { id: 'aborted', message: 'AbortError: signal is aborted without reason', levels: ['debugging-17-wrong-results'] }
]

/** i18n key of a group's title (the error reference has one too: id `errors`). */
export const debugGroupKey = (groupId: string) => `debugCheat.groups.${groupId}`
/** i18n key of an entry's title. */
export const debugTitleKey = (entryId: string) => `debugCheat.entries.${entryId}.title`
/** i18n key of an entry's summary. */
export const debugSummaryKey = (entryId: string) => `debugCheat.entries.${entryId}.summary`
/** i18n key of the note above an example line (counted from 0 in the order of `examples`). */
export const debugNoteKey = (entryId: string, index: number) => `debugCheat.entries.${entryId}.examples.${index}`
/** i18n key of what an error usually means, or where to look first (`part`). */
export const debugErrorKey = (errorId: string, part: 'means' | 'look') => `debugCheat.errors.${errorId}.${part}`

/** The levels behind a list of ids, in the order given; an unknown id is skipped (the unit test pins that none is). */
export function debugCheatLevels(ids: readonly string[]): Level[] {
  return ids.flatMap((id) => {
    const level = levelById(id)
    return level ? [level] : []
  })
}
