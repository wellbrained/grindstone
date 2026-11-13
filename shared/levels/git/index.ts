// The git track: its chapters and their levels, in play order. Adding a level: one entry in its chapter's `levels`
// (plus the import); its number ("3.2") and its place in the play order follow from that (docs/features/levels.md).
// A practice task goes right after the scenario it trains (`practises`); defineTrack checks the placement.
import { fewestCommands } from '../progress'
import { defineTrack, trackLevels } from '../track'
import { isGitLevel } from './types'
import type { GitLevel } from './types'
import { firstCommit } from './01-first-commit'
import { branch } from './02-branch'
import { merge } from './03-merge'
import { mergeConflict } from './04-merge-conflict'
import { rebase } from './05-rebase'
import { teammateSync } from './06-teammate-sync'
import { stageTogether } from './07-stage-together'
import { whatChanged } from './08-what-changed'
import { readHistory } from './09-read-history'
import { ignoreBuildFiles } from './10-ignore-build-files'
import { fixLastCommit } from './11-fix-last-commit'
import { throwAwayChange } from './12-throw-away-change'
import { undoLocalCommit } from './13-undo-local-commit'
import { undoPushedCommit } from './14-undo-pushed-commit'
import { parkUnfinishedWork } from './15-park-unfinished-work'
import { startedOnWrongBranch } from './16-started-on-wrong-branch'
import { pickUpTeammateBranch } from './17-pick-up-teammate-branch'
import { cleanUpBranches } from './18-clean-up-branches'
import { lookAtOldVersion } from './19-look-at-old-version'
import { bothSidesMovedOn } from './20-both-sides-moved-on'
import { backOutOfAMerge } from './21-back-out-of-a-merge'
import { catchUpWithMain } from './22-catch-up-with-main'
import { conflictDuringRebase } from './23-conflict-during-a-rebase'
import { pushRebasedBranch } from './24-push-a-rebased-branch'
import { tidyUpBeforeReview } from './25-tidy-up-before-review'
import { pushYourFirstBranch } from './26-push-your-first-branch'
import { getYourTeammatesWork } from './27-get-your-teammates-work'
import { yourPushWasRejected } from './28-your-push-was-rejected'
import { aheadAndBehind } from './29-ahead-and-behind'
import { committedOnMain } from './30-committed-on-main'
import { lostCommitsAfterReset } from './31-lost-commits-after-reset'
import { rebasedTheWrongBranch } from './32-rebased-the-wrong-branch'
import { committedASecret } from './33-committed-a-secret'
import { deletedABranch } from './34-deleted-a-branch'
import { pullRequestFlow } from './35-pull-request-flow'
import { hotfixMidFeature } from './36-hotfix-mid-feature'
import { fixTheReleaseBranch } from './37-fix-the-release-branch'
import { tagARelease } from './38-tag-a-release'
import { gitflowRelease } from './39-gitflow-release'
import { commitAll, diffFile, diffStaged, ignoreLogs, logOneline, stageOneFile } from './practice/basics'
import { branchFromCommit, deleteMergedBranch, listBranches, listRemoteBranches, renameBranch, switchBack } from './practice/branching'
import { findLostCommit, moveCommitToBranch, removeFile, restoreBranch, undoRebase, untrackFile } from './practice/disasters'
import { keepTheirVersion, listConflicts, mergeFfOnly, mergeMainIn, mergeNoFf } from './practice/merging'
import { abortRebase, pushWithLease, rebaseOntoMain, rewordOldCommit } from './practice/rewriting'
import { fetchOnly, pruneGoneBranches, pullRebase, pushWithUpstream, unpushedCommits } from './practice/teamwork'
import { amendNoEdit, discardFile, resetHard, resetSoft, revertBeforeLast, stashUntracked, unstageFile } from './practice/undo'
import { annotatedTag, cherryPickCommit, cherryPickRecordOrigin, cleanUpAfterMerge, listTags, releaseFromDevelop, stashForHotfix } from './practice/workflows'

