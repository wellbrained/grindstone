import { describe, expect, it } from 'vitest'
import { cssRules } from '../../../../shared/levels/debugging/css'
import { boxNumber, elementStyles, nodeAtPath, nodeLabel, nodePath, startExpanded, treeMove, treeRows, withAncestors } from '../../../../shared/levels/debugging/elements'
import type { DomNode, Inspected, InspectedLevel } from '../../../../shared/levels/debugging/elements'

// The Elements panel's view model (docs/features/ui.md, "Elements"): the DOM tree as rows with the keyboard moves of a
// tree, and for the selected element the cascade: the rules that match in the order the panel lists them, which
// declarations lose (struck through), which are invalid, what is inherited and from where, variables that are not defined.

const node = (id: number, parent: number, tag: string, attrs: [string, string][] = [], extra: Partial<DomNode> = {}): DomNode =>
  ({ id, parent, tag, attrs, text: null, shown: true, overflows: false, ...extra })

// <html><head><title/></head><body><header><h1/></header><main><ul><li/><li/></ul><button/></main></body></html>
const NODES: DomNode[] = [
  node(0, -1, 'html', [['lang', 'en']]),
  node(1, 0, 'head', [], { shown: false }),
  node(2, 1, 'title', [], { shown: false, text: 'Corner Bakery' }),
  node(3, 0, 'body'),
  node(4, 3, 'header', [['class', 'top']]),
  node(5, 4, 'h1', [], { text: 'Corner Bakery' }),
  node(6, 3, 'main'),
  node(7, 6, 'ul', [['id', 'products'], ['class', 'products list']]),
  node(8, 7, 'li', [['class', 'product']]),
  node(9, 7, 'li', [['class', 'product']]),
  node(10, 6, 'button', [['id', 'order'], ['class', 'order'], ['type', 'button']], { text: 'Order' })
]

describe('the DOM tree', () => {
  it('names an element like a selector', () => {
    expect(nodeLabel(NODES[7]!)).toBe('ul#products.products.list')
    expect(nodeLabel(NODES[3]!)).toBe('body')
  })

  it('starts with html, body and what is in body open, the head closed', () => {
    expect([...startExpanded(NODES)].sort((a, b) => a - b)).toEqual([0, 3, 4, 6])
  })

  it('lists the open part of the tree as rows', () => {
    const rows = treeRows(NODES, new Set([0, 3, 6]))
    expect(rows.map(row => [row.node.id, row.depth, row.hasChildren, row.expanded])).toEqual([
      [0, 0, true, true],
      [1, 1, true, false],
      [3, 1, true, true],
      [4, 2, true, false],
      [6, 2, true, true],
      [7, 3, true, false],
      [10, 3, false, false]
    ])
  })

  it('opens the way to an element', () => {
    expect([...withAncestors(NODES, 9, new Set([0]))].sort((a, b) => a - b)).toEqual([0, 3, 6, 7])
  })

  it('finds the same element again in a new snapshot by its place in the tree', () => {
    expect(nodePath(NODES, 10)).toEqual([1, 1, 1])
    expect(nodePath(NODES, 0)).toEqual([])
    expect(nodeAtPath(NODES, [1, 1, 1])).toBe(10)
    expect(nodeAtPath(NODES, [1, 1, 0, 1])).toBe(9)
    expect(nodeAtPath(NODES, [1, 5])).toBeNull()
    expect(nodeAtPath([], [])).toBeNull()
  })

  it('moves like a tree: up and down the rows, right opens or goes in, left closes or goes out', () => {
    const rows = treeRows(NODES, new Set([0, 3, 6]))
    expect(treeMove(rows, null, 'ArrowDown')).toEqual({ select: 0 })
    expect(treeMove(rows, 4, 'ArrowDown')).toEqual({ select: 6 })
    expect(treeMove(rows, 4, 'ArrowUp')).toEqual({ select: 3 })
    expect(treeMove(rows, 0, 'ArrowUp')).toEqual({ select: 0 })
    expect(treeMove(rows, 4, 'ArrowRight')).toEqual({ expand: 4 })
    expect(treeMove(rows, 6, 'ArrowRight')).toEqual({ select: 7 })
    expect(treeMove(rows, 10, 'ArrowRight')).toBeNull()
    expect(treeMove(rows, 6, 'ArrowLeft')).toEqual({ collapse: 6 })
    expect(treeMove(rows, 10, 'ArrowLeft')).toEqual({ select: 6 })
    expect(treeMove(rows, 0, 'ArrowLeft')).toEqual({ collapse: 0 })
    expect(treeMove(rows, 7, 'Home')).toEqual({ select: 0 })
    expect(treeMove(rows, 7, 'End')).toEqual({ select: 10 })
    expect(treeMove(rows, 7, 'a')).toBeNull()
  })

  it('writes box sizes like the browser: a dash for 0, at most two decimals', () => {
    expect(boxNumber(0)).toBe('–')
    expect(boxNumber(12)).toBe('12')
    expect(boxNumber(12.3456)).toBe('12.35')
    expect(boxNumber(-4)).toBe('-4')
  })
})

