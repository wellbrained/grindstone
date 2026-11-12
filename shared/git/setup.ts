// Setup builder for levels: describes a starting state step by step.
// Setup steps are author code, not user input: a failing step throws so a broken level fails its test.
import { commitIndex } from './commands/commit'
import { authorFor } from './objects/commit'
import { reachable } from './objects/graph'
import { runArgv, run as runLine } from './run'
import { DEFAULT_BRANCH, DEFAULT_ORIGIN_URL, createState, normalizePath, without, writeFile } from './state'
import type { StateOptions } from './state'
import { teammateCommit } from './teammate'
import type { Author, CommandResult, GitState } from './types'

/** Files written by the builder end with a newline, like files written by an editor. */
const withNewline = (content: string) => content === '' || content.endsWith('\n') ? content : `${content}\n`

function check(result: CommandResult, step: string): GitState {
  if (result.exitCode !== 0) {
    throw new Error(`setup step "${step}" failed:\n${result.output.map(line => line.text).join('\n')}`)
  }
  return result.state
}

export class SetupBuilder {
  constructor(private state: GitState) {}

  private git(...argv: string[]) {
    this.state = check(runArgv(this.state, ['git', ...argv]), `git ${argv.join(' ')}`)
    return this
  }

  /** Writes a working tree file (not staged). */
  file(path: string, content: string) {
    this.state = writeFile(this.state, path, withNewline(content))
    return this
  }

  /** Deletes a working tree file. */
  remove(path: string) {
    this.state = { ...this.state, workdir: without(this.state.workdir, normalizePath(path)) }
    return this
  }

  /** Stages paths (all changes by default) without committing. */
  stage(...paths: string[]) {
    return this.git('add', ...(paths.length ? paths : ['-A']))
  }

  /** Stages every change and commits it on the current branch. */
  commit(message: string, options: { author?: string | Author } = {}) {
    this.git('add', '-A')
    this.state = commitIndex(this.state, { message, author: options.author ? authorFor(options.author) : undefined }).state
    return this
  }

  branch(name: string, start?: string) {
    return this.git('branch', name, ...(start ? [start] : []))
  }

  switch(name: string, options: { create?: boolean } = {}) {
    return options.create ? this.git('switch', '-c', name) : this.git('switch', name)
  }

  /** `git merge <rev>`; with `conflicts: true` it must stop with conflicts (for a level that starts inside the merge). */
  merge(rev: string, options: { conflicts?: boolean } = {}) {
    if (!options.conflicts) return this.git('merge', rev)
    const result = runArgv(this.state, ['git', 'merge', rev])
    if (result.state.repo?.operation?.type !== 'merge' || !Object.keys(result.state.repo.unmerged).length) {
      throw new Error(`setup step "git merge ${rev}" was expected to stop with conflicts:\n${result.output.map(line => line.text).join('\n')}`)
    }
    this.state = result.state
    return this
  }

  /** `git rebase <upstream>`; with `conflicts: true` it must stop with conflicts (for a level that starts inside the rebase). */
  rebase(upstream: string, options: { conflicts?: boolean } = {}) {
    if (!options.conflicts) return this.git('rebase', upstream)
    const result = runArgv(this.state, ['git', 'rebase', upstream])
    if (result.state.repo?.operation?.type !== 'rebase' || !Object.keys(result.state.repo.unmerged).length) {
      throw new Error(`setup step "git rebase ${upstream}" was expected to stop with conflicts:\n${result.output.map(line => line.text).join('\n')}`)
    }
    this.state = result.state
    return this
  }

  /** Publishes every local branch to a new origin and tracks it (as if the repo had been cloned). */
  origin(options: { url?: string } = {}) {
    const repo = this.state.repo
    if (!repo) throw new Error('setup step "origin" needs a repository: start with repo()')
    const branches = { ...repo.branches }
    const kept = reachable(repo.commits, Object.values(branches))
    const commits = Object.fromEntries([...kept].map(id => [id, repo.commits[id]!]))
    const upstream = Object.fromEntries(Object.keys(branches).map(name => [name, name]))
    const current = repo.head.type === 'branch' ? repo.head.name : DEFAULT_BRANCH
    this.state = {
      ...this.state,
      origin: { name: 'origin', url: options.url ?? DEFAULT_ORIGIN_URL, commits, branches, defaultBranch: current },
      repo: { ...repo, remoteBranches: { ...branches }, upstream: { ...repo.upstream, ...upstream } }
    }
    return this
  }

  /** `git push -u origin <branch>` (current branch by default). */
  push(branch?: string) {
    const name = branch ?? (this.state.repo?.head.type === 'branch' ? this.state.repo.head.name : 'HEAD')
    return this.git('push', '-u', 'origin', name)
  }

  fetch() {
    return this.git('fetch')
  }

  /** A teammate commit on origin (the local repo only sees it after fetch or pull). */
  teammate(author: string | Author, message: string, files: Record<string, string | null>, options: { branch?: string } = {}) {
    const normalized = Object.fromEntries(Object.entries(files).map(([path, content]) => [path, content === null ? null : withNewline(content)]))
    this.state = teammateCommit(this.state, { author, message, files: normalized, branch: options.branch })
    return this
  }

  /** Runs any terminal line, e.g. `.run('git checkout -b hotfix')`. */
  run(line: string) {
    this.state = check(runLine(this.state, line), line)
    return this
  }

  /** Escape hatch for anything the builder does not cover. */
  update(change: (state: GitState) => GitState) {
    this.state = change(this.state)
    return this
  }

  build(): GitState {
    return this.state
  }
}

/** A folder without a repository (for levels that start with `git init`). */
export function folder(options: StateOptions = {}): SetupBuilder {
  return new SetupBuilder(createState(options))
}

/** An initialised, empty repository on main. */
export function repo(options: StateOptions = {}): SetupBuilder {
  return folder(options).run('git init')
}
