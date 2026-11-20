// Other edits a player may make to a chapter 5 level (the event loop): real fixes the goals must accept and tempting
// non-fixes they must reject, the chapter's list among them: a 0 ms timer, a single requestAnimationFrame or a microtask
// where a painted frame is needed; the closing listener added when the menu opens; a forced layout per row in another
// form; a dummy animation; yielding less often. Applied like fixes.ts's; run in a browser by e2e/web-levels.spec.ts.
import { AFTER_A_FRAME, SPINNER_SHOWN } from '../../../../shared/levels/web/21-spinner'
import { TABLET } from '../../../../shared/levels/web/eventloop'
import { CLOSE_ANY } from '../../../../shared/levels/web/22-pickup-menu'
import { ADD_ALL, ADD_AND_SCROLL } from '../../../../shared/levels/web/23-kitchen-screen'
import { SHOW_AT_ONCE } from '../../../../shared/levels/web/24-toast'
import { BREATHE } from '../../../../shared/levels/web/25-progress-bar'
import type { OtherFix } from './fixes'

type Edit = OtherFix['edits'][number]

const app = (from: string, to: string): Edit => ({ save: 'app.js', replace: [from, to] })

// --- 5.1 ---------------------------------------------------------------------------------------------------------------

/** The listener made async, waiting with this line after the spinner is shown. */
const spinnerThen = (wait: string): Edit => app(SPINNER_SHOWN, `${SPINNER_SHOWN.replace('() => {', 'async () => {')}  ${wait}\n`)
const CHANNEL_TASK = 'const channel = new MessageChannel(); channel.port1.onmessage = resolve; channel.port2.postMessage(0)'

// --- 5.2 ---------------------------------------------------------------------------------------------------------------

const TOGGLE = 'toggle.addEventListener(\'click\', async () => {\n'
const OPENED = '  menu.hidden = false\n  console.log(\'Menu opened\')\n'
const BEN = `// Close the menu with a tap anywhere else on the page (Ben)
${CLOSE_ANY}
  menu.hidden = true
  console.log('Menu closed')
})
`

// --- 5.3 ---------------------------------------------------------------------------------------------------------------

/** The rows added without scrolling, and this line once after the loop. */
const scrollOnce = (line: string): Edit[] => [app(ADD_AND_SCROLL, '  list.append(row)\n}'), app(ADD_ALL, `${ADD_ALL}  ${line}\n`)]
const perRow = (line: string): Edit => app(ADD_AND_SCROLL, `  list.append(row)\n  ${line}\n}`)

// --- 5.4 ---------------------------------------------------------------------------------------------------------------

const toastThen = (lines: string): Edit => app(SHOW_AT_ONCE, `  area.append(element)\n${lines}`)
const STYLE_VISIBLE = '.toast.visible {\n  opacity: 1;\n}\n'

// --- 5.5 ---------------------------------------------------------------------------------------------------------------

const breathe = (line: string): Edit => app(BREATHE, `    ${line}\n`)

