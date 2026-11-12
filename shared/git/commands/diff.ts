import { parseArgs } from '../args'
import { diffLines, hunks, splitLines } from '../diff'
import { blobId, shortId } from '../objects/hash'
import { done, err, fail, out, toned } from '../output'
import { resolveRev } from '../refs'
import { headTree, own } from '../state'
import { changedPaths } from '../worktree'
import type { Command, OutputLine, Tree } from '../types'
import { matchPathspec } from './add'
import { notARepo } from './common'

const meta = (text: string) => toned(out(text), 'meta')
const NULL_ID = '0000000'

/** One file of a unified diff, git style. */
export function fileDiff(path: string, before: string | undefined, after: string | undefined): OutputLine[] {
  const lines: OutputLine[] = [meta(`diff --git a/${path} b/${path}`)]
  const from = before === undefined ? NULL_ID : shortId(blobId(before))
  const to = after === undefined ? NULL_ID : shortId(blobId(after))
  if (before === undefined) lines.push(meta('new file mode 100644'), meta(`index ${from}..${to}`))
  else if (after === undefined) lines.push(meta('deleted file mode 100644'), meta(`index ${from}..${to}`))
  else lines.push(meta(`index ${from}..${to} 100644`))
  lines.push(meta(before === undefined ? '--- /dev/null' : `--- a/${path}`))
  lines.push(meta(after === undefined ? '+++ /dev/null' : `+++ b/${path}`))

  for (const hunk of hunks(diffLines(splitLines(before ?? ''), splitLines(after ?? '')))) {
    lines.push(meta(hunk.header))
    for (const edit of hunk.lines) {
      const sign = edit.type === 'add' ? '+' : edit.type === 'del' ? '-' : ' '
      const text = `${sign}${edit.line.replace(/\n$/, '')}`
      lines.push(edit.type === 'equal' ? out(text) : toned(out(text), edit.type === 'add' ? 'added' : 'removed'))
      if (!edit.line.endsWith('\n')) lines.push(out('\\ No newline at end of file'))
    }
  }
  return lines
}

export const diff: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const parsed = parseArgs('diff', argv, { flags: ['--staged'], alias: { '--cached': '--staged' } })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { flags, positionals, separator } = parsed.args

  if (!separator && positionals[0] && resolveRev(repo, positionals[0]) && state.workdir[positionals[0]] === undefined) {
    return fail(state, [err('git diff: comparing commits is not in this trainer yet (try git diff or git diff --staged)')])
  }

  const staged = flags.has('--staged')
  const before: Tree = staged ? headTree(repo) : repo.index
  // unstaged changes only cover tracked files
  const after: Tree = staged
    ? repo.index
    : Object.fromEntries(Object.keys(repo.index).flatMap(path => state.workdir[path] === undefined ? [] : [[path, state.workdir[path]!]]))

  let paths = changedPaths(before, after)
  if (positionals.length) {
    const wanted = new Set(positionals.flatMap(spec => matchPathspec(spec, paths)))
    paths = paths.filter(path => wanted.has(path))
  }
  return done(state, paths.flatMap(path => fileDiff(path, own(before, path), own(after, path))))
}
