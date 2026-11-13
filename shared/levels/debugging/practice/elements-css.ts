// Elements & CSS: the practice tasks, the two kinds of the earlier chapters (ADR 0007): find (click the right line, in
// the editor or through a rule's link in the Elements panel; a wrong click says why it isn't that one) and quick fix
// (one line). Each trains the scenario before it, on the order page of chapter 3 (storefront.ts).
import { ORDER_PAGE } from '../bakery'
import { foundGoal, probeGoal, probesGoal } from '../checks'
import { BRAND_RGB } from '../11-invisible-order'
import { LAPTOP } from '../14-gone-on-phones'
import { BASKET, STOREFRONT_PRODUCTS, STOREFRONT_STYLE, lineOf, storefront, swap } from '../storefront'
import type { StorefrontOptions } from '../storefront'
import type { DebugPracticeTask, FindTarget } from '../types'

const site = (options: StorefrontOptions) => () => ({ files: storefront(options), observed: null, picked: null })

// --- 3.1: Click the rule the colour comes from (find) ---------------------------------------------------------------

const PALE_BASKET = swap(STOREFRONT_STYLE, '.basket {\n  border-top: 2px solid var(--ink);\n  margin-top: 4px;\n  padding-top: 10px;\n', '.basket {\n  border-top: 2px solid var(--ink);\n  margin-top: 4px;\n  padding-top: 10px;\n  color: var(--paper);\n')
const BASKET_RULE = lineOf(PALE_BASKET, '.basket {')

const INHERITED_COLOUR: FindTarget = {
  path: 'style.css',
  lines: [BASKET_RULE, lineOf(PALE_BASKET, 'color: var(--paper);', BASKET_RULE)],
  wrong: {
    [`style.css:${lineOf(PALE_BASKET, 'color: var(--ink);')}`]: 'That rule colours the whole page, but something nearer to the total sets the colour too: in the Elements panel this one is struck through.',
    [`style.css:${lineOf(PALE_BASKET, '--paper: #fffaf3;')}`]: 'That line only gives the colour a name. Which rule uses it for the basket?',
    [`style.css:${lineOf(PALE_BASKET, '.basket p {')}`]: 'That rule matches the total\'s line, but it only sets its margin. Look under “Inherited from” in the Elements panel.'
  },
  otherwise: 'Not that one. Select the total\'s line in the Elements panel: its colour is inherited, and the panel names the element and the rule it comes from.'
}

export const inheritedColour: DebugPracticeTask = {
  id: 'debugging-practice-inherited-colour',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-11-invisible-order',
  title: 'Click the rule the colour comes from',
  difficulty: 1,
  minutes: 0.5,
  task: 'The basket\'s total is invisible: pale text on a pale page. Select its line in the Elements panel (Pick, then click above Order) and click the rule its colour comes from.',
  sandbox: { page: ORDER_PAGE, open: 'style.css', elements: true, probes: [], find: INHERITED_COLOUR },
  setup: site({ style: PALE_BASKET }),
  goals: [foundGoal('You found the rule the total takes its colour from', INHERITED_COLOUR)],
  hints: [`The total's \`p\` sets no colour itself: it inherits one. The Elements panel shows “Inherited from section.basket” with \`.basket\` (\`style.css:${BASKET_RULE}\`), which sets \`color: var(--paper)\`.`],
  why: 'Colour is inherited: an element without a colour of its own takes its parent\'s, so the rule to fix can sit on an ancestor.',
  solution: [{ pick: 'style.css', line: BASKET_RULE }]
}

// --- 3.1: Use the variable that exists (quick fix) ------------------------------------------------------------------

const ADD_VARIABLE = swap(STOREFRONT_STYLE, '  padding: 6px 12px;\n  background: var(--brand);', '  padding: 6px 12px;\n  background: var(--brand-colour);')

export const variableName: DebugPracticeTask = {
  id: 'debugging-practice-variable-name',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-11-invisible-order',
  title: 'Use the variable that exists',
  difficulty: 1,
  minutes: 0.5,
  task: 'The Add buttons vanished: only a pale “Add” floats where they were. Their rule asks for a colour variable `:root` doesn\'t have. Point it at the right one (one line), Save and Reload.',
  sandbox: { page: ORDER_PAGE, open: 'style.css', elements: true, probes: [{ id: 'add-background', steps: [{ style: '[data-id="croissant"] .add', property: 'background-color' }] }] },
  setup: site({ style: ADD_VARIABLE }),
  goals: [probeGoal('brown', `The Add buttons have the shop's brown again (\`${BRAND_RGB}\`)`, 'add-background', BRAND_RGB)],
  hints: [`Line ${lineOf(ADD_VARIABLE, 'var(--brand-colour)')} of \`style.css\` says \`var(--brand-colour)\`; \`:root\` calls the shop's brown \`--brand\`.`],
  why: 'A variable nobody defines makes its declaration invalid, so the property falls back to its starting value (here: transparent) without any error.',
  solution: [{ save: 'style.css', replace: ['var(--brand-colour)', 'var(--brand)'] }, 'reload']
}

