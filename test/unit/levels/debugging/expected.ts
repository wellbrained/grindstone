// What every Debugging level's app does, before and after its fix: the unit tests run the goals on these observations,
// and e2e/debugging-levels.spec.ts checks in a real browser that the apps really do this (so the table cannot drift).
import type { Probe, ProbeValue } from '../../../../shared/levels'

export interface ExpectedRun {
  /** Probe values of the check run. */
  probes: Record<string, ProbeValue>
  /** Probes that could not run (nothing on the page matched). */
  missing?: string[]
  /** How many errors the check run sees. */
  errors: number
  /** Where the first error points (its source link): what the hints and find tasks talk about. */
  errorAt?: string
  /** The first error's frames in the level files, top first (a syntax error has none). */
  frames?: string[]
}

export interface ExpectedLevel {
  /** A reload of the starting files. */
  start: ExpectedRun
  /** A reload after the solution's edits (fix levels). */
  solved?: ExpectedRun
  /** Find tasks: what a customer does before the trace shows up (the task tells the player to do it). */
  before?: Probe[]
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
    start: { probes: {}, errors: 1, errorAt: 'hours.js:7', frames: [] }
  },
  'debugging-practice-close-the-bracket': {
    start: { probes: { rows: 0 }, errors: 1, errorAt: 'cart.js:11', frames: [] },
    solved: { probes: { rows: 3 }, errors: 0 }
  }
}
