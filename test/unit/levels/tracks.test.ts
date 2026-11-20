import { describe, expect, it } from 'vitest'
import {
  chapterOf,
  chapterProgress,
  continueTarget,
  defineTrack,
  emptyProgress,
  gitLevels,
  gitTrack,
  gitSubcommands,
  hasProgress,
  levelById,
  levelCommands,
  levelNumber,
  levelPlace,
  levels,
  nextLevel,
  nextUp,
  placeName,
  practiseAgainIn,
  trackById,
  trackLevels,
  trackPlaces,
  trackProgress,
  trackToContinue,
  tracks
} from '../../../shared/levels'
import type { Level } from '../../../shared/levels'
import { BIG_CHAPTER_SIZES, bigTrack, fakePractice, practiceTrack, solvedProgress } from './fixtures'

const git = trackById('git')!

describe('track registry', () => {
  it('lists Git, Debugging, Working with AI and Web fundamentals as the live tracks and the upcoming one as coming, without chapters', () => {
    expect(tracks.map(track => [track.id, track.status])).toEqual([
      ['git', 'live'],
      ['debugging', 'live'],
      ['ai', 'live'],
      ['web', 'live'],
      ['frameworks', 'coming']
    ])
    for (const track of tracks) {
      expect(track.title).not.toBe('')
      expect(track.scope).not.toBe('')
      if (track.status === 'coming') expect(track.chapters).toEqual([])
    }
    expect(trackById('nope')).toBeNull()
  })

  it('gives git its eight chapters, numbered in order, each with its own colour', () => {
    expect(git.chapters.map(chapter => [chapter.number, chapter.title])).toEqual([
      [1, 'Basics'],
      [2, 'Branching'],
      [3, 'Merging'],
      [4, 'Rewriting history'],
      [5, 'Teamwork & remotes'],
      [6, 'Undo & recovery'],
      [7, 'Disasters'],
      [8, 'Workflows']
    ])
    expect(new Set(git.chapters.map(chapter => chapter.colour)).size).toBe(8)
    expect(new Set(git.chapters.map(chapter => chapter.id)).size).toBe(8)
    for (const chapter of git.chapters) {
      expect(chapter.trackId).toBe('git')
      expect(chapter.description).not.toBe('')
    }
  })

  it('gives Debugging its seven chapters (ADR 0007), all live: Reading errors to Incidents', () => {
    const debugging = trackById('debugging')!
    expect(debugging).toMatchObject({ title: 'Debugging', tagline: 'Find the bug before your customers do.', cheatSheet: '/debugging/cheat-sheet', bestRun: ['hints', 'reloads'] })
    expect(debugging.chapters.map(chapter => [chapter.number, chapter.title, chapter.levels.length])).toEqual([
      [1, 'Reading errors', 13],
      [2, 'Network', 12],
      [3, 'Elements & CSS', 15],
      [4, 'State & async', 15],
      [5, 'Breakpoints & stepping', 15],
      [6, 'Performance', 15],
      [7, 'Incidents', 15]
    ])
    expect(new Set(debugging.chapters.map(chapter => chapter.colour)).size).toBe(7)
    expect(debugging.chapters[0]!.levels.map(level => [levelNumber(level.id), level.id])).toEqual([
      ['1.1', 'debugging-01-add-to-cart'],
      [null, 'debugging-practice-line-that-throws'],
      [null, 'debugging-practice-misspelled-property'],
      ['1.2', 'debugging-02-prices-vanished'],
      [null, 'debugging-practice-import-right-name'],
      ['1.3', 'debugging-03-total-not-defined'],
      [null, 'debugging-practice-move-declaration-up'],
      ['1.4', 'debugging-04-error-in-money'],
      [null, 'debugging-practice-frame-that-passed'],
      [null, 'debugging-practice-three-frame-trace'],
      ['1.5', 'debugging-05-blank-page'],
      [null, 'debugging-practice-real-mistake'],
      [null, 'debugging-practice-close-the-bracket']
    ])
    expect(debugging.chapters[1]!.levels.map(level => [levelNumber(level.id), level.id])).toEqual([
      ['2.1', 'debugging-06-menu-wont-load'],
      [null, 'debugging-practice-builds-the-address'],
      [null, 'debugging-practice-right-path'],
      ['2.2', 'debugging-07-nothing-happens'],
      [null, 'debugging-practice-failing-request'],
      [null, 'debugging-practice-check-response-ok'],
      ['2.3', 'debugging-08-wrong-quantity'],
      [null, 'debugging-practice-quantity-as-number'],
      ['2.4', 'debugging-09-works-on-my-machine'],
      [null, 'debugging-practice-own-origin'],
      ['2.5', 'debugging-10-orders-twice'],
      [null, 'debugging-practice-disable-while-sending']
    ])
    expect(debugging.chapters[2]!.levels.map(level => [levelNumber(level.id), level.id])).toEqual([
      ['3.1', 'debugging-11-invisible-order'],
      [null, 'debugging-practice-inherited-colour'],
      [null, 'debugging-practice-variable-name'],
      ['3.2', 'debugging-12-cant-click'],
      [null, 'debugging-practice-what-covers'],
      [null, 'debugging-practice-let-clicks-through'],
      ['3.3', 'debugging-13-style-doesnt-apply'],
      [null, 'debugging-practice-rule-that-wins'],
      [null, 'debugging-practice-selector-typo'],
      ['3.4', 'debugging-14-gone-on-phones'],
      [null, 'debugging-practice-media-query-line'],
      [null, 'debugging-practice-turn-the-query'],
      ['3.5', 'debugging-15-long-name'],
      [null, 'debugging-practice-nowrap-line'],
      [null, 'debugging-practice-long-address']
    ])
    expect(debugging.chapters[3]!.levels.map(level => [levelNumber(level.id), level.id])).toEqual([
      ['4.1', 'debugging-16-object-promise'],
      [null, 'debugging-practice-forgot-to-wait'],
      [null, 'debugging-practice-await-the-hours'],
      ['4.2', 'debugging-17-wrong-results'],
      [null, 'debugging-practice-old-answer-wins'],
      [null, 'debugging-practice-drop-the-old-day'],
      ['4.3', 'debugging-18-adds-sourdough'],
      [null, 'debugging-practice-shared-index'],
      [null, 'debugging-practice-own-time'],
      ['4.4', 'debugging-19-changes-both'],
      [null, 'debugging-practice-same-list'],
      [null, 'debugging-practice-copy-last-week'],
      ['4.5', 'debugging-20-says-it-failed'],
      [null, 'debugging-practice-pass-the-data-on'],
      [null, 'debugging-practice-catch-the-rejection']
    ])
    expect(nextLevel('debugging-practice-close-the-bracket')).toBe(levelById('debugging-06-menu-wont-load'))
    expect(nextLevel('debugging-practice-disable-while-sending')).toBe(levelById('debugging-11-invisible-order'))
    expect(debugging.chapters[4]!.levels.map(level => [levelNumber(level.id), level.id])).toEqual([
      ['5.1', 'debugging-21-discount-twice'],
      [null, 'debugging-practice-second-caller'],
      [null, 'debugging-practice-count-once'],
      ['5.2', 'debugging-22-misses-last-item'],
      [null, 'debugging-practice-loop-start'],
      [null, 'debugging-practice-no-extra-size'],
      ['5.3', 'debugging-23-no-free-delivery'],
      [null, 'debugging-practice-unrounded-compare'],
      [null, 'debugging-practice-box-from-six'],
      ['5.4', 'debugging-24-always-pickup'],
      [null, 'debugging-practice-stock-zero'],
      [null, 'debugging-practice-compare-the-day'],
      ['5.5', 'debugging-25-seventh-item'],
      [null, 'debugging-practice-wrong-slices'],
      [null, 'debugging-practice-comma-price']
    ])
    expect(nextLevel('debugging-practice-long-address')).toBe(levelById('debugging-16-object-promise'))
    expect(nextLevel('debugging-practice-catch-the-rejection')).toBe(levelById('debugging-21-discount-twice'))
    expect(debugging.chapters[5]!.levels.map(level => [levelNumber(level.id), level.id])).toEqual([
      ['6.1', 'debugging-26-request-per-key'],
      [null, 'debugging-practice-sends-per-key'],
      [null, 'debugging-practice-check-once'],
      ['6.2', 'debugging-27-redraws-menu'],
      [null, 'debugging-practice-draws-all-days'],
      [null, 'debugging-practice-only-the-counter'],
      ['6.3', 'debugging-28-formatted-thousands'],
      [null, 'debugging-practice-most-self-work'],
      [null, 'debugging-practice-map-lookup'],
      ['6.4', 'debugging-29-one-after-another'],
      [null, 'debugging-practice-waits-first'],
      [null, 'debugging-practice-both-at-once'],
      ['6.5', 'debugging-30-asks-again'],
      [null, 'debugging-practice-asks-for-hours-again'],
      [null, 'debugging-practice-keep-the-answer']
    ])
    expect(debugging.chapters[6]!.levels.map(level => [levelNumber(level.id), level.id])).toEqual([
      ['7.1', 'debugging-31-checkout-errors'],
      [null, 'debugging-practice-customer-error'],
      [null, 'debugging-practice-field-the-server-reads'],
      ['7.2', 'debugging-32-which-deploy'],
      [null, 'debugging-practice-broke-the-hours'],
      [null, 'debugging-practice-keep-the-euro-sign'],
      ['7.3', 'debugging-33-roll-back-now'],
      [null, 'debugging-practice-last-good-version'],
      [null, 'debugging-practice-roll-it-back'],
      ['7.4', 'debugging-34-some-customers'],
      [null, 'debugging-practice-body-by-hand'],
      [null, 'debugging-practice-escape-the-name'],
      ['7.5', 'debugging-35-only-in-production'],
      [null, 'debugging-practice-flag-in-production'],
      [null, 'debugging-practice-switch-it-off']
    ])
    expect(nextLevel('debugging-practice-comma-price')).toBe(levelById('debugging-26-request-per-key'))
    expect(nextLevel('debugging-practice-keep-the-answer')).toBe(levelById('debugging-31-checkout-errors'))
    expect(nextLevel('debugging-practice-switch-it-off')).toBeNull()
    // the whole track is live: no chapter is coming any more
    expect(debugging.chapters.every(chapter => chapter.levels.length > 0)).toBe(true)
    expect(nextLevel('git-practice-release-from-develop')).toBeNull()
  })

  it('gives Web fundamentals its seven chapters (ADR 0009): Same-origin & CORS to The event loop live, the other two coming', () => {
    const web = trackById('web')!
    expect(web).toMatchObject({ title: 'Web fundamentals', status: 'live', tagline: 'Predict what the browser does, then fix it.', cheatSheet: null, bestRun: ['wrongPredictions', 'hints', 'reloads'] })
    // the home card's text no longer promises performance (ADR 0009: that is Debugging's chapter 6)
    expect(`${web.scope} ${web.description}`).not.toMatch(/performance/i)
    expect(web.chapters.map(chapter => [chapter.number, chapter.id, chapter.title, chapter.levels.length, chapter.colour])).toEqual([
      [1, 'cors', 'Same-origin & CORS', 11, 0],
      [2, 'cookies', 'Cookies & sessions', 10, 1],
      [3, 'auth', 'Auth & tokens', 10, 2],
      [4, 'caching', 'HTTP caching', 10, 3],
      [5, 'event-loop', 'The event loop', 10, 4],
      [6, 'accessibility', 'Accessibility', 0, 5],
      [7, 'security-headers', 'Security headers & CSP', 0, 6]
    ])
    expect(web.chapters[0]!.levels.map(level => [levelNumber(level.id), level.id])).toEqual([
      ['1.1', 'web-01-menu-blocked'],
      [null, 'web-practice-console-order'],
      [null, 'web-practice-same-origin'],
      ['1.2', 'web-02-order-preflight'],
      [null, 'web-practice-simple-or-preflight'],
      ['1.3', 'web-03-basket-credentials'],
      [null, 'web-practice-readable-answers'],
      ['1.4', 'web-04-basket-header'],
      [null, 'web-practice-which-headers'],
      ['1.5', 'web-05-works-with-curl'],
      [null, 'web-practice-which-methods']
    ])
    expect(web.chapters[1]!.levels.map(level => [levelNumber(level.id), level.id])).toEqual([
      ['2.1', 'web-06-sign-in-lost'],
      [null, 'web-practice-which-stored'],
      ['2.2', 'web-07-order-from-elsewhere'],
      [null, 'web-practice-attacker-requests'],
      ['2.3', 'web-08-script-reads-session'],
      [null, 'web-practice-same-site'],
      ['2.4', 'web-09-cookie-path'],
      [null, 'web-practice-domain'],
      ['2.5', 'web-10-email-link'],
      [null, 'web-practice-link-cookies']
    ])
    expect(web.chapters[2]!.levels.map(level => [levelNumber(level.id), level.id])).toEqual([
      ['3.1', 'web-11-token-in-storage'],
      [null, 'web-practice-script-reads'],
      ['3.2', 'web-12-review-runs'],
      [null, 'web-practice-which-run'],
      ['3.3', 'web-13-token-never-expires'],
      [null, 'web-practice-which-tokens'],
      ['3.4', 'web-14-signed-out-again'],
      [null, 'web-practice-refresh-cookie'],
      ['3.5', 'web-15-logout-stays'],
      [null, 'web-practice-after-logout']
    ])
    expect(web.chapters[3]!.levels.map(level => [levelNumber(level.id), level.id])).toEqual([
      ['4.1', 'web-16-old-price'],
      [null, 'web-practice-ask-or-not'],
      ['4.2', 'web-17-whole-menu'],
      [null, 'web-practice-own-condition'],
      ['4.3', 'web-18-someone-elses-account'],
      [null, 'web-practice-cdn-keeps'],
      ['4.4', 'web-19-vary-origin'],
      [null, 'web-practice-own-copy'],
      ['4.5', 'web-20-stale-deploy'],
      [null, 'web-practice-reaches-today']
    ])
    expect(web.chapters[4]!.levels.map(level => [levelNumber(level.id), level.id])).toEqual([
      ['5.1', 'web-21-spinner'],
      [null, 'web-practice-when-paint'],
      ['5.2', 'web-22-pickup-menu'],
      [null, 'web-practice-tap-order'],
      ['5.3', 'web-23-kitchen-screen'],
      [null, 'web-practice-which-reads'],
      ['5.4', 'web-24-toast'],
      [null, 'web-practice-does-it-fade'],
      ['5.5', 'web-25-progress-bar'],
      [null, 'web-practice-first-line']
    ])
    expect(nextLevel('web-practice-which-methods')).toBe(levelById('web-06-sign-in-lost'))
    expect(nextLevel('web-practice-link-cookies')).toBe(levelById('web-11-token-in-storage'))
    expect(nextLevel('web-practice-after-logout')).toBe(levelById('web-16-old-price'))
    expect(nextLevel('web-practice-reaches-today')).toBe(levelById('web-21-spinner'))
    expect(nextLevel('web-practice-first-line')).toBeNull()
  })

  it('gives Working with AI its seven chapters (ADR 0008), all live: Read the diff to Steer the assistant, and its cheat sheet', () => {
    const ai = trackById('ai')!
    expect(ai).toMatchObject({ title: 'Working with AI', tagline: 'Lead the assistant, then check its work.', cheatSheet: '/ai/cheat-sheet', bestRun: ['hints', 'falseAlarms', 'rounds'] })
    expect(ai.chapters.map(chapter => [chapter.number, chapter.title, chapter.levels.length])).toEqual([
      [1, 'Read the diff', 15],
      [2, 'Claims vs. code', 15],
      [3, 'Tests that lie', 15],
      [4, 'Invented APIs', 15],
      [5, 'Security', 15],
      [6, 'Scope and size', 15],
      [7, 'Steer the assistant', 10]
    ])
    expect(new Set(ai.chapters.map(chapter => chapter.colour)).size).toBe(7)
    expect(ai.chapters.every(chapter => chapter.description !== '')).toBe(true)
    expect(ai.chapters[0]!.levels.map(level => [levelNumber(level.id), level.id])).toEqual([
      ['1.1', 'ai-01-twelve-croissants'],
      [null, 'ai-practice-open-days'],
      [null, 'ai-practice-same-loop'],
      ['1.2', 'ai-02-line-totals'],
      [null, 'ai-practice-items-not-lines'],
      [null, 'ai-practice-pickup-time'],
      ['1.3', 'ai-03-free-coffee'],
      [null, 'ai-practice-sold-out'],
      [null, 'ai-practice-no-double-negative'],
      ['1.4', 'ai-04-pickup-locker'],
      [null, 'ai-practice-medium-coffee'],
      [null, 'ai-practice-locker-falls-through'],
      ['1.5', 'ai-05-office-discount'],
      [null, 'ai-practice-rye-by-weight'],
      [null, 'ai-practice-ten-cents']
    ])
    expect(ai.chapters[1]!.levels.map(level => [levelNumber(level.id), level.id])).toEqual([
      ['2.1', 'ai-06-empty-basket'],
      [null, 'ai-practice-first-order'],
      [null, 'ai-practice-empty-search'],
      ['2.2', 'ai-07-just-a-refactor'],
      [null, 'ai-practice-just-a-rename'],
      [null, 'ai-practice-reduce-refactor'],
      ['2.3', 'ai-08-all-sizes'],
      [null, 'ai-practice-coffee-beans'],
      [null, 'ai-practice-tested-at-twelve'],
      ['2.4', 'ai-09-linked-issue'],
      [null, 'ai-practice-closed-on-mondays'],
      [null, 'ai-practice-greyed-out'],
      ['2.5', 'ai-10-same-but-faster'],
      [null, 'ai-practice-remembered-search'],
      [null, 'ai-practice-today-once']
    ])
    expect(ai.chapters[2]!.levels.map(level => [levelNumber(level.id), level.id])).toEqual([
      ['3.1', 'ai-11-all-tests-pass'],
      [null, 'ai-practice-if-around-expect'],
      [null, 'ai-practice-honest-test'],
      ['3.2', 'ai-12-mocked'],
      [null, 'ai-practice-mocked-total'],
      [null, 'ai-practice-mock-the-till'],
      ['3.3', 'ai-13-fixed-the-test'],
      [null, 'ai-practice-new-expected'],
      [null, 'ai-practice-flaky-test'],
      ['3.4', 'ai-14-full-coverage'],
      [null, 'ai-practice-nan-is-a-number'],
      [null, 'ai-practice-close-enough'],
      ['3.5', 'ai-15-snapshot-updated'],
      [null, 'ai-practice-snapshot-undefined'],
      [null, 'ai-practice-snapshot-as-asked']
    ])
    expect(ai.chapters[3]!.levels.map(level => [levelNumber(level.id), level.id])).toEqual([
      ['4.1', 'ai-16-just-added'],
      [null, 'ai-practice-no-sum'],
      [null, 'ai-practice-really-there'],
      ['4.2', 'ai-17-whole-euros'],
      [null, 'ai-practice-pickup-format'],
      [null, 'ai-practice-and-list'],
      ['4.3', 'ai-18-money-helper'],
      [null, 'ai-practice-no-default'],
      [null, 'ai-practice-no-extension'],
      ['4.4', 'ai-19-one-listener'],
      [null, 'ai-practice-get-year'],
      [null, 'ai-practice-sorted-copy'],
      ['4.5', 'ai-20-date-library'],
      [null, 'ai-practice-open-now'],
      [null, 'ai-practice-structured-clone']
    ])
    expect(ai.chapters[4]!.levels.map(level => [levelNumber(level.id), level.id])).toEqual([
      ['5.1', 'ai-21-customer-reviews'],
      [null, 'ai-practice-welcome-back'],
      [null, 'ai-practice-escaped-twice'],
      ['5.2', 'ai-22-payment-key'],
      [null, 'ai-practice-mail-key'],
      [null, 'ai-practice-publishable-key'],
      ['5.3', 'ai-23-staff-button'],
      [null, 'ai-practice-refund-anyone'],
      [null, 'ai-practice-checked-in-page'],
      ['5.4', 'ai-24-price-from-basket'],
      [null, 'ai-practice-back-where-you-were'],
      [null, 'ai-practice-own-pages-only'],
      ['5.5', 'ai-25-order-by-number'],
      [null, 'ai-practice-whose-id'],
      [null, 'ai-practice-your-orders-only']
    ])
    expect(ai.chapters[5]!.levels.map(level => [levelNumber(level.id), level.id])).toEqual([
      ['6.1', 'ai-26-menu-typo'],
      [null, 'ai-practice-alphabetical'],
      [null, 'ai-practice-formatting-only'],
      ['6.2', 'ai-27-pickup-note'],
      [null, 'ai-practice-vegan-badge'],
      [null, 'ai-practice-phone-number'],
      ['6.3', 'ai-28-five-cents'],
      [null, 'ai-practice-fee-class'],
      [null, 'ai-practice-five-cents-line'],
      ['6.4', 'ai-29-cart-to-basket'],
      [null, 'ai-practice-renamed-and-raised'],
      [null, 'ai-practice-renamed-everywhere'],
      ['6.5', 'ai-30-sold-out-label'],
      [null, 'ai-practice-closing-countdown'],
      [null, 'ai-practice-dark-mode-too']
    ])
    // chapter 7: a scenario, then its one steer practice task
    expect(ai.chapters[6]!.levels.map(level => [levelNumber(level.id), level.id])).toEqual([
      ['7.1', 'ai-31-what-offices-save'],
      [null, 'ai-practice-fixed-not-pinned'],
      ['7.2', 'ai-32-afternoon-deal'],
      [null, 'ai-practice-a-real-check'],
      ['7.3', 'ai-33-undo-last-add'],
      [null, 'ai-practice-not-a-fallback'],
      ['7.4', 'ai-34-order-by-email'],
      [null, 'ai-practice-not-a-filter'],
      ['7.5', 'ai-35-raise-free-delivery'],
      [null, 'ai-practice-take-it-out']
    ])
    // play order runs on into chapters 2 to 7
    expect(nextLevel('ai-practice-ten-cents')).toBe(levelById('ai-06-empty-basket'))
    expect(nextLevel('ai-practice-today-once')).toBe(levelById('ai-11-all-tests-pass'))
    expect(nextLevel('ai-practice-snapshot-as-asked')).toBe(levelById('ai-16-just-added'))
    expect(nextLevel('ai-practice-structured-clone')).toBe(levelById('ai-21-customer-reviews'))
    expect(nextLevel('ai-practice-your-orders-only')).toBe(levelById('ai-26-menu-typo'))
    expect(nextLevel('ai-practice-dark-mode-too')).toBe(levelById('ai-31-what-offices-save'))
    expect(nextLevel('ai-practice-take-it-out')).toBeNull()
    expect(nextLevel('ai-01-twelve-croissants')).toBe(levelById('ai-practice-open-days'))
  })

  it('maps the levels to their chapters', () => {
    expect(git.chapters.map(chapter => chapter.levels.map(level => level.id))).toEqual([
      [
        'git-01-first-commit',
        'git-practice-stage-one-file',
        'git-practice-commit-all',
        'git-07-stage-together',
        'git-practice-diff-staged',
        'git-08-what-changed',
        'git-practice-diff-file',
        'git-09-read-history',
        'git-practice-log-oneline',
        'git-10-ignore-build-files',
        'git-practice-ignore-logs'
      ],
      [
        'git-02-branch',
        'git-practice-list-branches',
        'git-16-started-on-wrong-branch',
        'git-practice-switch-back',
        'git-17-pick-up-teammate-branch',
        'git-practice-remote-branches',
        'git-18-clean-up-branches',
        'git-practice-rename-branch',
        'git-practice-delete-merged-branch',
        'git-19-look-at-old-version',
        'git-practice-branch-from-commit'
      ],
      [
        'git-03-merge',
        'git-practice-merge-no-ff',
        'git-20-both-sides-moved-on',
        'git-practice-merge-ff-only',
        'git-04-merge-conflict',
        'git-practice-keep-their-version',
        'git-21-back-out-of-a-merge',
        'git-practice-list-conflicts',
        'git-22-catch-up-with-main',
        'git-practice-merge-main-in'
      ],
      [
        'git-05-rebase',
        'git-practice-rebase-onto-main',
        'git-23-conflict-during-a-rebase',
        'git-practice-abort-rebase',
        'git-24-push-a-rebased-branch',
        'git-practice-push-with-lease',
        'git-25-tidy-up-before-review',
        'git-practice-reword-old-commit'
      ],
      [
        'git-26-push-your-first-branch',
        'git-practice-push-with-upstream',
        'git-27-get-your-teammates-work',
        'git-practice-fetch-only',
        'git-28-your-push-was-rejected',
        'git-practice-pull-rebase',
        'git-29-ahead-and-behind',
        'git-practice-unpushed-commits',
        'git-06-teammate-sync',
        'git-practice-prune-gone-branches'
      ],
      [
        'git-11-fix-last-commit',
        'git-practice-amend-no-edit',
        'git-12-throw-away-change',
        'git-practice-unstage-file',
        'git-practice-discard-file',
        'git-13-undo-local-commit',
        'git-practice-reset-soft',
        'git-practice-reset-hard',
        'git-14-undo-pushed-commit',
        'git-practice-revert-before-last',
        'git-15-park-unfinished-work',
        'git-practice-stash-untracked'
      ],
      [
        'git-30-committed-on-main',
        'git-practice-move-commit-to-branch',
        'git-31-lost-commits-after-reset',
        'git-practice-find-lost-commit',
        'git-32-rebased-the-wrong-branch',
        'git-practice-undo-rebase',
        'git-33-committed-a-secret',
        'git-practice-untrack-file',
        'git-practice-remove-file',
        'git-34-deleted-a-branch',
        'git-practice-restore-branch'
      ],
      [
        'git-35-pull-request-flow',
        'git-practice-clean-up-after-merge',
        'git-36-hotfix-mid-feature',
        'git-practice-stash-for-hotfix',
        'git-37-fix-the-release-branch',
        'git-practice-cherry-pick-commit',
        'git-practice-cherry-pick-x',
        'git-38-tag-a-release',
        'git-practice-annotated-tag',
        'git-practice-list-tags',
        'git-39-gitflow-release',
        'git-practice-release-from-develop'
      ]
    ])
  })

  it('derives the play order from the chapters, every level in exactly one chapter', () => {
    expect(trackLevels(git)).toEqual(gitLevels)
    expect(levels.map(level => level.id)).toEqual(tracks.flatMap(track => trackLevels(track).map(level => level.id)))
    const ids = levels.map(level => level.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const level of levels) expect(chapterOf(level.id)?.trackId).toBe(level.track)
  })

  it('refuses a level of another track, a level listed twice and a coming track with levels', () => {
    const level = gitLevels[0]!
    const chapter = { id: 'c', title: 'C', description: 'C.', colour: 0 as const, levels: [level] }
    const base = { title: 'T', scope: 'S', description: 'D.' }
    expect(() => defineTrack({ ...base, id: 'ai', status: 'live', chapters: [chapter] })).toThrow(/git level/)
    expect(() => defineTrack({ ...base, id: 'git', status: 'live', chapters: [chapter, { ...chapter, id: 'd' }] })).toThrow(/twice/)
    expect(() => defineTrack({ ...base, id: 'git', status: 'coming', chapters: [chapter] })).toThrow(/coming/)
    expect(defineTrack({ ...base, id: 'git', status: 'live', chapters: [chapter] }).cheatSheet).toBeNull()
    expect(gitTrack.cheatSheet).toBe('/git/cheat-sheet')
    expect(gitTrack.tagline).not.toBe('')
  })

  it('refuses a practice task that does not follow its scenario', () => {
    const [s1, s2] = [gitLevels[0]!, levelById('git-07-stage-together')!]
    const chapter = (levels: Level[]) => ({ ...base, id: 'git' as const, status: 'live' as const, chapters: [{ id: 'c', title: 'C', description: 'C.', colour: 0 as const, levels }] })
    const base = { title: 'T', scope: 'S', description: 'D.' }
    const practice = fakePractice('p', s1.id)
    expect(() => defineTrack(chapter([practice, s1]))).toThrow(/starts chapter c/)
    expect(() => defineTrack(chapter([s1, s2, practice]))).toThrow(/practises git-01-first-commit but is listed after git-07-stage-together/)
    expect(() => defineTrack(chapter([s1, fakePractice('q', s1.id), practice, s2]))).not.toThrow()
  })
})

