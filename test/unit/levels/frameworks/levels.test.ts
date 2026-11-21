import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'acorn'
import { describe, expect, it } from 'vitest'
import { editedText, frameworksLevels, frameworksTrack, isAnswerTo, isWebLevel, levelById, sandboxDocument, trackById } from '../../../../shared/levels'
import type { FrameworksLevel } from '../../../../shared/levels'
import { readBridgeMessage } from '../../../../shared/levels/debugging/messages'
import { VUE_MODULE, VUE_NOTICE, prepareVue, reactionHook, vueFacade } from '../../../../shared/levels/frameworks/vue'
import { otherFixes } from './fixes'

// Framework deep dives (ADR 0010): the registry, every level's shape (its prediction, hints, debrief and solution), the
// fixes table's edits, Vue's build as the frame gets it, the facade and the reaction message. What the apps do with
// real Vue is e2e/frameworks-levels.spec.ts.

const vueBuild = () => readFileSync(fileURLToPath(new URL('../../../../node_modules/vue/dist/vue.esm-browser.js', import.meta.url)), 'utf8')

describe('the Framework deep dives track', () => {
  it('is live with six chapters, each its own colour, played with a prediction first', () => {
    const track = trackById('frameworks')!
    expect(track).toBe(frameworksTrack)
    expect(track).toMatchObject({ status: 'live', tagline: 'Predict what the framework does, then fix it.', bestRun: ['wrongPredictions', 'hints', 'reloads'] })
    expect(track.chapters.map(chapter => [chapter.id, chapter.colour])).toEqual([['refs', 0], ['destructuring', 1], ['computed', 2], ['watchers', 3], ['scheduling', 4], ['depth', 5]])
    expect(frameworksLevels.length).toBeGreaterThan(0)
    for (const level of frameworksLevels) {
      expect(isWebLevel(level), level.id).toBe(true)
      expect(level.sandbox.vue, level.id).toBe(true)
      expect(level.id.startsWith('frameworks-'), level.id).toBe(true)
      expect(levelById(level.id)).toBe(level)
    }
  })

  it('gives every chapter that has levels three scenarios, each followed by its practice task', () => {
    for (const chapter of frameworksTrack.chapters.filter(each => each.levels.length)) {
      expect(chapter.levels.map(level => level.kind), chapter.id).toEqual(['scenario', 'practice', 'scenario', 'practice', 'scenario', 'practice'])
    }
  })
})

