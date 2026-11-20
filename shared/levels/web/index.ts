// The Web fundamentals track (ADR 0009): its chapters and their levels, in play order. All seven chapters are live.
// A practice task goes right after the scenario it trains (`practises`); defineTrack
// checks it.
import { fewestWrongPredictions } from '../progress'
import { defineTrack, trackLevels } from '../track'
import { isWebLevel } from './types'
import type { WebLevel } from './types'
import { menuBlocked } from './01-menu-blocked'
import { orderPreflight } from './02-order-preflight'
import { basketCredentials } from './03-basket-credentials'
import { basketHeader } from './04-basket-header'
import { worksWithCurl } from './05-works-with-curl'
import { signInLost } from './06-sign-in-lost'
import { orderFromElsewhere } from './07-order-from-elsewhere'
import { scriptReadsSession } from './08-script-reads-session'
import { cookiePath } from './09-cookie-path'
import { emailLink } from './10-email-link'
import { tokenInStorage } from './11-token-in-storage'
import { reviewRuns } from './12-review-runs'
import { tokenNeverExpires } from './13-token-never-expires'
import { signedOutAgain } from './14-signed-out-again'
import { logoutStays } from './15-logout-stays'
import { oldPrice } from './16-old-price'
import { wholeMenu } from './17-whole-menu'
import { someoneElsesAccount } from './18-someone-elses-account'
import { varyOrigin } from './19-vary-origin'
import { staleDeploy } from './20-stale-deploy'
import { spinnerNeverSpins } from './21-spinner'
import { pickupMenu } from './22-pickup-menu'
import { kitchenScreen } from './23-kitchen-screen'
import { toastPops } from './24-toast'
import { progressBar } from './25-progress-bar'
import { everyButton } from './26-every-button'
import { checkoutKeyboard } from './27-checkout'
import { allergensOpen } from './28-allergens'
import { silentError } from './29-silent-error'
import { focusLost } from './30-focus-lost'
import { letsItRun } from './31-lets-it-run'
import { freeFlour } from './32-free-flour'
import { phonesHome } from './33-phones-home'
import { onlyWatched } from './34-only-watched'
import { widgetMoved } from './35-widget-moved'
import { consoleOrder, readableAnswers, sameOrigin, simpleOrPreflight, whichHeaders, whichMethods } from './practice/cors'
import { attackerRequests, linkCookies, sameSiteOrNot, whichHosts, whichStored } from './practice/cookies'
import { afterLogout, refreshCookie, scriptReads, whichRun, whichTokens } from './practice/auth'
import { askOrNot, cdnKeeps, ownCondition, ownCopy, reachesToday } from './practice/caching'
import { doesItFade, firstLine, tapOrder, whenPaint, whichReads } from './practice/loop'
import { announced, readerSays, tabOrder, whichKeys, whichState } from './practice/accessibility'
import { shopHeaders, twoPolicies, whichRequests, whichScripts, whoMayFrame } from './practice/headers'

export const webTrack = defineTrack({
  id: 'web',
  title: 'Web fundamentals',
  scope: 'The rules the browser enforces: CORS, cookies, auth, caching, the event loop, accessibility and security headers.',
  tagline: 'Predict what the browser does, then fix it.',
  description: 'The rules the browser enforces that bite in production, at Corner Bakery\'s shop and its API on another origin. Before each app runs you predict what the browser will do: which request it blocks, which cookie it keeps, which line comes first, what a screen reader says. Then read the Network, Application, Event loop and Accessibility panels and fix the server\'s code or the page\'s until it works. The browser\'s rules are modelled on the Fetch, cookie, HTML and accessibility specs, so every run is the same.',
  status: 'live',
  // fewest wrong predictions, then fewest hints, then fewest reloads (ADR 0009)
  bestRun: fewestWrongPredictions,
  chapters: [
    {
      id: 'cors',
      title: 'Same-origin & CORS',
      description: 'Simple and preflighted requests, the Access-Control-Allow-* headers, and `*` with credentials.',
      colour: 0,
      levels: [
        menuBlocked,
        consoleOrder,
        sameOrigin,
        orderPreflight,
        simpleOrPreflight,
        basketCredentials,
        readableAnswers,
        basketHeader,
        whichHeaders,
        worksWithCurl,
        whichMethods
      ]
    },
    {
      id: 'cookies',
      title: 'Cookies & sessions',
      description: 'SameSite (Lax, Strict, None), Secure, HttpOnly, Domain and Path; CSRF from another site.',
      colour: 1,
      levels: [
        signInLost,
        whichStored,
        orderFromElsewhere,
        attackerRequests,
        scriptReadsSession,
        sameSiteOrNot,
        cookiePath,
        whichHosts,
        emailLink,
        linkCookies
      ]
    },
    {
      id: 'auth',
      title: 'Auth & tokens',
      description: 'Where a token lives (a cookie or storage), XSS against CSRF, expiry and refresh, logging out.',
      colour: 2,
      levels: [
        tokenInStorage,
        scriptReads,
        reviewRuns,
        whichRun,
        tokenNeverExpires,
        whichTokens,
        signedOutAgain,
        refreshCookie,
        logoutStays,
        afterLogout
      ]
    },
    {
      id: 'caching',
      title: 'HTTP caching',
      description: '`max-age`, `no-cache`, `no-store`, ETag and 304, a CDN in between, a stale deploy.',
      colour: 3,
      levels: [
        oldPrice,
        askOrNot,
        wholeMenu,
        ownCondition,
        someoneElsesAccount,
        cdnKeeps,
        varyOrigin,
        ownCopy,
        staleDeploy,
        reachesToday
      ]
    },
    {
      id: 'event-loop',
      title: 'The event loop',
      description: 'Tasks, microtasks and rendering: predict the order things happen in.',
      colour: 4,
      levels: [
        spinnerNeverSpins,
        whenPaint,
        pickupMenu,
        tapOrder,
        kitchenScreen,
        whichReads,
        toastPops,
        doesItFade,
        progressBar,
        firstLine
      ]
    },
    {
      id: 'accessibility',
      title: 'Accessibility',
      description: 'Names, roles, state, focus order, the keyboard and live regions.',
      colour: 5,
      levels: [
        everyButton,
        readerSays,
        checkoutKeyboard,
        whichKeys,
        allergensOpen,
        whichState,
        silentError,
        announced,
        focusLost,
        tabOrder
      ]
    },
    {
      id: 'security-headers',
      title: 'Security headers & CSP',
      description: 'Content-Security-Policy, frame-ancestors and the headers a shop sends.',
      colour: 6,
      levels: [
        letsItRun,
        whichScripts,
        freeFlour,
        whoMayFrame,
        phonesHome,
        whichRequests,
        onlyWatched,
        twoPolicies,
        widgetMoved,
        shopHeaders
      ]
    }
  ]
})

/** The Web fundamentals track's levels, in play order. */
export const webLevels: WebLevel[] = trackLevels(webTrack).filter(isWebLevel)
