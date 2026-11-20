// The event loop 5.5: the progress bar jumps. Maya's morning import (600 orders in chunks of 50, about 8 ms each) shows a
// progress bar; between chunks Jonas's loop does `await Promise.resolve()` "to let the page breathe". Every chunk then
// runs in the same task's microtask checkpoint, and the browser renders only after it: the bar jumps from empty to done.
// Learn: microtasks run before rendering, all of them, even ones queued by microtasks; to let a frame in, wait for a task
// (setTimeout, a message) or a frame (requestAnimationFrame).
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from './checks'
import { TABLET, loopSite, loopSpec } from './eventloop'
import { SHOP_PAGE } from './site'
import type { WebScenario } from './types'

/** The break between chunks: a microtask (the fix waits for a task, or a frame). */
export const BREATHE = '    await Promise.resolve()\n'

const APP = `// The morning import on the kitchen tablet (Jonas): 600 orders in chunks of 50, with a progress bar.
// Between chunks the loop awaits, to let the page breathe.
import { busy } from './tablet.js'

const bar = document.querySelector('#bar')
const label = document.querySelector('#progress')

/** Checks and saves the next 50 orders: about 8 ms on the tablet. */
function importChunk(done) {
  busy(8)
  return done + 50
}

document.querySelector('#import').addEventListener('click', async () => {
  let done = 0
  while (done < 600) {
    done = importChunk(done)
    bar.value = done
    label.textContent = \`Importing… \${done} of 600\`
${BREATHE}  }
  label.textContent = 'Imported 600 orders'
  console.log('Import done')
})
`

const MAIN = [
  '<section class="box" aria-labelledby="import-heading">',
  '  <h2 id="import-heading">Kitchen · morning import</h2>',
  '  <p class="note">Today\'s 600 orders, from the shop\'s API.</p>',
  '  <button class="action" id="import" type="button">Import</button>',
  '  <progress id="bar" class="bar" max="600" value="0" aria-labelledby="progress"></progress>',
  '  <p id="progress" class="note" role="status">Not imported yet</p>',
  '</section>'
]

const BAR_STYLE = `
.bar {
  display: block;
  width: 100%;
  height: 10px;
  margin-top: 10px;
}
`

export const progressBar: WebScenario = {
  id: 'web-25-progress-bar',
  track: 'web',
  kind: 'scenario',
  title: 'The progress bar jumps',
  difficulty: 3,
  minutes: 7,
  teaches: 'microtasks',
  story: [
    'Every morning Maya imports the day\'s 600 orders on the kitchen tablet. Jonas split the import into chunks of 50 (about 8 ms each) and updates a progress bar after each, and between chunks the loop does `await Promise.resolve()`, “to let the page breathe”. The bar sits empty, then jumps to done.',
    'Predict what the bar does. Then fix `app.js` so Maya sees the import progress (at least four steps on screen before it is done). Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'bar',
      form: 'one',
      prompt: 'Maya taps Import. Each chunk takes about 8 ms; after each one the loop updates the bar and does `await Promise.resolve()`. What does the bar do?',
      options: [
        { id: 'steps', text: 'It moves in steps: a frame every 16 ms or so, about every second chunk.', fact: { painted: 'progress: Importing' } },
        { id: 'jumps', text: 'It jumps from empty to done: each `await` waits only for a microtask, and the browser runs every microtask, even new ones, before it renders.', fact: { painted: 'progress: Imported 600 orders' } },
        { id: 'stuck', text: 'It stays empty: the import never ends, the loop keeps waiting for itself.' },
        { id: 'half', text: 'It shows one step halfway, then done.' }
      ],
      answer: 'jumps',
      rule: 'Microtasks run before the browser renders, all of them, also the ones they queue; awaiting a resolved promise never lets a frame in, waiting for a task or a frame does.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: loopSpec([{ selector: '#progress', name: 'progress', text: true }], [{ click: '#import' }]),
    probes: [
      // the bar moves while the import runs: its first step on screen right after the tap, at least four rising steps in
      // the import's time (a bar walked up after the work, or one step shown a few times, is no progress), and no frame
      // missing for more than two frames from the tap until it is done (a burst of microtasks in between shows)
      { id: 'steps', steps: [{ click: '#import' }, { wait: 500 }, { painted: 'progress: Importing', within: 120, rising: true }] },
      { id: 'first', steps: [{ painted: 'progress: Importing', within: 40 }] },
      { id: 'gaps', steps: [{ longestGap: 'progress: Imported' }] },
      { id: 'done', steps: [{ text: '#progress' }] }
    ]
  },
  setup: () => ({
    files: loopSite({ title: 'Import', main: MAIN }, BAR_STYLE, { 'app.js': APP, 'tablet.js': TABLET }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what the bar does', 1),
    probesGoal('steps', 'Maya sees the import progress as it runs (a step on screen at once, at least four, the screen never still for long), and it finishes', { steps: { atLeast: 4 }, first: { atLeast: 1 }, gaps: { atMost: 32 }, done: 'Imported 600 orders' }, { clean: true })
  ],
  hints: [
    'Open the Event loop panel at Maya\'s tap: how many frames come while the import runs, and what does each paint? Which kind is each line logged in it?',
    'An `await` of a resolved promise goes on in a microtask, and the browser runs microtasks until there are none left before anything else, rendering included. The import\'s break has to wait for something the browser runs after a frame can come: a task (a timer) or a frame.',
    'On line 20, wait for a task instead: `await new Promise(resolve => setTimeout(resolve))`. Save, then Reload.'
  ],
  debrief: {
    title: 'Microtasks don\'t let a frame in',
    paragraphs: [
      'After every task the browser runs the microtask checkpoint: it takes microtasks until the queue is empty, including the ones those microtasks queue. Each `await Promise.resolve()` queued the rest of the import as a microtask, so all twelve chunks (96 ms of work) ran in that one checkpoint of Maya\'s tap. Rendering only comes after it: one frame, at 600 of 600. A loop that keeps queueing microtasks forever never renders again, and never takes another tap.',
      'A timer is a task: `await new Promise(resolve => setTimeout(resolve))` ends the checkpoint, and before the next task the browser may render, which it does whenever a frame is due, here about every second chunk. `requestAnimationFrame` as the break gives one chunk per frame. A MessageChannel message is a task too (what React\'s scheduler uses); Chrome also has `scheduler.yield()`, which this sandbox leaves out (it models no task priorities).',
      'Updating the bar in a `requestAnimationFrame` callback while keeping the microtask breaks doesn\'t help: the callback waits for a frame, and the frame waits for the import.'
    ]
  },
  solution: [
    { predict: 'jumps' },
    { save: 'app.js', replace: [BREATHE, '    await new Promise(resolve => setTimeout(resolve))\n'] },
    'reload'
  ]
}
