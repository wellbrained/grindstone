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
}

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
  }
}
