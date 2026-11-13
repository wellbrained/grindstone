import { describe, expect, it } from 'vitest'
import { SHOP_ORIGIN, backendConfig, cssRules, debuggingLevels, editedText, levelIntro, pickLine, playSolution, reload, saveDebugFile, startDebugLevel, takeHint } from '../../../../shared/levels'
import type { DebugLevel, Observation } from '../../../../shared/levels'
import { probesGoal } from '../../../../shared/levels/debugging/checks'
import { expected } from './expected'
import { otherFixes } from './fixes'
import type { ExpectedRun } from './expected'

// Every Debugging level (ADR 0007): its shape, a start where no goal passes, goals that fail on what its broken app does
// and pass on what the fixed app does (the table in expected.ts; e2e/debugging-levels.spec.ts proves the apps really do
// that in a browser), its solution replayed, and for find tasks the click that solves it and why a wrong one does not.

const observed = (run: ExpectedRun): Observation => ({
  finished: true,
  errors: Array.from({ length: run.errors }, () => ({ kind: 'error' as const, text: 'Uncaught TypeError', source: null })),
  probes: run.probes,
  probeErrors: Object.fromEntries((run.missing ?? []).map(id => [id, 'Nothing on the page matches'])),
  logs: []
})

const lines = (level: DebugLevel, path: string) => (level.setup().files[path] ?? '').split('\n')
const texts = (level: DebugLevel) => [levelIntro(level), ...level.hints, ...(level.kind === 'scenario' ? level.debrief.paragraphs : [level.why])]

