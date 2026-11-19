// The Web fundamentals track's browser and servers inside the sealed frame (ADR 0009; docs/features/levels.md "The web
// backend"): it answers the app's `fetch` the way a browser would talk to the shop's API on another origin. The page is
// on the shop's origin (`https://cornerbakery.shop`); a request to the API's origin (`https://api.cornerbakery.shop`)
// goes through the CORS model (cors.ts): a preflight first when it needs one (its own row in the Network panel, never a
// cookie), then the request with the Origin, the Referer and the cookies the cookie jar (cookies.ts) gives it, then the
// CORS check on the answer, whose Set-Cookie lines go into the jar first (as Fetch stores them before it checks). The
// API's answers come from the level's own `server.js` (server.ts, run in a worker); the shop's own server answers fixed
// routes, also on the other origins it serves (www, another port); another site's server (sites.ts) answers anything
// with 200. A refusal is what Chrome does: `TypeError: Failed to fetch` for the app, Chrome's two Console lines, and in
// the Network panel the row with "CORS error", the reason, and what the server really sent.
//
// Chapter 2 (cookies): `document.cookie` in the frame reads and writes the same jar (the bridge defines it), other
// sites' pages run as data (`visit`: their images, fetches, self-submitting forms and links, each request tagged with
// the site), and the Application panel gets the jar after every change (`cookies` messages, at most every 50 ms).
//
// Chapter 3 (auth & tokens): Web Storage (storage.ts: `localStorage` and `sessionStorage` per origin, the page's objects
// defined by the bridge, `storage` messages for the Application panel), a scripted clock that moves (`later`: cookies
// expire, tokens run out; server.js and the page tell that time), and a thief: `copy` (what a script on the page could
// take, or a copy of the browser's cookies), `issued` (what a sign-in answered some minutes ago) and `replay` (the copy
// sent from outside the browser, as curl would: no CORS, no SameSite; `show` puts it in the Server panel).
//
// Chapter 4 (HTTP caching): the browser's HTTP cache between the page's fetch and the network (cache.ts: Chrome's rules,
// the `cache` modes of fetch and the headers Fetch adds for them, a 304 that freshens the copy), a CDN in front of the
// API (RFC 9111's shared cache: `Age` and `x-cache` on what it serves, its log), another customer's browser (`other`:
// Sam on his phone, a customer on www) whose requests meet Lena's copies only at the CDN, Express's ETag in server.js,
// and the Application panel's Cache (`cache` messages: both caches' copies, their age and hits, the CDN's log).
//
// Two halves, like Debugging's backend: `webConfig` (TypeScript) turns the level's spec and files into plain data, and
// WEB_BACKEND_SOURCE (JavaScript in a string) runs in the frame (and in the unit tests, with a server run in-process).
// The same interface as Debugging's backend (`fetch`, `pending`, `count`, `sent`), plus what the web probes read:
// `read` (answers whose body the app read), `arrived` (requests that reached server.js), `from` (a request from another
// origin, the way a page there would send it), `visit`, `navigate`, `carried`, `leaked` and `readable`.
import { STATUS_TEXT, backendConfig } from '../debugging/backend'
import type { BackendRoute, ProbeStep } from '../debugging/types'
import { COOKIE_SOURCE, WEB_CLOCK } from './cookies'
import { CACHE_LIMITS, CACHE_SOURCE } from './cache'
import { CORS_SOURCE } from './cors'
import { SCRIPTED_DATE_SOURCE, SCRIPTED_TIME_SOURCE, SERVER_HOST_SOURCE, SERVER_LIMITS, serverPrelude } from './server'
import type { OtherSite, SiteAction } from './sites'
import { STORAGE_LIMITS, STORAGE_SOURCE } from './storage'
import type { StorageKind } from './storage'

/** The time each exchange with a server takes on the way (both ways together), like a quick local network. */
export const WEB_DELAY_MS = 20

/** What the Application panel gets of a load at most: cookie rows, refused attempts, and characters of a value or line. */
export const COOKIE_PANEL_LIMITS = { rows: 200, refused: 100, text: 300 } as const

/** A cookie the browser kept from before the page loaded: a Set-Cookie line the answer to `url` gave, `minutesAgo`. */
export interface SeedCookie {
  url: string
  line: string
  minutesAgo: number
}

/** An item the browser kept in an origin's storage from before the page loaded (chapter 3). */
export interface SeedItem {
  origin: string
  kind: StorageKind
  key: string
  value: string
}

/** A copy a cache kept from before the page loaded (chapter 4): Lena's browser's, or the CDN's. */
export interface CacheSeed {
  /** Which cache kept it: Lena's browser, or the CDN in front of the API. */
  into: 'browser' | 'cdn'
  /** The address it answers (a GET). */
  url: string
  /** The headers of the request it was kept for (what its Vary compares), and who asked (the CDN's log). */
  request?: Readonly<Record<string, string>>
  by?: string
  status?: number
  /** The answer's headers, lower case, as server.js sent them (the copy's ETag among them). */
  headers: Readonly<Record<string, string>>
  body: string
  minutesAgo: number
}

/** Chapter 4: the caches between the page and server.js. */
export interface CacheSpec {
  /** A CDN in front of the API: every request to it from anyone goes through its shared cache. */
  cdn?: boolean
  /** Copies kept from before the page loaded. */
  seeds?: readonly CacheSeed[]
}

/** What the Application panel gets of the caches at most: copies (each cache), CDN log lines, characters of a text. */
export const CACHE_PANEL_LIMITS = { rows: 100, log: CACHE_LIMITS.log, text: 300 } as const

/** What the thief gets back for the panels and the tests: a request it made from outside the browser (chapter 3). */
export const REPLAY_LIMITS = { attempts: 40, candidates: 40, text: 300 } as const

/** A level's servers (`sandbox.web`). */
export interface WebSpec {
  /** The API's origin: every request to it is answered by the level's server.js. */
  api: string
  /** The file that holds the API server's code; none: nothing answers on the API's origin (the level is about the shop's own). */
  server?: string
  /** The shop's own server: fixed answers (no CORS headers), on the page's origin and on `alsoOn` (www, another port). */
  shop?: { routes: readonly BackendRoute[], alsoOn?: readonly string[] }
  /**
   * Chapter 1: the customer's session at the API, a cookie the browser kept since she signed in this morning:
   * `name=value; Secure; HttpOnly`, host-only, no SameSite (so Lax). It goes where the cookie rules send it.
   */
  session?: { name: string, value: string }
  /** More cookies the browser kept from before (through the cookie model's rules, as when they were set). */
  cookies?: readonly SeedCookie[]
  /** Other sites Lena may open (the attacker's, her webmail), and guard sites no text names. */
  sites?: readonly OtherSite[]
  /**
   * What happens in every load once the page is ready, before a check run's probes (the app you see too): Lena signs in,
   * opens another site. Probe steps that act: `click`, `settle`, `wait`, `type`, `visit`.
   */
  scene?: readonly ProbeStep[]
  /** The level shows the Application panel (cookies per site, refused ones with why). */
  application?: boolean
  /**
   * Chapter 3: the page has Web Storage (`localStorage`, `sessionStorage`) through the storage model, starting with these
   * items (the Application panel shows both kinds). Without it the frame has none, as in chapters 1 and 2.
   */
  storage?: readonly SeedItem[]
  /**
   * Chapter 3: the clock moves (`{ later }` in the scene or a probe): the page's and server.js's `Date` tell the scripted
   * time, cookies expire and tokens run out on it.
   */
  time?: boolean
  /**
   * Chapter 4: the browser's HTTP cache (Chrome's rules) between the page and the network, and with `cdn` a CDN in front
   * of the API; server.js's res.send gives bodies Express's ETag and answers a conditional GET with 304. The Application
   * panel's Cache lists both caches.
   */
  cache?: CacheSpec
}

interface ShopRouteData {
  method: string
  path: string
  answers: { status: number, headers: [string, string][], body: string | null }[]
}

/** A site as the frame gets it (the page's HTML is the panel's, not the frame's). */
export interface SiteData {
  origin: string
  /** Its page's address (the Referer it sends). */
  address: string
  noReferrer: boolean
  hidden: boolean
  actions: SiteAction[]
}

/** What the frame gets. */
export interface WebConfig {
  page: string
  /** The page's path (the address bar's): document.cookie's URL and the Referer's. */
  path: string
  api: string
  /** server.js as saved; null when the level has no such file any more, or none at all. */
  source: string | null
  /** The level has a server.js (false: the API's origin answers nothing, and says nothing). */
  hasServer: boolean
  prelude: string
  limits: typeof SERVER_LIMITS & { panel: typeof COOKIE_PANEL_LIMITS, storage: typeof STORAGE_LIMITS, replay: typeof REPLAY_LIMITS, cache: typeof CACHE_PANEL_LIMITS }
  delay: number
  statusText: Readonly<Record<number, string>>
  /** The scripted clock the cookie jar runs on. */
  clock: number
  /** Cookies the browser kept from before: line, URL, how long ago (ms). */
  seeds: { url: string, line: string, ago: number }[]
  sites: SiteData[]
  scene: ProbeStep[] | null
  /** The Application panel is shown: the frame posts the jar after every change. */
  application: boolean
  /** Chapter 3: Web Storage in the frame, from these items; null: none. */
  storage: SeedItem[] | null
  /** Chapter 3: the clock moves, and the page's and server.js's Date follow it. */
  time: boolean
  /** Chapter 4: the caches (a CDN or not) and the copies they kept from before, `ago` in ms; null: no cache at all. */
  cache: { cdn: boolean, seeds: { into: 'browser' | 'cdn', url: string, request: [string, string][], by: string, status: number, headers: [string, string][], body: string, ago: number }[] } | null
  shop: { origins: string[], routes: ShopRouteData[] }
}

const originOnly = (url: string, what: string) => {
  const origin = new URL(url).origin
  if (origin !== url) throw new Error(`${what} ${url} is not an origin (no path, no slash at the end)`)
  return origin
}