// --- 3.2: Click the rule that puts it over everything (find) --------------------------------------------------------

const NOTICE_STYLE = `${STOREFRONT_STYLE}
/* Notices sit in the middle of the bottom edge (Ben) */
.notice-area {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: end center;
  padding: 16px;
}

.notice {
  margin: 0;
  border-radius: 8px;
  padding: 8px 14px;
  background: var(--ink);
  color: var(--paper);
  font-size: 13px;
}
`
const NOTICE_AREA = lineOf(NOTICE_STYLE, '.notice-area {')
const NOTICE = lineOf(NOTICE_STYLE, '.notice {')

const WHAT_COVERS: FindTarget = {
  path: 'style.css',
  lines: [NOTICE_AREA, NOTICE_AREA + 1, NOTICE_AREA + 2, NOTICE_AREA + 3],
  wrong: {
    [`style.css:${NOTICE}`]: 'That is the dark message you can see: it only covers its own spot. What is the box around it?',
    [`style.css:${NOTICE + 1}`]: 'That is the dark message you can see: it only covers its own spot. What is the box around it?',
    [`style.css:${lineOf(NOTICE_STYLE, '.add {')}`]: 'The Add button\'s own rule is fine. What sits on top of it?',
    [`style.css:${lineOf(NOTICE_STYLE, '.order {')}`]: 'The Order button\'s own rule is fine. What sits on top of it?'
  },
  otherwise: 'Not that one. Click Pick, then Add in the app: the element that gets selected is what your click lands on. Its rule puts it there.'
}

export const whatCovers: DebugPracticeTask = {
  id: 'debugging-practice-what-covers',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-12-cant-click',
  title: 'Click the rule that puts it over everything',
  difficulty: 1,
  minutes: 0.5,
  task: 'Nothing on the page can be clicked any more, not even Add. Pick what your click lands on, then click the rule that puts it over everything (its selector or the lines that place it).',
  sandbox: { page: ORDER_PAGE, open: 'style.css', elements: true, probes: [], find: WHAT_COVERS },
  setup: site({ main: [...BASKET, '<div class="notice-area">', '  <p class="notice">We use no cookies, only butter.</p>', '</div>'], style: NOTICE_STYLE }),
  goals: [foundGoal('You found the rule that lays an invisible box over the page', WHAT_COVERS)],
  hints: [`Pick selects \`div.notice-area\`: \`style.css:${NOTICE_AREA}\` fixes it over the whole page (\`inset: 0\`) on top of everything (\`z-index: 100\`), only to put its message in the corner.`],
  why: 'A click goes to the topmost element under the pointer, even a transparent one: Pick shows you which one that is.',
  solution: [{ pick: 'style.css', line: NOTICE_AREA }]
}

// --- 3.2: Let clicks through the banner (quick fix) -----------------------------------------------------------------

const BANNER_STYLE = `${STOREFRONT_STYLE}
/* The banner hangs over the list like the paper sign in the shop window (Maya) */
.banner {
  position: absolute;
  top: 150px;
  left: 0;
  right: 0;
  box-sizing: border-box;
  height: 120px;
  margin: 0;
  padding: 92px 18px 0;
  text-align: center;
  font: italic 13px Georgia, "Times New Roman", serif;
  color: var(--muted);
}
`

