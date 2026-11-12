import { done, err, fail, out } from '../output'
import type { Command } from '../types'
import { add } from './add'
import { branch } from './branch'
import { cherryPick } from './cherry-pick'
import { commit } from './commit'
import { diff } from './diff'
import { init } from './init'
import { log } from './log'
import { merge } from './merge'
import { rebase } from './rebase'
import { reflog } from './reflog'
import { fetch, pull, push, remote } from './remote'
import { reset } from './reset'
import { restore } from './restore'
import { revert } from './revert'
import { rm } from './rm'
import { stash } from './stash'
import { status } from './status'
import { tag } from './tag'
import { checkout, switchCommand } from './switch'

export const GIT_COMMANDS: Record<string, { run: Command, summary: string }> = {
  'init': { run: init, summary: 'Create an empty Git repository' },
  'status': { run: status, summary: 'Show the working tree status' },
  'add': { run: add, summary: 'Add file contents to the index' },
  'rm': { run: rm, summary: 'Remove files from the working tree and from the index' },
  'commit': { run: commit, summary: 'Record changes to the repository' },
  'log': { run: log, summary: 'Show commit logs' },
  'diff': { run: diff, summary: 'Show changes between the index and the working tree' },
  'branch': { run: branch, summary: 'List, create, or delete branches' },
  'switch': { run: switchCommand, summary: 'Switch branches' },
  'checkout': { run: checkout, summary: 'Switch branches or restore working tree files' },
  'tag': { run: tag, summary: 'Create, list or delete tags' },
  'restore': { run: restore, summary: 'Restore working tree files' },
  'reset': { run: reset, summary: 'Reset current HEAD to the specified state' },
  'revert': { run: revert, summary: 'Revert some existing commits' },
  'cherry-pick': { run: cherryPick, summary: 'Apply the changes introduced by some existing commits' },
  'stash': { run: stash, summary: 'Stash the changes in a dirty working directory away' },
  'reflog': { run: reflog, summary: 'Show where HEAD and your branches have been' },
  'merge': { run: merge, summary: 'Join two development histories together' },
  'rebase': { run: rebase, summary: 'Reapply commits on top of another base tip' },
  'fetch': { run: fetch, summary: 'Download objects and refs from origin' },
  'pull': { run: pull, summary: 'Fetch from origin and integrate with a local branch' },
  'push': { run: push, summary: 'Update remote refs along with associated objects' },
  'remote': { run: remote, summary: 'Show the remote repository you track' }
}

/** Real git commands the trainer does not simulate (yet). */
const KNOWN_ELSEWHERE = [
  'am', 'apply', 'archive', 'bisect', 'blame', 'bundle', 'cat-file', 'cherry', 'clean', 'clone',
  'config', 'describe', 'format-patch', 'fsck', 'gc', 'grep', 'gui', 'ls-files', 'ls-remote', 'ls-tree',
  'maintenance', 'mv', 'notes', 'prune', 'range-diff', 'rerere',
  'rev-list', 'rev-parse', 'shortlog', 'show', 'show-branch', 'sparse-checkout',
  'submodule', 'whatchanged', 'worktree'
]

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = current
    }
  }
  return row[b.length]!
}

const usage = () => [
  'usage: git <command> [<args>]',
  '',
  'Commands in this trainer:',
  ...Object.entries(GIT_COMMANDS).map(([name, entry]) => `   ${name.padEnd(12)}${entry.summary}`)
]

/** Runs `git <argv...>`. */
export const git: Command = (state, argv) => {
  const [name, ...args] = argv
  if (name === undefined || name === '--help' || name === '-h' || name === 'help') return done(state, usage().map(text => out(text)))
  if (name === '--version') return done(state, [out('git version 2.47.0 (grindstone)')])

  const command = GIT_COMMANDS[name]
  if (command) return command.run(state, args)
  if (KNOWN_ELSEWHERE.includes(name)) return fail(state, [err(`git: '${name}' is not in this trainer yet`)])

  const candidates = [...Object.keys(GIT_COMMANDS), ...KNOWN_ELSEWHERE]
  const best = Math.min(...candidates.map(candidate => distance(name, candidate)))
  const similar = best <= 2 ? candidates.filter(candidate => distance(name, candidate) === best) : []
  const output = [err(`git: '${name}' is not a git command. See 'git --help'.`)]
  if (similar.length) {
    output.push(err(''), err(similar.length === 1 ? 'The most similar command is' : 'The most similar commands are'))
    output.push(...similar.map(candidate => err(`\t${candidate}`)))
  }
  return fail(state, output)
}
