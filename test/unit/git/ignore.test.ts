import { describe, expect, it } from 'vitest'
import { createState, isIgnored, isWorkingTreeClean, run } from '../../../shared/git'
import { ignoreMatcher, parseIgnore } from '../../../shared/git/ignore'
import { exec, ok, textOf } from './helpers'

const initialised = () => ok(createState(), 'git init')

/** A repo with one commit, build output in dist/, a local .env and a .gitignore that is not committed yet. */
function project(patterns = ['dist/', '.env']) {
  return ok(
    initialised(),
    'echo "console.log(1)" > src/app.js',
    'git add .',
    'git commit -m "Add app"',
    'echo "bundle" > dist/app.js',
    'echo "API_KEY=dev-123" > .env',
    ...patterns.map((pattern, i) => `echo "${pattern}" ${i ? '>>' : '>'} .gitignore`)
  )
}

describe('gitignore patterns', () => {
  const ignored = (text: string, path: string) => ignoreMatcher({ '.gitignore': text })(path)

  it('skips blank lines and comments', () => {
    expect(parseIgnore('\n# build output\n   \ndist/\n')).toHaveLength(1)
    expect(ignored('# dist/\n', 'dist/app.js')).toBe(false)
  })

  it('matches exact names at any depth', () => {
    expect(ignored('.env\n', '.env')).toBe(true)
    expect(ignored('.env\n', 'config/.env')).toBe(true)
    expect(ignored('.env\n', '.env.example')).toBe(false)
  })

  it('matches *.ext and ? globs on the name, never across a slash', () => {
    expect(ignored('*.log\n', 'debug.log')).toBe(true)
    expect(ignored('*.log\n', 'logs/server.log')).toBe(true)
    expect(ignored('*.log\n', 'log.txt')).toBe(false)
    expect(ignored('file?.txt\n', 'file1.txt')).toBe(true)
    expect(ignored('file?.txt\n', 'file10.txt')).toBe(false)
  })

  it('matches dir/ only as a directory, with everything inside', () => {
    expect(ignored('dist/\n', 'dist/app.js')).toBe(true)
    expect(ignored('dist/\n', 'dist/css/app.css')).toBe(true)
    expect(ignored('dist/\n', 'packages/web/dist/app.js')).toBe(true)
    // a file called dist is not a directory
    expect(ignored('dist/\n', 'dist')).toBe(false)
    // without the slash, a name matches files and directories
    expect(ignored('dist\n', 'dist')).toBe(true)
    expect(ignored('dist\n', 'dist/app.js')).toBe(true)
  })

  it('anchors /root-only and patterns with a slash in the middle to the .gitignore folder', () => {
    expect(ignored('/build\n', 'build/out.js')).toBe(true)
    expect(ignored('/build\n', 'src/build/out.js')).toBe(false)
    expect(ignored('docs/*.pdf\n', 'docs/guide.pdf')).toBe(true)
    expect(ignored('docs/*.pdf\n', 'docs/old/guide.pdf')).toBe(false)
    expect(ignored('docs/*.pdf\n', 'other/docs/guide.pdf')).toBe(false)
    expect(ignored('**/temp\n', 'a/b/temp/x')).toBe(true)
    expect(ignored('logs/**\n', 'logs/a/b.txt')).toBe(true)
  })

  it('re-includes with !, but not inside an ignored directory', () => {
    expect(ignored('*.log\n!keep.log\n', 'keep.log')).toBe(false)
    expect(ignored('*.log\n!keep.log\n', 'other.log')).toBe(true)
    // the last matching line wins
    expect(ignored('!keep.log\n*.log\n', 'keep.log')).toBe(true)
    // git cannot re-include a file when its parent directory is excluded
    expect(ignored('dist/\n!dist/keep.txt\n', 'dist/keep.txt')).toBe(true)
    // ...but it can when only the contents are excluded
    expect(ignored('dist/*\n!dist/keep.txt\n', 'dist/keep.txt')).toBe(false)
  })

  it('reads .gitignore files in subfolders relative to their folder; deeper files win', () => {
    const tree = { '.gitignore': '*.log\n', 'server/.gitignore': 'tmp/\n!important.log\n' }
    const check = ignoreMatcher(tree)
    expect(check('server/tmp/a.txt')).toBe(true)
    expect(check('tmp/a.txt')).toBe(false)
    expect(check('server/important.log')).toBe(false)
    expect(check('important.log')).toBe(true)
  })

  it('treats a literal \\# and \\! as names, and trims trailing spaces', () => {
    expect(ignored('\\#notes\n', '#notes')).toBe(true)
    expect(ignored('\\!draft\n', '!draft')).toBe(true)
    expect(ignored('dist/   \n', 'dist/app.js')).toBe(true)
  })
})

