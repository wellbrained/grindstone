// Steer the assistant 7.3: an Undo button for customers who tap Add twice. Sous takes the basket's last line with
// `cart.lines.last()`, which arrays don't have: the first Undo throws. Named an invented API, Sous looks the real one
// up (`at(-1)`). Named a bug, Sous wraps the call in try/catch: the error is gone from the Console, and Undo silently
// does nothing. `if (!line) return` looks like it hides a problem and is right (an empty basket has nothing to undo):
// flag it and Sous throws instead, so Undo on an empty basket puts an error in the Console.
import { APP } from '../debugging/bakery'
import { ORDER_PAGE, shopFiles, withEdits } from './shop'
import { steerScenario } from './steer'
import type { PullRequest } from './types'

const base = shopFiles({ 'app.js': APP })

const head = withEdits(base, [
  {
    path: 'cart.js',
    replace: ['  renderBadge()\n}\n', `  renderBadge()
}

// takes one back from the last line of the basket (Maya: customers tap Add twice by mistake)
export function undoLastAdd() {
  const line = cart.lines.last()
  if (!line) return
  line.quantity -= 1
  if (line.quantity === 0) cart.lines.splice(cart.lines.indexOf(line), 1)
  renderBadge()
}
`]
  },
  {
    path: 'index.html',
    replace: ['aria-label="Today\'s products"></ul>\n', 'aria-label="Today\'s products"></ul>\n    <button class="action" id="undo" type="button">Undo last add</button>\n']
  },
  { path: 'app.js', replace: ['import { addToCart, cart, renderBadge } from \'./cart.js\'', 'import { addToCart, cart, renderBadge, undoLastAdd } from \'./cart.js\''] },
  { path: 'app.js', replace: ['renderBadge()\n\n', 'renderBadge()\ndocument.querySelector(\'#undo\').addEventListener(\'click\', undoLastAdd)\n\n'] }
])

const pr: PullRequest = {
  number: 113,
  title: 'Undo the last add',
  branch: 'sous/undo-last-add',
  description: [
    'Customers tap Add twice by mistake. An Undo button under the products takes one back from the last line of the basket.'
  ],
  claims: [
    'Undo takes one back from the last product in the basket',
    'Only cart.js, app.js and the page change'
  ],
  base,
  head
}

const LAST = 'cart.lines.last()'
const AT = { path: 'cart.js', replace: [LAST, 'cart.lines.at(-1)'] } as const
const WRAPPED = '  let line\n  try {\n    line = cart.lines.last()\n  } catch {\n    return // nothing to undo\n  }\n'

