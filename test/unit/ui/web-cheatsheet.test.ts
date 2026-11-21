import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '../../../layers/i18n/i18n/locales/en.json'
import { browserMessages, webCheatGroups, webCheatLevels, webGroupKey, webMessageKey, webNoteKey, webRuleKey, webSummaryKey, webTitleKey } from '../../../app/utils/web-cheatsheet'
import { editedText, levelById, startWebLevel, trackById, webLevels } from '../../../shared/levels'
import type { WebLevel } from '../../../shared/levels'
import { CSP_SOURCE } from '../../../shared/levels/web/csp'
import type { PolicyModel } from '../../../shared/levels/web/csp'
import { expected } from '../levels/web/expected'

/** The text behind a dotted i18n key, or undefined when a part of the path is missing. */
const lookup = (key: string) => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en)

const entries = webCheatGroups.flatMap(group => group.entries)

describe('web fundamentals cheat sheet', () => {
  it('is the track\'s cheat sheet, one group per chapter in chapter order', () => {
    const web = trackById('web')!
    expect(web.cheatSheet).toBe('/web/cheat-sheet')
    expect(webCheatGroups.map(group => group.id)).toEqual(web.chapters.map(chapter => chapter.id))
    for (const chapter of web.chapters) expect(lookup(webGroupKey(chapter.id)), chapter.id).toBe(chapter.title)
  })

  it('has an English text for every group, title, rule, summary, example note and message text', () => {
    const keys = [
      ...webCheatGroups.map(group => webGroupKey(group.id)),
      webGroupKey('messages'),
      ...entries.flatMap(entry => [webTitleKey(entry.id), webRuleKey(entry.id), webSummaryKey(entry.id), ...entry.examples.map((_, i) => webNoteKey(entry.id, i))]),
      ...browserMessages.flatMap(message => [webMessageKey(message.id, 'means'), webMessageKey(message.id, 'look')])
    ]
    expect(keys.filter(key => typeof lookup(key) !== 'string' || lookup(key) === '')).toEqual([])
  })

  it('has no sheet text without a place on the page', () => {
    const sheet = en.webCheat as { groups: Record<string, string>, entries: Record<string, { examples?: Record<string, string> }>, messages: Record<string, unknown> }
    expect(Object.keys(sheet.groups).sort()).toEqual([...webCheatGroups.map(group => group.id), 'messages'].sort())
    expect(Object.keys(sheet.entries).sort()).toEqual(entries.map(entry => entry.id).sort())
    for (const entry of entries) {
      expect(Object.keys(sheet.entries[entry.id]!.examples ?? {}), entry.id).toHaveLength(entry.examples.length)
      expect(Object.keys(sheet.entries[entry.id]!).filter(key => key !== 'examples').sort(), entry.id).toEqual(['rule', 'summary', 'title'])
    }
    // every page text is used: the heading, intro, filter, section chips, none, copy label, practise label, the two disclosure labels
    expect(Object.keys(en.webCheat).filter(key => typeof (en.webCheat as Record<string, unknown>)[key] === 'string').sort())
      .toEqual(['copied', 'copy', 'intro', 'look', 'none', 'practise', 'search', 'sections', 'title', 'why'])
    expect(Object.keys(sheet.messages).sort()).toEqual(browserMessages.map(message => message.id).sort())
  })

  it('gives every card a one-line rule of its own: short, not the title, not the summary', () => {
    for (const entry of entries) {
      const rule = lookup(webRuleKey(entry.id)) as string
      expect(rule.length, entry.id).toBeLessThanOrEqual(95)
      expect(rule.includes('\n'), entry.id).toBe(false)
      expect(rule, entry.id).not.toBe(lookup(webTitleKey(entry.id)))
      expect(rule, entry.id).not.toBe(lookup(webSummaryKey(entry.id)))
    }
  })

  it('keeps the characters vue-i18n reads as syntax (braces, pipes, at signs) out of the texts', () => {
    const strings: string[] = []
    const walk = (node: unknown) => typeof node === 'string' ? strings.push(node) : Object.values(node as object).forEach(walk)
    walk(en.webCheat)
    // {query} and {line} are the page's own placeholders
    expect(strings.filter(text => /[{}|@]/.test(text.replace(/\{(query|line)\}/g, '')))).toEqual([])
  })

  it('has no duplicate ids, example lines or level links', () => {
    expect(new Set(entries.map(entry => entry.id)).size).toBe(entries.length)
    expect(new Set(browserMessages.map(message => message.id)).size).toBe(browserMessages.length)
    expect(new Set(browserMessages.map(message => message.message)).size).toBe(browserMessages.length)
    for (const entry of entries) {
      expect(new Set(entry.examples.map(example => example.line)).size, entry.id).toBe(entry.examples.length)
      expect(new Set(entry.levels).size, entry.id).toBe(entry.levels.length)
    }
    for (const message of browserMessages) expect(new Set(message.levels).size, message.id).toBe(message.levels.length)
  })

  it('links only to Web fundamentals scenarios that exist, in level order, an entry to its own chapter', () => {
    const order = webLevels.map(level => level.id)
    const web = trackById('web')!
    for (const group of webCheatGroups) {
      const chapter = web.chapters.find(each => each.id === group.id)!.levels.map(level => level.id)
      for (const entry of group.entries) for (const levelId of entry.levels) expect(chapter, `${entry.id}: ${levelId}`).toContain(levelId)
    }
    for (const { id, levels } of [...entries, ...browserMessages]) {
      for (const levelId of levels) {
        const level = levelById(levelId)
        expect(level, `${id}: ${levelId}`).toBeDefined()
        expect(level?.track, levelId).toBe('web')
        expect(level?.kind, levelId).toBe('scenario')
      }
      const positions = levels.map(levelId => order.indexOf(levelId))
      expect(positions, id).toEqual([...positions].sort((a, b) => a - b))
      expect(webCheatLevels(levels).map(level => level.id), id).toEqual(levels)
    }
  })

  it('links every scenario of the track from somewhere on the sheet', () => {
    const linked = new Set([...entries, ...browserMessages].flatMap(item => item.levels))
    const scenarios = webLevels.filter(level => level.kind === 'scenario').map(level => level.id)
    expect(scenarios.filter(id => !linked.has(id))).toEqual([])
  })

  it('marks plain rows (origins, directives, keys, statuses) as not copyable, and nothing else', () => {
    const plainIds = entries.filter(entry => entry.examples.some(example => example.copy === false)).map(entry => entry.id)
    expect(plainIds).toEqual(['origin', 'same-site', 'path-domain', 'cache-control', 'cache-rows', 'order', 'keys'])
    for (const entry of entries.filter(item => plainIds.includes(item.id))) {
      expect(entry.examples.every(example => example.copy === false), entry.id).toBe(true)
    }
  })

  describe('against the levels and the models', () => {
    const root = resolve(__dirname, '../../../shared/levels/web')
    const source = (file: string) => readFileSync(resolve(root, file), 'utf8')

    /** Every text a level's tables hold (the Console lines and Network rows of its runs). */
    const tableTexts = (id: string) => {
      const texts: string[] = []
      const walk = (node: unknown) => {
        if (typeof node === 'string') texts.push(node)
        else if (node && typeof node === 'object') Object.values(node).forEach(walk)
      }
      walk(expected[id])
      return texts
    }

    const model = new Function(`return ${CSP_SOURCE}`)()() as PolicyModel
    const cookies = source('cookies.ts')

    it('quotes each message exactly as the level\'s run, the cookie model or the policy model words it', () => {
      const fromModel: Record<string, string> = {
        'framing': model.frame(model.parse('frame-ancestors \'self\' https://market.example', 'enforce', 'header').policies, [], 'https://cornerbakery.shop/', ['https://cheap-flour.example']).lines[0]!.text,
        'x-frame-options': model.frame([], ['DENY'], 'https://cornerbakery.shop/', ['https://cheap-flour.example']).lines[0]!.text
      }
      // the cookie lines are the Network panel's (Chrome DevTools' words, in the cookie model's tables)
      const fromCookies = new Set(['none-insecure', 'lax-blocked', 'not-on-path', 'strict-blocked'])
      for (const message of browserMessages) {
        if (message.id in fromModel) expect(message.message, message.id).toBe(fromModel[message.id])
        else if (fromCookies.has(message.id)) expect(cookies, message.id).toContain(message.message.replace('This attempt to set a cookie via a "Set-Cookie" header was blocked because ', ''))
        else {
          // a Console line every one of its levels' runs shows (or, with no scenario, a practice task's), uncaught or not
          const shows = (id: string) => tableTexts(id).some(text => text === message.message || text === `Uncaught (in promise) ${message.message}`)
          if (message.levels.length) for (const id of message.levels) expect(shows(id), `${message.id} in ${id}`).toBe(true)
          else expect(Object.keys(expected).some(shows), message.id).toBe(true)
        }
      }
    })

    /** A level's files as they start, and as its solution leaves them (what a player has in the editor). */
    const levelFiles = (id: string) => {
      const level = levelById(id) as WebLevel
      const start = startWebLevel(level).state.files
      let files = start
      for (const step of level.solution) if (typeof step === 'object' && 'save' in step) files = { ...files, [step.save]: editedText(files, step) }
      return [...Object.values(start), ...Object.values(files)].join('\n')
    }

    // Lines to copy that are no level's own fix but another way its debrief names (or, for more-headers, a practice
    // task's); each was read against the debrief. Every other line to copy is in a linked level's files as written.
    const ALTERNATIVES: Record<string, string[]> = {
      'allow-origin': ['res.set(\'Access-Control-Allow-Origin\', \'*\')'],
      'credentials': ['fetch(url, { credentials: \'include\' })', 'if ([SHOP].includes(req.get(\'Origin\'))) res.set(\'Access-Control-Allow-Origin\', req.get(\'Origin\'))'],
      'csrf': ['if (req.get(\'Origin\') !== SHOP) return res.sendStatus(403)'],
      'expiry': ['jwt.verify(token, SECRET)'],
      'new-address': ['fetch(url, { cache: \'no-cache\' })'],
      'dispatch': ['event.stopPropagation()'],
      'forced-layout': ['const fragment = document.createDocumentFragment()'],
      'transition': ['getComputedStyle(element).opacity'],
      'yield': ['await new Promise(resolve => requestAnimationFrame(resolve))'],
      'name': ['<span class="visually-hidden">Add ${product.name} to your basket</span>'],
      'expanded': ['<details><summary>Allergens</summary>'],
      'live': ['role="status"', 'aria-describedby="email-error"'],
      'focus': ['dialog.showModal()'],
      'framing': ['res.set(\'X-Frame-Options\', \'DENY\')'],
      'more-headers': ['res.set(\'X-Content-Type-Options\', \'nosniff\')', 'res.set(\'Referrer-Policy\', \'strict-origin-when-cross-origin\')']
    }

    it('copies the levels\' own lines: each is in a linked level\'s files, or a named alternative', () => {
      for (const entry of entries) {
        const text = entry.levels.map(levelFiles).join('\n')
        const allowed = ALTERNATIVES[entry.id] ?? []
        for (const example of entry.examples.filter(each => each.copy !== false)) {
          if (allowed.includes(example.line)) expect(text, `${entry.id}: an alternative that is a level's line after all`).not.toContain(example.line)
          else expect(text, `${entry.id}: ${example.line}`).toContain(example.line)
        }
      }
      for (const [id, lines] of Object.entries(ALTERNATIVES)) {
        const entry = entries.find(each => each.id === id)
        expect(entry, id).toBeDefined()
        for (const each of lines) expect(entry!.examples.map(example => example.line), id).toContain(each)
      }
    })
  })
})
