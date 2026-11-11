import { describe, expect, it } from 'vitest'
import {
  commitsOf,
  conflictsInProgress,
  hasConflictMarkers,
  hasMergeCommits,
  isAncestor,
  remoteBranchHead,
  repo,
  teammateCommit,
  writeFile
} from '../../../shared/git'
import type { GitState } from '../../../shared/git'
import { exec, ok } from './helpers'

// Planned level 6 (docs/adr/0001-plan.md): keep a feature branch in sync while a teammate pushes to main.

const setup = () => repo()
  .file('README.md', '# Project\n')
  .file('src/login.ts', 'export function login() {\n  return false\n}\n')
  .commit('Initial commit')
  .origin()
  .switch('feature/login', { create: true })
  .file('src/login.ts', 'export function login(user: string) {\n  return user.length > 0\n}\n')
  .commit('Validate the user name')
  .file('src/login-form.ts', 'export const fields = [\'user\']\n')
  .commit('Add login form')
  .build()

/** The teammate event that fires right before the first push. */
const annaPushes = (state: GitState) => {
  const first = teammateCommit(state, {
    author: 'Anna',
    message: 'Log failed logins',
    files: { 'src/login.ts': 'export function login() {\n  console.warn(\'login failed\')\n  return false\n}\n' }
  })
  return teammateCommit(first, {
    author: 'Anna',
    message: 'Document setup',
    files: { 'README.md': '# Project\n\nRun pnpm dev.\n' }
  })
}

describe('level 6: teammate sync', () => {
  it('is solved by rebasing onto origin/main and pushing with --force-with-lease', () => {
    let state = setup()
    expect(commitsOf(state, 'origin/main..feature/login')).toHaveLength(2)

    state = annaPushes(state)
    state = ok(state, 'git push -u origin feature/login', 'git fetch')

    const rebase = exec(state, 'git rebase origin/main')
    expect(rebase.text).toContain('CONFLICT (content): Merge conflict in src/login.ts')
    state = rebase.state
    expect(conflictsInProgress(state)).toBe(true)
    expect(hasConflictMarkers(state.workdir['src/login.ts']!)).toBe(true)

    // the editor panel resolves the conflict
    state = writeFile(state, 'src/login.ts', 'export function login(user: string) {\n  if (!user) console.warn(\'login failed\')\n  return user.length > 0\n}\n')
    state = ok(state, 'git add src/login.ts', 'git rebase --continue')

    const plainPush = exec(state, 'git push')
    expect(plainPush.text).toContain('! [rejected]        feature/login -> feature/login (non-fast-forward)')

    state = ok(state, 'git push --force-with-lease')

    // goals
    expect(isAncestor(state, 'origin/main', 'feature/login')).toBe(true)
    expect(hasMergeCommits(state, 'origin/main..feature/login')).toBe(false)
    expect(conflictsInProgress(state)).toBe(false)
    expect(remoteBranchHead(state, 'feature/login')).toBe(state.repo!.branches['feature/login'])
    expect(commitsOf(state, 'origin/main..feature/login').map(commit => commit.message)).toEqual(['Add login form', 'Validate the user name'])
    expect(state.workdir['README.md']).toBe('# Project\n\nRun pnpm dev.\n')
  })

  it('is not solved by merging origin/main', () => {
    let state = ok(annaPushes(setup()), 'git fetch')
    state = exec(state, 'git merge origin/main').state
    state = writeFile(state, 'src/login.ts', 'merged\n')
    state = ok(state, 'git add .', 'git commit -m "Merge origin/main"')
    expect(isAncestor(state, 'origin/main', 'feature/login')).toBe(true)
    expect(hasMergeCommits(state, 'origin/main..feature/login')).toBe(true)
  })
})