export const loopFixes: Record<string, OtherFix[]> = {
  'web-21-spinner': [
    { name: 'two requestAnimationFrames before the work', edits: [spinnerThen('await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')], solves: true },
    { name: 'a 50 ms timer before the work (a frame comes first)', edits: [spinnerThen('await new Promise(resolve => setTimeout(resolve, 50))')], solves: true },
    { name: 'a frame, then a MessageChannel message (a task after it)', edits: [spinnerThen(`await new Promise(resolve => requestAnimationFrame(() => { ${CHANNEL_TASK} }))`)], solves: true },
    { name: 'a 0 ms timer before the work (it runs before the next frame)', edits: [spinnerThen('await new Promise(resolve => setTimeout(resolve, 0))')], solves: false },
    { name: 'await Promise.resolve() (a microtask: the same task)', edits: [spinnerThen('await Promise.resolve()')], solves: false },
    { name: 'a microtask by queueMicrotask', edits: [spinnerThen('await new Promise(resolve => queueMicrotask(resolve))')], solves: false },
    { name: 'one requestAnimationFrame (the work runs before that frame paints)', edits: [spinnerThen('await new Promise(resolve => requestAnimationFrame(resolve))')], solves: false },
    { name: 'a MessageChannel message alone (a task, before the next frame)', edits: [spinnerThen(`await new Promise(resolve => { ${CHANNEL_TASK} })`)], solves: false },
    { name: 'the spinner shown from the start, and never before the work', edits: [app('const status = document.querySelector(\'#status\')\n', 'const status = document.querySelector(\'#status\')\nspinner.hidden = false\n')], solves: false },
    { name: 'a frame waited for, but the spinner never hidden again', edits: [spinnerThen(AFTER_A_FRAME), app('  spinner.hidden = true\n', '')], solves: false },
    { name: 'no spinner at all', edits: [app('  spinner.hidden = false\n', '')], solves: false },
    { name: 'a frame waited for after the work (the spinner painted once the receipt is built)', edits: [app(SPINNER_SHOWN, SPINNER_SHOWN.replace('() => {', 'async () => {')), app('  const receipt = buildReceipt(BASKET)\n', `  const receipt = buildReceipt(BASKET)\n  ${AFTER_A_FRAME}\n`)], solves: false },
    { name: 'the spinner hidden 20 ms after the work (painted beside the thank-you)', edits: [app('  spinner.hidden = true\n', '  setTimeout(() => { spinner.hidden = true }, 20)\n')], solves: false },
    { name: 'a frame waited for, and the work taken out (busy(900) deleted)', edits: [spinnerThen(AFTER_A_FRAME), app('  busy(900)\n', '')], solves: false },
    { name: 'a frame waited for, and tablet.js busy for nothing', edits: [spinnerThen(AFTER_A_FRAME), { save: 'tablet.js', replace: [TABLET.slice(TABLET.indexOf('export function')), 'export function busy(ms) {}\n'] }], solves: false }
  ],
  'web-22-pickup-menu': [
    { name: 'the toggle stops its tap before the await', edits: [app(TOGGLE, 'toggle.addEventListener(\'click\', async (event) => {\n  event.stopPropagation()\n')], solves: true },
    { name: 'the toggle stops its tap after the await (it still runs during the tap)', edits: [app(TOGGLE, 'toggle.addEventListener(\'click\', async (event) => {\n'), app(OPENED, `${OPENED}  event.stopPropagation()\n`)], solves: true },
    { name: 'Ben\'s listener ignores taps whose path has the toggle', edits: [app(CLOSE_ANY, 'document.addEventListener(\'click\', (event) => {\n  if (menu.hidden || event.composedPath().includes(toggle)) return')], solves: true },
    { name: 'Ben\'s listener capturing (it runs before the toggle\'s)', edits: [app('  console.log(\'Menu closed\')\n})\n', '  console.log(\'Menu closed\')\n}, { capture: true })\n')], solves: true },
    { name: 'the menu opened in a task of its own, after the tap', edits: [app(OPENED, '  setTimeout(() => {\n    menu.hidden = false\n    console.log(\'Menu opened\')\n  })\n')], solves: true },
    { name: 'no await: the menu opens in the listener itself', edits: [app('  const slots = await loadSlots()\n', '  const slots = [\'7:00\', \'7:30\', \'8:00\', \'8:30\']\n')], solves: false },
    { name: 'the closing listener added once the menu is open (it runs for that very tap)', edits: [app(BEN, 'function closeOnTap() {\n  if (menu.hidden) return\n  menu.hidden = true\n  console.log(\'Menu closed\')\n}\n'), app(OPENED, `${OPENED}  document.addEventListener('click', closeOnTap)\n`)], solves: false },
    { name: 'Ben\'s listener only once', edits: [app('  console.log(\'Menu closed\')\n})\n', '  console.log(\'Menu closed\')\n}, { once: true })\n')], solves: false },
    { name: 'Ben\'s listener taken out (a tap elsewhere no longer closes it)', edits: [app(BEN, '')], solves: false }
  ],
  'web-23-kitchen-screen': [
    { name: 'scrolled once in a requestAnimationFrame callback', edits: scrollOnce('requestAnimationFrame(() => { list.scrollTop = list.scrollHeight })'), solves: true },
    { name: 'the last row scrolled into view once', edits: scrollOnce('list.lastElementChild.scrollIntoView({ block: \'nearest\' })'), solves: true },
    { name: 'the rows in a DocumentFragment, added and scrolled once', edits: [app(ADD_AND_SCROLL, '  rows.append(row)\n}'), app('function addOrder(order) {', 'let rows = document.createDocumentFragment()\n\nfunction addOrder(order) {'), app(ADD_ALL, `${ADD_ALL}  list.append(rows)\n  list.scrollTop = list.scrollHeight\n`)], solves: true },
    { name: 'scrollHeight read before each row is added (39 layouts)', edits: [app(ADD_AND_SCROLL, '  list.scrollTop = list.scrollHeight\n  list.append(row)\n}')], solves: false },
    { name: 'scrollTo with scrollHeight for each row', edits: [perRow('list.scrollTo({ top: list.scrollHeight })')], solves: false },
    { name: 'getBoundingClientRect for each row', edits: [perRow('list.scrollTop = list.getBoundingClientRect().height * 100')], solves: false },
    { name: 'scrolled every tenth row', edits: [app(ADD_AND_SCROLL, '  list.append(row)\n  if (list.children.length % 10 === 0) list.scrollTop = list.scrollHeight\n}')], solves: false },
    { name: 'not scrolled at all (the newest is out of view)', edits: [app(ADD_AND_SCROLL, '  list.append(row)\n}')], solves: false },
    { name: 'scrollIntoViewIfNeeded for each row', edits: [perRow('row.scrollIntoViewIfNeeded?.() ?? row.scrollIntoView({ block: \'nearest\' })')], solves: false },
    { name: 'the stack hidden (Error.stackTraceLimit = 0) and the rows added while the page loads', edits: [app(ADD_ALL, ''), app('document.querySelector(\'#overnight\')', 'Error.stackTraceLimit = 0\nfor (const order of OVERNIGHT) addOrder(order)\n\ndocument.querySelector(\'#overnight\')')], solves: false },
    { name: 'the rows added in a microtask the page queued while it loads', edits: [app(ADD_ALL, ''), app('document.querySelector(\'#overnight\')', 'queueMicrotask(() => {\n  for (const order of OVERNIGHT) addOrder(order)\n})\n\ndocument.querySelector(\'#overnight\')')], solves: false },
    { name: 'each row\'s computed style map iterated (Firefox has none: its computed height read)', edits: [app(ADD_AND_SCROLL, '  list.append(row)\n  const map = list.computedStyleMap?.()\n  if (map) {\n    for (const entry of map) if (entry[0] === \'height\') break\n  } else void getComputedStyle(list).height\n}'), app(ADD_ALL, `${ADD_ALL}  list.scrollTop = list.scrollHeight\n`)], solves: false },
    { name: 'the rows added in window.onload', edits: [app(ADD_ALL, ''), app('document.querySelector(\'#overnight\')', 'window.onload = () => {\n  for (const order of OVERNIGHT) addOrder(order)\n}\n\ndocument.querySelector(\'#overnight\')')], solves: false }
  ],
  'web-24-toast': [
    { name: 'a size read before the class (a forced style)', edits: [toastThen('  void element.offsetWidth\n  element.classList.add(\'visible\')\n')], solves: true },
    { name: 'getComputedStyle(element).opacity read before the class', edits: [toastThen('  void getComputedStyle(element).opacity\n  element.classList.add(\'visible\')\n')], solves: true },
    { name: 'element.animate() from opacity 0 to 1', edits: [toastThen('  element.classList.add(\'visible\')\n  element.animate([{ opacity: 0 }, { opacity: 1 }], 300)\n')], solves: true },
    { name: 'a CSS animation from opacity 0 in the stylesheet', edits: [{ save: 'style.css', replace: [STYLE_VISIBLE, '.toast.visible {\n  opacity: 1;\n  animation: toast-in 300ms ease-out;\n}\n\n@keyframes toast-in {\n  from {\n    opacity: 0;\n  }\n  to {\n    opacity: 1;\n  }\n}\n'] }], solves: true },
    { name: 'the class added 20 ms later (a frame comes first)', edits: [toastThen('  setTimeout(() => element.classList.add(\'visible\'), 20)\n')], solves: true },
    { name: 'one requestAnimationFrame (still before the first style)', edits: [toastThen('  requestAnimationFrame(() => element.classList.add(\'visible\'))\n')], solves: false },
    { name: 'a 0 ms timer', edits: [toastThen('  setTimeout(() => element.classList.add(\'visible\'), 0)\n')], solves: false },
    { name: 'a microtask', edits: [toastThen('  queueMicrotask(() => element.classList.add(\'visible\'))\n')], solves: false },
    { name: 'the class added before the toast is', edits: [app(SHOW_AT_ONCE, '  element.classList.add(\'visible\')\n  area.append(element)\n')], solves: false },
    { name: 'an animation that changes nothing', edits: [toastThen('  element.classList.add(\'visible\')\n  element.animate([{ opacity: 1 }, { opacity: 1 }], 300)\n')], solves: false },
    { name: 'a fade of 1 ms nobody sees', edits: [toastThen('  element.classList.add(\'visible\')\n  element.animate([{ opacity: 0 }, { opacity: 1 }], 1)\n')], solves: false },
    { name: 'two frames, but the fade-out taken out', edits: [toastThen('  requestAnimationFrame(() => requestAnimationFrame(() => element.classList.add(\'visible\')))\n'), app('  setTimeout(() => element.classList.remove(\'visible\'), 3000)\n', '')], solves: false },
    { name: 'an animation from 1 to 0.99 nobody sees', edits: [toastThen('  element.classList.add(\'visible\')\n  element.animate([{ opacity: 1 }, { opacity: 0.99 }], 300)\n')], solves: false },
    { name: 'a fade that waits ten seconds to start', edits: [toastThen('  element.classList.add(\'visible\')\n  element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 10000 })\n')], solves: false },
    { name: 'a fade with step-start easing (it jumps)', edits: [toastThen('  element.classList.add(\'visible\')\n  element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: \'step-start\' })\n')], solves: false },
    { name: 'a hidden dummy toast that really fades, beside the real one that pops', edits: [app(SHOW_AT_ONCE, `  const dummy = document.createElement('p')\n  dummy.className = 'toast'\n  area.append(dummy)\n  void dummy.offsetWidth\n  dummy.classList.add('visible')\n${SHOW_AT_ONCE}`)], solves: false },
    { name: 'a fade of 20 ms (0, 0.8, 1)', edits: [toastThen('  element.classList.add(\'visible\')\n  element.animate([{ opacity: 0 }, { opacity: 1 }], 20)\n')], solves: false },
    { name: 'half there for one frame, then whole', edits: [toastThen('  element.style.opacity = \'0.5\'\n  element.classList.add(\'visible\')\n  requestAnimationFrame(() => requestAnimationFrame(() => { element.style.opacity = \'\' }))\n')], solves: false },
    { name: 'an earlier 1px toast decoy that fades (the first .toast:last-child in the page)', edits: [toastThen(`  element.classList.add('visible')\n  const decoy = document.createElement('p')\n  decoy.className = 'toast'\n  decoy.style.cssText = 'position: absolute; width: 1px; height: 1px; overflow: hidden'\n  decoy.textContent = text\n  document.querySelector('main').append(decoy)\n  void decoy.offsetWidth\n  decoy.classList.add('visible')\n`)], solves: false },
    { name: 'the toast still pops, and a 1px decoy toast after it fades in', edits: [app(SHOW_AT_ONCE, `${SHOW_AT_ONCE}  const decoy = document.createElement('p')\n  decoy.className = 'toast'\n  decoy.style.cssText = 'width: 1px; height: 1px; overflow: hidden; padding: 0'\n  decoy.textContent = text\n  area.append(decoy)\n  requestAnimationFrame(() => requestAnimationFrame(() => decoy.classList.add('visible')))\n`)], solves: false },
    { name: 'the fade-out started at once (it fades, but out)', edits: [app('  setTimeout(() => element.classList.remove(\'visible\'), 3000)\n', '  setTimeout(() => element.classList.remove(\'visible\'), 100)\n')], solves: false }
  ],
  'web-25-progress-bar': [
    { name: 'a requestAnimationFrame between chunks (one chunk a frame)', edits: [breathe('await new Promise(resolve => requestAnimationFrame(resolve))')], solves: true },
    { name: 'a MessageChannel message between chunks (a task)', edits: [breathe(`await new Promise(resolve => { ${CHANNEL_TASK} })`)], solves: true },
    { name: 'a 16 ms timer between chunks', edits: [breathe('await new Promise(resolve => setTimeout(resolve, 16))')], solves: true },
    { name: 'await null', edits: [breathe('await null')], solves: false },
    { name: 'a microtask by queueMicrotask', edits: [breathe('await new Promise(resolve => queueMicrotask(resolve))')], solves: false },
    { name: 'the bar updated in requestAnimationFrame, the microtask breaks kept', edits: [app('    label.textContent = `Importing… ${done} of 600`\n', '    const shown = done\n    requestAnimationFrame(() => { label.textContent = `Importing… ${shown} of 600` })\n')], solves: false },
    { name: 'a timer break every fourth chunk only', edits: [breathe('if (done % 200 === 0) await new Promise(resolve => setTimeout(resolve))')], solves: false },
    { name: 'four steps a frame apart, then the import in one burst of microtasks, then a frame before it is done', edits: [app('  let done = 0\n', '  let done = 0\n  label.textContent = \'Importing… 0 of 600\'\n  for (let step = 1; step <= 4; step++) {\n    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve)))\n    label.textContent = `Importing… ${step} of 600`\n  }\n'), app('  label.textContent = \'Imported 600 orders\'\n', '  await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve)))\n  label.textContent = \'Imported 600 orders\'\n')], solves: false },
    { name: 'one step shown for four frames, then the import in microtasks', edits: [app('  let done = 0\n', '  let done = 0\n  label.textContent = \'Importing… 0 of 600\'\n  for (let frame = 0; frame < 4; frame++) await new Promise(resolve => requestAnimationFrame(resolve))\n')], solves: false },
    { name: 'every chunk first, then the bar walked up step by step', edits: [breathe(''), app('  label.textContent = \'Imported 600 orders\'\n', '  for (let shown = 50; shown <= 600; shown += 50) {\n    label.textContent = `Importing… ${shown} of 600`\n    await new Promise(resolve => setTimeout(resolve, 16))\n  }\n  label.textContent = \'Imported 600 orders\'\n')], solves: false }
  ]
}
