// The scripted fake backend (ADR 0007, chapter 2; docs/features/levels.md "The fake backend"): a level declares what
// the shop's server answers (routes: method and path to a status, a JSON or text body, headers, a delay, or a failed
// connection; a list answers call by call; a route may take only requests whose query or body matches a pattern, so an
// answer, and how long it takes, can depend on the request). The bridge runs BACKEND_SOURCE inside the sealed frame and hands it the
// app's `fetch`, so nothing ever leaves the frame (its Content-Security-Policy still refuses everything else). The app
// gets real Response objects; another origin is refused by CORS the way the browser would (no Access-Control-Allow-Origin
// for the shop: "Failed to fetch" and the browser's console lines). What it posts (each request and its answer, the
// browser's console lines for failed requests) feeds the Network panel and the Console.
//
// Two halves: `backendConfig` (TypeScript, here) checks a level's routes and turns them into plain data, and
// BACKEND_SOURCE (plain JavaScript in a string, like the bridge) answers requests from that data. The unit tests run
// that very source on Node's fetch classes (test/unit/levels/debugging/backend.test.ts).
import type { BackendAnswer, BackendRoute, BackendSpec, HttpMethod } from './types'

/** How long an answer takes when a level does not say (a quick local server). */
export const DEFAULT_DELAY_MS = 30

/** The longest delay a level may script: a check run gives up after 5 s. */
export const MAX_DELAY_MS = 3000

/** The reason phrase of each status a level may answer with (what `statusText` and the browser's console line say). */
export const STATUS_TEXT: Readonly<Record<number, string>> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout'
}

/** An answer as the frame uses it: the body as text, every header (lower case), the delay filled in. */
export type BackendAnswerData
  = | { status: number, statusText: string, headers: Record<string, string>, body: string | null, delay: number }
    | { fail: 'network', error: string, delay: number }

/** A route as the frame uses it: `where` is the address without the query (`https://cornerbakery.shop/api/menu`). */
export interface BackendRouteData {
  method: HttpMethod
  where: string
  body: string | null
  /** A pattern the query (as sent, without `?`) must match; null: any query. */
  query: string | null
  answers: BackendAnswerData[]
}

/** What the bridge hands the backend inside the frame. */
export interface BackendConfig {
  /** The shop's origin, `https://cornerbakery.shop`: the app's own address; anything else is cross-origin. */
  origin: string
  /** The delay of answers the backend makes up itself (a 404 for an unknown path). */
  delay: number
  routes: BackendRouteData[]
  /**
   * Chapter 7, a level with logs: the id of a load's first request. Every answer of the shop's own server then carries
   * `x-request-id: req-<n>`, and the backend posts a `serverlog` (numbers only) when it answers; the page builds the
   * log lines from the level's data (logs.ts), so the scripted lines never travel through the frame.
   */
  logs: { first: number } | null
}

/** The backend running in the frame (or in the unit tests). */
export interface BackendRuntime {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  /** Requests sent and not answered yet (a check run waits for them after a click). */
  pending: () => number
  /** How many requests went to `'METHOD path'` (path on the shop, or a whole URL). */
  count: (key: string) => number
  /** The body of the last request sent there (null: none or no body); with a path, the JSON value at it. */
  sent: (key: string, path: string | null) => string | number | null
}

const NULL_BODY = new Set([204, 205, 304])

const answersOf = (respond: BackendRoute['respond']): readonly BackendAnswer[] => 'length' in respond ? respond : [respond]

