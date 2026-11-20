// The event loop's practice tasks (ADR 0009: prediction only, one question or a set of three, about 30 s each). Each has
// a small app whose run shows the answer once it is given (the Event loop panel's frames, forced layouts and transitions,
// the Console's lines); the files are read-only, nothing to fix. A practice task follows its scenario in the chapter's
// list (index.ts).
import { predictedGoal } from '../checks'
import { SPINNER_STYLE, TABLET, TOAST_STYLE, loopSite, loopSpec } from '../eventloop'
import { SHOP_PAGE } from '../site'
import type { PickOneQuestion, WebPracticeTask } from '../types'

// --- 5.1: when does it paint? (a set of three) -------------------------------------------------------------------------

const PAINT_APP = `// Three buttons: each shows "Working…", then starts 200 ms of work in another way (Jonas).
import { busy } from './tablet.js'

function run(id, start) {
  const status = document.querySelector(\`#\${id}\`)
  status.textContent = 'Working…'
  start(() => {
    busy(200)
    status.textContent = 'Done'
  })
}

document.querySelector('#run-a').addEventListener('click', () => run('a', work => setTimeout(work, 0)))
document.querySelector('#run-b').addEventListener('click', () => run('b', work => requestAnimationFrame(work)))
document.querySelector('#run-c').addEventListener('click', () => run('c', work => requestAnimationFrame(() => setTimeout(work, 0))))
`

const job = (id: string, label: string) => `  <p class="job"><button class="action" id="run-${id}" type="button">${label}</button> <span id="${id}" class="status" role="status"></span></p>`

const PAINT_MAIN = [
  '<section class="box" aria-labelledby="jobs-heading">',
  '  <h2 id="jobs-heading">Three ways to start the work</h2>',
  job('a', 'A: setTimeout'),
  job('b', 'B: requestAnimationFrame'),
  job('c', 'C: a frame, then setTimeout'),
  '</section>'
]

const YES = 'Yes: a frame shows Working… before the work starts.'
const NO = 'No: the work (usually) starts before a frame is painted, and the first frame shows Done.'

function paintQuestion(id: 'a' | 'b' | 'c', how: string, painted: boolean, rule: string): PickOneQuestion {
  return {
    id,
    form: 'one',
    prompt: `Button ${id.toUpperCase()} shows "Working…", then starts the work with ${how}. Does a frame show "Working…"?`,
    options: [
      { id: 'yes', text: YES, fact: { painted: `${id}: Working…` } },
      // a frame shows Done either way: only a "no" that is right has it as its fact
      { id: 'no', text: NO, ...(painted ? {} : { fact: { painted: `${id}: Done` } }) }
    ],
    answer: painted ? 'yes' : 'no',
    rule
  }
}

