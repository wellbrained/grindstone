// CodeMirror 6 for the editor tabs and the editor panel (docs/adr/0004-editor-layouts.md, docs/features/ui.md).
// Only imported by CodeEditor.vue, which is loaded lazily, so CodeMirror stays out of the first page load.
// Colours come from the app's CSS tokens (main.css), so one theme serves dark and light.
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { HighlightStyle, StreamLanguage, bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState, RangeSet, StateEffect, StateField } from '@codemirror/state'
import type { Extension, Range } from '@codemirror/state'
import {
  Decoration, EditorView, GutterMarker, WidgetType, drawSelection, gutterLineClass, highlightActiveLine, highlightActiveLineGutter, keymap,
  lineNumbers
} from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { Tag, tags } from '@lezer/highlight'
import { conflictReplacement, parseConflicts } from '~/utils/conflicts'
import type { ConflictChoice } from '~/utils/conflicts'

/** Texts the editor shows, from i18n. */
export interface EditorLabels {
  acceptCurrent: string
  acceptIncoming: string
  acceptBoth: string
  /** Accessible names of the three actions, with the block number filled in by the caller's function. */
  actionLabel: (choice: ConflictChoice, block: number) => string
  currentChange: string
  incomingChange: string
  /** The accessible name of the editor itself. */
  editorLabel: (path: string) => string
}

export interface CodeEditorOptions {
  parent: HTMLElement
  path: string
  doc: string
  labels: EditorLabels
  onChange: (doc: string) => void
  onSave: () => void
  /** Read-only: the text can be read, selected and navigated, not changed (Debugging's find tasks). */
  readOnly?: boolean
  /** Lines are answers (find tasks): a click on a line or its number, or Enter on the cursor's line, picks it. */
  onPickLine?: (line: number) => void
}

/** How a marked line is tinted: opened from a trace (error), a right answer (success), a wrong one (warning). */
export type LineTone = 'error' | 'success' | 'warning'

export interface CodeEditorHandle {
  /** Shows `path` with `doc`: the same file gets the new text, another file gets its own state (undo history, cursor). */
  show: (path: string, doc: string) => void
  /** Marks a line of the current file (1-based), scrolls it into view and puts the cursor there; null clears the mark. */
  mark: (line: number | null, tone?: LineTone) => void
  /** Drops the remembered state of a closed tab. */
  forget: (path: string) => void
  focus: () => void
  destroy: () => void
}

const tint = (token: string, percent: number) => `color-mix(in oklab, var(${token}) ${percent}%, transparent)`

const theme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--ui-text)',
    backgroundColor: 'var(--app-terminal)',
    fontSize: '13px'
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
  '.cm-content': { caretColor: 'var(--ui-primary)', padding: '6px 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ui-primary)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: tint('--ui-primary', 28)
  },
  '.cm-gutters': {
    backgroundColor: 'var(--app-terminal)',
    color: 'var(--ui-text-dimmed)',
    borderRight: '1px solid var(--app-terminal-border)'
  },
  '.cm-activeLine': { backgroundColor: tint('--ui-text', 5) },
  '.cm-activeLineGutter': { backgroundColor: tint('--ui-text', 7), color: 'var(--ui-text-highlighted)' },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: tint('--ui-primary', 22), outline: 'none' },
  // conflict blocks: current (ours) and incoming (theirs) in two tints, the marker lines a little stronger
  '.cm-conflict-current': { backgroundColor: 'var(--app-conflict-current)' },
  '.cm-conflict-incoming': { backgroundColor: 'var(--app-conflict-incoming)' },
  '.cm-conflict-base': { backgroundColor: tint('--ui-text', 6) },
  '.cm-conflict-marker-current': { backgroundColor: 'var(--app-conflict-current-strong)' },
  '.cm-conflict-marker-incoming': { backgroundColor: 'var(--app-conflict-incoming-strong)' },
  '.cm-conflict-marker': { color: 'var(--ui-text-muted)' },
  '.cm-conflict-tag': { color: 'var(--ui-text-muted)', fontFamily: 'var(--font-sans)', fontSize: '11px', paddingLeft: '8px' },
  '.cm-conflict-actions': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '2px 4px',
    padding: '2px 6px',
    fontFamily: 'var(--font-sans)',
    fontSize: '12px',
    color: 'var(--ui-text-dimmed)'
  },
  '.cm-conflict-actions button': {
    color: 'var(--ui-text-muted)',
    background: 'none',
    border: 'none',
    borderRadius: '4px',
    padding: '1px 4px',
    cursor: 'pointer',
    font: 'inherit'
  },
  '.cm-conflict-actions button:hover': { color: 'var(--ui-primary)', textDecoration: 'underline' },
  '.cm-conflict-actions button:focus-visible': { outline: '2px solid var(--ui-primary)', outlineOffset: '1px' },
  // a line opened from a stack trace, or a find task's answer: a tint and a bar on its left edge, like the browser's
  '.cm-mark-error': { backgroundColor: tint('--ui-error', 14), boxShadow: 'inset 2px 0 var(--ui-error)' },
  '.cm-mark-success': { backgroundColor: tint('--ui-success', 16), boxShadow: 'inset 2px 0 var(--ui-success)' },
  '.cm-mark-warning': { backgroundColor: tint('--ui-warning', 16), boxShadow: 'inset 2px 0 var(--ui-warning)' },
  '.cm-gutterElement.cm-mark-error': { color: 'var(--ui-error)' },
  '.cm-gutterElement.cm-mark-success': { color: 'var(--ui-success)' },
  '.cm-gutterElement.cm-mark-warning': { color: 'var(--ui-warning)' },
  // find tasks: every line is an answer you can click
  '&.cm-pickable .cm-line, &.cm-pickable .cm-lineNumbers .cm-gutterElement': { cursor: 'pointer' },
  '&.cm-pickable .cm-line:hover': { backgroundColor: tint('--ui-primary', 10) }
})

