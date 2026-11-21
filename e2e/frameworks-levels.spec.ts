import { expect, test } from '@playwright/test'
import { editedText, frameworksLevels, playWebSolution, reload, startWebLevel } from '../shared/levels'
import type { FrameworksLevel, PredictionAnswer, PredictionFact, Probe } from '../shared/levels'
import { otherFixes } from '../test/unit/levels/frameworks/fixes'
import { runCheck } from './helpers/sandbox'
import type { CheckResult } from './helpers/sandbox'

// Every Framework deep dives level with real Vue in a real browser (ADR 0010): its starting files run without an
// uncaught error and do what each prediction's right option says (its fact holds: a probe's value, a Console line, a
// reaction) while every wrong option's fact does not; every goal but the prediction fails on them; the solution (the
// answers, the edits, a reload) solves it; other real fixes pass and tempting non-fixes do not
// (test/unit/levels/frameworks/fixes.ts); and the files a solution changes, emptied or deleted, never solve. No dev
// server needed: the apps run in a blank page.

const run = (page: Parameters<typeof runCheck>[0], level: FrameworksLevel, files: Readonly<Record<string, string>>, probes: readonly Probe[] = level.sandbox.probes) =>
  runCheck(page, files, probes, undefined, { vue: true })

function solvedFiles(level: FrameworksLevel): Record<string, string> {
  let files = level.setup().files
  for (const step of level.solution) if (typeof step === 'object' && 'save' in step) files = { ...files, [step.save]: editedText(files, step) }
  return files
}

const answers = (level: FrameworksLevel): PredictionAnswer[] => level.solution.flatMap(step => typeof step === 'object' && 'predict' in step ? [step.predict] : [])

function holds(fact: PredictionFact, result: CheckResult): boolean {
  if ('probe' in fact) return result.observation.probes[fact.probe] === fact.is
  if ('reaction' in fact) {
    const count = result.reactions.filter(each => each.label === fact.reaction || each.label.split(' ')[0] === fact.reaction).length
    return fact.times === 0 ? count === 0 : count >= (fact.times ?? 1)
  }
  if ('says' in fact) return result.entries.some(entry => entry.text.startsWith(fact.says))
  throw new Error(`a fact this track doesn't use: ${JSON.stringify(fact)}`)
}

const placeOf = (fact: PredictionFact, result: CheckResult) => 'says' in fact ? result.entries.findIndex(entry => entry.text.startsWith(fact.says)) : -1

for (const level of frameworksLevels) {
  test(`${level.id}: does what its prediction says, and its solution works`, async ({ page }) => {
    await page.setContent('<!doctype html><title>check</title>')
    const start = await run(page, level, startWebLevel(level).state.files)
    expect(start.observation.finished).toBe(true)
    // a level's bug may be an uncaught error (5.1); a practice task's app never throws
    if (level.kind === 'practice') expect(start.observation.errors.map(error => error.text)).toEqual([])
    for (const question of level.prediction.questions) {
      if (question.form === 'order') {
        const order = question.answer.map(id => placeOf(question.options.find(option => option.id === id)!.fact!, start))
        expect(order.every(index => index >= 0) && order.every((index, i) => i === 0 || index > order[i - 1]!), `${question.id}: ${order}`).toBe(true)
        continue
      }
      const right: readonly string[] = question.form === 'one' ? [question.answer] : question.answer
      for (const option of question.options) if (option.fact) expect(holds(option.fact, start), `${question.id} ${option.id}: ${JSON.stringify(start.observation.probes)}`).toBe(right.includes(option.id))
    }
    if (level.kind === 'practice') return

    // every goal but the prediction fails on the starting files, even with the prediction answered
    const predicted = { ...startWebLevel(level).state, predicted: answers(level) }
    const failed = reload({ ...startWebLevel(level), state: predicted }, level, start.observation)
    expect(level.goals.filter(goal => goal.id !== 'predicted').some(goal => failed.session.goalsMet[goal.id])).toBe(false)

    const solved = await run(page, level, solvedFiles(level))
    expect(solved.observation.errors.map(error => error.text)).toEqual([])
    const results = await playWebSolution(level, files => run(page, level, files).then(result => result.observation))
    expect(results.at(-1)!.session.solved, JSON.stringify(solved.observation.probes)).toBe(true)

    // throwing away a file the solution changes (emptied or deleted) is no fix
    const changed = new Set(level.solution.flatMap(step => typeof step === 'object' && 'save' in step ? [step.save] : []))
    for (const path of changed) {
      for (const files of [{ ...startWebLevel(level).state.files, [path]: '' }, Object.fromEntries(Object.entries(startWebLevel(level).state.files).filter(([each]) => each !== path))]) {
        const observation = (await run(page, level, files)).observation
        const session = reload({ ...startWebLevel(level), state: { ...startWebLevel(level).state, files, predicted: answers(level) } }, level, observation).session
        expect(session.solved, `${level.id} without ${path}`).toBe(false)
      }
    }
  })

  for (const fix of otherFixes[level.id] ?? []) {
    test(`${level.id}: ${fix.solves ? 'also solved by' : 'not solved by'} ${fix.name}`, async ({ page }) => {
      await page.setContent('<!doctype html><title>check</title>')
      let files = startWebLevel(level).state.files
      for (const edit of fix.edits) files = { ...files, [edit.save]: editedText(files, edit) }
      const result = await run(page, level, files)
      const session = reload({ ...startWebLevel(level), state: { ...startWebLevel(level).state, files, predicted: answers(level) } }, level, result.observation).session
      expect(session.solved, JSON.stringify(result.observation.probes)).toBe(fix.solves)
    })
  }
}

