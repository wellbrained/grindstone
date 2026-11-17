// The Web fundamentals track's browser and servers inside the sealed frame (ADR 0009; docs/features/levels.md "The web
// backend"): it answers the app's `fetch` the way a browser would talk to the shop's API on another origin. The page is
// on the shop's origin (`https://cornerbakery.shop`); a request to the API's origin (`https://api.cornerbakery.shop`)
// goes through the CORS model (cors.ts): a preflight first when it needs one (its own row in the Network panel, never a
// cookie), then the request with the Origin (and the customer's session cookie when credentialed and from the same
// site), then the CORS check on the answer. The API's answers come from the level's own `server.js` (server.ts, run in
// a worker); the shop's own server answers fixed routes, also on the other origins it serves (www, another port). A
// refusal is what Chrome does: `TypeError: Failed to fetch` for the app, Chrome's two Console lines, and in the Network
// panel the row with "CORS error", the reason, and what the server really sent.
//
// Two halves, like Debugging's backend: `webConfig` (TypeScript) turns the level's spec and files into plain data, and
// WEB_BACKEND_SOURCE (JavaScript in a string) runs in the frame (and in the unit tests, with a server run in-process).
// The same interface as Debugging's backend (`fetch`, `pending`, `count`, `sent`), plus what the web probes read:
// `read` (answers whose body the app read), `arrived` (requests that reached server.js) and `from` (a request from
// another origin, the way a page there would send it).
import { STATUS_TEXT, backendConfig } from '../debugging/backend'
import type { BackendRoute } from '../debugging/types'
import { CORS_SOURCE } from './cors'
import { SERVER_HOST_SOURCE, SERVER_LIMITS, serverPrelude } from './server'

/** The time each exchange with a server takes on the way (both ways together), like a quick local network. */
export const WEB_DELAY_MS = 20

/** A level's servers (`sandbox.web`). */
export interface WebSpec {
  /** The API's origin: every request to it is answered by the level's server.js. */
  api: string
  /** The file that holds the API server's code; none: nothing answers on the API's origin (the level is about the shop's own). */
  server?: string
  /** The shop's own server: fixed answers (no CORS headers), on the page's origin and on `alsoOn` (www, another port). */
  shop?: { routes: readonly BackendRoute[], alsoOn?: readonly string[] }
  /**
   * The customer's session at the API (a cookie the browser holds for it): sent with a credentialed request from the
   * same site (`credentials: 'include'`), never with a preflight, never from another site (SameSite=Lax, the default).
   */
  session?: { name: string, value: string }
}

interface ShopRouteData {
  method: string
  path: string
  answers: { status: number, headers: [string, string][], body: string | null }[]
}

/** What the frame gets. */
export interface WebConfig {
  page: string
  api: string
  /** server.js as saved; null when the level has no such file any more, or none at all. */
  source: string | null
  /** The level has a server.js (false: the API's origin answers nothing, and says nothing). */
  hasServer: boolean
  prelude: string
  limits: typeof SERVER_LIMITS
  delay: number
  statusText: Readonly<Record<number, string>>
  session: { name: string, value: string } | null
  shop: { origins: string[], routes: ShopRouteData[] }
}