/** Lines the texts point at, with what is there: the hints may only name lines that say what they claim. */
const POINTED_AT: Record<string, [path: string, line: number, contains: string][]> = {
  'debugging-01-add-to-cart': [['cart.js', 17, 'cart.itmes.push(line)'], ['cart.js', 7, 'items: []']],
  'debugging-practice-line-that-throws': [['specials.js', 11, 'special.price.amount.toFixed(2)']],
  'debugging-practice-misspelled-property': [['cart.js', 7, 'cart.itesm.length']],
  'debugging-02-prices-vanished': [['app.js', 4, 'import formatPrice from \'./money.js\'']],
  'debugging-practice-import-right-name': [['app.js', 4, 'import { formatEuro } from \'./money.js\'']],
  'debugging-03-total-not-defined': [['checkout.js', 17, 'formatPrice(total)'], ['checkout.js', 13, 'let total = 0']],
  'debugging-practice-move-declaration-up': [['hours.js', 4, 'renderHours()'], ['hours.js', 6, 'const hours = ']],
  'debugging-04-error-in-money': [['checkout.js', 10, 'formatPrice(cart)'], ['money.js', 3, 'amount.toFixed(2)']],
  'debugging-practice-frame-that-passed': [['breads.js', 10, 'formatWeight(loaf)']],
  'debugging-practice-three-frame-trace': [['app.js', 12, 'confirmPickup(slots)']],
  'debugging-05-blank-page': [['cart.js', 11, '} else {'], ['cart.js', 12, 'cart.items.push('], ['cart.js', 16, 'export function renderBadge']],
  'debugging-practice-real-mistake': [['hours.js', 5, 'sunday: \'closed\''], ['hours.js', 7, 'export function hoursText']],
  'debugging-practice-close-the-bracket': [['cart.js', 9, 'renderBadge()'], ['cart.js', 11, 'export function renderBadge']],
  'debugging-06-menu-wont-load': [['menu.js', 4, 'fetch(\'/api/products\')'], ['api.md', 13, '`/api/products` is now `/api/menu`']],
  'debugging-practice-builds-the-address': [['config.js', 5, '/special`'], ['specials.js', 5, 'fetch(SPECIALS_URL)'], ['config.js', 2, '\'/api\''], ['config.js', 4, 'MENU_URL'], ['app.js', 16, 'loadSpecials('], ['app.js', 17, 'fetch(MENU_URL)']],
  'debugging-practice-right-path': [['hours.js', 3, 'fetch(\'/api/opening-hours\')']],
  'debugging-07-nothing-happens': [['order.js', 18, 'const order = await response.json()'], ['order.js', 19, 'clearCart()'], ['order.js', 13, 'fetch(\'/api/orders\'']],
  'debugging-practice-failing-request': [['specials.js', 4, 'fetch(\'/api/specials\')'], ['hours.js', 3, 'fetch(\'/api/hours\')'], ['menu.js', 4, 'fetch(\'/api/menu\')'], ['specials.js', 6, 'if (!response.ok) return'], ['app.js', 18, 'loadSpecials()']],
  'debugging-practice-check-response-ok': [['voucher.js', 11, 'message.textContent = \'Voucher applied']],
  'debugging-08-wrong-quantity': [['order.js', 11, 'qty: line.qty']],
  'debugging-practice-quantity-as-number': [['order.js', 6, 'quantity: input.value']],
  'debugging-09-works-on-my-machine': [['specials.js', 4, 'fetch(\'https://api.cornerbakery.shop/specials\')']],
  'debugging-practice-own-origin': [['newsletter.js', 5, 'fetch(\'https://api.cornerbakery.shop/newsletter\'']],
  'debugging-10-orders-twice': [['order.js', 9, 'status.textContent = \'Sending your order…\''], ['order.js', 16, 'const order = await response.json()']],
  'debugging-practice-disable-while-sending': [['cake.js', 7, 'message.textContent = \'Checking the oven plan…\'']],
  'debugging-11-invisible-order': [['style.css', 99, '.order {'], ['style.css', 103, 'background: var(--brown);'], ['style.css', 3, '--brand: #7a3e12;']],
  'debugging-practice-inherited-colour': [['style.css', 110, '.basket {'], ['style.css', 114, 'color: var(--paper);'], ['style.css', 14, 'color: var(--ink);'], ['style.css', 7, '--paper: #fffaf3;'], ['style.css', 117, '.basket p {']],
  'debugging-practice-variable-name': [['style.css', 92, 'background: var(--brand-colour);']],
  'debugging-12-cant-click': [['style.css', 145, '.toast-area {'], ['style.css', 150, 'z-index: 10;'], ['style.css', 151, 'height: 140px;'], ['style.css', 157, '.toast {']],
  'debugging-practice-what-covers': [['style.css', 126, '.notice-area {'], ['style.css', 127, 'position: fixed;'], ['style.css', 128, 'inset: 0;'], ['style.css', 129, 'z-index: 100;'], ['style.css', 135, '.notice {'], ['style.css', 87, '.add {'], ['style.css', 99, '.order {']],
  'debugging-practice-let-clicks-through': [['style.css', 126, '.banner {']],
  'debugging-13-style-doesnt-apply': [['style.css', 82, '#products .price {'], ['style.css', 126, '.special .price {']],
  'debugging-practice-rule-that-wins': [['style.css', 87, '#products .add {'], ['style.css', 92, 'background: var(--brand);'], ['style.css', 126, '.sold-out .add {'], ['style.css', 127, 'background: #b8ad9f;']],
  'debugging-practice-selector-typo': [['style.css', 126, '.sold-uot .add {']],
  'debugging-14-gone-on-phones': [['style.css', 126, '.order-bar {'], ['style.css', 127, 'display: none;'], ['style.css', 148, '@media (min-width: 600px) {']],
  'debugging-practice-media-query-line': [['style.css', 132, '@media (max-width: 700px) {'], ['style.css', 125, '@media (min-width: 900px) {'], ['style.css', 31, '.tagline,'], ['style.css', 32, '.hours {']],
  'debugging-practice-turn-the-query': [['style.css', 126, '@media (min-width: 600px) {']],
  'debugging-15-long-name': [['style.css', 73, '.info {'], ['style.css', 74, 'flex: 1;']],
  'debugging-practice-nowrap-line': [['style.css', 129, 'white-space: nowrap;'], ['style.css', 125, '.note {'], ['style.css', 44, 'white-space: nowrap;'], ['style.css', 47, 'main {']],
  'debugging-practice-long-address': [['style.css', 125, '.note {']],
  'debugging-16-object-promise': [['basket.js', 10, 'export function addToCart(product) {'], ['basket.js', 11, 'const price = priceOf(product.id)']],
  'debugging-practice-forgot-to-wait': [['slots.js', 8, 'const slots = loadSlots()'], ['slots.js', 10, 'slots.map('], ['slots.js', 3, 'await fetch('], ['slots.js', 4, 'return response.json()'], ['app.js', 4, 'showSlots()']],
  'debugging-practice-await-the-hours': [['hours.js', 8, 'const hours = loadHours()']],
  'debugging-17-wrong-results': [['search.js', 23, 'const products = await response.json()']],
  'debugging-practice-old-answer-wins': [['allergens.js', 10, 'textContent = `Contains: '], ['allergens.js', 8, 'await fetch('], ['allergens.js', 6, 'textContent = product.name'], ['allergens.js', 9, 'await response.json()'], ['app.js', 15, 'showAllergens(product)']],
  'debugging-practice-drop-the-old-day': [['slots.js', 15, 'list.textContent = times.join'], ['slots.js', 6, 'let selected = null']],
  'debugging-18-adds-sourdough': [['app.js', 10, 'var product = products[i]']],
  'debugging-practice-shared-index': [['sizes.js', 9, 'let i'], ['sizes.js', 10, 'for (i = 0;'], ['sizes.js', 16, 'sizes[i].name'], ['sizes.js', 14, 'button.textContent = sizes[i].name'], ['sizes.js', 15, 'addEventListener('], ['sizes.js', 2, 'const sizes = [']],
  'debugging-practice-own-time': [['pickup.js', 5, 'for (var time of times)']],
  'debugging-19-changes-both': [['cart.js', 12, 'const line = { ...DEFAULTS, id: product.id']],
  'debugging-practice-same-list': [['boxes.js', 8, '{ ...EMPTY_BOX, name }'], ['boxes.js', 3, 'pastries: []'], ['boxes.js', 14, 'box.pastries.push('], ['boxes.js', 9, 'boxes.push(box)'], ['app.js', 14, 'addPastry(box']],
  'debugging-practice-copy-last-week': [['reorder.js', 7, 'const order = lastWeek']],
  'debugging-20-says-it-failed': [['order.js', 17, '      response.json()'], ['order.js', 23, '.catch(() => {']],
  'debugging-practice-pass-the-data-on': [['specials.js', 5, '      response.json()'], ['specials.js', 9, 'for (const special of specials)'], ['specials.js', 3, 'fetch(\'/api/specials\')'], ['specials.js', 7, '.then((specials) => {'], ['specials.js', 4, '.then((response) => {'], ['app.js', 4, 'loadSpecials()']],
  'debugging-practice-catch-the-rejection': [['app.js', 4, '() => reserveCake())']],
  'debugging-21-discount-twice': [['loyalty.js', 5, 'return total * (1 - LOYALTY_DISCOUNT)'], ['cart.js', 17, 'if (card.checked) total = applyDiscount(total)'], ['checkout.js', 12, 'if (card.checked) total = applyDiscount(total)'], ['checkout.js', 11, 'let total = basketTotal()']],
  'debugging-practice-second-caller': [['menu.js', 14, 'showWelcome()'], ['app.js', 5, 'showWelcome()'], ['app.js', 6, 'showMenu()'], ['greeting.js', 5, 'line.textContent = \'Good morning'], ['greeting.js', 6, '.append(line)']],
  'debugging-practice-count-once': [['app.js', 6, 'addStamp()'], ['order.js', 6, 'addStamp()']],
  'debugging-22-misses-last-item': [['receipt.js', 10, 'i < items.length - 1']],
  'debugging-practice-loop-start': [['times.js', 6, 'for (let i = 1;'], ['times.js', 2, 'const times = [\'7:00\''], ['times.js', 9, 'button.textContent = times[i]'], ['app.js', 3, 'showTimes()']],
  'debugging-practice-no-extra-size': [['sizes.js', 6, 'i <= sizes.length']],
  'debugging-23-no-free-delivery': [['delivery.js', 6, 'if (total >= FREE_FROM) return 0']],
  'debugging-practice-unrounded-compare': [['tips.js', 7, 'if (tips === 0.3)'], ['tips.js', 5, 'tips += amount'], ['tips.js', 6, 'tips.toFixed(2)'], ['app.js', 5, 'addTip(0.2)']],
  'debugging-practice-box-from-six': [['box.js', 5, 'if (count > BOX_FROM) return 2']],
  'debugging-24-always-pickup': [['order.js', 13, 'if (order.method = \'pickup\')']],
  'debugging-practice-stock-zero': [['stock.js', 6, 'if (left = 0)'], ['stock.js', 2, '\'croissant\': 12'], ['stock.js', 5, 'let left = stock[id]'], ['stock.js', 7, 'left} left'], ['app.js', 10, 'stockText(product.id)']],
  'debugging-practice-compare-the-day': [['hours.js', 3, 'if (day = \'Sunday\')']],
  'debugging-25-seventh-item': [['wholesale.js', 9, 'total += price'], ['breads.js', 10, 'name: \'Rye loaf\', grams: 0.75']],
  'debugging-practice-wrong-slices': [['cakes.js', 11, 'name: \'Plum cake\', slices: 80'], ['party.js', 7, 'total += cake.slices'], ['cakes.js', 9, 'name: \'Sheet cake\', slices: 16']],
  'debugging-practice-comma-price': [['box.js', 7, 'total += Number(pastry.price)'], ['pastries.js', 13, 'price: \'3,20\'']],
  'debugging-26-request-per-key': [['search.js', 27, 'field.addEventListener(\'input\', search)'], ['search.js', 22, 'await fetch(']],
  'debugging-practice-sends-per-key': [['postcode.js', 7, 'await fetch('], ['postcode.js', 12, 'addEventListener(\'input\''], ['postcode.js', 5, 'async function checkPostcode'], ['postcode.js', 9, 'answer.textContent'], ['postcode.js', 6, 'field.value.trim()']],
  'debugging-practice-check-once': [['voucher.js', 12, 'addEventListener(\'input\', checkVoucher)']],
  'debugging-27-redraws-menu': [['app.js', 11, 'function renderMenu()'], ['app.js', 35, '  render()']],
  'debugging-practice-draws-all-days': [['days.js', 7, 'function drawDays()'], ['days.js', 8, 'box.innerHTML'], ['days.js', 11, 'function showChosen()'], ['days.js', 12, 'chosenText.textContent'], ['days.js', 19, 'drawDays()'], ['days.js', 15, 'box.addEventListener(\'click\'']],
  'debugging-practice-only-the-counter': [['app.js', 21, 'renderPage()']],
  'debugging-28-formatted-thousands': [['prices.js', 5, 'export function priceLabel(id)'], ['prices.js', 6, 'formatPrice(entry.cents)'], ['prices.js', 7, 'labels.find(']],
  'debugging-practice-most-self-work': [['allergens.js', 5, 'ALLERGENS.filter(row => row.product === id)'], ['allergens.js', 4, 'export function allergensOf'], ['app.js', 1, '// The allergen list'], ['app.js', 5, 'products.map(product =>'], ['app.js', 7, 'allergensOf(product.id)']],
  'debugging-practice-map-lookup': [['total.js', 11, 'PRICES.find(']],
  'debugging-29-one-after-another': [['load.js', 11, 'await getJson(\'/api/menu\')'], ['load.js', 13, 'await getJson(\'/api/hours\')']],
  'debugging-practice-waits-first': [['cakes.js', 3, 'fetch(\'/api/cakes\')'], ['cakes.js', 4, 'fetch(\'/api/slots\')'], ['cakes.js', 5, 'querySelector(\'#cakes\')']],
  'debugging-practice-both-at-once': [['breads.js', 8, 'await getJson(\'/api/breads\')'], ['breads.js', 9, 'await getJson(\'/api/stock\')']],
  'debugging-30-asks-again': [['tabs.js', 10, 'async function showTab(name)'], ['tabs.js', 11, 'await fetch('], ['tabs.js', 12, 'await response.json()']],
  'debugging-practice-asks-for-hours-again': [['hours.js', 5, 'fetch(\'/api/hours\')'], ['hours.js', 10, 'addEventListener(\'click\', toggleHours)'], ['hours.js', 6, 'box.textContent'], ['hours.js', 4, 'async function toggleHours']],
  'debugging-practice-keep-the-answer': [['stamps.js', 6, 'card = await']]
}

