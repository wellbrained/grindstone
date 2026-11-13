// The Debugging play page on top of usePlaySession (docs/features/ui.md, "Debugging play page"): the app in its sealed
// frame, the Console, the code with its drafts, Reload with its check run, and find tasks' clicks. The session, goals,
// recording, stats events and debrief are shared.
// The session, the drafts, the open file and the last click live in the play state (they survive leaving the page); the
// app you see, its Console and the marked line live as long as the page (coming back loads the app again).
import { consoleEntry, pickLine, readBridgeMessage, reload, restart, saveDebugFile, startDebugLevel, takeHint } from '#shared/levels'
import type { ConsoleEntryBody, DebugLevel, DebugResult, DebugSession, PickVerdict, SourceLine, SourceMapping } from '#shared/levels'
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

export function useDebuggingPlay(level: DebugLevel) {
  const fresh = (): PlayState => {
    const session = startDebugLevel(level)
    return { session, drafts: { ...session.state.files }, active: level.sandbox.open, answer: null }
  }
  const play = usePlaySession(level, { fresh, onRestart: () => nextTick(restartApp) })
  const { store, session, next, goals, best, debriefOpen, progressBefore, sparkKey } = play

  const find = level.sandbox.find ?? null
  const files = computed(() => fileOrder(Object.keys(session.value.state.files)))
  const unsaved = computed(() => files.value.filter(path => store.value.drafts[path] !== session.value.state.files[path]))
  const reloads = computed(() => session.value.reloads ?? 0)

  // the app you see: one load at a time, its Console and where its frames point
  const load = shallowRef<AppLoad | null>(null)
  const mapping = shallowRef<SourceMapping>({ urls: {}, bridgeLine: 0 })
  const entries = ref<ConsoleEntry[]>([])
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
    queue = []
    appMessages = 0
    ready.value = false
    mapping.value = { urls: {}, bridgeLine: 0 }
    load.value = appLoad(files)
    mapping.value = { urls: {}, bridgeLine: load.value.bridgeLine }
  }

  /** A message from the app's frame (AppPanel checks it came from its iframe); anything not of this load is ignored. */
  function onFrameMessage(data: unknown) {
    const current = load.value
    if (!current) return
    const message = readBridgeMessage(data, current.token)
    if (!message) return
    if (message.type === 'files') mapping.value = { urls: message.urls, bridgeLine: current.bridgeLine }
    else if (message.type === 'ready') ready.value = true
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
    const observation = await runCheck(saved, level.sandbox.probes)
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
    ready,
    checking,
    stale,
    mark,
    onFrameMessage,
    connectFrame,
    evaluate,
    clearConsole,
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