describe('level numbers and places', () => {
  it('numbers scenarios chapter.position, counting scenarios only; practice tasks have no number', () => {
    expect(levelNumber('git-01-first-commit')).toBe('1.1')
    expect(levelNumber('git-07-stage-together')).toBe('1.2')
    expect(levelNumber('git-08-what-changed')).toBe('1.3')
    expect(levelNumber('git-09-read-history')).toBe('1.4')
    expect(levelNumber('git-10-ignore-build-files')).toBe('1.5')
    expect(levelNumber('git-practice-stage-one-file')).toBeNull()
    expect(levelNumber('git-02-branch')).toBe('2.1')
    expect(levelNumber('git-19-look-at-old-version')).toBe('2.5')
    expect(levelNumber('git-03-merge')).toBe('3.1')
    expect(levelNumber('git-20-both-sides-moved-on')).toBe('3.2')
    expect(levelNumber('git-04-merge-conflict')).toBe('3.3')
    expect(levelNumber('git-21-back-out-of-a-merge')).toBe('3.4')
    expect(levelNumber('git-22-catch-up-with-main')).toBe('3.5')
    expect(levelNumber('git-26-push-your-first-branch')).toBe('5.1')
    expect(levelNumber('git-29-ahead-and-behind')).toBe('5.4')
    expect(levelNumber('git-06-teammate-sync')).toBe('5.5')
    expect(levelNumber('nope')).toBeNull()
  })

  it('knows the track, chapter and position of a level', () => {
    const place = levelPlace('git-04-merge-conflict')!
    expect(place.track.id).toBe('git')
    expect(place.chapter.title).toBe('Merging')
    expect(place.position).toBe(5)
    expect(place.index).toBe(26)
    expect(place.level.title).toBe('Merge conflict')
    expect(place.scenario).toBeNull()
    expect(placeName(place)).toBe('3.3 Merge conflict')
    expect(chapterOf('git-05-rebase')?.title).toBe('Rewriting history')
    expect(chapterOf('nope')).toBeNull()
  })

  it('gives a practice task its scenario, and names it by its title alone', () => {
    const place = levelPlace('git-practice-commit-all')!
    expect(place).toMatchObject({ number: null, position: 3, index: 2, scenario: { number: '1.1', level: { id: 'git-01-first-commit' } } })
    expect(placeName(place)).toBe('Commit tracked changes in one go')
    const track = practiceTrack()
    expect(trackPlaces(track).map(item => [item.level.id, item.number, item.scenario?.number ?? null])).toEqual([
      ['s1', '1.1', null],
      ['p1a', null, '1.1'],
      ['p1b', null, '1.1'],
      ['s2', '1.2', null],
      ['s3', '1.3', null],
      ['p3a', null, '1.3'],
      ['t1', '2.1', null],
      ['q1a', null, '2.1']
    ])
  })

  it('numbers a 58-level track without gaps', () => {
    const track = bigTrack()
    const all = trackLevels(track)
    expect(all).toHaveLength(58)
    expect(levelNumber('big-1-1', [track])).toBe('1.1')
    expect(levelNumber('big-1-8', [track])).toBe('1.8')
    expect(levelNumber('big-2-1', [track])).toBe('2.1')
    expect(levelNumber('big-7-11', [track])).toBe('7.11')
    expect(levelPlace('big-7-11', [track])?.index).toBe(57)
    expect(track.chapters.map(chapter => chapter.levels.length)).toEqual(BIG_CHAPTER_SIZES)
  })
})