describe('the Debugging levels', () => {
  it('are all in the table of what their apps do, and every table row is a level', () => {
    expect(Object.keys(expected)).toEqual(debuggingLevels.map(level => level.id))
    expect(Object.keys(POINTED_AT)).toEqual(debuggingLevels.map(level => level.id))
  })

  describe.each(debuggingLevels.map(level => [level.id, level] as const))('%s', (id, level) => {
    const table = expected[id]!
    const find = level.sandbox.find

    it('has the shape of its kind', () => {
      expect(level.track).toBe('debugging')
      expect(level.title).not.toBe('')
      expect(levelIntro(level).length).toBeGreaterThan(40)
      if (level.kind === 'scenario') {
        expect(level.hints).toHaveLength(3)
        expect(level.debrief.paragraphs.length).toBeGreaterThanOrEqual(2)
        expect(level.debrief.paragraphs.length).toBeLessThanOrEqual(4)
        // the error a scenario teaches you to read ('TypeError') or, in Network, the status or problem ('404', 'CORS')
        expect(level.teaches).toMatch(/^(?:[A-Z][a-z]+Error|\d{3}|[A-Za-z@ ()-]{3,16})$/)
        expect(find).toBeUndefined()
      } else {
        expect(level.hints).toHaveLength(1)
        expect(level.minutes).toBe(0.5)
        expect(level.why).not.toBe('')
      }
      const files = level.setup().files
      expect(files['index.html']).toMatch(/^<!doctype html>\n<html lang="en">\n<head>\n/)
      expect(Object.keys(files)).toContain(level.sandbox.open)
      expect(level.sandbox.page).toBe('/order')
      // a find task is a click (no probes, no edits), a fix is edits and then one reload
      if (find) {
        expect(level.kind).toBe('practice')
        expect(level.sandbox.probes).toEqual([])
        expect(level.solution).toEqual([{ pick: find.path, line: find.lines[0] }])
      } else {
        expect(level.sandbox.probes.length).toBeGreaterThan(0)
        expect(level.solution.at(-1)).toBe('reload')
        expect(level.solution.filter(step => step === 'reload')).toHaveLength(1)
      }
    })

    it('scripts a backend it can run, and reads requests only where there is one', () => {
      const backend = level.sandbox.backend
      const readsRequests = level.sandbox.probes.some(probe => probe.steps.some(step => 'requests' in step || 'sent' in step))
      if (readsRequests) expect(backend).toBeDefined()
      // a request probe names 'METHOD /path' or 'METHOD https://host/path'
      for (const step of level.sandbox.probes.flatMap(probe => probe.steps)) {
        if ('requests' in step) expect(step.requests).toMatch(/^[A-Z]+ (?:\/|https:\/\/)\S*$/)
        if ('sent' in step) expect(step.sent).toMatch(/^[A-Z]+ (?:\/|https:\/\/)\S*$/)
      }
      if (!backend) return
      expect(() => backendConfig(backend, SHOP_ORIGIN)).not.toThrow()
      // every route is on the shop or a whole URL, so the Network panel can name it
      for (const route of backend.routes) expect(route.path).toMatch(/^(?:\/|https:\/\/)/)
    })

    it('starts the same every time, with every goal open', () => {
      expect(level.setup()).toEqual(level.setup())
      const session = startDebugLevel(level)
      expect(session.state).toMatchObject({ observed: null, picked: null })
      expect(Object.values(session.goalsMet)).toEqual(level.goals.map(() => false))
    })

    it('only points at lines that say what the texts claim', () => {
      for (const [path, line, contains] of POINTED_AT[id]!) expect(lines(level, path)[line - 1], `${path}:${line}`).toContain(contains)
      // every `file:line` the texts name is a line of that file
      for (const text of texts(level)) {
        for (const [, path, line] of text.matchAll(/`([\w/.-]+\.(?:js|html|css)):(\d+)`/g)) {
          expect(lines(level, path!).length, `${path}:${line}`).toBeGreaterThanOrEqual(Number(line))
        }
      }
    })

    it('reads the page\'s changes, the work and the server\'s time only in a Performance level', () => {
      const reads = level.sandbox.probes.flatMap(probe => probe.steps).some(step => 'changes' in step || 'work' in step || 'waited' in step)
      if (reads) expect(level.sandbox.performance).toBe(true)
      if (!level.sandbox.performance) return
      expect(level.sandbox.elements).toBeUndefined()
      expect(level.sandbox.debugger).toBeUndefined()
      // a find task's answer is a line the panel links (the e2e records each app to check it)
      if (find) expect(table.answerProfile).toBe(true)
    })

    if (level.sandbox.elements) {
      it('uses the Elements panel: its CSS opens first, and every rule of it can be read and linked', () => {
        expect(level.sandbox.open).toBe('style.css')
        expect(level.sandbox.backend).toBeUndefined()
        const rules = cssRules(level.setup().files)
        expect(rules.length).toBeGreaterThan(10)
        // a find task's answer is a line the panel links: a rule's selector, one of its declarations or its media query
        const linked = new Set(rules.flatMap(rule => [rule.line, ...rule.declarations.map(each => each.line), ...rule.conditions.map(each => each.line)]))
        for (const line of find?.lines ?? []) expect(linked.has(line), `style.css:${line}`).toBe(true)
      })
    }

    if (find) {
      it('is solved by clicking the answer, in the editor or the trace, and says why a wrong click is not it', () => {
        for (const line of find.lines) {
          const result = pickLine(startDebugLevel(level), level, { path: find.path, line })
          expect(result.output.verdict).toEqual({ right: true, why: null })
          expect(result.solvedNow).toBe(true)
        }
        for (const [place, why] of Object.entries(find.wrong)) {
          const [path, line] = place.split(':')
          expect(find.lines.includes(Number(line)) && path === find.path, place).toBe(false)
          expect(lines(level, path!).length, place).toBeGreaterThanOrEqual(Number(line))
          const result = pickLine(startDebugLevel(level), level, { path: path!, line: Number(line) })
          expect(result.output.verdict).toEqual({ right: false, why })
          expect(result.session.solved).toBe(false)
        }
        const elsewhere = pickLine(startDebugLevel(level), level, { path: 'index.html', line: 1 })
        expect(elsewhere.output.verdict).toEqual({ right: false, why: find.otherwise })
        // a wrong click, then the right one: solved, and the clicks count as actions but not as reloads
        const wrong = pickLine(startDebugLevel(level), level, { path: 'index.html', line: 1 })
        const right = pickLine(wrong.session, level, { path: find.path, line: find.lines[0]! })
        expect(right.session).toMatchObject({ solved: true, commandCount: 2 })
        expect(right.session.reloads).toBeUndefined()
      })

      it('is not solved by anything but a click', () => {
        const session = reload(startDebugLevel(level), level, observed(table.start)).session
        expect(session.solved).toBe(false)
      })
    } else {
      it('fails every goal on its broken app, and passes them all once it is fixed', () => {
        const broken = reload(startDebugLevel(level), level, observed(table.start)).session
        expect(Object.values(broken.goalsMet)).toEqual(level.goals.map(() => false))
        const fixed = reload(startDebugLevel(level), level, observed(table.solved!)).session
        expect(Object.values(fixed.goalsMet)).toEqual(level.goals.map(() => true))
        // a check run that did not finish (an endless loop, a hang) proves nothing: no goal passes
        const hung = reload(startDebugLevel(level), level, { ...observed(table.solved!), finished: false }).session
        expect(Object.values(hung.goalsMet)).toEqual(level.goals.map(() => false))
      })

      it('is solved by replaying its solution: the edits, then one reload', async () => {
        const startFiles = level.setup().files
        const results = await playSolution(level, async files => observed(JSON.stringify(files) === JSON.stringify(startFiles) ? table.start : table.solved!))
        expect(results.map(result => result.solvedNow)).toEqual(level.solution.map((_, index) => index === level.solution.length - 1))
        expect(results.at(-1)!.session).toMatchObject({ solved: true, reloads: 1, commandCount: level.solution.length })
      })

      it('changes its files only through its solution\'s edits, each of which changes something', () => {
        let files = level.setup().files
        for (const step of level.solution) {
          if (typeof step === 'string' || !('save' in step)) continue
          const text = editedText(files, step)
          expect(text).not.toBe(files[step.save])
          files = { ...files, [step.save]: text }
        }
        expect(files).not.toEqual(level.setup().files)
      })

      it('gets no credit for a reload without a fix', () => {
        const unchanged = saveDebugFile(startDebugLevel(level), level, level.sandbox.open, level.setup().files[level.sandbox.open]!)
        expect(reload(unchanged.session, level, observed(table.start)).session.solved).toBe(false)
      })
    }

    it('counts its hints', () => {
      const shown = takeHint(startDebugLevel(level), level)
      expect(shown).toMatchObject({ number: 1, total: level.hints.length, revealed: true })
    })
  })
})

