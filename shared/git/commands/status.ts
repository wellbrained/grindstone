import { parseArgs } from '../args'
import { shortId } from '../objects/hash'
import { done, err, fail, hint, out, ref, toned } from '../output'
import { headId } from '../state'
import { computeStatus } from '../worktree'
import type { Command, OutputLine, Repo, Tree } from '../types'
import { notARepo, trackingInfo } from './common'

const blank = () => out('')

/** The long `git status` text, also printed by `git commit` when there is nothing to commit. */
export function statusLines(repo: Repo, workdir: Tree): OutputLine[] {
  const status = computeStatus(repo, workdir)
  const lines: OutputLine[] = []
  const operation = repo.operation
  const head = headId(repo)

  if (operation?.type === 'rebase') {
    const onto = shortId(operation.onto)
    lines.push(out(`${operation.interactive ? 'interactive ' : ''}rebase in progress; onto ${onto}`))
    lines.push(operation.branch
      ? out('You are currently rebasing branch \'', ref(operation.branch), `' on '${onto}'.`)
      : out(`You are currently rebasing on '${onto}'.`))
    if (status.unmerged.length) {
      lines.push(hint('  (fix conflicts and then run "git rebase --continue")'))
      lines.push(hint('  (use "git rebase --skip" to skip this patch)'))
      lines.push(hint('  (use "git rebase --abort" to check out the original branch)'))
    } else {
      lines.push(hint('  (all conflicts fixed: run "git rebase --continue")'))
    }
    lines.push(blank())
  } else {
    if (repo.head.type === 'branch') {
      lines.push(out('On branch ', ref(repo.head.name)))
      const tracking = trackingInfo(repo, repo.head.name)
      if (tracking.length) lines.push(...tracking, blank())
    } else {
      lines.push(out(`HEAD detached at ${shortId(repo.head.commit)}`))
    }
    if (!head) lines.push(blank(), out('No commits yet'), blank())
    if (operation?.type === 'merge') {
      if (status.unmerged.length) {
        lines.push(out('You have unmerged paths.'))
        lines.push(hint('  (fix conflicts and run "git commit")'))
        lines.push(hint('  (use "git merge --abort" to abort the merge)'))
      } else {
        lines.push(out('All conflicts fixed but you are still merging.'))
        lines.push(hint('  (use "git commit" to conclude merge)'))
      }
      lines.push(blank())
    }
  }

  if (status.staged.length) {
    lines.push(out('Changes to be committed:'))
    lines.push(hint(head ? '  (use "git restore --staged <file>..." to unstage)' : '  (use "git rm --cached <file>..." to unstage)'))
    lines.push(...status.staged.map(entry => toned(out(`\t${`${entry.label}:`.padEnd(12)}${entry.path}`), 'added')))
    lines.push(blank())
  }
  if (status.unmerged.length) {
    const removal = status.unmerged.some(entry => entry.label.startsWith('deleted'))
    lines.push(out('Unmerged paths:'))
    if (operation?.type === 'rebase') lines.push(hint('  (use "git restore --staged <file>..." to unstage)'))
    lines.push(hint(`  (use "git ${removal ? 'add/rm' : 'add'} <file>..." to mark resolution)`))
    lines.push(...status.unmerged.map(entry => toned(out(`\t${`${entry.label}:`.padEnd(17)}${entry.path}`), 'removed')))
    lines.push(blank())
  }
  if (status.unstaged.length) {
    const removal = status.unstaged.some(entry => entry.label === 'deleted')
    lines.push(out('Changes not staged for commit:'))
    lines.push(hint(`  (use "git ${removal ? 'add/rm' : 'add'} <file>..." to update what will be committed)`))
    lines.push(hint('  (use "git restore <file>..." to discard changes in working directory)'))
    lines.push(...status.unstaged.map(entry => toned(out(`\t${`${entry.label}:`.padEnd(12)}${entry.path}`), 'removed')))
    lines.push(blank())
  }
  if (status.untracked.length) {
    lines.push(out('Untracked files:'))
    lines.push(hint('  (use "git add <file>..." to include in what will be committed)'))
    lines.push(...status.untracked.map(path => toned(out(`\t${path}`), 'removed')))
    lines.push(blank())
  }

  if (!status.staged.length) {
    if (status.unmerged.length || status.unstaged.length) lines.push(out('no changes added to commit (use "git add" and/or "git commit -a")'))
    else if (status.untracked.length) lines.push(out('nothing added to commit but untracked files present (use "git add" to track)'))
    else if (!head) lines.push(out('nothing to commit (create/copy files and use "git add" to track)'))
    else if (operation?.type !== 'merge') lines.push(out('nothing to commit, working tree clean'))
  }

  while (lines.length && lines[lines.length - 1]!.text === '') lines.pop()
  return lines
}

const UNMERGED_CODES: Record<string, string> = {
  'both modified': 'UU',
  'both added': 'AA',
  'deleted by us': 'DU',
  'deleted by them': 'UD'
}

/** `git status -s`: two status letters per path. */
function shortLines(repo: Repo, workdir: Tree): OutputLine[] {
  const status = computeStatus(repo, workdir)
  const codes = new Map<string, [string, string]>()
  const letter = (label: string) => label === 'new file' ? 'A' : label === 'deleted' ? 'D' : 'M'
  for (const entry of status.staged) codes.set(entry.path, [letter(entry.label), ' '])
  for (const entry of status.unstaged) codes.set(entry.path, [codes.get(entry.path)?.[0] ?? ' ', letter(entry.label)])
  const tracked = [...codes.keys()].sort().map((path) => {
    const [x, y] = codes.get(path)!
    return out(`${x}${y} ${path}`)
  })
  return [
    ...status.unmerged.map(entry => toned(out(`${UNMERGED_CODES[entry.label]} ${entry.path}`), 'removed')),
    ...tracked,
    ...status.untracked.map(path => toned(out(`?? ${path}`), 'removed'))
  ]
}

export const status: Command = (state, argv) => {
  if (!state.repo) return notARepo(state)
  const parsed = parseArgs('status', argv, { flags: ['-s'], alias: { '--short': '-s' } })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  return done(state, parsed.args.flags.has('-s') ? shortLines(state.repo, state.workdir) : statusLines(state.repo, state.workdir))
}