export const letClicksThrough: DebugPracticeTask = {
  id: 'debugging-practice-let-clicks-through',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-12-cant-click',
  title: 'Let clicks through the banner',
  difficulty: 1,
  minutes: 0.5,
  task: 'The Add buttons of the pain au chocolat and the sourdough can\'t be clicked: Maya\'s banner hangs over them. Keep the banner, but let clicks through it (one line), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'style.css',
    elements: true,
    probes: [
      { id: 'banner', steps: [{ visible: '.banner' }] },
      { id: 'banner-place', steps: [{ style: '.banner', property: 'position' }] },
      { id: 'badge', steps: [{ tap: '[data-id="sourdough"] .add' }, { text: '#cart-count' }] }
    ]
  },
  setup: site({ main: [...BASKET, '<p class="banner">Fresh from the oven, every morning at 7:00</p>'], style: BANNER_STYLE }),
  goals: [probesGoal('through', 'A tap on the sourdough\'s Add puts it in the basket (the counter shows 1), and the banner still hangs over the list', { 'badge': '1', 'banner': 'visible', 'banner-place': 'absolute' })],
  hints: [`Add \`pointer-events: none;\` to \`.banner\` (\`style.css:${lineOf(BANNER_STYLE, '.banner {')}\`): it has nothing to click itself.`],
  why: '`pointer-events: none` makes an element ignore the pointer, so clicks go to whatever is below it.',
  solution: [{ save: 'style.css', replace: ['.banner {\n', '.banner {\n  pointer-events: none;\n'] }, 'reload']
}

// --- 3.3: Click the rule that wins (find) ---------------------------------------------------------------------------

const SOLD_OUT_PRODUCTS = STOREFRONT_PRODUCTS.map(product => product.id === 'sourdough' ? { ...product, tag: 'sold-out' } : product)

const WINS_STYLE = `${swap(STOREFRONT_STYLE, '.add {\n  flex: none;', '#products .add {\n  flex: none;')}
/* Sold out: a grey button you can't use (Maya) */
.sold-out .add {
  background: #b8ad9f;
  cursor: not-allowed;
}
`
const WINNER = lineOf(WINS_STYLE, '#products .add {')
const LOSER = lineOf(WINS_STYLE, '.sold-out .add {')

const RULE_THAT_WINS: FindTarget = {
  path: 'style.css',
  lines: [WINNER, lineOf(WINS_STYLE, 'background: var(--brand);', WINNER)],
  wrong: {
    [`style.css:${LOSER}`]: 'That is the rule that loses: its `background` is struck through in the Elements panel. Which rule is listed above it?',
    [`style.css:${LOSER + 1}`]: 'That is the background that loses: it is struck through in the Elements panel. Which rule is listed above it?',
    [`style.css:${lineOf(WINS_STYLE, '.order {')}`]: 'That rule is for the Order button. Select the sourdough\'s Add button and read the rules that match it.'
  },
  otherwise: 'Not that one. Select the sourdough\'s Add button in the Elements panel: the rule whose `background` is not struck through wins.'
}

export const ruleThatWins: DebugPracticeTask = {
  id: 'debugging-practice-rule-that-wins',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-13-style-doesnt-apply',
  title: 'Click the rule that wins',
  difficulty: 1,
  minutes: 0.5,
  task: 'The sourdough is sold out, so its Add button should be grey, but it stays brown. Select the button and click the rule whose `background` wins.',
  sandbox: { page: ORDER_PAGE, open: 'style.css', elements: true, probes: [], find: RULE_THAT_WINS },
  setup: site({ style: WINS_STYLE, products: SOLD_OUT_PRODUCTS }),
  goals: [foundGoal('You found the rule that wins', RULE_THAT_WINS)],
  hints: [`\`#products .add\` (\`style.css:${WINNER}\`) has an id, so it beats \`.sold-out .add\` (line ${LOSER}), even though that one comes later.`],
  why: 'The more specific selector wins, whatever its place in the file: the Elements panel lists the winner first.',
  solution: [{ pick: 'style.css', line: WINNER }]
}

// --- 3.3: Fix the selector (quick fix) ------------------------------------------------------------------------------

const TYPO_STYLE = `${STOREFRONT_STYLE}
/* Sold out: a grey button you can't use (Maya) */
.sold-uot .add {
  background: #b8ad9f;
  cursor: not-allowed;
}
`

/** The sold-out grey as the browser computes `#b8ad9f`. */
export const SOLD_OUT_GREY = 'rgb(184, 173, 159)'

