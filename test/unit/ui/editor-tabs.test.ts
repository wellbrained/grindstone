import { describe, expect, it } from 'vitest'
import { decideSync, isDirty, keepMine, markSaved, openTab, reloadFromDisk, syncTabs } from '../../../app/utils/editor-tabs'
import type { EditorTab } from '../../../app/utils/editor-tabs'

const tab = (path: string, base: string | null, draft = base ?? '', changed: EditorTab['changed'] = null): EditorTab => ({ path, base, draft, changed })

describe('openTab and isDirty', () => {
  it('loads the file from disk, clean', () => {
    const opened = openTab('a.txt', { 'a.txt': 'hello' })
    expect(opened).toEqual({ path: 'a.txt', base: 'hello', draft: 'hello', changed: null })
    expect(isDirty(opened)).toBe(false)
  })

  it('opens a file that does not exist yet as an empty, clean tab', () => {
    const opened = openTab('new.txt', {})
    expect(opened).toEqual({ path: 'new.txt', base: null, draft: '', changed: null })
    expect(isDirty(opened)).toBe(false)
    expect(isDirty({ ...opened, draft: 'x' })).toBe(true)
  })
})

describe('decideSync', () => {
  it('keeps a tab whose file did not change', () => {
    expect(decideSync(tab('a', 'one'), { a: 'one' })).toEqual({ type: 'keep' })
    expect(decideSync(tab('a', 'one', 'edited'), { a: 'one' })).toEqual({ type: 'keep' })
  })

  it('reloads a clean tab whose file changed', () => {
    expect(decideSync(tab('a', 'one'), { a: 'two' })).toEqual({ type: 'reload', content: 'two' })
  })

  it('closes a clean tab whose file was deleted', () => {
    expect(decideSync(tab('a', 'one'), {})).toEqual({ type: 'close' })
  })

  it('raises a notice when the file changed under unsaved edits', () => {
    expect(decideSync(tab('a', 'one', 'mine'), { a: 'two' })).toEqual({ type: 'notice', disk: 'two' })
  })

  it('raises a deleted notice when the file was deleted under unsaved edits', () => {
    expect(decideSync(tab('a', 'one', 'mine'), {})).toEqual({ type: 'notice', disk: null })
  })

  it('reloads a clean new-file tab once a command creates the file', () => {
    expect(decideSync(tab('n', null), { n: 'made' })).toEqual({ type: 'reload', content: 'made' })
  })
})

describe('syncTabs', () => {
  it('applies every decision and drops closed tabs', () => {
    const tabs = [tab('same', 's'), tab('clean', 'old'), tab('gone', 'g'), tab('dirty', 'old', 'mine')]
    const next = syncTabs(tabs, { same: 's', clean: 'new', dirty: 'theirs' })
    expect(next).toEqual([
      tab('same', 's'),
      tab('clean', 'new'),
      tab('dirty', 'old', 'mine', { disk: 'theirs' })
    ])
    expect(next[0]).toBe(tabs[0])
  })

  it('drops a notice once the file is back to what the draft was based on (undo)', () => {
    const noticed = tab('a', 'one', 'mine', { disk: 'two' })
    expect(syncTabs([noticed], { a: 'one' })).toEqual([tab('a', 'one', 'mine')])
  })

  it('updates the notice when the file changes again', () => {
    const noticed = tab('a', 'one', 'mine', { disk: 'two' })
    expect(syncTabs([noticed], { a: 'three' })).toEqual([tab('a', 'one', 'mine', { disk: 'three' })])
    expect(syncTabs([noticed], { a: 'two' })[0]).toBe(noticed)
  })
})

describe('notice actions and save', () => {
  it('reload from disk replaces the draft', () => {
    expect(reloadFromDisk(tab('a', 'one', 'mine', { disk: 'two' }), { a: 'two' })).toEqual(tab('a', 'two'))
  })

  it('reload from disk of a deleted file closes the tab', () => {
    expect(reloadFromDisk(tab('a', 'one', 'mine', { disk: null }), {})).toBeNull()
  })

  it('keep mine keeps the draft as an edit of the new disk content', () => {
    const kept = keepMine(tab('a', 'one', 'mine', { disk: 'two' }), { a: 'two' })
    expect(kept).toEqual(tab('a', 'two', 'mine'))
    expect(isDirty(kept)).toBe(true)
    expect(syncTabs([kept], { a: 'two' })).toEqual([kept])
  })

  it('keep mine on a deleted file keeps it as a new file', () => {
    const kept = keepMine(tab('a', 'one', 'mine', { disk: null }), {})
    expect(kept).toEqual(tab('a', null, 'mine'))
    expect(syncTabs([kept], {})).toEqual([kept])
  })

  it('a saved tab is clean and in sync with the saved content', () => {
    const saved = markSaved(tab('a', 'one', 'mine'), 'mine')
    expect(isDirty(saved)).toBe(false)
    expect(syncTabs([saved], { a: 'mine' })).toEqual([saved])
  })
})
