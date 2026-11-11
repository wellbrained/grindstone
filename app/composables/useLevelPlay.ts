// Everything one play page needs: the session of a level, the terminal log, the editor, the debrief and the graph.
// The session lives in memory (useState): leaving the page and coming back keeps it, a browser reload starts the level again.
import { gitCommandNames, shellCommandNames, unmergedPaths } from '#shared/git'
import type { OutputLine } from '#shared/git'
import { TRAINER_COMMANDS, nextLevel, saveFile, startLevel, submit } from '#shared/levels'
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

export function useLevelPlay(level: Level) {
  const { t } = useI18n()
  const { record } = useProgress()

  const store = useState<PlayState>(`play:${level.id}`, () => ({
    session: startLevel(level),
    log: [{ id: 0, type: 'intro' }],
    nextId: 1
  }))
  const editor = ref<{ path: string, content: string } | null>(null)
  const debriefOpen = ref(false)
  const sparkKey = ref(0)
  const showOrigin = ref(false)
  let debriefTimer: ReturnType<typeof setTimeout> | undefined
  onScopeDispose(() => clearTimeout(debriefTimer))

  const session = computed(() => store.value.session)
  const log = computed(() => store.value.log)
  const prompt = computed(() => promptOf(session.value.state))
  const completion = computed(() => completionContextOf(session.value.state, {
    trainerCommands: TRAINER_COMMANDS,
    gitCommands: gitCommandNames,
    shellCommands: shellCommandNames
  }))
  const conflictedFiles = computed(() => unmergedPaths(session.value.state))
  const hasOrigin = computed(() => session.value.state.origin !== null)
  const next = nextLevel(level.id)

  const goals = computed(() => level.goals.map(goal => ({ id: goal.id, label: goal.label, met: session.value.goalsMet[goal.id] === true })))
  const stats = computed(() => ({
    commands: session.value.commandCount,
    solution: level.solution.length,
    hints: session.value.hintsUsed
  }))

  const graph = computed(() => {
    const { repo, origin } = session.value.state
    if (!repo) return layoutGraph({ commits: {}, branches: {}, remoteBranches: {}, head: { type: 'branch', name: 'main' } })
    return layoutGraph({
      commits: repo.commits,
      branches: repo.branches,
      remoteBranches: repo.remoteBranches,
      head: repo.head,
      origin: showOrigin.value && origin ? { commits: origin.commits, branches: origin.branches } : null
    })
  })

  function push(body: LogBody) {
    store.value.log.push({ id: store.value.nextId++, ...body })
  }

  function openEditor(path: string) {
    editor.value = { path, content: session.value.state.workdir[path] ?? '' }
  }

  function apply(result: SubmitResult) {
    store.value.session = result.session
    for (const line of result.output) {
      if (line.kind === 'clear') store.value.log = []
      else if (line.kind === 'edit') openEditor(line.path)
      else push({ type: 'line', line })
    }
    for (const notice of result.notices) push({ type: 'notice', author: notice.author, text: notice.text })
    if (result.solvedNow) {
      push({ type: 'solved' })
      record(level.id, result.session)
      sparkKey.value++
      // let the spark play before the dialog covers it
      clearTimeout(debriefTimer)
      debriefTimer = setTimeout(() => {
        debriefOpen.value = true
      }, DEBRIEF_DELAY_MS)
    }
  }

  /** One line typed in the terminal. */
  function run(line: string) {
    push({ type: 'input', text: line, prompt: prompt.value })
    apply(submit(session.value, level, line))
  }

  /** Save from the editor panel; counts like a command. */
  function save(content: string) {
    if (!editor.value) return
    const { path } = editor.value
    editor.value = null
    push({ type: 'line', line: { kind: 'out', text: t('terminal.saved', { path }) } })
    apply(saveFile(session.value, level, path, content))
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

  return {
    level,
    session,
    log,
    prompt,
    completion,
    conflictedFiles,
    hasOrigin,
    showOrigin,
    next,
    goals,
    stats,
    graph,
    editor,
    debriefOpen,
    sparkKey,
    run,
    save,
    openEditor,
    listCandidates,
    clearTerminal,
    reset,
    hint: () => run('hint')
  }
}
