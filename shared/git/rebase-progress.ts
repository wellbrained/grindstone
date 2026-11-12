// The "where is the rebase" block git prints in `git status` and at the end of a commit message during a rebase:
// the commands done so far (the last two) and the ones still to come (the next two).
import { subject } from './objects/commit'
import { shortId } from './objects/hash'
import type { RebaseOperation, RebaseStep, Repo } from './types'

const SHOWN = 2

const line = (repo: Repo, step: RebaseStep) => `   ${step.action} ${shortId(step.commit)} # ${subject(repo.commits[step.commit]!)}`

/** The commands the rebase has run, then the ones it still has to run, in git's words (plain text, no `# ` prefix). */
export function rebaseProgress(repo: Repo, operation: RebaseOperation): string[] {
  const done = operation.done ?? []
  const todo = operation.todo
  // git's rebase always runs through the sequencer, so even a plain rebase says "interactive"
  const lines = [`interactive rebase in progress; onto ${shortId(operation.onto)}`]
  if (done.length) {
    lines.push(done.length === 1 ? 'Last command done (1 command done):' : `Last commands done (${done.length} commands done):`)
    lines.push(...done.slice(-SHOWN).map(step => line(repo, step)))
    if (done.length > SHOWN) lines.push('  (see more in file .git/rebase-merge/done)')
  } else {
    lines.push('No commands done.')
  }
  if (todo.length) {
    lines.push(todo.length === 1 ? 'Next command to do (1 remaining command):' : `Next commands to do (${todo.length} remaining commands):`)
    lines.push(...todo.slice(0, SHOWN).map(step => line(repo, step)))
    lines.push('  (use "git rebase --edit-todo" to view and edit)')
  } else {
    lines.push('No commands remaining.')
  }
  return lines
}