describe('the Debugging engine', () => {
  const level = debuggingLevels[0]!

  it('saves only files the app has, and a save is an action, not a reload', () => {
    const session = startDebugLevel(level)
    expect(saveDebugFile(session, level, 'nope.js', 'x').session).toBe(session)
    const saved = saveDebugFile(session, level, 'cart.js', '// empty\n')
    expect(saved.session.state.files['cart.js']).toBe('// empty\n')
    expect(saved.session).toMatchObject({ commandCount: 1, history: [{ kind: 'save', path: 'cart.js' }] })
    expect(saved.session.reloads).toBeUndefined()
    // goals only change on a reload: a save keeps what the last reload saw
    expect(saved.session.goalsMet).toEqual(session.goalsMet)
  })

  it('counts reloads, and a click outside a find task does nothing', () => {
    const first = reload(startDebugLevel(level), level, observed(expected[level.id]!.start))
    const second = reload(first.session, level, observed(expected[level.id]!.start))
    expect(second.session).toMatchObject({ reloads: 2, commandCount: 2, history: [{ kind: 'reload' }, { kind: 'reload' }] })
    const session = startDebugLevel(level)
    expect(pickLine(session, level, { path: 'cart.js', line: 17 })).toMatchObject({ session, output: { verdict: null } })
  })

  it('refuses a solution edit whose text is not in the file', () => {
    expect(() => editedText({ 'a.js': 'x' }, { save: 'a.js', replace: ['y', 'z'] })).toThrow(/does not contain/)
    expect(() => editedText({}, { save: 'a.js', replace: ['y', 'z'] })).toThrow(/no file/)
    // `$&` in the replacement is written as is
    expect(editedText({ 'a.js': 'x' }, { save: 'a.js', replace: ['x', '$&$&'] })).toBe('$&$&')
  })
})

