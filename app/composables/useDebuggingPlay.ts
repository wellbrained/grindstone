// The Debugging play page on top of usePlaySession (docs/features/ui.md, "Debugging play page"): the app in its sealed
// frame, the Console, the Network panel (levels with a backend), the Elements panel (levels that use it), the code with
// its drafts, Reload with its check run, and find tasks' clicks. The session, goals, recording, stats events and debrief
// are shared.
// The session, the drafts, the open file and the last click live in the play state (they survive leaving the page); the
// app you see, its Console, its requests, its DOM and the marked line live as long as the page (coming back loads the
// app again).
import { consoleEntry, cssRules, nodeAtPath, nodePath, pickLine, readBridgeMessage, reload, requestEntry, restart, saveDebugFile, startDebugLevel, startExpanded, takeHint, withAncestors, withResponse } from '#shared/levels'
import type { ConsoleEntryBody, CssRule, DebugLevel, DebugResult, DebugSession, DomNode, Inspected, NetworkEntry, PickVerdict, SourceLine, SourceMapping } from '#shared/levels'
import type { LineTone } from '~/editor/codemirror'
import type { AppLoad } from '~/utils/sandbox-host'
import { appLoad, runCheck } from '~/utils/sandbox-host'
import { fileOrder } from '~/utils/debug-files'

export type ConsoleEntry = ConsoleEntryBody & { id: number }

/** A find task's last click, with what it said. */
export type Answer = SourceLine & PickVerdict

interface PlayState {
  session: DebugSession
  /** Editor text per file; equal to the saved file when there are no unsaved edits. */
  drafts: Record<string, string>
  /** The file open in the editor. */
  active: string
  answer: Answer | null
}

/** The Console keeps at most this many lines (the oldest go first). */
const MAX_ENTRIES = 500
/** The most of its own logs and errors one load of the app shows (a console.log in a loop must not freeze the page). */
const MAX_APP_MESSAGES = 1000
/** The most requests one load of the app lists in the Network panel (a fetch in a loop); later ones are not listed. */
export const MAX_REQUESTS = 200

