// Steer the assistant 7.5: Maya raises free delivery from 20 € to 25 €. Sous raises it, turns `>=` into `>` on the way
// (an order of exactly 25 € now pays), and adds express delivery nobody asked for (a checkbox, a fee, a parameter).
// Two problems, two kinds: the comparison is a bug, the extra is scope. Named scope, Sous takes express out (a pull
// request of its own, if Maya wants it); named a bug, Sous "fixes" express and keeps it, with a rule nobody asked for
// either. Named unclear, the comparison gets a comment and stays. `FREE_FROM = 25` is what was asked: flag it and Sous
// puts it back to 20.
import { ORDER_PAGE, SUMMARY_APP, shopFiles, withEdits } from './shop'
import { steerScenario } from './steer'
import type { PullRequest, SteerEdit } from './types'

const DELIVERY = `// Delivery: free from 20 €, else 3.50 € (Maya).
export const FREE_FROM = 20
export const DELIVERY_FEE = 3.5

export function deliveryFee(total) {
  return total >= FREE_FROM ? 0 : DELIVERY_FEE
}
`

const SUMMARY_JS = `// The basket summary: the total under the products, and the delivery.
import { basketTotal } from './cart.js'
import { deliveryFee } from './delivery.js'
import { formatPrice } from './money.js'

const totalText = document.querySelector('#order-total')
const deliveryText = document.querySelector('#delivery')

export function renderSummary() {
  const total = basketTotal()
  totalText.textContent = formatPrice(total)
  deliveryText.textContent = formatPrice(deliveryFee(total))
}
`

const DELIVERY_PAGE = [
  '<section class="summary" aria-label="Your basket">',
  '  <p>Total <strong id="order-total"></strong> €</p>',
  '  <p>Delivery <strong id="delivery"></strong> €</p>',
  '</section>'
]

const base = shopFiles({ 'app.js': SUMMARY_APP, 'summary.js': SUMMARY_JS, 'delivery.js': DELIVERY }, { main: DELIVERY_PAGE })

const EXPRESS_NOTE = ' Express: within two hours, 5.00 € more.'
const EXPRESS_FEE = 'export const EXPRESS_FEE = 5\n'
const SIGNATURE = 'deliveryFee(total, express = false)'
const RETURN = '  return express ? fee + EXPRESS_FEE : fee\n'
const KEPT_RETURN = '  return express && fee > 0 ? fee + EXPRESS_FEE : fee\n'
const STRICT = 'const fee = total > FREE_FROM ? 0 : DELIVERY_FEE'

const head = withEdits(base, [
  {
    path: 'delivery.js',
    replace: [DELIVERY, `// Delivery: free from 25 €, else 3.50 € (Maya).${EXPRESS_NOTE}
export const FREE_FROM = 25
export const DELIVERY_FEE = 3.5
${EXPRESS_FEE}
export function ${SIGNATURE} {
  ${STRICT}
${RETURN}}
`]
  },
  { path: 'summary.js', replace: ['const deliveryText = document.querySelector(\'#delivery\')\n', 'const deliveryText = document.querySelector(\'#delivery\')\nconst expressBox = document.querySelector(\'#express\')\n'] },
  { path: 'summary.js', replace: ['formatPrice(deliveryFee(total))\n}\n', 'formatPrice(deliveryFee(total, expressBox.checked))\n}\n\nexpressBox.addEventListener(\'change\', renderSummary)\n'] },
  {
    path: 'index.html',
    replace: ['<p>Delivery <strong id="delivery"></strong> €</p>\n', '<p>Delivery <strong id="delivery"></strong> €</p>\n      <label class="note"><input type="checkbox" id="express"> Express: within two hours (5.00 € more)</label>\n']
  }
])

const pr: PullRequest = {
  number: 115,
  title: 'Free delivery from 25 €',
  branch: 'sous/free-from-25',
  description: [
    'Raises free delivery from 20 € to 25 €, as Maya asked.'
  ],
  claims: [
    'Free delivery from 25 €',
    'Orders under 25 € still pay 3.50 €'
  ],
  base,
  head
}