export const selectorTypo: DebugPracticeTask = {
  id: 'debugging-practice-selector-typo',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-13-style-doesnt-apply',
  title: 'Fix the selector',
  difficulty: 1,
  minutes: 0.5,
  task: 'The sold-out sourdough\'s Add button should be grey, and in the Elements panel Maya\'s rule doesn\'t even show up for it. Fix the selector (one line), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'style.css',
    elements: true,
    probes: [
      { id: 'sourdough-add', steps: [{ style: '[data-id="sourdough"] .add', property: 'background-color' }] },
      { id: 'croissant-add', steps: [{ style: '[data-id="croissant"] .add', property: 'background-color' }] }
    ]
  },
  setup: site({ style: TYPO_STYLE, products: SOLD_OUT_PRODUCTS }),
  goals: [probesGoal('grey', `The sourdough's Add button is grey (\`${SOLD_OUT_GREY}\`), the others stay brown`, { 'sourdough-add': SOLD_OUT_GREY, 'croissant-add': BRAND_RGB })],
  hints: [`The row's class is \`sold-out\`; line ${lineOf(TYPO_STYLE, '.sold-uot .add {')} of \`style.css\` says \`.sold-uot\`.`],
  why: 'A rule that is not listed for an element does not match it: check its selector letter by letter against the element\'s classes.',
  solution: [{ save: 'style.css', replace: ['.sold-uot .add {', '.sold-out .add {'] }, 'reload']
}

// --- 3.4: Click the media query that hides them (find) --------------------------------------------------------------

const HOURS_STYLE = `${STOREFRONT_STYLE}
@media (min-width: 900px) {
  .top {
    padding: 24px 32px 12px;
  }
}

/* Small screens: keep the header short (Ben) */
@media (max-width: 700px) {
  .hours {
    display: none;
  }
}
`
const HIDING_QUERY = lineOf(HOURS_STYLE, '@media (max-width: 700px)')
const INSIDE = 'That is the rule inside the query. Click the `@media` line that decides when it applies.'

const MEDIA_QUERY_LINE: FindTarget = {
  path: 'style.css',
  lines: [HIDING_QUERY],
  wrong: {
    [`style.css:${lineOf(HOURS_STYLE, '@media (min-width: 900px)')}`]: 'That query holds from 900px up. The app is narrower, so nothing in it applies here.',
    [`style.css:${HIDING_QUERY + 1}`]: INSIDE,
    [`style.css:${HIDING_QUERY + 2}`]: INSIDE,
    [`style.css:${lineOf(HOURS_STYLE, '.hours {')}`]: 'That rule styles the hours (small and muted). It does not hide them.'
  },
  otherwise: 'Not that one. Select the opening hours in the Elements panel (greyed out): the rule with `display: none` names its `@media` query and links its line.'
}

export const mediaQueryLine: DebugPracticeTask = {
  id: 'debugging-practice-media-query-line',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-14-gone-on-phones',
  title: 'Click the media query that hides them',
  difficulty: 1,
  minutes: 0.5,
  task: 'On phones the opening hours under the shop\'s name are gone. Select them in the Elements panel (greyed out) and click the line of the media query that hides them.',
  sandbox: { page: ORDER_PAGE, open: 'style.css', elements: true, probes: [], find: MEDIA_QUERY_LINE },
  setup: site({ header: ['<p class="hours">Mon–Fri 7:00–18:00 · Sat 7:00–13:00</p>'], style: HOURS_STYLE }),
  goals: [foundGoal('You found the media query that hides the opening hours', MEDIA_QUERY_LINE)],
  hints: [`\`@media (max-width: 700px)\` (\`style.css:${HIDING_QUERY}\`) holds on anything up to 700px wide, and inside it \`.hours\` gets \`display: none\`.`],
  why: 'The Elements panel lists only the rules whose media query holds at the page\'s width, and names the query above each one.',
  solution: [{ pick: 'style.css', line: HIDING_QUERY }]
}

// --- 3.4: Turn the query around (quick fix) -------------------------------------------------------------------------

const PHOTOS_STYLE = `${STOREFRONT_STYLE}
/* Phones: no photos, they take too much room (Maya) */
@media (min-width: 600px) {
  .photo {
    display: none;
  }
}
`

export const turnTheQuery: DebugPracticeTask = {
  id: 'debugging-practice-turn-the-query',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-14-gone-on-phones',
  title: 'Turn the query around',
  difficulty: 1,
  minutes: 0.5,
  task: 'The photos should be hidden on phones and show on laptops, but it is the other way round. Fix the media query (one line), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'style.css',
    elements: true,
    probes: [
      { id: 'photo-phone', steps: [{ visible: '.photo' }] },
      { id: 'photo-laptop', width: LAPTOP, steps: [{ visible: '.photo' }] }
    ]
  },
  setup: site({ style: PHOTOS_STYLE }),
  goals: [probesGoal('photos', `The photos are hidden on a phone (390 px) and show on a laptop (${LAPTOP} px)`, { 'photo-phone': 'display: none', 'photo-laptop': 'visible' })],
  hints: [`Line ${lineOf(PHOTOS_STYLE, '@media (min-width: 600px)')} of \`style.css\` says \`min-width: 600px\`, which holds from 600px up: laptops. Phones are up to 600px: \`max-width\`.`],
  why: '`min-width` means from that width up, `max-width` up to that width: a rule for phones needs `max-width`.',
  solution: [{ save: 'style.css', replace: ['@media (min-width: 600px)', '@media (max-width: 600px)'] }, 'reload']
}