export function useDebuggingPlay(level: DebugLevel) {
  const fresh = (): PlayState => {
    const session = startDebugLevel(level)
    return { session, drafts: { ...session.state.files }, active: level.sandbox.open, answer: null }
  }
  const play = usePlaySession(level, { fresh, onRestart: () => nextTick(restartApp) })
  const { store, session, next, goals, best, debriefOpen, progressBefore, sparkKey } = play

  const find = level.sandbox.find ?? null
  const backend = level.sandbox.backend
  /** The level scripts a backend, so the page shows the Network panel. */
  const hasNetwork = backend !== undefined
  /** The level uses the Elements panel (chapter 3). */
  const hasElements = level.sandbox.elements === true
  const files = computed(() => fileOrder(Object.keys(session.value.state.files)))
  const unsaved = computed(() => files.value.filter(path => store.value.drafts[path] !== session.value.state.files[path]))
  const reloads = computed(() => session.value.reloads ?? 0)

  // the app you see: one load at a time, its Console and where its frames point
  const load = shallowRef<AppLoad | null>(null)
  const mapping = shallowRef<SourceMapping>({ urls: {}, bridgeLine: 0 })
  const entries = ref<ConsoleEntry[]>([])
  /** The Network panel: the requests of this load, in the order sent. */
  const requests = shallowRef<NetworkEntry[]>([])
  const ready = ref(false)
  const checking = ref(false)
  let nextId = 0
  let nextEval = 0
  let frameWindow: () => Window | null = () => null
  let disposed = false
  /** Goes up with every new attempt (Reset, Again): a check run that outlives its attempt is dropped. */
  let attempt = 0
  onScopeDispose(() => {
    disposed = true
  })

  /** The saved files differ from what the app runs: Reload runs them. */
  const stale = computed(() => load.value !== null && load.value.files !== session.value.state.files)

  // the Elements panel: the snapshot of this load's DOM, the selected element and what the bridge said about it
  /** The elements of the last snapshot, in document order. */
  const dom = shallowRef<DomNode[]>([])
  /** The page had more elements than a snapshot keeps. */
  const domTruncated = ref(false)
  /** The rules of the stylesheets this load runs (the bridge numbers its matches by them). */
  const rules = computed<CssRule[]>(() => hasElements && load.value ? cssRules(load.value.files) : [])
  /** The selected element (its id in the snapshot) and, to find it again in the next snapshot, its place in the tree. */
  const selected = ref<number | null>(null)
  let selectedPath: number[] | null = null
  /** The open elements of the tree. */
  const expanded = ref<Set<number>>(new Set())
  const inspected = shallowRef<Inspected | null>(null)
  /** Pick mode: the next click in the app selects what it lands on. */
  const picking = ref(false)
  /** Pick mode: the element under the pointer (shown in the tree). */
  const hovered = ref<number | null>(null)
  // a snapshot is read only when one was asked for (the one after a load, Refresh) or while picking (the bridge takes one
  // on the click); an inspection only for the latest request
  let awaitingDom = false
  let inspectSeq = 0

  /** Goes up with every pick in the app (the panel shows and focuses the picked element). */
  const pickedAt = ref(0)

  /** The line marked in the editor: opened from the Console (error tint) or a find task's answer. */
  const mark = ref<(SourceLine & { tone: LineTone }) | null>(null)

  // A flood of messages (a console.log in a loop) must not freeze the page: entries are added once per frame, and a load
  // shows at most MAX_APP_MESSAGES of the app's own logs and errors (Console input and its results always show).
  let queue: ConsoleEntry[] = []
  let flushQueued = false
  let appMessages = 0
  function flush() {
    flushQueued = false
    if (!queue.length) return
    entries.value.push(...queue)
    queue = []
    if (entries.value.length > MAX_ENTRIES) entries.value.splice(0, entries.value.length - MAX_ENTRIES)
  }
  function push(entry: ConsoleEntryBody) {
    queue.push({ ...entry, id: nextId++ })
    if (!flushQueued) {
      flushQueued = true
      requestAnimationFrame(flush)
    }
  }
  /** The app's own output, counted against the per-load cap. */
  function pushFromApp(entry: ConsoleEntryBody) {
    appMessages += 1
    if (appMessages > MAX_APP_MESSAGES) return
    push(appMessages === MAX_APP_MESSAGES
      ? { level: 'warn', text: `The app logged ${MAX_APP_MESSAGES} messages; the Console shows no more of them until the next reload.`, source: null, frames: [] }
      : entry)
  }

  /** Starts the app you see on these files (not counted: Reload counts, a page visit or Reset does not). */
  function startApp(files: Readonly<Record<string, string>>) {
    entries.value = []
    requests.value = []
    queue = []
    appMessages = 0
    ready.value = false
    dom.value = []
    domTruncated.value = false
    inspected.value = null
    picking.value = false
    hovered.value = null
    awaitingDom = hasElements
    mapping.value = { urls: {}, bridgeLine: 0 }
    load.value = appLoad(files, backend, hasElements)
    mapping.value = { urls: {}, bridgeLine: load.value.bridgeLine }
  }

  /** A message to this load's bridge (the frame's origin is opaque, so '*' is the only target; the token tells it is us). */
  function toFrame(message: Record<string, unknown>) {
    const target = frameWindow()
    if (target && load.value) target.postMessage({ ...message, grindstone: load.value.token }, '*')
  }

  /** A new snapshot: the same element stays selected when it is still there (also after a reload). */
  function takeSnapshot(nodes: DomNode[], truncated: boolean, pickedId: number | null = null) {
    dom.value = nodes
    domTruncated.value = truncated
    const again = pickedId ?? (selectedPath ? nodeAtPath(nodes, selectedPath) : null)
    expanded.value = again === null ? startExpanded(nodes) : withAncestors(nodes, again, startExpanded(nodes))
    selectNode(again)
  }

  /** Asks the app for a new snapshot of its DOM (Refresh). */
  function refreshDom() {
    if (!hasElements) return
    awaitingDom = true
    toFrame({ type: 'dom' })
  }

  /** Selects an element of the snapshot (null: none), and asks the bridge what applies to it (the panel outlines it). */
  function selectNode(id: number | null) {
    const node = id === null ? undefined : dom.value[id]
    selected.value = node ? node.id : null
    selectedPath = node ? nodePath(dom.value, node.id) : selectedPath
    inspected.value = null
    inspectSeq++
    if (node) toFrame({ type: 'inspect', node: node.id, seq: inspectSeq })
  }

  /** Outlines an element in the app (hovering a row), or none (-1); back to the selected one with null. */
  function highlightNode(id: number | null) {
    toFrame({ type: 'highlight', node: id ?? selected.value ?? -1 })
  }

  function toggleNode(id: number, open: boolean) {
    const next = new Set(expanded.value)
    if (open) next.add(id)
    else next.delete(id)
    expanded.value = next
  }

  /** Pick mode on or off: on, the next click in the app selects what it lands on (the app never gets that click). */
  function setPicking(on: boolean) {
    if (!hasElements || picking.value === on) return
    picking.value = on
    hovered.value = null
    toFrame({ type: 'pick', on })
  }

  /** A message from the app's frame (AppPanel checks it came from its iframe); anything not of this load is ignored. */
  function onFrameMessage(data: unknown) {
    const current = load.value
    if (!current) return
    const message = readBridgeMessage(data, current.token)
    if (!message) return
    if (message.type === 'files') mapping.value = { urls: message.urls, bridgeLine: current.bridgeLine }
    else if (message.type === 'ready') ready.value = true
    else if (message.type === 'dom') {
      if (!hasElements || (!awaitingDom && !picking.value)) return
      awaitingDom = false
      takeSnapshot(message.nodes, message.truncated)
    } else if (message.type === 'inspected') {
      if (message.seq === inspectSeq && message.node === selected.value) inspected.value = message
    } else if (message.type === 'hovered') {
      if (picking.value) hovered.value = message.node >= 0 ? message.node : null
    } else if (message.type === 'picked') {
      if (!picking.value || message.node >= dom.value.length) return
      picking.value = false
      hovered.value = null
      takeSnapshot(dom.value, domTruncated.value, message.node)
      pickedAt.value++
    } else if (message.type === 'pickEnd') {
      picking.value = false
      hovered.value = null
    } else if (message.type === 'request') {
      if (requests.value.length < MAX_REQUESTS) requests.value = [...requests.value, requestEntry(message, mapping.value)]
    } else if (message.type === 'response') requests.value = withResponse(requests.value, message)
    else {
      // past the cap the app's output is dropped before it is even read
      if (message.type !== 'result' && appMessages >= MAX_APP_MESSAGES) return
      const entry = consoleEntry(message, mapping.value)
      if (entry) {
        if (message.type === 'result') push(entry)
        else pushFromApp(entry)
      }
    }
  }

  /** AppPanel tells where its frame is, for Console input. */
  function connectFrame(getWindow: () => Window | null) {
    frameWindow = getWindow
  }

  /** Runs one line of Console input inside the app (counts as playing the level, not as an action). */
  function evaluate(code: string) {
    if (!code.trim()) return
    play.markPlayed()
    push({ level: 'input', text: code, source: null, frames: [] })
    const target = frameWindow()
    if (!target || !load.value) return
    // the frame's origin is opaque ("null"), so '*' is the only target; the token tells the bridge it is us
    target.postMessage({ grindstone: load.value.token, type: 'eval', id: nextEval++, code }, '*')
  }

  function clearConsole() {
    entries.value = []
    queue = []
  }

  function clearNetwork() {
    requests.value = []
  }

  function apply(result: DebugResult) {
    play.update(result.session)
    if (result.solvedNow) play.solved(result.session)
  }

  /** Save: the active file's draft becomes the saved file (counted); nothing to save, nothing happens. */
  function save(path = store.value.active) {
    const draft = store.value.drafts[path]
    if (find || draft === undefined || draft === session.value.state.files[path]) return
    play.markPlayed()
    apply(saveDebugFile(session.value, level, path, draft))
  }

  /** Reload: the app restarts from the saved files, and its check run decides the goals (counted, also as a reload). */
  async function reloadApp() {
    if (checking.value) return
    play.markPlayed()
    const saved = session.value.state.files
    const startedIn = attempt
    startApp(saved)
    checking.value = true
    const observation = await runCheck(saved, level.sandbox.probes, backend)
    // a Reset or Again while the check ran started a new attempt: this result belongs to the old one
    if (disposed || startedIn !== attempt) return
    checking.value = false
    apply(reload(session.value, level, observation))
  }

  function openFile(path: string) {
    if (path in session.value.state.files) store.value.active = path
  }

  /** A source link or a frame in the Console: opens the file at that line (find tasks: it is also the answer). */
  function openLine(line: SourceLine) {
    openFile(line.path)
    if (find) {
      pick(line)
      return
    }
    mark.value = { ...line, tone: 'error' }
  }

  /** A click on a line in a find task: the answer, right or wrong (counted). */
  function pick(line: SourceLine) {
    if (!find) return
    play.markPlayed()
    const result = pickLine(session.value, level, line)
    if (!result.output.verdict) return
    store.value.answer = { ...line, ...result.output.verdict }
    mark.value = { ...line, tone: result.output.verdict.right ? 'success' : 'warning' }
    apply(result)
  }

  function hint() {
    const shown = takeHint(session.value, level)
    play.update(shown.session)
  }

  /** The app and the panels back to the session's files (after Reset and Again). */
  function restartApp() {
    attempt++
    checking.value = false
    mark.value = null
    startApp(session.value.state.files)
  }

  /** Reset: back to the starting files as a new attempt; hints stay revealed (and counted). */
  function reset() {
    const restarted = restart(session.value, level)
    play.update(restarted)
    store.value.drafts = { ...restarted.state.files }
    store.value.active = level.sandbox.open
    store.value.answer = null
    restartApp()
  }

  const stats = computed(() => ({
    hints: session.value.hintsUsed,
    reloads: reloads.value,
    // the best run so far (this one included, once it is recorded)
    best: best.value
  }))

  // the app starts with the page (and again when you come back to it)
  onMounted(() => startApp(session.value.state.files))

  return {
    level,
    find,
    hasNetwork,
    hasElements,
    session,
    store,
    files,
    unsaved,
    reloads,
    goals,
    next,
    stats,
    debriefOpen,
    progressBefore,
    sparkKey,
    load,
    entries,
    requests,
    dom,
    domTruncated,
    rules,
    selected,
    expanded,
    inspected,
    picking,
    hovered,
    pickedAt,
    ready,
    checking,
    stale,
    mark,
    onFrameMessage,
    connectFrame,
    evaluate,
    clearConsole,
    clearNetwork,
    refreshDom,
    selectNode,
    highlightNode,
    toggleNode,
    setPicking,
    save,
    reloadApp,
    openFile,
    openLine,
    pick,
    hint,
    reset,
    again: play.again
  }
}

export type DebuggingPlaySession = ReturnType<typeof useDebuggingPlay>
