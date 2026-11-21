// Chapter 3's practice tasks, computed (ADR 0010: prediction only). Each has a small Vue app whose run shows the answer
// once it is given; the files are read-only. The counters are written by plain DOM code outside Vue, so reading them
// never makes anything run.
import { predictedGoal } from '../../web/checks'
import { VUE_PAGE, shows, vueSite } from '../site'
import type { FrameworksPracticeTask } from '../types'

// --- 3.1: how often does the getter run? (a set of three) -----------------------------------------------------------

const RUNS_APP = `// Three computeds of one ref, each counting its runs (Jonas). The template shows A twice and C once; B is never shown.
import { computed, createApp, ref } from 'vue'

const runs = { a: 0, b: 0, c: 0 }

const App = {
  name: 'Runs',
  setup() {
    const count = ref(1)
    const a = computed(() => { runs.a++; return count.value * 2 })
    const b = computed(() => { runs.b++; return count.value * 3 })
    const c = computed(() => { runs.c++; return count.value * 4 })
    const plusThree = () => { count.value++; count.value++; count.value++ }
    return { a, c, plusThree }
  },
  template: \`
    <button class="action" type="button" id="plus" @click="plusThree">+1, three times</button>
    <p class="row">A: <span class="out">{{ a }}</span> and again <span class="out">{{ a }}</span></p>
    <p class="row">C: <span class="out">{{ c }}</span></p>
  \`
}

createApp(App).mount('#app')

// outside Vue: write how often each getter ran (reading the plain counters tracks nothing)
document.querySelector('#show').addEventListener('click', () => {
  for (const id of ['a', 'b', 'c']) document.querySelector('#runs-' + id).textContent = String(runs[id])
})
`

const RUNS_CSS = ''

const runsOptions = (id: string, values: readonly string[]) => values.map(value => ({ id: value, text: value === '1' ? 'Once' : value === '0' ? 'Never' : `${value} times`, fact: shows(`runs-${id}`, value) }))

