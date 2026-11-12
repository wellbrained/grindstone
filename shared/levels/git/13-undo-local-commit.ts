// Undo & recovery 6.3: two local commits on main. Drop one completely (`reset --hard`), take the other back and keep
// its changes (`reset`, mixed). The setup's tree is clean, so --hard loses nothing here; story, hints and debrief warn
// that it throws away uncommitted work for good (owner decision: --hard stays inside this scenario, no separate one).
import { commitsOf, repo, resolve } from '../../git'
import type { Scenario } from '../types'
import { text } from './bakery'
import { once } from './checks'

const CART_HTML = [
  '<!-- The cart page: what you ordered and the button to check out. -->',
  '<h1>Your order</h1>',
  '<ul id="items"></ul>'
]
const CART_JS = [
  '// The shopping cart: items and their total.',
  'export const cart = []',
  '',
  'export const total = () => cart.reduce((sum, item) => sum + item.price, 0)'
]
const STYLE = text(
  '/* Shop styles. Colours from the bakery sign: flour white, crust brown. */',
  'body {',
  '  background: #fdfaf5;',
  '  color: #4a2f1b;',
  '}'
)
const CART_HTML_WRAP = text(...CART_HTML, '<label><input type="checkbox" id="gift-wrap"> Gift wrap it (2.50 EUR)</label>', '<button id="checkout">Order now</button>')
const CART_JS_WRAP = text(
  ...CART_JS,
  '',
  '// Gift wrap: a flat 2.50 EUR per order.',
  'export const GIFT_WRAP = 2.5',
  'export const totalWithWrap = wrap => total() + (wrap ? GIFT_WRAP : 0)'
)
const STYLE_BLINK = text(
  STYLE.trimEnd(),
  '',
  '/* make the gift wrap box impossible to miss */',
  '#gift-wrap {',
  '  animation: blink 0.5s step-end infinite;',
  '}',
  '',
  '@keyframes blink {',
  '  50% { visibility: hidden; }',
  '}'
)
const BASE_MESSAGE = 'Show prices with two decimals'
const BLINK_MESSAGE = 'Make the gift wrap box blink'

const setup = () => repo()
  .file('README.md', '# Corner Bakery shop\n\nOrder bread and cakes online, pick them up or get them delivered.')
  .file('cart.html', text(...CART_HTML, '<button id="checkout">Order now</button>'))
  .file('src/cart.js', text(...CART_JS))
  .file('style.css', STYLE)
  .commit('Set up the online shop', { author: 'Maya' })
  .file('src/format.js', '// Prices always show two decimals: 4.80, not 4.8.\nexport const euros = value => `${value.toFixed(2)} EUR`')
  .commit(BASE_MESSAGE, { author: 'Ben' })
  .origin()
  .file('cart.html', CART_HTML_WRAP)
  .file('src/cart.js', CART_JS_WRAP)
  .commit('Add a gift wrap option')
  .file('style.css', STYLE_BLINK)
  .commit(BLINK_MESSAGE)
  .build()

const start = once(setup)
const BASE = () => resolve(start(), 'origin/main')!

export const undoLocalCommit: Scenario = {
  id: 'git-13-undo-local-commit',
  track: 'git',
  kind: 'scenario',
  difficulty: 2,
  minutes: 6,
  title: 'Undo a local commit',
  story: [
    'You were quick this morning: two commits on main in the bakery shop, neither pushed. "Add a gift wrap option" went in before Maya had seen it, and she wants changes (gift wrap only for cakes). "Make the gift wrap box blink" on top of it was just a bad idea.',
    `Drop the blink commit completely, changes and all. Then take back the gift wrap commit, but keep its changes in your files so you can rework them. main ends on "${BASE_MESSAGE}", like origin/main.`,
    'One warning before you start: `git reset --hard` also throws away every uncommitted change in your files, and git cannot bring those back. Your `git status` is clean right now, so nothing is at risk.'
  ].join('\n\n'),
  setup,
  goals: [
    {
      id: 'blink-gone',
      label: 'The blinking box is gone: not on main, not in style.css',
      check: ({ state }) => state.workdir['style.css'] === STYLE && !commitsOf(state, 'main').some(commit => commit.message === BLINK_MESSAGE)
    },
    { id: 'back', label: `main is back on "${BASE_MESSAGE}"`, check: ({ state }) => resolve(state, 'main') === BASE() },
    {
      id: 'kept',
      label: 'Your gift wrap changes are still in cart.html and src/cart.js',
      check: ({ state }) => state.workdir['cart.html'] === CART_HTML_WRAP && state.workdir['src/cart.js'] === CART_JS_WRAP
    }
  ],
  hints: [
    '`git log --oneline` shows your two commits on top of origin/main. `git reset <commit>` moves main back to that commit; `HEAD~1` means one commit before the newest.',
    'How much reset takes back is up to you: `--soft` keeps the changes staged, the default (`--mixed`) keeps them in your files but unstaged, `--hard` throws them away, uncommitted work included. Use `--hard` only on a clean `git status`.',
    'Run `git reset --hard HEAD~1` to drop the blink commit, then `git reset HEAD~1` to take back the gift wrap commit and keep its changes in your files.'
  ],
  debrief: {
    title: 'Reset moves the branch; you choose what stays',
    paragraphs: [
      '`git reset <commit>` moves your branch back, and the commits on top drop out of it. The mode decides what happens to their changes: `--soft` keeps them staged, ready to commit again; `--mixed`, the default, keeps them in your files, unstaged; `--hard` makes your files match the older commit.',
      'Treat `--hard` with care. It overwrites every uncommitted change in tracked files, and since those changes were never committed, git has no copy of them. Run `git status` first, and commit or stash anything you want to keep.',
      'Reset rewrites history, so keep it for commits only you have. Once a commit is pushed and a teammate pulled it, undo it with `git revert` instead: that is the next scenario.'
    ]
  },
  solution: [
    'git log --oneline',
    'git reset --hard HEAD~1',
    'git reset HEAD~1'
  ]
}
