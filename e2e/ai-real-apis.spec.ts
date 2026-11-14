import { existsSync } from 'node:fs'
import { chromium, expect, firefox, test, webkit } from '@playwright/test'
import type { BrowserType } from '@playwright/test'

// Invented APIs (ADR 0008, chapter 4) calls some APIs real and others invented: a level that is wrong about either
// teaches the wrong thing. Every API the chapter calls real (a tempting spot, an approved verdict, a debrief's "the
// real way") is checked to exist and to do what the level says, and every invented one to be missing or ignored, in
// Chromium, Firefox and WebKit (each launched here; `pnpm exec playwright install chromium firefox webkit`).

/** What each API does, as the levels say; run in the page, so every value is plain JSON. */
function facts() {
  const names = ['Butter croissant', 'Pain au chocolat', 'Sourdough loaf']
  const copy = structuredClone({ lines: [{ quantity: 1 }], pickupAt: new Date(0) })
  const sorted = [3, 1, 2]
  const pickup = new Date(2026, 10, 15, 7, 0)
  const tryIt = (run: () => unknown) => {
    try {
      return String(run())
    } catch (error) {
      return (error as Error).name
    }
  }
  return {
    // 4.1 and its practice tasks: findLastIndex, findLast and at are real; last and sum are not
    findLastIndex: [{ id: 'a' }, { id: 'b' }, { id: 'a' }].findLastIndex(item => item.id === 'a'),
    findLast: [{ id: 'a', n: 1 }, { id: 'a', n: 2 }].findLast(item => item.id === 'a')?.n,
    at: [1, 2, 3].at(-1),
    atEmpty: [].at(-1) === undefined,
    last: typeof ([] as unknown as Record<string, unknown>).last,
    sum: typeof ([] as unknown as Record<string, unknown>).sum,
    // 4.2: an unknown option is ignored, the real one strips .00; Intl.ListFormat and its options are real
    hideTrailingZeros: [5, 2.4, 1234.5].map(amount => new Intl.NumberFormat('en', { minimumFractionDigits: 2, useGrouping: false, hideTrailingZeros: true } as Intl.NumberFormatOptions).format(amount)),
    trailingZeroDisplay: [5, 2.4].map(amount => new Intl.NumberFormat('en', { minimumFractionDigits: 2, useGrouping: false, trailingZeroDisplay: 'stripIfInteger' } as Intl.NumberFormatOptions).format(amount)),
    takenOptions: Object.keys(new Intl.NumberFormat('en', { hideTrailingZeros: true } as Intl.NumberFormatOptions).resolvedOptions()).includes('hideTrailingZeros'),
    formatOption: new Intl.DateTimeFormat('en-GB', { format: 'HH:mm' } as Intl.DateTimeFormatOptions).format(pickup),
    twoDigits: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(pickup),
    listFormat: new Intl.ListFormat('en-GB', { style: 'long', type: 'conjunction' }).format(names),
    // 4.3: Object.groupBy and replaceChildren with several children are real
    groupBy: JSON.stringify(Object.groupBy([{ name: 'a' }, { name: 'b' }, { name: 'a' }], item => item.name)),
    replaceChildren: (() => {
      const list = document.createElement('ul')
      list.append(document.createElement('li'))
      list.replaceChildren(document.createElement('li'), document.createElement('li'))
      return list.children.length
    })(),
    // 4.4: event.path is gone, composedPath and closest are the standard ways; getYear is the year minus 1900;
    // toSorted returns a copy and leaves the list alone
    eventPath: typeof (new Event('click') as unknown as Record<string, unknown>).path,
    composedPath: typeof new Event('click').composedPath,
    closest: typeof document.createElement('li').closest,
    pathFind: tryIt(() => (new Event('click') as unknown as { path: unknown[] }).path.find(Boolean)),
    getYear: (new Date(2026, 10, 14) as unknown as { getYear: () => number }).getYear(),
    toSorted: JSON.stringify([sorted.toSorted((a, b) => a - b), sorted]),
    // 4.5: Intl.RelativeTimeFormat says "tomorrow"; toLocaleDateString writes the day; structuredClone copies deeply
    // and keeps dates
    relative: new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(1, 'day'),
    dayName: new Date(2026, 10, 21).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
    structuredClone: copy.pickupAt instanceof Date && copy.lines[0]!.quantity === 1,
    sunday: new Date(2026, 10, 15).getDay()
  }
}

