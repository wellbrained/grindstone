import { done, err, fail, out } from '../output'
import { emptyRepo } from '../state'
import type { Command } from '../types'

export const init: Command = (state, argv) => {
  if (argv.length) return fail(state, [err(`git init: option '${argv[0]}' is not in this trainer yet`)])
  if (state.repo) return done(state, [out(`Reinitialized existing Git repository in ${state.cwd}/.git/`)])
  return done({ ...state, repo: emptyRepo() }, [out(`Initialized empty Git repository in ${state.cwd}/.git/`)])
}
