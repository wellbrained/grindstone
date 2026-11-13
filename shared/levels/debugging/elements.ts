// The Elements panel's data and view model (ADR 0007, chapter 3; docs/features/ui.md, "Elements"): the snapshot of the
// app's DOM the bridge sends (plain data: tag, attributes, a short text), the tree's rows and keyboard moves, and for the
// selected element the cascade as the panel shows it. The bridge says only which rules match the element and its
// ancestors (the browser decides that); which declaration wins, what is struck through, what is inherited and which
// variables are missing is worked out here from the level's own CSS (css.ts), so every line links to where it is
// written. Pure: the panel draws these, always as text.
import { compareSpecificity, isInherited, longhandsOf, parseDeclarations, specificity } from './css'
import type { CssCondition, CssDeclaration, CssRule, Specificity } from './css'
import type { SourceLine } from './types'

/** One element of the snapshot (in document order: a parent always comes before its children). */
export interface DomNode {
  id: number
  /** -1 for the root (`<html>`). */
  parent: number
  tag: string
  /** Name and value, as the page has them (long values cut). */
  attrs: [name: string, value: string][]
  /** Its own text (not its children's), whitespace collapsed and cut; null without any. */
  text: string | null
  /** It has a box on the page (false: display: none, or inside something that is). */
  shown: boolean
  /** Its content is wider or taller than its box (what scrolls or is cut off). */
  overflows: boolean
}

/** Which rule of the page matched, and through which selectors of its list (indexes). */
export interface InspectedMatch {
  rule: number
  selectors: number[]
}

/** The element or one of its ancestors: its style attribute and the rules that match it. */
export interface InspectedLevel {
  /** Its id in the snapshot (-1: not in it). */
  node: number
  label: string
  inline: string | null
  matches: InspectedMatch[]
}

/** top, right, bottom, left in CSS pixels. */
export type Sides = [top: number, right: number, bottom: number, left: number]

export interface BoxModel {
  /** The content box. */
  width: number
  height: number
  padding: Sides
  border: Sides
  margin: Sides
}

export interface ScrollSize {
  scrollWidth: number
  clientWidth: number
  scrollHeight: number
  clientHeight: number
}

/** What the bridge says about the selected element. */
export interface Inspected {
  node: number
  /** false: the element is no longer on the page (the snapshot is older than the page). */
  found: boolean
  /** The element first, then its ancestors up to `<html>`. */
  chain: InspectedLevel[]
  /** Declarations the browser does not accept (an unknown property, a value it can't read), by rule. */
  invalid: { rule: number, declarations: number[] }[]
  /** null without a box (display: none). */
  box: BoxModel | null
  /** The few computed values the chapter needs, by property. */
  computed: [property: string, value: string][]
  scroll: ScrollSize | null
}

/** The computed values the panel shows, in this order (the bridge reads exactly these). */
export const COMPUTED_PROPERTIES = [
  'display', 'visibility', 'opacity', 'position', 'z-index', 'pointer-events', 'color', 'background-color',
  'width', 'height', 'min-width', 'overflow', 'text-overflow', 'white-space'
] as const

/** The most elements a snapshot holds (a page that builds thousands must not freeze Grindstone). */
export const MAX_DOM_NODES = 600

// --- the tree --------------------------------------------------------------------------------------------------------

/** An element named like a selector: `button#order.order.big`. */
export function nodeLabel(node: Pick<DomNode, 'tag' | 'attrs'>): string {
  const id = node.attrs.find(([name]) => name === 'id')?.[1]
  const classes = node.attrs.find(([name]) => name === 'class')?.[1].split(/\s+/).filter(Boolean) ?? []
  return node.tag + (id ? `#${id}` : '') + classes.map(name => `.${name}`).join('')
}

/** Each element's children (ids, in order), by id. */
function childrenOf(nodes: readonly DomNode[]): Map<number, number[]> {
  const children = new Map<number, number[]>()
  for (const node of nodes) {
    const list = children.get(node.parent)
    if (list) list.push(node.id)
    else children.set(node.parent, [node.id])
  }
  return children
}

const byId = (nodes: readonly DomNode[]) => new Map(nodes.map(node => [node.id, node]))

/** What the tree has open at first: `<html>`, `<body>` and the elements in it (the head stays closed). */
export function startExpanded(nodes: readonly DomNode[]): Set<number> {
  const children = childrenOf(nodes)
  const open = new Set<number>()
  const root = children.get(-1)?.[0]
  if (root === undefined) return open
  open.add(root)
  const body = (children.get(root) ?? []).find(id => byId(nodes).get(id)?.tag === 'body')
  if (body === undefined) return open
  open.add(body)
  for (const id of children.get(body) ?? []) if (children.has(id)) open.add(id)
  return open
}

/** One visible row of the tree. */
export interface TreeRow {
  node: DomNode
  depth: number
  hasChildren: boolean
  expanded: boolean
}

