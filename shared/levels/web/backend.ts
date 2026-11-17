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
// Two halves, like Debugging's backend: `webConfig` (TypeScript) turns the level's spec and files into plain data, and
// WEB_BACKEND_SOURCE (JavaScript in a string) runs in the frame (and in the unit tests, with a server run in-process).
// The same interface as Debugging's backend (`fetch`, `pending`, `count`, `sent`), plus what the web probes read:
// `read` (answers whose body the app read), `arrived` (requests that reached server.js), `from` (a request from another
// origin, the way a page there would send it), `visit`, `navigate`, `carried`, `leaked` and `readable`.
import { STATUS_TEXT, backendConfig } from '../debugging/backend'
import type { BackendRoute, ProbeStep } from '../debugging/types'
import { COOKIE_SOURCE, WEB_CLOCK } from './cookies'
import { CORS_SOURCE } from './cors'
import { SERVER_HOST_SOURCE, SERVER_LIMITS, serverPrelude } from './server'
import type { OtherSite, SiteAction } from './sites'

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
  limits: typeof SERVER_LIMITS & { panel: typeof COOKIE_PANEL_LIMITS }
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
  return {
    page: origin,
    path,
    api,
    source: spec.server !== undefined && Object.hasOwn(files, spec.server) ? files[spec.server]! : null,
    hasServer: spec.server !== undefined,
    prelude: serverPrelude(STATUS_TEXT),
    limits: { ...SERVER_LIMITS, panel: COOKIE_PANEL_LIMITS },
    delay: WEB_DELAY_MS,
    statusText: STATUS_TEXT,
    clock: WEB_CLOCK,
    seeds,
    sites,
    scene: spec.scene ? JSON.parse(JSON.stringify(spec.scene)) as ProbeStep[] : null,
    application: spec.application === true,
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
}

