// The Debugging track (ADR 0007): its chapters and their levels, in play order; all seven chapters are live. A practice
// task goes right after the scenario it trains (`practises`); defineTrack checks it.
import { fewestHintsThenReloads } from '../progress'
import { defineTrack, trackLevels } from '../track'
import { isDebugLevel } from './types'
import type { DebugLevel } from './types'
import { addToCart } from './01-add-to-cart'
import { pricesVanished } from './02-prices-vanished'
import { totalNotDefined } from './03-total-not-defined'
import { errorInMoney } from './04-error-in-money'
import { blankPage } from './05-blank-page'
import { menuWontLoad } from './06-menu-wont-load'
import { nothingHappens } from './07-nothing-happens'
import { wrongQuantity } from './08-wrong-quantity'
import { worksOnMyMachine } from './09-works-on-my-machine'
import { ordersTwice } from './10-orders-twice'
import { invisibleOrder } from './11-invisible-order'
import { cantClick } from './12-cant-click'
import { styleDoesntApply } from './13-style-doesnt-apply'
import { goneOnPhones } from './14-gone-on-phones'
import { longName } from './15-long-name'
import { objectPromise } from './16-object-promise'
import { wrongResults } from './17-wrong-results'
import { addsSourdough } from './18-adds-sourdough'
import { changesBoth } from './19-changes-both'
import { saysItFailed } from './20-says-it-failed'
import { discountTwice } from './21-discount-twice'
import { missesLastItem } from './22-misses-last-item'
import { noFreeDelivery } from './23-no-free-delivery'
import { alwaysPickup } from './24-always-pickup'
import { seventhItem } from './25-seventh-item'
import { requestPerKey } from './26-request-per-key'
import { redrawsMenu } from './27-redraws-menu'
import { formattedThousands } from './28-formatted-thousands'
import { oneAfterAnother } from './29-one-after-another'
import { asksAgain } from './30-asks-again'
import { checkoutErrors } from './31-checkout-errors'
import { whichDeploy } from './32-which-deploy'
import { rollBackNow } from './33-roll-back-now'
import { someCustomers } from './34-some-customers'
import { onlyInProduction } from './35-only-in-production'
import {
  closeTheBracket,
  frameThatPassed,
  importRightName,
  lineThatThrows,
  misspelledProperty,
  moveDeclarationUp,
  realMistake,
  threeFrameTrace
} from './practice/reading-errors'
import {
  buildsTheAddress,
  checkResponseOk,
  disableWhileSending,
  failingRequest,
  ownOrigin,
  quantityAsNumber,
  rightPath
} from './practice/network'
import {
  inheritedColour,
  letClicksThrough,
  longAddress,
  mediaQueryLine,
  nowrapLine,
  ruleThatWins,
  selectorTypo,
  turnTheQuery,
  variableName,
  whatCovers
} from './practice/elements-css'
import {
  awaitTheHours,
  catchTheRejection,
  copyLastWeek,
  dropTheOldDay,
  forgotToWait,
  oldAnswerWins,
  ownTime,
  passTheDataOn,
  sameList,
  sharedIndex
} from './practice/state-async'
import {
  boxFromSix,
  commaPrice,
  compareTheDay,
  countOnce,
  loopStart,
  noExtraSize,
  secondCaller,
  stockZero,
  unroundedCompare,
  wrongSlices
} from './practice/breakpoints'
import {
  asksForHoursAgain,
  bothAtOnce,
  checkOnce,
  drawsAllDays,
  keepTheAnswer,
  mapLookup,
  mostSelfWork,
  onlyTheCounter,
  sendsPerKey,
  waitsFirst
} from './practice/performance'
import {
  bodyByHand,
  brokeTheHours,
  customerError,
  escapeTheName,
  fieldTheServerReads,
  flagInProduction,
  keepTheEuroSign,
  lastGoodVersion,
  rollItBack,
  switchItOff
} from './practice/incidents'