describe('the cascade of an element', () => {
  const files = {
    'index.html': '<!doctype html>\n<html lang="en">\n<head>\n<link rel="stylesheet" href="style.css">\n</head>\n</html>\n',
    'style.css': [
      ':root { --brand: #7a3e12; --paper: #fffaf3; }', // 1
      'body { color: #2a2118; margin: 0; font: 15px/1.5 system-ui; }', // 2
      '.summary { color: var(--paper); background: var(--brand); padding: 8px; }', // 3
      '.order { background: var(--brown); color: var(--paper); }', // 4
      '#summary .order { padding: 4px 8px; colr: red; }', // 5
      '.order { background-color: white; padding: 0 !important; }', // 6
      '@media (max-width: 600px) {', // 7
      '  .summary .order, .nope { display: none; }', // 8
      '}' // 9
    ].join('\n')
  }
  const rules = cssRules(files)
  const level = (nodeId: number, label: string, matches: InspectedLevel['matches'], inline: string | null = null): InspectedLevel => ({ node: nodeId, label, inline, matches })
  const inspected: Inspected = {
    node: 10,
    found: true,
    chain: [
      level(10, 'button#order.order', [{ rule: 3, selectors: [0] }, { rule: 4, selectors: [0] }, { rule: 5, selectors: [0] }, { rule: 6, selectors: [0] }], 'color: black; margin: 2px'),
      level(6, 'section#summary.summary', [{ rule: 2, selectors: [0] }]),
      level(3, 'body', [{ rule: 1, selectors: [0] }]),
      level(0, 'html', [{ rule: 0, selectors: [0] }])
    ],
    invalid: [{ rule: 4, declarations: [1] }],
    box: { width: 80, height: 20, padding: [0, 0, 0, 0], border: [0, 0, 0, 0], margin: [2, 2, 2, 2] },
    computed: [['display', 'none']],
    scroll: { scrollWidth: 0, clientWidth: 0, scrollHeight: 0, clientHeight: 0 }
  }
  const styles = elementStyles(rules, inspected)
  const summary = (view: typeof styles.rules) => view.map(rule => [
    rule.selector,
    rule.source && `${rule.source.path}:${rule.source.line}`,
    rule.declarations.map(d => `${d.property}: ${d.value}${d.important ? ' !important' : ''} [${d.status}]`)
  ])

  it('lists the style attribute first, then the matching rules from the most specific and latest', () => {
    expect(summary(styles.rules)).toEqual([
      ['element.style', null, ['color: black [active]', 'margin: 2px [active]']],
      ['#summary .order', 'style.css:5', ['padding: 4px 8px [overridden]', 'colr: red [invalid]']],
      ['.summary .order, .nope', 'style.css:8', ['display: none [active]']],
      ['.order', 'style.css:6', ['background-color: white [active]', 'padding: 0 !important [active]']],
      ['.order', 'style.css:4', ['background: var(--brown) [active]', 'color: var(--paper) [overridden]']]
    ])
  })

  it('says where each rule, declaration and media condition is written, and which selectors of a list matched', () => {
    const media = styles.rules[2]!
    expect(media.conditions).toEqual([{ kind: 'media', text: '(max-width: 600px)', source: { path: 'style.css', line: 7 } }])
    expect(media.selectors).toEqual([{ text: '.summary .order', matched: true }, { text: '.nope', matched: false }])
    expect(media.specificity).toEqual([0, 2, 0])
    expect(styles.rules[0]).toMatchObject({ origin: 'inline', source: null, specificity: null })
    expect(styles.rules[1]!.declarations[0]!.source).toEqual({ path: 'style.css', line: 5 })
  })

  it('strikes a shorthand only when everything it sets is set by a winner', () => {
    // background (line 4) still sets the image and the rest; only its colour lost to background-color (line 6)
    expect(styles.rules.at(-1)!.declarations[0]!.status).toBe('active')
  })

  it('flags variables that nothing defines', () => {
    expect(styles.rules.at(-1)!.declarations.map(d => d.missing)).toEqual([['--brown'], []])
  })

  it('lists inherited declarations by the ancestor they come from, struck through when something nearer sets them', () => {
    expect(styles.inherited.map(entry => [entry.label, summary(entry.rules)])).toEqual([
      ['section#summary.summary', [['.summary', 'style.css:3', ['color: var(--paper) [overridden]']]]],
      ['body', [['body', 'style.css:2', ['color: #2a2118 [overridden]', 'font: 15px/1.5 system-ui [active]']]]],
      ['html', [[':root', 'style.css:1', ['--brand: #7a3e12 [active]', '--paper: #fffaf3 [active]']]]]
    ])
  })

  it('lets !important beat a more specific rule and the style attribute beat any rule', () => {
    const own = elementStyles(rules, { ...inspected, chain: [inspected.chain[0]!] })
    expect(own.rules[1]!.declarations[0]!.status).toBe('overridden')
    expect(own.rules[3]!.declarations[1]!.status).toBe('active')
    expect(own.rules[0]!.declarations[0]!.status).toBe('active')
    expect(own.inherited).toEqual([])
  })

  it('ignores matches the rules do not have (an older load) and leaves out ancestors that pass nothing down', () => {
    const odd = elementStyles(rules, {
      ...inspected,
      // the section matches a rule, but nothing of it is inherited (padding, an unknown property)
      chain: [level(10, 'button', [{ rule: 99, selectors: [0] }, { rule: 3, selectors: [7] }]), level(6, 'section', [{ rule: 4, selectors: [0] }])]
    })
    expect(odd).toEqual({ rules: [], inherited: [] })
  })
})