export const howOften: FrameworksPracticeTask = {
  id: 'frameworks-practice-how-often',
  track: 'frameworks',
  kind: 'practice',
  practises: 'frameworks-07-plain-setting',
  title: 'How often does the getter run?',
  difficulty: 2,
  minutes: 2,
  task: 'Three computeds of `count = ref(1)` count their runs. The template shows A twice and C once, B never. The page mounts, then the button adds 1 to `count` three times in one go. Say how often each getter ran.',
  prediction: {
    questions: [
      { id: 'a', form: 'one', prompt: 'A, shown twice in the template?', options: runsOptions('a', ['2', '4', '8']), answer: '2', rule: 'A computed is cached: two reads in one render run it once, and three changes before the next render make it dirty once.' },
      { id: 'b', form: 'one', prompt: 'B, never shown?', options: runsOptions('b', ['0', '1', '4']), answer: '0', rule: 'A computed is lazy: nobody read it, so its getter never ran.' },
      { id: 'c', form: 'one', prompt: 'C, shown once?', options: runsOptions('c', ['2', '4', '5']), answer: '2', rule: 'Once at mount, once for the render after the three changes: Vue batches them into one render, and the getter runs when that render reads it.' }
    ]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: [
      { id: 'plus', steps: [{ click: '#plus' }, { click: '#show' }, { count: '#plus' }] },
      ...['a', 'b', 'c'].map(id => ({ id: `runs-${id}`, steps: [{ text: `#runs-${id}` }] }))
    ]
  },
  setup: () => ({ files: withRuns(vueSite('Runs', { 'app.js': RUNS_APP }, RUNS_CSS)), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['A computed runs only when it is read and something it read has changed since. How many times is each one read, and when?'],
  why: 'Computeds are lazy and cached: a getter runs when it is read after a change of what it read, once however often it is read and however many changes came before.',
  solution: [{ predict: '2' }, { predict: '0' }, { predict: '2' }]
}

/** The run counters and their button, outside #app (Vue never renders them). */
function withRuns(files: Record<string, string>): Record<string, string> {
  return {
    ...files,
    'index.html': files['index.html']!.replace('  <main id="app"></main>', [
      '  <main id="app"></main>',
      '  <section class="box" aria-label="Runs">',
      '    <button class="action" type="button" id="show">Show the runs</button>',
      '    <p class="row">A ran <span class="out" id="runs-a">?</span>, B ran <span class="out" id="runs-b">?</span>, C ran <span class="out" id="runs-c">?</span></p>',
      '  </section>'
    ].join('\n'))
  }
}

// --- 3.2: which changes make it run again? (pick lines) --------------------------------------------------------------

const DEPS_APP = `// A price label that reads the member price only for members (Jonas). Each button changes one thing,
// then says whether the label's getter ran again for the next render.
import { computed, createApp, nextTick, ref } from 'vue'

let runs = 0

const App = {
  name: 'Label',
  setup() {
    const member = ref(false)
    const price = ref(2.4)
    const memberPrice = ref(2.2)
    const greeting = ref('Hello')
    const label = computed(() => {
      runs++
      return member.value ? 'Member price ' + memberPrice.value : 'Price ' + price.value
    })
    async function change(id, apply) {
      const before = runs
      apply()
      await nextTick()
      document.querySelector('#' + id).textContent = runs > before ? 'ran' : 'did not run'
    }
    return { label, greeting, change, member, price, memberPrice }
  },
  template: \`
    <p class="row"><strong>{{ greeting }}! {{ label }}</strong></p>
    <p class="row"><button class="action" type="button" id="do-a" @click="change('a', () => { memberPrice = 2.1 })">A: memberPrice = 2.1</button> <span class="out" id="a"></span></p>
    <p class="row"><button class="action" type="button" id="do-b" @click="change('b', () => { price = 2.5 })">B: price = 2.5</button> <span class="out" id="b"></span></p>
    <p class="row"><button class="action" type="button" id="do-c" @click="change('c', () => { greeting = 'Hi' })">C: greeting = 'Hi'</button> <span class="out" id="c"></span></p>
    <p class="row"><button class="action" type="button" id="do-d" @click="change('d', () => { member = true })">D: member = true</button> <span class="out" id="d"></span></p>
  \`
}

createApp(App).mount('#app')
`

export const whichRerun: FrameworksPracticeTask = {
  id: 'frameworks-practice-which-rerun',
  track: 'frameworks',
  kind: 'practice',
  practises: 'frameworks-08-sorting-computed',
  title: 'Which changes make it run again?',
  difficulty: 2,
  minutes: 2,
  task: '`label` is `computed(() => member.value ? \'Member price \' + memberPrice.value : \'Price \' + price.value)`, with `member` false, shown beside `{{ greeting }}`. The changes come in the order A, B, C, D. Pick the ones after which the getter runs again.',
  prediction: {
    questions: [{
      id: 'rerun',
      form: 'lines',
      prompt: 'Which changes make `label`\'s getter run again?',
      options: [
        { id: 'a', text: 'A: `memberPrice.value = 2.1`', fact: shows('a', 'ran') },
        { id: 'b', text: 'B: `price.value = 2.5`', fact: shows('b', 'ran') },
        { id: 'c', text: 'C: `greeting.value = \'Hi\'` (the template renders again)', fact: shows('c', 'ran') },
        { id: 'd', text: 'D: `member.value = true`', fact: shows('d', 'ran') }
      ],
      answer: ['b', 'd'],
      rule: 'A computed depends on what its last run read: `member` and `price` while `member` is false, not `memberPrice`; a render for something else reads its cached value.'
    }]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: [
      { id: 'done', steps: [{ click: '#do-a' }, { click: '#do-b' }, { click: '#do-c' }, { click: '#do-d' }, { count: '#do-a' }] },
      ...['a', 'b', 'c', 'd'].map(id => ({ id, steps: [{ text: `#${id}` }] }))
    ]
  },
  setup: () => ({ files: vueSite('Label', { 'app.js': DEPS_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Pick the ones that make it run', 1)],
  hints: ['Which refs did the getter read the last time it ran, with `member` false?'],
  why: 'Dependencies are what the last run read: a branch not taken tracks nothing, and a render for another reason reads the cached value.',
  solution: [{ predict: ['b', 'd'] }]
}

// --- 3.3: writing to a computed (a set of three) -------------------------------------------------------------------

const WRITE_APP = `// Three computeds, each written to once (Jonas). Each line shows the state behind it afterwards.
import { computed, createApp, reactive, ref } from 'vue'

const App = {
  name: 'Writes',
  setup() {
    const a = ref(1)
    const doubleA = computed(() => a.value * 2)
    const b = ref(1)
    const doubleB = computed({ get: () => b.value * 2, set: value => { b.value = value / 2 } })
    const state = reactive({ count: 1 })
    const whole = computed(() => state)
    const write = () => {
      doubleA.value = 10
      doubleB.value = 10
      whole.value.count = 5
    }
    return { a, b, state, write }
  },
  template: \`
    <button class="action" type="button" id="write" @click="write">Write</button>
    <p class="row">A: a is <span class="out" id="a">{{ a }}</span></p>
    <p class="row">B: b is <span class="out" id="b">{{ b }}</span></p>
    <p class="row">C: state.count is <span class="out" id="c">{{ state.count }}</span></p>
  \`
}

createApp(App).mount('#app')
`

export const writeComputed: FrameworksPracticeTask = {
  id: 'frameworks-practice-write-computed',
  track: 'frameworks',
  kind: 'practice',
  practises: 'frameworks-09-readonly-computed',
  title: 'Writing to a computed',
  difficulty: 2,
  minutes: 2,
  task: 'Three computeds are written to once. For each, say what the state behind it is afterwards.',
  prediction: {
    questions: [
      { id: 'a', form: 'one', prompt: '`doubleA = computed(() => a.value * 2)`, with `a = ref(1)`. `doubleA.value = 10`. What is `a`?', options: [{ id: '1', text: '1', fact: shows('a', '1') }, { id: '5', text: '5', fact: shows('a', '5') }, { id: '10', text: '10', fact: shows('a', '10') }], answer: '1', rule: 'A getter-only computed refuses the write (Vue warns): nothing changes.' },
      { id: 'b', form: 'one', prompt: '`doubleB = computed({ get: () => b.value * 2, set: v => { b.value = v / 2 } })`, with `b = ref(1)`. `doubleB.value = 10`. What is `b`?', options: [{ id: '1', text: '1', fact: shows('b', '1') }, { id: '5', text: '5', fact: shows('b', '5') }, { id: '10', text: '10', fact: shows('b', '10') }], answer: '5', rule: 'A writable computed passes the value to its setter, which decides what to change.' },
      { id: 'c', form: 'one', prompt: '`whole = computed(() => state)`, with `state = reactive({ count: 1 })`. `whole.value.count = 5`. What is `state.count`?', options: [{ id: '1', text: '1', fact: shows('c', '1') }, { id: '5', text: '5', fact: shows('c', '5') }], answer: '5', rule: 'That is no write to the computed: it reads `whole.value` (the reactive state) and writes a property of it, which works.' }
    ]
  },
  sandbox: { page: VUE_PAGE, open: 'app.js', vue: true, probes: [{ id: 'write', steps: [{ click: '#write' }, { count: '#write' }] }, ...['a', 'b', 'c'].map(id => ({ id, steps: [{ text: `#${id}` }] }))] },
  setup: () => ({ files: vueSite('Writes', { 'app.js': WRITE_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['Which line sets a computed\'s `.value`, and which only reads it and changes what it got?'],
  why: 'Only `.value =` writes a computed: refused without a setter, handed to the setter with one; changing an object a computed returns is an ordinary write to that object.',
  solution: [{ predict: '1' }, { predict: '5' }, { predict: '5' }]
}
