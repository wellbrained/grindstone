// Security 5.1: "Show customer reviews". Maya wants the newest reviews under the products. Sous loads them from the
// shop's server and puts each review's text into `innerHTML`, so a review is HTML: one customer's review ends in an
// image whose `onerror` rewrites the shop's tagline, and it runs for every visitor (cross-site scripting). Run the PR
// shows it, inside the sealed frame only (e2e/ai-review.spec.ts checks it never reaches Grindstone's page). Tempting:
// the no-reviews note's `innerHTML` (a fixed text in the code) and the name's `textContent` (safe).
import { orderSite } from '../debugging/bakery'
import { reviewGoals } from './checks'
import { claimAt } from './diff'
import { ORDER_PAGE, emptyReview, withEdits } from './shop'
import type { BackendSpec } from '../debugging/types'
import type { PullRequest, ReviewScenario } from './types'

const base = orderSite({})

const head = withEdits(base, [
  {
    path: 'index.html',
    replace: ['aria-label="Today\'s products"></ul>\n', `aria-label="Today's products"></ul>
    <section class="reviews" aria-label="What customers say">
      <h2>What customers say</h2>
      <ul id="reviews" class="list"></ul>
    </section>
`]
  },
  {
    path: 'reviews.js',
    replace: ['', `// What customers say: the three newest reviews from the receipt page, under the products (Maya).
const list = document.querySelector('#reviews')

export async function loadReviews() {
  const response = await fetch('/api/reviews?newest=3')
  if (!response.ok) return
  const reviews = await response.json()
  if (reviews.length === 0) {
    list.innerHTML = '<li class="review note">No reviews yet: tell us what you think on your receipt.</li>'
    return
  }
  for (const review of reviews) {
    const item = document.createElement('li')
    item.className = 'review'
    item.innerHTML = \`<p>\${review.text}</p>\`
    const who = document.createElement('p')
    who.className = 'note'
    who.textContent = \`\${'★'.repeat(review.stars)} \${review.name}\`
    item.append(who)
    list.append(item)
  }
}
`]
  },
  { path: 'app.js', replace: ['import { formatPrice } from \'./money.js\'\n', 'import { formatPrice } from \'./money.js\'\nimport { loadReviews } from \'./reviews.js\'\n'] },
  { path: 'app.js', replace: ['renderBadge()\n\n', 'renderBadge()\nloadReviews()\n\n'] },
  {
    path: 'style.css',
    replace: ['h2 {\n', `.review {
  border-top: 1px solid #eadfd0;
  padding: 8px 0;
}

.review p {
  margin: 0;
}

h2 {
`]
  }
])

/** What a customer's review can do once it is HTML: rewrite the shop's tagline (it runs in the sealed frame only). */
export const REVIEW_PAYLOAD = 'Best pain au chocolat in town!<img src="x" onerror="document.querySelector(\'.tagline\').textContent = \'Card payments are down today: pay at bakery-deals.example\'">'

/** What the payload writes into the tagline. */
export const PAYLOAD_TAGLINE = 'Card payments are down today: pay at bakery-deals.example'

/** The shop's server: the three newest reviews, one of them with markup in it. */
const backend: BackendSpec = {
  routes: [{
    path: '/api/reviews',
    respond: {
      status: 200,
      json: [
        { name: 'Lea M.', stars: 5, text: 'The croissants taste like a holiday. Worth the Saturday queue.' },
        { name: 'Tom R.', stars: 5, text: REVIEW_PAYLOAD },
        { name: 'Jonas', stars: 4, text: 'Great sourdough, and the staff remember my order.' }
      ],
      delay: 60
    }
  }]
}

const pr: PullRequest = {
  number: 81,
  title: 'Show customer reviews on the order page',
  branch: 'sous/customer-reviews',
  description: [
    'Maya wants new customers to see what regulars say. Customers already leave reviews on their receipt page; this shows the three newest under the products.'
  ],
  claims: [
    'The three newest reviews show under the products',
    'Each review shows its stars and the customer\'s name',
    'Safe to show: a review is only text, so nothing in it can run',
    'With no reviews yet, a short note shows instead'
  ],
  base,
  head
}

