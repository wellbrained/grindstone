import { parseArgs } from '../args'
import { subject } from '../objects/commit'
import { range, topoOrder } from '../objects/graph'
import type { Commits } from '../objects/graph'
import { shortId } from '../objects/hash'
import { done, err, fail, line, out } from '../output'
import type { Part } from '../output'
import { decorations, resolveRev } from '../refs'
import { headId } from '../state'
import type { Command, Commit, OutputLine, Repo } from '../types'
import { notARepo, requireCommit } from './common'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const two = (value: number) => String(value).padStart(2, '0')

/** git's default date format, always in UTC: "Mon Mar 2 09:01:00 2026 +0000". */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const time = `${two(date.getUTCHours())}:${two(date.getUTCMinutes())}:${two(date.getUTCSeconds())}`
  return `${DAYS[date.getUTCDay()]} ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()} ${time} ${date.getUTCFullYear()} +0000`
}

interface GraphRow {
  /** Graph characters before the text, e.g. "| * ". */
  prefix: string
  /** Prefix for further lines of the same commit. */
  continuation: string
  /** Connector lines drawn after the commit ("|\", "|/"). */
  connectors: string[]
}

/** A basic version of git's --graph: one column per open line of history. */
function graphRows(commits: Commits, order: string[]): Map<string, GraphRow> {
  const shown = new Set(order)
  const rows = new Map<string, GraphRow>()
  let columns: string[] = []

  for (const id of order) {
    let index = columns.indexOf(id)
    if (index === -1) {
      columns.push(id)
      index = columns.length - 1
    }
    const parents = commits[id]!.parents.filter(parent => shown.has(parent))
    const next = [...columns]
    let added = 0
    if (!parents.length) {
      next.splice(index, 1)
    } else {
      next[index] = parents[0]!
      for (const parent of parents.slice(1)) {
        if (!next.includes(parent)) next.splice(index + 1 + added++, 0, parent)
      }
    }

    const width = 2 * Math.max(columns.length, next.length)
    const prefix = columns.map((_, i) => i === index ? '*' : '|').join(' ').padEnd(width)
    const continuation = next.map(() => '|').join(' ').padEnd(width)
    const connectors: string[] = []

    if (added) {
      const chars: string[] = []
      for (let i = 0; i <= index; i++) chars[2 * i] = '|'
      chars[2 * index + 1] = '\\'
      for (let i = index + 1; i < columns.length; i++) chars[2 * (i + added) - 1] = '\\'
      connectors.push(Array.from(chars, char => char ?? ' ').join('').trimEnd())
    }

    // lines of history that meet again close with "|/"
    columns = next
    for (let j = 1; j < columns.length; j++) {
      if (columns.indexOf(columns[j]!) < j) {
        const chars: string[] = []
        for (let k = 0; k < j; k++) chars[2 * k] = '|'
        chars[2 * j - 1] = '/'
        for (let k = j + 1; k < columns.length; k++) chars[2 * k - 1] = '/'
        connectors.push(Array.from(chars, char => char ?? ' ').join('').trimEnd())
        columns.splice(j, 1)
        j--
      }
    }
    rows.set(id, { prefix, continuation, connectors })
  }
  return rows
}

function commitBlock(repo: Repo, commit: Commit, oneline: boolean, row?: GraphRow): OutputLine[] {
  const prefix = row?.prefix ?? ''
  const more = row ? row.continuation.trimEnd() : ''
  const pad = (text: string) => more ? `${more}${text ? ` ${text}` : ''}`.trimEnd() : text
  const lines: OutputLine[] = []
  const decorated: Part[] = decorations(repo, commit.id)

  if (oneline) {
    lines.push(line('out', prefix, shortId(commit.id), ...decorated, ` ${subject(commit)}`))
  } else {
    lines.push(line('out', prefix, `commit ${commit.id}`, ...decorated))
    if (commit.parents.length > 1) lines.push(out(pad(`Merge: ${commit.parents.map(shortId).join(' ')}`)))
    lines.push(out(pad(`Author: ${commit.author.name} <${commit.author.email}>`)))
    lines.push(out(pad(`Date:   ${formatDate(commit.timestamp)}`)))
    lines.push(out(pad('')))
    for (const text of commit.message.split('\n')) lines.push(out(pad(`    ${text}`)))
  }
  return lines
}

export const log: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const normalized = argv.flatMap(arg => /^-\d+$/.test(arg) ? ['-n', arg.slice(1)] : [arg])
  const parsed = parseArgs('log', normalized, {
    flags: ['--oneline', '--graph', '--all'],
    values: ['-n'],
    alias: { '--max-count': '-n' }
  })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { flags, values, positionals } = parsed.args

  const include: string[] = []
  const exclude: string[] = []
  for (const arg of positionals) {
    const parts = arg.includes('..') ? arg.split('..') : null
    const revs = parts ? [[parts[0] || 'HEAD', exclude], [parts[1] || 'HEAD', include]] as const : arg.startsWith('^') ? [[arg.slice(1), exclude]] as const : [[arg, include]] as const
    for (const [rev, target] of revs) {
      const id = resolveRev(repo, rev)
      if (!id) {
        return fail(state, [
          err(`fatal: ambiguous argument '${arg}': unknown revision or path not in the working tree.`),
          err('Use \'--\' to separate paths from revisions, like this:'),
          err('\'git <command> [<revision>...] -- [<file>...]\'')
        ], 128)
      }
      target.push(id)
    }
  }
  if (flags.has('--all')) {
    include.push(...Object.values(repo.branches), ...Object.values(repo.remoteBranches))
    const head = headId(repo)
    if (head) include.push(head)
  }
  if (!include.length) {
    const head = requireCommit(state, repo)
    if (typeof head !== 'string') return head
    include.push(head)
  }

  const graph = flags.has('--graph')
  let ids = graph
    ? topoOrder(repo.commits, include, exclude)
    : range(repo.commits, include, exclude).map(commit => commit.id)
  const limit = values['-n']?.[0]
  if (limit !== undefined) {
    const count = Number(limit)
    if (!Number.isInteger(count) || count < 0) return fail(state, [err(`fatal: '${limit}': not an integer`)], 128)
    ids = ids.slice(0, count)
  }

  const rows = graph ? graphRows(repo.commits, ids) : undefined
  const oneline = flags.has('--oneline')
  const output: OutputLine[] = []
  ids.forEach((id, i) => {
    const row = rows?.get(id)
    if (!oneline && i > 0) output.push(out(row ? row.prefix.replace('*', '|').trimEnd() : ''))
    output.push(...commitBlock(repo, repo.commits[id]!, oneline, row))
    if (row) output.push(...row.connectors.map(text => out(text)))
  })
  return done(state, output)
}
