// The Debugging play page on top of usePlaySession (docs/features/ui.md, "Debugging play page"): the app in its sealed
// frame, the Console, the Network panel (levels with a backend), the Elements panel (levels that use it), the Debugger
// (chapter 5: a recorded run, its breakpoints and stepping), the code with its drafts, Reload with its check run, and find
// tasks' clicks. The session, goals, recording of the solve, stats events and debrief are shared.
// The session, the drafts, the open file and the last click live in the play state (they survive leaving the page); the
// app you see, its Console, its requests, its DOM and the marked line live as long as the page (coming back loads the
// app again).
import {
  RECORD_LIMITS, consoleEntry, cssRules, fittingSteps, frameStep, hitCounts, nextHit, nodeAtPath, nodePath, pickLine, previousHit, readBridgeMessage, reload,
  requestEntry, restart, saveDebugFile, scopeAt, scopeValues, startDebugLevel, startExpanded, stepBack, stepInto, stepLine, stepOut, stepOver, takeHint,
  withAncestors, withResponse, withoutInstrumentation
} from '#shared/levels'
import type {
  Breakpoint, ConsoleEntryBody, CssRule, DebugLevel, DebugResult, DebugSession, DomNode, Inspected, Instrumented, NetworkEntry, PickVerdict, RecordEndReason,
  RecordedStep, ScopeEntries, SourceLine, SourceMapping
} from '#shared/levels'
import type { CompiledCondition } from '#shared/levels/debugging/condition'
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
/** How long Stop waits for the recorder's last steps (a busy app may never answer). */
const STOP_WAIT_MS = 600

/** Where the Debugger is: nothing recorded, recording, waiting for the last steps after Stop, or a recording to step through. */
export type RecordStatus = 'idle' | 'recording' | 'stopping' | 'recorded'

/** A recorded run: the code it ran (instrumented), the files it ran, the steps and why it ended. */
export interface Recording {
  map: Instrumented
  files: Readonly<Record<string, string>>
  steps: RecordedStep[]
  ended: RecordEndReason | null
}

/** One frame of the call stack at the current step, as the Debugger lists it. */
export interface StackFrame extends SourceLine {
  index: number
  name: string
  /** A frame of the call that started an async function now back from an `await`. */
  async: boolean
}

/** What a move in the recording ended on, said once (no breakpoint ahead or behind). */
export type MoveNote = 'noBreakpointAhead' | 'noBreakpointBehind' | null

/** The lazily loaded tools of chapter 5 (acorn and what uses it). */
interface RecordTools {
  instrumentFiles: (files: Readonly<Record<string, string>>) => Instrumented
  compileCondition: (text: string) => CompiledCondition
  truthy: (value: unknown) => boolean
}

