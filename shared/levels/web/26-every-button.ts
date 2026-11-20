// Accessibility 6.1: every button says "button". Jonas gave the menu's Add buttons a new look: a basket icon, an inline
// SVG marked aria-hidden, and nothing else. Tomás, who shops with a screen reader, tabs to them and hears "button",
// "button", "button": a button's name comes from its text, aria-label or aria-labelledby, and these have none. Learn: every
// control needs a name, and a name that says which one (Add Butter croissant); an icon hidden from screen readers gives
// none, a description isn't a name, hidden text isn't read, and a title is only the last resort.
import { probesGoal } from '../debugging/checks'
import { BASKET_ICON, a11ySite, a11ySpec } from './accessibility'
import { predictedGoal } from './checks'
import { SHOP_PAGE } from './site'
import type { WebScenario } from './types'

/** The button in each row: the icon and nothing else (the fix gives it a name). */
export const ADD_BUTTON = '    <button class="add icon-button" type="button">${BASKET_ICON}</button>`'

const APP = `// The menu (Jonas): a row per product, each with a basket button that adds it. New look since June: an icon.
const PRODUCTS = [
  { id: 'croissant', name: 'Butter croissant', price: '2.40' },
  { id: 'pain-au-chocolat', name: 'Pain au chocolat', price: '2.80' },
  { id: 'cinnamon-bun', name: 'Cinnamon bun', price: '3.40' }
]

const BASKET_ICON = '${BASKET_ICON}'

const list = document.querySelector('#products')
const count = document.querySelector('#cart-count')
let items = 0

for (const product of PRODUCTS) {
  const row = document.createElement('li')
  row.className = 'product'
  row.dataset.id = product.id
  row.innerHTML = \`
    <span class="photo" aria-hidden="true"></span>
    <span><span class="name">\${product.name}</span> <span class="price">\${product.price} €</span></span>
${ADD_BUTTON}
  row.querySelector('.add').addEventListener('click', () => {
    items += 1
    count.textContent = String(items)
  })
  list.append(row)
}
`

const MAIN = [
  '<p class="cart">Basket: <span id="cart-count">0</span></p>',
  '<section class="box" aria-labelledby="menu-heading">',
  '  <h2 id="menu-heading">Today\'s menu</h2>',
  '  <ul id="products" class="products"></ul>',
  '</section>'
]

const add = (id: string) => `[data-id="${id}"] .add`

/** Each button with each product that isn't its own. */
const PRODUCT_NAMES: readonly (readonly [string, string])[] = [['croissant', 'Butter croissant'], ['pain-au-chocolat', 'Pain au chocolat'], ['cinnamon-bun', 'Cinnamon bun']]
const OTHERS = PRODUCT_NAMES.flatMap(([id]) => PRODUCT_NAMES.filter(([other]) => other !== id).map(([, name]) => [id, name] as const))

