// The git play page on top of usePlaySession: the terminal log, the editor (panel and tabs), the file tree, the file git
// waits for (git rebase -i) and the commit graph. The session, goals, recording, stats events and debrief are shared.
import { gitCommandNames, shellCommandNames, unmergedPaths, waitingEditor } from '#shared/git'
import type { GitState, OutputLine } from '#shared/git'
import { TRAINER_COMMANDS, saveEditor, saveFile, startLevel, submit } from '#shared/levels'
import type { GitLevel, GitSession, SubmitResult } from '#shared/levels'
import type { Prompt } from '~/utils/terminal'

export type LogBody
  = | { type: 'intro' }
    | { type: 'input', text: string, prompt: Prompt }
    | { type: 'line', line: OutputLine }
    | { type: 'notice', author: string, text: string }
    | { type: 'solved' }

export type LogEntry = LogBody & { id: number }

interface PlayState {
  session: GitSession
  log: LogEntry[]
  nextId: number
}

export interface GitPlayOptions {
  /** Where `edit <file>` and the conflicted-files list open a file; default: the editor panel. */
  onEdit?: (path: string) => void
}

export function useGitPlay(level: GitLevel, options: GitPlayOptions = {}) {
  const { t } = useI18n()

  const editor = ref<{ path: string, content: string } | null>(null)
  const fresh = (): PlayState => ({ session: startLevel(level), log: [{ id: 0, type: 'intro' }], nextId: 1 })
  const play = usePlaySession(level, {
    fresh,
    onRestart: () => {
      editor.value = null
    }
  })
  const { store, session, next, goals, best, debriefOpen, progressBefore, sparkKey, again } = play
  const showOrigin = ref(false)

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

  const stats = computed(() => ({
    commands: session.value.commandCount,
    solution: level.solution.length,
    hints: session.value.hintsUsed,
    // the best run so far (this one included, once it is recorded)
    best: best.value
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
    play.update(result.session)
    for (const line of result.output) {
      if (line.kind === 'clear') store.value.log = []
      else if (line.kind === 'edit') edit(line.path)
      else push({ type: 'line', line })
    }
    for (const notice of result.notices) push({ type: 'notice', author: notice.author, text: notice.text })
    if (result.solvedNow) {
      push({ type: 'solved' })
      play.solved(result.session)
    }
  }

  /** One line typed in the terminal. Typing in a level makes it the one Continue opens. */
  function run(line: string) {
    play.markPlayed()
    push({ type: 'input', text: line, prompt: prompt.value })
    apply(submit(session.value, level, line))
  }

  /** A save through the engine that counts like a command: the level is played, the terminal says it was saved. */
  function counted(path: string, save: () => SubmitResult) {
    play.markPlayed()
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
    progressBefore,
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

export type GitPlaySession = ReturnType<typeof useGitPlay>
