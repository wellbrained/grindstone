// Everything one play page needs: the session of a level, the terminal log, the editor (panel and tabs), the debrief and the graph.
// The session lives in memory (useState): leaving the page and coming back keeps it, a browser reload starts the level again.
import { gitCommandNames, shellCommandNames, unmergedPaths, waitingEditor } from '#shared/git'
import type { GitState, OutputLine } from '#shared/git'
import { TRAINER_COMMANDS, nextLevel, saveEditor, saveFile, startLevel, submit } from '#shared/levels'
import type { Level, Session, SubmitResult } from '#shared/levels'
import type { Prompt } from '~/utils/terminal'

export type LogBody
  = | { type: 'intro' }
    | { type: 'input', text: string, prompt: Prompt }
    | { type: 'line', line: OutputLine }
    | { type: 'notice', author: string, text: string }
    | { type: 'solved' }

export type LogEntry = LogBody & { id: number }

interface PlayState {
  session: Session
  log: LogEntry[]
  nextId: number
}

/** The spark effect runs about this long before the debrief opens. */
const DEBRIEF_DELAY_MS = 900

export interface LevelPlayOptions {
  /** Where `edit <file>` and the conflicted-files list open a file; default: the editor panel. */
  onEdit?: (path: string) => void
}

export function useLevelPlay(level: Level, options: LevelPlayOptions = {}) {
  const { t } = useI18n()
  const { record, markPlayed, levelProgress } = useProgress()

  const fresh = (): PlayState => ({ session: startLevel(level), log: [{ id: 0, type: 'intro' }], nextId: 1 })
  const store = useState<PlayState>(`play:${level.id}`, fresh)
  const editor = ref<{ path: string, content: string } | null>(null)
  const debriefOpen = ref(false)
  const sparkKey = ref(0)
  const showOrigin = ref(false)
  let debriefTimer: ReturnType<typeof setTimeout> | undefined
  onScopeDispose(() => clearTimeout(debriefTimer))

  const session = computed(() => store.value.session)
  const log = computed(() => store.value.log)
  const prompt = computed(() => promptOf(session.value.state))
  // Every command makes a new state, but one that only prints keeps the repo and the working tree as they were. The
  // graph, the file tree and the completion are derived from those, so they keep their previous result until they change.
  const stateRepo = computed(() => session.value.state.repo)
  const stateOrigin = computed(() => session.value.state.origin)
  const workdir = computed(() => session.value.state.workdir)
  /** The state, replaced only when its repo or working tree is (its other fields may be stale: read only those two). */
  const treeState = computed<GitState>((previous) => {
    const state = session.value.state
    return previous && previous.repo === state.repo && previous.workdir === state.workdir ? previous : state
  })
  const completion = computed(() => completionContextOf(treeState.value, {
    trainerCommands: TRAINER_COMMANDS,
    gitCommands: gitCommandNames,
    shellCommands: shellCommandNames
  }))
  const conflictedFiles = computed(() => unmergedPaths(session.value.state))
  const fileTree = computed(() => buildFileTree(treeState.value.workdir, fileStatuses(treeState.value)))
  const tabs = useEditorTabs(() => workdir.value)
  const hasOrigin = computed(() => session.value.state.origin !== null)

  // the file git waits for in the editor (git rebase -i): its draft starts from what git wrote, whenever git opens a new one
  const gitEditor = computed(() => waitingEditor(session.value.state))
  const gitDraft = ref(gitEditor.value?.text ?? '')
  watch([() => gitEditor.value?.path, () => gitEditor.value?.text], ([, text]) => {
    if (text !== undefined) gitDraft.value = text
  })
  const next = nextLevel(level.id)

  const goals = computed(() => level.goals.map(goal => ({ id: goal.id, label: goal.label, met: session.value.goalsMet[goal.id] === true })))
  const stats = computed(() => ({
    commands: session.value.commandCount,
    solution: level.solution.length,
    hints: session.value.hintsUsed,
    // the best run so far (this one included, once it is recorded)
    best: levelProgress(level.id)?.best ?? null
  }))

  const graph = computed(() => {
    const repo = stateRepo.value
    const origin = stateOrigin.value
    if (!repo) return layoutGraph({ commits: {}, branches: {}, remoteBranches: {}, head: { type: 'branch', name: 'main' } })
    return layoutGraph({
      commits: repo.commits,
      branches: repo.branches,
      remoteBranches: repo.remoteBranches,
      head: repo.head,
      tags: Object.fromEntries(Object.entries(repo.tags).map(([name, tag]) => [name, tag.commit])),
      origin: showOrigin.value && origin ? { commits: origin.commits, branches: origin.branches } : null
    })
  })

  function push(body: LogBody) {
    store.value.log.push({ id: store.value.nextId++, ...body })
  }

  /** The editor panel (Terminal layout). */
  function openEditor(path: string) {
    editor.value = { path, content: session.value.state.workdir[path] ?? '' }
  }

  const edit = (path: string) => (options.onEdit ?? openEditor)(path)

  function apply(result: SubmitResult) {
    store.value.session = result.session
    for (const line of result.output) {
      if (line.kind === 'clear') store.value.log = []
      else if (line.kind === 'edit') edit(line.path)
      else push({ type: 'line', line })
    }
    for (const notice of result.notices) push({ type: 'notice', author: notice.author, text: notice.text })
    if (result.solvedNow) {
      push({ type: 'solved' })
      record(level.id, result.session)
      sparkKey.value++
      // a practice task has no debrief: its panel shows why it works, with Next and Again
      if (level.kind === 'practice') return
      // let the spark play before the dialog covers it
      clearTimeout(debriefTimer)
      debriefTimer = setTimeout(() => {
        debriefOpen.value = true
      }, DEBRIEF_DELAY_MS)
    }
  }

  /** One line typed in the terminal. Typing in a level makes it the one Continue opens. */
  function run(line: string) {
    markPlayed(level.id)
    push({ type: 'input', text: line, prompt: prompt.value })
    apply(submit(session.value, level, line))
  }

  /** A save through the engine that counts like a command: the level is played, the terminal says it was saved. */
  function counted(path: string, save: () => SubmitResult) {
    markPlayed(level.id)
    push({ type: 'line', line: { kind: 'out', text: t('terminal.saved', { path }) } })
    apply(save())
  }

  /** Writes a file through the engine. */
  const saveAs = (path: string, content: string) => counted(path, () => saveFile(session.value, level, path, content))

  /** Start rebase / Save message: hands the draft to git, which goes on. */
  function submitGitEditor() {
    const wait = gitEditor.value
    if (wait) counted(wait.path, () => saveEditor(session.value, level, gitDraft.value))
  }

  /** Cancel in the file git waits for: the rebase is aborted, shown as the command it runs. */
  const cancelGitEditor = () => run('git rebase --abort')

  /** Save from the editor panel. */
  function save(content: string) {
    if (!editor.value) return
    const { path } = editor.value
    editor.value = null
    saveAs(path, content)
  }

  /** Save an editor tab (Ctrl/Cmd+S or its Save button). */
  function saveTab(path: string) {
    const tab = tabs.tabs.value.find(candidate => candidate.path === path)
    if (!tab) return
    const content = tab.draft
    tabs.saved(path, content)
    saveAs(path, content)
  }

  /** Tab completion with several matches: print them like a shell does. */
  function listCandidates(text: string, candidates: string[]) {
    push({ type: 'input', text, prompt: prompt.value })
    push({ type: 'line', line: { kind: 'out', text: candidates.join('  ') } })
  }

  function clearTerminal() {
    store.value.log = []
  }

  function reset() {
    store.value.log = [{ id: store.value.nextId++, type: 'intro' }]
    run('reset')
  }

  /** Again / Play again: the same entry from its start, as a new attempt (hints and commands from zero). */
  function again() {
    clearTimeout(debriefTimer)
    debriefOpen.value = false
    editor.value = null
    store.value = fresh()
  }

  // a reset or a loaded backup restarts this page in place (useProgress)
  onScopeDispose(registerPlay(level.id, again))

  return {
    level,
    session,
    log,
    prompt,
    completion,
    conflictedFiles,
    workdir,
    fileTree,
    tabs,
    hasOrigin,
    showOrigin,
    gitEditor,
    gitDraft,
    submitGitEditor,
    cancelGitEditor,
    next,
    goals,
    stats,
    graph,
    editor,
    debriefOpen,
    sparkKey,
    run,
    save,
    saveTab,
    openEditor,
    edit,
    listCandidates,
    clearTerminal,
    reset,
    again,
    hint: () => run('hint')
  }
}

export type LevelPlay = ReturnType<typeof useLevelPlay>