describe('next level', () => {
  it('goes scenario, its practice tasks, next scenario, across chapter boundaries', () => {
    expect(nextLevel('git-01-first-commit')?.id).toBe('git-practice-stage-one-file')
    expect(nextLevel('git-practice-stage-one-file')?.id).toBe('git-practice-commit-all')
    expect(nextLevel('git-practice-commit-all')?.id).toBe('git-07-stage-together')
    expect(nextLevel('git-practice-ignore-logs')?.id).toBe('git-02-branch')
    expect(nextLevel('git-03-merge')?.id).toBe('git-practice-merge-no-ff')
    expect(nextLevel('git-practice-merge-ff-only')?.id).toBe('git-04-merge-conflict')
    expect(nextLevel('git-practice-merge-main-in')?.id).toBe('git-05-rebase')
    expect(nextLevel('git-practice-reword-old-commit')?.id).toBe('git-26-push-your-first-branch')
    expect(nextLevel('git-06-teammate-sync')?.id).toBe('git-practice-prune-gone-branches')
    expect(nextLevel('git-practice-prune-gone-branches')?.id).toBe('git-11-fix-last-commit')
    expect(nextLevel('git-practice-stash-untracked')?.id).toBe('git-30-committed-on-main')
    expect(nextLevel('git-practice-restore-branch')?.id).toBe('git-35-pull-request-flow')
    expect(nextLevel('git-practice-release-from-develop')).toBeNull()
    expect(nextLevel('nope')).toBeNull()
    const track = bigTrack()
    expect(nextLevel('big-1-8', [track])?.id).toBe('big-2-1')
    // the empty last chapter is skipped: 7.11 is the end
    expect(nextLevel('big-7-11', [track])).toBeNull()
  })
})