/** The level's servers as plain data for the frame (throws for what a level cannot mean: the level tests load each one). */
export function webConfig(spec: WebSpec, files: Readonly<Record<string, string>>, page: string): WebConfig {
  const origin = new URL(page).origin
  const api = new URL(spec.api).origin
  if (api !== spec.api) throw new Error(`the API ${spec.api} is not an origin (no path, no slash at the end)`)
  if (api === origin) throw new Error('the API must be on another origin than the page')
  const routes = spec.shop?.routes ?? []
  for (const route of routes) {
    if (route.body !== undefined || route.query !== undefined) throw new Error(`${route.path}: the shop's routes take no body or query patterns`)
    if (!route.path.startsWith('/')) throw new Error(`${route.path}: the shop's routes are paths on its own server`)
  }
  const data = backendConfig({ routes }, origin)
  return {
    page: origin,
    api,
    source: spec.server !== undefined && Object.hasOwn(files, spec.server) ? files[spec.server]! : null,
    hasServer: spec.server !== undefined,
    prelude: serverPrelude(STATUS_TEXT),
    limits: SERVER_LIMITS,
    delay: WEB_DELAY_MS,
    statusText: STATUS_TEXT,
    session: spec.session ? { ...spec.session } : null,
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
}

// Runs inside the frame as part of the bridge (one line: block comments only, every statement ends with a semicolon),
// and in the unit tests. `hooks.post` posts to the page, `hooks.now` is the Network panel's clock, `hooks.serve` (tests
// only) answers for server.js in place of the worker.
export const WEB_BACKEND_SOURCE = String.raw`(function (config, hooks) {
  'use strict';
  var model = (${CORS_SOURCE})();
  var server = hooks.serve ? { serve: hooks.serve } : (${SERVER_HOST_SOURCE})({ source: config.source, hasServer: config.hasServer, prelude: config.prelude, limits: config.limits }, {
    output: function (line) { hooks.post({ type: 'server', level: line.level, text: line.text, line: line.line }); }
  });
  var page = config.page;
  var api = config.api;
  var delay = config.delay;
  var STATUS = config.statusText;
  /* Everything that decides a request (its origin, its headers, the cookie, the CORS check) and everything the probes
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
  var protocolOf = getter(NativeURL.prototype, 'protocol');
  var hostnameOf = getter(NativeURL.prototype, 'hostname');
  var requestUrlOf = getter(NativeRequest.prototype, 'url');
  var methodOf = getter(NativeRequest.prototype, 'method');
  var modeOf = getter(NativeRequest.prototype, 'mode');
  var credentialsOf = getter(NativeRequest.prototype, 'credentials');
  var headersOf = getter(NativeRequest.prototype, 'headers');
  var eachHeader = uncurry(Headers.prototype.forEach);
  var isRequest = uncurry(FP[Symbol.hasInstance], NativeRequest);
  var upperCase = uncurry(String.prototype.toUpperCase);
  var indexOfText = uncurry(String.prototype.indexOf);
  var sliceText = uncurry(String.prototype.slice);
  var hasOwn = uncurry(Object.prototype.hasOwnProperty);
  var thenOf = uncurry(NativePromise.prototype.then);
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
  var NULL_BODY = [204, 205, 304];
  var READERS = [];
  var readers = createObject(null);
  var NAMES = ['json', 'text', 'arrayBuffer', 'blob', 'formData'];
  for (var r = 0; r < NAMES.length; r++) {
    if (typeof NativeResponse.prototype[NAMES[r]] !== 'function') continue;
    READERS[READERS.length] = NAMES[r];
    readers[NAMES[r]] = uncurry(NativeResponse.prototype[NAMES[r]]);
  }
  var records = createObject(null);
  var recordCount = 0;
  var pending = 0;
  var nextId = 1;
  var shopCalls = [];
  for (var c = 0; c < config.shop.routes.length; c++) shopCalls[c] = 0;
  var FETCH = "Failed to execute 'fetch' on 'Window': ";

  var has = function (list, item) {
    for (var i = 0; i < list.length; i++) if (list[i] === item) return true;
    return false;
  };
  var copy = function (list) {
    var out = [];
    for (var i = 0; i < list.length; i++) out[i] = list[i];
    return out;
  };
  var rejected = function (error) { return new NativePromise(function (resolve, reject) { reject(error); }); };
  var placeOf = function (method, url) { return upperCase(method) + ' ' + originOf(url) + pathOf(url); };
  var keyOf = function (key) {
    var space = indexOfText(key, ' ');
    return placeOf(sliceText(key, 0, space), new NativeURL(sliceText(key, space + 1), page + '/'));
  };
  /* what the probes count: per request its place, its body, whether it reached server.js, whether its body was read */
  var remember = function (place, body) {
    var record = createObject(null);
    record.place = place;
    record.body = body;
    record.arrived = false;
    record.read = false;
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
    eachHeader(headers, function (value, name) { list[list.length] = [name, value]; });
    return list;
  };
  /* The site of an origin: its scheme and its last two labels (cornerbakery.shop). A real browser asks the Public Suffix
     List; every host here has a two-label site. */
  var siteOf = function (origin) {
    var url = new NativeURL(origin);
    var host = hostnameOf(url);
    var dots = 0;
    var at = host.length;
    while (at > 0) {
      if (host[at - 1] === '.' && ++dots === 2) break;
      at--;
    }
    return protocolOf(url) + '//' + sliceText(host, at);
  };
  /* The customer's session goes with a credentialed request ("include", or "same-origin" to its own origin) to the API,
     from a page of the same site; SameSite=Lax keeps it from another site's fetch. */
  var cookieFor = function (from, url, credentials) {
    var target = originOf(url);
    if (!config.session || target !== api) return null;
    var credentialed = credentials === 'include' || (credentials === 'same-origin' && target === from);
    return credentialed && siteOf(from) === siteOf(api) ? config.session.name + '=' + config.session.value : null;
  };
  /* The headers that go over the wire: the page's, the Origin (a CORS request, or any that is not GET or HEAD), the cookie. */
  var wireHeaders = function (headers, from, method, cross, mode, cookie) {
    var list = copy(headers);
    if ((cross && mode === 'cors') || (method !== 'GET' && method !== 'HEAD')) list[list.length] = ['origin', from];
    if (cookie) list[list.length] = ['cookie', cookie];
    return list;
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
  /* One exchange with a server: the API's server.js, the shop's server on each origin it answers on, or nobody (the
     name does not resolve). */
  var exchange = function (request, url, record, done) {
    var target = originOf(url);
    if (target === api) {
      if (record) record.arrived = true;
      server.serve(request, done);
      return;
    }
    if (has(config.shop.origins, target)) { later(function () { done(shopAnswer(request.method, url)); }, 0); return; }
    later(function () { done({ fail: 'net::ERR_NAME_NOT_RESOLVED' }); }, 0);
  };

  var toResponse = function (answer, headers, href, type, record) {
    var body = has(NULL_BODY, answer.status) ? null : answer.body;
    var response = new NativeResponse(body, { status: answer.status, statusText: STATUS[answer.status] || '', headers: headers });
    defineProperty(response, 'url', { value: href });
    defineProperty(response, 'type', { value: type });
    /* reading the body marks the request: the probes can tell an answer the app read from text it wrote itself */
    var reader = function (name) {
      return function () { return thenOf(readers[name](response), function (value) { record.read = true; return value; }); };
    };
    for (var i = 0; i < READERS.length; i++) defineProperty(response, READERS[i], { configurable: true, writable: true, value: reader(READERS[i]) });
    return response;
  };
  var opaqueResponse = function () {
    var response = new NativeResponse(null);
    defineProperty(response, 'status', { value: 0 });
    defineProperty(response, 'ok', { value: false });
    defineProperty(response, 'statusText', { value: '' });
    defineProperty(response, 'type', { value: 'opaque' });
    defineProperty(response, 'url', { value: '' });
    return response;
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
    var sent = wireHeaders(headers, page, method, cross, mode, cookieFor(page, url, credentials));
    var corsRequest = { origin: page, method: method, headers: headers, credentials: credentials };
    var preflight = cross && mode === 'cors' && model.needsPreflight(method, headers);
    var id = nextId++;
    var record = remember(placeOf(method, url), body);
    hooks.post({ type: 'request', id: id, method: method, url: href, headers: sent, body: body, stack: stack, preflightFor: null });
    var started = hooks.now();
    var signal = init && init.signal ? init.signal : null;
    pending += 1;
    return new NativePromise(function (resolve, reject) {
      var open = true;
      var report = function (to, status, statusText, headers, body, failure, reason) {
        hooks.post({ type: 'response', id: to, status: status, statusText: statusText, headers: headers, body: body, failure: failure, time: mathMax(0, mathRound(hooks.now() - started)), reason: reason });
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
      var refuse = function (refusal, answer) {
        if (!close()) return;
        netlog(model.consoleLine(href, page, refusal), '');
        netlog(method + ' ' + href + ' net::ERR_FAILED' + (refusal.preflight ? '' : ' ' + answer.status + ' (' + (STATUS[answer.status] || '') + ')'), stack);
        if (refusal.preflight) report(id, null, '', [], null, 'cors', model.reason(refusal));
        else report(id, answer.status, STATUS[answer.status] || '', answer.headers, answer.body, 'cors', model.reason(refusal));
        reject(failed);
      };
      var actual = function () {
        exchange({ method: method, url: href, headers: sent, body: body }, url, record, function (answer) {
          later(function () {
            if (!open) return;
            if (answer.fail) return failWith(answer.fail);
            if (cross && mode === 'cors') {
              var problem = model.check(corsRequest, answer);
              if (problem) return refuse({ problem: problem, preflight: false }, answer);
            }
            if (!close()) return;
            var statusText = STATUS[answer.status] || '';
            report(id, answer.status, statusText, answer.headers, answer.body, null, null);
            if (answer.status >= 400) netlog(method + ' ' + href + ' ' + answer.status + ' (' + statusText + ')', stack);
            if (cross && mode === 'no-cors') return resolve(opaqueResponse());
            /* an answer the browser's Response can't carry (a header it refuses) fails the fetch, never the page's timer */
            var response;
            try {
              response = toResponse(answer, cross ? model.exposedHeaders(answer, credentials) : answer.headers, href, cross ? 'cors' : 'basic', record);
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
      hooks.post({ type: 'request', id: preflightId, method: 'OPTIONS', url: href, headers: preflightHeaders, body: null, stack: stack, preflightFor: id });
      exchange({ method: 'OPTIONS', url: href, headers: preflightHeaders, body: null }, url, null, function (answer) {
        later(function () {
          if (!open) { report(preflightId, null, '', [], null, 'aborted', null); return; }
          if (answer.fail) {
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

  /* A page on another origin sends a request (a probe: nothing shows in the Network panel or the Console): what it
     gets. The probe's data is the bridge's own copy of its config. */
  var from = function (probe, then) {
    var space = indexOfText(probe.request, ' ');
    var method = upperCase(sliceText(probe.request, 0, space));
    var url = new NativeURL(sliceText(probe.request, space + 1), page + '/');
    var origin = originOf(new NativeURL(probe.fetchFrom));
    var credentials = probe.credentials === 'include' || probe.credentials === 'omit' ? probe.credentials : 'same-origin';
    var given = [];
    if (probe.headers) {
      var names = keysOf(probe.headers);
      for (var i = 0; i < names.length; i++) given[given.length] = [names[i], toText(probe.headers[names[i]])];
    }
    var headers = model.requestHeaders(given, 'cors');
    var cross = originOf(url) !== origin;
    var corsRequest = { origin: origin, method: method, headers: headers, credentials: credentials };
    var sent = wireHeaders(headers, origin, method, cross, 'cors', cookieFor(origin, url, credentials));
    pending += 1;
    var settle = function (value) { pending -= 1; then(value); };
    var actual = function () {
      exchange({ method: method, url: hrefOf(url), headers: sent, body: null }, url, null, function (answer) {
        later(function () {
          if (answer.fail) return settle('failed');
          if (cross && model.check(corsRequest, answer)) return settle('blocked');
          settle(answer.status >= 200 && answer.status < 300 ? 'read' : 'refused');
        }, delay);
      });
    };
    if (!cross || !model.needsPreflight(method, headers)) return actual();
    var asked = model.preflightHeaders(corsRequest);
    exchange({ method: 'OPTIONS', url: hrefOf(url), headers: asked, body: null }, url, null, function (answer) {
      later(function () {
        if (answer.fail) return settle('failed');
        if (model.checkPreflight(corsRequest, answer)) return settle('blocked');
        actual();
      }, delay);
    });
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
    from: from
  };
})`