let toolsLoading: Promise<RecordTools> | null = null
/** Loads the instrumentation and the condition reader once (their own chunk, with acorn). */
function loadRecordTools(): Promise<RecordTools> {
  toolsLoading ??= Promise.all([import('#shared/levels/debugging/instrument'), import('#shared/levels/debugging/condition')])
    .then(([instrument, condition]) => ({ instrumentFiles: instrument.instrumentFiles, compileCondition: condition.compileCondition, truthy: condition.truthy }))
    .catch((error: unknown) => {
      toolsLoading = null
      throw error
    })
  return toolsLoading
}

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
  /** The level uses the Debugger (chapter 5). */
  const hasDebugger = level.sandbox.debugger === true
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

  /**
   * Starts the app you see on these files (not counted: Reload counts, a page visit or Reset does not); with `recorded`
   * (Record), its modules run instrumented and report their steps. Any other start ends the recording.
   */
  function startApp(files: Readonly<Record<string, string>>, recorded?: Readonly<Record<string, string>>) {
    if (!recorded) dropRecording()
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
    load.value = appLoad(files, backend, hasElements, recorded)
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
    } else if (message.type === 'steps') {
      takeSteps(message.steps)
    } else if (message.type === 'recordEnd') {
      const current = recording.value
      if (!current || (recordStatus.value !== 'recording' && recordStatus.value !== 'stopping')) return
      recording.value = { ...current, ended: message.reason }
      finishRecording()
    } else if (message.type === 'request') {
      if (requests.value.length < MAX_REQUESTS) requests.value = [...requests.value, requestEntry(message, mapping.value)]
    } else if (message.type === 'response') requests.value = withResponse(requests.value, message)
    else {
      // past the cap the app's output is dropped before it is even read
      if (message.type !== 'result' && appMessages >= MAX_APP_MESSAGES) return
      const found = consoleEntry(message, mapping.value)
      // a recorded load runs instrumented code: what Firefox and Safari quote of it reads as written
      const entry = found && current.recorded ? { ...found, text: withoutInstrumentation(found.text) } : found
      if (entry) {
        if (message.type === 'result') push(entry)
        else pushFromApp(entry)
      }
    }
  }

  // --- the Debugger (chapter 5): a recorded run, breakpoints and stepping ----------------------------------------------

  const recordStatus = ref<RecordStatus>('idle')
  /** The recorded run (its steps grow while recording; never deep-reactive). */
  const recording = shallowRef<Recording | null>(null)
  /** How many steps the recording holds (it grows while recording). */
  const stepCount = ref(0)
  /** The step the Debugger is at (an index into the steps). */
  const position = ref(0)
  /** The frame of the call stack whose scope shows (0: the top one). */
  const selectedFrame = ref(0)
  /** What the last move ended on, when it is worth saying. */
  const moveNote = ref<MoveNote>(null)
  /** The breakpoints, per line (they stay while you are on the page, across reloads and recordings). */
  const breakpoints = ref<Breakpoint[]>([])
  /** The chapter 5 tools, once loaded (Record or a condition loads them). */
  const tools = shallowRef<RecordTools | null>(null)
  let stopTimer: ReturnType<typeof setTimeout> | null = null

  function dropRecording() {
    if (stopTimer) clearTimeout(stopTimer)
    stopTimer = null
    recording.value = null
    recordStatus.value = 'idle'
    stepCount.value = 0
    position.value = 0
    selectedFrame.value = 0
    moveNote.value = null
  }

  /** The chapter 5 tools could not be loaded (offline after a new version went live): the Debugger says so. */
  const toolsFailed = ref(false)

  async function ensureTools(): Promise<RecordTools | null> {
    if (tools.value) return tools.value
    try {
      tools.value = await loadRecordTools()
      toolsFailed.value = false
    } catch (error) {
      console.error(error)
      toolsFailed.value = true
      return null
    }
    return tools.value
  }

  /** Record: the app reloads from the saved files with its code instrumented; using it records the run, until Stop. */
  async function record() {
    if (!hasDebugger || checking.value || recordStatus.value === 'recording' || recordStatus.value === 'stopping') return
    play.markPlayed()
    const loaded = await ensureTools()
    if (!loaded || disposed || checking.value) return
    const saved = session.value.state.files
    const map = loaded.instrumentFiles(saved)
    startApp(saved, map.modules)
    recording.value = { map, files: saved, steps: markRaw([]), ended: null }
    stepCount.value = 0
    recordStatus.value = 'recording'
  }

  /** Steps from the recorder: kept while recording (and just after Stop), only those that fit the recorded code. */
  function takeSteps(incoming: RecordedStep[]) {
    const current = recording.value
    if (!current || (recordStatus.value !== 'recording' && recordStatus.value !== 'stopping')) return
    const room = RECORD_LIMITS.maxSteps - current.steps.length
    if (room <= 0) return
    current.steps.push(...fittingSteps(incoming, current.map).slice(0, room))
    stepCount.value = current.steps.length
  }

  /** Stop: the recorder sends its last steps and stops; the app runs on. */
  function stopRecording() {
    if (recordStatus.value !== 'recording') return
    recordStatus.value = 'stopping'
    toFrame({ type: 'recordStop' })
    stopTimer = setTimeout(finishRecording, STOP_WAIT_MS)
  }

  const points = computed(() => recording.value?.map.points ?? [])
  const steps = computed<readonly RecordedStep[]>(() => {
    // the steps grow in place while recording: stepCount says when to look again
    void stepCount.value
    return recording.value?.steps ?? []
  })
  const currentStep = computed(() => recordStatus.value === 'recorded' ? steps.value[position.value] ?? null : null)

  // conditions are read once per text
  const compiled = new Map<string, CompiledCondition>()
  function conditionOf(text: string): CompiledCondition | null {
    const loaded = tools.value
    if (!loaded) return null
    let found = compiled.get(text)
    if (!found) {
      found = loaded.compileCondition(text)
      compiled.set(text, found)
    }
    return found
  }

  /** A breakpoint stops at a step when it has no condition, or its condition holds on that step's values. */
  function holds(breakpoint: Breakpoint, step: RecordedStep): boolean {
    if (!breakpoint.condition.trim()) return true
    const condition = conditionOf(breakpoint.condition)
    if (!condition?.ok || !tools.value) return false
    const result = condition.evaluate(scopeValues(points.value, step))
    return result.ok && tools.value.truthy(result.value)
  }

  function goTo(index: number, note: MoveNote = null) {
    position.value = Math.min(Math.max(index, 0), Math.max(steps.value.length - 1, 0))
    selectedFrame.value = 0
    moveNote.value = note
  }

  /** The recording is there to step through: at the first breakpoint it stops at, else at its first step. */
  function finishRecording() {
    if (stopTimer) clearTimeout(stopTimer)
    stopTimer = null
    if (recordStatus.value !== 'recording' && recordStatus.value !== 'stopping') return
    recordStatus.value = 'recorded'
    if (recording.value && !recording.value.ended) recording.value = { ...recording.value, ended: 'stopped' }
    const all = steps.value
    const hit = all.length ? nextHit(all, points.value, -1, breakpoints.value, holds) : null
    goTo(hit?.index ?? 0)
  }

  /** The call stack at the current step, top first. */
  const callStack = computed<StackFrame[]>(() => {
    const step = currentStep.value
    const map = recording.value?.map
    if (!step || !map) return []
    return step.frames.flatMap((frame, index) => {
      const point = map.points[frame.point]
      const fn = map.functions[frame.fn]
      if (!fn) return []
      return [{ index, name: fn.name, async: frame.async, path: point?.path ?? fn.path, line: point?.line ?? fn.line }]
    })
  })

  /** The line the Debugger shows: the selected frame's (the current step's for the top one). */
  const debugLine = computed<SourceLine | null>(() => {
    const frame = callStack.value.find(each => each.index === selectedFrame.value) ?? callStack.value[0]
    return frame ? { path: frame.path, line: frame.line } : null
  })

  /** The scopes the selected frame could see, with their values at that moment. */
  const scopes = computed<ScopeEntries[]>(() => {
    if (recordStatus.value !== 'recorded') return []
    const index = frameStep(steps.value, position.value, selectedFrame.value)
    const step = index === null ? null : steps.value[index]
    return step ? scopeAt(points.value, step) : []
  })

  /** The files the recording ran differ from the code in the editor (its lines may have moved). */
  const recordingOutdated = computed(() => recording.value !== null && Object.entries(recording.value.files).some(([path, text]) => store.value.drafts[path] !== text))

  /** How often each breakpoint stops in the recording. */
  const hits = computed(() => {
    void tools.value
    return recordStatus.value === 'recorded' ? hitCounts(steps.value, points.value, breakpoints.value, holds) : breakpoints.value.map(() => 0)
  })

  /** Why a breakpoint's condition can't be read (null: it can, it has none, or the reader is still loading). */
  function conditionError(breakpoint: Breakpoint): string | null {
    if (!breakpoint.condition.trim()) return null
    const condition = conditionOf(breakpoint.condition)
    return condition && !condition.ok ? condition.error : null
  }

  const atRecording = () => recordStatus.value === 'recorded' && steps.value.length > 0
  function moveBy(move: (all: readonly RecordedStep[], at: number) => number) {
    if (atRecording()) goTo(move(steps.value, position.value))
  }
  const stepOverNext = () => moveBy(stepOver)
  const stepIntoNext = () => moveBy(stepInto)
  const stepOutOf = () => moveBy(stepOut)
  const stepBackOne = () => moveBy((_, at) => stepBack(at))

  /** Resume: on to the next step a breakpoint stops at; with none ahead, to the end of the recording. */
  function resume() {
    if (!atRecording()) return
    const hit = nextHit(steps.value, points.value, position.value, breakpoints.value, holds)
    goTo(hit ? hit.index : steps.value.length - 1, hit ? null : 'noBreakpointAhead')
  }

  /** Back to the previous step a breakpoint stops at; with none behind, to the start. */
  function resumeBack() {
    if (!atRecording()) return
    const hit = previousHit(steps.value, points.value, position.value, breakpoints.value, holds)
    goTo(hit ? hit.index : 0, hit ? null : 'noBreakpointBehind')
  }

  function selectFrame(index: number) {
    if (callStack.value.some(frame => frame.index === index)) selectedFrame.value = index
  }

  /** A breakpoint on this line on or off (a click in the gutter, Ctrl/Cmd+B). */
  function toggleBreakpoint(line: SourceLine) {
    if (!hasDebugger) return
    const at = breakpoints.value.findIndex(each => each.path === line.path && each.line === line.line)
    if (at >= 0) breakpoints.value = breakpoints.value.filter((_, index) => index !== at)
    else breakpoints.value = [...breakpoints.value, { path: line.path, line: line.line, condition: '' }].sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)
  }

  function removeBreakpoint(index: number) {
    breakpoints.value = breakpoints.value.filter((_, at) => at !== index)
  }

  /** A breakpoint's condition ('' for none); the chapter 5 tools load to read it. */
  async function setCondition(index: number, condition: string) {
    if (!breakpoints.value[index]) return
    breakpoints.value = breakpoints.value.map((each, at) => at === index ? { ...each, condition: condition.trim() } : each)
    if (condition.trim()) await ensureTools()
  }

  /** The current step's line as a find task's answer (the Debugger's Answer button). */
  function answerStep() {
    const step = currentStep.value
    const line = step ? stepLine(points.value, step) : null
    if (line) pick(line)
  }

  // the code follows the Debugger: the selected frame's file opens at its line
  watch(debugLine, (line) => {
    if (line && recordStatus.value === 'recorded') openFile(line.path)
  })

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

  /** Shows a line in Code without saying anything about it (a breakpoint's place). */
  function revealLine(line: SourceLine) {
    openFile(line.path)
    mark.value = { ...line, tone: 'info' }
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
    hasDebugger,
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
    revealLine,
    pick,
    hint,
    reset,
    again: play.again,
    recordStatus,
    recording,
    stepCount,
    position,
    selectedFrame,
    moveNote,
    breakpoints,
    tools,
    toolsFailed,
    currentStep,
    callStack,
    debugLine,
    scopes,
    hits,
    recordingOutdated,
    conditionError,
    record,
    stopRecording,
    goTo,
    stepOverNext,
    stepIntoNext,
    stepOutOf,
    stepBackOne,
    resume,
    resumeBack,
    selectFrame,
    toggleBreakpoint,
    removeBreakpoint,
    setCondition,
    answerStep
  }
}

export type DebuggingPlaySession = ReturnType<typeof useDebuggingPlay>
