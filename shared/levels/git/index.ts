// The git track: its chapters and their levels, in play order. Adding a level: one entry in its chapter's `levels`
// (plus the import); its number ("3.2") and its place in the play order follow from that (docs/features/levels.md).
import { defineTrack, trackLevels } from '../track'
import type { Level } from '../types'
import { firstCommit } from './01-first-commit'
import { branch } from './02-branch'
import { merge } from './03-merge'
import { mergeConflict } from './04-merge-conflict'
import { rebase } from './05-rebase'
import { teammateSync } from './06-teammate-sync'

export const gitTrack = defineTrack({
  id: 'git',
  title: 'Git',
  scope: 'From your first commit to team workflows',
  description: 'Every command redraws a live commit graph, and simulated teammates push to origin while you work, so you practise syncing, rebasing and conflicts the way they happen on a team.',
  status: 'live',
  tagline: 'Practice git until it stops being scary.',
  cheatSheet: '/git/cheat-sheet',
  chapters: [
    {
      id: 'basics',
      title: 'Basics',
      description: 'Repositories, staging and commits: everything that happens on your own machine.',
      colour: 0,
      levels: [firstCommit]
    },
    {
      id: 'branching',
      title: 'Branching',
      description: 'Work on an idea without touching main.',
      colour: 1,
      levels: [branch]
    },
    {
      id: 'merging',
      title: 'Merging',
      description: 'Bring branches together, and settle it when two edits collide.',
      colour: 2,
      levels: [merge, mergeConflict]
    },
    {
      id: 'rewriting-history',
      title: 'Rewriting history',
      description: 'Rebase and tidy your commits before anyone else builds on them.',
      colour: 3,
      levels: [rebase]
    },
    {
      id: 'teamwork',
      title: 'Teamwork & remotes',
      description: 'Push, fetch and stay in sync while teammates push to origin.',
      colour: 4,
      levels: [teammateSync]
    },
    {
      id: 'undo',
      title: 'Undo & recovery',
      description: 'Reset, revert and stash: take back a mistake without losing work.',
      colour: 5,
      levels: []
    },
    {
      id: 'disasters',
      title: 'Disasters',
      description: 'Real-world messes: a leaked secret, the wrong branch rebased, a hotfix in the middle of a feature.',
      colour: 6,
      levels: []
    },
    {
      id: 'workflows',
      title: 'Workflows',
      description: 'GitFlow, trunk-based development and release branches, the way teams run them.',
      colour: 7,
      levels: []
    }
  ]
})

/** The git track's levels in play order. */
export const gitLevels: Level[] = trackLevels(gitTrack)