/** Express taken out: delivery.js as asked, summary.js and the page as main has them. */
const takeOut = (returnLine: string): SteerEdit[] => [
  { path: 'delivery.js', replace: [EXPRESS_NOTE, ''] },
  { path: 'delivery.js', replace: [EXPRESS_FEE, ''] },
  { path: 'delivery.js', replace: [SIGNATURE, 'deliveryFee(total)'] },
  { path: 'delivery.js', replace: [returnLine, '  return fee\n'] },
  { path: 'summary.js', revert: true },
  { path: 'index.html', revert: true }
]

const EXPRESS_PLACES = [
  { path: 'delivery.js', text: SIGNATURE },
  { path: 'summary.js', text: 'const expressBox = document.querySelector(\'#express\')' },
  { path: 'summary.js', text: 'expressBox.addEventListener(\'change\', renderSummary)' },
  { path: 'index.html', text: '<label class="note"><input type="checkbox" id="express">' }
]

const FIXED = { path: 'delivery.js', replace: [STRICT, 'const fee = total >= FREE_FROM ? 0 : DELIVERY_FEE'] } as const

export const raiseFreeDelivery = steerScenario({
  id: 'ai-35-raise-free-delivery',
  track: 'ai',
  kind: 'scenario',
  title: 'Free from 25 €',
  difficulty: 3,
  minutes: 7,
  teaches: 'scope, not bug',
  story: [
    'Butter got dearer, and Maya has to move a number: “Free delivery from 25 € now, not 20. That\'s all.” Sous opened a pull request.',
    'There is more in it than one number. Steer Sous to the pull request Maya asked for: every comment is an instruction, and its kind says which. Approve once it\'s right, by round 3.'
  ].join('\n\n'),
  pr,
  steer: {
    rounds: 3,
    start: ['above-25', 'express'],
    problems: [
      {
        id: 'above-25',
        at: { path: 'delivery.js', text: STRICT },
        breaks: [0],
        categories: ['bug', 'false-claim', 'scope'],
        title: '`total > FREE_FROM`: an order of exactly 25 € pays delivery',
        explanation: '“From 25 €” includes 25 €; main had `>=`, and the pull request turned it into `>` on the way. An order of 25.00 € pays 3.50 €.',
        fix: { edits: [FIXED], reply: 'From 25 € means 25 € too: it\'s `>=` again.' },
        misread: [{
          as: ['unclear'],
          edits: [{ path: 'delivery.js', replace: [`  ${STRICT}`, `  // free delivery above FREE_FROM\n  ${STRICT}`] }],
          becomes: ['above-25-explained'],
          reply: 'Added a comment that says when delivery is free.'
        }]
      },
      {
        id: 'above-25-explained',
        at: { path: 'delivery.js', text: STRICT },
        also: [{ path: 'delivery.js', text: '  // free delivery above FREE_FROM' }],
        breaks: [0],
        categories: ['bug', 'false-claim', 'scope'],
        title: 'the comment says “above”, and an order of exactly 25 € still pays delivery',
        explanation: 'The comment writes the mistake down instead of fixing it: Maya said “from 25 €”, which includes 25 €. It needs `>=`.',
        fix: { edits: [FIXED, { path: 'delivery.js', replace: ['  // free delivery above FREE_FROM\n', ''] }], reply: 'Right, from 25 € includes 25 €: it\'s `>=` again, and the comment is gone.' }
      },
      {
        id: 'express',
        at: { path: 'delivery.js', text: EXPRESS_FEE.trimEnd() },
        also: [{ path: 'delivery.js', text: RETURN.trimEnd() }, ...EXPRESS_PLACES],
        categories: ['scope'],
        title: 'express delivery: a feature nobody asked for, in a pull request that should change one number',
        explanation: 'Maya asked for one number. Express is a new price, a checkbox and a new parameter: something to decide (does a two-hour slot exist? who drives?) and review on its own. It comes out, and goes in a pull request of its own if Maya wants it.',
        fix: { edits: takeOut(RETURN), reply: 'Fair: nobody asked for express. It\'s out, and I can open it as a pull request of its own if Maya wants it.' },
        misread: [{
          as: ['bug'],
          edits: [{ path: 'delivery.js', replace: [RETURN, KEPT_RETURN] }],
          becomes: ['express-kept'],
          reply: 'Fixed express: orders that deliver free don\'t pay for express either now.'
        }]
      },
      {
        id: 'express-kept',
        at: { path: 'delivery.js', text: KEPT_RETURN.trimEnd() },
        also: [{ path: 'delivery.js', text: EXPRESS_FEE.trimEnd() }, ...EXPRESS_PLACES],
        categories: ['scope'],
        title: 'express is still there, with a new rule of its own: free express from 25 €',
        explanation: 'Asked to fix express, Sous fixed it: now there is an extra feature and an extra rule nobody asked for. The problem was never how express works, but that it is in this pull request at all.',
        fix: { edits: takeOut(KEPT_RETURN), reply: 'Got it, the problem was express itself: it\'s out, rule and all.' }
      },
      {
        id: 'back-to-20',
        at: { path: 'delivery.js', text: 'export const FREE_FROM = 20' },
        says: [0],
        breaks: [0, 1],
        categories: ['bug', 'false-claim'],
        title: 'free delivery is back at 20 €: what Maya asked for is undone',
        explanation: 'The pull request was meant to raise the threshold to 25 €; now it changes everything but that.',
        fix: { edits: [{ path: 'delivery.js', replace: ['export const FREE_FROM = 20', 'export const FREE_FROM = 25'] }], reply: 'Raised it to 25 € again.' }
      }
    ],
    tempting: [
      {
        id: 'raised',
        at: { path: 'delivery.js', text: 'export const FREE_FROM = 25' },
        why: 'that is the change Maya asked for: free delivery from 25 € instead of 20 €.',
        overreach: {
          edits: [{ path: 'delivery.js', replace: ['export const FREE_FROM = 25', 'export const FREE_FROM = 20'] }],
          becomes: ['back-to-20'],
          reply: 'Put the threshold back to 20 €, as it was.'
        }
      },
      { id: 'under-claim', at: { claim: 1 }, why: 'they do: anything under 25 € pays the 3.50 € fee.' }
    ]
  },
  run: { page: ORDER_PAGE, open: 'delivery.js' },
  hints: [
    'Hold every change against Maya\'s one sentence: what did she ask for, and what else is in the diff? Then work out an order of exactly 25 €.',
    'Two problems of two kinds: `total > FREE_FROM` charges an order of exactly 25 € (a bug), and express is a feature nobody asked for (scope). A bug comment on express asks Sous to fix it, and Sous keeps it.',
    'Comment on `delivery.js:7` as a bug and on `delivery.js:4` (`EXPRESS_FEE`) as scope, Request changes, and approve once the threshold is `>=` and express is gone.'
  ],
  debrief: {
    title: 'An extra comes out; a bug gets fixed',
    paragraphs: [
      'The pull request raised the number, as asked, and did two more things on the way: `>=` became `>`, so an order of exactly 25 € pays delivery, and express delivery appeared, a checkbox, a fee and a parameter nobody asked for. One is a mistake in what was asked (a bug: fix it), the other is more than was asked (scope: take it out).',
      'Name express a bug and Sous fixes express: it stays, now with a rule of its own (free express from 25 €). The more you ask an assistant to improve an extra, the more of it there is. Name the comparison unclear and it gets a comment that writes the mistake down. Flag `FREE_FROM = 25`, which is what Maya asked for, and Sous puts it back to 20.',
      'How to steer a pull request that does too much: say which change was asked for and which wasn\'t, and ask for the extra to come out, not to be repaired. Then check the commit against the one sentence again.'
    ]
  },
  solution: [
    { comment: 'delivery.js', lines: [7, 7], category: 'bug', text: 'From 25 € includes 25 €: this needs >=, as main had.' },
    { comment: 'delivery.js', lines: [4, 4], category: 'scope', text: 'Nobody asked for express: take it out, it can be a pull request of its own.' },
    { submit: 'request-changes', summary: 'Keep >= and leave express out.' },
    { submit: 'approve', summary: 'Free from 25 €, and nothing else.' }
  ]
})