test('the facade reports what Vue did and changes nothing Vue does', async ({ page }) => {
  await page.setContent('<!doctype html><title>check</title>')
  const app = (from: string) => ({
    'index.html': '<!doctype html><html><body><div id="app"></div><script type="module" src="./app.js"></script></body></html>',
    'app.js': [
      `import { computed, createApp, nextTick, ref, watch, watchEffect, watchPostEffect, watchSyncEffect, onWatcherCleanup } from '${from}'`,
      'const count = ref(0)',
      'const seen = []',
      'const double = computed(() => count.value * 2, { onTrigger: () => seen.push(\'computed\') })',
      'watch(count, (now, before) => console.log(\'watch\', before, now), { onTrigger: () => seen.push(\'watch\') })',
      'watchEffect(() => console.log(\'effect\', count.value))',
      'watchPostEffect(() => console.log(\'post\', document.querySelector(\'#out\')?.textContent ?? null))',
      'watchSyncEffect(() => console.log(\'sync\', count.value))',
      'watch(count, () => onWatcherCleanup(() => console.log(\'cleanup\')))',
      'watch(count, () => console.log(\'immediate\', count.value), { immediate: true, once: true })',
      'const writable = computed({ get: () => count.value, set: value => { count.value = value } })',
      'createApp({ name: \'Root\', setup: () => ({ count, double, add: () => { writable.value = count.value + 1; console.log(\'added\'); nextTick(() => console.log(\'tick\', seen.join())) } }), template: \'<button id="add" @click="add">+</button><p id="out">{{ count }} {{ double }}</p>\' }).mount(\'#app\')'
    ].join('\n')
  })
  const probes: Probe[] = [{ id: 'out', steps: [{ click: '#add' }, { text: '#out' }] }, { id: 'renders', steps: [{ click: '#add' }, { reactions: 'render Root' }] }, { id: 'watches', steps: [{ click: '#add' }, { reactions: 'watch' }] }]
  const facade = await runCheck(page, app('vue'), probes, undefined, { vue: true })
  const direct = await runCheck(page, app('vue.esm-browser.js'), probes, undefined, { vue: true })
  expect(facade.observation.errors).toEqual([])
  // the same lines in the same order, through the facade and straight from Vue
  expect(facade.entries.map(entry => entry.text)).toEqual(direct.entries.map(entry => entry.text))
  expect(facade.entries.map(entry => entry.text)).toContain('tick watch,computed')
  expect(facade.observation.probes).toEqual({ out: '1 2', renders: 1, watches: 2 })
  expect(direct.observation.probes).toEqual({ out: '1 2', renders: 0, watches: 0 })
  // what the panel gets: renders with their component, each reaction with what triggered it
  expect(facade.reactions.slice(0, 2)).toEqual([{ label: 'effect', why: ['first run'] }, { label: 'effect', why: ['first run'] }])
  expect(facade.reactions).toContainEqual({ label: 'render Root', why: ['mount'] })
  expect(facade.reactions).toContainEqual({ label: 'watch', why: ['set .value: 0 → 1'] })
  expect(facade.reactions).toContainEqual({ label: 'render Root', why: ['set .value: 0 → 1', 'a computed it reads changed'] })
  // the development notice is gone
  expect(facade.entries.some(entry => entry.text.includes('development build'))).toBe(false)
})

test('the app can\'t reach the facade\'s channel, and Vue\'s frames never show in a stack', async ({ page }) => {
  await page.setContent('<!doctype html><title>check</title>')
  const files = {
    'index.html': '<!doctype html><html><body><div id="app"></div><script type="module" src="./app.js"></script></body></html>',
    // a module the app imports before vue runs after the facade all the same: the channel is gone by then
    'first.js': 'console.log(\'first\', Object.getOwnPropertyNames(window).filter(name => name.startsWith(\'__gs\')).length)\n',
    'app.js': [
      'import \'./first.js\'',
      'import { createApp } from \'vue\'',
      'console.log(\'hooks\', Object.getOwnPropertyNames(window).filter(name => name.startsWith(\'__gs\')).length)',
      'createApp({ name: \'Boom\', setup() { return { boom: () => { throw new Error(\'broken\') } } }, template: \'<button id="b" @click="boom">b</button>\' }).mount(\'#app\')'
    ].join('\n')
  }
  const result = await runCheck(page, files, [{ id: 'click', steps: [{ click: '#b' }, { count: '#b' }] }], undefined, { vue: true })
  expect(result.entries.map(entry => entry.text)).toContain('hooks 0')
  expect(result.entries.map(entry => entry.text)).toContain('first 0')
  const error = result.entries.find(entry => entry.level === 'error' && entry.text.includes('broken'))!
  // and no line moved: the error names the line it was thrown on
  expect(error.source).toEqual({ path: 'app.js', line: 4 })
  expect(error.frames.map(frame => frame.path)).toEqual(['app.js'])
})
