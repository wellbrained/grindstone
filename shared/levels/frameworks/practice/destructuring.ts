// Chapter 2's practice tasks, Lost reactivity (ADR 0010: prediction only). Each has a small Vue app whose run shows the
// answer once it is given; the files are read-only.
import { predictedGoal } from '../../web/checks'
import { VUE_PAGE, shows, vueSite } from '../site'
import type { FrameworksPracticeTask } from '../types'

const liveOrNot = (id: string) => [
  { id: 'live', text: 'Yes: it shows 1.', fact: shows(id, '1') },
  { id: 'stale', text: 'No: it still shows 0.', fact: shows(id, '0') }
]

// --- 2.1: which stay live? (pick lines) -----------------------------------------------------------------------------

const LIVE_APP = `// One reactive count, taken out five ways (Jonas). The button adds 1 to state.count.
import { computed, createApp, reactive, toRef, toRefs } from 'vue'

const App = {
  name: 'Taken',
  setup() {
    const state = reactive({ count: 0 })
    const { count: a } = state
    const { count: b } = toRefs(state)
    const c = toRef(state, 'count')
    const d = computed(() => state.count)
    const e = { ...state }
    return { state, a, b, c, d, e }
  },
  template: \`
    <button class="action" type="button" id="add" @click="state.count++">state.count++</button>
    <p class="row">A: <span class="out" id="a">{{ a }}</span></p>
    <p class="row">B: <span class="out" id="b">{{ b }}</span></p>
    <p class="row">C: <span class="out" id="c">{{ c }}</span></p>
    <p class="row">D: <span class="out" id="d">{{ d }}</span></p>
    <p class="row">E: <span class="out" id="e">{{ e.count }}</span></p>
  \`
}

createApp(App).mount('#app')
`