export const everyButton: WebScenario = {
  id: 'web-26-every-button',
  track: 'web',
  kind: 'scenario',
  title: 'Every button says “button”',
  difficulty: 1,
  minutes: 5,
  teaches: 'accessible name',
  story: [
    'Tomás is blind and orders his croissants with a screen reader: Tab moves from control to control, and the reader says what each one is. Since Jonas gave the menu\'s Add buttons their new look, a basket icon and nothing else, Tomás hears the same word on every product and gave up ordering.',
    'Predict what the reader says on the croissant\'s button. Then fix `app.js` so each Add button tells Tomás which product it adds (the icon may stay). Save, then Reload: the Accessibility panel shows the tree with every button\'s name, and what the reader says as you Tab through.'
  ].join('\n\n'),
  prediction: {
    questions: [{
      id: 'hears',
      form: 'one',
      prompt: 'Tomás presses Tab until he is on the croissant\'s Add button: a `<button>` with only the basket icon in it, an `<svg aria-hidden="true">`. What does his screen reader say?',
      options: [
        { id: 'add', text: '“Add Butter croissant, button”: it works the name out from the row.', fact: { heard: 'focus: Add Butter croissant, button' } },
        { id: 'icon', text: '“Basket, button”: it reads the icon.', fact: { heard: 'focus: Basket, button' } },
        { id: 'button', text: '“Button”, and nothing else: the button has no name, only its role.', fact: { heard: 'focus: button' } },
        { id: 'skips', text: 'Nothing: Tab skips a button without a name.' }
      ],
      answer: 'button',
      rule: 'A button\'s name comes from its text, aria-label or aria-labelledby; an icon hidden with aria-hidden gives none, so a reader can only say what it is.'
    }]
  },
  sandbox: {
    page: SHOP_PAGE,
    open: 'app.js',
    web: a11ySpec([{ tabTo: add('croissant') }]),
    probes: [
      // the names, read before anything is pressed: each says its product
      { id: 'croissant', steps: [{ name: add('croissant'), has: 'Butter croissant' }] },
      { id: 'pain', steps: [{ name: add('pain-au-chocolat'), has: 'Pain au chocolat' }] },
      { id: 'bun', steps: [{ name: add('cinnamon-bun'), has: 'Cinnamon bun' }] },
      // and only its own product: one label naming them all says no more than "button"
      ...OTHERS.map(([id, other]) => ({ id: `${id}-not-${other.toLowerCase().replace(/ /g, '-')}`, steps: [{ name: add(id), has: other }] })),
      // still buttons, still on screen
      { id: 'role', steps: [{ role: add('croissant') }] },
      { id: 'shown', steps: [{ visible: add('croissant') }] },
      // what Tomás hears as he tabs on, and Enter still adds; so does a click
      { id: 'heard', steps: [{ tabTo: add('pain-au-chocolat') }, { heard: 'Pain au chocolat' }] },
      { id: 'enter', steps: [{ keyboard: 'Enter' }, { text: '#cart-count' }] },
      { id: 'mouse', steps: [{ click: add('cinnamon-bun') }, { text: '#cart-count' }] }
    ]
  },
  setup: () => ({
    files: a11ySite({ title: 'Menu', main: MAIN }, '', { 'app.js': APP }),
    observed: null,
    picked: null
  }),
  goals: [
    predictedGoal('Predict what Tomás hears', 1),
    probesGoal('names', 'Every Add button tells Tomás which product it adds, and still adds it with Enter or a click', { croissant: 1, pain: 1, bun: 1, ...Object.fromEntries(OTHERS.map(([id, other]) => [`${id}-not-${other.toLowerCase().replace(/ /g, '-')}`, 0])), role: 'button', shown: 'visible', heard: { atLeast: 1 }, enter: '1', mouse: '2' }, { clean: true })
  ],
  hints: [
    'Open the Accessibility panel: in the tree each Add is `button ""`, a button with an empty name. Where could a button get a name from, if not from what is in it?',
    'A button\'s name comes from its text, `aria-labelledby` or `aria-label`. The icon is `aria-hidden`, so it gives none, and "basket" wouldn\'t say which product anyway. Name each button after its product.',
    'On line 21 of `app.js`, give the button a name: `<button class="add icon-button" type="button" aria-label="Add ${product.name} to your basket">`. Save, then Reload.'
  ],
  debrief: {
    title: 'A name for every button',
    paragraphs: [
      'A screen reader says what a control is called and what it is: its accessible name and its role. The browser works the name out in a fixed order (the Accessible Name Computation): `aria-labelledby`, then `aria-label`, then what HTML gives (a label, an image\'s alt), then, for a button or a link, its content, and only then a `title`. Jonas\'s buttons held an icon hidden with `aria-hidden`, so every step came up empty: Tomás heard "button".',
      'The name should say which button it is: six buttons all called "Add to basket" tell him no more than "button". `aria-label="Add ${product.name} to your basket"` does it; so does text hidden on screen but not from readers (the `visually-hidden` class in style.css), or `aria-labelledby` pointing at the product\'s name. Text hidden with `hidden` or `display: none` is hidden from readers too, and `aria-describedby` gives a description, read after the role, never the name.',
      'A `title` does end up as the name when there is nothing else (Chrome reads it), but it shows as a tooltip only for a mouse, and voice control users can\'t see what to say. Give icon buttons a real name.'
    ]
  },
  solution: [
    { predict: 'button' },
    { save: 'app.js', replace: [ADD_BUTTON, '    <button class="add icon-button" type="button" aria-label="Add ${product.name} to your basket">${BASKET_ICON}</button>`'] },
    'reload'
  ]
}