function answerData(answer: BackendAnswer, where: string): BackendAnswerData {
  const delay = answer.delay ?? DEFAULT_DELAY_MS
  if (!Number.isFinite(delay) || delay < 0 || delay > MAX_DELAY_MS) throw new Error(`${where}: delay ${delay} is not between 0 and ${MAX_DELAY_MS} ms`)
  if ('fail' in answer) return { fail: 'network', error: 'net::ERR_CONNECTION_REFUSED', delay }
  const statusText = STATUS_TEXT[answer.status]
  if (statusText === undefined) throw new Error(`${where}: status ${answer.status} is not one the backend knows`)
  if (answer.json !== undefined && answer.text !== undefined) throw new Error(`${where}: an answer has json or text, not both`)
  const headers: Record<string, string> = {}
  if (answer.json !== undefined) headers['content-type'] = 'application/json; charset=utf-8'
  else if (answer.text !== undefined) headers['content-type'] = 'text/plain; charset=utf-8'
  for (const [name, value] of Object.entries(answer.headers ?? {})) headers[name.toLowerCase()] = value
  const text = answer.json !== undefined ? JSON.stringify(answer.json) : answer.text ?? ''
  return { status: answer.status, statusText, headers, body: NULL_BODY.has(answer.status) ? null : text, delay }
}

/** The address a route or a probe names, without its query: a path is on the shop (`origin`), a whole URL anywhere. */
export function addressOf(path: string, origin: string): string {
  const url = new URL(path, `${origin}/`)
  return url.origin + url.pathname
}

/** A level's backend as plain data for the frame; throws for what a level cannot mean (the tests load every level). */
export function backendConfig(spec: BackendSpec, shop: string, logs: { first: number } | null = null): BackendConfig {
  const origin = new URL(shop).origin
  return {
    origin,
    delay: DEFAULT_DELAY_MS,
    logs,
    routes: spec.routes.map((route) => {
      const method = route.method ?? 'GET'
      const where = addressOf(route.path, origin)
      const name = `${method} ${route.path}`
      for (const [kind, pattern] of [['body', route.body], ['query', route.query]] as const) {
        if (pattern === undefined) continue
        try {
          new RegExp(pattern)
        } catch {
          throw new Error(`${name}: the ${kind} pattern ${pattern} is not a valid pattern`)
        }
      }
      const answers = answersOf(route.respond).map(answer => answerData(answer, name))
      if (!answers.length) throw new Error(`${name}: a route needs at least one answer`)
      return { method, where, body: route.body ?? null, query: route.query ?? null, answers }
    })
  }
}

