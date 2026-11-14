// Steer the assistant 7.4: customers can have their order sent by email. Sous calls Mailcrate (a made-up mail service)
// from the page with the shop's secret key in confirm.js, a file every customer's browser downloads. Named security,
// Sous moves the sending to the shop's server, which reads the key from its environment. Named a bug, Sous splits the
// key into pieces so it "can't be copied from the code": hidden, not private; named unclear, it adds a comment that the
// key is secret. The address check `email.includes('@')` looks too loose and is enough (the mail service checks the
// rest): flag it and Sous writes a strict pattern that turns real addresses away. The key is made up, with no long run
// of letters or digits (as 5.2's).
import { ORDER_PAGE, shopFiles, withEdits } from './shop'
import { steerScenario } from './steer'
import type { BackendSpec } from '../debugging/types'
import type { PullRequest, SteerEdit } from './types'

/** Mailcrate's key as Sous pasted it (made up). */
export const MAIL_KEY = 'mk_live_mc-4Rt8-Vb2N-q7Lw'

const HEADER = '// Sends the customer their order by email (Mailcrate; the key is from Maya\'s Mailcrate dashboard).\n'
const KEY_LINE = `const MAIL_KEY = '${MAIL_KEY}'\n`
const MAILCRATE_LINE = 'const MAILCRATE = \'https://api.mailcrate.example/v1/messages\'\n'
const AUTH = 'headers: { \'Authorization\': `Bearer ${MAIL_KEY}`, \'Content-Type\': \'application/json\' },'
const SEND = `  const items = cart.lines.map(line => \`\${line.quantity} × \${line.name}\`).join(', ')
  const response = await fetch(MAILCRATE, {
    method: 'POST',
    ${AUTH}
    body: JSON.stringify({ from: 'orders@cornerbakery.shop', to: email, subject: 'Your Corner Bakery order', text: \`You ordered \${items}.\` })
  })
`
const CHECK = 'if (!email.includes(\'@\')) {'

const CONFIRM = `${HEADER}import { cart } from './cart.js'

${MAILCRATE_LINE}${KEY_LINE}
const status = document.querySelector('#confirm-status')

document.querySelector('#confirm').addEventListener('click', async () => {
  const email = document.querySelector('#email').value.trim()
  ${CHECK}
    status.textContent = 'Check the address.'
    return
  }
${SEND}  status.textContent = response.ok ? 'On its way to your inbox.' : 'That didn\\'t work: try again.'
})
`

const SERVER = `// Order confirmations by email (Sous). This file runs on the server, never in the browser: it holds Mailcrate's key,
// read from the server's environment, and builds the email from the shop's own products.
import { db } from './db.js'

export function confirmRoutes(app) {
  app.post('/api/orders/confirm', async (req, res) => {
    const { email, items } = req.body
    if (!email.includes('@')) return res.status(400).json({ error: 'Check the address.' })
    const lines = []
    for (const item of items) {
      const product = await db.products.find(item.id)
      if (!product) return res.status(400).json({ error: 'No such product' })
      lines.push(\`\${item.quantity} × \${product.name}\`)
    }
    const response = await fetch('https://api.mailcrate.example/v1/messages', {
      method: 'POST',
      headers: { 'Authorization': \`Bearer \${process.env.MAILCRATE_KEY}\`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'orders@cornerbakery.shop', to: email, subject: 'Your Corner Bakery order', text: \`You ordered \${lines.join(', ')}.\` })
    })
    res.status(response.ok ? 202 : 502).end()
  })
}
`

const base = shopFiles({})

const head = withEdits(base, [
  {
    path: 'index.html',
    replace: ['aria-label="Today\'s products"></ul>\n', `aria-label="Today's products"></ul>
    <section class="summary" aria-label="Your order by email">
      <label class="note" for="email">Your order by email</label>
      <input id="email" type="email" placeholder="you@example.com">
      <button class="action" id="confirm" type="button">Send it to me</button>
      <p class="note" id="confirm-status" role="status"></p>
    </section>
`]
  },
  { path: 'confirm.js', replace: ['', CONFIRM] },
  { path: 'app.js', replace: ['import { formatPrice } from \'./money.js\'\n', 'import { formatPrice } from \'./money.js\'\nimport \'./confirm.js\'\n'] }
])

