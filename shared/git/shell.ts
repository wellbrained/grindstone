// The small fake shell around git: ls, cat, echo, rm, touch, pwd.
import { done, err, fail, out } from './output'
import { normalizePath, without } from './state'
import type { Command, GitState, OutputLine, Tree } from './types'

const isDir = (tree: Tree, path: string) => path === '' || Object.keys(tree).some(file => file.startsWith(`${path}/`))

function entries(tree: Tree, dir: string): string[] {
  const prefix = dir ? `${dir}/` : ''
  const names = new Set<string>()
  for (const file of Object.keys(tree)) {
    if (file.startsWith(prefix)) names.add(file.slice(prefix.length).split('/')[0]!)
  }
  return [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
}

function flagsAndPaths(name: string, argv: string[], allowed: string): { flags: Set<string>, paths: string[] } | OutputLine {
  const flags = new Set<string>()
  const paths: string[] = []
  for (const arg of argv) {
    if (arg.startsWith('-') && arg.length > 1) {
      for (const flag of arg.slice(1)) {
        if (!allowed.includes(flag)) return err(`${name}: option '-${flag}' is not in this trainer yet`)
        flags.add(flag)
      }
    } else {
      paths.push(arg)
    }
  }
  return { flags, paths }
}

const ls: Command = (state, argv) => {
  const parsed = flagsAndPaths('ls', argv, '1')
  if (!('paths' in parsed)) return fail(state, [parsed], 2)
  const targets = parsed.paths.length ? parsed.paths : ['.']
  const output: OutputLine[] = []
  let exitCode = 0
  targets.forEach((target, i) => {
    const path = normalizePath(target)
    if (state.workdir[path] !== undefined) {
      output.push(out(target))
    } else if (isDir(state.workdir, path)) {
      if (targets.length > 1) output.push(...(i ? [out('')] : []), out(`${target}:`))
      const names = entries(state.workdir, path)
      if (names.length) output.push(out(names.join('  ')))
    } else {
      output.push(err(`ls: cannot access '${target}': No such file or directory`))
      exitCode = 2
    }
  })
  return { state, output, exitCode }
}

const cat: Command = (state, argv) => {
  const output: OutputLine[] = []
  let exitCode = 0
  for (const target of argv) {
    const path = normalizePath(target)
    const content = state.workdir[path]
    if (content !== undefined) {
      if (content !== '') output.push(...content.replace(/\n$/, '').split('\n').map(text => out(text)))
    } else if (isDir(state.workdir, path) && path !== '') {
      output.push(err(`cat: ${target}: Is a directory`))
      exitCode = 1
    } else {
      output.push(err(`cat: ${target}: No such file or directory`))
      exitCode = 1
    }
  }
  return { state, output, exitCode }
}

const echo: Command = (state, argv) => done(state, [out(argv.join(' '))])

const rm: Command = (state, argv) => {
  const parsed = flagsAndPaths('rm', argv, 'rf')
  if (!('paths' in parsed)) return fail(state, [parsed])
  const recursive = parsed.flags.has('r')
  if (!parsed.paths.length) return fail(state, [err('rm: missing operand')])
  let workdir = state.workdir
  const output: OutputLine[] = []
  for (const target of parsed.paths) {
    const path = normalizePath(target)
    if (workdir[path] !== undefined) {
      workdir = without(workdir, path)
    } else if (path && isDir(workdir, path)) {
      if (!recursive) {
        output.push(err(`rm: cannot remove '${target}': Is a directory`))
        continue
      }
      workdir = Object.fromEntries(Object.entries(workdir).filter(([file]) => !file.startsWith(`${path}/`)))
    } else if (!parsed.flags.has('f')) {
      output.push(err(`rm: cannot remove '${target}': No such file or directory`))
    }
  }
  return { state: { ...state, workdir }, output, exitCode: output.length ? 1 : 0 }
}

const touch: Command = (state, argv) => {
  if (!argv.length) return fail(state, [err('touch: missing file operand')])
  const workdir = { ...state.workdir }
  for (const target of argv) {
    const path = normalizePath(target)
    if (!path || isDir(workdir, path)) continue
    if (workdir[path] === undefined) workdir[path] = ''
  }
  return done({ ...state, workdir })
}

const pwd: Command = state => done(state, [out(state.cwd)])

export const SHELL_COMMANDS: Record<string, Command> = { ls, cat, echo, rm, touch, pwd }

/** Common shell commands that this trainer does not need; they get a friendly answer. */
export const SHELL_ELSEWHERE = ['cd', 'mkdir', 'mv', 'cp']

/** Writes command output into a file, like `>` and `>>`. */
export function redirect(state: GitState, target: string, text: string, append: boolean): { state: GitState, error?: OutputLine } {
  const path = normalizePath(target)
  if (!path || isDir(state.workdir, path)) return { state, error: err(`bash: ${target}: Is a directory`) }
  const content = append ? (state.workdir[path] ?? '') + text : text
  return { state: { ...state, workdir: { ...state.workdir, [path]: content } } }
}
