import type { InjectionKey } from 'vue'

// Working with AI's phone tabs (docs/features/ui.md, "Working with AI play page"): below lg the pull request, the review
// box and Run the PR are one tab each (PlayTabs), all mounted, so a draft or a comment stays when you switch. From lg all
// three are on screen and showing one is a no-op.
export type ReviewPane = 'diff' | 'review' | 'run'

export const REVIEW_PANES: readonly ReviewPane[] = ['diff', 'review', 'run']

/** Brings a pane on screen before something in it is shown or focused (a comment, a diff line, the review box). */
export const SHOW_REVIEW_PANE: InjectionKey<(pane: ReviewPane) => Promise<void>> = Symbol('showReviewPane')
