import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '../../../layers/i18n/i18n/locales/en.json'
import { debugCheatGroups, debugCheatLevels, debugErrorKey, debugGroupKey, debugNoteKey, debugSummaryKey, debugTitleKey, debugErrorTypes } from '../../../app/utils/debugging-cheatsheet'
import { debuggingLevels, levelById } from '../../../shared/levels'

/** The text behind a dotted i18n key, or undefined when a part of the path is missing. */
const lookup = (key: string) => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en)

const entries = debugCheatGroups.flatMap(group => group.entries)

describe('debugging cheat sheet', () => {
  it('has an English text for every group, title, summary, example note and error text', () => {
    const keys = [
      ...debugCheatGroups.map(group => debugGroupKey(group.id)),
      debugGroupKey('errors'),
      ...entries.flatMap(entry => [debugTitleKey(entry.id), debugSummaryKey(entry.id), ...entry.examples.map((_, i) => debugNoteKey(entry.id, i))]),
      ...debugErrorTypes.flatMap(error => [debugErrorKey(error.id, 'means'), debugErrorKey(error.id, 'look')])
    ]
    expect(keys.filter(key => typeof lookup(key) !== 'string' || lookup(key) === '')).toEqual([])
  })

  it('has no sheet text without a place on the page', () => {
    const sheet = en.debugCheat as { groups: Record<string, string>, entries: Record<string, { examples?: Record<string, string> }>, errors: Record<string, unknown> }
    expect(Object.keys(sheet.groups).sort()).toEqual([...debugCheatGroups.map(group => group.id), 'errors'].sort())
    expect(Object.keys(sheet.entries).sort()).toEqual(entries.map(entry => entry.id).sort())
    for (const entry of entries) {
      expect(Object.keys(sheet.entries[entry.id]!.examples ?? {}), entry.id).toHaveLength(entry.examples.length)
    }
    expect(Object.keys(sheet.errors).sort()).toEqual(debugErrorTypes.map(error => error.id).sort())
  })

  it('keeps the characters vue-i18n reads as syntax (braces, pipes, at signs) out of the texts', () => {
    const strings: string[] = []
    const walk = (node: unknown) => typeof node === 'string' ? strings.push(node) : Object.values(node as object).forEach(walk)
    walk(en.debugCheat)
    // {query} and {line} are the page's own placeholders
    expect(strings.filter(text => /[{}|@]/.test(text.replace(/\{(query|line)\}/g, '')))).toEqual([])
  })

  it('has no duplicate ids, example lines or level links', () => {
    expect(new Set(entries.map(entry => entry.id)).size).toBe(entries.length)
    expect(new Set(debugCheatGroups.map(group => group.id)).size).toBe(debugCheatGroups.length)
    expect(new Set(debugErrorTypes.map(error => error.id)).size).toBe(debugErrorTypes.length)
    expect(new Set(debugErrorTypes.map(error => error.message)).size).toBe(debugErrorTypes.length)
    for (const entry of entries) {
      expect(new Set(entry.examples.map(example => example.line)).size, entry.id).toBe(entry.examples.length)
      expect(new Set(entry.levels).size, entry.id).toBe(entry.levels.length)
    }
    for (const error of debugErrorTypes) expect(new Set(error.levels).size, error.id).toBe(error.levels.length)
  })

  it('links only to Debugging scenarios that exist, in level order', () => {
    const order = debuggingLevels.map(level => level.id)
    for (const { id, levels } of [...entries, ...debugErrorTypes]) {
      for (const levelId of levels) {
        const level = levelById(levelId)
        expect(level, `${id}: ${levelId}`).toBeDefined()
        expect(level?.track, levelId).toBe('debugging')
        expect(level?.kind, levelId).toBe('scenario')
      }
      const positions = levels.map(levelId => order.indexOf(levelId))
      expect(positions, id).toEqual([...positions].sort((a, b) => a - b))
      expect(debugCheatLevels(levels).map(level => level.id), id).toEqual(levels)
    }
  })

  it('links every scenario of the track from somewhere on the sheet', () => {
    const linked = new Set([...entries, ...debugErrorTypes].flatMap(item => item.levels))
    const scenarios = debuggingLevels.filter(level => level.kind === 'scenario').map(level => level.id)
    expect(scenarios.filter(id => !linked.has(id))).toEqual([])
  })

  it('quotes the error messages in Chrome wording, one per kind the levels teach', () => {
    const messages = debugErrorTypes.map(error => error.message)
    for (const start of ['TypeError: ', 'ReferenceError: ', 'SyntaxError: ', 'AbortError: ', 'Access to fetch at ', 'GET ']) {
      expect(messages.some(message => message.startsWith(start)), start).toBe(true)
    }
    expect(messages).toContain('TypeError: Failed to fetch')
    expect(messages).toContain('ReferenceError: total is not defined')
  })

  describe('against the levels', () => {
    const dir = resolve(__dirname, '../../../shared/levels/debugging')
    const flat = (text: string) => text.replace(/\\'/g, '\'').replace(/\s+/g, ' ')
    const read = (file: string) => flat(readFileSync(resolve(dir, file), 'utf8'))
    /** A level's own file, by id (`debugging-09-works-on-my-machine`). */
    const levelFile = (id: string) => read(`${id.replace('debugging-', '')}.ts`)
    const practice = readdirSync(resolve(dir, 'practice')).map(file => read(`practice/${file}`)).join(' ')
    const backend = read('backend.ts')

    // what each message has to share with the levels' code, texts or backend (the page's wording may differ in names only)
    const quoted: Record<string, string[]> = {
      'cannot-read': ['Cannot read properties of undefined (reading \''],
      'not-a-function': ['formatPrice is not a function'],
      'wrong-value': ['amount.toFixed is not a function'],
      'map-not-a-function': ['slots.map is not a function'],
      'not-iterable': ['specials is not iterable'],
      'not-defined': ['total is not defined'],
      'before-init': ['before initialization'],
      'unexpected-export': ['Unexpected token \'export\''],
      'missing-export': ['import { formatEuro } from \'./money.js\''],
      'not-json': ['Unexpected token \'<\'', 'is not valid JSON'],
      'not-found': ['404 (Not Found)'],
      'failed-fetch': ['Failed to fetch'],
      'cors-blocked': [
        'fetch(\'https://api.cornerbakery.shop/specials\')',
        'has been blocked by CORS policy: ',
        'No \'Access-Control-Allow-Origin\' header is present on the requested resource.',
        'If an opaque response serves your needs, set the request\'s mode to \'no-cors\' to fetch the resource with CORS disabled.'
      ],
      'aborted': ['signal is aborted without reason']
    }

    it('quotes each error message as the levels, their practice tasks or the backend produce it', () => {
      expect(Object.keys(quoted).sort()).toEqual(debugErrorTypes.map(error => error.id).sort())
      for (const error of debugErrorTypes) {
        const haystack = [...error.levels.map(levelFile), practice, backend].join(' ')
        for (const part of quoted[error.id]!) {
          expect(flat(error.message), `${error.id} (message)`).toContain(part.replace('fetch(\'https://api.cornerbakery.shop/specials\')', 'https://api.cornerbakery.shop/specials').replace('import { formatEuro } from \'./money.js\'', 'formatEuro'))
          expect(haystack, `${error.id}: ${part}`).toContain(part)
        }
      }
    })

    it('copies lines that exist where a level is meant to teach them', () => {
      const inLevel: Record<string, string[]> = {
        'debugging-19-changes-both': ['cart.items[0].options === cart.items[1].options', 'structuredClone(DEFAULTS)', 'options: { ...DEFAULTS.options }'],
        'debugging-25-seventh-item': ['price < 1', 'bread.grams < 10', 'bread.name === \'Rye loaf\''],
        'debugging-30-asks-again': ['answers[name] ??= fetch(`/api/${name}`).then(response => response.json())'],
        'debugging-17-wrong-results': ['const ticket = ++latest', 'ticket !== latest', 'AbortController'],
        'debugging-16-object-promise': ['const price = await priceOf(product.id)', 'priceOf(product.id).then(price =>'],
        'debugging-20-says-it-failed': ['console.error(error)'],
        'debugging-34-some-customers': ['JSON.stringify']
      }
      for (const [id, parts] of Object.entries(inLevel)) {
        const text = levelFile(id)
        for (const part of parts) {
          expect(text, `${id}: ${part}`).toContain(part)
        }
      }
    })

    it('gives the race a new controller per request, so a copied line does not abort every later one', () => {
      const race = entries.find(entry => entry.id === 'race')!.examples.map(example => example.line)
      expect(race.indexOf('controller?.abort()')).toBeGreaterThanOrEqual(0)
      expect(race.indexOf('controller = new AbortController()')).toBeGreaterThan(race.indexOf('controller?.abort()'))
      expect(race.indexOf('fetch(url, { signal: controller.signal })')).toBeGreaterThan(race.indexOf('controller = new AbortController()'))
    })
  })

  it('marks plain rows (keys, status words) as not copyable, and nothing else', () => {
    const plainIds = entries.filter(entry => entry.examples.some(example => example.copy === false)).map(entry => entry.id)
    expect(plainIds).toEqual(['status', 'no-code', 'shortcuts'])
    for (const entry of entries.filter(item => plainIds.includes(item.id))) {
      expect(entry.examples.every(example => example.copy === false), entry.id).toBe(true)
    }
  })
})