// Runs inside the frame as part of the bridge (one line, so no line comments, every statement ends in a semicolon), and
// in the unit tests. `hooks.post` posts a message to the page, `hooks.now` is the clock for the Network panel's times.
// Chapter 7 (a level with logs): the shop's server names each request (`x-request-id`) and posts a `serverlog` when it
// answers, with when on its own clock (the same rule as chapter 6's: an answer comes at its request's start plus its
// delay, and time moves only then).
// Chapter 6 (the server's clock, see the bridge): `hooks.sent(id, delay)` when a request goes out, `hooks.arrived(id)`
// when its answer (or failure) arrives, before the app sees it, `hooks.aborted(id)` when it is cancelled; all optional.
export const BACKEND_SOURCE = String.raw`(function (config, hooks) {
  'use strict';
  var origin = config.origin;
  var routes = config.routes;
  var calls = routes.map(function () { return 0; });
  var hosts = [origin].concat(routes.map(function (route) { return new URL(route.where).origin; }));
  /* What the probes read (requests and sent: where each request went, what it sent) is kept and read with the built-ins
     taken here, when the backend is made (before any of the app's code runs in the frame), in an object without a
     prototype: a built-in the app replaced later can't change what they count or read. */
  var FP = Function.prototype;
  var uncurry = FP.bind.bind(FP.call);
  var NativeURL = URL;
  var originOf = uncurry(Object.getOwnPropertyDescriptor(NativeURL.prototype, 'origin').get);
  var pathOf = uncurry(Object.getOwnPropertyDescriptor(NativeURL.prototype, 'pathname').get);
  var upperCase = uncurry(String.prototype.toUpperCase);
  var indexOfText = uncurry(String.prototype.indexOf);
  var sliceText = uncurry(String.prototype.slice);
  var hasOwn = uncurry(Object.prototype.hasOwnProperty);
  var parseJson = JSON.parse;
  var stringify = JSON.stringify;
  var keysOf = Object.keys;
  var isArray = Array.isArray;
  var sent = Object.create(null);
  var sentCount = 0;
  var pending = 0;
  var nextId = 1;
  var logs = config.logs || null;
  var serverNow = 0;
  var FETCH = "Failed to execute 'fetch' on 'Window': ";
  var SIMPLE_METHODS = ['GET', 'HEAD', 'POST'];
  var SIMPLE_HEADERS = ['accept', 'accept-language', 'content-language', 'content-type'];
  var SIMPLE_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];
  var OPAQUE = " If an opaque response serves your needs, set the request's mode to 'no-cors' to fetch the resource with CORS disabled.";

  var placeOf = function (method, url) { return upperCase(method) + ' ' + originOf(url) + pathOf(url); };
  var keyOf = function (key) {
    var space = indexOfText(key, ' ');
    return placeOf(sliceText(key, 0, space), new NativeURL(sliceText(key, space + 1), origin + '/'));
  };
  var parses = function (input) {
    try { new URL(String(input), origin + '/'); return true; } catch (error) { return false; }
  };
  var bodyText = function (body) {
    if (body === undefined || body === null) return null;
    if (typeof body === 'string') return body;
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return body.toString();
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      var fields = [];
      body.forEach(function (value, name) { fields.push(name + '=' + (typeof value === 'string' ? value : '(file)')); });
      return fields.join('&');
    }
    if (typeof Blob !== 'undefined' && body instanceof Blob) return '(binary, ' + body.size + ' bytes)';
    if (typeof ArrayBuffer !== 'undefined' && (body instanceof ArrayBuffer || ArrayBuffer.isView(body))) return '(binary, ' + body.byteLength + ' bytes)';
    return String(body);
  };
  var pairs = function (headers) {
    var list = [];
    headers.forEach(function (value, name) { list.push([name, value]); });
    return list;
  };
  var names = function (value, upper) {
    return String(value || '').split(',').map(function (item) { item = item.trim(); return upper ? item.toUpperCase() : item.toLowerCase(); }).filter(Boolean);
  };
  var notSimple = function (pair) {
    if (SIMPLE_HEADERS.indexOf(pair[0]) < 0) return true;
    return pair[0] === 'content-type' && SIMPLE_TYPES.indexOf(pair[1].split(';')[0].trim().toLowerCase()) < 0;
  };
  var notFound = function (method, path) {
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot ' + method + ' ' + path + '</pre>\n</body>\n</html>\n';
  };

  /* The route for a request (the first whose method, address, query and body patterns fit), and its answer for this
     call, with which route and answer it was (-1: none). */
  var answerFor = function (method, url, body) {
    var place = placeOf(method, url);
    for (var i = 0; i < routes.length; i++) {
      var route = routes[i];
      if (route.method + ' ' + route.where !== place) continue;
      if (route.query !== null && !new RegExp(route.query).test(url.search.slice(1))) continue;
      if (route.body !== null && !new RegExp(route.body).test(body === null ? '' : body)) continue;
      var index = Math.min(calls[i], route.answers.length - 1);
      calls[i] += 1;
      return { answer: route.answers[index], route: i, index: index };
    }
    if (hosts.indexOf(url.origin) < 0) return { answer: { fail: 'network', error: 'net::ERR_NAME_NOT_RESOLVED', delay: config.delay }, route: -1, index: -1 };
    return { answer: { status: 404, statusText: 'Not Found', headers: { 'content-type': 'text/html; charset=utf-8' }, body: notFound(method, url.pathname), delay: config.delay }, route: -1, index: -1 };
  };

  /* Why the browser keeps another origin's answer from the app (Chrome's wording), or null when the answer allows it. */
  var corsProblem = function (href, method, headers, answer, preflight) {
    var blocked = "Access to fetch at '" + href + "' from origin '" + origin + "' has been blocked by CORS policy: ";
    var lead = blocked + (preflight ? "Response to preflight request doesn't pass access control check: " : '');
    var allowed = answer.headers['access-control-allow-origin'];
    if (!allowed) return lead + "No 'Access-Control-Allow-Origin' header is present on the requested resource." + OPAQUE;
    if (allowed !== '*' && allowed !== origin) return lead + "The 'Access-Control-Allow-Origin' header has a value '" + allowed + "' that is not equal to the supplied origin. Have the server send the header with a valid value, or, if an opaque response serves your needs, set the request's mode to 'no-cors' to fetch the resource with CORS disabled.";
    if (!preflight) return null;
    var methods = names(answer.headers['access-control-allow-methods'], true);
    if (SIMPLE_METHODS.indexOf(method) < 0 && methods.indexOf(method) < 0 && methods.indexOf('*') < 0) return blocked + 'Method ' + method + ' is not allowed by Access-Control-Allow-Methods in preflight response.';
    var allowedHeaders = names(answer.headers['access-control-allow-headers'], false);
    for (var i = 0; i < headers.length; i++) {
      if (notSimple(headers[i]) && allowedHeaders.indexOf(headers[i][0]) < 0 && allowedHeaders.indexOf('*') < 0) return blocked + 'Request header field ' + headers[i][0] + ' is not allowed by Access-Control-Allow-Headers in preflight response.';
    }
    return null;
  };

  var toResponse = function (answer, headers, href, type) {
    var response = new Response(answer.body, { status: answer.status, statusText: answer.statusText, headers: headers });
    Object.defineProperty(response, 'url', { value: href });
    Object.defineProperty(response, 'type', { value: type });
    return response;
  };
  var opaqueResponse = function () {
    var response = new Response(null);
    Object.defineProperty(response, 'status', { value: 0 });
    Object.defineProperty(response, 'ok', { value: false });
    Object.defineProperty(response, 'statusText', { value: '' });
    Object.defineProperty(response, 'type', { value: 'opaque' });
    Object.defineProperty(response, 'url', { value: '' });
    return response;
  };

  var fetch = function (input, init) {
    var stack = String(new Error().stack || '');
    var failed = new TypeError('Failed to fetch');
    var isRequest = typeof Request !== 'undefined' && input instanceof Request;
    if (!isRequest && !parses(input)) return Promise.reject(new TypeError(FETCH + 'Failed to parse URL from ' + String(input)));
    var request;
    try {
      request = new Request(isRequest ? input : new URL(String(input), origin + '/').href, init);
    } catch (error) {
      var message = error && error.message ? String(error.message).replace("Failed to construct 'Request': ", '') : String(error);
      return Promise.reject(new TypeError(FETCH + message));
    }
    var url = new NativeURL(request.url);
    var href = url.href;
    var method = request.method;
    var body = init && init.body !== undefined && init.body !== null ? bodyText(init.body) : null;
    var headers = pairs(request.headers);
    var cross = url.origin !== origin;
    var noCors = request.mode === 'no-cors';
    var preflight = cross && !noCors && (SIMPLE_METHODS.indexOf(method) < 0 || headers.some(notSimple));
    var id = nextId++;
    sent[sentCount] = { place: placeOf(method, url), body: body };
    sentCount += 1;
    hooks.post({ type: 'request', id: id, method: method, url: href, headers: headers, body: body, stack: stack });
    var found = answerFor(method, url, body);
    var answer = found.answer;
    if (hooks.sent) hooks.sent(id, answer.delay);
    var started = hooks.now();
    var startAt = serverNow;
    /* chapter 7: the shop's own server names the request and logs its answer (another origin's server is not ours) */
    var logged = !!logs && !cross && !answer.fail;
    var answerHeaders = {};
    if (!answer.fail) {
      Object.keys(answer.headers).forEach(function (name) { answerHeaders[name] = answer.headers[name]; });
      if (logged) answerHeaders['x-request-id'] = 'req-' + (logs.first + id - 1);
    }
    var signal = init && init.signal ? init.signal : null;
    pending += 1;
    return new Promise(function (resolve, reject) {
      var open = true;
      var timer = null;
      /* a message is made whole, never changed afterwards */
      var report = function (status, statusText, headers, body, failure) {
        hooks.post({ type: 'response', id: id, status: status, statusText: statusText, headers: headers, body: body, failure: failure, time: Math.max(0, Math.round(hooks.now() - started)) });
      };
      var netlog = function (text, at) { hooks.post({ type: 'netlog', text: text, stack: at }); };
      var onAbort = function () {
        if (!close()) return;
        if (hooks.aborted) hooks.aborted(id);
        report(null, '', [], null, 'aborted');
        reject(signal.reason !== undefined ? signal.reason : new DOMException('signal is aborted without reason', 'AbortError'));
      };
      var close = function () {
        if (!open) return false;
        open = false;
        pending -= 1;
        if (timer !== null) clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
        return true;
      };
      var arrive = function () {
        if (!close()) return;
        if (hooks.arrived) hooks.arrived(id);
        var at = startAt + answer.delay;
        if (at > serverNow) serverNow = at;
        if (logged) hooks.post({ type: 'serverlog', id: id, route: found.route, answer: found.index, status: answer.status, at: at, time: answer.delay });
        if (answer.fail) {
          netlog(method + ' ' + href + ' ' + answer.error, stack);
          report(null, '', [], null, 'network');
          reject(failed);
          return;
        }
        var headerPairs = Object.keys(answerHeaders).map(function (name) { return [name, answerHeaders[name]]; });
        var problem = cross && !noCors ? corsProblem(href, method, headers, answer, preflight) : null;
        if (problem) {
          netlog(problem, '');
          netlog(method + ' ' + href + ' net::ERR_FAILED' + (preflight ? '' : ' ' + answer.status + ' (' + answer.statusText + ')'), stack);
          report(preflight ? null : answer.status, preflight ? '' : answer.statusText, preflight ? [] : headerPairs, null, 'cors');
          reject(failed);
          return;
        }
        report(answer.status, answer.statusText, headerPairs, answer.body, null);
        if (answer.status >= 400) netlog(method + ' ' + href + ' ' + answer.status + ' (' + answer.statusText + ')', stack);
        resolve(cross && noCors ? opaqueResponse() : toResponse(answer, answerHeaders, href, cross ? 'cors' : 'basic'));
      };
      if (signal && signal.aborted) { onAbort(); return; }
      if (signal) signal.addEventListener('abort', onAbort);
      timer = setTimeout(arrive, answer.delay);
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
    for (var from = 0; ;) {
      var dot = indexOfText(path, '.', from);
      var part = dot < 0 ? sliceText(path, from) : sliceText(path, from, dot);
      if (value === null || typeof value !== 'object' || !hasOwn(value, part)) return null;
      value = value[part];
      if (dot < 0) break;
      from = dot + 1;
    }
    if (value === null || typeof value === 'string' || typeof value === 'number') return value;
    return jsonText(value);
  };
  /* The requests sent to a place so far, oldest first. */
  var sentTo = function (key, each) {
    var place = keyOf(key);
    for (var i = 0; i < sentCount; i++) if (sent[i].place === place) each(sent[i]);
  };

  return {
    fetch: fetch,
    pending: function () { return pending; },
    count: function (key) {
      var count = 0;
      sentTo(key, function () { count += 1; });
      return count;
    },
    sent: function (key, path) {
      var last = null;
      sentTo(key, function (each) { last = each; });
      if (!last || last.body === null) return null;
      return path ? readPath(last.body, path) : last.body;
    }
  };
})`