describe('next up and continue', () => {
  it('next up is the first unsolved entry in play order, scenario or practice task', () => {
    expect(nextUp(git, emptyProgress())?.level.id).toBe('git-01-first-commit')
    expect(nextUp(git, solvedProgress(['git-01-first-commit', 'git-03-merge']))?.level.id).toBe('git-practice-stage-one-file')
    expect(nextUp(git, solvedProgress(gitLevels.map(level => level.id)))).toBeNull()
    const track = bigTrack()
    const firstEight = Array.from({ length: 8 }, (_, i) => `big-1-${i + 1}`)
    expect(nextUp(track, solvedProgress(firstEight))?.number).toBe('2.1')
  })

  it('continues the last played entry while it is unsolved', () => {
    const progress = solvedProgress(['git-01-first-commit'], { levelId: 'git-04-merge-conflict', at: 1000 })
    expect(continueTarget(git, progress)).toMatchObject({ reason: 'resume', at: 1000, place: { number: '3.3' } })
    const practice = solvedProgress(['git-01-first-commit'], { levelId: 'git-practice-commit-all', at: 5 })
    expect(continueTarget(git, practice)).toMatchObject({ reason: 'resume', place: { level: { id: 'git-practice-commit-all' } } })
  })

  it('falls back to next up when the last played entry is solved, unknown or in another track', () => {
    const solvedLast = solvedProgress(['git-01-first-commit'], { levelId: 'git-01-first-commit', at: 5 })
    expect(continueTarget(git, solvedLast)).toMatchObject({ reason: 'next', place: { level: { id: 'git-practice-stage-one-file' } } })
    const unknown = solvedProgress([], { levelId: 'git-99-gone', at: 5 })
    expect(continueTarget(git, unknown)).toMatchObject({ reason: 'next', place: { number: '1.1' } })
    expect(continueTarget(git, emptyProgress())).toMatchObject({ reason: 'next', at: null, place: { number: '1.1' } })
  })

  it('offers a "practise again" entry once nothing is unsolved, else nothing', () => {
    const all = gitLevels.map(level => level.id)
    expect(continueTarget(git, solvedProgress(all, { levelId: 'git-15-park-unfinished-work', at: 5 }))).toBeNull()
    const flagged = solvedProgress(all, null, ['git-05-rebase', 'git-07-stage-together'])
    expect(continueTarget(git, flagged)).toMatchObject({ reason: 'practise', at: null, place: { number: '1.2' } })
    // new entries come first
    const someLeft = solvedProgress(all.filter(id => id !== 'git-03-merge'), null, ['git-07-stage-together'])
    expect(continueTarget(git, someLeft)).toMatchObject({ reason: 'next', place: { number: '3.1' } })
  })

  it('finds the first flagged entry of a chapter', () => {
    const [basics, branching] = git.chapters
    const progress = solvedProgress(['git-01-first-commit', 'git-practice-commit-all', 'git-08-what-changed'], null, ['git-practice-commit-all', 'git-08-what-changed'])
    expect(practiseAgainIn(basics!, progress)?.id).toBe('git-practice-commit-all')
    expect(practiseAgainIn(branching!, progress)).toBeNull()
  })
})

