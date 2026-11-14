// Invented APIs 4.5: "a small date library". Maya wants the page to say when an order can be picked up. Sous imports
// `nextDay` and `formatDay` from `friendly-day-format`, a package it made up, into a shop with no package.json and no
// build step: the browser can't resolve the bare name, and no module of the page runs. The debrief adds the bigger
// risk (slopsquatting: invented names get registered). `Intl.RelativeTimeFormat` with `numeric: 'auto'` ("tomorrow")
// looks invented and is real (tempting).
import { orderSite } from '../debugging/bakery'
import { reviewGoals } from './checks'
import { claimAt, paragraphAt } from './diff'
import { ORDER_PAGE, emptyReview, withEdits } from './shop'
import type { PullRequest, ReviewScenario } from './types'

const base = orderSite({})

const head = withEdits(base, [
  {
    path: 'index.html',
    replace: ['<p class="tagline">Order today, pick up tomorrow from 7:00</p>\n', '<p class="tagline">Order today, pick up tomorrow from 7:00</p>\n      <p class="hours" id="pickup"></p>\n']
  },
  {
    path: 'pickup.js',
    replace: ['', `// When an order can be picked up, under the tagline: the next day, from 7:00 (Maya).
import { nextDay, formatDay } from 'friendly-day-format'

const pickup = document.querySelector('#pickup')
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function renderPickup(today = new Date()) {
  const day = nextDay(today)
  pickup.textContent = \`Pick up \${relative.format(1, 'day')}, \${formatDay(day, 'dddd D MMMM')}, from 7:00\`
}
`]
  },
  { path: 'app.js', replace: ['import { formatPrice } from \'./money.js\'\n', 'import { formatPrice } from \'./money.js\'\nimport { renderPickup } from \'./pickup.js\'\n'] },
  { path: 'app.js', replace: ['renderBadge()\n\n', 'renderBadge()\nrenderPickup()\n\n'] }
])

const pr: PullRequest = {
  number: 75,
  title: 'Show the pickup day',
  branch: 'sous/pickup-day',
  description: [
    'Maya wants the order page to name the day an order can be picked up: the next day, from 7:00.',
    'Dates are easy to get wrong by hand, so this uses `friendly-day-format`, a small date library.'
  ],
  claims: [
    'Shows the pickup day under the tagline, like “Pick up tomorrow, Saturday 21 November, from 7:00”',
    'Adds one small, well-known dependency',
    '“Tomorrow” comes from the browser\'s own `Intl.RelativeTimeFormat`',
    '`cart.js` and `products.js` stay as they are'
  ],
  base,
  head
}

export const dateLibrary: ReviewScenario = {
  id: 'ai-20-date-library',
  track: 'ai',
  kind: 'scenario',
  title: 'A small date library',
  difficulty: 2,
  minutes: 5,
  teaches: 'made-up package',
  story: [
    'The tagline says “pick up tomorrow”, and customers who order late at night ask which day that is. Maya asked Sous to name the day under the tagline.',
    'Sous reached for a package. The shop has no build step and no package.json: the browser loads its files as they are. Before you read the code that uses a dependency, find out where the dependency comes from.'
  ].join('\n\n'),
  pr,
  issues: [{
    id: 'made-up-package',
    path: 'pickup.js',
    lines: [2, 2],
    also: [{ path: 'pickup.js', lines: [8, 9] }, paragraphAt(pr, 1), claimAt(pr, 0), claimAt(pr, 1)],
    categories: ['invented-api', 'security', 'false-claim'],
    title: '`friendly-day-format` is a package Sous made up: the browser can\'t load it, and nothing on the page runs',
    explanation: 'The shop has no such package, and no build step that could bring one: the browser can\'t resolve a bare name like `friendly-day-format`, so no module of the page runs. And installing a package an assistant named, unchecked, is how slopsquatting gets in.'
  }],
  tempting: [
    { path: 'pickup.js', lines: [5, 5], why: '`Intl.RelativeTimeFormat` is real, in every browser since 2020, and with `numeric: \'auto\'` it says “tomorrow” instead of “in 1 day”.' },
    { path: 'app.js', lines: [22, 22], why: 'drawing the pickup day once, as the page opens, is right: the day only changes overnight.' },
    { ...claimAt(pr, 2), why: 'it does: `relative.format(1, \'day\')` gives “tomorrow”, from `Intl`, built into every browser.' },
    { ...claimAt(pr, 3), why: 'they do: neither file changes. The products are gone because no module of the page runs, which is the import\'s doing.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'pickup.js' },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'Run the PR: where are the products? The Console says why.',
    'The Console can\'t resolve `friendly-day-format`. The shop loads its files as they are, with no build step. Where would that package come from, and does it exist at all?',
    '`pickup.js:2` imports `friendly-day-format`, a package the shop doesn\'t have and Sous made up, so no module of the page runs. Comment on it as an invented API, then Request changes.'
  ],
  debrief: {
    title: 'A package nobody checked',
    paragraphs: [
      'The shop has no `package.json` and no build step: the browser loads its files as they are, and a bare name like `friendly-day-format` means nothing to it, so it refuses the import (“Failed to resolve module specifier”) and no module of the page runs. That is what the Console shows. The bigger problem is the name: Sous made the package up, with functions that sound right, `nextDay` and `formatDay`.',
      'Assistants invent package names, and the same names come up again and again, so attackers publish packages under them, with code that runs when you install them (“slopsquatting”). A name that exists on npm proves nothing either: check who publishes it, since when and how many use it before it goes into `package.json`.',
      'Here no package is needed: `Intl.RelativeTimeFormat`, which Sous used too and is real, says “tomorrow”, and `toLocaleDateString` with the `en-GB` locale and `weekday`, `day` and `month` writes “Saturday 21 November”. How you would have caught it: run it, and look up every new dependency before you review the code that uses it.'
    ]
  },
  solution: [
    { comment: 'pickup.js', lines: [2, 2], category: 'invented-api', text: 'There is no friendly-day-format package (and no build step to load one): nothing on the page runs. Intl can do this.' },
    { submit: 'request-changes', summary: 'The date package is made up, and the page doesn\'t load.' }
  ]
}
