// Chapter 5's practice tasks, Scheduling & nextTick (ADR 0010: prediction only). Each has a small Vue app whose run
// shows the answer once it is given; the files are read-only.
import { predictedGoal } from '../../web/checks'
import { VUE_PAGE, shows, vueSite } from '../site'
import type { FrameworksPracticeTask } from '../types'

// --- 5.1: when the DOM changes (order the lines) --------------------------------------------------------------------

const DOM_APP = `// After one change, four reads of the page: when does each one run, and what does it see? (Jonas)
import { createApp, nextTick, ref } from 'vue'

const App = {
  name: 'Count',
  setup() {
    const count = ref(0)
    const shown = () => document.querySelector('#count').textContent
    function change() {
      count.value++
      setTimeout(() => console.log('timeout sees', shown()))
      nextTick(() => console.log('nextTick sees', shown()))
      queueMicrotask(() => console.log('microtask sees', shown()))
      console.log('right after the change sees', shown())
    }
    return { count, change }
  },
  template: '<p class="row"><button class="action" type="button" id="change" @click="change">count++</button> <span class="out" id="count">{{ count }}</span></p>'
}

createApp(App).mount('#app')
`

export const whenDomChanges: FrameworksPracticeTask = {
  id: 'frameworks-practice-when-dom-changes',
  track: 'frameworks',
  kind: 'practice',
  practises: 'frameworks-13-old-dom',
  title: 'When does the DOM change?',
  difficulty: 3,
  minutes: 2,
  task: 'After `count.value++`, the handler schedules a timeout, a `nextTick` and a `queueMicrotask` (in that order), then logs right away. Each one logs what the page shows. Put the four lines in the order they are logged.',
  prediction: {
    questions: [{
      id: 'order',
      form: 'order',
      prompt: 'In what order are the lines logged?',
      options: [
        { id: 'timeout', text: '`timeout sees 1`', fact: { says: 'timeout sees 1' } },
        { id: 'tick', text: '`nextTick sees 1`', fact: { says: 'nextTick sees 1' } },
        { id: 'micro', text: '`microtask sees 1`', fact: { says: 'microtask sees 1' } },
        { id: 'sync', text: '`right after the change sees 0`', fact: { says: 'right after the change sees 0' } }
      ],
      answer: ['sync', 'micro', 'tick', 'timeout'],
      rule: 'The change queues Vue\'s render as a microtask; a microtask queued after it runs after the render (and sees the new DOM), nextTick waits for the render to finish, and a timeout comes after all microtasks.'
    }]
  },
  sandbox: { page: VUE_PAGE, open: 'app.js', vue: true, probes: [{ id: 'change', steps: [{ click: '#change' }, { wait: 50 }, { count: '#change' }] }] },
  setup: () => ({ files: vueSite('Count', { 'app.js': DOM_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Put the lines in order', 1)],
  hints: ['Vue\'s render is a microtask queued by the change itself, before anything the handler queues after it.'],
  why: 'The DOM is old for the rest of the handler; Vue\'s render runs in the first microtask after the change, `nextTick` resolves once it is done, a timeout comes later still.',
  solution: [{ predict: ['sync', 'micro', 'tick', 'timeout'] }]
}

// --- 5.2: how many renders? (a set of three) -------------------------------------------------------------------------

const RENDERS_APP = `// Three ways to change a count three times (Jonas). The Reactivity panel counts the renders.
import { createApp, nextTick, ref } from 'vue'

const counter = (name, change) => ({
  name,
  setup() {
    const count = ref(0)
    return { count, run: () => change(count) }
  },
  template: \`<p class="row"><button class="action" type="button" :id="'run-' + $options.name" @click="run">\${name}</button> <span class="out">{{ count }}</span></p>\`
})

const A = counter('A', count => { count.value++; count.value++; count.value++ })
const B = counter('B', async count => { count.value++; await nextTick(); count.value++; await nextTick(); count.value++ })
const C = counter('C', count => { count.value = 3; count.value = 0; count.value = 0 })

createApp({ name: 'Renders', components: { A, B, C }, template: '<A /><B /><C />' }).mount('#app')
`

const renderOptions = (id: string) => ['0', '1', '3'].map(value => ({ id: value, text: value === '1' ? 'Once' : value === '0' ? 'Not at all' : '3 times', fact: shows(id, Number(value)) }))

export const howManyRenders: FrameworksPracticeTask = {
  id: 'frameworks-practice-how-many-renders',
  track: 'frameworks',
  kind: 'practice',
  practises: 'frameworks-14-batched-history',
  title: 'How many renders?',
  difficulty: 2,
  minutes: 2,
  task: 'Three components each change their `count` three times when tapped. Say how often each one renders after its tap.',
  prediction: {
    questions: [
      { id: 'a', form: 'one', prompt: 'A: `count.value++` three times in a row.', options: renderOptions('a'), answer: '1', rule: 'Changes in one tick are batched: one render.' },
      { id: 'b', form: 'one', prompt: 'B: `count.value++`, `await nextTick()`, three times.', options: renderOptions('b'), answer: '3', rule: '`await nextTick()` lets each render happen: three ticks, three renders.' },
      { id: 'c', form: 'one', prompt: 'C: `count.value = 3`, then `= 0`, then `= 0` again (it was 0).', options: renderOptions('c'), answer: '1', rule: 'The first write queued a render; Vue doesn\'t compare before it renders, so C renders once even though its count ends where it started.' }
    ]
  },
  sandbox: {
    page: VUE_PAGE,
    open: 'app.js',
    vue: true,
    probes: ['a', 'b', 'c'].map(id => ({ id, steps: [{ click: `#run-${id.toUpperCase()}` }, { wait: 30 }, { reactions: `render ${id.toUpperCase()}` }] }))
  },
  setup: () => ({ files: vueSite('Renders', { 'app.js': RENDERS_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['Vue renders once per tick for everything changed in it. Which of the three lets a tick pass between its changes?'],
  why: 'Renders are batched per tick: many changes, one render; only a tick in between (`await nextTick()`) gives each change a render of its own.',
  solution: [{ predict: '1' }, { predict: '3' }, { predict: '1' }]
}

// --- 5.3: pre, post or sync (order the lines) ------------------------------------------------------------------------

const FLUSH_APP = `// Three watchers of one ref, one per flush, and the render (Jonas). One change: in what order do they run?
import { createApp, ref, watch } from 'vue'

const App = {
  name: 'Flush',
  setup() {
    const count = ref(0)
    watch(count, () => console.log('post watcher'), { flush: 'post' })
    watch(count, () => console.log('pre watcher'))
    watch(count, () => console.log('sync watcher'), { flush: 'sync' })
    const shown = () => { console.log('render', count.value); return count.value }
    return { count, shown }
  },
  template: '<p class="row"><button class="action" type="button" id="add" @click="count++">count++</button> <span class="out">{{ shown() }}</span></p>'
}

createApp(App).mount('#app')
`

export const flushOrder: FrameworksPracticeTask = {
  id: 'frameworks-practice-flush-order',
  track: 'frameworks',
  kind: 'practice',
  practises: 'frameworks-15-chart-behind',
  title: 'Pre, post or sync?',
  difficulty: 2,
  minutes: 1,
  task: 'A post, a pre (the default) and a sync watcher of one ref, made in that order, and a render that logs the count. After one `count++` (0 to 1), put the lines in the order they are logged.',
  prediction: {
    questions: [{
      id: 'order',
      form: 'order',
      prompt: 'In what order do they run after the change? (The page\'s first render is over.)',
      options: [
        { id: 'post', text: '`post watcher`', fact: { says: 'post watcher' } },
        { id: 'render', text: '`render 1`', fact: { says: 'render 1' } },
        { id: 'pre', text: '`pre watcher`', fact: { says: 'pre watcher' } },
        { id: 'sync', text: '`sync watcher`', fact: { says: 'sync watcher' } }
      ],
      answer: ['sync', 'pre', 'render', 'post'],
      rule: 'A sync watcher runs inside the write; then, in the flush, pre watchers, the renders and post watchers, whatever order they were made in.'
    }]
  },
  sandbox: { page: VUE_PAGE, open: 'app.js', vue: true, probes: [{ id: 'add', steps: [{ click: '#add' }, { count: '#add' }] }] },
  setup: () => ({ files: vueSite('Flush', { 'app.js': FLUSH_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Put the lines in order', 1)],
  hints: ['`flush` names when a watcher runs relative to the render: before it, after it, or right away.'],
  why: 'Sync runs at the write; the flush then runs pre watchers, renders, post watchers, in that order.',
  solution: [{ predict: ['sync', 'pre', 'render', 'post'] }]
}