/** The level's servers as plain data for the frame (throws for what a level cannot mean: the level tests load each one). */
export function webConfig(spec: WebSpec, files: Readonly<Record<string, string>>, page: string, path = '/'): WebConfig {
  const origin = new URL(page).origin
  const api = originOnly(spec.api, 'the API')
  if (api === origin) throw new Error('the API must be on another origin than the page')
  if (!path.startsWith('/')) throw new Error(`the page's path ${path} must start with /`)
  const routes = spec.shop?.routes ?? []
  for (const route of routes) {
    if (route.body !== undefined || route.query !== undefined) throw new Error(`${route.path}: the shop's routes take no body or query patterns`)
    if (!route.path.startsWith('/')) throw new Error(`${route.path}: the shop's routes are paths on its own server`)
  }
  const sites = (spec.sites ?? []).map((site) => {
    const at = originOnly(site.origin, 'a site')
    if (at === origin || at === api) throw new Error(`the site ${at} must be another origin than the page's and the API's`)
    if (site.actions.length > 8) throw new Error(`${at}: a page does at most 8 things`)
    for (const action of site.actions) {
      const target = 'img' in action ? action.img : 'fetch' in action ? action.fetch : 'form' in action ? action.form : action.link
      if (!/^https?:\/\//.test(target)) throw new Error(`${at}: ${target} is not a whole address`)
    }
    return { origin: at, address: `${at}${site.path ?? '/'}`, noReferrer: site.noReferrer === true, hidden: site.hidden === true, actions: site.actions.map(action => JSON.parse(JSON.stringify(action)) as SiteAction) }
  })
  const seeds = [
    ...(spec.session ? [{ url: `${api}/login`, line: `${spec.session.name}=${spec.session.value}; Secure; HttpOnly`, minutesAgo: 29 }] : []),
    ...(spec.cookies ?? [])
  ].map(seed => ({ url: new URL(seed.url).href, line: seed.line, ago: seed.minutesAgo * 60_000 }))
  const data = backendConfig({ routes }, origin)
  const storage = spec.storage
    ? spec.storage.map((seed) => {
        if (seed.kind !== 'local' && seed.kind !== 'session') throw new Error(`${seed.key}: storage is 'local' or 'session'`)
        return { origin: originOnly(seed.origin, 'a stored item\'s origin'), kind: seed.kind, key: seed.key, value: seed.value }
      })
    : null
  const cache = spec.cache
    ? {
        cdn: spec.cache.cdn === true,
        seeds: (spec.cache.seeds ?? []).map((seed) => {
          if (seed.into !== 'browser' && seed.into !== 'cdn') throw new Error(`${seed.url}: a copy is kept by the 'browser' or the 'cdn'`)
          if (seed.into === 'cdn' && spec.cache?.cdn !== true) throw new Error(`${seed.url}: there is no CDN to keep it`)
          const url = new URL(seed.url)
          if (seed.into === 'cdn' && url.origin !== api) throw new Error(`${seed.url}: the CDN is in front of the API only`)
          const lower = (record: Readonly<Record<string, string>>): [string, string][] => Object.entries(record).map(([name, value]) => [name.toLowerCase(), value])
          return { into: seed.into, url: url.href, request: lower(seed.request ?? {}), by: seed.by ?? 'Lena', status: seed.status ?? 200, headers: lower(seed.headers), body: seed.body, ago: seed.minutesAgo * 60_000 }
        })
      }
    : null
  return {
    page: origin,
    path,
    api,
    source: spec.server !== undefined && Object.hasOwn(files, spec.server) ? files[spec.server]! : null,
    hasServer: spec.server !== undefined,
    prelude: serverPrelude(STATUS_TEXT, spec.time === true, cache !== null),
    limits: { ...SERVER_LIMITS, panel: COOKIE_PANEL_LIMITS, storage: STORAGE_LIMITS, replay: REPLAY_LIMITS, cache: CACHE_PANEL_LIMITS },
    delay: WEB_DELAY_MS,
    statusText: STATUS_TEXT,
    clock: WEB_CLOCK,
    seeds,
    sites,
    scene: spec.scene ? JSON.parse(JSON.stringify(spec.scene)) as ProbeStep[] : null,
    application: spec.application === true,
    storage,
    time: spec.time === true,
    cache,
    shop: {
      origins: [origin, ...(spec.shop?.alsoOn ?? []).map(each => new URL(each).origin)],
      routes: data.routes.map(route => ({
        method: route.method,
        path: new URL(route.where).pathname,
        answers: route.answers.map(answer => 'fail' in answer
          ? { status: 503, headers: [], body: null }
          : { status: answer.status, headers: Object.entries(answer.headers), body: answer.body })
      }))
    }
  }
}

/** The backend in the frame (or in the unit tests). */
export interface WebRuntime {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  pending: () => number
  count: (key: string) => number
  sent: (key: string, path: string | null) => string | number | null
  /** How many readable answers from there the app read the body of (`json()`, `text()` …). */
  read: (key: string) => number
  /** How many requests to there reached server.js. */
  arrived: (key: string) => number
  /** A request as a page on `from` would send it: 'read' (a 2xx it may read), 'refused' (a 4xx or 5xx it may read), 'blocked' (CORS), 'failed'. */
  from: (probe: { fetchFrom: string, request: string, credentials?: string, headers?: Record<string, string> }, then: (value: string) => void) => void
  /** Lena opens another site's page: its actions run, in the panels (the value: the status of what it did last, or why not). */
  visit: (origin: string, then: (value: string | number | null) => void) => void
  /** A top-level navigation from another site (nothing in the panels): the status, or 'failed'; `credentials: 'omit'`: a browser without Lena's cookies. */
  navigate: (probe: { navigate: string, from: string, credentials?: string }, then: (value: string | number) => void) => void
  /** How many requests to there carried a cookie of this name. */
  carried: (key: string, name: string) => number
  /** How many requests to another site than the page's carried this text (in the address, a header or the body). */
  leaked: (text: string) => number
  /**
   * A script on the page reads every cookie it can (on any path of the page's origin) and an attacker sends them from
   * elsewhere as a Cookie header to 'METHOD https://host/path': its status, or 'failed' (nothing in the panels).
   */
  stolen: (request: string, then: (value: string | number) => void) => void
  /** 1 when a script on the page's origin can read a cookie of this name (on any path), else 0. */
  readable: (name: string) => number
  /** `document.cookie` on the page: read, and write. */
  documentCookie: () => string
  writeCookie: (value: unknown) => void
  /**
   * Chapter 3: the page's `localStorage` and `sessionStorage` (Storage.prototype gets the model's members); null when
   * the level has no storage.
   */
  storage: ((proto: object) => { local: object, session: object }) | null
  /** Chapter 3: a Date on the scripted clock for the page (null when the level's time stands still). */
  date: DateConstructor | null
  /** Chapter 3: puts the scripted time on the window (Date, Intl's default date, performance.timeOrigin); null: none. */
  installTime: ((global: object) => void) | null
  /** Chapter 3: ms since a request last started or ended (the bridge waits for 50 of them before it moves on); null: not asked. */
  quietFor: (() => number) | null
  /** Chapter 3: the scripted clock moves on this many minutes. */
  later: (minutes: number) => void
  /** Chapter 3: keeps a copy under a name: what a script on the page could take now ('script'), or the browser's cookies for the API ('browser'). */
  copy: (kind: string, as: string) => void
  /** Chapter 3: what a sign-in (`'POST https://…'` with a form body) answered `ago` minutes earlier, kept under a name. */
  issued: (probe: { issued: string, body?: Record<string, string>, ago?: number, as?: string }, then: () => void) => void
  /**
   * Chapter 3: the thief sends `'METHOD https://…'` from outside the browser with what it has (`using`: a copy's name,
   * 'script', or a site's origin: what reached that site's server), trying each piece: the status of the first answer
   * from 200 to 299, else of the last, or 'failed'. `show`: the Server panel says so.
   */
  replay: (probe: { replay: string, using?: string, show?: boolean, forge?: boolean }, then: (value: string | number) => void) => void
  /** Chapter 4: how many of the page's requests to there the browser answered from its cache, without asking. */
  fromCache: (key: string) => number
  /** Chapter 4: how many of the page's requests to there were revalidated and answered 304 (its copy was still good). */
  notModified: (key: string) => number
  /** Chapter 4: how many of the page's requests to there (an address ending in /: anywhere below it) the network answered in full (a 2xx: no copy, no 304). */
  whole: (key: string) => number
  /** Chapter 4: how many requests to there, from anyone, reached server.js (past the CDN). */
  reached: (key: string) => number
  /**
   * Chapter 4: another customer's browser (its own empty cache, its own cookie) sends `'METHOD https://…'` from a page on
   * `from` (default: the shop's; null: an app, no CORS): the status, a field of its JSON (`json`), 'blocked' or 'failed'.
   * `like`: the request exactly as the page's last one to that address (its query and its headers).
   */
  other: (probe: { other: string, request: string, from?: string | null, cookie?: string, like?: boolean, json?: string, body?: Record<string, string>, headers?: Record<string, string> }, then: (value: string | number | null) => void) => void
}

// Runs inside the frame as part of the bridge (one line: block comments only, every statement ends with a semicolon),
// and in the unit tests. `hooks.post` posts to the page, `hooks.now` is the Network panel's clock, `hooks.serve` (tests
// only) answers for server.js in place of the worker.
export const WEB_BACKEND_SOURCE = String.raw`(function (config, hooks) {
  'use strict';
  var model = (${CORS_SOURCE})();
  var cookieModel = (${COOKIE_SOURCE})();
  var storageModel = config.storage ? (${STORAGE_SOURCE})() : null;
  var cacheModel = config.cache ? (${CACHE_SOURCE})() : null;
  var server = hooks.serve ? { serve: hooks.serve } : (${SERVER_HOST_SOURCE})({ source: config.source, hasServer: config.hasServer, prelude: config.prelude, limits: config.limits }, {
    output: function (line) { hooks.post({ type: 'server', level: line.level, text: line.text, line: line.line }); }
  });
  var page = config.page;
  var pageAddress = page + config.path;
  var api = config.api;
  var delay = config.delay;
  var STATUS = config.statusText;
  var PANEL = config.limits.panel;
  /* Everything that decides a request (its origin, its headers, the cookies, the CORS check) and everything the probes
     count is read with built-ins taken now, when the bridge makes the backend, before any of the app's code runs (the
     URL's and the Request's own getters, Headers' forEach, the Promise, string functions); no array method of the data
     is called. A built-in the app replaces later changes only what the app itself gets. */
  var FP = Function.prototype;
  var uncurry = FP.bind.bind(FP.call);
  var describeProperty = Object.getOwnPropertyDescriptor;
  var getter = function (proto, name) { return uncurry(describeProperty(proto, name).get); };
  var NativeURL = URL;
  var NativeRequest = Request;
  var NativeResponse = Response;
  var NativePromise = Promise;
  var NativeTypeError = TypeError;
  var NativeError = Error;
  var originOf = getter(NativeURL.prototype, 'origin');
  var pathOf = getter(NativeURL.prototype, 'pathname');
  var hrefOf = getter(NativeURL.prototype, 'href');
  var requestUrlOf = getter(NativeRequest.prototype, 'url');
  var methodOf = getter(NativeRequest.prototype, 'method');
  var modeOf = getter(NativeRequest.prototype, 'mode');
  var credentialsOf = getter(NativeRequest.prototype, 'credentials');
  var cacheOf = describeProperty(NativeRequest.prototype, 'cache') ? getter(NativeRequest.prototype, 'cache') : null;
  var headersOf = getter(NativeRequest.prototype, 'headers');
  var eachHeader = uncurry(Headers.prototype.forEach);
  var isRequest = uncurry(FP[Symbol.hasInstance], NativeRequest);
  var upperCase = uncurry(String.prototype.toUpperCase);
  var lowerCase = uncurry(String.prototype.toLowerCase);
  var indexOfText = uncurry(String.prototype.indexOf);
  var sliceText = uncurry(String.prototype.slice);
  var hasOwn = uncurry(Object.prototype.hasOwnProperty);
  var execPattern = uncurry(RegExp.prototype.exec);
  var thenOf = uncurry(NativePromise.prototype.then);
  var encode = encodeURIComponent;
  var decode = decodeURIComponent;
  var defineProperty = Object.defineProperty;
  var createObject = Object.create;
  var parseJson = JSON.parse;
  var stringify = JSON.stringify;
  var keysOf = Object.keys;
  var isArray = Array.isArray;
  var mathMax = Math.max;
  var mathMin = Math.min;
  var mathRound = Math.round;
  var mathFloor = Math.floor;
  var toText = String;
  var later = setTimeout;
  var parseFloatText = parseFloat;
  var RealDate = Date;
  /* Every write into a list defines its element with a descriptor that has no prototype: an assignment to an index a
     list doesn't have yet would run a setter the app put on Array.prototype or Object.prototype (and hand it what is
     written), and defineProperty reads get and set through the chain too. */
  var put = function (list, index, item) {
    var descriptor = createObject(null);
    descriptor.value = item;
    descriptor.writable = true;
    descriptor.enumerable = true;
    descriptor.configurable = true;
    defineProperty(list, index, descriptor);
  };
  /* a field of an object made here that may be left out (an answer's fail), read from the object itself only: a getter the
     app put on Object.prototype never answers */
  var own = function (object, name) { return object !== null && typeof object === 'object' && hasOwn(object, name) ? object[name] : undefined; };
  /* a descriptor without a prototype, for a property of the app's Response */
  var fixed = function (value) {
    var descriptor = createObject(null);
    descriptor.value = value;
    return descriptor;
  };
  var NULL_BODY = [204, 205, 304];
  var NOT_MODIFIED = 304;
  var READERS = [];
  var readers = createObject(null);
  var NAMES = ['json', 'text', 'arrayBuffer', 'blob', 'formData'];
  for (var r = 0; r < NAMES.length; r++) {
    if (typeof NativeResponse.prototype[NAMES[r]] !== 'function') continue;
    put(READERS, READERS.length, NAMES[r]);
    readers[NAMES[r]] = uncurry(NativeResponse.prototype[NAMES[r]]);
  }
  var records = createObject(null);
  var recordCount = 0;
  var pending = 0;
  /* when a request last started or ended (chapter 3's scenes wait until nothing happened for 50 ms: the page's next
     request may follow an answer a moment later, and the clock must not move in between) */
  var lastActive = -1e15;
  var busy = function (delta) {
    pending += delta;
    lastActive = hooks.now();
  };
  var nextId = 1;
  var shopCalls = [];
  for (var c = 0; c < config.shop.routes.length; c++) shopCalls[c] = 0;
  var FETCH = "Failed to execute 'fetch' on 'Window': ";
  var FORM = 'application/x-www-form-urlencoded';
  /* not Chrome's words: Fetch keeps no cookie from an answer to a request without credentials, and says nothing */
  var NO_CREDENTIALS = 'Not stored: the request went without credentials (credentials: \'omit\', or \'same-origin\' to another origin), so the browser keeps no cookie from its answer.';

  var has = function (list, item) {
    for (var i = 0; i < list.length; i++) if (list[i] === item) return true;
    return false;
  };
  var copy = function (list) {
    var out = [];
    for (var i = 0; i < list.length; i++) put(out, i, list[i]);
    return out;
  };
  var push = function (list, item) { put(list, list.length, item); };
  var cut = function (text, max) { text = toText(text); return text.length > max ? sliceText(text, 0, max) + '…' : text; };
  var rejected = function (error) { return new NativePromise(function (resolve, reject) { reject(error); }); };
  var placeOf = function (method, url) { return upperCase(method) + ' ' + originOf(url) + pathOf(url); };
  var keyOf = function (key) {
    var space = indexOfText(key, ' ');
    return placeOf(sliceText(key, 0, space), new NativeURL(sliceText(key, space + 1), page + '/'));
  };

  /* --- the scripted clock: where the load starts; chapter 3's later moves it ------------------------------------------ */
  var clock = config.clock;
  var scriptedDate = config.time ? (${SCRIPTED_DATE_SOURCE})(RealDate, function () { return clock; }) : null;

  /* --- the cookie jar: one per load, on the scripted clock --------------------------------------------------------- */
  var jar = cookieModel.createJar(function () { return clock; });
  var pageSite = cookieModel.siteOf(page);
  for (var s = 0; s < config.seeds.length; s++) jar.store(config.seeds[s].line, { url: config.seeds[s].url, sameSite: true, created: config.clock - config.seeds[s].ago });
  var refusals = [];
  var snapshotQueued = false;
  var snapshotAt = -1;
  var postCookies = function () {
    snapshotQueued = false;
    snapshotAt = hooks.now();
    var list = jar.list();
    var rows = [];
    for (var i = 0; i < list.length && i < PANEL.rows; i++) {
      var cookie = list[i];
      push(rows, { name: cut(cookie.name, PANEL.text), value: cut(cookie.value, PANEL.text), size: cookie.name.length + cookie.value.length, domain: cookie.domain, hostOnly: cookie.hostOnly, path: cut(cookie.path, PANEL.text), expires: cookie.expires, secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite });
    }
    hooks.post({ type: 'cookies', jar: rows, total: list.length, refused: copy(refusals), readable: jar.readable(page) });
  };
  /* the Application panel gets the jar after a change, at most every 50 ms (a script that writes cookies in a loop
     makes one message) */
  var cookiesChanged = function () {
    if (!config.application || snapshotQueued) return;
    snapshotQueued = true;
    later(postCookies, snapshotAt < 0 ? 0 : mathMax(0, snapshotAt + 50 - hooks.now()));
  };
  var logRefusal = function (source, url, name, line, reason) {
    if (refusals.length >= PANEL.refused) {
      for (var i = 0; i < refusals.length - 1; i++) refusals[i] = refusals[i + 1];
      refusals.length -= 1;
    }
    push(refusals, { source: source, url: cut(url, PANEL.text), name: cut(name, PANEL.text), line: cut(line, PANEL.text), reason: reason });
  };
  cookiesChanged();

  /* --- Web Storage (chapter 3): the areas, seeded with what the browser kept; the panel gets them after each change --- */
  var STORE = config.limits.storage;
  if (storageModel) {
    for (var si = 0; si < config.storage.length; si++) storageModel.area(config.storage[si].kind, config.storage[si].origin).setItem(toText(config.storage[si].key), toText(config.storage[si].value));
    storageModel.area('local', page);
    storageModel.area('session', page);
  }
  var storageQueued = false;
  var storageAt = -1;
  var postStorage = function () {
    storageQueued = false;
    storageAt = hooks.now();
    var areas = storageModel.list();
    var out = [];
    for (var i = 0; i < areas.length; i++) {
      var items = [];
      for (var k = 0; k < areas[i].items.length && k < STORE.rows; k++) push(items, [cut(areas[i].items[k][0], STORE.text), cut(areas[i].items[k][1], STORE.text)]);
      push(out, { kind: areas[i].kind, origin: areas[i].origin, items: items, count: areas[i].items.length, size: areas[i].size });
    }
    hooks.post({ type: 'storage', areas: out, now: clock });
  };
  var storageChanged = function () {
    if (!storageModel || !config.application || storageQueued) return;
    storageQueued = true;
    later(postStorage, storageAt < 0 ? 0 : mathMax(0, storageAt + 50 - hooks.now()));
  };
  storageChanged();

  /* --- HTTP caching (chapter 4): Lena's browser's cache, the CDN in front of the API, the CDN's log ----------------- */
  var CACHED = config.limits.cache;
  var browserCache = cacheModel ? cacheModel.createCache({ shared: false, clock: function () { return clock; } }) : null;
  var cdn = cacheModel && config.cache.cdn ? cacheModel.createCache({ shared: true, clock: function () { return clock; } }) : null;
  if (cacheModel) {
    for (var cs = 0; cs < config.cache.seeds.length; cs++) {
      var seed = config.cache.seeds[cs];
      (seed.into === 'cdn' ? cdn : browserCache).store(seed.url, { method: 'GET', headers: seed.request }, { status: seed.status, headers: seed.headers, body: seed.body }, seed.by, config.clock - seed.ago);
    }
  }
  var cdnLog = [];
  /* requests that reached server.js, from anyone, by place (past the CDN) */
  var reachedBy = createObject(null);
  var cacheQueued = false;
  var cacheAt = -1;
  var cacheRows = function (cache) {
    var list = cache.list();
    var rows = [];
    for (var i = list.length - 1; i >= 0 && rows.length < CACHED.rows; i--) {
      var kept = list[i];
      var vary = '';
      for (var v = 0; v < kept.vary.length; v++) vary += (v ? '; ' : '') + kept.vary[v] + (kept.vary[v] === '*' ? '' : ': ' + (kept.varyValues[v] === null ? '(none)' : kept.varyValues[v]));
      push(rows, {
        url: cut(kept.url, CACHED.text),
        vary: cut(vary, CACHED.text),
        status: kept.status,
        stored: kept.stored,
        age: mathFloor(kept.age / 1000),
        lifetime: kept.lifetime === 1 / 0 ? -1 : mathFloor(kept.lifetime / 1000),
        fresh: kept.fresh,
        etag: cut(cacheModel.headerValue(kept.headers, 'etag') || '', CACHED.text),
        control: cut(cacheModel.headerValue(kept.headers, 'cache-control') || '', CACHED.text),
        by: cut(kept.by, CACHED.text),
        hits: kept.hits
      });
    }
    return rows;
  };
  var postCache = function () {
    cacheQueued = false;
    cacheAt = hooks.now();
    hooks.post({ type: 'cache', now: clock, browser: cacheRows(browserCache), cdn: cdn ? cacheRows(cdn) : null, log: copy(cdnLog) });
  };
  /* the Application panel gets both caches and the CDN's log after a change, at most every 50 ms */
  var cacheChanged = function () {
    if (!cacheModel || !config.application || cacheQueued) return;
    cacheQueued = true;
    later(postCache, cacheAt < 0 ? 0 : mathMax(0, cacheAt + 50 - hooks.now()));
  };
  cacheChanged();
  var CONDITIONS = ['if-none-match', 'if-modified-since', 'if-match', 'if-unmodified-since', 'if-range'];
  var headerOf = function (headers, name) {
    for (var i = 0; i < headers.length; i++) if (lowerCase(toText(headers[i][0])) === name) return toText(headers[i][1]);
    return null;
  };
  var without = function (headers, names) {
    var kept = [];
    for (var i = 0; i < headers.length; i++) if (!has(names, lowerCase(toText(headers[i][0])))) push(kept, headers[i]);
    return kept;
  };
  var joined = function (first, second) {
    var out = copy(first);
    for (var i = 0; i < second.length; i++) push(out, second[i]);
    return out;
  };
  var conditional = function (headers) {
    for (var i = 0; i < CONDITIONS.length; i++) if (headerOf(headers, CONDITIONS[i]) !== null) return true;
    return false;
  };
  /* How a page's request uses the browser's cache: Fetch's cache mode (the request's cache), with the headers Fetch
     adds for it (no-cache: Cache-Control: max-age=0; no-store and reload: Pragma: no-cache and Cache-Control: no-cache,
     each unless the page set one), a condition the page set itself making a default request no-store (Fetch), and a
     Cache-Control or Pragma it set itself read as Chrome's network stack reads them (no-cache: fetch anew, max-age=0:
     revalidate). lookup: a copy may answer; fresh: a fresh copy answers without asking; any: any copy answers, stale or
     not (force-cache, only-if-cached); only: nothing else may (only-if-cached); store: the answer is kept. */
  var MODES = ['default', 'no-store', 'reload', 'no-cache', 'force-cache', 'only-if-cached'];
  var tokenIn = function (value, token) {
    if (value === null) return false;
    var from = 0;
    while (from <= value.length) {
      var end = indexOfText(value, ',', from);
      if (end < 0) end = value.length;
      var part = sliceText(value, from, end);
      while (part.length && (part[0] === ' ' || part[0] === '\t')) part = sliceText(part, 1);
      while (part.length && (part[part.length - 1] === ' ' || part[part.length - 1] === '\t')) part = sliceText(part, 0, part.length - 1);
      if (lowerCase(part) === token) return true;
      from = end + 1;
    }
    return false;
  };
  var cacheUse = function (asked, headers) {
    var mode = has(MODES, asked) ? asked : 'default';
    var control = headerOf(headers, 'cache-control');
    var pragma = headerOf(headers, 'pragma');
    var added = [];
    if (mode === 'no-cache' && control === null) push(added, ['cache-control', 'max-age=0']);
    if (mode === 'no-store' || mode === 'reload') {
      if (pragma === null) push(added, ['pragma', 'no-cache']);
      if (control === null) push(added, ['cache-control', 'no-cache']);
    }
    var effective = mode;
    if (mode === 'default' && conditional(headers)) effective = 'no-store';
    else if (mode === 'default' && (tokenIn(control, 'no-cache') || tokenIn(pragma, 'no-cache'))) effective = 'reload';
    else if (mode === 'default' && tokenIn(control, 'max-age=0')) effective = 'no-cache';
    return { added: added, lookup: effective !== 'no-store' && effective !== 'reload', fresh: effective === 'default', any: effective === 'force-cache' || effective === 'only-if-cached', only: effective === 'only-if-cached', store: effective !== 'no-store' };
  };
  /* a 304 made from an answer: no body, none of its content headers (RFC 9110 15.4.5) */
  var asNotModified = function (answer) {
    return { status: NOT_MODIFIED, headers: without(answer.headers, ['content-type', 'content-length']), body: null };
  };
  var hoursOf = uncurry(RealDate.prototype.getUTCHours);
  var minutesOf = uncurry(RealDate.prototype.getUTCMinutes);
  var secondsOf = uncurry(RealDate.prototype.getUTCSeconds);
  var clockText = function (at) {
    var date = new RealDate(at);
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    return two(hoursOf(date)) + ':' + two(minutesOf(date)) + ':' + two(secondsOf(date));
  };
  var logCdn = function (who, method, href, outcome, status, age, note) {
    if (cdnLog.length >= CACHED.log) {
      for (var i = 0; i < cdnLog.length - 1; i++) cdnLog[i] = cdnLog[i + 1];
      cdnLog.length -= 1;
    }
    push(cdnLog, { at: clock, who: cut(who, CACHED.text), method: method, url: cut(href, CACHED.text), outcome: outcome, status: status, age: age === null ? null : mathFloor(age / 1000), note: note === null ? null : cut(note, CACHED.text) });
    cacheChanged();
  };
  /* what the CDN serves: the answer with its own Age (a copy's) and x-cache (what it did) in place of any the server sent */
  var fromCdn = function (answer, outcome, age) {
    var headers = without(answer.headers, ['age', 'x-cache']);
    if (age !== null) push(headers, ['age', toText(mathFloor(age / 1000))]);
    push(headers, ['x-cache', outcome]);
    return { status: answer.status, headers: headers, body: answer.body };
  };

  /* The cookies a request carries: with credentials (a navigation always), the jar's choice for the request's site
     context: same-site when the initiator's site is the URL's (the page is the top level), a top-level navigation's
     own rules for Lax. Each cookie of the URL's site is listed, sent or why not (as Chrome's Network panel does). */
  var cookiesFor = function (from, href, method, include, navigate) {
    var sameSite = cookieModel.siteOf(from) === cookieModel.siteOf(href);
    if (!include) return { header: null, list: [], sameSite: sameSite };
    var found = jar.forRequest({ url: href, method: method, sameSite: sameSite, topLevel: navigate });
    var list = [];
    for (var i = 0; i < found.cookies.length; i++) {
      var each = found.cookies[i];
      push(list, { name: cut(each.name, PANEL.text), value: cut(each.value, PANEL.text), sent: each.problem === null, reason: each.problem !== null ? cookieModel.reason(each.problem, 'send') : each.laxAllowUnsafe ? cookieModel.reason('LaxAllowUnsafe', 'send') : null });
    }
    return { header: found.header, list: list, sameSite: sameSite, names: found.cookies };
  };
  /* An answer's Set-Cookie lines into the jar (only for a request with credentials), each stored or why not. */
  var keepCookies = function (headers, href, include, sameSite, navigate) {
    var results = [];
    for (var i = 0; i < headers.length; i++) {
      if (lowerCase(toText(headers[i][0])) !== 'set-cookie') continue;
      var line = toText(headers[i][1]);
      if (!include) { push(results, { line: cut(line, PANEL.text), stored: false, reason: NO_CREDENTIALS }); continue; }
      var result = jar.store(line, { url: href, sameSite: sameSite, topLevel: navigate });
      var reason = result.problem ? cookieModel.reason(result.problem, 'set') : null;
      if (reason) logRefusal('set', href, result.name, line, reason);
      push(results, { line: cut(line, PANEL.text), stored: reason === null, reason: reason });
    }
    if (results.length) cookiesChanged();
    return results;
  };

  /* what the probes count: per request its place, its body, whether it reached server.js, whether its body was read,
     the cookies it carried, and its text (address, headers, body) to look for a leak in */
  var remember = function (place, body, target, text) {
    var record = createObject(null);
    record.place = place;
    record.body = body;
    record.arrived = false;
    record.read = false;
    record.cookies = [];
    record.site = cookieModel.siteOf(target);
    record.origin = originOf(new NativeURL(target));
    record.href = target;
    record.text = text;
    /* chapter 3: what the page's own code handed to fetch (its headers) and what it could read of the answer */
    record.page = false;
    record.headers = [];
    record.answer = null;
    /* chapter 4: the browser answered it from its cache without asking, or its copy was revalidated with a 304 */
    record.fromCache = false;
    record.notModified = false;
    /* the request left the browser (exchange ran for it): not refused at its preflight, not answered by Lena's cache */
    record.sent = false;
    /* the network answered it in full: a 2xx with its body (neither the copy nor a 304) */
    record.whole = false;
    records[recordCount] = record;
    recordCount += 1;
    return record;
  };
  var each = function (key, visit) {
    var place = keyOf(key);
    for (var i = 0; i < recordCount; i++) if (records[i].place === place) visit(records[i]);
  };
  var parses = function (input) {
    try { new NativeURL(toText(input), page + '/'); return true; } catch (error) { return false; }
  };
  var bodyText = function (body) {
    if (body === undefined || body === null) return null;
    if (typeof body === 'string') return body;
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return body.toString();
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      var text = '';
      body.forEach(function (value, name) { text += (text ? '&' : '') + name + '=' + (typeof value === 'string' ? value : '(file)'); });
      return text;
    }
    if (typeof Blob !== 'undefined' && body instanceof Blob) return '(binary, ' + body.size + ' bytes)';
    if (typeof ArrayBuffer !== 'undefined' && (body instanceof ArrayBuffer || ArrayBuffer.isView(body))) return '(binary, ' + body.byteLength + ' bytes)';
    return toText(body);
  };
  var pairs = function (headers) {
    var list = [];
    eachHeader(headers, function (value, name) { put(list, list.length, [name, value]); });
    return list;
  };
  /* The headers that go over the wire: the page's, the Origin (a CORS request, or any that is not GET or HEAD; Fetch's
     "append a request Origin header": a no-referrer page's form POST says null), the Referer (the referrer policy
     strict-origin-when-cross-origin: the whole address to its own origin, the origin alone to another; none for
     no-referrer), the cookies. */
  var wireHeaders = function (headers, from, fromAddress, noReferrer, url, method, mode, cookie) {
    var list = copy(headers);
    var cross = originOf(url) !== from;
    if (mode === 'cors' && cross) push(list, ['origin', from]);
    else if (method !== 'GET' && method !== 'HEAD') push(list, ['origin', noReferrer ? 'null' : from]);
    if (!noReferrer) push(list, ['referer', cross ? from + '/' : fromAddress]);
    if (cookie) push(list, ['cookie', cookie]);
    return list;
  };
  var textOf = function (href, headers, body) {
    var text = href;
    for (var i = 0; i < headers.length; i++) text += '\n' + headers[i][0] + ': ' + headers[i][1];
    return text + '\n' + (body === null ? '' : body);
  };
  var notFound = function (method, path) {
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot ' + method + ' ' + path + '</pre>\n</body>\n</html>\n';
  };
  /* The shop's own server: a fixed answer per method and path (a list answers call by call, its last repeats), else its 404 page. */
  var shopAnswer = function (method, url) {
    var routes = config.shop.routes;
    var path = pathOf(url);
    for (var i = 0; i < routes.length; i++) {
      if (routes[i].method !== method || routes[i].path !== path) continue;
      var answer = routes[i].answers[mathMin(shopCalls[i], routes[i].answers.length - 1)];
      shopCalls[i] += 1;
      return { status: answer.status, headers: copy(answer.headers), body: answer.body };
    }
    return { status: 404, headers: [['content-type', 'text/html; charset=utf-8']], body: notFound(method, path) };
  };
  var siteOfOrigin = function (origin) {
    for (var i = 0; i < config.sites.length; i++) if (config.sites[i].origin === origin) return config.sites[i];
    return null;
  };
  /* One exchange with a server: the API's server.js, the shop's server on each origin it answers on, another site's
     server (it takes anything: 200, "ok"), or nobody (the name does not resolve). */
  var toServer = function (request, url, record, done) {
    if (record) record.arrived = true;
    var place = placeOf(request.method, url);
    reachedBy[place] = (hasOwn(reachedBy, place) ? reachedBy[place] : 0) + 1;
    /* the request as server.js gets it, at the scripted moment it is answered at */
    server.serve({ method: request.method, url: request.url, headers: request.headers, body: request.body, now: clock }, done);
  };
  /* The CDN in front of the API (RFC 9111's shared cache): a fresh copy for this request (its Vary) is served without
     asking (HIT, with its Age); a stale one with a validator is revalidated with the copy's own condition (a 304 keeps
     it: REVALIDATED); otherwise server.js is asked with the client's own conditions taken out, so the CDN gets a whole
     answer to keep (MISS) or not (PASS: why in the log), and then answers the client's condition itself (4.3.2). A
     request that isn't a GET goes through (PASS), and its non-error answer takes the address's copies away (4.4). */
  var throughCdn = function (request, url, record, done) {
    var who = request.who;
    var method = request.method;
    var href = request.url;
    var asks = conditional(request.headers);
    var answerClient = function (answer) {
      return asks && answer.status >= 200 && answer.status < 300 && cacheModel.notModified(request.headers, answer.headers) ? asNotModified(answer) : answer;
    };
    if (method !== 'GET') {
      toServer(request, url, record, function (answer) {
        if (own(answer, 'fail')) { logCdn(who, method, href, 'PASS', null, null, answer.fail); return done(answer); }
        var gone = method !== 'HEAD' && method !== 'OPTIONS' && answer.status < 400 ? cdn.invalidate(href) : 0;
        logCdn(who, method, href, 'PASS', answer.status, null, gone ? 'Its copies of this address are gone: an unsafe request changed it.' : null);
        done(fromCdn(answer, 'PASS', null));
      });
      return;
    }
    var found = cdn.lookup(href, request.headers);
    var serveCopy = function (kept, outcome, note) {
      cdn.hit(kept.id);
      var answer = answerClient(fromCdn({ status: kept.status, headers: kept.headers, body: kept.body }, outcome, kept.age));
      logCdn(who, method, href, outcome, answer.status, kept.age, note);
      later(function () { done(answer); }, 0);
    };
    if (found && found.fresh) { serveCopy(found, 'HIT', 'Its copy from ' + clockText(found.stored) + ', fetched for ' + found.by + '.'); return; }
    var unconditional = without(request.headers, CONDITIONS);
    var fill = function (answer) {
      if (own(answer, 'fail')) { logCdn(who, method, href, 'MISS', null, null, answer.fail); return done(answer); }
      var kept = cdn.store(href, { method: method, headers: request.headers }, answer, who);
      var outcome = kept.stored ? 'MISS' : 'PASS';
      var served = answerClient(fromCdn(answer, outcome, null));
      logCdn(who, method, href, outcome, served.status, null, kept.stored ? 'Kept for the next request.' : cacheModel.reason(kept.reason, true));
      done(served);
    };
    var checks = found ? cacheModel.validators(found.headers) : [];
    if (!checks.length) { toServer({ method: method, url: href, headers: unconditional, body: request.body }, url, record, fill); return; }
    toServer({ method: method, url: href, headers: joined(unconditional, checks), body: request.body }, url, record, function (answer) {
      if (!own(answer, 'fail') && answer.status === NOT_MODIFIED) {
        var freshened = cdn.freshen(found.id, answer.headers);
        if (freshened) { serveCopy(freshened, 'REVALIDATED', 'server.js answered 304: its copy from ' + clockText(found.stored) + ' is still good.'); return; }
      }
      fill(answer);
    });
  };
  var exchange = function (request, url, record, done) {
    if (record) record.sent = true;
    var target = originOf(url);
    if (target === api) {
      if (cdn) throughCdn({ method: request.method, url: request.url, headers: request.headers, body: request.body, who: typeof request.who === 'string' ? request.who : 'Lena' }, url, record, done);
      else toServer(request, url, record, done);
      return;
    }
    if (has(config.shop.origins, target)) { later(function () { done(shopAnswer(request.method, url)); }, 0); return; }
    if (siteOfOrigin(target)) { later(function () { done({ status: 200, headers: [['content-type', 'text/plain; charset=utf-8']], body: 'ok' }); }, 0); return; }
    later(function () { done({ fail: 'net::ERR_NAME_NOT_RESOLVED' }); }, 0);
  };
  /* a same-origin (basic) answer shows the page every header but Set-Cookie (Fetch: a "forbidden response-header name") */
  var withoutSetCookie = function (headers) {
    var kept = [];
    for (var i = 0; i < headers.length; i++) {
      var name = lowerCase(toText(headers[i][0]));
      if (name !== 'set-cookie' && name !== 'set-cookie2') push(kept, headers[i]);
    }
    return kept;
  };

  var toResponse = function (answer, headers, href, type, record) {
    var body = has(NULL_BODY, answer.status) ? null : answer.body;
    var response = new NativeResponse(body, { status: answer.status, statusText: STATUS[answer.status] || '', headers: headers });
    defineProperty(response, 'url', fixed(href));
    defineProperty(response, 'type', fixed(type));
    /* reading the body marks the request: the probes can tell an answer the app read from text it wrote itself */
    var reader = function (name) {
      return function () { return thenOf(readers[name](response), function (value) { record.read = true; return value; }); };
    };
    for (var i = 0; i < READERS.length; i++) {
      var method = fixed(reader(READERS[i]));
      method.configurable = true;
      method.writable = true;
      defineProperty(response, READERS[i], method);
    }
    return response;
  };
  var opaqueResponse = function () {
    var response = new NativeResponse(null);
    defineProperty(response, 'status', fixed(0));
    defineProperty(response, 'ok', fixed(false));
    defineProperty(response, 'statusText', fixed(''));
    defineProperty(response, 'type', fixed('opaque'));
    defineProperty(response, 'url', fixed(''));
    return response;
  };
  var sentNames = function (found) {
    var names = [];
    for (var i = 0; i < found.list.length; i++) if (found.list[i].sent) push(names, found.list[i].name);
    return names;
  };

  var fetch = function (input, init) {
    var stack = toText(new NativeError().stack || '');
    var failed = new NativeTypeError('Failed to fetch');
    var given = isRequest(input);
    if (!given && !parses(input)) return rejected(new NativeTypeError(FETCH + 'Failed to parse URL from ' + toText(input)));
    var request;
    try {
      request = new NativeRequest(given ? input : hrefOf(new NativeURL(toText(input), page + '/')), init);
    } catch (error) {
      var message = error && error.message ? toText(error.message) : toText(error);
      var lead = "Failed to construct 'Request': ";
      if (sliceText(message, 0, lead.length) === lead) message = sliceText(message, lead.length);
      return rejected(new NativeTypeError(FETCH + message));
    }
    var url = new NativeURL(requestUrlOf(request));
    var href = hrefOf(url);
    var method = methodOf(request);
    var requested = modeOf(request);
    var mode = requested === 'no-cors' || requested === 'same-origin' ? requested : 'cors';
    var asked = credentialsOf(request);
    var credentials = asked === 'omit' || asked === 'include' ? asked : 'same-origin';
    var body = init && init.body !== undefined && init.body !== null ? bodyText(init.body) : null;
    var cross = originOf(url) !== page;
    if (mode === 'no-cors' && !model.isSafelistedMethod(method)) return rejected(new NativeTypeError(FETCH + "'" + method + "' is unsupported in no-cors mode."));
    var headers = model.requestHeaders(pairs(headersOf(request)), mode);
    if (mode === 'same-origin' && cross) {
      hooks.post({ type: 'netlog', text: 'Fetch API cannot load ' + href + '. Request mode is "same-origin" but the URL\'s origin is not same as the request origin ' + page + '.', stack: stack });
      return rejected(failed);
    }
    /* Fetch's "includeCredentials": include, or same-origin to the page's own origin */
    var include = credentials === 'include' || (credentials === 'same-origin' && !cross);
    var found = cookiesFor(page, href, method, include, false);
    /* chapter 4: how this request uses the browser's cache (Fetch's cache mode, and what Chrome makes of a Cache-Control,
       Pragma or condition the page set itself), and the headers Fetch adds for its mode */
    var use = browserCache ? cacheUse(cacheOf ? cacheOf(request) : (init && typeof init.cache === 'string' ? toText(init.cache) : 'default'), headers) : null;
    var sent = wireHeaders(use ? joined(headers, use.added) : headers, page, pageAddress, false, url, method, mode, found.header);
    /* the copy this request may use (by its Vary), whether it answers without a request, and the condition a revalidation
       sends with it (the Network panel shows the request as sent, If-None-Match and all) */
    var stored = use && use.lookup && method === 'GET' ? browserCache.lookup(href, sent) : null;
    var answersItself = stored !== null && (use.any || (use.fresh && stored.fresh));
    var checks = stored !== null && !answersItself ? cacheModel.validators(stored.headers) : [];
    if (checks.length) sent = joined(sent, checks);
    var corsRequest = { origin: page, method: method, headers: headers, credentials: credentials };
    var preflight = cross && mode === 'cors' && model.needsPreflight(method, headers);
    var id = nextId++;
    /* a copy that answers without a request sends nothing: no cookie goes, and the panel shows the headers that would
       have gone without it (Chrome: "Provisional headers are shown") */
    var shown = answersItself ? without(sent, ['cookie']) : sent;
    var record = remember(placeOf(method, url), body, href, textOf(href, shown, body));
    record.cookies = answersItself ? [] : sentNames(found);
    record.page = true;
    record.headers = copy(headers);
    hooks.post({ type: 'request', id: id, method: method, url: href, headers: shown, body: body, stack: stack, preflightFor: null, site: null, destination: 'fetch', cookies: answersItself ? [] : found.list });
    var started = hooks.now();
    var signal = init && init.signal ? init.signal : null;
    busy(1);
    return new NativePromise(function (resolve, reject) {
      var open = true;
      var report = function (to, status, statusText, headers, body, failure, reason, kept, cached) {
        hooks.post({ type: 'response', id: to, status: status, statusText: statusText, headers: headers, body: body, failure: failure, time: mathMax(0, mathRound(hooks.now() - started)), reason: reason, cookies: kept || [], fromCache: cached === true });
      };
      var netlog = function (text, at) { hooks.post({ type: 'netlog', text: text, stack: at }); };
      var close = function () {
        if (!open) return false;
        open = false;
        busy(-1);
        if (signal) signal.removeEventListener('abort', onAbort);
        return true;
      };
      var onAbort = function () {
        if (!close()) return;
        report(id, null, '', [], null, 'aborted', null);
        reject(signal.reason !== undefined ? signal.reason : new DOMException('signal is aborted without reason', 'AbortError'));
      };
      var failWith = function (error) {
        if (!close()) return;
        netlog(method + ' ' + href + ' ' + error, stack);
        report(id, null, '', [], null, 'network', null);
        reject(failed);
      };
      var refuse = function (refusal, answer, kept, cached) {
        if (!close()) return;
        netlog(model.consoleLine(href, page, refusal), '');
        netlog(method + ' ' + href + ' net::ERR_FAILED' + (refusal.preflight ? '' : ' ' + answer.status + ' (' + (STATUS[answer.status] || '') + ')'), stack);
        if (refusal.preflight) report(id, null, '', [], null, 'cors', model.reason(refusal));
        else report(id, answer.status, STATUS[answer.status] || '', answer.headers, answer.body, 'cors', model.reason(refusal), kept, cached);
        reject(failed);
      };
      /* What the page gets, once there is an answer: from the network (shown: what the panel shows of it, a 304 for a
         revalidated copy), or the browser's copy (cached: no request went out) */
      var deliver = function (answer, shown, kept, cached) {
        if (cross && mode === 'cors') {
          var problem = model.check(corsRequest, answer);
          if (problem) return refuse({ problem: problem, preflight: false }, shown, kept, cached);
        }
        if (!close()) return;
        var statusText = STATUS[shown.status] || '';
        report(id, shown.status, statusText, shown.headers, shown.body, null, null, kept, cached);
        if (shown.status >= 400) netlog(method + ' ' + href + ' ' + shown.status + ' (' + statusText + ')', stack);
        if (cross && mode === 'no-cors') return resolve(opaqueResponse());
        /* an answer the browser's Response can't carry (a header it refuses) fails the fetch, never the page's timer */
        var response;
        try {
          response = toResponse(answer, cross ? model.exposedHeaders(answer, credentials) : withoutSetCookie(answer.headers), href, cross ? 'cors' : 'basic', record);
        } catch (error) {
          return reject(failed);
        }
        /* what the page's code (and so any script on the page) could read of it */
        record.answer = typeof answer.body === 'string' ? answer.body : null;
        resolve(response);
      };
      /* the network's answer: its cookies into the jar first (Fetch stores them before it checks CORS: a refused answer's
         cookies are kept too), then the page gets it */
      var network = function (headersOut, then) {
        exchange({ method: method, url: href, headers: headersOut, body: body }, url, record, function (answer) {
          later(function () {
            if (!open) return;
            if (own(answer, 'fail')) return failWith(answer.fail);
            if (answer.status >= 200 && answer.status < 300) record.whole = true;
            then(answer, keepCookies(answer.headers, href, include, found.sameSite, false));
          }, delay);
        });
      };
      var actual = function () {
        if (!use) return network(sent, function (answer, kept) { deliver(answer, answer, kept, false); });
        /* an unsafe request's answer that is no error takes the address's copy away (RFC 9111 4.4) */
        var keep = function (answer, kept) {
          if (method !== 'GET' && method !== 'HEAD' && answer.status < 400) browserCache.invalidate(href);
          else if (use.store) browserCache.store(href, { method: method, headers: sent }, answer, 'Lena');
          cacheChanged();
          deliver(answer, answer, kept, false);
        };
        if (answersItself) {
          /* the copy, without a request: Chrome shows the row as (disk cache) */
          browserCache.hit(stored.id);
          record.fromCache = true;
          cacheChanged();
          later(function () { if (open) deliver({ status: stored.status, headers: stored.headers, body: stored.body }, { status: stored.status, headers: stored.headers, body: stored.body }, [], true); }, 0);
          return;
        }
        if (!stored && use.only) { later(function () { failWith('net::ERR_CACHE_MISS'); }, 0); return; }
        if (!checks.length) return network(sent, keep);
        /* a stale copy (or one the mode wants checked) with a validator: a conditional request; a 304 keeps the copy */
        network(sent, function (answer, kept) {
          if (answer.status !== NOT_MODIFIED) return keep(answer, kept);
          var freshened = browserCache.freshen(stored.id, answer.headers);
          browserCache.hit(stored.id);
          record.notModified = true;
          cacheChanged();
          var copyOf = freshened || stored;
          deliver({ status: copyOf.status, headers: copyOf.headers, body: copyOf.body }, answer, kept, false);
        });
      };
      if (signal && signal.aborted) { onAbort(); return; }
      if (signal) signal.addEventListener('abort', onAbort);
      if (!preflight) { actual(); return; }
      /* the preflight: its own row, the browser's headers only (no cookie, none of the page's), the same initiator */
      var preflightId = nextId++;
      var preflightHeaders = model.preflightHeaders(corsRequest);
      hooks.post({ type: 'request', id: preflightId, method: 'OPTIONS', url: href, headers: preflightHeaders, body: null, stack: stack, preflightFor: id, site: null, destination: 'fetch', cookies: [] });
      exchange({ method: 'OPTIONS', url: href, headers: preflightHeaders, body: null }, url, null, function (answer) {
        later(function () {
          if (!open) { report(preflightId, null, '', [], null, 'aborted', null); return; }
          if (own(answer, 'fail')) {
            report(preflightId, null, '', [], null, 'network', null);
            return failWith(answer.fail);
          }
          report(preflightId, answer.status, STATUS[answer.status] || '', answer.headers, answer.body, null, null);
          var problem = model.checkPreflight(corsRequest, answer);
          if (problem) return refuse({ problem: problem, preflight: true }, answer);
          actual();
        }, delay);
      });
    });
  };

  /* A request from somewhere that is not the page's code: another site's page (shown in the panels, tagged with its
     site, its cookies kept), or a probe's look (nothing shown, nothing kept). The same rules as the page's fetch:
     the cookies, a preflight, the CORS check (a navigation has none). done gets { kind: 'answer' | 'blocked' |
     'failed', status }. */
  var sendAs = function (spec, done) {
    var url = spec.url;
    var href = hrefOf(url);
    var method = spec.method;
    var cross = originOf(url) !== spec.from;
    var navigate = spec.mode === 'navigate';
    var include = navigate ? spec.credentials !== 'omit' : spec.credentials === 'include' || (spec.credentials === 'same-origin' && !cross);
    var found = cookiesFor(spec.from, href, method, include, navigate);
    var sent = wireHeaders(spec.headers, spec.from, spec.address, spec.noReferrer, url, method, navigate ? 'navigate' : spec.mode, found.header);
    var corsRequest = { origin: spec.from, method: method, headers: spec.headers, credentials: spec.credentials };
    var preflight = spec.mode === 'cors' && cross && model.needsPreflight(method, spec.headers);
    var record = spec.show ? remember(placeOf(method, url), spec.body, href, textOf(href, sent, spec.body)) : null;
    if (record) record.cookies = sentNames(found);
    var id = spec.show ? nextId++ : 0;
    var started = hooks.now();
    if (spec.show) hooks.post({ type: 'request', id: id, method: method, url: href, headers: sent, body: spec.body, stack: '', preflightFor: null, site: spec.from, destination: spec.destination, cookies: found.list });
    var report = function (to, status, headers, body, failure, reason, kept) {
      if (!spec.show) return;
      hooks.post({ type: 'response', id: to, status: status, statusText: status === null ? '' : STATUS[status] || '', headers: headers, body: body, failure: failure, time: mathMax(0, mathRound(hooks.now() - started)), reason: reason, cookies: kept || [] });
    };
    busy(1);
    var finish = function (kind, status) {
      busy(-1);
      done({ kind: kind, status: status });
    };
    var actual = function () {
      exchange({ method: method, url: href, headers: sent, body: spec.body, who: spec.from }, url, record, function (answer) {
        later(function () {
          if (own(answer, 'fail')) { report(id, null, [], null, 'network', null); return finish('failed', null); }
          var kept = spec.show ? keepCookies(answer.headers, href, include, found.sameSite, navigate) : [];
          if (spec.mode === 'cors' && cross) {
            var problem = model.check(corsRequest, answer);
            if (problem) { report(id, answer.status, answer.headers, answer.body, 'cors', model.reason({ problem: problem, preflight: false }), kept); return finish('blocked', answer.status); }
          }
          report(id, answer.status, answer.headers, answer.body, null, null, kept);
          finish('answer', answer.status);
        }, delay);
      });
    };
    if (!preflight) return actual();
    var asked = model.preflightHeaders(corsRequest);
    var preflightId = spec.show ? nextId++ : 0;
    if (spec.show) hooks.post({ type: 'request', id: preflightId, method: 'OPTIONS', url: href, headers: asked, body: null, stack: '', preflightFor: id, site: spec.from, destination: 'fetch', cookies: [] });
    exchange({ method: 'OPTIONS', url: href, headers: asked, body: null, who: spec.from }, url, null, function (answer) {
      later(function () {
        if (own(answer, 'fail')) { report(preflightId, null, [], null, 'network', null); report(id, null, [], null, 'network', null); return finish('failed', null); }
        report(preflightId, answer.status, answer.headers, answer.body, null, null);
        var problem = model.checkPreflight(corsRequest, answer);
        if (problem) { report(id, null, [], null, 'cors', model.reason({ problem: problem, preflight: true })); return finish('blocked', null); }
        actual();
      }, delay);
    });
  };

  var requestOf = function (text) {
    var space = indexOfText(text, ' ');
    return { method: upperCase(sliceText(text, 0, space)), url: new NativeURL(sliceText(text, space + 1), page + '/') };
  };

  /* A page on another origin sends a request (a probe: nothing shows in the panels, no cookie is kept): what it gets.
     The probe's data is the bridge's own copy of its config. */
  var from = function (probe, then) {
    var asked = requestOf(probe.request);
    var origin = originOf(new NativeURL(probe.fetchFrom));
    var credentials = probe.credentials === 'include' || probe.credentials === 'omit' ? probe.credentials : 'same-origin';
    var given = [];
    if (probe.headers) {
      var names = keysOf(probe.headers);
      for (var i = 0; i < names.length; i++) put(given, given.length, [names[i], toText(probe.headers[names[i]])]);
    }
    /* chapter 3: a form body (another customer posts a review) */
    var fields = probe.body && typeof probe.body === 'object' ? probe.body : null;
    if (fields) put(given, given.length, ['content-type', FORM + ';charset=UTF-8']);
    sendAs({ from: origin, address: origin + '/', noReferrer: false, method: asked.method, url: asked.url, headers: model.requestHeaders(given, 'cors'), body: fields ? formBody(fields) : null, mode: 'cors', credentials: credentials, destination: 'fetch', show: false }, function (result) {
      if (result.kind !== 'answer') return then(result.kind);
      then(result.status >= 200 && result.status < 300 ? 'read' : 'refused');
    });
  };

  /* A top-level navigation from another site (a probe: nothing shown, nothing kept): its status. */
  var navigate = function (probe, then) {
    var asked = requestOf(probe.navigate);
    var origin = originOf(new NativeURL(probe.from));
    sendAs({ from: origin, address: origin + '/', noReferrer: false, method: asked.method, url: asked.url, headers: [], body: null, mode: 'navigate', credentials: probe.credentials === 'omit' ? 'omit' : 'include', destination: 'document', show: false }, function (result) {
      then(result.kind === 'answer' ? result.status : result.kind);
    });
  };

  /* Lena opens another site's page: what it does, in order, through the same browser (its requests in the Network panel
     tagged with the site, their cookies kept). A form or a link navigates the tab away: nothing after it runs. The
     value: the status of the last thing it did (or 'blocked', 'failed'). */
  var formBody = function (fields) {
    var text = '';
    var names = keysOf(fields);
    for (var i = 0; i < names.length; i++) text += (i ? '&' : '') + encode(names[i]) + '=' + encode(toText(fields[names[i]]));
    return text;
  };
  var visit = function (origin, then) {
    var site = siteOfOrigin(toText(origin));
    if (!site) { later(function () { then(null); }, 0); return; }
    var at = 0;
    var last = null;
    busy(1);
    var step = function () {
      if (at >= site.actions.length) { busy(-1); return then(last); }
      var action = site.actions[at];
      at += 1;
      /* each request's spec is made whole (no field set later: a setter the app put on Object.prototype would see it),
         from the action's own fields */
      var tab = { from: site.origin, address: site.address, noReferrer: site.noReferrer };
      var made = function (method, url, mode, credentials, destination, headers, body) {
        return { from: tab.from, address: tab.address, noReferrer: tab.noReferrer, show: true, method: method, url: url, mode: mode, credentials: credentials, destination: destination, headers: headers, body: body };
      };
      var spec;
      var away = false;
      var img = own(action, 'img');
      var target = own(action, 'fetch');
      var form = own(action, 'form');
      if (typeof img === 'string') spec = made('GET', new NativeURL(img), 'no-cors', 'include', 'image', [], null);
      else if (typeof target === 'string') {
        var asked = own(action, 'credentials');
        var fields = own(action, 'body');
        spec = made(own(action, 'method') === 'POST' ? 'POST' : 'GET', new NativeURL(target), own(action, 'mode') === 'no-cors' ? 'no-cors' : 'cors', asked === 'include' || asked === 'omit' ? asked : 'same-origin', 'fetch', fields ? [['content-type', FORM + ';charset=UTF-8']] : [], fields ? formBody(fields) : null);
      } else if (typeof form === 'string') {
        away = true;
        var values = own(action, 'fields') || {};
        spec = own(action, 'method') === 'POST'
          ? made('POST', new NativeURL(form), 'navigate', 'include', 'document', [['content-type', FORM]], formBody(values))
          : made('GET', new NativeURL(form + '?' + formBody(values)), 'navigate', 'include', 'document', [], null);
      } else {
        away = true;
        spec = made('GET', new NativeURL(toText(own(action, 'link'))), 'navigate', 'include', 'document', [], null);
      }
      sendAs(spec, function (result) {
        last = result.kind === 'answer' ? result.status : result.kind;
        if (away) at = site.actions.length;
        step();
      });
    };
    step();
  };

  /* JSON text of a parsed value, as JSON.stringify writes it, without asking anything for a toJSON. */
  var jsonText = function (value) {
    if (value === null || typeof value !== 'object') return stringify(value);
    var text = '';
    var i;
    if (isArray(value)) {
      for (i = 0; i < value.length; i++) text += (i ? ',' : '') + jsonText(value[i]);
      return '[' + text + ']';
    }
    var keys = keysOf(value);
    for (i = 0; i < keys.length; i++) text += (i ? ',' : '') + stringify(keys[i]) + ':' + jsonText(value[keys[i]]);
    return '{' + text + '}';
  };
  var readPath = function (text, path) {
    var value;
    try { value = parseJson(text); } catch (error) { return null; }
    for (var at = 0; ;) {
      var dot = indexOfText(path, '.', at);
      var part = dot < 0 ? sliceText(path, at) : sliceText(path, at, dot);
      if (value === null || typeof value !== 'object' || !hasOwn(value, part)) return null;
      value = value[part];
      if (dot < 0) break;
      at = dot + 1;
    }
    if (value === null || typeof value === 'string' || typeof value === 'number') return value;
    return jsonText(value);
  };
  var counter = function (test) {
    return function (key) {
      var count = 0;
      each(key, function (record) { if (test(record)) count += 1; });
      return count;
    };
  };

  /* --- the thief (chapter 3) -------------------------------------------------------------------------------------- */
  var REPLAY = config.limits.replay;
  var copies = createObject(null);
  var emptyLoot = function () { return { cookies: [], tokens: [], headerSets: [], queries: [] }; };
  var addOnce = function (list, item) { if (list.length < REPLAY.candidates && !has(list, item)) push(list, item); };
  var lootSeq = 0;
  /* a cookie into the loot: name, value, path and when it was made (the browser's order for a Cookie header); one of the
     same name and path replaces it, as the thief keeps the newest */
  var keepCookie = function (loot, name, value, path, created) {
    var item = [name, value, path || '/', typeof created === 'number' ? created : clock, lootSeq++];
    for (var i = 0; i < loot.cookies.length; i++) {
      if (loot.cookies[i][0] === name && loot.cookies[i][2] === item[2]) { put(loot.cookies, i, item); return; }
    }
    if (loot.cookies.length < REPLAY.candidates) push(loot.cookies, item);
  };
  var dropCookie = function (loot, name, path) {
    var kept = [];
    for (var i = 0; i < loot.cookies.length; i++) if (!(loot.cookies[i][0] === name && loot.cookies[i][2] === path)) push(kept, loot.cookies[i]);
    loot.cookies = kept;
  };
  /* name=value pairs as document.cookie or a Cookie header shows them (no path: the page's) */
  var cookiePairs = function (loot, header) {
    var text = toText(header);
    var from = 0;
    while (from < text.length) {
      var end = indexOfText(text, ';', from);
      if (end < 0) end = text.length;
      var pair = sliceText(text, from, end);
      while (pair.length && pair[0] === ' ') pair = sliceText(pair, 1);
      var at = indexOfText(pair, '=');
      if (at > 0) keepCookie(loot, sliceText(pair, 0, at), sliceText(pair, at + 1), '/', clock);
      from = end + 1;
    }
  };
  /* a Set-Cookie line an answer gave the thief (or a sign-in answered): kept with its path, or dropped when it expires it */
  var setCookieInto = function (loot, line, href) {
    var parsed = cookieModel.parse(toText(line));
    if (own(parsed, 'problem')) return;
    var path = parsed.path !== null ? parsed.path : cookieModel.defaultPath(pathOf(new NativeURL(href)));
    var gone = parsed.maxAge !== null ? parsed.maxAge <= 0 : parsed.expires !== null && parsed.expires <= clock;
    if (gone) dropCookie(loot, parsed.name, path);
    else keepCookie(loot, parsed.name, parsed.value, path, clock);
  };
  var JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;
  var looksSigned = function (text) { return execPattern(JWT_SHAPE, text) !== null; };
  /* every string in a value read as JSON (or the text itself when it is no JSON object or list), name-blind: a token
     under any key */
  var tokensIn = function (loot, text, depth) {
    text = toText(text);
    var value;
    var parsed = true;
    try { value = parseJson(text); } catch (error) { parsed = false; }
    if (!parsed || value === null || typeof value !== 'object') {
      if (text.length >= 8 && text.length <= 4096) addOnce(loot.tokens, text);
      return;
    }
    var walk = function (item, level) {
      if (level > 4) return;
      if (typeof item === 'string') { if (item.length >= 8 && item.length <= 4096) addOnce(loot.tokens, item); return; }
      if (item === null || typeof item !== 'object') return;
      var keys = keysOf(item);
      for (var i = 0; i < keys.length && i < REPLAY.candidates; i++) walk(item[keys[i]], level + 1);
    };
    walk(value, depth || 0);
  };
  var queryOf = function (href) {
    var at = indexOfText(href, '?');
    if (at < 0) return '';
    var hash = indexOfText(href, '#', at);
    return sliceText(href, at + 1, hash < 0 ? href.length : hash);
  };
  var decodeText = function (text) {
    text = toText(text);
    var spaced = '';
    for (var i = 0; i < text.length; i++) spaced += text[i] === '+' ? ' ' : text[i];
    try { return decode(spaced); } catch (error) { return text; }
  };
  /* What a script on the page could take now: document.cookie, every item of the page's own storage, and of every
     request the page's code sent its headers and query, and the answers it could read. */
  var scriptLoot = function () {
    var loot = emptyLoot();
    cookiePairs(loot, jar.steal(page));
    if (storageModel) {
      for (var pass = 0; pass < 2; pass++) {
        var items = storageModel.area(pass === 0 ? 'local' : 'session', page).entries();
        for (var i = 0; i < items.length; i++) tokensIn(loot, items[i][1], 0);
      }
    }
    for (var r = 0; r < recordCount; r++) {
      var record = records[r];
      if (!record.page) continue;
      if (record.headers.length && loot.headerSets.length < REPLAY.candidates) push(loot.headerSets, copy(record.headers));
      var query = queryOf(record.href);
      if (query) addOnce(loot.queries, query);
      if (record.answer !== null) tokensIn(loot, record.answer, 0);
    }
    return loot;
  };
  /* A copy of the browser's cookies for the API (a HAR file, an extension on a shared computer): all of them, HttpOnly too. */
  var apiHost = sliceText(api, indexOfText(api, '//') + 2);
  var browserLoot = function () {
    var loot = emptyLoot();
    var list = jar.list();
    for (var i = 0; i < list.length; i++) {
      var cookie = list[i];
      var matches = cookie.hostOnly ? cookie.domain === apiHost : cookie.domain === apiHost || cookieModel.domainMatch(apiHost, cookie.domain);
      if (matches) keepCookie(loot, cookie.name, cookie.value, cookie.path, cookie.created);
    }
    return loot;
  };
  /* What reached another site's server: every value in the addresses and bodies sent there (the widget's "analytics"). */
  var siteLoot = function (origin) {
    var loot = emptyLoot();
    for (var r = 0; r < recordCount; r++) {
      var record = records[r];
      if (record.origin !== origin) continue;
      var parts = [queryOf(record.href)];
      if (record.body !== null) push(parts, record.body);
      for (var p = 0; p < parts.length; p++) {
        var text = toText(parts[p]);
        var from = 0;
        while (from <= text.length) {
          var end = indexOfText(text, '&', from);
          if (end < 0) end = text.length;
          var pair = sliceText(text, from, end);
          var at = indexOfText(pair, '=');
          var value = decodeText(at < 0 ? pair : sliceText(pair, at + 1));
          if (value) {
            tokensIn(loot, value, 0);
            if (indexOfText(value, '=') > 0) cookiePairs(loot, value);
          }
          from = end + 1;
        }
      }
    }
    return loot;
  };
  var lootFor = function (using) {
    using = toText(using === undefined ? 'script' : using);
    if (using === 'script') return scriptLoot();
    if (hasOwn(copies, using)) return copies[using];
    if (siteOfOrigin(using)) return siteLoot(using);
    return emptyLoot();
  };
  var describeAttempt = function (headers) {
    var text = '';
    for (var i = 0; i < headers.length; i++) {
      var name = headers[i][0];
      if (name === 'origin' || name === 'referer') continue;
      text += (text ? '; ' : '') + name + ': ' + headers[i][1];
    }
    return cut(text || 'nothing', REPLAY.text);
  };
  /* A token made up without the secret (forge): each JWT the loot has, its exp moved 30 days on (or added), once with its
     old signature and once as alg none without one; cookies keep their names. */
  var toBase64 = typeof btoa === 'function' ? btoa : null;
  var fromBase64 = typeof atob === 'function' ? atob : null;
  var base64url = function (text) {
    var plain = toBase64(text);
    var out = '';
    for (var i = 0; i < plain.length; i++) out += plain[i] === '+' ? '-' : plain[i] === '/' ? '_' : plain[i] === '=' ? '' : plain[i];
    return out;
  };
  var forgeToken = function (token) {
    if (!toBase64 || !fromBase64) return [];
    var first = indexOfText(token, '.');
    var second = first < 0 ? -1 : indexOfText(token, '.', first + 1);
    if (first < 0 || second < 0 || indexOfText(token, '.', second + 1) >= 0) return [];
    var body = sliceText(token, first + 1, second);
    var standard = '';
    for (var i = 0; i < body.length; i++) standard += body[i] === '-' ? '+' : body[i] === '_' ? '/' : body[i];
    while (standard.length % 4) standard += '=';
    var claims;
    try { claims = parseJson(fromBase64(standard)); } catch (error) { return []; }
    if (claims === null || typeof claims !== 'object' || isArray(claims)) return [];
    var keys = keysOf(claims);
    var text = '';
    for (var k = 0; k < keys.length; k++) if (keys[k] !== 'exp') text += (text ? ',' : '') + stringify(keys[k]) + ':' + jsonText(claims[keys[k]]);
    text = '{' + text + (text ? ',' : '') + '"exp":' + (mathRound(clock / 1000 - 0.5) + 2592000) + '}';
    var payload;
    try { payload = base64url(text); } catch (error) { return []; }
    return [sliceText(token, 0, first) + '.' + payload + '.' + sliceText(token, second + 1), base64url('{"alg":"none","typ":"JWT"}') + '.' + payload + '.'];
  };
  var forgedLoot = function (loot) {
    var made = emptyLoot();
    for (var c = 0; c < loot.cookies.length; c++) {
      var cookie = loot.cookies[c];
      var forged = forgeToken(cookie[1]);
      if (!forged.length) { keepCookie(made, cookie[0], cookie[1], cookie[2], cookie[3]); continue; }
      keepCookie(made, cookie[0], forged[0], cookie[2], cookie[3]);
      addOnce(made.tokens, cookie[0] + '=' + forged[1]);
    }
    for (var t = 0; t < loot.tokens.length; t++) {
      var each = forgeToken(loot.tokens[t]);
      for (var f = 0; f < each.length; f++) addOnce(made.tokens, each[f]);
    }
    return made;
  };
  var replay = function (probe, then) {
    var asked = requestOf(toText(probe.replay));
    var taken = lootFor(probe.using);
    var forging = probe.forge === true;
    var loot = forging ? forgedLoot(taken) : taken;
    var keep = !forging && hasOwn(copies, toText(probe.using === undefined ? '' : probe.using));
    /* the Cookie header the browser would send to this path: the cookies whose path matches, longer paths first, then the
       older (RFC 6265bis 5.8.3), as the page's own requests carry them */
    var cookieHeader = function (path) {
      var chosen = [];
      for (var i = 0; i < loot.cookies.length; i++) {
        var cookie = loot.cookies[i];
        if (!cookieModel.pathMatch(path, cookie[2])) continue;
        var at = chosen.length;
        while (at > 0) {
          var before = chosen[at - 1];
          if (before[2].length > cookie[2].length || (before[2].length === cookie[2].length && (before[3] < cookie[3] || (before[3] === cookie[3] && before[4] < cookie[4])))) break;
          put(chosen, at, before);
          at--;
        }
        put(chosen, at, cookie);
      }
      var text = '';
      for (var k = 0; k < chosen.length; k++) text += (k ? '; ' : '') + chosen[k][0] + '=' + chosen[k][1];
      return text;
    };
    /* sent exactly as the shop's page sends a request to the API (wireHeaders): the headers its code set, in the order a
       Headers object keeps them (by name), then its Origin, the Referer a cross-origin request carries (the page's origin
       and a slash), then the cookies; no body. So only what was taken decides, never how it was sent. */
    var wire = function (extra, cookie) {
      var headers = [];
      for (var i = 0; i < extra.length; i++) {
        var at = headers.length;
        while (at > 0 && headers[at - 1][0] > extra[i][0]) { put(headers, at, headers[at - 1]); at--; }
        put(headers, at, [extra[i][0], extra[i][1]]);
      }
      push(headers, ['origin', page]);
      push(headers, ['referer', page + '/']);
      if (cookie) push(headers, ['cookie', cookie]);
      return headers;
    };
    var path = pathOf(asked.url);
    var withCookies = cookieHeader(path);
    var attempt = function (extra, query, cookie) { return { headers: wire(extra, cookie), query: query }; };
    /* what looks most like a session first (the cookies it has, then each header set and token, alone and with those
       cookies), so the Server panel shows few misses */
    var attempts = [];
    if (withCookies) push(attempts, attempt([], '', withCookies));
    for (var h = 0; h < loot.headerSets.length; h++) {
      push(attempts, attempt(loot.headerSets[h], '', ''));
      if (withCookies) push(attempts, attempt(loot.headerSets[h], '', withCookies));
    }
    /* the thief knows how the site works (it can sign up itself): it tries each string under each cookie name the API uses */
    var names = [];
    var held = jar.list();
    for (var n = 0; n < held.length; n++) {
      var kept = held[n];
      var ours = kept.hostOnly ? kept.domain === apiHost : kept.domain === apiHost || cookieModel.domainMatch(apiHost, kept.domain);
      if (ours) addOnce(names, kept.name);
    }
    /* a token-shaped string (header.payload.signature) first, then the rest */
    var ordered = [];
    for (var o = 0; o < loot.tokens.length; o++) if (looksSigned(loot.tokens[o])) push(ordered, loot.tokens[o]);
    for (var p = 0; p < loot.tokens.length; p++) if (!looksSigned(loot.tokens[p])) push(ordered, loot.tokens[p]);
    for (var t = 0; t < ordered.length; t++) {
      var token = ordered[t];
      push(attempts, attempt([['authorization', 'Bearer ' + token]], '', ''));
      if (withCookies) push(attempts, attempt([['authorization', 'Bearer ' + token]], '', withCookies));
      if (indexOfText(token, '=') > 0) push(attempts, attempt([], '', token));
      else if (indexOfText(token, ';') < 0) for (var m = 0; m < names.length; m++) push(attempts, attempt([], '', names[m] + '=' + token));
    }
    for (var q = 0; q < loot.queries.length; q++) push(attempts, attempt([], loot.queries[q], withCookies));
    if (!attempts.length) push(attempts, attempt([], '', ''));
    var at = 0;
    var last = 'failed';
    var lastAttempt = attempts[0];
    busy(1);
    var finish = function (value, used) {
      busy(-1);
      if (probe.show === true) hooks.post({ type: 'replay', request: asked.method + ' ' + hrefOf(asked.url), using: describeAttempt(used.headers), status: typeof value === 'number' ? value : null, by: probe.using !== undefined && siteOfOrigin(toText(probe.using)) ? toText(probe.using) : null });
      then(value);
    };
    var next = function () {
      if (at >= attempts.length || at >= REPLAY.attempts) return finish(last, lastAttempt);
      var each = attempts[at];
      at += 1;
      lastAttempt = each;
      var href = hrefOf(asked.url);
      if (each.query) href = originOf(asked.url) + pathOf(asked.url) + '?' + each.query;
      exchange({ method: asked.method, url: href, headers: each.headers, body: null, who: 'thief' }, new NativeURL(href), null, function (answer) {
        later(function () {
          if (own(answer, 'fail')) { last = 'failed'; return next(); }
          /* the thief keeps the cookies it is given (a rotated refresh token), with their paths */
          if (keep) {
            for (var i = 0; i < answer.headers.length; i++) {
              if (lowerCase(toText(answer.headers[i][0])) === 'set-cookie') setCookieInto(loot, answer.headers[i][1], href);
            }
          }
          last = answer.status;
          if (answer.status >= 200 && answer.status < 300) return finish(answer.status, each);
          next();
        }, delay);
      });
    };
    next();
  };
  /* What a sign-in answered ago minutes earlier: its Set-Cookie values and every string of its body, kept as a copy. */
  var issued = function (probe, then) {
    var asked = requestOf(toText(probe.issued));
    var name = toText(probe.as === undefined ? 'issued' : probe.as);
    var ago = typeof probe.ago === 'number' && probe.ago >= 0 ? probe.ago : 0;
    var fields = probe.body && typeof probe.body === 'object' ? probe.body : {};
    var loot = emptyLoot();
    copies[name] = loot;
    busy(1);
    var body = formBody(fields);
    var href = hrefOf(asked.url);
    var target = originOf(asked.url);
    /* as the page's sign-in sends it: its form's Content-Type, then its Origin and the cross-origin Referer */
    var request = { method: asked.method, url: href, headers: [['content-type', FORM + ';charset=UTF-8'], ['origin', page], ['referer', page + '/']], body: body, now: clock - ago * 60000 };
    var done = function (answer) {
      later(function () {
        busy(-1);
        if (!own(answer, 'fail')) {
          for (var i = 0; i < answer.headers.length; i++) {
            if (lowerCase(toText(answer.headers[i][0])) === 'set-cookie') setCookieInto(loot, answer.headers[i][1], href);
          }
          if (typeof answer.body === 'string') tokensIn(loot, answer.body, 1);
        }
        then();
      }, delay);
    };
    if (target !== api) { later(function () { done({ fail: 'net::ERR_NAME_NOT_RESOLVED' }); }, 0); return; }
    server.serve(request, done);
  };

  /* Chapter 4: another customer's browser (Sam on his phone, a customer on www): its own empty cache and its own cookie,
     so it meets Lena's copies only at the CDN. A page on from (the shop's by default; null: an app, no CORS) sends the
     request, with its preflight when it needs one; like: exactly as the page's requests to that address went, each
     different one the page really sent (its query, the headers its code set: a request refused at its preflight, or
     answered by Lena's own cache, never left her browser), one after the other. The value: the status, a field of its
     JSON (json) when it may read it, 'blocked' (CORS) or 'failed'; with like, the one value they all gave, else every
     value joined with ' | ' (a page that sends a decoy beside its real request hides nothing). Nothing in Lena's panels
     but the CDN's log. */
  var sameHeaders = function (first, second) {
    if (first.length !== second.length) return false;
    for (var i = 0; i < first.length; i++) if (first[i][0] !== second[i][0] || first[i][1] !== second[i][1]) return false;
    return true;
  };
  var other = function (probe, then) {
    var name = toText(probe.other);
    var asked = requestOf(toText(probe.request));
    var variants = [];
    if (probe.like === true) {
      var place = placeOf(asked.method, asked.url);
      for (var r = 0; r < recordCount; r++) {
        var record = records[r];
        if (!record.page || !record.sent || record.place !== place) continue;
        var seen = false;
        for (var v = 0; v < variants.length; v++) if (variants[v].href === record.href && sameHeaders(variants[v].headers, record.headers)) seen = true;
        if (!seen) push(variants, { href: record.href, headers: copy(record.headers) });
      }
    }
    if (!variants.length) push(variants, { href: hrefOf(asked.url), headers: [] });
    var from = probe.from === null ? null : probe.from === undefined ? page : originOf(new NativeURL(toText(probe.from)));
    var cookie = typeof probe.cookie === 'string' && probe.cookie ? toText(probe.cookie) : null;
    var fields = probe.body && typeof probe.body === 'object' ? probe.body : null;
    var results = [];
    var one = function (variant, done) {
      var given = copy(variant.headers);
      if (probe.headers && typeof probe.headers === 'object') {
        var names = keysOf(probe.headers);
        for (var n = 0; n < names.length; n++) push(given, [lowerCase(names[n]), toText(probe.headers[names[n]])]);
      }
      if (fields) push(given, ['content-type', FORM + ';charset=UTF-8']);
      var url = new NativeURL(variant.href);
      var cross = from !== null && originOf(url) !== from;
      var credentials = cookie ? 'include' : 'omit';
      var corsRequest = { origin: from, method: asked.method, headers: given, credentials: credentials };
      var sent = copy(given);
      if (from !== null && (cross || (asked.method !== 'GET' && asked.method !== 'HEAD'))) push(sent, ['origin', from]);
      if (from !== null) push(sent, ['referer', cross ? from + '/' : from + config.path]);
      if (cookie) push(sent, ['cookie', cookie]);
      var actual = function () {
        exchange({ method: asked.method, url: variant.href, headers: sent, body: fields ? formBody(fields) : null, who: name }, url, null, function (answer) {
          later(function () {
            if (own(answer, 'fail')) return done('failed');
            if (cross && model.check(corsRequest, answer)) return done('blocked');
            if (typeof probe.json === 'string' && answer.status >= 200 && answer.status < 300 && typeof answer.body === 'string') return done(readPath(answer.body, toText(probe.json)));
            done(answer.status);
          }, delay);
        });
      };
      if (!(cross && model.needsPreflight(asked.method, given))) return actual();
      exchange({ method: 'OPTIONS', url: variant.href, headers: model.preflightHeaders(corsRequest), body: null, who: name }, url, null, function (answer) {
        later(function () {
          if (own(answer, 'fail')) return done('failed');
          if (model.checkPreflight(corsRequest, answer)) return done('blocked');
          actual();
        }, delay);
      });
    };
    busy(1);
    var at = 0;
    var step = function () {
      if (at >= variants.length) {
        busy(-1);
        var value = results[0];
        for (var k = 1; k < results.length; k++) if (results[k] !== value) value = null;
        if (value === null && results.length > 1) {
          var joinedText = '';
          for (var j = 0; j < results.length; j++) joinedText += (j ? ' | ' : '') + toText(results[j]);
          return then(joinedText);
        }
        return then(results[0]);
      }
      var variant = variants[at];
      at += 1;
      one(variant, function (value) { push(results, value); step(); });
    };
    step();
  };

  /* the page's Storage objects: Storage.prototype gets the model's members (its own refuse anything but a real Storage) */
  var storageObjects = storageModel ? function (proto) {
    storageModel.install(proto, storageChanged);
    return { local: storageModel.expose(storageModel.area('local', page), proto), session: storageModel.expose(storageModel.area('session', page), proto) };
  } : null;

  return {
    fetch: fetch,
    pending: function () { return pending; },
    count: counter(function () { return true; }),
    read: counter(function (record) { return record.read; }),
    arrived: counter(function (record) { return record.arrived; }),
    sent: function (key, path) {
      var last = null;
      each(key, function (record) { last = record; });
      if (!last || last.body === null) return null;
      return path ? readPath(last.body, path) : last.body;
    },
    from: from,
    visit: visit,
    navigate: navigate,
    carried: function (key, name) {
      var count = 0;
      each(key, function (record) { if (has(record.cookies, toText(name))) count += 1; });
      return count;
    },
    leaked: function (text) {
      text = toText(text);
      var count = 0;
      for (var i = 0; i < recordCount; i++) if (records[i].site !== pageSite && text && indexOfText(records[i].text, text) >= 0) count += 1;
      return count;
    },
    readable: function (name) { return has(jar.readable(page), toText(name)) ? 1 : 0; },
    stolen: function (request, then) {
      var asked = requestOf(toText(request));
      var header = jar.steal(page);
      busy(1);
      /* sent the way the shop's page sends its own requests to the API (its Origin, the cross-origin Referer: the origin
         and a slash), so only the cookie decides */
      var sent = [['origin', page], ['referer', page + '/']];
      if (header) push(sent, ['cookie', header]);
      exchange({ method: asked.method, url: hrefOf(asked.url), headers: sent, body: null, who: 'thief' }, asked.url, null, function (answer) {
        later(function () {
          busy(-1);
          then(own(answer, 'fail') ? 'failed' : answer.status);
        }, delay);
      });
    },
    documentCookie: function () { return jar.document(pageAddress); },
    writeCookie: function (value) {
      var text = toText(value);
      var result = jar.write(text, pageAddress);
      if (result.problem) logRefusal('script', pageAddress, result.name, text, cookieModel.reason(result.problem, 'script'));
      cookiesChanged();
    },
    storage: storageObjects,
    date: scriptedDate,
    /* the scripted time on the frame's window: Date, its prototype's constructor, Intl's default date, timeOrigin */
    installTime: scriptedDate ? function (global) { (${SCRIPTED_TIME_SOURCE})(global, scriptedDate, function () { return clock; }); } : null,
    quietFor: config.time ? function () { return hooks.now() - lastActive; } : null,
    later: function (minutes) {
      var moved = parseFloatText(minutes);
      if (moved !== moved || moved < 0 || moved > 525600) return;
      clock += moved * 60000;
      cookiesChanged();
      storageChanged();
      cacheChanged();
    },
    copy: function (kind, as) {
      copies[toText(as)] = toText(kind) === 'browser' ? browserLoot() : scriptLoot();
    },
    issued: issued,
    replay: replay,
    fromCache: counter(function (record) { return record.fromCache; }),
    notModified: counter(function (record) { return record.notModified; }),
    /* an address ending in / counts every path below it (4.5: the menu under any name the page gives it) */
    whole: function (key) {
      var place = keyOf(key);
      var below = place[place.length - 1] === '/';
      var count = 0;
      for (var k = 0; k < recordCount; k++) {
        var record = records[k];
        var matches = below ? sliceText(record.place, 0, place.length) === place : record.place === place;
        if (matches && record.page && record.whole) count += 1;
      }
      return count;
    },
    reached: function (key) {
      var place = keyOf(key);
      return hasOwn(reachedBy, place) ? reachedBy[place] : 0;
    },
    other: other
  };
})`
