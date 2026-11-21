// Chapter 1's practice tasks, ref & reactive (ADR 0010: prediction only, one question or a set of three). Each has a
// small Vue app whose run shows the answer once it is given; the files are read-only.
import { predictedGoal } from '../../web/checks'
import { VUE_PAGE, shows, vueSite } from '../site'
import type { FrameworksPracticeTask } from '../types'

const yesNo = (fact: { yes?: ReturnType<typeof shows>, no?: ReturnType<typeof shows> }) => [
  { id: 'yes', text: 'Yes', ...(fact.yes ? { fact: fact.yes } : {}) },
  { id: 'no', text: 'No', ...(fact.no ? { fact: fact.no } : {}) }
]

// --- 1.1: which changes reach the screen? (pick lines) --------------------------------------------------------------

const UPDATES_APP = `// Four counters, each its own component, each changed another way (Jonas tries them out).
import { createApp, reactive, ref } from 'vue'

const counter = (name, setup) => ({
  name,
  setup,
  template: '<p class="row"><button class="action" type="button" :id="\\'tap-\\' + id" @click="tap">{{ label }}</button> <span class="out" :id="id">{{ show() }}</span></p>'
})

const A = counter('A', () => {
  const state = reactive({ n: 0 })
  return { id: 'a', label: 'A: state.n++', show: () => state.n, tap: () => { state.n++ } }
})
const B = counter('B', () => {
  const raw = { n: 0 }
  const state = reactive(raw)
  return { id: 'b', label: 'B: raw.n++', show: () => state.n, tap: () => { raw.n++ } }
})
const C = counter('C', () => {
  const count = ref(0)
  return { id: 'c', label: 'C: count.value++', show: () => count.value, tap: () => { count.value++ } }
})
const D = counter('D', () => {
  const state = reactive({ items: [] })
  return { id: 'd', label: 'D: state.items.push(1)', show: () => state.items.length, tap: () => { state.items.push(1) } }
})

createApp({ name: 'Counters', components: { A, B, C, D }, template: '<A /><B /><C /><D />' }).mount('#app')
`