describe('progress counts', () => {
  it('counts solved entries per track and chapter, both kinds, ignoring unknown ids and unsolved entries', () => {
    const progress = solvedProgress(['git-03-merge', 'git-04-merge-conflict', 'git-01-first-commit', 'git-practice-stage-one-file', 'elsewhere'], { levelId: 'git-02-branch', at: 3 })
    expect(trackProgress(git, progress)).toEqual({ solved: 4, total: 85 })
    expect(git.chapters.map(chapter => chapterProgress(chapter, progress))).toEqual([
      { solved: 2, total: 11 },
      { solved: 0, total: 11 },
      { solved: 2, total: 10 },
      { solved: 0, total: 8 },
      { solved: 0, total: 10 },
      { solved: 0, total: 12 },
      { solved: 0, total: 11 },
      { solved: 0, total: 12 }
    ])
    expect(trackProgress(trackById('frameworks')!, progress)).toEqual({ solved: 0, total: 0 })
  })
})

describe('commands a level practises', () => {
  it('finds the git subcommands of a line, also in chains', () => {
    expect(gitSubcommands('git add . && git commit -m "x"')).toEqual(['add', 'commit'])
    expect(gitSubcommands('echo "git push" > notes.txt')).toEqual([])
    expect(gitSubcommands('git push --force-with-lease')).toEqual(['push'])
  })

  it('lists each command of the solution once, in order of first use', () => {
    const byId = (id: string) => levelCommands(levels.find(level => level.id === id)!)
    expect(byId('git-01-first-commit')).toEqual(['init', 'add', 'commit'])
    expect(byId('git-04-merge-conflict')).toEqual(['merge', 'add', 'commit'])
    expect(byId('git-06-teammate-sync')).toEqual(['push', 'fetch', 'rebase', 'add'])
    // editor saves are not commands
    expect(byId('git-25-tidy-up-before-review')).toEqual(['rebase'])
  })
})

