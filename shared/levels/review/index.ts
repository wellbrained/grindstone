// The Working with AI track (ADR 0008): its chapters and their levels, in play order. Chapter 1 (Read the diff) is live,
// chapters 2 to 7 are coming. A practice task goes right after the scenario it trains (`practises`); defineTrack checks it.
import { fewestHintsThenFalseAlarms } from '../progress'
import { defineTrack, trackLevels } from '../track'
import { isReviewLevel } from './types'
import type { ReviewLevel } from './types'
import { twelveCroissants } from './01-twelve-croissants'
import { lineTotals } from './02-line-totals'
import { freeCoffee } from './03-free-coffee'
import { pickupLocker } from './04-pickup-locker'
import { officeDiscount } from './05-office-discount'
import {
  itemsNotLines,
  lockerFallsThrough,
  mediumCoffee,
  noDoubleNegative,
  openDays,
  pickupTime,
  ryeByWeight,
  sameLoop,
  soldOut,
  tenCents
} from './practice/read-the-diff'

export const aiTrack = defineTrack({
  id: 'ai',
  title: 'Working with AI',
  scope: 'Lead the AI instead of letting it do the work, and review the code it writes.',
  tagline: 'Lead the assistant, then check its work.',
  description: 'Sous, Corner Bakery\'s coding assistant, opens pull requests: fast, confident and usually right. Review them like a teammate\'s: comment on the lines that are wrong, say what kind of problem it is, run the change in the shop, then approve it or request changes. Sous is scripted, no AI is called, so every review is fair and the same.',
  status: 'live',
  // fewest hints, then fewest false alarms (ADR 0008): comments that found nothing cost, a long look costs nothing
  bestRun: fewestHintsThenFalseAlarms,
  chapters: [
    {
      id: 'read-the-diff',
      title: 'Read the diff',
      description: 'Plain bugs in small pull requests: off by one, the wrong variable, a condition the wrong way round, a missing case, a unit slip.',
      colour: 0,
      levels: [
        twelveCroissants,
        openDays,
        sameLoop,
        lineTotals,
        itemsNotLines,
        pickupTime,
        freeCoffee,
        soldOut,
        noDoubleNegative,
        pickupLocker,
        mediumCoffee,
        lockerFallsThrough,
        officeDiscount,
        ryeByWeight,
        tenCents
      ]
    },
    { id: 'claims-vs-code', title: 'Claims vs. code', description: 'The description says one thing, the code does another: “handles empty baskets”, “no behaviour change”.', colour: 1, levels: [] },
    { id: 'tests-that-lie', title: 'Tests that lie', description: 'Tests that assert nothing, mock the thing under test, or were changed to pass.', colour: 2, levels: [] },
    { id: 'invented-apis', title: 'Invented APIs', description: 'Functions, options and packages that don\'t exist, and calls that are long deprecated.', colour: 3, levels: [] },
    { id: 'security', title: 'Security', description: 'HTML injection, a secret in the code, a missing check on who may do something, trusting the client.', colour: 4, levels: [] },
    { id: 'scope-and-size', title: 'Scope and size', description: 'Unrelated changes, a rewrite where a line would do, a pull request that should be two.', colour: 5, levels: [] },
    { id: 'steer', title: 'Steer the assistant', description: 'Write the review that gets Sous to the right fix.', colour: 6, levels: [] }
  ]
})

/** The Working with AI track's levels, in play order. */
export const aiLevels: ReviewLevel[] = trackLevels(aiTrack).filter(isReviewLevel)