/** Commit ids in a rebase todo list. */
const commitHash = Tag.define()

const highlight = HighlightStyle.define([
  { tag: commitHash, color: 'var(--ui-info)' },
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.operatorKeyword], color: 'var(--ui-secondary)' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--ui-success)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--ui-warning)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--ui-text-dimmed)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--ui-info)' },
  { tag: [tags.typeName, tags.className], color: 'var(--ui-warning)' },
  { tag: [tags.propertyName], color: 'var(--ui-text-toned)' },
  { tag: tags.heading, color: 'var(--ui-primary)', fontWeight: '600' },
  { tag: tags.link, color: 'var(--ui-info)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--ui-info)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.monospace, color: 'var(--ui-text-toned)' },
  { tag: tags.invalid, color: 'var(--ui-error)' }
])

type LanguageKind = 'javascript' | 'typescript' | 'json' | 'markdown' | 'html' | 'css' | null

// The files git opens in the editor during `git rebase -i` (shared/git/commands/rebase.ts): small stream languages, no chunk.
const TODO_COMMANDS = /^(?:pick|p|reword|r|edit|e|squash|s|fixup|f|exec|x|break|b|drop|d|label|l|reset|t|merge|m|noop|update-ref|u)(?=\s|$)/

/** The todo list: the command word, then the commit id, then the subject (ignored by git); # lines are comments. */
const rebaseTodo = StreamLanguage.define<{ word: number }>({
  name: 'git-rebase-todo',
  startState: () => ({ word: 0 }),
  token(stream, state) {
    if (stream.sol()) {
      state.word = 0
      if (stream.match(/^\s*#.*/)) return 'comment'
    }
    if (stream.eatSpace()) return null
    state.word++
    if (state.word === 1) {
      if (stream.match(TODO_COMMANDS)) return 'keyword'
      stream.match(/^\S+/)
      return 'invalid'
    }
    if (state.word === 2 && stream.match(/^[0-9a-f]{4,40}(?=\s|$)/)) return 'hash'
    stream.skipToEnd()
    return null
  },
  tokenTable: { hash: commitHash },
  languageData: { commentTokens: { line: '#' } }
})

/** A commit message: lines starting with # are comments git drops. */
const commitMessage = StreamLanguage.define<null>({
  name: 'git-commit-message',
  startState: () => null,
  token(stream) {
    if (stream.sol() && stream.peek() === '#') {
      stream.skipToEnd()
      return 'comment'
    }
    stream.skipToEnd()
    return null
  }
})

/** Languages that need no chunk of their own. */
function builtInLanguage(path: string): Extension | null {
  if (path.endsWith('git-rebase-todo')) return rebaseTodo
  if (path.endsWith('COMMIT_EDITMSG')) return commitMessage
  return null
}

function languageOf(path: string): LanguageKind {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  if (['js', 'mjs', 'cjs', 'jsx'].includes(extension)) return 'javascript'
  if (['ts', 'mts', 'cts', 'tsx'].includes(extension)) return 'typescript'
  if (extension === 'json') return 'json'
  if (['md', 'markdown'].includes(extension)) return 'markdown'
  if (['html', 'htm'].includes(extension)) return 'html'
  if (extension === 'css') return 'css'
  return null
}

// each language is its own chunk, loaded the first time a file of that kind is opened
const languageCache = new Map<Exclude<LanguageKind, null>, Extension>()
async function loadLanguage(kind: Exclude<LanguageKind, null>): Promise<Extension> {
  const cached = languageCache.get(kind)
  if (cached) return cached
  let extension: Extension
  if (kind === 'json') extension = (await import('@codemirror/lang-json')).json()
  else if (kind === 'markdown') extension = (await import('@codemirror/lang-markdown')).markdown()
  else if (kind === 'html') extension = (await import('@codemirror/lang-html')).html({ autoCloseTags: false })
  else if (kind === 'css') extension = (await import('@codemirror/lang-css')).css()
  else extension = (await import('@codemirror/lang-javascript')).javascript({ typescript: kind === 'typescript', jsx: true })
  languageCache.set(kind, extension)
  return extension
}

class ConflictActions extends WidgetType {
  constructor(readonly index: number, readonly labels: EditorLabels) {
    super()
  }

  override eq(other: ConflictActions) {
    return other.index === this.index
  }

  override toDOM(view: EditorView) {
    const bar = document.createElement('div')
    bar.className = 'cm-conflict-actions'
    const choices: [ConflictChoice, string][] = [
      ['current', this.labels.acceptCurrent],
      ['incoming', this.labels.acceptIncoming],
      ['both', this.labels.acceptBoth]
    ]
    choices.forEach(([choice, text], position) => {
      if (position > 0) {
        const dot = document.createElement('span')
        dot.textContent = '·'
        dot.setAttribute('aria-hidden', 'true')
        bar.append(dot)
      }
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = text
      button.dataset.conflictAction = choice
      button.setAttribute('aria-label', this.labels.actionLabel(choice, this.index + 1))
      button.addEventListener('click', () => {
        const text = view.state.doc.toString()
        const block = parseConflicts(text)[this.index]
        if (!block) return
        const insert = conflictReplacement(text, block, choice)
        view.dispatch({
          changes: { from: block.from, to: block.to, insert },
          selection: { anchor: block.from + insert.length },
          userEvent: 'input.conflict',
          scrollIntoView: true
        })
        view.focus()
      })
      bar.append(button)
    })
    return bar
  }

  // the buttons handle their own clicks and keys; the editor leaves them alone
  override ignoreEvent() {
    return true
  }
}

class ConflictTag extends WidgetType {
  constructor(readonly text: string) {
    super()
  }

  override eq(other: ConflictTag) {
    return other.text === this.text
  }

  override toDOM() {
    const tag = document.createElement('span')
    tag.className = 'cm-conflict-tag'
    tag.textContent = this.text
    return tag
  }
}

function conflictDecorations(state: EditorState, labels: EditorLabels): DecorationSet {
  const { doc } = state
  const ranges: Range<Decoration>[] = []
  const lineClass = (line: number, className: string) => {
    ranges.push(Decoration.line({ class: className }).range(doc.line(line + 1).from))
  }
  parseConflicts(doc.toString()).forEach((block, index) => {
    ranges.push(Decoration.widget({ widget: new ConflictActions(index, labels), side: -1, block: true }).range(block.from))
    lineClass(block.startLine, 'cm-conflict-marker cm-conflict-marker-current')
    ranges.push(Decoration.widget({ widget: new ConflictTag(labels.currentChange), side: 1 }).range(doc.line(block.startLine + 1).to))
    const oursEnd = block.baseLine ?? block.separatorLine
    for (let line = block.startLine + 1; line < oursEnd; line++) lineClass(line, 'cm-conflict-current')
    if (block.baseLine !== null) {
      for (let line = block.baseLine; line < block.separatorLine; line++) lineClass(line, line === block.baseLine ? 'cm-conflict-marker cm-conflict-base' : 'cm-conflict-base')
    }
    lineClass(block.separatorLine, 'cm-conflict-marker')
    for (let line = block.separatorLine + 1; line < block.endLine; line++) lineClass(line, 'cm-conflict-incoming')
    lineClass(block.endLine, 'cm-conflict-marker cm-conflict-marker-incoming')
    ranges.push(Decoration.widget({ widget: new ConflictTag(labels.incomingChange), side: 1 }).range(doc.line(block.endLine + 1).to))
  })
  return Decoration.set(ranges, true)
}

/** Conflict tints and the "Accept current · Accept incoming · Accept both" bar above each block. */
function conflicts(labels: EditorLabels): Extension {
  // block widgets have to come from a state field, not a view plugin
  return StateField.define<DecorationSet>({
    create: state => conflictDecorations(state, labels),
    update: (decorations, transaction) => transaction.docChanged ? conflictDecorations(transaction.state, labels) : decorations,
    provide: field => EditorView.decorations.from(field)
  })
}

/** The marked line: where it starts (follows edits) and its tone. */
interface LineMark {
  from: number
  tone: LineTone
}

const setMark = StateEffect.define<LineMark | null>()

class MarkGutter extends GutterMarker {
  constructor(readonly tone: LineTone) {
    super()
    this.elementClass = `cm-mark-${tone}`
  }

  override eq(other: MarkGutter) {
    return other.tone === this.tone
  }
}

/** One marked line per file, drawn on the line and its number. */
const markedLine = StateField.define<LineMark | null>({
  create: () => null,
  update: (mark, transaction) => {
    for (const effect of transaction.effects) if (effect.is(setMark)) return effect.value
    return mark && transaction.docChanged ? { ...mark, from: transaction.changes.mapPos(mark.from) } : mark
  },
  provide: field => [
    EditorView.decorations.from(field, mark => mark ? Decoration.set([Decoration.line({ class: `cm-mark-${mark.tone}` }).range(mark.from)]) : Decoration.none),
    gutterLineClass.from(field, mark => mark ? RangeSet.of([new MarkGutter(mark.tone).range(mark.from)]) : RangeSet.empty)
  ]
})

/** Find tasks: a click on a line or Enter on the cursor's line picks it (the line numbers pick on their own). */
function pickLines(onPick: (line: number) => void): Extension {
  const lineAt = (view: EditorView, pos: number) => view.state.doc.lineAt(pos).number
  return [
    EditorView.editorAttributes.of({ class: 'cm-pickable' }),
    EditorView.domEventHandlers({
      click(event, view) {
        // a drag that selected text is reading, not answering
        if (!view.state.selection.main.empty) return false
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos !== null) onPick(lineAt(view, pos))
        return false
      }
    }),
    keymap.of([{ key: 'Enter', run: (view) => {
      onPick(lineAt(view, view.state.selection.main.head))
      return true
    } }])
  ]
}

export function createCodeEditor(options: CodeEditorOptions): CodeEditorHandle {
  const { labels } = options
  const language = new Compartment()
  const states = new Map<string, EditorState>()
  let current = options.path

  const onPick = options.onPickLine
  const base: Extension[] = [
    lineNumbers(onPick
      ? {
          domEventHandlers: {
            click: (view, line) => {
              onPick(view.state.doc.lineAt(line.from).number)
              return true
            }
          }
        }
      : {}),
    markedLine,
    ...(options.readOnly ? [EditorState.readOnly.of(true)] : []),
    ...(onPick ? [pickLines(onPick)] : []),
    highlightActiveLineGutter(),
    history(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    highlightActiveLine(),
    EditorView.lineWrapping,
    syntaxHighlighting(highlight),
    theme,
    conflicts(labels),
    // Mod-s saves; Tab is left alone, so keyboard users can leave the editor
    keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => {
      options.onSave()
      return true
    } }, ...defaultKeymap, ...historyKeymap]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onChange(update.state.doc.toString())
    })
  ]

  const stateFor = (path: string, doc: string) => {
    const kind = languageOf(path)
    return EditorState.create({
      doc,
      extensions: [
        ...base,
        language.of(builtInLanguage(path) ?? (kind ? languageCache.get(kind) ?? [] : [])),
        EditorView.contentAttributes.of({ 'aria-label': labels.editorLabel(path), 'spellcheck': 'false', 'autocapitalize': 'off', 'autocorrect': 'off' })
      ]
    })
  }

  const view = new EditorView({ state: stateFor(current, options.doc), parent: options.parent })

  // a state made before its language chunk arrived gets the language once it is there
  const ensureLanguage = (path: string) => {
    const kind = languageOf(path)
    if (!kind) return
    loadLanguage(kind).then((extension) => {
      if (current === path && view.dom.isConnected && language.get(view.state) !== extension) {
        view.dispatch({ effects: language.reconfigure(extension) })
      }
    }).catch(() => {
      // a chunk that fails to load leaves the file as plain text
    })
  }
  ensureLanguage(current)

  const setDoc = (doc: string) => {
    if (view.state.doc.toString() === doc) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } })
  }

  return {
    show(path, doc) {
      if (path === current) return setDoc(doc)
      states.set(current, view.state)
      const remembered = states.get(path)
      view.setState(remembered && remembered.doc.toString() === doc ? remembered : stateFor(path, doc))
      current = path
      ensureLanguage(path)
    },
    mark(line, tone = 'error') {
      if (line === null) {
        view.dispatch({ effects: setMark.of(null) })
        return
      }
      const { doc } = view.state
      const at = doc.line(Math.min(Math.max(line, 1), doc.lines))
      view.dispatch({
        effects: [setMark.of({ from: at.from, tone }), EditorView.scrollIntoView(at.from, { y: 'center' })],
        selection: { anchor: at.from }
      })
    },
    forget(path) {
      states.delete(path)
    },
    focus() {
      view.focus()
    },
    destroy() {
      view.destroy()
    }
  }
}