// --- 3.5: Click the line that stops it from wrapping (find) ---------------------------------------------------------

const NOWRAP_STYLE = `${STOREFRONT_STYLE}
.note {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
}
`
const NOTE_RULE = lineOf(NOWRAP_STYLE, '.note {')
const NOWRAP = lineOf(NOWRAP_STYLE, 'white-space: nowrap;', NOTE_RULE)

const NOWRAP_LINE: FindTarget = {
  path: 'style.css',
  lines: [NOWRAP],
  wrong: {
    [`style.css:${NOTE_RULE}`]: 'That is the rule. Which of its lines keeps the text on one line?',
    [`style.css:${lineOf(NOWRAP_STYLE, 'white-space: nowrap;')}`]: 'That is the basket counter\'s rule: it stays short. The text that sticks out is the note under the basket.',
    [`style.css:${lineOf(NOWRAP_STYLE, 'main {')}`]: 'The page\'s padding is fine. Which element is wider than the page?'
  },
  otherwise: 'Not that one. Follow the `scroll` badges in the Elements panel to the note under the basket and read its rule.'
}

export const nowrapLine: DebugPracticeTask = {
  id: 'debugging-practice-nowrap-line',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-15-long-name',
  title: 'Click the line that keeps it on one line',
  difficulty: 1,
  minutes: 0.5,
  task: 'On a phone the page scrolls sideways: the note under the basket sticks out on the right. Click the line in `style.css` that stops it from wrapping.',
  sandbox: { page: ORDER_PAGE, open: 'style.css', elements: true, probes: [], find: NOWRAP_LINE },
  setup: site({ main: [...BASKET, '<p class="note">Orders placed before 18:00 are ready tomorrow from 7:00 at the side door on Mill Lane.</p>'], style: NOWRAP_STYLE }),
  goals: [foundGoal('You found the line that keeps the note on one line', NOWRAP_LINE)],
  hints: [`\`.note\` has \`white-space: nowrap;\` (\`style.css:${NOWRAP}\`): the whole sentence stays on one line, wider than a phone.`],
  why: '`white-space: nowrap` keeps text on one line however long it is: the box grows past its parent and the page scrolls sideways.',
  solution: [{ pick: 'style.css', line: NOWRAP }]
}

// --- 3.5: Let a long address wrap (quick fix) -----------------------------------------------------------------------

const ADDRESS_STYLE = `${STOREFRONT_STYLE}
.note {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--muted);
}
`

export const longAddress: DebugPracticeTask = {
  id: 'debugging-practice-long-address',
  track: 'debugging',
  kind: 'practice',
  practises: 'debugging-15-long-name',
  title: 'Let a long address wrap',
  difficulty: 1,
  minutes: 0.5,
  task: 'The e-mail address in the note under the basket is one long word, wider than a phone, so the page scrolls sideways. Let the note break it anywhere (one line in `.note`), Save and Reload.',
  sandbox: {
    page: ORDER_PAGE,
    open: 'style.css',
    elements: true,
    probes: [
      { id: 'page', steps: [{ overflows: 'html' }] },
      { id: 'note', steps: [{ visible: '.note' }] }
    ]
  },
  setup: site({ main: [...BASKET, '<p class="note">Big orders and questions: orders.and.large.group.pickups@cornerbakeryandcoffeehouse.shop</p>'], style: ADDRESS_STYLE }),
  goals: [probesGoal('fits', 'The page fits a phone\'s width (390 px), and the note still shows', { page: 'fits', note: 'visible' })],
  hints: [`Add \`overflow-wrap: anywhere;\` to \`.note\` (\`style.css:${lineOf(ADDRESS_STYLE, '.note {')}\`): a word longer than the line may then break.`],
  why: 'Text only wraps between words; `overflow-wrap: anywhere` lets a word that is longer than the line break too.',
  solution: [{ save: 'style.css', replace: ['  font-size: 13px;\n  color: var(--muted);\n}', '  font-size: 13px;\n  color: var(--muted);\n  overflow-wrap: anywhere;\n}'] }, 'reload']
}