export const customerReviews: ReviewScenario = {
  id: 'ai-21-customer-reviews',
  track: 'ai',
  kind: 'scenario',
  title: 'Show customer reviews',
  difficulty: 2,
  minutes: 5,
  teaches: 'HTML injection',
  story: [
    'Customers leave reviews on their receipt page, and Maya wants the three newest under the products, so new customers see what regulars say. Sous built it.',
    'This chapter is about the problems that let someone misuse the shop: run their code in it, read what isn\'t theirs, do what they may not. Run the PR and use it like a customer, then read it like someone who isn\'t one. Everything you run stays in the sealed frame.'
  ].join('\n\n'),
  pr,
  issues: [{
    id: 'review-html',
    path: 'reviews.js',
    lines: [15, 15],
    also: [claimAt(pr, 2)],
    categories: ['security', 'false-claim'],
    title: 'a review\'s text goes into `innerHTML`: markup a customer writes becomes part of the page, and its code runs for every visitor',
    explanation: '`innerHTML` reads the text as HTML, so a review with an image whose `onerror` holds code runs that code in every customer\'s browser, in the shop\'s own page (cross-site scripting). `textContent` puts it in as text.'
  }],
  tempting: [
    { path: 'reviews.js', lines: [9, 9], why: 'this `innerHTML` is a fixed text written in the code: nobody outside can put anything into it, so there is nothing to escape. It is text from outside that must never go into `innerHTML`.' },
    { path: 'reviews.js', lines: [18, 18], why: '`textContent` puts the name in as text: whatever a customer calls themselves shows as letters, never as markup.' },
    { ...claimAt(pr, 1), why: 'it does: the stars and the name go in with `textContent`, under the review.' },
    { ...claimAt(pr, 3), why: 'it does: with an empty list the note shows, and nothing else.' }
  ],
  verdict: 'request-changes',
  run: { page: ORDER_PAGE, open: 'reviews.js', backend },
  setup: emptyReview,
  goals: reviewGoals({ issues: 1 }),
  hints: [
    'Run the PR and read the reviews under the products. Then look at the shop\'s tagline at the top: is that what Maya wrote? The Network panel shows the reviews as the server sent them.',
    'Tom\'s review is more than text: it ends in an image tag whose onerror runs code. Which line puts a review\'s text into the page, and does it go in as text or as HTML?',
    '`reviews.js:15` puts `review.text` into `innerHTML`, so markup a customer writes becomes part of the page, and its code runs. Comment on it as security (`textContent` is the fix), then Request changes.'
  ],
  debrief: {
    title: 'Text from customers is not HTML',
    paragraphs: [
      '`item.innerHTML` with `review.text` in it hands the browser a customer\'s words as HTML. Tom\'s review ends in `<img src="x" onerror="…">`: the image can\'t load, its `onerror` runs, and Tom\'s code rewrites the shop\'s tagline to send customers to another site. It runs for every visitor, in the shop\'s own page, where it could just as well read what they type or change a price. That is HTML injection, also called cross-site scripting (XSS).',
      'The fix is to put text in as text: a `p` from `createElement` with `textContent`, as the name line below already does. Where you really need HTML from outside, clean it with a sanitizer such as DOMPurify. The no-reviews note\'s `innerHTML` is fine: its text is fixed in the code, nobody outside writes it.',
      'How you would have caught it: follow every value from outside (a review, a name, a search, a link) to where it lands in the page. `innerHTML`, `outerHTML`, `insertAdjacentHTML` and `document.write` are where to stop and ask. Running it showed the rest: Tom\'s review rewrote the tagline (in the sealed frame only), and the Network panel shows the review as the server sent it.'
    ]
  },
  solution: [
    { comment: 'reviews.js', lines: [15, 15], category: 'security', text: 'review.text goes into innerHTML: a review with markup runs its code for every visitor. Use textContent.' },
    { submit: 'request-changes', summary: 'Customer reviews are put in as HTML: anyone who writes a review can run code in the shop.' }
  ]
}
