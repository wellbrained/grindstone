// The Working with AI track (ADR 0008): its chapters and their levels, in play order. Chapters 1 (Read the diff), 2
// (Claims vs. code), 3 (Tests that lie), 4 (Invented APIs), 5 (Security) and 6 (Scope and size) are live, chapter 7
// is coming. A practice task goes right after the scenario it trains (`practises`); defineTrack checks it.
import { fewestHintsThenFalseAlarms } from '../progress'
import { defineTrack, trackLevels } from '../track'
import { isReviewLevel } from './types'
import type { ReviewLevel } from './types'
import { twelveCroissants } from './01-twelve-croissants'
import { lineTotals } from './02-line-totals'
import { freeCoffee } from './03-free-coffee'
import { pickupLocker } from './04-pickup-locker'
import { officeDiscount } from './05-office-discount'
import { emptyBasket } from './06-empty-basket'
import { justARefactor } from './07-just-a-refactor'
import { allSizes } from './08-all-sizes'
import { linkedIssue } from './09-linked-issue'
import { sameButFaster } from './10-same-but-faster'
import { allTestsPass } from './11-all-tests-pass'
import { mocked } from './12-mocked'
import { fixedTheTest } from './13-fixed-the-test'
import { fullCoverage } from './14-full-coverage'
import { snapshotUpdated } from './15-snapshot-updated'
import { justAdded } from './16-just-added'
import { wholeEuros } from './17-whole-euros'
import { moneyHelper } from './18-money-helper'
import { oneListener } from './19-one-listener'
import { dateLibrary } from './20-date-library'
import { customerReviews } from './21-customer-reviews'
import { paymentKey } from './22-payment-key'
import { staffButton } from './23-staff-button'
import { priceFromBasket } from './24-price-from-basket'
import { orderByNumber } from './25-order-by-number'
import { menuTypo } from './26-menu-typo'
import { pickupNote } from './27-pickup-note'
import { fiveCents } from './28-five-cents'
import { cartToBasket } from './29-cart-to-basket'
import { soldOutLabel } from './30-sold-out-label'
import {
  backWhereYouWere,
  checkedInPage,
  escapedTwice,
  mailKey,
  ownPagesOnly,
  publishableKey,
  refundAnyone,
  welcomeBack,
  whoseId,
  yourOrdersOnly
} from './practice/security'
import {
  alphabetical,
  closingCountdown,
  darkModeToo,
  feeClass,
  fiveCentsLine,
  formattingOnly,
  phoneNumber,
  renamedAndRaised,
  renamedEverywhere,
  veganBadge
} from './practice/scope-and-size'
import {
  andList,
  getYear,
  noDefault,
  noExtension,
  noSum,
  openNow,
  pickupFormat,
  reallyThere,
  sortedCopy,
  structuredCopy
} from './practice/invented-apis'
import {
  coffeeBeans,
  emptySearch,
  firstOrder,
  closedOnMondays,
  greyedOut,
  justARename,
  reduceRefactor,
  rememberedSearch,
  testedAtTwelve,
  todayOnce
} from './practice/claims-vs-code'
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
import {
  closeEnough,
  flakyTest,
  honestTest,
  ifAroundExpect,
  mockTheTill,
  mockedTotal,
  nanIsANumber,
  newExpected,
  snapshotAsAsked,
  snapshotUndefined
} from './practice/tests-that-lie'

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
    {
      id: 'claims-vs-code',
      title: 'Claims vs. code',
      description: 'The description says one thing, the code does another: “handles empty baskets”, “no behaviour change”, “fixes #142”.',
      colour: 1,
      levels: [
        emptyBasket,
        firstOrder,
        emptySearch,
        justARefactor,
        justARename,
        reduceRefactor,
        allSizes,
        coffeeBeans,
        testedAtTwelve,
        linkedIssue,
        closedOnMondays,
        greyedOut,
        sameButFaster,
        rememberedSearch,
        todayOnce
      ]
    },
    {
      id: 'tests-that-lie',
      title: 'Tests that lie',
      description: 'Tests that assert nothing, mock the thing under test, or were changed to pass: run them, on this pull request and on main.',
      colour: 2,
      levels: [
        allTestsPass,
        ifAroundExpect,
        honestTest,
        mocked,
        mockedTotal,
        mockTheTill,
        fixedTheTest,
        newExpected,
        flakyTest,
        fullCoverage,
        nanIsANumber,
        closeEnough,
        snapshotUpdated,
        snapshotUndefined,
        snapshotAsAsked
      ]
    },
    {
      id: 'invented-apis',
      title: 'Invented APIs',
      description: 'Functions, options and packages that don\'t exist, and calls that are long deprecated: run them, and the Console says so.',
      colour: 3,
      levels: [
        justAdded,
        noSum,
        reallyThere,
        wholeEuros,
        pickupFormat,
        andList,
        moneyHelper,
        noDefault,
        noExtension,
        oneListener,
        getYear,
        sortedCopy,
        dateLibrary,
        openNow,
        structuredCopy
      ]
    },
    {
      id: 'security',
      title: 'Security',
      description: 'HTML injection, a secret in the code, a missing check on who may do something, trusting the client.',
      colour: 4,
      levels: [
        customerReviews,
        welcomeBack,
        escapedTwice,
        paymentKey,
        mailKey,
        publishableKey,
        staffButton,
        refundAnyone,
        checkedInPage,
        priceFromBasket,
        backWhereYouWere,
        ownPagesOnly,
        orderByNumber,
        whoseId,
        yourOrdersOnly
      ]
    },
    {
      id: 'scope-and-size',
      title: 'Scope and size',
      description: 'Unrelated changes, a rewrite where a line would do, a pull request that should be two.',
      colour: 5,
      levels: [
        menuTypo,
        alphabetical,
        formattingOnly,
        pickupNote,
        veganBadge,
        phoneNumber,
        fiveCents,
        feeClass,
        fiveCentsLine,
        cartToBasket,
        renamedAndRaised,
        renamedEverywhere,
        soldOutLabel,
        closingCountdown,
        darkModeToo
      ]
    },
    { id: 'steer', title: 'Steer the assistant', description: 'Write the review that gets Sous to the right fix.', colour: 6, levels: [] }
  ]
})

/** The Working with AI track's levels, in play order. */
export const aiLevels: ReviewLevel[] = trackLevels(aiTrack).filter(isReviewLevel)
