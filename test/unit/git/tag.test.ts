import { describe, expect, it } from 'vitest'
import { remoteTagOf, repo, resolve, tagOf } from '../../../shared/git'
import { exec, ok } from './helpers'

const URL = 'https://git.example.com/team/project.git'
const short = (id: string | null | undefined) => id!.slice(0, 7)

/** main with two commits, published to origin. */
const published = () => repo()
  .file('app.txt', 'one\n')
  .commit('First release')
  .file('app.txt', 'two\n')
  .commit('Second release')
  .origin()
  .build()

describe('git tag', () => {
  it('creates a lightweight tag on HEAD or on a given commit, silently', () => {
    const state = published()
    const { state: tagged, text } = exec(state, 'git tag v1.1.0')
    expect(text).toBe('')
    expect(tagOf(tagged, 'v1.1.0')).toEqual({ commit: resolve(state, 'HEAD') })
    const older = ok(tagged, 'git tag v1.0.0 HEAD~1')
    expect(tagOf(older, 'v1.0.0')!.commit).toBe(resolve(state, 'HEAD~1'))
    expect(exec(older, 'git tag').text).toBe('v1.0.0\nv1.1.0')
  })

  it('creates an annotated tag with its message, tagger and own id', () => {
    const state = published()
    const tagged = ok(state, 'git tag -a v1.1.0 -m "Version 1.1.0"', 'git tag -m "Only -m" v1.1.1 HEAD~1')
    const tag = tagOf(tagged, 'v1.1.0')!
    expect(tag.commit).toBe(resolve(state, 'HEAD'))
    expect(tag.annotation).toMatchObject({ message: 'Version 1.1.0', tagger: { name: 'You' } })
    expect(tag.annotation!.id).toMatch(/^[0-9a-f]{40}$/)
    expect(tag.annotation!.id).not.toBe(tag.commit)
    // -m alone makes an annotated tag too, like git
    expect(tagOf(tagged, 'v1.1.1')!.annotation!.message).toBe('Only -m')
    expect(exec(state, 'git tag -a v2').text).toBe('error: there is no editor in this trainer for tag messages\nhint: write the message on the command line: git tag -a v2 -m "message"')
  })

  it('lists sorted like git, with patterns and with -n', () => {
    const state = ok(published(), 'git tag v1.10.0', 'git tag -a v1.9.0 -m "Version 1.9.0" HEAD~1', 'git tag beta')
    expect(exec(state, 'git tag').text).toBe('beta\nv1.10.0\nv1.9.0')
    expect(exec(state, 'git tag -l "v1.*"').text).toBe('v1.10.0\nv1.9.0')
    expect(exec(state, 'git tag --list "v1.9*" beta').text).toBe('beta\nv1.9.0')
    expect(exec(state, 'git tag -n').text).toBe([
      'beta            Second release',
      'v1.10.0         Second release',
      'v1.9.0          Version 1.9.0'
    ].join('\n'))
  })

  it('refuses existing names, bad names and unknown commits like git; -f moves a tag', () => {
    const state = ok(published(), 'git tag v1.0.0 HEAD~1')
    const existing = exec(state, 'git tag v1.0.0')
    expect(existing.text).toBe('fatal: tag \'v1.0.0\' already exists')
    expect(existing.last.exitCode).toBe(128)
    expect(exec(state, 'git tag "v1..0"').text).toBe('fatal: \'v1..0\' is not a valid tag name.')
    expect(exec(state, 'git tag v2 nope').text).toBe('fatal: Failed to resolve \'nope\' as a valid ref.')
    expect(exec(state, 'git tag a b c').text).toBe('fatal: too many arguments')
    expect(exec(repo().build(), 'git tag v1').text).toBe('fatal: Failed to resolve \'HEAD\' as a valid ref.')
    const moved = exec(state, 'git tag -f v1.0.0')
    expect(moved.text).toBe(`Updated tag 'v1.0.0' (was ${short(resolve(state, 'HEAD~1'))})`)
    expect(tagOf(moved.state, 'v1.0.0')!.commit).toBe(resolve(state, 'HEAD'))
  })

  it('deletes tags, naming what they pointed at', () => {
    const state = ok(published(), 'git tag v1.0.0 HEAD~1', 'git tag -a v1.1.0 -m "Version 1.1.0"')
    const annotation = tagOf(state, 'v1.1.0')!.annotation!.id
    const { state: deleted, text } = exec(state, 'git tag -d v1.0.0 v1.1.0')
    expect(text).toBe(`Deleted tag 'v1.0.0' (was ${short(resolve(state, 'HEAD~1'))})\nDeleted tag 'v1.1.0' (was ${short(annotation)})`)
    expect(tagOf(deleted, 'v1.0.0')).toBeNull()
    const missing = exec(state, 'git tag -d v9')
    expect(missing.text).toBe('error: tag \'v9\' not found.')
    expect(missing.last.exitCode).toBe(1)
  })

  it('resolves tags as revisions and shows them in log decorations', () => {
    const state = ok(published(), 'git tag -a v1.0.0 -m "Version 1.0.0" HEAD~1', 'git tag latest')
    expect(resolve(state, 'v1.0.0')).toBe(resolve(state, 'HEAD~1'))
    expect(resolve(state, 'refs/tags/latest~1')).toBe(resolve(state, 'HEAD~1'))
    expect(exec(state, 'git log --oneline --decorate').text).toBe([
      `${short(resolve(state, 'HEAD'))} (HEAD -> main, tag: latest, origin/main) Second release`,
      `${short(resolve(state, 'HEAD~1'))} (tag: v1.0.0) First release`
    ].join('\n'))
    expect(exec(state, 'git log --oneline v1.0.0').text).toBe(`${short(resolve(state, 'HEAD~1'))} (tag: v1.0.0) First release`)
    // a tag keeps a commit in log --all after its branch is gone
    const kept = ok(state, 'git switch -c side HEAD~1', 'echo s > s.txt', 'git add s.txt', 'git commit -m "Side work"', 'git tag side-tag', 'git switch main', 'git branch -D side')
    expect(exec(kept, 'git log --oneline --all').text).toContain('(tag: side-tag) Side work')
  })
})

