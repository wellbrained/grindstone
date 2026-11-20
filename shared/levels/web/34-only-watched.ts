// Security headers & CSP 7.4: the policy that only watched. Ben rolled the strict policy out as
// Content-Security-Policy-Report-Only to see what it would break first, with report-uri: a week of reports later,
// Mallory's onerror still runs every time (a report-only policy blocks nothing). The reports name what enforcing it
// would break: the page's own inline script that writes the pickup line. Learn: Report-Only is for trying a policy;
// read its reports, fix what they name (hash it, or move it into a file), then enforce.
import { probesGoal } from '../debugging/checks'
import { predictedGoal } from './checks'
import { ACCOUNT_BOX, ACCOUNT_ROUTES, REVIEWS_BOX, SHOP_SERVER_HEAD, STATIC_FILES, stillWorks, TASTEBUDS, WIDGET_TAG, headersApp, headersMiddleware, headersSite, nextXss, orderBox, shopServer } from './headers'
import { SHOP } from './site'
import type { WebScenario } from './types'

const POLICY = `script-src 'self' ${TASTEBUDS}; report-uri /csp-report`
const POLICY_LINE = `res.set('Content-Security-Policy-Report-Only', "${POLICY}")`
export const PICKUP = 'Pick up tomorrow from 7:00 at Market Street 4.'
/** The page's own inline script (Maya's pickup line), exactly as index.html has it between its tags. */
export const PICKUP_SCRIPT = `\n    document.querySelector('#pickup').textContent = '${PICKUP}'\n  `

const SERVER = [
  SHOP_SERVER_HEAD,
  '',
  headersMiddleware('The page\'s security headers: trying the strict policy before it blocks anything (Ben)', [POLICY_LINE]),
  '',
  STATIC_FILES,
  '',
  '// Where browsers send what the policy would have blocked (Ben reads them every Monday)',
  'app.post(\'/csp-report\', (req, res) => {',
  '  console.log(\'CSP report received\')',
  '  res.sendStatus(204)',
  '})',
  '',
  ACCOUNT_ROUTES,
  ''
].join('\n')

const GUARDS = nextXss({ nonce: true })

export const onlyWatched: WebScenario = {
  id: 'web-34-only-watched',
  track: 'web',
  kind: 'scenario',
  title: 'The policy that only watched',
  difficulty: 2,
  minutes: 8,
  teaches: 'Report-Only',
  story: [
    'After the last scare, Ben wrote the strict policy (only the shop\'s and TasteBuds\' scripts, nothing inline) and sent it as `Content-Security-Policy-Report-Only`, "to see what it would break first", with `report-uri /csp-report`. A week of reports later, Lena\'s receipts went to `mallory@cheap-flour.example` once more.',
    'Predict what Mallory\'s review does under Ben\'s header. Then enforce the policy without breaking the page: the reports in the Server panel and the Console name what it would refuse of the shop\'s own. Mallory\'s onerror and the next attacker\'s code must be refused, and the pickup line, the reviews, the account line and Place order must still work. Save, then Reload.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'watched',
      form: 'one',
      prompt: `The page is sent with \`Content-Security-Policy-Report-Only: ${POLICY}\` and nothing else. TasteBuds' widget puts Mallory's review into the page with \`innerHTML\`, an image whose \`onerror\` posts to \`/account/email\`. What happens?`,
      options: [
        { id: 'refused', text: 'The `onerror` is refused, and Chrome posts a report about it to `/csp-report`.' },
        { id: 'watched', text: 'The `onerror` runs and changes Lena\'s email; Chrome only writes in the Console and posts a report: a report-only policy blocks nothing.', fact: { server: 'POST /account/email 200' } },
        { id: 'silent', text: 'The `onerror` runs and nothing is said: a report-only policy waits for an enforced one before it reports.' },
        { id: 'everything', text: 'Every script is refused until the policy is enforced, the widget\'s too.', fact: { says: `Loading the script '${TASTEBUDS}/reviews.js' violates` } }
      ],
      answer: 'watched',
      rule: 'A Content-Security-Policy-Report-Only header only reports: the browser writes each violation in the Console and posts it to report-uri, and runs the code all the same.'
    }]
  },
  sandbox: {
    page: '/',
    open: 'server.js',
    web: shopServer(),
    probes: [
      ...stillWorks().probes,
      { id: 'pickup', steps: [{ text: '#pickup' }] },
      { id: 'email', steps: [{ arrived: `POST ${SHOP}/account/email` }] },
      ...GUARDS.probes
    ]
  },
  setup: () => ({
    files: headersSite({
      main: [...ACCOUNT_BOX, ...orderBox(false), '<p id="pickup" class="note"></p>', ...REVIEWS_BOX],
      scripts: [WIDGET_TAG, `<script>${PICKUP_SCRIPT}</script>`]
    }, { 'app.js': headersApp({ listener: true }), 'server.js': SERVER }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what Mallory\'s review does', 1),
    probesGoal('enforced', 'The policy is enforced: Mallory\'s onerror never runs (Lena\'s email stays hers), and neither does what an attacker gets in next; the pickup line, the TasteBuds reviews, the account line and Place order still work', { ...stillWorks().expected, pickup: PICKUP, email: 0, ...GUARDS.expected })
  ],
  hints: [
    'The Console has two lines that end "The policy is report-only, so the violation has been logged but no further action has been taken.": one for Mallory\'s handler, one for an inline script. The Server panel shows the reports arriving at `/csp-report`, and `POST /account/email 200`: nothing was blocked.',
    'Renaming the header to `Content-Security-Policy` enforces it, and then the page\'s own inline script (the one that writes the pickup line) is refused too. Either move its line into app.js, or allow exactly that script by its hash: Chrome\'s line gives it (`\'sha256-…\'`).',
    'In index.html, delete the inline `<script>` and put its line into app.js: `document.querySelector(\'#pickup\').textContent = \'Pick up tomorrow from 7:00 at Market Street 4.\'`. In server.js, change `Content-Security-Policy-Report-Only` to `Content-Security-Policy` (report-uri may stay). Save, then Reload.'
  ],
  debrief: {
    title: 'Watch first, then enforce',
    paragraphs: [
      'A `Content-Security-Policy-Report-Only` header is a dry run: the browser checks everything against the policy, writes each violation in the Console (as info, not as an error) and posts it to `report-uri`, and then runs the code anyway. Ben\'s week of reports was useful; it just never stopped Mallory.',
      'The reports named the two things the policy refuses: Mallory\'s handler and the shop\'s own inline script. Enforcing without fixing the second would have broken the pickup line for every customer. So: move the page\'s own inline code into a file (or allow it by its hash, which only ever allows that exact text), then send the same policy as `Content-Security-Policy`. Keeping `report-uri` (or a report-only policy beside the enforced one) tells you what breaks next.',
      'Report-only has no meta-tag form (Chrome ignores it and says so), and a report-only policy\'s `frame-ancestors` frames nothing either. It is a tool for rolling a policy out, not a protection.'
    ]
  },
  solution: [
    { predict: 'watched' },
    { save: 'index.html', replace: [`\n  <script>${PICKUP_SCRIPT}</script>`, ''] },
    { save: 'app.js', replace: ['document.querySelector(\'#place\').addEventListener(\'click\', placeOrder)\n', `document.querySelector('#place').addEventListener('click', placeOrder)\ndocument.querySelector('#pickup').textContent = '${PICKUP}'\n`] },
    { save: 'server.js', replace: [POLICY_LINE, `res.set('Content-Security-Policy', "${POLICY}")`] },
    'reload'
  ]
}
