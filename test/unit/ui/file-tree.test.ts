import { describe, expect, it } from 'vitest'
import { folder, repo, run } from '../../../shared/git'
import type { GitState } from '../../../shared/git'
import { buildFileTree, fileStatuses, folderPaths } from '../../../app/utils/file-tree'
import type { FolderNode, TreeNode } from '../../../app/utils/file-tree'

const exec = (state: GitState, ...lines: string[]) => lines.reduce((current, line) => {
  const result = run(current, line)
  expect(result.exitCode, `${line}: ${result.output.map(o => o.text).join('\n')}`).toBe(0)
  return result.state
}, state)

const names = (nodes: TreeNode[]) => nodes.map(node => node.type === 'folder' ? `${node.name}/` : node.name)

describe('fileStatuses', () => {
  it('has no statuses before git init', () => {
    const state = folder().file('a.txt', 'a').build()
    expect(fileStatuses(state)).toEqual({})
  })

  it('leaves clean files out and marks every kind of change', () => {
    const base = repo()
      .file('clean.txt', 'clean')
      .file('changed.txt', 'one')
      .file('staged.txt', 'one')
      .file('gone.txt', 'gone')
      .file('removed.txt', 'removed')
      .commit('start')
      .build()
    const state = exec(base,
      'echo two > changed.txt',
      'echo two > staged.txt',
      'git add staged.txt',
      'rm gone.txt',
      'rm removed.txt',
      'git add removed.txt',
      'echo new > new.txt',
      'echo added > added.txt',
      'git add added.txt'
    )
    expect(fileStatuses(state)).toEqual({
      'changed.txt': 'modified',
      'staged.txt': 'modified',
      'gone.txt': 'deleted',
      'removed.txt': 'deleted',
      'new.txt': 'untracked',
      'added.txt': 'added'
    })
  })

  it('marks unmerged files as conflicted', () => {
    const base = repo()
      .file('f.txt', 'base')
      .commit('base')
      .switch('topic', { create: true })
      .file('f.txt', 'topic')
      .commit('topic')
      .switch('main')
      .file('f.txt', 'main')
      .commit('main')
      .build()
    const merged = run(base, 'git merge topic').state
    expect(fileStatuses(merged)).toEqual({ 'f.txt': 'conflicted' })
    expect(fileStatuses(exec(merged, 'echo fixed > f.txt', 'git add f.txt'))).toEqual({ 'f.txt': 'modified' })
  })
})

describe('buildFileTree', () => {
  it('nests folders, folders first, alphabetical without case', () => {
    const tree = buildFileTree({ 'README.md': '', 'src/b.ts': '', 'src/a.ts': '', 'src/lib/x.ts': '', 'app.js': '', 'docs/Guide.md': '' }, {})
    expect(names(tree)).toEqual(['docs/', 'src/', 'app.js', 'README.md'])
    const src = tree[1] as FolderNode
    expect(src.path).toBe('src')
    expect(names(src.children)).toEqual(['lib/', 'a.ts', 'b.ts'])
    expect((src.children[0] as FolderNode).children[0]).toMatchObject({ type: 'file', name: 'x.ts', path: 'src/lib/x.ts', status: null, deleted: false })
  })

  it('puts the status on files and the most urgent one on their folders', () => {
    const tree = buildFileTree(
      { 'src/a.ts': '', 'src/b.ts': '', 'src/deep/c.ts': '', 'clean/d.ts': '' },
      { 'src/a.ts': 'untracked', 'src/deep/c.ts': 'conflicted' }
    )
    const [clean, src] = tree as FolderNode[]
    expect(clean!.status).toBeNull()
    expect(src!.status).toBe('conflicted')
    expect((src!.children[0] as FolderNode).status).toBe('conflicted')
    expect(src!.children.find(node => node.name === 'a.ts')!.status).toBe('untracked')
    expect(src!.children.find(node => node.name === 'b.ts')!.status).toBeNull()
  })

  it('shows deleted files, marked as deleted, even in folders that are otherwise gone', () => {
    const tree = buildFileTree({ 'a.txt': '' }, { 'old/b.txt': 'deleted', 'a.txt': 'modified' })
    expect(names(tree)).toEqual(['old/', 'a.txt'])
    const old = tree[0] as FolderNode
    expect(old.status).toBe('deleted')
    expect(old.children[0]).toMatchObject({ path: 'old/b.txt', status: 'deleted', deleted: true })
  })

  it('is empty for an empty working tree', () => {
    expect(buildFileTree({}, {})).toEqual([])
  })

  it('lists every folder path', () => {
    const tree = buildFileTree({ 'src/lib/x.ts': '', 'docs/a.md': '', 'b.txt': '' }, {})
    expect(folderPaths(tree).sort()).toEqual(['docs', 'src', 'src/lib'])
  })
})