export const gitTrack = defineTrack({
  id: 'git',
  title: 'Git',
  scope: 'From your first commit to team workflows',
  description: 'Every command redraws a live commit graph, and simulated teammates push to origin while you work, so you practise syncing, rebasing and conflicts the way they happen on a team.',
  status: 'live',
  tagline: 'Practice git until it stops being scary.',
  cheatSheet: '/git/cheat-sheet',
  bestRun: fewestCommands,
  chapters: [
    {
      id: 'basics',
      title: 'Basics',
      description: 'Repositories, staging and commits: everything that happens on your own machine.',
      colour: 0,
      // each scenario, then the practice tasks that train it
      levels: [
        firstCommit,
        stageOneFile,
        commitAll,
        stageTogether,
        diffStaged,
        whatChanged,
        diffFile,
        readHistory,
        logOneline,
        ignoreBuildFiles,
        ignoreLogs
      ]
    },
    {
      id: 'branching',
      title: 'Branching',
      description: 'Work on an idea without touching main.',
      colour: 1,
      levels: [
        branch,
        listBranches,
        startedOnWrongBranch,
        switchBack,
        pickUpTeammateBranch,
        listRemoteBranches,
        cleanUpBranches,
        renameBranch,
        deleteMergedBranch,
        lookAtOldVersion,
        branchFromCommit
      ]
    },
    {
      id: 'merging',
      title: 'Merging',
      description: 'Bring branches together, and settle it when two edits collide.',
      colour: 2,
      levels: [
        merge,
        mergeNoFf,
        bothSidesMovedOn,
        mergeFfOnly,
        mergeConflict,
        keepTheirVersion,
        backOutOfAMerge,
        listConflicts,
        catchUpWithMain,
        mergeMainIn
      ]
    },
    {
      id: 'rewriting-history',
      title: 'Rewriting history',
      description: 'Rebase and tidy your commits before anyone else builds on them.',
      colour: 3,
      levels: [
        rebase,
        rebaseOntoMain,
        conflictDuringRebase,
        abortRebase,
        pushRebasedBranch,
        pushWithLease,
        tidyUpBeforeReview,
        rewordOldCommit
      ]
    },
    {
      id: 'teamwork',
      title: 'Teamwork & remotes',
      description: 'Push, fetch and stay in sync while teammates push to origin.',
      colour: 4,
      levels: [
        pushYourFirstBranch,
        pushWithUpstream,
        getYourTeammatesWork,
        fetchOnly,
        yourPushWasRejected,
        pullRebase,
        aheadAndBehind,
        unpushedCommits,
        teammateSync,
        pruneGoneBranches
      ]
    },
    {
      id: 'undo',
      title: 'Undo & recovery',
      description: 'Reset, revert and stash: take back a mistake without losing work.',
      colour: 5,
      levels: [
        fixLastCommit,
        amendNoEdit,
        throwAwayChange,
        unstageFile,
        discardFile,
        undoLocalCommit,
        resetSoft,
        resetHard,
        undoPushedCommit,
        revertBeforeLast,
        parkUnfinishedWork,
        stashUntracked
      ]
    },
    {
      id: 'disasters',
      title: 'Disasters',
      description: 'Get out of real messes: work on the wrong branch, lost commits, a committed secret, a deleted branch.',
      colour: 6,
      levels: [
        committedOnMain,
        moveCommitToBranch,
        lostCommitsAfterReset,
        findLostCommit,
        rebasedTheWrongBranch,
        undoRebase,
        committedASecret,
        untrackFile,
        removeFile,
        deletedABranch,
        restoreBranch
      ]
    },
    {
      id: 'workflows',
      title: 'Workflows',
      description: 'How teams ship: pull requests, hotfixes, fixes for a release branch, tags and GitFlow releases.',
      colour: 7,
      levels: [
        pullRequestFlow,
        cleanUpAfterMerge,
        hotfixMidFeature,
        stashForHotfix,
        fixTheReleaseBranch,
        cherryPickCommit,
        cherryPickRecordOrigin,
        tagARelease,
        annotatedTag,
        listTags,
        gitflowRelease,
        releaseFromDevelop
      ]
    }
  ]
})

/** The git track's levels in play order. */
export const gitLevels: GitLevel[] = trackLevels(gitTrack).filter(isGitLevel)