describe('progress on the home page', () => {
  it('has progress once a level is solved or played', () => {
    expect(hasProgress(emptyProgress())).toBe(false)
    const unsolved = emptyProgress()
    unsolved.levels['git-01-first-commit'] = { solved: false, best: null, latest: null, practiseAgain: false, lastPlayed: null, fewestHints: null }
    expect(hasProgress(unsolved)).toBe(false)
    expect(hasProgress(solvedProgress(['git-01-first-commit']))).toBe(true)
    expect(hasProgress(solvedProgress([], { levelId: 'git-01-first-commit', at: 1 }))).toBe(true)
  })

  it('continues the live track you last played, else the first live track with a solve', () => {
    expect(trackToContinue(emptyProgress())).toBeNull()
    expect(trackToContinue(solvedProgress([], { levelId: 'git-03-merge', at: 1 }))?.id).toBe('git')
    expect(trackToContinue(solvedProgress(['git-02-branch']))?.id).toBe('git')
    // a last played level nobody knows any more, and no solves: nothing to continue
    expect(trackToContinue(solvedProgress([], { levelId: 'git-99-gone', at: 1 }))).toBeNull()
    const big = bigTrack()
    expect(trackToContinue(solvedProgress(['big-2-1']), [git, big])).toBe(big)
  })
})
