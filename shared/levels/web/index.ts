// The Web fundamentals track (ADR 0009): its chapters and their levels, in play order. Chapter 1 is live, chapters 2 to
// 7 are coming (no levels yet). A practice task goes right after the scenario it trains (`practises`); defineTrack
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
import { consoleOrder, readableAnswers, sameOrigin, simpleOrPreflight, whichHeaders, whichMethods } from './practice/cors'

export const webTrack = defineTrack({
  id: 'web',
  title: 'Web fundamentals',
  scope: 'The rules the browser enforces: CORS, cookies, auth, caching, the event loop, accessibility and security headers.',
  tagline: 'Predict what the browser does, then fix it.',
  description: 'The rules the browser enforces that bite in production, at Corner Bakery\'s shop and its API on another origin. Before each app runs you predict what the browser will do: which request it blocks, which line comes first. Then read the Network panel and fix the server\'s code or the page\'s until it works. The browser\'s rules are modelled on the Fetch spec, so every run is the same.',
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
      levels: []
    },
    {
      id: 'auth',
      title: 'Auth & tokens',
      description: 'Where a token lives (a cookie or storage), XSS against CSRF, expiry and refresh, logging out.',
      colour: 2,
      levels: []
    },
    {
      id: 'caching',
      title: 'HTTP caching',
      description: '`max-age`, `no-cache`, `no-store`, ETag and 304, a CDN in between, a stale deploy.',
      colour: 3,
      levels: []
    },
    {
      id: 'event-loop',
      title: 'The event loop',
      description: 'Tasks, microtasks and rendering: predict the order things happen in.',
      colour: 4,
      levels: []
    },
    {
      id: 'accessibility',
      title: 'Accessibility',
      description: 'Names, roles, state, focus order, the keyboard and live regions.',
      colour: 5,
      levels: []
    },
    {
      id: 'security-headers',
      title: 'Security headers & CSP',
      description: 'Content-Security-Policy, frame-ancestors and the headers a shop sends.',
      colour: 6,
      levels: []
    }
  ]
})

/** The Web fundamentals track's levels, in play order. */
export const webLevels: WebLevel[] = trackLevels(webTrack).filter(isWebLevel)