describe('the Debugging goal helpers', () => {
  const state = (observed: Partial<Observation> | null) => ({ files: {}, picked: null, observed: observed && { finished: true, errors: [], probes: {}, probeErrors: {}, logs: [], ...observed } })
  const check = (goal: ReturnType<typeof probesGoal>, observed: Partial<Observation> | null) => goal.check({ state: state(observed), history: [] })
  const error = { kind: 'rejection' as const, text: 'Uncaught (in promise) AbortError: signal is aborted without reason', source: null }

  it('probesGoal: every probe as expected, in a run that finished', () => {
    const goal = probesGoal('results', 'The results are right', { heading: '2 results', rows: 2 })
    expect(check(goal, { probes: { heading: '2 results', rows: 2 } })).toBe(true)
    expect(check(goal, { probes: { heading: '2 results', rows: 2 }, errors: [error] })).toBe(true)
    expect(check(goal, { probes: { heading: '2 results', rows: 3 } })).toBe(false)
    expect(check(goal, { probes: { heading: '2 results', rows: 2 }, finished: false })).toBe(false)
    expect(check(goal, null)).toBe(false)
  })

  it('probesGoal with clean: also nothing red in the Console', () => {
    const goal = probesGoal('results', 'The results are right, and nothing is red', { heading: '2 results' }, { clean: true })
    expect(check(goal, { probes: { heading: '2 results' } })).toBe(true)
    expect(check(goal, { probes: { heading: '2 results' }, errors: [error] })).toBe(false)
    expect(check(goal, { probes: { heading: '3 results' } })).toBe(false)
  })
})

describe('other fixes and non-fixes (State & async, Breakpoints & stepping)', () => {
  it.each(Object.entries(otherFixes))('%s: every edit applies to the starting files and changes them', (id, fixes) => {
    const level = debuggingLevels.find(each => each.id === id)
    expect(level, id).toBeDefined()
    expect(level!.sandbox.find).toBeUndefined()
    for (const fix of fixes) {
      let files = level!.setup().files
      for (const edit of fix.edits) {
        const text = editedText(files, edit)
        expect(text, `${id}: ${fix.name}`).not.toBe(files[edit.save])
        files = { ...files, [edit.save]: text }
      }
    }
    // each fix level with another fix also names a non-fix, or is a practice task
    if (level!.kind === 'scenario') expect(fixes.some(fix => !fix.solves), id).toBe(true)
  })
})