describe('git status with a .gitignore', () => {
  it('lists ignored files as untracked until the .gitignore names them', () => {
    const before = ok(initialised(), 'echo "console.log(1)" > src/app.js', 'git add .', 'git commit -m "Add app"', 'echo bundle > dist/app.js', 'echo "API_KEY=dev-123" > .env')
    expect(exec(before, 'git status').text).toContain('\t.env\n\tdist/')

    const { text } = exec(project(), 'git status')
    expect(text).toContain('Untracked files:')
    expect(text).toContain('\t.gitignore')
    expect(text).not.toContain('dist/')
    expect(text).not.toContain('.env\n')
    expect(exec(project(), 'git status -s').text).toBe('?? .gitignore')
  })

  it('is clean once only ignored files are left', () => {
    const state = ok(project(), 'git add .gitignore', 'git commit -m "Ignore build output"')
    expect(exec(state, 'git status').text).toBe('On branch main\nnothing to commit, working tree clean')
    expect(isWorkingTreeClean(state)).toBe(true)
    expect(isIgnored(state, 'dist/app.js')).toBe(true)
    expect(isIgnored(state, '.gitignore')).toBe(false)
  })

  it('keeps showing changes to a tracked file even when it matches a pattern', () => {
    const state = ok(initialised(), 'echo one > notes.log', 'git add .', 'git commit -m "Add notes"', 'echo "*.log" > .gitignore', 'git add .gitignore', 'git commit -m "Ignore logs"', 'echo two >> notes.log')
    expect(exec(state, 'git status -s').text).toBe(' M notes.log')
    expect(isIgnored(state, 'notes.log')).toBe(false)
  })
})

describe('git add with a .gitignore', () => {
  it('skips ignored files in git add . and git add -A', () => {
    for (const command of ['git add .', 'git add -A']) {
      const result = run(project(), command)
      expect(result.exitCode).toBe(0)
      expect(Object.keys(result.state.repo!.index).sort()).toEqual(['.gitignore', 'src/app.js'])
    }
  })

  it('skips ignored files inside a folder you add', () => {
    const state = ok(project(['*.log']), 'echo x > src/debug.log', 'echo y > src/util.js')
    expect(Object.keys(ok(state, 'git add src').repo!.index).sort()).toEqual(['src/app.js', 'src/util.js'])
  })

  it('refuses an ignored path like real git and points at -f', () => {
    for (const [command, shown] of [['git add .env', '.env'], ['git add dist/app.js', 'dist'], ['git add dist', 'dist']] as const) {
      const result = run(project(), command)
      expect(result.exitCode).toBe(1)
      expect(textOf(result)).toBe(`The following paths are ignored by one of your .gitignore files:\n${shown}\nhint: Use -f if you really want to add them.`)
      expect(result.output.at(-1)!.kind).toBe('hint')
      expect(Object.keys(result.state.repo!.index)).toEqual(['src/app.js'])
    }
  })

  it('still adds the other paths of the same command', () => {
    const result = run(project(), 'git add .gitignore .env')
    expect(result.exitCode).toBe(1)
    expect(Object.keys(result.state.repo!.index).sort()).toEqual(['.gitignore', 'src/app.js'])
  })

  it('adds ignored files with -f / --force', () => {
    expect(Object.keys(ok(project(), 'git add -f .env').repo!.index).sort()).toEqual(['.env', 'src/app.js'])
    expect(Object.keys(ok(project(), 'git add --force dist').repo!.index).sort()).toEqual(['dist/app.js', 'src/app.js'])
    // once tracked, a file stays tracked: status shows its changes
    const forced = ok(project(), 'git add -f .env', 'git add .gitignore', 'git commit -m "Track env"', 'echo "API_KEY=dev-456" > .env')
    expect(exec(forced, 'git status -s').text).toBe(' M .env')
  })

  it('stages a change to a tracked file that matches a pattern', () => {
    const state = ok(initialised(), 'echo one > notes.log', 'git add .', 'git commit -m "Add notes"', 'echo "*.log" > .gitignore', 'echo two >> notes.log')
    expect(ok(state, 'git add notes.log').repo!.index['notes.log']).toBe('one\ntwo\n')
  })

  it('stops ignoring once the .gitignore is gone', () => {
    const state = ok(project(), 'rm .gitignore')
    expect(exec(state, 'git status -s').text).toBe('?? .env\n?? dist/')
  })
})