export const whenPaint: WebPracticeTask = {
  id: 'web-practice-when-paint',
  track: 'web',
  kind: 'practice',
  practises: 'web-21-spinner',
  title: 'When does it paint?',
  difficulty: 1,
  minutes: 1,
  task: 'Each button shows "Working…" and starts 200 ms of work in another way. For each, say whether a frame ever shows "Working…".',
  prediction: {
    questions: [
      paintQuestion('a', '`setTimeout(work, 0)`', false, 'A 0 ms timer is a task that doesn\'t wait for a frame: it usually runs before the next one (they come every 16 ms), so the frame shows Done.'),
      paintQuestion('b', '`requestAnimationFrame(work)`', false, 'A frame\'s callbacks run before that frame is painted: the work is done by the time it paints.'),
      paintQuestion('c', '`requestAnimationFrame(() => setTimeout(work, 0))`', true, 'The callback runs at the next frame, the timer only after that frame is painted, with Working… on it.')
    ]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: loopSpec([{ selector: '#a', name: 'a', text: true }, { selector: '#b', name: 'b', text: true }, { selector: '#c', name: 'c', text: true }], [{ click: '#run-a' }, { click: '#run-b' }, { click: '#run-c' }]),
    probes: []
  },
  setup: () => ({ files: loopSite({ title: 'Work', main: PAINT_MAIN }, SPINNER_STYLE, { 'app.js': PAINT_APP, 'tablet.js': TABLET }), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['The browser paints between tasks, at most once a frame. Which of the three starts the work in a task that comes after a painted frame?'],
  why: 'Only a task that comes after a painted frame lets the frame show what was set before it: requestAnimationFrame then a timer does; a timer alone or a frame callback alone runs the work first.',
  solution: [{ predict: 'no' }, { predict: 'no' }, { predict: 'yes' }]
}

// --- 5.2: a tap's listeners ----------------------------------------------------------------------------------------------

const TAP_APP = `// The Order button has two listeners, and each queues a promise callback (Jonas wants to know the order).
const order = document.querySelector('#order')

order.addEventListener('click', () => {
  Promise.resolve().then(() => console.log('Microtask from listener 1'))
  console.log('Listener 1')
})

order.addEventListener('click', () => {
  Promise.resolve().then(() => console.log('Microtask from listener 2'))
  console.log('Listener 2')
})
`

export const tapOrder: WebPracticeTask = {
  id: 'web-practice-tap-order',
  track: 'web',
  kind: 'practice',
  practises: 'web-22-pickup-menu',
  title: 'A tap\'s listeners',
  difficulty: 2,
  minutes: 0.5,
  task: 'The Order button has two listeners; each logs a line and queues a promise callback that logs another. Lena taps Order. Put the four Console lines in order.',
  prediction: {
    questions: [{
      id: 'order',
      form: 'order',
      prompt: 'Lena taps Order. Put these Console lines in the order they appear.',
      options: [
        { id: 'l2', text: '`Listener 2`', fact: { says: 'Listener 2' } },
        { id: 'm1', text: '`Microtask from listener 1`', fact: { says: 'Microtask from listener 1' } },
        { id: 'l1', text: '`Listener 1`', fact: { says: 'Listener 1' } },
        { id: 'm2', text: '`Microtask from listener 2`', fact: { says: 'Microtask from listener 2' } }
      ],
      answer: ['l1', 'm1', 'l2', 'm2'],
      rule: 'After each listener of a real tap the browser runs the microtasks; `order.click()` from code would run both listeners first, then both callbacks.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: loopSpec([], [{ click: '#order' }]),
    probes: []
  },
  setup: () => ({ files: loopSite({ title: 'Order', main: ['<section class="box" aria-labelledby="order-heading">', '  <h2 id="order-heading">Your order</h2>', '  <button class="action" id="order" type="button">Order</button>', '</section>'] }, '', { 'app.js': TAP_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Put the four lines in order', 1)],
  hints: ['The browser calls each listener of a tap itself, with nothing of the page\'s on the stack. What does it do right after a callback like that?'],
  why: 'A user\'s event runs the microtask checkpoint after each listener (the stack is empty then); a click dispatched from code keeps that code on the stack until every listener has run.',
  solution: [{ predict: ['l1', 'm1', 'l2', 'm2'] }]
}

// --- 5.3: which reads force a layout? -----------------------------------------------------------------------------------

const READS_APP = `// Jonas measures the menu card: six reads, each right after he made the card a little wider.
const card = document.querySelector('#card')
let width = 60
function widen() {
  width += 1
  card.style.width = \`\${width}%\`
}

document.querySelector('#measure').addEventListener('click', () => {
  widen()
  console.log(\`offsetHeight read: \${card.offsetHeight > 0}\`)
  widen()
  console.log(\`dataset.price read: \${card.dataset.price}\`)
  widen()
  console.log(\`getBoundingClientRect read: \${card.getBoundingClientRect().height > 0}\`)
  widen()
  console.log(\`textContent read: \${card.textContent.trim().length > 0}\`)
  widen()
  console.log(\`getComputedStyle(card).height read: \${getComputedStyle(card).height !== ''}\`)
  widen()
  console.log(\`className read: \${card.className}\`)
})
`

const READS_MAIN = [
  '<section class="box" aria-labelledby="card-heading">',
  '  <h2 id="card-heading">Menu card</h2>',
  '  <p id="card" class="card" data-price="2.40">Butter croissant · flaky, all butter, baked at 5:00</p>',
  '  <button class="action" id="measure" type="button">Measure</button>',
  '</section>'
]

export const whichReads: WebPracticeTask = {
  id: 'web-practice-which-reads',
  track: 'web',
  kind: 'practice',
  practises: 'web-23-kitchen-screen',
  title: 'Which reads force a layout?',
  difficulty: 2,
  minutes: 1,
  task: 'Jonas makes the card wider, reads something, makes it wider, reads the next thing, six times. Which reads make the browser lay out the page there and then?',
  prediction: {
    questions: [{
      id: 'reads',
      form: 'lines',
      prompt: 'Right after `card.style.width` changed, which of these reads force a layout?',
      options: [
        { id: 'offset', text: '`card.offsetHeight`', fact: { forced: 'offsetHeight' } },
        { id: 'dataset', text: '`card.dataset.price`', fact: { forced: 'dataset' } },
        { id: 'rect', text: '`card.getBoundingClientRect()`', fact: { forced: 'getBoundingClientRect' } },
        { id: 'text', text: '`card.textContent`', fact: { forced: 'textContent' } },
        { id: 'computed', text: '`getComputedStyle(card).height`', fact: { forced: 'getComputedStyle' } },
        { id: 'class', text: '`card.className`', fact: { forced: 'className' } }
      ],
      answer: ['offset', 'rect', 'computed'],
      rule: 'Sizes and positions (offset…, client…, scroll…, getBoundingClientRect(), a computed size) need an up-to-date layout; attributes, data and text don\'t.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: loopSpec([], [{ click: '#measure' }]),
    probes: []
  },
  setup: () => ({ files: loopSite({ title: 'Menu card', main: READS_MAIN }, '\n.card {\n  width: 60%;\n  padding: 8px;\n  border: 1px solid #eadfd0;\n}\n', { 'app.js': READS_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Pick the reads that force a layout', 1)],
  hints: ['A wider card wraps its text differently. Which of these answers depends on where the text wraps, and which only on what is written in the page?'],
  why: 'What depends on the layout (a size, a position) makes the browser lay out the page first when it changed; what is written in the page (attributes, data, text) it can answer at once.',
  solution: [{ predict: ['offset', 'rect', 'computed'] }]
}

// --- 5.4: does it fade? (a set of three) --------------------------------------------------------------------------------

const FADE_APP = `// Three toasts: each is added with opacity 0, then gets \`visible\` (opacity 1, a 300 ms transition) in another way (Jonas).
const area = document.querySelector('#toasts')

function toast(id, show) {
  const element = document.createElement('p')
  element.className = 'toast'
  element.id = id
  element.textContent = \`Toast \${id.toUpperCase()}\`
  area.append(element)
  show(element)
}

document.querySelector('#show').addEventListener('click', () => {
  toast('a', (element) => {
    void element.offsetWidth
    element.classList.add('visible')
  })
  toast('b', element => requestAnimationFrame(() => element.classList.add('visible')))
  toast('c', element => requestAnimationFrame(() => requestAnimationFrame(() => element.classList.add('visible'))))
})
`

function fadeQuestion(id: 'a' | 'b' | 'c', how: string, fades: boolean, rule: string): PickOneQuestion {
  const fade = { animated: `p#${id}.toast.visible opacity` }
  return {
    id,
    form: 'one',
    prompt: `Toast ${id.toUpperCase()} is added, then ${how}. Does it fade in?`,
    options: [
      { id: 'yes', text: 'Yes: it fades in over 300 ms.', fact: fade },
      { id: 'no', text: 'No: it appears at once.', ...(fades ? {} : { fact: { painted: id } }) }
    ],
    answer: fades ? 'yes' : 'no',
    rule
  }
}

export const doesItFade: WebPracticeTask = {
  id: 'web-practice-does-it-fade',
  track: 'web',
  kind: 'practice',
  practises: 'web-24-toast',
  title: 'Does it fade?',
  difficulty: 2,
  minutes: 1,
  task: 'One tap adds three toasts, each with opacity 0, and gives each the class `visible` (opacity 1, with a transition) in another way. For each, say whether it fades in.',
  prediction: {
    questions: [
      fadeQuestion('a', 'reads `element.offsetWidth` and adds `visible`', true, 'Reading a size forces the browser to work out the style now, at opacity 0; the class added after that is a change it transitions.'),
      fadeQuestion('b', 'adds `visible` in a `requestAnimationFrame` callback', false, 'A frame\'s callbacks run before it works out styles: the toast\'s first style already has `visible`.'),
      fadeQuestion('c', 'adds `visible` in a callback of a `requestAnimationFrame` inside another', true, 'The first frame works out the style at opacity 0; the class added at the second is a change it transitions.')
    ]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: loopSpec([{ selector: '#a', name: 'a' }, { selector: '#b', name: 'b' }, { selector: '#c', name: 'c' }], [{ click: '#show' }]),
    probes: []
  },
  setup: () => ({ files: loopSite({ title: 'Toasts', main: ['<section class="box" aria-labelledby="toast-heading">', '  <h2 id="toast-heading">Three toasts</h2>', '  <button class="action" id="show" type="button">Show the toasts</button>', '</section>', '<div id="toasts" class="toasts" aria-live="polite"></div>'] }, TOAST_STYLE, { 'app.js': FADE_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['A transition needs a style the browser worked out before the change. When does each toast first get its style worked out: before `visible`, or with it?'],
  why: 'A transition starts only from a style the browser computed: force one (a size read) or let a frame pass (two requestAnimationFrame) before the change; one callback is still before the first style.',
  solution: [{ predict: 'yes' }, { predict: 'no' }, { predict: 'yes' }]
}

// --- 5.5: which line comes first? (a set of three) ----------------------------------------------------------------------

const FIRST_APP = `// Which line comes first? Three of Jonas's experiments, logged to the Console.

// 1. When the page loads
console.log('Script start')
setTimeout(() => console.log('Timeout'), 0)
Promise.resolve().then(() => console.log('Promise'))
queueMicrotask(() => console.log('Microtask'))
console.log('Script end')

// 2. A timer that sets itself again, 100 times
document.querySelector('#ticks').addEventListener('click', () => {
  const started = performance.now()
  let ticks = 0
  function tick() {
    ticks += 1
    if (ticks < 100) setTimeout(tick, 0)
    else console.log(\`100 ticks took about \${Math.round((performance.now() - started) / 100) * 100} ms\`)
  }
  setTimeout(tick, 0)
})

// 3. await in an async function
async function bake() {
  console.log('Bake starts')
  await null
  console.log('Bake goes on')
}

document.querySelector('#bake').addEventListener('click', () => {
  bake()
  Promise.resolve().then(() => console.log('Then'))
  console.log('After bake()')
})
`

const line = (id: string, text: string) => ({ id, text: `\`${text}\``, fact: { says: text } })

export const firstLine: WebPracticeTask = {
  id: 'web-practice-first-line',
  track: 'web',
  kind: 'practice',
  practises: 'web-25-progress-bar',
  title: 'Which line comes first?',
  difficulty: 2,
  minutes: 1.5,
  task: 'Three of Jonas\'s experiments log to the Console: what runs when the page loads, a timer that sets itself 100 times, and an `await`. Answer all three.',
  prediction: {
    questions: [
      {
        id: 'load',
        form: 'order',
        prompt: 'When the page loads (experiment 1 in `app.js`): put the five lines in order.',
        options: [line('timeout', 'Timeout'), line('promise', 'Promise'), line('end', 'Script end'), line('start', 'Script start'), line('microtask', 'Microtask')],
        answer: ['start', 'end', 'promise', 'microtask', 'timeout'],
        rule: 'The script runs to its end, then every microtask in the order queued, and only then the next task (the timer).'
      },
      {
        id: 'ticks',
        form: 'one',
        prompt: 'Experiment 2: `tick` sets `setTimeout(tick, 0)` again until it has run 100 times. About how long do the 100 ticks take?',
        options: [
          { id: 'none', text: 'About 0 ms: a 0 ms timer waits for nothing.', fact: { says: '100 ticks took about 0 ms' } },
          { id: 'clamped', text: 'About 400 ms: once timers nest more than five deep, each waits at least 4 ms (the standard\'s clamp, as Chrome has it).', fact: { says: '100 ticks took about 400 ms' } },
          { id: 'frames', text: 'About 1600 ms: each timer waits for the next frame.', fact: { says: '100 ticks took about 1600 ms' } }
        ],
        answer: 'clamped',
        rule: 'A timer set from a timer nested more than five deep waits at least 4 ms (the HTML standard\'s clamp, against pages that spin on 0 ms timers).'
      },
      {
        id: 'await',
        form: 'order',
        prompt: 'Experiment 3: Lena taps Bake. Put the four lines in order.',
        options: [line('then', 'Then'), line('goes-on', 'Bake goes on'), line('after', 'After bake()'), line('starts', 'Bake starts')],
        answer: ['starts', 'after', 'goes-on', 'then'],
        rule: 'An async function runs until its first `await` and returns; the rest goes on as a microtask, queued before the `then` that comes after the call.'
      }
    ]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: loopSpec([], [{ click: '#bake' }, { click: '#ticks' }]),
    probes: []
  },
  setup: () => ({ files: loopSite({ title: 'Experiments', main: ['<section class="box" aria-labelledby="first-heading">', '  <h2 id="first-heading">Which line comes first?</h2>', '  <button class="action" id="ticks" type="button">100 ticks</button>', '  <button class="action" id="bake" type="button">Bake</button>', '</section>'] }, '', { 'app.js': FIRST_APP }), observed: null, picked: null }),
  goals: [predictedGoal('Answer all three', 3)],
  hints: ['After the code that runs now: every microtask (promise callbacks, queueMicrotask, what follows an await), then the next task (a timer). Nested timers wait at least 4 ms.'],
  why: 'Synchronous code, then all microtasks, then one task; a 0 ms timer nested deep enough waits 4 ms.',
  solution: [{ predict: ['start', 'end', 'promise', 'microtask', 'timeout'] }, { predict: 'clamped' }, { predict: ['starts', 'after', 'goes-on', 'then'] }]
}
