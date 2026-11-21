// Chapter 4's practice tasks, watch & watchEffect (ADR 0010: prediction only). Each has a small Vue app whose run shows
// the answer once it is given; the files are read-only.
import { predictedGoal } from '../../web/checks'
import { VUE_PAGE, vueSite } from '../site'
import type { FrameworksPracticeTask } from '../types'

// --- 4.1: does it fire? (pick lines) ---------------------------------------------------------------------------------

const FIRE_APP = `// Five watchers of the same two values (Jonas). The button adds 1 to state.count and to n.
import { createApp, reactive, ref, watch } from 'vue'

const App = {
  name: 'Sources',
  setup() {
    const state = reactive({ count: 0 })
    const n = ref(0)
    watch(() => state.count, () => console.log('A fired'))
    watch(state.count, () => console.log('B fired'))
    watch(state, () => console.log('C fired'))
    watch(n, () => console.log('D fired'))
    watch(n.value, () => console.log('E fired'))
    const add = () => { state.count++; n.value++ }
    return { add }
  },
  template: '<button class="action" type="button" id="add" @click="add">Add 1 to both</button>'
}

createApp(App).mount('#app')
`

export const doesItFire: FrameworksPracticeTask = {
  id: 'frameworks-practice-does-it-fire',
  track: 'frameworks',
  kind: 'practice',
  practises: 'frameworks-10-watch-source',
  title: 'Does it fire?',
  difficulty: 1,
  minutes: 1,
  task: '`state = reactive({ count: 0 })` and `n = ref(0)`, watched five ways. The button adds 1 to both. Pick the watchers that fire.',
  prediction: {
    questions: [{
      id: 'fire',
      form: 'lines',
      prompt: 'Which watchers fire after one tap?',
      options: [
        { id: 'a', text: 'A: `watch(() => state.count, …)`', fact: { says: 'A fired' } },
        { id: 'b', text: 'B: `watch(state.count, …)`', fact: { says: 'B fired' } },
        { id: 'c', text: 'C: `watch(state, …)`', fact: { says: 'C fired' } },
        { id: 'd', text: 'D: `watch(n, …)`', fact: { says: 'D fired' } },
        { id: 'e', text: 'E: `watch(n.value, …)`', fact: { says: 'E fired' } }
      ],
      answer: ['a', 'c', 'd'],
      rule: 'A getter, a reactive object (deeply) and a ref are sources; `state.count` and `n.value` are numbers read once, which Vue warns about and never watches.'
    }]
  },
  sandbox: { page: VUE_PAGE, open: 'app.js', vue: true, probes: [{ id: 'add', steps: [{ click: '#add' }, { count: '#add' }] }] },
  setup: () => ({ files: vueSite('Sources', { 'app.js': FIRE_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Pick the ones that fire', 1)],
  hints: ['Which of the five hand `watch` something it can follow, and which hand it a number?'],
  why: 'Vue watches what it can follow: a getter it calls, a ref, a reactive object. A value read before the call is a plain number.',
  solution: [{ predict: ['a', 'c', 'd'] }]
}

// --- 4.2: the old value (a set of three) -----------------------------------------------------------------------------

const OLD_APP = `// Three watchers, each logging whether the new and the old value are the same (Jonas). The button changes all three.
import { createApp, reactive, ref, watch } from 'vue'

const App = {
  name: 'Old',
  setup() {
    const count = ref(1)
    const list = reactive([])
    watch(count, (now, before) => console.log('A:', before, '→', now))
    watch(list, (now, before) => console.log('B: same object?', now === before))
    watch(() => [...list], (now, before) => console.log('C:', before.length, '→', now.length))
    const change = () => { count.value = 2; list.push('croissant') }
    return { change }
  },
  template: '<button class="action" type="button" id="change" @click="change">Change</button>'
}

createApp(App).mount('#app')
`

export const oldValue: FrameworksPracticeTask = {
  id: 'frameworks-practice-old-value',
  track: 'frameworks',
  kind: 'practice',
  practises: 'frameworks-11-shallow-watch',
  title: 'What is the old value?',
  difficulty: 2,
  minutes: 2,
  task: 'Three watchers log their new and old values. The button sets `count` from 1 to 2 and pushes into a reactive list. Say what each logs.',
  prediction: {
    questions: [
      { id: 'a', form: 'one', prompt: '`watch(count, (now, before) => …)`, with `count = ref(1)` set to 2. What is logged?', options: [{ id: 'one', text: 'A: 1 → 2', fact: { says: 'A: 1 → 2' } }, { id: 'two', text: 'A: 2 → 2', fact: { says: 'A: 2 → 2' } }], answer: 'one', rule: 'A primitive is a value: the old one is what it was.' },
      { id: 'b', form: 'one', prompt: '`watch(list, (now, before) => now === before)`, with `list = reactive([])` pushed into. What is logged?', options: [{ id: 'true', text: 'B: same object? true', fact: { says: 'B: same object? true' } }, { id: 'false', text: 'B: same object? false', fact: { says: 'B: same object? false' } }], answer: 'true', rule: 'A changed object is still the same object: new and old are one and the same.' },
      { id: 'c', form: 'one', prompt: '`watch(() => [...list], (now, before) => …)`, logging the lengths. What is logged?', options: [{ id: 'zero', text: 'C: 0 → 1', fact: { says: 'C: 0 → 1' } }, { id: 'one', text: 'C: 1 → 1', fact: { says: 'C: 1 → 1' } }], answer: 'zero', rule: 'A getter that returns a copy gives the watcher a new array each time, so the old one is kept as it was.' }
    ]
  },
  sandbox: { page: VUE_PAGE, open: 'app.js', vue: true, probes: [{ id: 'change', steps: [{ click: '#change' }, { count: '#change' }] }] },
  setup: () => ({ files: vueSite('Old', { 'app.js': OLD_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['A watcher keeps a reference to the old value. For an object changed in place, what does that reference point at?'],
  why: 'Old values are references: a changed object is the same object, so copy it (in the getter) when you need what it was.',
  solution: [{ predict: 'one' }, { predict: 'true' }, { predict: 'zero' }]
}

// --- 4.3: what watchEffect tracks (a set of three) ------------------------------------------------------------------

const EFFECT_APP = `// One watchEffect that reads a, then awaits, then reads b; c is read in a timer it sets (Jonas).
import { createApp, nextTick, ref, watchEffect } from 'vue'

const App = {
  name: 'Effect',
  setup() {
    const a = ref(0)
    const b = ref(0)
    const c = ref(0)
    let runs = 0
    watchEffect(async () => {
      runs++
      a.value
      setTimeout(() => c.value)
      await Promise.resolve()
      b.value
    })
    const refs = { a, b, c }
    const change = async (name) => {
      refs[name].value++
      await nextTick()
      console.log('After', name + ':', runs, runs === 1 ? 'run' : 'runs')
    }
    return { change }
  },
  template: \`
    <p class="row">
      <button class="action" type="button" id="change-b" @click="change('b')">b++</button>
      <button class="action" type="button" id="change-c" @click="change('c')">c++</button>
      <button class="action" type="button" id="change-a" @click="change('a')">a++</button>
    </p>
  \`
}

createApp(App).mount('#app')
`

const reran = (name: string) => [
  { id: 'yes', text: 'Yes, it runs again.', fact: { says: `After ${name}: 2 runs` } },
  { id: 'no', text: 'No.', fact: { says: `After ${name}: 1 run` } }
]

export const effectTracks: FrameworksPracticeTask = {
  id: 'frameworks-practice-effect-tracks',
  track: 'frameworks',
  kind: 'practice',
  practises: 'frameworks-12-stale-search',
  title: 'What does watchEffect track?',
  difficulty: 3,
  minutes: 2,
  task: 'A `watchEffect` reads `a`, sets a timer that reads `c`, awaits, then reads `b`. The buttons change `b`, then `c`, then `a`. Say whether each change makes the effect run again.',
  prediction: {
    questions: [
      { id: 'b', form: 'one', prompt: '`b.value++` (read after the `await`)?', options: reran('b'), answer: 'no', rule: 'Only reads during the synchronous part of the run are tracked: after the first `await`, the effect is no longer running.' },
      { id: 'c', form: 'one', prompt: '`c.value++` (read in a timer the effect set)?', options: reran('c'), answer: 'no', rule: 'A timer\'s callback runs later, outside the effect: its reads track nothing.' },
      { id: 'a', form: 'one', prompt: '`a.value++` (read before the `await`)?', options: reran('a'), answer: 'yes', rule: 'A read in the synchronous part is a dependency: changing it runs the effect again.' }
    ]
  },
  sandbox: { page: VUE_PAGE, open: 'app.js', vue: true, probes: [{ id: 'changes', steps: [{ click: '#change-b' }, { click: '#change-c' }, { click: '#change-a' }, { count: '#change-a' }] }] },
  setup: () => ({ files: vueSite('Effect', { 'app.js': EFFECT_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['Vue tracks what an effect reads while it is running. When does it stop running: at the end of the function, or earlier?'],
  why: 'watchEffect tracks only what its synchronous part reads: read every dependency before the first `await` (or use `watch` with explicit sources).',
  solution: [{ predict: 'no' }, { predict: 'no' }, { predict: 'yes' }]
}
