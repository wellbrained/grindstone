// Structure of the Working with AI cheat sheet (/ai/cheat-sheet): "what to check in an AI pull request", one group per
// chapter's kind of problem (read the diff, claims, tests, invented APIs, security, scope, steering), the checks in
// each, the lines from the levels that show them (data, not translated) and the scenarios that practise each check.
// Every visible text lives in the i18n locales under `aiCheat.*`; the key helpers below say where. Modelled on the
// Debugging cheat sheet (debugging-cheatsheet.ts); test/unit/ui/ai-cheatsheet.test.ts keeps the quoted lines in step
// with the levels.
import { levelById } from '../../shared/levels'
import type { Level } from '../../shared/levels'

export interface AiCheatExample {
  /** A line of code from a level's pull request (data, not translated). Its note is an i18n key, see `aiNoteKey`. */
  line: string
}

export interface AiCheatEntry {
  /** Unique over the whole sheet; the i18n key part. */
  id: string
  examples: AiCheatExample[]
  /** Level ids (scenarios) that practise it, in level order. */
  levels: string[]
}

export interface AiCheatGroup {
  /** The i18n key part; also the section's anchor. */
  id: string
  /** The track chapter the group sums up. */
  chapter: string
  entries: AiCheatEntry[]
}

const line = (text: string): AiCheatExample => ({ line: text })

export const aiCheatGroups: AiCheatGroup[] = [
  {
    id: 'diff',
    chapter: 'read-the-diff',
    entries: [
      { id: 'edges', examples: [line('return !line || line.quantity < MAX_PER_PRODUCT - 1')], levels: ['ai-01-twelve-croissants'] },
      { id: 'names', examples: [line('const count = itemCount()')], levels: ['ai-02-line-totals'] },
      { id: 'conditions', examples: [line('coffee.hidden = total >= FREE_COFFEE_FROM')], levels: ['ai-03-free-coffee'] },
      { id: 'cases', examples: [line('switch (method) {')], levels: ['ai-04-pickup-locker'] },
      { id: 'units', examples: [line('const discounted = total * (1 - BULK_DISCOUNT)'), line('return Math.round(discounted)')], levels: ['ai-05-office-discount'] }
    ]
  },
  {
    id: 'claims',
    chapter: 'claims-vs-code',
    entries: [
      { id: 'every-claim', examples: [line('averageText.textContent = formatPrice(total / itemCount())')], levels: ['ai-06-empty-basket', 'ai-08-all-sizes'] },
      { id: 'no-change', examples: [line('return products.sort((a, b) => a.price - b.price)[0]')], levels: ['ai-07-just-a-refactor', 'ai-10-same-but-faster'] },
      { id: 'linked', examples: [], levels: ['ai-09-linked-issue'] }
    ]
  },
  {
    id: 'tests',
    chapter: 'tests-that-lie',
    entries: [
      { id: 'a-check', examples: [line('expect(total)')], levels: ['ai-11-all-tests-pass', 'ai-32-afternoon-deal'] },
      { id: 'mocked', examples: [line('vi.spyOn(pricing, \'applyDiscount\').mockReturnValue(21.6)')], levels: ['ai-12-mocked'] },
      { id: 'on-main', examples: [], levels: ['ai-13-fixed-the-test', 'ai-15-snapshot-updated'] },
      { id: 'edge-tests', examples: [line('const share = Math.round(total / people * 100) / 100')], levels: ['ai-14-full-coverage'] }
    ]
  },
  {
    id: 'apis',
    chapter: 'invented-apis',
    entries: [
      { id: 'run-it', examples: [line('const latest = cart.items.last()')], levels: ['ai-16-just-added', 'ai-18-money-helper', 'ai-19-one-listener'] },
      { id: 'options', examples: [line('hideTrailingZeros: true')], levels: ['ai-17-whole-euros'] },
      { id: 'packages', examples: [line('import { nextDay, formatDay } from \'friendly-day-format\'')], levels: ['ai-20-date-library'] }
    ]
  },
  {
    id: 'security',
    chapter: 'security',
    entries: [
      { id: 'as-text', examples: [line('item.innerHTML = `<p>${review.text}</p>`')], levels: ['ai-21-customer-reviews'] },
      { id: 'secrets', examples: [], levels: ['ai-22-payment-key', 'ai-34-order-by-email'] },
      { id: 'who', examples: [line('app.patch(\'/api/menu/:id\', requireStaff, async (req, res) => {')], levels: ['ai-23-staff-button', 'ai-25-order-by-number'] },
      { id: 'trust', examples: [line('const { items, total } = req.body')], levels: ['ai-24-price-from-basket'] }
    ]
  },
  {
    id: 'scope',
    chapter: 'scope-and-size',
    entries: [
      { id: 'size', examples: [], levels: ['ai-26-menu-typo', 'ai-35-raise-free-delivery'] },
      { id: 'side', examples: [], levels: ['ai-27-pickup-note', 'ai-30-sold-out-label'] },
      { id: 'rewrite', examples: [], levels: ['ai-28-five-cents'] },
      { id: 'two', examples: [], levels: ['ai-29-cart-to-basket'] }
    ]
  },
  {
    id: 'steering',
    chapter: 'steer',
    entries: [
      { id: 'name-kind', examples: [], levels: ['ai-31-what-offices-save', 'ai-32-afternoon-deal', 'ai-33-undo-last-add', 'ai-34-order-by-email', 'ai-35-raise-free-delivery'] },
      { id: 'real-check', examples: [line('expect(total).toBe(7.5)')], levels: ['ai-32-afternoon-deal'] },
      { id: 'not-caught', examples: [line('const line = cart.lines.at(-1)')], levels: ['ai-33-undo-last-add'] },
      { id: 'not-hidden', examples: [line('process.env.MAILCRATE_KEY')], levels: ['ai-34-order-by-email'] },
      { id: 'out', examples: [], levels: ['ai-35-raise-free-delivery'] },
      { id: 'fine-code', examples: [line('savingLine.hidden = total === full')], levels: ['ai-31-what-offices-save'] },
      { id: 'commit', examples: [], levels: ['ai-31-what-offices-save', 'ai-33-undo-last-add'] }
    ]
  }
]

/** i18n key of a group's title. */
export const aiGroupKey = (groupId: string) => `aiCheat.groups.${groupId}`
/** i18n key of an entry's title. */
export const aiTitleKey = (entryId: string) => `aiCheat.entries.${entryId}.title`
/** i18n key of an entry's summary. */
export const aiSummaryKey = (entryId: string) => `aiCheat.entries.${entryId}.summary`
/** i18n key of the note above an example line (counted from 0 in the order of `examples`). */
export const aiNoteKey = (entryId: string, index: number) => `aiCheat.entries.${entryId}.examples.${index}`

/** The levels behind a list of ids, in the order given; an unknown id is skipped (the unit test pins that none is). */
export function aiCheatLevels(ids: readonly string[]): Level[] {
  return ids.flatMap((id) => {
    const level = levelById(id)
    return level ? [level] : []
  })
}
