// git tag: list, create (lightweight or annotated), delete (docs/features/git-model.md, "Tags").
import { parseArgs } from '../args'
import { subject } from '../objects/commit'
import { shortId, tagId } from '../objects/hash'
import { done, err, fail, hint, out } from '../output'
import { isValidBranchName, resolveRev, tagNames } from '../refs'
import { BASE_TIME, own, without } from '../state'
import type { Command, GitState, Repo, Tag } from '../types'
import { fatal, notARepo, withRepo } from './common'

/** What `git tag -d` and `-f` name: the tag object of an annotated tag, else the commit. */
const tagTarget = (tag: Tag) => tag.annotation?.id ?? tag.commit

/** A `git tag -l` pattern: `*` and `?` like fnmatch, everything else literal. */
function matcher(pattern: string): (name: string) => boolean {
  const source = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  const regex = new RegExp(`^${source}$`)
  return name => regex.test(name)
}

function list(state: GitState, repo: Repo, patterns: string[], annotations: boolean) {
  const matches = patterns.map(matcher)
  const names = tagNames(repo.tags).filter(name => !matches.length || matches.some(match => match(name)))
  return done(state, names.map((name) => {
    if (!annotations) return out(name)
    const tag = repo.tags[name]!
    const text = tag.annotation ? tag.annotation.message.split('\n')[0]! : subject(repo.commits[tag.commit]!)
    return out(`${name.padEnd(15)} ${text}`)
  }))
}

function remove(state: GitState, repo: Repo, names: string[]) {
  // git deletes nothing, silently, when no name is given
  if (!names.length) return done(state)
  let tags = repo.tags
  const output = []
  let exitCode = 0
  for (const name of names) {
    const tag = own(tags, name)
    if (!tag) {
      output.push(err(`error: tag '${name}' not found.`))
      exitCode = 1
      continue
    }
    tags = without(tags, name)
    output.push(out(`Deleted tag '${name}' (was ${shortId(tagTarget(tag))})`))
  }
  return { state: withRepo(state, { ...repo, tags }), output, exitCode }
}

export const tag: Command = (state, argv) => {
  const repo = state.repo
  if (!repo) return notARepo(state)
  const parsed = parseArgs('tag', argv, {
    flags: ['-a', '-d', '-l', '-f', '-n'],
    values: ['-m'],
    alias: { '--annotate': '-a', '--delete': '-d', '--list': '-l', '--force': '-f', '--message': '-m' }
  })
  if (!parsed.ok) return fail(state, [err(parsed.error)])
  const { flags, values, positionals } = parsed.args

  if (flags.has('-d')) return remove(state, repo, positionals)
  const message = values['-m']?.join('\n\n')
  const annotated = flags.has('-a') || message !== undefined
  if (flags.has('-l') || flags.has('-n') || (!positionals.length && !annotated)) return list(state, repo, positionals, flags.has('-n'))

  const [name, rev = 'HEAD', ...extra] = positionals
  if (!name) return fail(state, [err('usage: git tag [-a] [-m <msg>] <tagname> [<commit>]')], 129)
  if (extra.length) return fatal(state, 'fatal: too many arguments')
  if (!isValidBranchName(name)) return fatal(state, `fatal: '${name}' is not a valid tag name.`)
  const commit = resolveRev(repo, rev)
  if (!commit) return fatal(state, `fatal: Failed to resolve '${rev}' as a valid ref.`)
  const existing = own(repo.tags, name)
  if (existing && !flags.has('-f')) return fatal(state, `fatal: tag '${name}' already exists`)
  if (annotated && message === undefined) {
    return fail(state, [
      err('error: there is no editor in this trainer for tag messages'),
      hint(`hint: write the message on the command line: git tag -a ${name} -m "message"`)
    ])
  }

  let created: Tag = { commit }
  if (message !== undefined) {
    // the tag is made "now": the logical time of the newest commit, without moving the clock
    const annotation = { message: message.trim(), tagger: state.user, timestamp: BASE_TIME + state.clock * 60 }
    created = { commit, annotation: { id: tagId({ commit, name, ...annotation }), ...annotation } }
  }
  const next = withRepo(state, { ...repo, tags: { ...repo.tags, [name]: created } })
  return done(next, existing ? [out(`Updated tag '${name}' (was ${shortId(tagTarget(existing))})`)] : [])
}
