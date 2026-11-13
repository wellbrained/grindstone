// Elements & CSS 3.1: Ben moved the shop's colours into variables, and the Order button's rule asks for one that does
// not exist (`var(--brown)`). Its background falls back to transparent while its text keeps the paper colour: white on
// white, still there, still clickable. Learn: pick an element, read the rules that apply, the variables and the computed
// colours, and that the Elements panel flags a variable nobody defines.
import { ORDER_PAGE } from './bakery'
import { probeAtLeast, probeGoal } from './checks'
import { STOREFRONT_STYLE, lineOf, storefront, swap } from './storefront'
import type { DebugScenario } from './types'

const STYLE = swap(STOREFRONT_STYLE, '  padding: 8px 20px;\n  background: var(--brand);', '  padding: 8px 20px;\n  background: var(--brown);')
const BROWN = lineOf(STYLE, 'var(--brown)')
const ORDER_RULE = lineOf(STYLE, '.order {')

/** The shop's brown (`--brand`) as the browser computes it. */
export const BRAND_RGB = 'rgb(122, 62, 18)'

export const invisibleOrder: DebugScenario = {
  id: 'debugging-11-invisible-order',
  track: 'debugging',
  kind: 'scenario',
  title: 'The Order button is invisible',
  difficulty: 1,
  minutes: 5,
  teaches: 'var()',
  story: [
    'Maya writes: “Customers say the Order button is gone. One of them found it by clicking around under the total, so it is there. You just can\'t see it!”',
    'Ben moved the shop\'s colours into variables yesterday (the `:root` rule at the top of `style.css`). Select the Order button in the Elements panel (Pick, then click under the total), read its styles and computed colours, fix the CSS, then Save and Reload.'
  ].join('\n\n'),
  sandbox: {
    page: ORDER_PAGE,
    open: 'style.css',
    elements: true,
    probes: [
      { id: 'order-contrast', steps: [{ contrast: '#order' }] },
      { id: 'order-background', steps: [{ style: '#order', property: 'background-color' }] }
    ]
  },
  setup: () => ({ files: storefront({ style: STYLE }), observed: null, picked: null }),
  goals: [
    probeAtLeast('readable', 'The Order button\'s text stands out from its background (contrast at least 4.5 : 1)', 'order-contrast', 4.5),
    probeGoal('brown', `The Order button has the shop's brown again, like the Add buttons (\`${BRAND_RGB}\`)`, 'order-background', BRAND_RGB)
  ],
  hints: [
    'In the Elements panel, click Pick, then the empty space under the total: the invisible button gets selected. What does Computed say about its `background-color` and `color`?',
    `Its background is transparent and its text has the page's own paper colour: white on white. Its rule, \`.order\` (\`style.css:${ORDER_RULE}\`), asks for \`var(--brown)\`, and the panel marks that variable as not defined. Which colour variables does \`:root\` really have?`,
    `In \`style.css\`, line ${BROWN} says \`background: var(--brown);\`, but the shop's brown is called \`--brand\` (line 3). Change it to \`background: var(--brand);\`, Save, then Reload.`
  ],
  debrief: {
    title: 'A variable that does not exist',
    paragraphs: [
      '`var(--brown)` asks for a custom property nobody defined. The browser reports that nowhere: the declaration is "invalid at computed-value time", so `background` falls back to its starting value, transparent. The text kept its colour, `var(--paper)`, the page\'s own background. White on white.',
      'The Elements panel showed the whole chain: the rule that applied, the variable it used (marked as not defined), the inherited `:root` rule with the real names, and the computed values that came out of it all. Computed is what the page really gets; the rules show how it got there.',
      'Invisible is not gone: the button kept its box, so Pick could select it and a lucky click still ordered. Checking the contrast (at least 4.5 : 1 for normal text) catches this kind of bug before customers do.'
    ]
  },
  solution: [{ save: 'style.css', replace: ['background: var(--brown);', 'background: var(--brand);'] }, 'reload']
}
