// A small getopt for git-style arguments: -a, -am "msg", -mvalue, --long, --long=value, --.

export interface ArgSpec {
  /** Boolean flags, e.g. ['-a', '--amend']. */
  flags?: string[]
  /** Flags that take a value, e.g. ['-m']. */
  values?: string[]
  /** Other spellings, mapped to the canonical flag, e.g. { '--message': '-m' }. */
  alias?: Record<string, string>
}

export interface ParsedArgs {
  flags: Set<string>
  values: Record<string, string[]>
  positionals: string[]
  /** True when the positionals came after `--`. */
  separator: boolean
}

export type ParseResult
  = | { ok: true, args: ParsedArgs }
    | { ok: false, error: string }

export const unsupportedOption = (command: string, flag: string) => `git ${command}: option '${flag}' is not in this trainer yet`

export function parseArgs(command: string, argv: string[], spec: ArgSpec): ParseResult {
  const flags = new Set<string>()
  const values: Record<string, string[]> = {}
  const positionals: string[] = []
  const known = (flag: string) => spec.alias?.[flag] ?? flag
  const isValue = (flag: string) => spec.values?.includes(flag) ?? false
  const isFlag = (flag: string) => spec.flags?.includes(flag) ?? false
  const addValue = (flag: string, value: string) => {
    values[flag] = [...(values[flag] ?? []), value]
  }
  let separator = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (separator || arg === '-' || !arg.startsWith('-')) {
      positionals.push(arg)
    } else if (arg === '--') {
      separator = true
    } else if (arg.startsWith('--')) {
      const eq = arg.indexOf('=')
      const name = known(eq === -1 ? arg : arg.slice(0, eq))
      if (isValue(name)) {
        const value = eq === -1 ? argv[++i] : arg.slice(eq + 1)
        if (value === undefined) return { ok: false, error: `error: option \`${name.slice(2)}' requires a value` }
        addValue(name, value)
      } else if (isFlag(name) && eq === -1) {
        flags.add(name)
      } else {
        return { ok: false, error: unsupportedOption(command, eq === -1 ? arg : arg.slice(0, eq)) }
      }
    } else {
      // bundled short flags: -am "msg", -mmsg
      for (let j = 1; j < arg.length; j++) {
        const name = known(`-${arg[j]}`)
        if (isValue(name)) {
          const rest = arg.slice(j + 1)
          const value = rest !== '' ? rest : argv[++i]
          if (value === undefined) return { ok: false, error: `error: switch \`${arg[j]}' requires a value` }
          addValue(name, value)
          break
        }
        if (!isFlag(name)) return { ok: false, error: unsupportedOption(command, `-${arg[j]}`) }
        flags.add(name)
      }
    }
  }

  return { ok: true, args: { flags, values, positionals, separator } }
}
