// The Debugging track (ADR 0007): its chapters and their levels, in play order. Chapters 1 to 3 are live; the other
// four are coming (no levels yet). A practice task goes right after the scenario it trains (`practises`); defineTrack checks it.
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

export const debuggingTrack = defineTrack({
  id: 'debugging',
  title: 'Debugging',
  scope: 'DevTools and incidents: track a bug down to its cause.',
  tagline: 'Find the bug before your customers do.',
  description: 'Small real apps with real bugs, from Corner Bakery\'s ordering site: read the Console, the Network and Elements panels, follow the stack trace to the line, fix the code and reload until the shop works again. Goals check what the app does, so any fix that works counts.',
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
    { id: 'state-async', title: 'State & async', description: 'Stale state, race conditions and promises that never settle.', colour: 3, levels: [] },
    { id: 'breakpoints', title: 'Breakpoints & stepping', description: 'Pause the code and step through it instead of guessing.', colour: 4, levels: [] },
    { id: 'performance', title: 'Performance', description: 'Slow pages, long tasks and what makes them slow.', colour: 5, levels: [] },
    { id: 'incidents', title: 'Incidents', description: 'Logs, the latest change and a rollback while customers wait.', colour: 6, levels: [] }
  ]
})

/** The Debugging track's levels, in play order. */
export const debuggingLevels: DebugLevel[] = trackLevels(debuggingTrack).filter(isDebugLevel)