export const whichUpdate: FrameworksPracticeTask = {
  id: 'frameworks-practice-which-update',
  track: 'frameworks',
  kind: 'practice',
  practises: 'frameworks-01-raw-basket',
  title: 'Which changes reach the screen?',
  difficulty: 1,
  minutes: 1,
  task: 'Four counters, each its own component, each starting at 0 and changed another way when you tap it. Pick the ones that show 1 after one tap.',
  prediction: {
    questions: [{
      id: 'updates',
      form: 'lines',
      prompt: 'Each counter is tapped once. Which ones show 1?',
      options: [
        { id: 'a', text: '`state.n++`, with `state = reactive({ n: 0 })`', fact: shows('a', '1') },
        { id: 'b', text: '`raw.n++`, with `state = reactive(raw)` on screen', fact: shows('b', '1') },
        { id: 'c', text: '`count.value++`, with `count = ref(0)`', fact: shows('c', '1') },
        { id: 'd', text: '`state.items.push(1)`, with the items\' count on screen', fact: shows('d', '1') }
      ],
      answer: ['a', 'c', 'd'],
      rule: 'Writes through a reactive proxy (also deep inside it, and array methods) or to a ref\'s `.value` trigger a render; a write to the original object behind the proxy doesn\'t.'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: ['a', 'b', 'c', 'd'].map(id => ({ id, steps: [{ click: `#tap-${id}` }, { text: `#${id}` }] }))
  },
  setup: () => ({ files: vueSite('Counters', { 'app.js': UPDATES_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Pick the ones that show 1', 1)],
  hints: ['Which writes go through something Vue made (a proxy, a ref\'s `.value`), and which go around it?'],
  why: 'Vue hears about a write only when it goes through a reactive proxy (at any depth, array methods included) or a ref\'s `.value`; the raw object changes silently.',
  solution: [{ predict: ['a', 'c', 'd'] }]
}

// --- 1.2: where refs are unwrapped (a set of three) -----------------------------------------------------------------

const UNWRAP_APP = `// Three places a ref can sit (Jonas): what does the template make of \`+ 1\`?
import { createApp, reactive, ref } from 'vue'

const App = {
  name: 'Unwrap',
  setup() {
    const totals = { count: ref(2) }
    const state = reactive({ count: ref(2) })
    const list = reactive([ref(2)])
    return { totals, state, list }
  },
  template: \`
    <p class="row">A: <span class="out" id="a">{{ totals.count + 1 }}</span></p>
    <p class="row">B: <span class="out" id="b">{{ state.count + 1 }}</span></p>
    <p class="row">C: <span class="out" id="c">{{ list[0] + 1 }}</span></p>
  \`
}

createApp(App).mount('#app')
`

const unwrapOptions = (id: string) => [
  { id: 'three', text: '3', fact: shows(id, '3') },
  { id: 'object', text: '[object Object]1', fact: shows(id, '[object Object]1') },
  { id: 'nan', text: 'NaN', fact: shows(id, 'NaN') }
]

export const whereUnwrapped: FrameworksPracticeTask = {
  id: 'frameworks-practice-where-unwrapped',
  track: 'frameworks',
  kind: 'practice',
  practises: 'frameworks-02-replaced-basket',
  title: 'Where are refs unwrapped?',
  difficulty: 2,
  minutes: 2,
  task: 'setup returns `ref(2)` in three places. For each, say what `{{ … + 1 }}` shows.',
  prediction: {
    questions: [
      { id: 'a', form: 'one', prompt: '`const totals = { count: ref(2) }`, a plain object, returned from setup. `{{ totals.count + 1 }}`?', options: unwrapOptions('a'), answer: 'object', rule: 'The template unwraps only the refs setup returns at its top level; a ref inside a plain object stays a ref, and a ref plus 1 is text.' },
      { id: 'b', form: 'one', prompt: '`const state = reactive({ count: ref(2) })`. `{{ state.count + 1 }}`?', options: unwrapOptions('b'), answer: 'three', rule: 'A reactive object unwraps a ref you read from one of its properties.' },
      { id: 'c', form: 'one', prompt: '`const list = reactive([ref(2)])`. `{{ list[0] + 1 }}`?', options: unwrapOptions('c'), answer: 'object', rule: 'A reactive array (or Map) never unwraps the refs in it: `list[0]` is the ref itself.' }
    ]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: ['a', 'b', 'c'].map(id => ({ id, steps: [{ text: `#${id}` }] }))
  },
  setup: () => ({ files: vueSite('Unwrap', { 'app.js': UNWRAP_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['Vue unwraps a ref in three places only: at the top of what setup returns, in a reactive object\'s property, and where the template prints a value on its own (`{{ totals.count }}` shows 2).'],
  why: 'Refs are unwrapped at the top level of setup\'s return and in a reactive object\'s properties, never in a plain object or inside a reactive array; there `+ 1` meets the ref object itself.',
  solution: [{ predict: 'object' }, { predict: 'three' }, { predict: 'object' }]
}

// --- 1.3: the same object or not? (a set of three) ------------------------------------------------------------------

const SAME_APP = `// Jonas checks what a reactive object is the same as, in the Console.
import { reactive } from 'vue'

const raw = { name: 'Rye loaf' }
console.log('A:', reactive(raw) === raw)
console.log('B:', reactive(raw) === reactive(raw))

const list = [{ name: 'Butter croissant' }, raw]
console.log('C:', reactive(list).includes(raw))
`

export const sameObject: FrameworksPracticeTask = {
  id: 'frameworks-practice-same-object',
  track: 'frameworks',
  kind: 'practice',
  practises: 'frameworks-03-special-proxy',
  title: 'The same object or not?',
  difficulty: 2,
  minutes: 1,
  task: 'Jonas compares reactive objects with the ones they wrap. For each line, say whether the Console prints true.',
  prediction: {
    questions: [
      { id: 'a', form: 'one', prompt: '`reactive(raw) === raw`?', options: yesNo({ yes: { says: 'A: true' }, no: { says: 'A: false' } }), answer: 'no', rule: '`reactive()` returns a proxy, a new value that only stands in for `raw`.' },
      { id: 'b', form: 'one', prompt: '`reactive(raw) === reactive(raw)`?', options: yesNo({ yes: { says: 'B: true' }, no: { says: 'B: false' } }), answer: 'yes', rule: 'Vue keeps one proxy per object: asking twice gives the same proxy.' },
      { id: 'c', form: 'one', prompt: '`reactive(list).includes(raw)`, where `raw` is in `list`?', options: yesNo({ yes: { says: 'C: true' }, no: { says: 'C: false' } }), answer: 'yes', rule: 'A reactive array\'s `includes`, `indexOf` and `lastIndexOf` look for the plain value too, so they find `raw`; `===` doesn\'t.' }
    ]
  },
  sandbox: { page: VUE_PAGE, open: 'app.js', vue: true, probes: [] },
  setup: () => ({ files: vueSite('Same', { 'app.js': SAME_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['A proxy is a value of its own, but Vue caches the one it makes for each object, and its array methods know about raw values.'],
  why: 'A proxy is never its original, Vue hands out one proxy per object, and a reactive array\'s search methods compare raw values too.',
  solution: [{ predict: 'no' }, { predict: 'yes' }, { predict: 'yes' }]
}