const EXPECTED: ReturnType<typeof facts> = {
  findLastIndex: 2,
  findLast: 2,
  at: 3,
  atEmpty: true,
  last: 'undefined',
  sum: 'undefined',
  hideTrailingZeros: ['5.00', '2.40', '1234.50'],
  trailingZeroDisplay: ['5', '2.40'],
  takenOptions: false,
  formatOption: '15/11/2026',
  twoDigits: '07:00',
  listFormat: 'Butter croissant, Pain au chocolat and Sourdough loaf',
  groupBy: '{"a":[{"name":"a"},{"name":"a"}],"b":[{"name":"b"}]}',
  replaceChildren: 2,
  eventPath: 'undefined',
  composedPath: 'function',
  closest: 'function',
  pathFind: 'TypeError',
  getYear: 126,
  toSorted: '[[1,2,3],[3,1,2]]',
  relative: 'tomorrow',
  dayName: 'Saturday 21 November',
  structuredClone: true,
  sunday: 0
}

/** A module graph from blob URLs through an import map, as the sandbox loads one: the error the window reports. */
function linkError(files: Record<string, string>) {
  return new Promise<string[]>((resolve) => {
    const reported: string[] = []
    window.addEventListener('error', event => reported.push((event.error as Error | undefined)?.name ?? 'error'))
    const imports = Object.fromEntries(Object.entries(files).map(([path, source]) => [path, URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))]))
    const map = document.createElement('script')
    map.type = 'importmap'
    map.textContent = JSON.stringify({ imports })
    document.head.append(map)
    const entry = document.createElement('script')
    entry.type = 'module'
    entry.textContent = 'import "app.js"'
    document.head.append(entry)
    setTimeout(() => resolve(reported), 500)
  })
}

const MONEY = 'export function formatPrice(amount) { return amount.toFixed(2) }'
const LINKS: [what: string, files: Record<string, string>, errors: string[]][] = [
  ['an import of a name money.js does not export (4.3)', { 'app.js': 'import { formatEuro } from "money.js"\nformatEuro(1)', 'money.js': MONEY }, ['SyntaxError']],
  ['a default import of a module without one (No default)', { 'app.js': 'import money from "money.js"\nmoney.formatPrice(1)', 'money.js': MONEY }, ['SyntaxError']],
  ['a namespace import, the real way', { 'app.js': 'import * as money from "money.js"\nif (money.formatPrice(2.4) !== "2.40") throw new Error("no")', 'money.js': MONEY }, []],
  ['a bare package name without a build step (4.5)', { 'app.js': 'import { nextDay } from "friendly-day-format"\nnextDay()' }, ['TypeError']]
]

const BROWSERS: [string, BrowserType][] = [['Chromium', chromium], ['Firefox', firefox], ['WebKit', webkit]]

for (const [name, type] of BROWSERS) {
  test(`${name} has every API chapter 4 calls real, and none it calls invented`, async () => {
    // a Chromium-only machine skips the other two instead of failing (pnpm exec playwright install firefox webkit)
    test.skip(!existsSync(type.executablePath()), `${name} is not installed: pnpm exec playwright install ${type.name()}`)
    const browser = await type.launch()
    try {
      const page = await browser.newPage()
      await page.setContent('<!doctype html><title>apis</title>')
      expect(await page.evaluate(facts)).toEqual(EXPECTED)
      for (const [what, files, errors] of LINKS) {
        const fresh = await browser.newPage()
        await fresh.setContent('<!doctype html><title>modules</title>')
        expect(await fresh.evaluate(linkError, files), what).toEqual(errors)
      }
    } finally {
      await browser.close()
    }
  })
}