/** The rows the tree shows with these elements open, in document order. */
export function treeRows(nodes: readonly DomNode[], expanded: ReadonlySet<number>): TreeRow[] {
  const children = childrenOf(nodes)
  const nodeOf = byId(nodes)
  const rows: TreeRow[] = []
  const walk = (ids: readonly number[], depth: number) => {
    for (const id of ids) {
      const node = nodeOf.get(id)!
      const kids = children.get(id) ?? []
      const open = expanded.has(id) && kids.length > 0
      rows.push({ node, depth, hasChildren: kids.length > 0, expanded: open })
      if (open) walk(kids, depth + 1)
    }
  }
  walk(children.get(-1) ?? [], 0)
  return rows
}

/** These open elements plus every ancestor of `id` (so a picked element shows in the tree). */
export function withAncestors(nodes: readonly DomNode[], id: number, expanded: ReadonlySet<number>): Set<number> {
  const nodeOf = byId(nodes)
  const open = new Set(expanded)
  for (let parent = nodeOf.get(id)?.parent ?? -1; parent >= 0; parent = nodeOf.get(parent)?.parent ?? -1) open.add(parent)
  return open
}

/** Where an element sits: the index among its parent's children at each step from the root; null when it is not there. */
export function nodePath(nodes: readonly DomNode[], id: number): number[] | null {
  const nodeOf = byId(nodes)
  const children = childrenOf(nodes)
  const path: number[] = []
  for (let node = nodeOf.get(id); node; node = nodeOf.get(node.parent)) {
    if (node.parent < 0) return path
    path.unshift(children.get(node.parent)!.indexOf(node.id))
  }
  return null
}

/** The element at that place in a (newer) snapshot, or null. */
export function nodeAtPath(nodes: readonly DomNode[], path: readonly number[]): number | null {
  const children = childrenOf(nodes)
  let id = children.get(-1)?.[0]
  for (const index of path) {
    if (id === undefined) return null
    id = children.get(id)?.[index]
  }
  return id ?? null
}

/** What a key does in the tree: select another row, or open or close one. */
export type TreeMove = { select: number } | { expand: number } | { collapse: number }

/** The tree's keys (WAI-ARIA tree): Up and Down, Home and End move; Right opens or goes in; Left closes or goes out. */
export function treeMove(rows: readonly TreeRow[], current: number | null, key: string): TreeMove | null {
  if (!rows.length) return null
  const index = rows.findIndex(row => row.node.id === current)
  if (index < 0) return ['ArrowDown', 'ArrowUp', 'Home', 'End', 'ArrowRight', 'ArrowLeft'].includes(key) ? { select: rows[0]!.node.id } : null
  const row = rows[index]!
  switch (key) {
    case 'ArrowDown': return { select: rows[Math.min(index + 1, rows.length - 1)]!.node.id }
    case 'ArrowUp': return { select: rows[Math.max(index - 1, 0)]!.node.id }
    case 'Home': return { select: rows[0]!.node.id }
    case 'End': return { select: rows.at(-1)!.node.id }
    case 'ArrowRight':
      if (!row.hasChildren) return null
      return row.expanded ? { select: rows[index + 1]!.node.id } : { expand: row.node.id }
    case 'ArrowLeft':
      if (row.expanded) return { collapse: row.node.id }
      return row.node.parent >= 0 && rows.some(each => each.node.id === row.node.parent) ? { select: row.node.parent } : null
    default:
      return null
  }
}

/** A size in the box diagram, like the browser's: a dash for 0, at most two decimals. */
export function boxNumber(value: number): string {
  if (value === 0) return '–'
  return String(Math.round(value * 100) / 100)
}

// --- the cascade -----------------------------------------------------------------------------------------------------

export type DeclarationStatus = 'active' | 'overridden' | 'invalid'

export interface DeclarationView extends CssDeclaration {
  /** Where it is written; null in a style attribute. */
  source: SourceLine | null
  /** active: it wins (for at least one thing it sets); overridden: something wins over it (struck through); invalid: the browser drops it. */
  status: DeclarationStatus
  /** Custom properties it uses (`var(--brown)`, without a fallback) that nothing on the element or above it defines. */
  missing: string[]
}

export interface RuleView {
  origin: 'inline' | 'rule'
  /** The selector list, or `element.style` for the style attribute. */
  selector: string
  /** Each selector of the list, and whether it is one that matched (the others are dimmed). */
  selectors: { text: string, matched: boolean }[]
  /** Where the rule starts; null for the style attribute. */
  source: SourceLine | null
  conditions: { kind: CssCondition['kind'], text: string, source: SourceLine }[]
  /** Of its most specific matching selector; null for the style attribute. */
  specificity: Specificity | null
  declarations: DeclarationView[]
}

export interface InheritedView {
  node: number
  label: string
  rules: RuleView[]
}

