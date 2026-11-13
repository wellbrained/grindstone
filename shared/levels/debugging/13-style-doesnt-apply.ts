// Elements & CSS 3.3: Maya's rule for today's special (`.special .price`, red and bold) comes last in the file, but Ben's
// `#products .price` is more specific, so the price gets bold (nothing else sets that) and stays brown. Learn: the
// matching rules are listed from the winner down, what lost is struck through, and specificity beats order.
import { ORDER_PAGE } from './bakery'
import { probesGoal } from './checks'
import { STOREFRONT_PRODUCTS, STOREFRONT_STYLE, lineOf, storefront, swap } from './storefront'
import type { DebugScenario } from './types'

const STYLE = `${swap(STOREFRONT_STYLE, '.price {\n  color: var(--muted);', '#products .price {\n  color: var(--muted);')}
/* Today's special stands out: a red, bold price (Maya) */
.special .price {
  color: #b3261e;
  font-weight: 700;
}
`

const BEN = lineOf(STYLE, '#products .price {')
const MAYA = lineOf(STYLE, '.special .price {')

/** Red, as the browser computes `#b3261e`. */
export const SPECIAL_RED = 'rgb(179, 38, 30)'
/** The shop's muted brown for prices (`--muted`). */
export const MUTED_RGB = 'rgb(122, 106, 88)'

export const styleDoesntApply: DebugScenario = {
  id: 'debugging-13-style-doesnt-apply',
  track: 'debugging',
  kind: 'scenario',
  title: 'My style doesn\'t apply',
  difficulty: 2,
  minutes: 6,
  teaches: 'specificity',
  story: [
    'Maya: “I wanted today\'s special to stand out: a red, bold price. It\'s bold now, but it stays brown. I checked the class name twice!”',
    'Her rule is at the end of `style.css`; the special is the pain au chocolat. Select its price in the Elements panel and compare the rules that match it: which `color` wins, and why? Make the special\'s price red while the other prices keep their colour, then Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'style.css',
    elements: true,
    probes: [
      { id: 'special-price', steps: [{ style: '.special .price', property: 'color' }] },
      { id: 'croissant-price', steps: [{ style: '[data-id="croissant"] .price', property: 'color' }] }
    ]
  },
  setup: () => ({
    files: storefront({ style: STYLE, products: STOREFRONT_PRODUCTS.map(product => product.id === 'pain-au-chocolat' ? { ...product, tag: 'special' } : product) }),
    observed: null,
    picked: null
  }),
  goals: [
    probesGoal('special-red', `The special's price is red (\`${SPECIAL_RED}\`), and the other prices keep their brown`, { 'special-price': SPECIAL_RED, 'croissant-price': MUTED_RGB })
  ],
  hints: [
    'Pick the price of the pain au chocolat (Pick, then click it). Two rules set its `color`: which one is struck through?',
    `\`#products .price\` (\`style.css:${BEN}\`) has an id in its selector, so it is more specific than \`.special .price\` (line ${MAYA}): one id against two classes. The more specific rule wins wherever it stands; the order in the file only decides between equals.`,
    `Make Maya's rule at least as specific: change its selector on line ${MAYA} to \`#products .special .price\`. Save, then Reload.`
  ],
  debrief: {
    title: 'The more specific selector wins',
    paragraphs: [
      'When two rules set the same property on an element, the browser compares their selectors: ids count most, then classes (and attributes and pseudo-classes), then element names. `#products .price` beats `.special .price` because of its id, even though Maya\'s rule comes later. The order in the file only breaks a tie.',
      'The Elements panel lists the matching rules from the winner down and strikes through what lost. Maya\'s `font-weight` was not struck through, since nothing else set it: that is why the price got bold but not red.',
      'Ids in selectors turn every later change into an arms race. Matching the specificity, or lowering the old rule to `.products .price`, keeps it calm; `!important` would win too, but the next change would need another one.'
    ]
  },
  solution: [{ save: 'style.css', replace: ['.special .price {', '#products .special .price {'] }, 'reload']
}
