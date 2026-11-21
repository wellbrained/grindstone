// Chapter 6's practice tasks, Shallow, raw & readonly (ADR 0010: prediction only). Each has a small Vue app whose run
// shows the answer once it is given; the files are read-only.
import { predictedGoal } from '../../web/checks'
import { VUE_PAGE, shows, vueSite } from '../site'
import type { FrameworksPracticeTask } from '../types'

const yesNo = (yes: { says: string }, no: { says: string }) => [{ id: 'yes', text: 'Yes', fact: yes }, { id: 'no', text: 'No', fact: no }]

// --- 6.1: shallow or deep? (pick lines) -----------------------------------------------------------------------------

const SHALLOW_APP = `// Five counters, each its own component, each changed another way (Jonas).
import { createApp, shallowReactive, shallowRef, triggerRef } from 'vue'

const counter = (name, setup) => ({
  name,
  setup,
  template: '<p class="row"><button class="action" type="button" :id="\\'tap-\\' + id" @click="tap">{{ label }}</button> <span class="out" :id="id">{{ show() }}</span></p>'
})

const A = counter('A', () => {
  const s = shallowRef({ n: 0 })
  return { id: 'a', label: 'A: s.value.n++', show: () => s.value.n, tap: () => { s.value.n++ } }
})
const B = counter('B', () => {
  const s = shallowRef({ n: 0 })
  return { id: 'b', label: 'B: s.value = { n: 1 }', show: () => s.value.n, tap: () => { s.value = { n: s.value.n + 1 } } }
})
const C = counter('C', () => {
  const s = shallowRef({ n: 0 })
  return { id: 'c', label: 'C: s.value.n++, then triggerRef(s)', show: () => s.value.n, tap: () => { s.value.n++; triggerRef(s) } }
})
const D = counter('D', () => {
  const s = shallowReactive({ inner: { n: 0 } })
  return { id: 'd', label: 'D: s.inner.n++', show: () => s.inner.n, tap: () => { s.inner.n++ } }
})
const E = counter('E', () => {
  const s = shallowReactive({ n: 0 })
  return { id: 'e', label: 'E: s.n++', show: () => s.n, tap: () => { s.n++ } }
})

createApp({ name: 'Shallow', components: { A, B, C, D, E }, template: '<A /><B /><C /><D /><E />' }).mount('#app')
`