describe.each(frameworksLevels.map(level => [level.id, level] as [string, FrameworksLevel]))('%s', (_id, level) => {
  it('asks questions it can answer, and its solution answers each of them first', () => {
    const questions = level.prediction.questions
    expect(questions.length).toBe(level.kind === 'scenario' ? 1 : questions.length)
    expect([1, 3]).toContain(questions.length)
    const answers = level.solution.filter(step => typeof step === 'object' && 'predict' in step)
    expect(answers).toHaveLength(questions.length)
    level.solution.slice(0, questions.length).forEach((step, index) => {
      expect(typeof step === 'object' && 'predict' in step, `step ${index}`).toBe(true)
    })
    for (const question of questions) {
      expect(isAnswerTo(question, question.answer), question.id).toBe(true)
      expect(question.rule).not.toBe('')
      expect(new Set(question.options.map(option => option.id)).size).toBe(question.options.length)
      // the e2e checks each option's fact against the run: every right one has a fact to check
      const right: readonly string[] = question.form === 'one' ? [question.answer] : question.answer
      for (const id of right) expect(question.options.find(option => option.id === id)?.fact, `${question.id} ${id}`).toBeDefined()
    }
    level.prediction.questions.forEach((question, index) => {
      const step = level.solution[index] as { predict: unknown }
      expect(step.predict).toEqual(question.answer)
    })
  })

  it('has its texts: a scenario three hints, a debrief and a fix that ends in a reload; a practice task one hint and a why', () => {
    if (level.kind === 'scenario') {
      expect(level.hints).toHaveLength(3)
      expect(level.debrief.paragraphs.length).toBeGreaterThanOrEqual(2)
      expect(level.solution.at(-1)).toBe('reload')
      expect(level.goals.map(goal => goal.id)[0]).toBe('predicted')
      expect(level.goals.length).toBeGreaterThan(1)
    } else {
      expect(level.hints).toHaveLength(1)
      expect(level.why).not.toBe('')
      expect(level.goals.map(goal => goal.id)).toEqual(['predicted'])
    }
    for (const text of [level.title, ...level.hints, ...(level.kind === 'scenario' ? [level.story, level.debrief.title, ...level.debrief.paragraphs] : [level.task, level.why])]) {
      // no raw HTML in the texts the page shows (markup is quoted as code, in backticks)
      expect(text.replace(/`[^`]*`/g, '')).not.toMatch(/<\/?[a-z][^>]*>/i)
    }
  })

  it('names the right line in its last hint, and its edits apply to its files', () => {
    let files = level.setup().files
    expect(files['index.html']).toContain('<script type="module" src="./app.js"></script>')
    expect(files[level.sandbox.open]).toBeDefined()
    let first = true
    for (const step of level.solution) {
      if (typeof step !== 'object' || !('save' in step)) continue
      const before = files[step.save]!
      if ('replace' in step && step.replace) {
        expect(before.split(step.replace[0]).length - 1, `${step.save}: ${step.replace[0]}`).toBe(1)
        // the last hint's first "line N" is where the solution's first edit starts
        const hint = level.hints.at(-1)!.match(/line (\d+)/)
        if (hint && first) expect(before.slice(0, before.indexOf(step.replace[0])).split('\n').length, level.hints.at(-1)).toBe(Number(hint[1]))
        first = false
      }
      files = { ...files, [step.save]: editedText(files, step) }
    }
    for (const fix of otherFixes[level.id] ?? []) {
      let fixed = level.setup().files
      for (const edit of fix.edits) {
        expect(fixed[edit.save]!.split(edit.replace[0]).length - 1, `${fix.name}: ${edit.replace[0]}`).toBe(1)
        fixed = { ...fixed, [edit.save]: editedText(fixed, edit) }
      }
    }
  })

  it('has app modules that parse as modules', () => {
    for (const [path, source] of Object.entries(level.setup().files)) {
      if (path.endsWith('.js')) expect(() => parse(source, { ecmaVersion: 'latest', sourceType: 'module' }), path).not.toThrow()
    }
  })
})

describe('Vue in the frame', () => {
  it('takes the development notice out of the real build, and says so when it moved', () => {
    const source = vueBuild()
    expect(source).toContain(VUE_NOTICE)
    const prepared = prepareVue(source)
    expect(prepared).not.toContain('You are running a development build')
    expect(prepared.length).toBe(source.length - VUE_NOTICE.length)
    expect(() => prepareVue('export const ref = 1')).toThrow(/moved/)
  })

  it('gives the frame Vue and the facade as libraries, never as level files, with a fresh channel name per load', () => {
    const facade = vueFacade('__gsReactionsTest')
    expect(() => parse(facade, { ecmaVersion: 'latest', sourceType: 'module' })).not.toThrow()
    expect(facade).toContain(`export * from '${VUE_MODULE}'`)
    expect(facade).toContain('delete window["__gsReactionsTest"]')
    expect(reactionHook()).toMatch(/^__gsReactions[0-9a-z]+$/)
    expect(reactionHook()).not.toBe(reactionHook())
    const files = frameworksLevels[0]!.setup().files
    const document = sandboxDocument(files, { token: 't', vue: 'export const ref = 1' })
    const config = JSON.parse(document.html.match(/\((\{"token".*\})\);<\/script>/)![1]!.replace(/\\u003c/g, '<'))
    expect(Object.keys(config.modules)).not.toContain('vue')
    expect(Object.keys(config.libraries)).toEqual([VUE_MODULE, 'vue'])
    expect(config.vue.hook).toMatch(/^__gsReactions/)
    expect(config.libraries.vue).toContain(config.vue.hook)
    // other tracks' frames get no Vue
    const plain = JSON.parse(sandboxDocument(files, { token: 't' }).html.match(/\((\{"token".*\})\);<\/script>/)![1]!.replace(/\\u003c/g, '<'))
    expect(plain.libraries).toBeNull()
    expect(plain.vue).toBeNull()
  })

  it('reads a reaction message field by field', () => {
    expect(readBridgeMessage({ type: 'reaction', kind: 'render', name: 'Basket', why: ['mount'], stack: '' })).toEqual({ type: 'reaction', kind: 'render', name: 'Basket', why: ['mount'], stack: '' })
    expect(readBridgeMessage({ type: 'reaction', kind: 'watch', name: '', why: ['x'.repeat(500), ...Array(20).fill('y')], stack: 'at app.js' })).toMatchObject({ kind: 'watch', why: ['x'.repeat(120), 'y', 'y', 'y', 'y', 'y', 'y', 'y'] })
    expect(readBridgeMessage({ type: 'reaction', kind: 'mount', name: '', why: [], stack: '' })).toBeNull()
    expect(readBridgeMessage({ type: 'reaction', kind: 'render', name: 1, why: [], stack: '' })).toBeNull()
    expect(readBridgeMessage({ type: 'reaction', kind: 'render', name: '', why: [1], stack: '' })).toBeNull()
    expect(readBridgeMessage({ type: 'reaction', kind: 'render', name: '', why: 'mount', stack: '' })).toBeNull()
  })
})