export const debuggingTrack = defineTrack({
  id: 'debugging',
  title: 'Debugging',
  scope: 'DevTools and incidents: track a bug down to its cause.',
  tagline: 'Find the bug before your customers do.',
  description: 'Small real apps with real bugs, from Corner Bakery\'s ordering site: read the Console, the Network and Elements panels, follow the stack trace to the line, step through a recorded run with breakpoints, count what a slow page does, read the server\'s logs and roll back a bad deploy, fix the code and reload until the shop works again. Goals check what the app does, so any fix that works counts.',
  status: 'live',
  // fewest hints, then fewest reloads (ADR 0007): no commands to count, and no clock
  bestRun: fewestHintsThenReloads,
  chapters: [
    {
      id: 'reading-errors',
      title: 'Reading errors',
      description: 'The Console and stack traces: “is not a function”, “not defined”, typos, wrong imports and syntax errors.',
      colour: 0,
      levels: [
        addToCart,
        lineThatThrows,
        misspelledProperty,
        pricesVanished,
        importRightName,
        totalNotDefined,
        moveDeclarationUp,
        errorInMoney,
        frameThatPassed,
        threeFrameTrace,
        blankPage,
        realMistake,
        closeTheBracket
      ]
    },
    {
      id: 'network',
      title: 'Network',
      description: 'Failed requests, status codes, payloads and CORS.',
      colour: 1,
      levels: [
        menuWontLoad,
        buildsTheAddress,
        rightPath,
        nothingHappens,
        failingRequest,
        checkResponseOk,
        wrongQuantity,
        quantityAsNumber,
        worksOnMyMachine,
        ownOrigin,
        ordersTwice,
        disableWhileSending
      ]
    },
    {
      id: 'elements-css',
      title: 'Elements & CSS',
      description: 'What the page really renders, and why a style does not apply.',
      colour: 2,
      levels: [
        invisibleOrder,
        inheritedColour,
        variableName,
        cantClick,
        whatCovers,
        letClicksThrough,
        styleDoesntApply,
        ruleThatWins,
        selectorTypo,
        goneOnPhones,
        mediaQueryLine,
        turnTheQuery,
        longName,
        nowrapLine,
        longAddress
      ]
    },
    {
      id: 'state-async',
      title: 'State & async',
      description: 'Missing await, races, shared state and promise chains that lose their value.',
      colour: 3,
      levels: [
        objectPromise,
        forgotToWait,
        awaitTheHours,
        wrongResults,
        oldAnswerWins,
        dropTheOldDay,
        addsSourdough,
        sharedIndex,
        ownTime,
        changesBoth,
        sameList,
        copyLastWeek,
        saysItFailed,
        passTheDataOn,
        catchTheRejection
      ]
    },
    {
      id: 'breakpoints',
      title: 'Breakpoints & stepping',
      description: 'Record a run, then step through it with breakpoints and watch every value change.',
      colour: 4,
      levels: [
        discountTwice,
        secondCaller,
        countOnce,
        missesLastItem,
        loopStart,
        noExtraSize,
        noFreeDelivery,
        unroundedCompare,
        boxFromSix,
        alwaysPickup,
        stockZero,
        compareTheDay,
        seventhItem,
        wrongSlices,
        commaPrice
      ]
    },
    {
      id: 'performance',
      title: 'Performance',
      description: 'Slow, not wrong: requests per key, pages drawn again, work in a loop, waterfalls and asking twice.',
      colour: 5,
      levels: [
        requestPerKey,
        sendsPerKey,
        checkOnce,
        redrawsMenu,
        drawsAllDays,
        onlyTheCounter,
        formattedThousands,
        mostSelfWork,
        mapLookup,
        oneAfterAnother,
        waitsFirst,
        bothAtOnce,
        asksAgain,
        asksForHoursAgain,
        keepTheAnswer
      ]
    },
    {
      id: 'incidents',
      title: 'Incidents',
      description: 'Logs, the latest change and a rollback while customers wait.',
      colour: 6,
      levels: [
        checkoutErrors,
        customerError,
        fieldTheServerReads,
        whichDeploy,
        brokeTheHours,
        keepTheEuroSign,
        rollBackNow,
        lastGoodVersion,
        rollItBack,
        someCustomers,
        bodyByHand,
        escapeTheName,
        onlyInProduction,
        flagInProduction,
        switchItOff
      ]
    }
  ]
})

/** The Debugging track's levels, in play order. */
export const debuggingLevels: DebugLevel[] = trackLevels(debuggingTrack).filter(isDebugLevel)