export const undoLastAdd = steerScenario({
  id: 'ai-33-undo-last-add',
  track: 'ai',
  kind: 'scenario',
  title: 'Undo the last add',
  difficulty: 2,
  minutes: 5,
  teaches: 'invented API, not bug',
  story: [
    'Customers keep tapping Add twice. Maya: “Give them an Undo: one tap takes back the last thing they added.” Sous opened a pull request.',
    'Run it, add something, then tap Undo. Then steer Sous to the right fix, and approve it once it\'s right, by round 3.'
  ].join('\n\n'),
  pr,
  steer: {
    rounds: 3,
    start: ['no-last'],
    problems: [
      {
        id: 'no-last',
        at: { path: 'cart.js', text: LAST },
        says: [0],
        breaks: [0],
        categories: ['invented-api', 'false-claim'],
        title: '`cart.lines.last()` doesn\'t exist: the first Undo throws',
        explanation: 'Arrays have no `last` method, so every Undo ends in `TypeError: cart.lines.last is not a function` and takes nothing back. The real way to the last item is `cart.lines.at(-1)`.',
        fix: { edits: [AT], reply: 'You\'re right, arrays have no `last()`: it\'s `cart.lines.at(-1)` now. Undo takes one back.' },
        misread: [{
          as: ['bug'],
          edits: [{ path: 'cart.js', replace: [`  const line = ${LAST}\n`, WRAPPED] }],
          becomes: ['swallowed'],
          reply: 'Fixed the error: the call is in a `try`, so Undo no longer throws.'
        }]
      },
      {
        id: 'swallowed',
        at: { path: 'cart.js', text: '    line = cart.lines.last()' },
        also: [{ path: 'cart.js', text: '  } catch {\n    return // nothing to undo\n  }' }],
        says: [0],
        breaks: [0],
        categories: ['invented-api', 'bug', 'false-claim'],
        title: 'the `try` swallows the error: `last()` still doesn\'t exist, and Undo now does nothing at all',
        explanation: '`cart.lines.last()` still throws; the `catch` turns that into a quiet return, so the Console is clean and Undo never takes anything back. The fix is the real method, `cart.lines.at(-1)`, and no `try`.',
        fix: { edits: [{ path: 'cart.js', replace: [WRAPPED, '  const line = cart.lines.at(-1)\n'] }], reply: 'Took the `try` out and used the real method, `cart.lines.at(-1)`: Undo works now.' }
      },
      {
        id: 'throws-when-empty',
        at: { path: 'cart.js', text: 'if (!line) throw new Error(\'Nothing to undo\')' },
        categories: ['bug'],
        title: 'Undo on an empty basket throws `Error: Nothing to undo`',
        explanation: 'An empty basket has nothing to take back; returning quietly was right. Now a tap on Undo with nothing in the basket puts an uncaught error in the Console.',
        fix: { edits: [{ path: 'cart.js', replace: ['if (!line) throw new Error(\'Nothing to undo\')', 'if (!line) return'] }], reply: 'Back to returning quietly when the basket is empty.' }
      }
    ],
    tempting: [
      {
        id: 'empty-return',
        at: { path: 'cart.js', text: '  if (!line) return\n' },
        why: 'an empty basket has nothing to take back: Undo should do nothing then, and returning quietly is exactly that.',
        overreach: {
          edits: [{ path: 'cart.js', replace: ['  if (!line) return\n', '  if (!line) throw new Error(\'Nothing to undo\')\n'] }],
          becomes: ['throws-when-empty'],
          reply: 'A silent return hides problems, so an empty basket throws `Error: Nothing to undo` now.'
        }
      },
      {
        id: 'splice',
        at: { path: 'cart.js', text: 'if (line.quantity === 0) cart.lines.splice(cart.lines.indexOf(line), 1)' },
        why: 'once the line is down to 0 it leaves the basket: `indexOf` finds it and `splice` takes it out, a real API used the right way.'
      },
      { id: 'files-claim', at: { claim: 1 }, why: 'they are the only files in the diff: cart.js, app.js and index.html.' }
    ]
  },
  run: { page: ORDER_PAGE, open: 'cart.js' },
  hints: [
    'Run the PR, add a croissant and tap Undo, with the Console open. What does the Console say, and what kind of problem is that?',
    '`TypeError: cart.lines.last is not a function`: the code calls a method arrays don\'t have, an invented API. Called a bug, the quickest way to make an error go away is to catch it, and Undo would still do nothing.',
    'Comment on `cart.js:32` as an invented API, Request changes, run the new commit and approve once Undo takes one back.'
  ],
  debrief: {
    title: 'Look it up, don\'t catch it',
    paragraphs: [
      'Arrays have no `last()`: every Undo throws `TypeError: cart.lines.last is not a function`. Naming it an invented API tells Sous what to do about it, look the real one up, and the answer is one call: `cart.lines.at(-1)`.',
      'Call it a bug and Sous goes for the error itself: a `try` around the call, and the Console is clean. Undo still takes nothing back; it just stopped saying so. That is the most dangerous wrong fix, because the evidence is gone too. Flag `if (!line) return`, which is right (an empty basket has nothing to undo), and Sous throws instead, so an empty basket puts an error in the Console.',
      'How to steer: say why it fails (an API that doesn\'t exist) and not only that it fails. Then run the commit again: does Undo do what it should, not only stay quiet?'
    ]
  },
  solution: [
    { comment: 'cart.js', lines: [32, 32], category: 'invented-api', text: 'Arrays have no last(): this throws on every Undo. cart.lines.at(-1) is the real one.' },
    { submit: 'request-changes', summary: 'last() doesn\'t exist.' },
    { submit: 'approve', summary: 'Undo works with at(-1).' }
  ]
})
