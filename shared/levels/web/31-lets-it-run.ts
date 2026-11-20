// Security headers & CSP 7.1: the policy that lets it run. TasteBuds' reviews widget renders Mallory's review with
// innerHTML (their bug, a fix "next quarter"); Ben's Content-Security-Policy was meant to stop exactly that, but he added
// 'unsafe-inline' when the Place order button (an inline onclick) stopped working. 'unsafe-inline' lets every inline
// handler on the page run, the button's and Mallory's alike. Learn: a policy blocks inline code only without
// 'unsafe-inline'; make the page's own code external (addEventListener in app.js), so the policy can refuse the rest.
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from './checks'
import { ACCOUNT_BOX, ACCOUNT_ROUTES, REVIEWS_BOX, SHOP_SERVER_HEAD, STATIC_FILES, stillWorks, TASTEBUDS, TASTEBUDS_SCRIPT, WIDGET_TAG, headersApp, headersMiddleware, headersSite, nextXss, orderBox, shopServer } from './headers'
import { SHOP } from './site'
import type { WebScenario } from './types'

/** Ben's policy, with the keyword that undoes it. */
export const LOOSE_POLICY = `script-src 'self' ${TASTEBUDS} 'unsafe-inline'`
const POLICY_LINE = `res.set('Content-Security-Policy', "${LOOSE_POLICY}")`

const SERVER = [
  SHOP_SERVER_HEAD,
  '',
  headersMiddleware('The page\'s security headers (Ben, after the TasteBuds widget went in; \'unsafe-inline\' since the Order button broke)', [POLICY_LINE]),
  '',
  STATIC_FILES,
  '',
  ACCOUNT_ROUTES,
  ''
].join('\n')

const GUARDS = nextXss({ nonce: true })

export const letsItRun: WebScenario = {
  id: 'web-31-lets-it-run',
  track: 'web',
  kind: 'scenario',
  title: 'The policy that lets it run',
  difficulty: 2,
  minutes: 8,
  teaches: 'unsafe-inline',
  story: [
    'The order page shows reviews from TasteBuds, a widget on its own site that puts each review into the page with `innerHTML`. TasteBuds will fix that "next quarter". Ben made the shop\'s server send a `Content-Security-Policy` so a review can\'t run code, then added `\'unsafe-inline\'` when the Place order button stopped working. This morning Lena\'s receipts went to `mallory@cheap-flour.example` again.',
    'Predict what Mallory\'s review does under Ben\'s policy. Then fix it so the policy refuses inline code (Mallory\'s, and whatever an attacker gets into the page next), while the reviews, the account line and Place order still work. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'runs',
      form: 'one',
      prompt: `The page is sent with \`Content-Security-Policy: ${LOOSE_POLICY}\`. TasteBuds' widget puts Mallory's review into the page with \`innerHTML\`: \`Lovely crust! <img src="x" onerror="fetch('/account/email', { method: 'POST', … })">\`. What happens?`,
      options: [
        { id: 'refused', text: 'The `onerror` is refused: the policy only lets scripts from the shop and TasteBuds run.', fact: { says: 'Executing inline event handler violates' } },
        { id: 'innerhtml', text: 'Nothing runs: a policy refuses everything `innerHTML` adds.', fact: { says: 'Executing inline event handler violates' } },
        { id: 'runs', text: 'The `onerror` runs and changes Lena\'s email: `\'unsafe-inline\'` lets every inline handler and script on the page run, whoever wrote it.', fact: { server: 'POST /account/email 200' } },
        { id: 'widget', text: 'The whole widget is refused, so no review shows at all.', fact: { says: `Loading the script '${TASTEBUDS_SCRIPT}' violates` } }
      ],
      answer: 'runs',
      rule: 'A Content-Security-Policy treats every inline script and event handler alike, the page\'s own and an attacker\'s: \'unsafe-inline\' allows all of them, so a policy only stops injected code once the page\'s own code lives in files.'
    }]
  },
  sandbox: {
    page: '/',
    open: 'server.js',
    web: shopServer(),
    probes: [
      ...stillWorks().probes,
      { id: 'email', steps: [{ arrived: `POST ${SHOP}/account/email` }] },
      ...GUARDS.probes
    ]
  },
  setup: () => ({
    files: headersSite({ main: [...ACCOUNT_BOX, ...orderBox(true), ...REVIEWS_BOX], scripts: [WIDGET_TAG] }, { 'app.js': headersApp(), 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what Mallory\'s review does', 1),
    probesGoal('policy', 'The page\'s policy refuses inline code: Mallory\'s onerror never runs (Lena\'s email stays hers), and neither does what an attacker gets in next (an inline handler or script, a script from another site); the TasteBuds reviews, the account line and Place order still work', { ...stillWorks().expected, email: 0, ...GUARDS.expected })
  ],
  hints: [
    'In Network, open the first row (the page itself): its response carries the `Content-Security-Policy`. The Console says nothing about Mallory\'s `onerror`: the policy allowed it. In Server, `POST /account/email 200` is the handler at work.',
    '`\'unsafe-inline\'` is the problem: it allows every inline handler. Without it the policy also refuses the button\'s own `onclick="placeOrder()"` (Chrome says so in the Console), so that code has to move into app.js first.',
    'In server.js, drop `\'unsafe-inline\'` from the policy. In index.html, remove `onclick="placeOrder()"` from the button; in app.js, add `document.querySelector(\'#place\').addEventListener(\'click\', placeOrder)` after placeOrder. Save all three, then Reload.'
  ],
  debrief: {
    title: 'Inline is inline, whoever wrote it',
    paragraphs: [
      'A Content-Security-Policy can\'t tell the shop\'s inline code from an attacker\'s: an `onclick` in index.html and an `onerror` in a review are both inline event handlers. `\'unsafe-inline\'` lets all of them run, so Ben\'s policy guarded the scripts\' addresses and left the one door Mallory uses open.',
      'The fix is to give the policy something to tell apart: the page\'s own code goes into app.js (`addEventListener` instead of `onclick=`), the policy lists only where scripts may come from, and anything inline is refused, with Chrome\'s line in the Console. If one inline handler really must stay, `\'unsafe-hashes\'` with that handler\'s hash allows exactly it and nothing else.',
      'The policy didn\'t fix TasteBuds\' bug: Mallory\'s image is still in the page, it just can\'t run. That is what a second wall is for. Chapter 3\'s fix (text as text) belongs in the widget; the policy holds for the next hole nobody has found yet.'
    ]
  },
  solution: [
    { predict: 'runs' },
    { save: 'server.js', replace: [POLICY_LINE, `res.set('Content-Security-Policy', "script-src 'self' ${TASTEBUDS}")`] },
    { save: 'index.html', replace: [' onclick="placeOrder()"', ''] },
    { save: 'app.js', replace: ['// The Place order button calls this from its onclick in index.html\nwindow.placeOrder = async function placeOrder() {', 'async function placeOrder() {'] },
    { save: 'app.js', replace: ['    : \'Sorry, your order did not go through.\'\n}\n', '    : \'Sorry, your order did not go through.\'\n}\ndocument.querySelector(\'#place\').addEventListener(\'click\', placeOrder)\n'] },
    'reload'
  ]
}
