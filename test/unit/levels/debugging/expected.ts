// What every Debugging level's app does, before and after its fix: the unit tests run the goals on these observations,
// and e2e/debugging-levels.spec.ts checks in a real browser that the apps really do this (so the table cannot drift).
import type { Probe, ProbeValue } from '../../../../shared/levels'
import { SAVE_FAILED } from '../../../../shared/levels/debugging/07-nothing-happens'
import { CONFIRMED } from '../../../../shared/levels/debugging/10-orders-twice'
import { OPENING_HOURS, VOUCHER_EXPIRED } from '../../../../shared/levels/debugging/practice/network'
import { BRAND_RGB } from '../../../../shared/levels/debugging/11-invisible-order'
import { MUTED_RGB, SPECIAL_RED } from '../../../../shared/levels/debugging/13-style-doesnt-apply'
import { SOLD_OUT_GREY } from '../../../../shared/levels/debugging/practice/elements-css'
import { ORDERED } from '../../../../shared/levels/debugging/storefront'

export interface ExpectedRun {
  /** Probe values of the check run. */
  probes: Record<string, ProbeValue>
  /** Probes that could not run (nothing on the page matched). */
  missing?: string[]
  /** How many errors the check run sees. */
  errors: number
  /** Where the first error points (its source link): what the hints and find tasks talk about; null: it has none (a CORS line). */
  errorAt?: string | null
  /** The first error's frames in the level files, top first (a syntax error has none). */
  frames?: string[]
  /** Levels with a backend: the Network panel's rows of the check run, 'METHOD name status' in the order sent. */
  network?: string[]
  /** Console texts the level's texts quote: each is (the start of) a line the Console shows, as Chrome words it. */
  says?: string[]
}

export interface ExpectedLevel {
  /** A reload of the starting files. */
  start: ExpectedRun
  /** A reload after the solution's edits (fix levels). */
  solved?: ExpectedRun
  /** Find tasks: what a customer does before the trace shows up (the task tells the player to do it). */
  before?: Probe[]
  /** Find tasks whose answer is not on the error's trace (the mistake is elsewhere: before a syntax error, where an address is built). */
  answerOffTrace?: true
}