export const whichStayLive: FrameworksPracticeTask = {
  id: 'frameworks-practice-which-stay-live',
  track: 'frameworks',
  kind: 'practice',
  practises: 'frameworks-04-destructured-props',
  title: 'Which stay live?',
  difficulty: 1,
  minutes: 1,
  task: '`state = reactive({ count: 0 })`, and setup takes `count` out of it five ways. The button runs `state.count++`. Pick the ones that show 1 afterwards.',
  prediction: {
    questions: [{
      id: 'live',
      form: 'lines',
      prompt: 'After one `state.count++`, which show 1?',
      options: [
        { id: 'a', text: 'A: `const { count: a } = state`', fact: shows('a', '1') },
        { id: 'b', text: 'B: `const { count: b } = toRefs(state)`', fact: shows('b', '1') },
        { id: 'c', text: 'C: `const c = toRef(state, \'count\')`', fact: shows('c', '1') },
        { id: 'd', text: 'D: `const d = computed(() => state.count)`', fact: shows('d', '1') },
        { id: 'e', text: 'E: `const e = { ...state }`, shown as `e.count`', fact: shows('e', '1') }
      ],
      answer: ['b', 'c', 'd'],
      rule: 'Destructuring and spreading copy values once; `toRefs`, `toRef` and a computed keep tracking the property.'
    }]
  },
  sandbox: { page: VUE_PAGE, open: 'app.js', vue: true, probes: [{ id: 'click', steps: [{ click: '#add' }, { count: '#add' }] }, ...['a', 'b', 'c', 'd', 'e'].map(id => ({ id, steps: [{ text: `#${id}` }] }))] },
  setup: () => ({ files: vueSite('Taken', { 'app.js': LIVE_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Pick the ones that show 1', 1)],
  hints: ['Which of them read `state.count` through the proxy again later, and which read it once, in setup?'],
  why: 'A copy taken in setup (destructured or spread) never changes; a ref from toRefs or toRef, or a computed, keeps tracking the reactive property.',
  solution: [{ predict: ['b', 'c', 'd'] }]
}

// --- 2.2: what setup returns (a set of three) -----------------------------------------------------------------------

const RETURN_APP = `// Three components, each returning the same reactive state another way (Jonas). Each button runs state.count++.
import { createApp, reactive, toRefs } from 'vue'

const shown = (name, give) => ({
  name,
  setup() {
    const state = reactive({ count: 0 })
    return { ...give(state), add: () => { state.count++ } }
  },
  template: \`<p class="row"><button class="action" type="button" :id="'add-' + $options.name" @click="add">\${name}: count++</button> <span class="out" :id="$options.name">{{ count }}</span></p>\`
})

const A = shown('a', state => ({ count: state.count }))
const B = shown('b', state => toRefs(state))
const C = shown('c', state => state)

createApp({ name: 'Returns', components: { A, B, C }, template: '<A /><B /><C />' }).mount('#app')
`

export const whatSetupReturns: FrameworksPracticeTask = {
  id: 'frameworks-practice-what-setup-returns',
  track: 'frameworks',
  kind: 'practice',
  practises: 'frameworks-05-frozen-badge',
  title: 'What setup returns',
  difficulty: 2,
  minutes: 2,
  task: 'Three components keep `state = reactive({ count: 0 })` and spread something of it into what setup returns. Each button runs `state.count++`. Say whether each shows 1 afterwards.',
  prediction: {
    questions: [
      { id: 'a', form: 'one', prompt: 'A returns `{ ...{ count: state.count } }`.', options: liveOrNot('a'), answer: 'stale', rule: '`state.count` is read once when setup returns: the template gets the number 0.' },
      { id: 'b', form: 'one', prompt: 'B returns `{ ...toRefs(state) }`.', options: liveOrNot('b'), answer: 'live', rule: 'Spreading `toRefs(state)` spreads refs; each still reads and writes `state.count`.' },
      { id: 'c', form: 'one', prompt: 'C returns `{ ...state }`.', options: liveOrNot('c'), answer: 'stale', rule: 'Spreading a reactive object copies its values into a plain object: the proxy is left behind.' }
    ]
  },
  sandbox: { page: VUE_PAGE, open: 'app.js', vue: true, probes: ['a', 'b', 'c'].map(id => ({ id, steps: [{ click: `#add-${id}` }, { text: `#${id}` }] })) },
  setup: () => ({ files: vueSite('Returns', { 'app.js': RETURN_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['A spread reads every property once. What does each spread hand the template: numbers, or refs?'],
  why: 'Spreading reads values once, so only spreading refs (toRefs) keeps the template linked to the reactive object.',
  solution: [{ predict: 'stale' }, { predict: 'live' }, { predict: 'stale' }]
}

// --- 2.3: what a composable gets (a set of three) -------------------------------------------------------------------

const COMPOSABLE_APP = `// useDouble(x): a computed of twice x, where x may be a number, a ref or a getter (Jonas). The button adds 1 to count.
import { computed, createApp, ref, toValue } from 'vue'

function useDouble(x) {
  return computed(() => toValue(x) * 2)
}

const App = {
  name: 'Composable',
  setup() {
    const count = ref(1)
    return { count, a: useDouble(count.value), b: useDouble(count), c: useDouble(() => count.value) }
  },
  template: \`
    <button class="action" type="button" id="add" @click="count++">count++</button>
    <p class="row">A: <span class="out" id="a">{{ a }}</span></p>
    <p class="row">B: <span class="out" id="b">{{ b }}</span></p>
    <p class="row">C: <span class="out" id="c">{{ c }}</span></p>
  \`
}

createApp(App).mount('#app')
`

const doubled = (id: string) => [
  { id: 'four', text: '4', fact: shows(id, '4') },
  { id: 'two', text: '2', fact: shows(id, '2') }
]

export const whatComposableGets: FrameworksPracticeTask = {
  id: 'frameworks-practice-what-composable-gets',
  track: 'frameworks',
  kind: 'practice',
  practises: 'frameworks-06-passed-value',
  title: 'What the composable gets',
  difficulty: 1,
  minutes: 1,
  task: '`useDouble(x)` returns `computed(() => toValue(x) * 2)`. `count = ref(1)`, and the button makes it 2. For each call, say what it shows afterwards.',
  prediction: {
    questions: [
      { id: 'a', form: 'one', prompt: '`useDouble(count.value)`?', options: doubled('a'), answer: 'two', rule: '`count.value` hands over the number 1; it stays 1.' },
      { id: 'b', form: 'one', prompt: '`useDouble(count)`?', options: doubled('b'), answer: 'four', rule: 'The ref goes in; `toValue` reads its `.value` inside the computed, so it is tracked.' },
      { id: 'c', form: 'one', prompt: '`useDouble(() => count.value)`?', options: doubled('c'), answer: 'four', rule: 'A getter is called inside the computed: the read happens there, and is tracked.' }
    ]
  },
  sandbox: { page: VUE_PAGE, open: 'app.js', vue: true, probes: [{ id: 'click', steps: [{ click: '#add' }, { count: '#add' }] }, ...['a', 'b', 'c'].map(id => ({ id, steps: [{ text: `#${id}` }] }))] },
  setup: () => ({ files: vueSite('Composable', { 'app.js': COMPOSABLE_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['Where does each call read `count`: right there in setup, or later inside the computed?'],
  why: 'A composable can only track what it reads itself: give it the ref or a getter, never the `.value` read in setup.',
  solution: [{ predict: 'two' }, { predict: 'four' }, { predict: 'four' }]
}
