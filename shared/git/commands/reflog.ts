// git reflog [show] [<ref>]: where HEAD (or a branch) pointed, newest first, as `<id> (<refs>) HEAD@{n}: <message>`.
import { parseArgs } from '../args'
import { shortId } from '../objects/hash'
import { done, err, fail, line } from '../output'
import { HEAD_LOG, reflogOf } from '../reflog'
import { decorations } from '../refs'
import { own } from '../state'
import type { Command, GitState } from '../types'
import { fatal, notARepo, requireCommit } from './common'

/** Real subcommands of `git reflog` the trainer does not run. */
const ELSEWHERE = ['expire', 'delete', 'exists', 'list', 'drop']

const unknownRevision = (state: GitState, name: string) => fatal(state, [
  `fatal: ambiguous argument '${name}': unknown revision or path not in the working tree.`,
  'Use \'--\' to separate paths from revisions, like this:',
  '\'git <command> [<revision>...] -- [<file>...]\''
].join('\n'))

export const reflog: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const [first, ...rest] = argv
  if (first !== undefined && ELSEWHERE.includes(first)) return fail(state, [err(`git reflog ${first} is not in this trainer yet`)])
  const args = first === 'show' ? rest : argv
  const normalized = args.flatMap(arg => /^-\d+$/.test(arg) ? ['-n', arg.slice(1)] : [arg])
  const parsed = parseArgs('reflog', normalized, { values: ['-n'], alias: { '--max-count': '-n' } })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { values, positionals } = parsed.args
  if (positionals.length > 1) return fail(state, [err('git reflog: showing several logs at once is not in this trainer yet')])

  const head = requireCommit(state, repo)
  if (typeof head !== 'string') return head

  // HEAD by default; a branch by name (a deleted branch has no log any more, like in git)
  const asked = positionals[0] ?? 'HEAD'
  const name = asked === '@' ? HEAD_LOG : asked.replace(/^refs\/heads\//, '')
  if (name !== HEAD_LOG && own(repo.branches, name) === undefined) return unknownRevision(state, asked)
  let entries = reflogOf(repo, name)

  const limit = values['-n']?.[0]
  if (limit !== undefined) {
    const count = Number(limit)
    if (!Number.isInteger(count) || count < 0) return fail(state, [err(`fatal: '${limit}': not an integer`)], 128)
    entries = entries.slice(0, count)
  }
  const label = name === HEAD_LOG ? 'HEAD' : asked
  return done(state, entries.map((entry, i) => line('out', shortId(entry.id), ...decorations(repo, entry.id), ` ${label}@{${i}}: ${entry.message}`)))
}