export interface ElementStyles {
  /** The style attribute first, then the matching rules from the one that wins to the one that loses. */
  rules: RuleView[]
  /** Ancestors that pass something down (only what they pass down), nearest first. */
  inherited: InheritedView[]
}

/** The cascade order of a declaration: !important, then the style attribute, then specificity, then order. */
type Rank = [important: number, inline: number, ids: number, classes: number, types: number, order: number, index: number]

const beats = (a: Rank, b: Rank) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! > b[i]!
  return false
}

interface Candidate {
  view: DeclarationView
  rank: Rank
  longhands: string[]
}

const VARIABLE = /var\(\s*(--[\w-]+)\s*\)/g

/** The panel's view of the cascade on the inspected element, from the page's rules and what the bridge saw match. */
export function elementStyles(rules: readonly CssRule[], inspected: Inspected): ElementStyles {
  const invalid = new Map(inspected.invalid.map(entry => [entry.rule, new Set(entry.declarations)]))
  const levels = inspected.chain.map((level, depth) => {
    const views: { view: RuleView, order: number }[] = []
    const candidates: Candidate[] = []
    const keep = (property: string) => depth === 0 || isInherited(property)
    if (level.inline?.trim()) {
      const declarations = parseDeclarations(level.inline, null).filter(each => keep(each.property)).map((each): DeclarationView => ({ ...each, source: null, status: 'active', missing: [] }))
      declarations.forEach((view, index) => candidates.push({ view, rank: [view.important ? 1 : 0, 1, 0, 0, 0, Number.MAX_SAFE_INTEGER, index], longhands: longhandsOf(view.property) }))
      if (declarations.length) views.push({ view: { origin: 'inline', selector: 'element.style', selectors: [], source: null, conditions: [], specificity: null, declarations }, order: Number.MAX_SAFE_INTEGER })
    }
    for (const match of level.matches) {
      const rule = rules[match.rule]
      const matched = match.selectors.filter(index => rule?.selectors[index] !== undefined)
      if (!rule || !matched.length) continue
      const best = matched.map(index => specificity(rule.selectors[index]!)).reduce((a, b) => compareSpecificity(b, a) > 0 ? b : a)
      const dropped = invalid.get(match.rule)
      const declarations: DeclarationView[] = []
      rule.declarations.forEach((declaration, index) => {
        if (!keep(declaration.property)) return
        const view: DeclarationView = {
          ...declaration,
          source: declaration.line === null ? null : { path: rule.path, line: declaration.line },
          status: dropped?.has(index) ? 'invalid' : 'active',
          missing: []
        }
        declarations.push(view)
        if (view.status !== 'invalid') candidates.push({ view, rank: [view.important ? 1 : 0, 0, ...best, match.rule, index], longhands: longhandsOf(view.property) })
      })
      if (!declarations.length) continue
      views.push({
        view: {
          origin: 'rule',
          selector: rule.selector,
          selectors: rule.selectors.map((text, index) => ({ text, matched: matched.includes(index) })),
          source: { path: rule.path, line: rule.line },
          conditions: rule.conditions.map(condition => ({ kind: condition.kind, text: condition.text, source: { path: condition.path ?? rule.path, line: condition.line } })),
          specificity: best,
          declarations
        },
        order: match.rule
      })
    }
    // the list: the style attribute, then the most specific and latest first
    views.sort((a, b) => {
      if (a.view.origin !== b.view.origin) return a.view.origin === 'inline' ? -1 : 1
      return compareSpecificity(b.view.specificity!, a.view.specificity!) || b.order - a.order
    })
    return { level, views: views.map(each => each.view), candidates }
  })

  // who wins each property on each level; a nearer level always wins over an inherited one
  const claimed = new Set<string>()
  for (const { candidates } of levels) {
    const winners = new Map<string, Candidate>()
    for (const candidate of candidates) {
      for (const longhand of candidate.longhands) {
        const winner = winners.get(longhand)
        if (!winner || beats(candidate.rank, winner.rank)) winners.set(longhand, candidate)
      }
    }
    for (const candidate of candidates) {
      const wins = candidate.longhands.some(longhand => winners.get(longhand) === candidate && !claimed.has(longhand))
      candidate.view.status = wins ? 'active' : 'overridden'
    }
    for (const longhand of winners.keys()) claimed.add(longhand)
  }

  // variables: defined anywhere on the element or above it (custom properties are inherited)
  const defined = new Set(levels.flatMap(({ candidates }) => candidates.map(each => each.view.property).filter(property => property.startsWith('--'))))
  for (const { candidates } of levels) {
    for (const { view } of candidates) view.missing = [...new Set([...view.value.matchAll(VARIABLE)].map(match => match[1]!))].filter(name => !defined.has(name))
  }

  const [own, ...ancestors] = levels
  return {
    rules: own?.views ?? [],
    inherited: ancestors.filter(entry => entry.views.length).map(entry => ({ node: entry.level.node, label: entry.level.label, rules: entry.views }))
  }
}