describe('pushing and fetching tags', () => {
  it('pushes one tag by name, and says so when it is already there', () => {
    const state = ok(published(), 'git tag -a v1.0.0 -m "Version 1.0.0"')
    const { state: pushed, text } = exec(state, 'git push origin v1.0.0')
    expect(text).toBe(`To ${URL}\n * [new tag]         v1.0.0 -> v1.0.0`)
    expect(remoteTagOf(pushed, 'v1.0.0')).toEqual(tagOf(state, 'v1.0.0'))
    expect(exec(pushed, 'git push origin v1.0.0').text).toBe('Everything up-to-date')
  })

  it('does not push tags with a plain push, and pushes all of them with --tags', () => {
    const state = ok(published(), 'git tag v1.0.0 HEAD~1', 'git tag v1.1.0')
    expect(remoteTagOf(ok(state, 'git push'), 'v1.0.0')).toBeNull()
    for (const line of ['git push --tags', 'git push origin --tags']) {
      const { state: pushed, text } = exec(state, line)
      expect(text).toBe(`To ${URL}\n * [new tag]         v1.0.0 -> v1.0.0\n * [new tag]         v1.1.0 -> v1.1.0`)
      expect(remoteTagOf(pushed, 'v1.1.0')!.commit).toBe(resolve(state, 'HEAD'))
      expect(exec(pushed, line).text).toBe('Everything up-to-date')
    }
  })

  it('copies the tagged commits to origin, and refuses to replace a different tag there', () => {
    const state = ok(published(), 'echo three > app.txt', 'git commit -am "Unpushed"', 'git tag v2.0.0')
    const pushed = ok(state, 'git push origin v2.0.0')
    expect(pushed.origin!.commits[resolve(state, 'HEAD')!]).toBeDefined()
    const moved = ok(pushed, 'git tag -f v2.0.0 HEAD~1')
    const rejected = exec(moved, 'git push origin v2.0.0')
    expect(rejected.text).toBe([
      `To ${URL}`,
      ' ! [rejected]        v2.0.0 -> v2.0.0 (already exists)',
      `error: failed to push some refs to '${URL}'`,
      'hint: Updates were rejected because the tag already exists in the remote.'
    ].join('\n'))
    expect(rejected.last.exitCode).toBe(1)
    expect(exec(moved, 'git push --force origin v2.0.0').text).toContain(' + ')
  })

  it('brings origin\'s tags along on fetch and pull', () => {
    const tagged = ok(published(), 'git tag -a v1.0.0 -m "Version 1.0.0"', 'git push origin v1.0.0')
    const fresh = { ...tagged, repo: { ...tagged.repo!, tags: {} } }
    const { state: fetched, text } = exec(fresh, 'git fetch')
    expect(text).toBe(`From ${URL}\n * [new tag]         v1.0.0     -> v1.0.0`)
    expect(tagOf(fetched, 'v1.0.0')).toEqual(tagOf(tagged, 'v1.0.0'))
    expect(exec(fetched, 'git fetch').text).toBe('')
  })

  it('works with merge --no-ff, the GitFlow way', () => {
    const state = ok(published(), 'git switch -c release/1.1', 'echo "1.1.0" > version.txt', 'git add version.txt', 'git commit -m "Set the version to 1.1.0"', 'git switch main', 'git merge --no-ff release/1.1 -m "Merge branch \'release/1.1\'"', 'git tag -a v1.1.0 -m "Version 1.1.0"')
    const merge = resolve(state, 'main')!
    expect(state.repo!.commits[merge]!.parents).toHaveLength(2)
    expect(tagOf(state, 'v1.1.0')!.commit).toBe(merge)
    expect(exec(state, 'git log --oneline -1').text).toBe(`${short(merge)} (HEAD -> main, tag: v1.1.0) Merge branch 'release/1.1'`)
  })
})