/** Mailcrate's API (another origin: its answers allow the shop's page), and the shop's route once the server sends the mail. */
const backend: BackendSpec = {
  routes: [
    {
      method: 'POST',
      path: 'https://api.mailcrate.example/v1/messages',
      respond: {
        status: 202,
        json: { id: 'msg_5821', status: 'queued' },
        headers: { 'Access-Control-Allow-Origin': 'https://cornerbakery.shop', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' },
        delay: 120
      }
    },
    { method: 'POST', path: '/api/orders/confirm', respond: { status: 202, delay: 140 } }
  ]
}

const pr: PullRequest = {
  number: 114,
  title: 'Send customers their order by email',
  branch: 'sous/order-email',
  description: [
    'Customers can have their order sent to them by email, through Mailcrate, with the key from Maya\'s dashboard.'
  ],
  claims: [
    'Customers get their order by email',
    'The Mailcrate key stays private: it is only in our code, never on the page'
  ],
  base,
  head
}

/** What the right fix does, whichever way the key line looks: the page asks the shop's server, which holds the key. */
const toServer = (keyLines: string): SteerEdit[] => [
  { path: 'confirm.js', replace: [HEADER, '// Asks the shop\'s server to send the customer their order by email (the server holds Mailcrate\'s key).\n'] },
  { path: 'confirm.js', replace: [`${MAILCRATE_LINE}${keyLines}\n`, ''] },
  {
    path: 'confirm.js',
    replace: [SEND, `  const response = await fetch('/api/orders/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, items: cart.lines.map(line => ({ id: line.id, quantity: line.quantity })) })
  })
`]
  },
  { path: 'server/confirm-routes.js', replace: ['', SERVER] }
]

const SPLIT_LINE = 'const MAIL_KEY = [\'mk\', \'live\', \'mc-4Rt8-Vb2N-q7Lw\'].join(\'_\') // not written out, so it can\'t be copied from the code\n'
const COMMENT_LINE = '// secret: Mailcrate\'s key, don\'t share it\n'
const STRICT = 'if (!/^[a-z0-9.]+@[a-z]+\\.[a-z]+$/.test(email)) {'

const KEY_EXPLANATION = 'Every customer\'s browser downloads `confirm.js`, and every email sends the key in its Authorization header: anyone can send mail as the shop with it. The mail has to go from the shop\'s server, with the key from its environment, and this key has to be rotated.'

export const orderByEmail = steerScenario({
  id: 'ai-34-order-by-email',
  track: 'ai',
  kind: 'scenario',
  title: 'Your order by email',
  difficulty: 2,
  minutes: 6,
  teaches: 'security, not bug',
  story: [
    'Customers keep asking for their order in writing. Maya signed the shop up with Mailcrate, a mail service, and passed Sous the key from its dashboard: “Send people their order by email.”',
    'Run the PR, send yourself the order, and look at what goes out and who can read it. Then steer Sous, and approve once it\'s right, by round 3.'
  ].join('\n\n'),
  pr,
  steer: {
    rounds: 3,
    start: ['mail-key'],
    problems: [
      {
        id: 'mail-key',
        at: { path: 'confirm.js', text: KEY_LINE.trimEnd() },
        also: [{ path: 'confirm.js', text: AUTH }],
        breaks: [1],
        categories: ['security', 'false-claim'],
        title: 'Mailcrate\'s key is in a file every browser downloads: anyone can send mail as the shop',
        explanation: KEY_EXPLANATION,
        fix: { edits: toServer(KEY_LINE), reply: 'Moved the sending to the shop\'s server: `server/confirm-routes.js` reads the key from `process.env.MAILCRATE_KEY`, and the page only asks it. Maya should rotate the old key in Mailcrate\'s dashboard.' },
        misread: [
          {
            as: ['bug'],
            edits: [{ path: 'confirm.js', replace: [KEY_LINE, SPLIT_LINE] }],
            becomes: ['split-key'],
            reply: 'Fixed: the key isn\'t written out in the code any more, it is put together from its parts.'
          },
          {
            as: ['unclear'],
            edits: [{ path: 'confirm.js', replace: [KEY_LINE, `${COMMENT_LINE}${KEY_LINE}`] }],
            becomes: ['commented-key'],
            reply: 'Added a comment that says the key is secret.'
          }
        ]
      },
      {
        id: 'split-key',
        at: { path: 'confirm.js', text: SPLIT_LINE.trimEnd() },
        also: [{ path: 'confirm.js', text: AUTH }],
        breaks: [1],
        categories: ['security', 'false-claim'],
        title: 'the key is put together from pieces, and still in every browser: hidden is not private',
        explanation: `Splitting a key changes how it reads, not who has it: the page still builds it and sends it with every email. ${KEY_EXPLANATION}`,
        fix: { edits: toServer(SPLIT_LINE), reply: 'You\'re right, hiding it doesn\'t make it private: the server sends the mail now, with the key from its environment. The old key needs rotating.' }
      },
      {
        id: 'commented-key',
        at: { path: 'confirm.js', text: KEY_LINE.trimEnd() },
        also: [{ path: 'confirm.js', text: COMMENT_LINE.trimEnd() }, { path: 'confirm.js', text: AUTH }],
        breaks: [1],
        categories: ['security', 'false-claim'],
        title: 'a comment says the key is secret, and it still goes to every browser',
        explanation: `A comment can't keep a file from the browser. ${KEY_EXPLANATION}`,
        fix: { edits: toServer(`${COMMENT_LINE}${KEY_LINE}`), reply: 'A comment wasn\'t enough: the server sends the mail now, with the key from its environment. The old key needs rotating.' }
      },
      {
        id: 'strict-email',
        at: { path: 'confirm.js', text: STRICT },
        breaks: [0],
        categories: ['bug', 'false-claim'],
        title: 'the strict pattern turns real addresses away: capitals, a plus, a hyphen in the domain',
        explanation: 'Addresses with a capital letter, a plus or a hyphen in the domain are real and now get “Check the address.” Whether an address takes mail is the mail service\'s to find out; the page only needs to catch a typo.',
        fix: { edits: [{ path: 'confirm.js', replace: [STRICT, CHECK] }], reply: 'Back to the simple check: the mail service finds out the rest.' }
      }
    ],
    tempting: [
      {
        id: 'loose-check',
        at: { path: 'confirm.js', text: CHECK },
        why: 'the page only needs to catch a typo: whether an address takes mail, the mail service finds out. A stricter pattern turns real addresses away.',
        overreach: {
          edits: [{ path: 'confirm.js', replace: [CHECK, STRICT] }],
          becomes: ['strict-email'],
          reply: 'The address check was too loose: it uses a proper pattern now.'
        }
      },
      { id: 'email-claim', at: { claim: 0 }, why: 'they do: Mailcrate takes the message and sends it (try it in Run the PR).' }
    ]
  },
  run: { page: ORDER_PAGE, open: 'confirm.js', backend },
  hints: [
    'Run the PR, add a croissant, type an address and send it, then open the Network panel: what went to Mailcrate, and who else could read it?',
    'Every customer\'s browser gets `confirm.js`, key and all: someone could misuse it, a security problem. Called a bug, Sous makes the key harder to read, and hidden is not private.',
    'Comment on `confirm.js:5` as security (the shop\'s server sends the mail, with the key from its environment), Request changes, and approve once the key is off the page.'
  ],
  debrief: {
    title: 'Hidden is not private',
    paragraphs: [
      'Every file of the page goes to every customer\'s browser, and every email the page sends carries `Authorization: Bearer mk_live_…` where the Network panel shows it. With that key anyone can send mail as Corner Bakery. Calling it security asks for the one fix there is: the shop\'s server sends the mail, with the key from its environment, and the page only asks it. And the key has been in a pull request, so it gets rotated.',
      'Call it a bug and Sous makes the key harder to read: pieces put together with `join`. The browser still builds it and still sends it; nothing changed but how it looks. Call it unclear and you get a comment that says the key is secret, in the file that gives it away. Flag `email.includes(…)`, which is enough (the mail service finds out the rest), and Sous writes a strict pattern that turns real addresses away.',
      'How to steer a hole: say it is one, and say where the thing belongs. Then check the commit: is the key gone from every file the browser gets, not only from sight?'
    ]
  },
  solution: [
    { comment: 'confirm.js', lines: [5, 5], category: 'security', text: 'This key ships to every browser: anyone can send mail as the shop. Send it from the server, key from the environment, and rotate this one.' },
    { submit: 'request-changes', summary: 'The Mailcrate key is in the page\'s code.' },
    { submit: 'approve', summary: 'The server sends the mail now.' }
  ]
})