export const shallowOrDeep: FrameworksPracticeTask = {
  id: 'frameworks-practice-shallow-or-deep',
  track: 'frameworks',
  kind: 'practice',
  practises: 'frameworks-16-shallow-menu',
  title: 'Shallow or deep?',
  difficulty: 2,
  minutes: 1,
  task: 'Five counters, each its own component, each starting at 0 and changed another way. Pick the ones that show 1 after one tap.',
  prediction: {
    questions: [{
      id: 'shallow',
      form: 'lines',
      prompt: 'Which show 1 after one tap?',
      options: [
        { id: 'a', text: 'A: `shallowRef({ n: 0 })`, then `s.value.n++`', fact: shows('a', '1') },
        { id: 'b', text: 'B: `shallowRef({ n: 0 })`, then `s.value = { n: 1 }`', fact: shows('b', '1') },
        { id: 'c', text: 'C: `shallowRef({ n: 0 })`, then `s.value.n++` and `triggerRef(s)`', fact: shows('c', '1') },
        { id: 'd', text: 'D: `shallowReactive({ inner: { n: 0 } })`, then `s.inner.n++`', fact: shows('d', '1') },
        { id: 'e', text: 'E: `shallowReactive({ n: 0 })`, then `s.n++`', fact: shows('e', '1') }
      ],
      answer: ['b', 'c', 'e'],
      rule: 'Shallow reactivity tracks one level: a shallowRef\'s `.value`, a shallowReactive\'s own properties; deeper changes need a new value or `triggerRef`.'
    }]
  },
  sandbox: { page: VUE_PAGE, open: 'app.js', vue: true, probes: ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, steps: [{ click: `#tap-${id}` }, { text: `#${id}` }] })) },
  setup: () => ({ files: vueSite('Shallow', { 'app.js': SHALLOW_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Pick the ones that show 1', 1)],
  hints: ['How deep does each one look? A shallowRef sees `.value`; a shallowReactive sees its own properties.'],
  why: 'Shallow APIs track the top level only: replace what is there, or trigger by hand after changing something deeper.',
  solution: [{ predict: ['b', 'c', 'e'] }]
}

// --- 6.2: what gets a proxy? (a set of three) -------------------------------------------------------------------------

const PROXY_APP = `// What does reactive() wrap, deep inside? (Jonas, in the Console)
import { isReactive, markRaw, reactive } from 'vue'

const state = reactive({
  lines: [],
  chart: markRaw({ bars: [] }),
  openedAt: new Date()
})
console.log('A:', isReactive(state.lines))
console.log('B:', isReactive(state.chart))
console.log('C:', isReactive(state.openedAt))
`

export const whatGetsProxy: FrameworksPracticeTask = {
  id: 'frameworks-practice-what-gets-proxy',
  track: 'frameworks',
  kind: 'practice',
  practises: 'frameworks-17-private-fields',
  title: 'What gets a proxy?',
  difficulty: 3,
  minutes: 1,
  task: '`state = reactive({ lines: [], chart: markRaw({ bars: [] }), openedAt: new Date() })`. For each property, say whether reading it gives a reactive proxy.',
  prediction: {
    questions: [
      { id: 'a', form: 'one', prompt: '`isReactive(state.lines)`, an array?', options: yesNo({ says: 'A: true' }, { says: 'A: false' }), answer: 'yes', rule: 'reactive() is deep: a plain object or array inside comes out wrapped too.' },
      { id: 'b', form: 'one', prompt: '`isReactive(state.chart)`, marked with `markRaw`?', options: yesNo({ says: 'B: true' }, { says: 'B: false' }), answer: 'no', rule: '`markRaw` marks an object so Vue never makes a proxy of it, wherever it ends up.' },
      { id: 'c', form: 'one', prompt: '`isReactive(state.openedAt)`, a `Date`?', options: yesNo({ says: 'C: true' }, { says: 'C: false' }), answer: 'no', rule: 'Vue proxies objects (also instances of your own classes), arrays, Maps and Sets (and their weak kinds); a Date, other built-ins and frozen objects are left as they are.' }
    ]
  },
  sandbox: { page: VUE_PAGE, open: 'app.js', vue: true, probes: [] },
  setup: () => ({ files: vueSite('Proxies', { 'app.js': PROXY_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['Vue wraps what it knows how to track: objects (your own classes too), arrays, Maps and Sets. What does `markRaw` say?'],
  why: 'Reactive is deep for objects, arrays and collections; markRaw opts an object out, and built-ins Vue can\'t track (a Date, a frozen object) are never wrapped.',
  solution: [{ predict: 'yes' }, { predict: 'no' }, { predict: 'no' }]
}

// --- 6.3: readonly (a set of three) -----------------------------------------------------------------------------------

const READONLY_APP = `// A readonly view of the basket (Jonas): who can change what?
import { reactive, readonly } from 'vue'

const state = reactive({ count: 1, lines: ['croissant'] })
const view = readonly(state)

view.count = 5
console.log('A: state.count is', state.count)

state.count = 2
console.log('B: view.count is', view.count)

view.lines.push('rye')
console.log('C: state.lines has', state.lines.length)
`

export const readonlyView: FrameworksPracticeTask = {
  id: 'frameworks-practice-readonly-view',
  track: 'frameworks',
  kind: 'practice',
  practises: 'frameworks-18-readonly-prop',
  title: 'A readonly view',
  difficulty: 2,
  minutes: 1,
  task: '`view = readonly(state)`, with `state = reactive({ count: 1, lines: [\'croissant\'] })`. Say what each line logs.',
  prediction: {
    questions: [
      { id: 'a', form: 'one', prompt: 'After `view.count = 5`, what is `state.count`?', options: [{ id: '1', text: '1', fact: { says: 'A: state.count is 1' } }, { id: '5', text: '5', fact: { says: 'A: state.count is 5' } }], answer: '1', rule: 'A write through a readonly proxy is refused (Vue warns); the state behind it is untouched.' },
      { id: 'b', form: 'one', prompt: 'After `state.count = 2`, what is `view.count`?', options: [{ id: '1', text: '1', fact: { says: 'B: view.count is 1' } }, { id: '2', text: '2', fact: { says: 'B: view.count is 2' } }], answer: '2', rule: 'readonly is a view, not a copy: it reads the live state.' },
      { id: 'c', form: 'one', prompt: 'After `view.lines.push(\'rye\')`, how many lines has `state`?', options: [{ id: '1', text: '1', fact: { says: 'C: state.lines has 1' } }, { id: '2', text: '2', fact: { says: 'C: state.lines has 2' } }], answer: '1', rule: '`readonly()` is deep: what you read through it is readonly too, so the push is refused. (A component\'s props are only shallowly readonly.)' }
    ]
  },
  sandbox: { page: VUE_PAGE, open: 'app.js', vue: true, probes: [] },
  setup: () => ({ files: vueSite('Readonly', { 'app.js': READONLY_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['readonly() gives a view of the state that can read everything, at any depth, and write nothing.'],
  why: 'readonly() is a deep, live view: it sees every change made to the state and refuses every write made through it.',
  solution: [{ predict: '1' }, { predict: '2' }, { predict: '1' }]
}