export const expected: Record<string, ExpectedLevel> = {
  'debugging-01-add-to-cart': {
    start: { probes: { 'badge-after-add': '0' }, errors: 1, errorAt: 'cart.js:17', frames: ['cart.js:17', 'app.js:17'] },
    solved: { probes: { 'badge-after-add': '1' }, errors: 0 }
  },
  'debugging-practice-line-that-throws': {
    start: { probes: {}, errors: 1, errorAt: 'specials.js:11', frames: ['specials.js:11', 'specials.js:17', 'app.js:6'] }
  },
  'debugging-practice-misspelled-property': {
    start: { probes: { badge: '' }, errors: 1, errorAt: 'cart.js:7', frames: ['cart.js:7', 'app.js:20'] },
    solved: { probes: { badge: '0' }, errors: 0 }
  },
  'debugging-02-prices-vanished': {
    start: { probes: { 'croissant-price': '' }, errors: 1, errorAt: 'app.js:26', frames: ['app.js:26', 'app.js:30'] },
    solved: { probes: { 'croissant-price': '2.40' }, errors: 0 }
  },
  'debugging-practice-import-right-name': {
    start: { probes: {}, missing: ['croissant-price'], errors: 1, errorAt: 'app.js:4', frames: [] },
    solved: { probes: { 'croissant-price': '2.40' }, errors: 0 }
  },
  'debugging-03-total-not-defined': {
    start: { probes: { 'total-empty': '', 'total-two': '' }, errors: 3, errorAt: 'checkout.js:17', frames: ['checkout.js:17', 'app.js:25'] },
    solved: { probes: { 'total-empty': '0.00', 'total-two': '4.80' }, errors: 0 }
  },
  'debugging-practice-move-declaration-up': {
    start: { probes: { hours: '' }, errors: 1, errorAt: 'hours.js:9', frames: ['hours.js:9', 'hours.js:4'] },
    solved: { probes: { hours: 'Mon–Fri 7:00–18:00 · Sat 7:00–13:00' }, errors: 0 }
  },
  'debugging-04-error-in-money': {
    start: { probes: { total: '' }, errors: 3, errorAt: 'money.js:3', frames: ['money.js:3', 'checkout.js:10', 'app.js:25'] },
    solved: { probes: { total: '8.90' }, errors: 0 }
  },
  'debugging-practice-frame-that-passed': {
    start: { probes: {}, errors: 1, errorAt: 'units.js:4', frames: ['units.js:4', 'breads.js:10', 'app.js:8'] }
  },
  'debugging-practice-three-frame-trace': {
    before: [{ id: 'customer', steps: [{ click: '#pickup' }] }],
    start: { probes: { customer: null }, errors: 1, errorAt: 'slots.js:3', frames: ['slots.js:3', 'pickup.js:8', 'app.js:12'] }
  },
  'debugging-05-blank-page': {
    start: { probes: { rows: 0 }, missing: ['badge-after-add'], errors: 1, errorAt: 'cart.js:16', frames: [] },
    solved: { probes: { 'rows': 3, 'badge-after-add': '1' }, errors: 0 }
  },
  'debugging-practice-real-mistake': {
    answerOffTrace: true,
    start: { probes: {}, errors: 1, errorAt: 'hours.js:7', frames: [] }
  },
  'debugging-practice-close-the-bracket': {
    start: { probes: { rows: 0 }, errors: 1, errorAt: 'cart.js:11', frames: [] },
    solved: { probes: { rows: 3 }, errors: 0 }
  },
  'debugging-06-menu-wont-load': {
    start: {
      probes: { products: 0 },
      errors: 2,
      errorAt: 'menu.js:4',
      frames: [],
      network: ['GET /api/products 404'],
      says: ['GET https://cornerbakery.shop/api/products 404 (Not Found)', 'Uncaught (in promise) SyntaxError: Failed to execute \'json\' on \'Response\': Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON']
    },
    solved: { probes: { products: 3 }, errors: 0, network: ['GET /api/menu 200'] }
  },
  'debugging-practice-builds-the-address': {
    answerOffTrace: true,
    start: { probes: {}, errors: 1, errorAt: 'specials.js:5', frames: [], network: ['GET /api/special 404', 'GET /api/menu 200'] }
  },
  'debugging-practice-right-path': {
    start: { probes: { hours: '' }, errors: 2, errorAt: 'hours.js:3', frames: [], network: ['GET /api/opening-hours 404', 'GET /api/menu 200'], says: ['GET https://cornerbakery.shop/api/opening-hours 404 (Not Found)'] },
    solved: { probes: { hours: OPENING_HOURS }, errors: 0, network: ['GET /api/hours 200', 'GET /api/menu 200'] }
  },
  'debugging-07-nothing-happens': {
    start: { probes: { 'after-error': '', 'basket-after-error': '0' }, errors: 1, errorAt: 'order.js:13', frames: [], network: ['GET /api/menu 200', 'POST /api/orders 500'], says: ['POST https://cornerbakery.shop/api/orders 500 (Internal Server Error)'] },
    solved: { probes: { 'after-error': SAVE_FAILED, 'basket-after-error': '2' }, errors: 1, network: ['GET /api/menu 200', 'POST /api/orders 500'] }
  },
  'debugging-practice-failing-request': {
    start: { probes: {}, errors: 1, errorAt: 'specials.js:4', frames: [], network: ['GET /api/hours 200', 'GET /api/specials 503', 'GET /api/menu 200'], says: ['GET https://cornerbakery.shop/api/specials 503 (Service Unavailable)'] }
  },
  'debugging-practice-check-response-ok': {
    start: { probes: { voucher: 'Voucher applied: 10% off your order.' }, errors: 1, errorAt: 'voucher.js:5', frames: [], network: ['GET /api/menu 200', 'POST /api/vouchers/check 400'] },
    solved: { probes: { voucher: VOUCHER_EXPIRED }, errors: 1, network: ['GET /api/menu 200', 'POST /api/vouchers/check 400'] }
  },
  'debugging-08-wrong-quantity': {
    start: { probes: { 'quantity-sent': null, 'confirmation': 'Order 1042: 1 × Butter croissant' }, errors: 0, network: ['POST /api/orders 201'] },
    solved: { probes: { 'quantity-sent': 3, 'confirmation': 'Order 1042: 3 × Butter croissant' }, errors: 0, network: ['POST /api/orders 201'] }
  },
  'debugging-practice-quantity-as-number': {
    start: { probes: { 'quantity-sent': '3', 'confirmation': 'items[0].quantity must be a number' }, errors: 1, errorAt: 'order.js:7', frames: [], network: ['POST /api/orders 400'], says: ['POST https://cornerbakery.shop/api/orders 400 (Bad Request)'] },
    solved: { probes: { 'quantity-sent': 3, 'confirmation': 'Order 1042: 3 × Butter croissant' }, errors: 0, network: ['POST /api/orders 201'] }
  },
  'debugging-09-works-on-my-machine': {
    start: {
      probes: { specials: 0 },
      errors: 3,
      errorAt: null,
      frames: [],
      network: ['GET https://api.cornerbakery.shop/specials CORS error', 'GET /api/menu 200'],
      says: [
        'Access to fetch at \'https://api.cornerbakery.shop/specials\' from origin \'https://cornerbakery.shop\' has been blocked by CORS policy: No \'Access-Control-Allow-Origin\' header is present on the requested resource.',
        'GET https://api.cornerbakery.shop/specials net::ERR_FAILED 200 (OK)',
        'Uncaught (in promise) TypeError: Failed to fetch'
      ]
    },
    solved: { probes: { specials: 2 }, errors: 0, network: ['GET /api/specials 200', 'GET /api/menu 200'] }
  },
  'debugging-practice-own-origin': {
    start: {
      probes: { signup: '' },
      errors: 3,
      errorAt: null,
      frames: [],
      network: ['GET /api/menu 200', 'POST https://api.cornerbakery.shop/newsletter CORS error'],
      says: ['Access to fetch at \'https://api.cornerbakery.shop/newsletter\' from origin \'https://cornerbakery.shop\' has been blocked by CORS policy: Response to preflight request doesn\'t pass access control check', 'Uncaught (in promise) TypeError: Failed to fetch']
    },
    solved: { probes: { signup: 'Thanks! You\'re on the list.' }, errors: 0, network: ['GET /api/menu 200', 'POST /api/newsletter 201'] }
  },
  'debugging-10-orders-twice': {
    start: { probes: { 'orders-sent': 2, 'confirmation': 'Thanks! Order 1043 is in. Pick it up tomorrow from 7:00.' }, errors: 0, network: ['GET /api/menu 200', 'POST /api/orders 201', 'POST /api/orders 201'] },
    solved: { probes: { 'orders-sent': 1, 'confirmation': CONFIRMED }, errors: 0, network: ['GET /api/menu 200', 'POST /api/orders 201'] }
  },
  'debugging-practice-disable-while-sending': {
    start: { probes: { reservations: 2 }, errors: 0, network: ['GET /api/menu 200', 'POST /api/cakes 201', 'POST /api/cakes 201'] },
    solved: { probes: { reservations: 1 }, errors: 0, network: ['GET /api/menu 200', 'POST /api/cakes 201'] }
  },
  // Elements & CSS: nothing is red in the Console; the probes read the layout (contrast, computed styles, what a tap hits)
  'debugging-11-invisible-order': {
    start: { probes: { 'order-contrast': 1, 'order-background': 'rgba(0, 0, 0, 0)' }, errors: 0 },
    solved: { probes: { 'order-contrast': 8.01, 'order-background': BRAND_RGB }, errors: 0 }
  },
  'debugging-practice-inherited-colour': {
    answerOffTrace: true,
    start: { probes: {}, errors: 0 }
  },
  'debugging-practice-variable-name': {
    start: { probes: { 'add-background': 'rgba(0, 0, 0, 0)' }, errors: 0 },
    solved: { probes: { 'add-background': BRAND_RGB }, errors: 0 }
  },
  'debugging-12-cant-click': {
    start: { probes: { 'order-hit': 'div.toast-area', 'toast': 'visible', 'checkout-fixed': 'fixed', 'area-fixed': 'fixed', 'ordered': '', 'toast-closes': 0 }, errors: 0 },
    solved: { probes: { 'order-hit': 'itself', 'toast': 'visible', 'checkout-fixed': 'fixed', 'area-fixed': 'fixed', 'ordered': ORDERED, 'toast-closes': 0 }, errors: 0 }
  },
  'debugging-practice-what-covers': {
    answerOffTrace: true,
    start: { probes: {}, errors: 0 }
  },
  'debugging-practice-let-clicks-through': {
    start: { probes: { 'banner': 'visible', 'banner-place': 'absolute', 'badge': '0' }, errors: 0 },
    solved: { probes: { 'banner': 'visible', 'banner-place': 'absolute', 'badge': '1' }, errors: 0 }
  },
  'debugging-13-style-doesnt-apply': {
    start: { probes: { 'special-price': MUTED_RGB, 'croissant-price': MUTED_RGB }, errors: 0 },
    solved: { probes: { 'special-price': SPECIAL_RED, 'croissant-price': MUTED_RGB }, errors: 0 }
  },
  'debugging-practice-rule-that-wins': {
    answerOffTrace: true,
    start: { probes: {}, errors: 0 }
  },
  'debugging-practice-selector-typo': {
    start: { probes: { 'sourdough-add': BRAND_RGB, 'croissant-add': BRAND_RGB }, errors: 0 },
    solved: { probes: { 'sourdough-add': SOLD_OUT_GREY, 'croissant-add': BRAND_RGB }, errors: 0 }
  },
  'debugging-14-gone-on-phones': {
    start: { probes: { 'bar-phone': 'display: none', 'basket-phone': 'display: none', 'bar-laptop': 'visible', 'basket-laptop': 'visible' }, errors: 0 },
    solved: { probes: { 'bar-phone': 'visible', 'basket-phone': 'display: none', 'bar-laptop': 'display: none', 'basket-laptop': 'visible' }, errors: 0 }
  },
  'debugging-practice-media-query-line': {
    answerOffTrace: true,
    start: { probes: {}, errors: 0 }
  },
  'debugging-practice-turn-the-query': {
    start: { probes: { 'photo-phone': 'visible', 'photo-laptop': 'display: none' }, errors: 0 },
    solved: { probes: { 'photo-phone': 'display: none', 'photo-laptop': 'visible' }, errors: 0 }
  },
  'debugging-15-long-name': {
    start: { probes: { 'page': 'overflows', 'walnut-add': 'off screen', 'walnut-name': 'fits' }, errors: 0 },
    solved: { probes: { 'page': 'fits', 'walnut-add': 'itself', 'walnut-name': 'overflows' }, errors: 0 }
  },
  'debugging-practice-nowrap-line': {
    answerOffTrace: true,
    start: { probes: {}, errors: 0 }
  },
  'debugging-practice-long-address': {
    start: { probes: { page: 'overflows', note: 'visible' }, errors: 0 },
    solved: { probes: { page: 'fits', note: 'visible' }, errors: 0 }
  }
}
