// The git track, in play order.
import type { Level } from '../types'
import { firstCommit } from './01-first-commit'
import { branch } from './02-branch'
import { merge } from './03-merge'
import { mergeConflict } from './04-merge-conflict'
import { rebase } from './05-rebase'
import { teammateSync } from './06-teammate-sync'

export const gitLevels: Level[] = [firstCommit, branch, merge, mergeConflict, rebase, teammateSync]