// Runs inside the frame as part of the bridge (one line: block comments only, every statement ends with a semicolon),
// and in the unit tests. `hooks.post` posts to the page, `hooks.now` is the Network panel's clock, `hooks.serve` (tests
// only) answers for server.js in place of the worker.
export const WEB_BACKEND_SOURCE = String.raw`(function (config, hooks) {
  'use strict';
  var model = (${CORS_SOURCE})();
  var cookieModel = (${COOKIE_SOURCE})();
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
  var headersOf = getter(NativeRequest.prototype, 'headers');
  var eachHeader = uncurry(Headers.prototype.forEach);
  var isRequest = uncurry(FP[Symbol.hasInstance], NativeRequest);
  var upperCase = uncurry(String.prototype.toUpperCase);
  var lowerCase = uncurry(String.prototype.toLowerCase);
  var indexOfText = uncurry(String.prototype.indexOf);
  var sliceText = uncurry(String.prototype.slice);
  var hasOwn = uncurry(Object.prototype.hasOwnProperty);
  var thenOf = uncurry(NativePromise.prototype.then);
  var encode = encodeURIComponent;
  var defineProperty = Object.defineProperty;
  var createObject = Object.create;
  var parseJson = JSON.parse;
  var stringify = JSON.stringify;
  var keysOf = Object.keys;
  var isArray = Array.isArray;
  var mathMax = Math.max;
  var mathMin = Math.min;
  var mathRound = Math.round;
  var toText = String;
  var later = setTimeout;
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

  /* --- the cookie jar: one per load, on the scripted clock --------------------------------------------------------- */
  var jar = cookieModel.createJar(function () { return config.clock; });
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
    record.text = text;
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
  var exchange = function (request, url, record, done) {
    var target = originOf(url);
    if (target === api) {
      if (record) record.arrived = true;
      server.serve(request, done);
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
    var sent = wireHeaders(headers, page, pageAddress, false, url, method, mode, found.header);
    var corsRequest = { origin: page, method: method, headers: headers, credentials: credentials };
    var preflight = cross && mode === 'cors' && model.needsPreflight(method, headers);
    var id = nextId++;
    var record = remember(placeOf(method, url), body, href, textOf(href, sent, body));
    record.cookies = sentNames(found);
    hooks.post({ type: 'request', id: id, method: method, url: href, headers: sent, body: body, stack: stack, preflightFor: null, site: null, destination: 'fetch', cookies: found.list });
    var started = hooks.now();
    var signal = init && init.signal ? init.signal : null;
    pending += 1;
    return new NativePromise(function (resolve, reject) {
      var open = true;
      var report = function (to, status, statusText, headers, body, failure, reason, kept) {
        hooks.post({ type: 'response', id: to, status: status, statusText: statusText, headers: headers, body: body, failure: failure, time: mathMax(0, mathRound(hooks.now() - started)), reason: reason, cookies: kept || [] });
      };
      var netlog = function (text, at) { hooks.post({ type: 'netlog', text: text, stack: at }); };
      var close = function () {
        if (!open) return false;
        open = false;
        pending -= 1;
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
      var refuse = function (refusal, answer, kept) {
        if (!close()) return;
        netlog(model.consoleLine(href, page, refusal), '');
        netlog(method + ' ' + href + ' net::ERR_FAILED' + (refusal.preflight ? '' : ' ' + answer.status + ' (' + (STATUS[answer.status] || '') + ')'), stack);
        if (refusal.preflight) report(id, null, '', [], null, 'cors', model.reason(refusal));
        else report(id, answer.status, STATUS[answer.status] || '', answer.headers, answer.body, 'cors', model.reason(refusal), kept);
        reject(failed);
      };
      var actual = function () {
        exchange({ method: method, url: href, headers: sent, body: body }, url, record, function (answer) {
          later(function () {
            if (!open) return;
            if (own(answer, 'fail')) return failWith(answer.fail);
            /* Fetch stores an answer's cookies before it checks CORS: a refused answer's cookies are kept too */
            var kept = keepCookies(answer.headers, href, include, found.sameSite, false);
            if (cross && mode === 'cors') {
              var problem = model.check(corsRequest, answer);
              if (problem) return refuse({ problem: problem, preflight: false }, answer, kept);
            }
            if (!close()) return;
            var statusText = STATUS[answer.status] || '';
            report(id, answer.status, statusText, answer.headers, answer.body, null, null, kept);
            if (answer.status >= 400) netlog(method + ' ' + href + ' ' + answer.status + ' (' + statusText + ')', stack);
            if (cross && mode === 'no-cors') return resolve(opaqueResponse());
            /* an answer the browser's Response can't carry (a header it refuses) fails the fetch, never the page's timer */
            var response;
            try {
              response = toResponse(answer, cross ? model.exposedHeaders(answer, credentials) : withoutSetCookie(answer.headers), href, cross ? 'cors' : 'basic', record);
            } catch (error) {
              return reject(failed);
            }
            resolve(response);
          }, delay);
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
    pending += 1;
    var finish = function (kind, status) {
      pending -= 1;
      done({ kind: kind, status: status });
    };
    var actual = function () {
      exchange({ method: method, url: href, headers: sent, body: spec.body }, url, record, function (answer) {
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
    exchange({ method: 'OPTIONS', url: href, headers: asked, body: null }, url, null, function (answer) {
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
    sendAs({ from: origin, address: origin + '/', noReferrer: false, method: asked.method, url: asked.url, headers: model.requestHeaders(given, 'cors'), body: null, mode: 'cors', credentials: credentials, destination: 'fetch', show: false }, function (result) {
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
    pending += 1;
    var step = function () {
      if (at >= site.actions.length) { pending -= 1; return then(last); }
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
      pending += 1;
      /* sent the way the shop's page sends its own requests (its Origin and Referer), so only the cookie decides */
      var sent = [['origin', page], ['referer', pageAddress]];
      if (header) push(sent, ['cookie', header]);
      exchange({ method: asked.method, url: hrefOf(asked.url), headers: sent, body: null }, asked.url, null, function (answer) {
        later(function () {
          pending -= 1;
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
    }
  };
})`
