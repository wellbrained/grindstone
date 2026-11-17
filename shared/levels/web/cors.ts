// The browser's CORS rules for the Web fundamentals track (ADR 0009; docs/features/levels.md "The CORS model"): a pure
// model of what the Fetch Living Standard (https://fetch.spec.whatwg.org/) says a browser does with a request from a page
// to another origin, and of how Chrome words a refusal. No request leaves the sealed frame (its policy refuses them all),
// so this model is the browser here: it decides which request needs a preflight, what the preflight asks, whether the
// server's answer lets the page read it, which headers of it the page sees, and what Chrome's Console says when not.
//
// Every function is pure: plain data in (methods, header lists as [name, value] pairs, a credentials mode), plain data
// out. JavaScript in a string, like the bridge (block comments only, every statement ends with a semicolon), because the
// fake backend runs it inside the sealed frame for every request; the unit tests run this very source on Node
// (test/unit/levels/web/cors.test.ts, each rule next to the spec text it follows).
//
// What it leaves out (the feature doc's "What the model simplifies"): redirects, Private Network Access, the preflight
// cache (every preflighted request sends its own), `Range` as a safelisted header, `Vary` (nothing is cached in chapter
// 1), and the response tainting of anything that is not `fetch`. Where Chrome departs from the spec (it lets `*` in
// Allow-Headers cover Authorization without credentials), the model follows the spec.

/** A header as the model takes it: a name (any case) and a value. */
export type CorsHeader = [name: string, value: string]

/** How a request asks to be treated: `fetch`'s `mode` and `credentials` options. */
export type CorsMode = 'cors' | 'no-cors' | 'same-origin'
export type CredentialsMode = 'omit' | 'same-origin' | 'include'

/** A request as the CORS rules see it. */
export interface CorsRequest {
  /** The page's origin, `https://cornerbakery.shop` (the request's origin). */
  origin: string
  method: string
  /** The headers the page set (forbidden ones already dropped, see `requestHeaders`). */
  headers: readonly CorsHeader[]
  credentials: CredentialsMode
}

/** An answer as the CORS rules see it: its status and every header the server sent, in order. */
export interface CorsResponse {
  status: number
  headers: readonly CorsHeader[]
}

/**
 * Why the browser refused (Chromium's `CorsError` names): `value` is the header's value it quotes, `method` or `header`
 * what the preflight did not allow.
 */
export type CorsProblem
  = | { code: 'MissingAllowOriginHeader' }
    | { code: 'WildcardOriginNotAllowed' }
    | { code: 'MultipleAllowOriginValues', value: string }
    | { code: 'InvalidAllowOriginValue', value: string }
    | { code: 'AllowOriginMismatch', value: string }
    | { code: 'InvalidAllowCredentials', value: string }
    | { code: 'PreflightInvalidStatus' }
    | { code: 'InvalidAllowMethodsPreflightResponse' }
    | { code: 'InvalidAllowHeadersPreflightResponse' }
    | { code: 'MethodDisallowedByPreflightResponse', method: string }
    | { code: 'HeaderDisallowedByPreflightResponse', header: string }

/** A refusal: why, and whether the preflight's answer was the one refused. */
export interface CorsRefusal {
  problem: CorsProblem
  preflight: boolean
}

export interface CorsModel {
  /** `GET`, `HEAD` and `POST` (Fetch: "CORS-safelisted method"). */
  isSafelistedMethod: (method: string) => boolean
  /** A header a page may set without a preflight (Fetch: "CORS-safelisted request-header"). */
  isSafelistedHeader: (name: string, value: string) => boolean
  /** A header no page may set (Fetch: "forbidden request-header"): `fetch` drops it without a word. */
  isForbiddenHeader: (name: string, value: string) => boolean
  /**
   * The headers a request really carries from what the page set: names in lower case, forbidden ones dropped, and in
   * `no-cors` mode every one that is not safelisted dropped too (the Headers object's "request-no-cors" guard).
   */
  requestHeaders: (headers: readonly CorsHeader[], mode: CorsMode) => CorsHeader[]
  /** The names a preflight has to ask about, lower case, sorted, once each (Fetch: "CORS-unsafe request-header names"). */
  unsafeHeaderNames: (headers: readonly CorsHeader[]) => string[]
  /** A cross-origin request in `cors` mode needs a preflight: a method that is not safelisted, or an unsafe header. */
  needsPreflight: (method: string, headers: readonly CorsHeader[]) => boolean
  /** The preflight's own headers (Fetch: "CORS-preflight request"): never a cookie, never the page's headers. */
  preflightHeaders: (request: CorsRequest) => CorsHeader[]
  /** Fetch's "CORS check" on an answer (and Chrome's order of looking): null when the page may read it. */
  check: (request: CorsRequest, response: CorsResponse) => CorsProblem | null
  /** The preflight's answer (Fetch: "CORS-preflight fetch", step 7): null when the real request may go. */
  checkPreflight: (request: CorsRequest, response: CorsResponse) => CorsProblem | null
  /** The headers of a readable cross-origin answer the page's code sees (Fetch: "CORS-filtered response"). */
  exposedHeaders: (response: CorsResponse, credentials: CredentialsMode) => CorsHeader[]
  /** What Chrome says after "has been blocked by CORS policy: ". */
  reason: (refusal: CorsRefusal) => string
  /** Chrome's whole Console line for a refused request. */
  consoleLine: (url: string, origin: string, refusal: CorsRefusal) => string
}

export const CORS_SOURCE = String.raw`(function () {
  'use strict';
  /* The built-ins the rules use, taken when the model is made (the web backend makes it with the bridge, before any of
     the app's code runs): a String.prototype or RegExp.prototype the app replaces later never changes a decision. No
     array or string method of the data is called; lists are walked by index. */
  var FP = Function.prototype;
  var uncurry = FP.bind.bind(FP.call);
  var lowerCase = uncurry(String.prototype.toLowerCase);
  var upperCase = uncurry(String.prototype.toUpperCase);
  var charCode = uncurry(String.prototype.charCodeAt);
  var sliceText = uncurry(String.prototype.slice);
  var exec = uncurry(RegExp.prototype.exec);
  var toText = String;
  /* Fetch, "CORS-safelisted method": a method that is GET, HEAD, or POST. */
  var SAFE_METHODS = ['GET', 'HEAD', 'POST'];
  /* Fetch, "forbidden request-header": a name that is one of these (or starts with proxy- or sec-). */
  var FORBIDDEN = ['accept-charset', 'accept-encoding', 'access-control-request-headers', 'access-control-request-method', 'connection', 'content-length', 'cookie', 'cookie2', 'date', 'dnt', 'expect', 'host', 'keep-alive', 'origin', 'referer', 'set-cookie', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'via'];
  var OVERRIDES = ['x-http-method', 'x-http-method-override', 'x-method-override'];
  var FORBIDDEN_METHODS = ['CONNECT', 'TRACE', 'TRACK'];
  var NO_CORS_NAMES = ['accept', 'accept-language', 'content-language', 'content-type'];
  /* Fetch, "CORS-safelisted response-header name": what a page sees of a cross-origin answer without Expose-Headers. */
  var SAFE_RESPONSE = ['cache-control', 'content-language', 'content-length', 'content-type', 'expires', 'last-modified', 'pragma'];
  var SAFE_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];
  var TOKEN = /^[!#$%&'*+.^_\x60|~0-9A-Za-z-]+$/;
  var LANGUAGE = /^[0-9A-Za-z *,\-.;=]*$/;
  /* What Chromium takes for a URL (GURL is valid): a scheme and a colon. */
  var SCHEME = /^[A-Za-z][A-Za-z0-9+.\-]*:/;
  var VALID = ' Have the server send the header with a valid value.';

  var lower = function (text) { return lowerCase(toText(text)); };
  var upper = function (text) { return upperCase(toText(text)); };
  var has = function (list, item) {
    for (var i = 0; i < list.length; i++) if (list[i] === item) return true;
    return false;
  };
  var append = function (list, item) { list[list.length] = item; };
  var startsWith = function (text, lead) { return sliceText(text, 0, lead.length) === lead; };
  var isSpace = function (character) { return character === ' ' || character === '\t'; };
  /* HTTP whitespace (spaces and tabs) off both ends, as the HTTP layer reads a header's value */
  var trim = function (text) {
    var from = 0;
    var to = text.length;
    while (from < to && isSpace(text[from])) from++;
    while (to > from && isSpace(text[to - 1])) to--;
    return sliceText(text, from, to);
  };
  /* comma-separated parts, each trimmed */
  var parts = function (text) {
    var list = [];
    var from = 0;
    for (var i = 0; i <= text.length; i++) {
      if (i < text.length && text[i] !== ',') continue;
      append(list, trim(sliceText(text, from, i)));
      from = i + 1;
    }
    return list;
  };
  var joined = function (list, between) {
    var text = '';
    for (var i = 0; i < list.length; i++) text += (i ? between : '') + list[i];
    return text;
  };
  /* an insertion sort of a few short names: no Array.prototype.sort */
  var sorted = function (list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var at = out.length;
      while (at > 0 && out[at - 1] > list[i]) { out[at] = out[at - 1]; at--; }
      out[at] = list[i];
    }
    return out;
  };

  var isSafelistedMethod = function (method) { return has(SAFE_METHODS, method); };

  /* Fetch, "CORS-unsafe request-header byte": a byte below 0x20 other than tab, or one of " ( ) : < > ? @ [ \ ] { } and DEL. */
  var UNSAFE_BYTES = '"():<>?@[\\]{}';
  var hasUnsafeByte = function (value) {
    for (var i = 0; i < value.length; i++) {
      var code = charCode(value, i);
      if ((code < 0x20 && code !== 0x09) || code === 0x7f) return true;
      for (var j = 0; j < UNSAFE_BYTES.length; j++) if (value[i] === UNSAFE_BYTES[j]) return true;
    }
    return false;
  };

  /* Fetch, "CORS-safelisted request-header" (name, value): longer than 128 bytes is never; then by name. Range is left
     out (the model treats it as unsafe). */
  var isSafelistedHeader = function (name, value) {
    value = toText(value);
    if (value.length > 128) return false;
    var key = lower(name);
    if (key === 'accept') return !hasUnsafeByte(value);
    if (key === 'accept-language' || key === 'content-language') return exec(LANGUAGE, value) !== null;
    if (key === 'content-type') {
      if (hasUnsafeByte(value)) return false;
      /* "Let mimeType be the result of parsing value ... If mimeType's essence is not one of ..." */
      var cut = value.length;
      for (var i = 0; i < value.length; i++) if (value[i] === ';') { cut = i; break; }
      return has(SAFE_TYPES, lower(trim(sliceText(value, 0, cut))));
    }
    return false;
  };

  var isForbiddenHeader = function (name, value) {
    var key = lower(name);
    if (has(FORBIDDEN, key) || startsWith(key, 'proxy-') || startsWith(key, 'sec-')) return true;
    /* "If name is X-HTTP-Method, X-HTTP-Method-Override, or X-Method-Override ... a forbidden method": forbidden. */
    if (!has(OVERRIDES, key)) return false;
    var methods = parts(toText(value));
    for (var i = 0; i < methods.length; i++) if (has(FORBIDDEN_METHODS, upper(methods[i]))) return true;
    return false;
  };

  var requestHeaders = function (headers, mode) {
    var kept = [];
    for (var i = 0; i < headers.length; i++) {
      var name = lower(headers[i][0]);
      var value = toText(headers[i][1]);
      if (isForbiddenHeader(name, value)) continue;
      /* Headers, "request-no-cors" guard: only a no-CORS-safelisted request-header may be set. */
      if (mode === 'no-cors' && !(has(NO_CORS_NAMES, name) && isSafelistedHeader(name, value))) continue;
      append(kept, [name, value]);
    }
    return kept;
  };

  /* Fetch, "CORS-unsafe request-header names": every name that is not safelisted, and, once the safelisted values add
     up to more than 1024 bytes, those too; "convert header names to a sorted-lowercase set". */
  var unsafeHeaderNames = function (headers) {
    var unsafe = [];
    var potentially = [];
    var size = 0;
    for (var i = 0; i < headers.length; i++) {
      var name = lower(headers[i][0]);
      var value = toText(headers[i][1]);
      if (!isSafelistedHeader(name, value)) append(unsafe, name);
      else {
        append(potentially, name);
        size += value.length;
      }
    }
    if (size > 1024) for (var k = 0; k < potentially.length; k++) append(unsafe, potentially[k]);
    var set = [];
    for (var j = 0; j < unsafe.length; j++) if (!has(set, unsafe[j])) append(set, unsafe[j]);
    return sorted(set);
  };

  /* Fetch, "main fetch": a request whose "use-CORS-preflight flag is set, or request's method is not a CORS-safelisted
     method or CORS-unsafe request-header names with request's header list is not empty" gets a preflight first. */
  var needsPreflight = function (method, headers) {
    return !isSafelistedMethod(method) || unsafeHeaderNames(headers).length > 0;
  };

  /* Fetch, "CORS-preflight fetch", steps 1 to 4: Accept: *\/*, Access-Control-Request-Method: the method, and
     Access-Control-Request-Headers: the unsafe names "separated from each other by 0x2C (,)" when there are any. The
     preflight goes without credentials (no cookie), and the browser adds the Origin. */
  var preflightHeaders = function (request) {
    var list = [['accept', '*' + '/' + '*'], ['access-control-request-method', request.method]];
    var names = unsafeHeaderNames(request.headers);
    if (names.length) append(list, ['access-control-request-headers', joined(names, ',')]);
    append(list, ['origin', request.origin]);
    return list;
  };

  /* Fetch, "get, decode, and split" in short: a header's values, each without spaces or tabs at its ends (as the HTTP
     layer reads them), combined with ", " (null: the answer has none). */
  var getHeader = function (headers, name) {
    var values = [];
    for (var i = 0; i < headers.length; i++) if (lower(headers[i][0]) === name) append(values, trim(toText(headers[i][1])));
    return values.length ? joined(values, ', ') : null;
  };

  /* Fetch, "CORS check" in Chromium's order (cors.cc, CheckAccessInternal):
     - "If request's credentials mode is not "include" and origin is *, return success" (and with "include", * is
       refused before anything else);
     - "If origin is null, return failure";
     - "If the result of byte-serializing a request origin with request is not origin, then return failure" (Chrome first
       tells several values, a value that is no URL to it (no scheme) and a different origin apart);
     - "If request's credentials mode is not "include", then return success";
     - "If credentials is true, then return success" (Access-Control-Allow-Credentials, case-sensitive). */
  var check = function (request, response) {
    var allowed = getHeader(response.headers, 'access-control-allow-origin');
    if (allowed === '*') return request.credentials === 'include' ? { code: 'WildcardOriginNotAllowed' } : null;
    if (allowed === null) return { code: 'MissingAllowOriginHeader' };
    if (allowed !== request.origin) {
      for (var i = 0; i < allowed.length; i++) if (allowed[i] === ' ' || allowed[i] === ',') return { code: 'MultipleAllowOriginValues', value: allowed };
      if (allowed !== 'null' && exec(SCHEME, allowed) === null) return { code: 'InvalidAllowOriginValue', value: allowed };
      return { code: 'AllowOriginMismatch', value: allowed };
    }
    if (request.credentials !== 'include') return null;
    var credentials = getHeader(response.headers, 'access-control-allow-credentials');
    return credentials === 'true' ? null : { code: 'InvalidAllowCredentials', value: credentials === null ? '' : credentials };
  };

  /* Fetch, "extract header list values" for Allow-Methods and Allow-Headers: comma-separated, each a token (a method or
     a header name); null when one is not (Chrome: "Cannot parse ..."). Empty items are skipped. */
  var tokens = function (value) {
    if (value === null) return [];
    var items = parts(value);
    var list = [];
    for (var i = 0; i < items.length; i++) {
      if (!items[i]) continue;
      if (exec(TOKEN, items[i]) === null) return null;
      append(list, items[i]);
    }
    return list;
  };

  /* Fetch, "CORS-preflight fetch", step 7: "If a CORS check for request and response returns success and response's
     status is an ok status" (200 to 299; Chrome looks at the Allow-Origin first), then the methods and headers it allows:
     - "If request's method is not in methods, request's method is not a CORS-safelisted method, and request's
       credentials mode is "include" or methods does not contain *, then return a network error" (case-sensitive);
     - "If one of request's header list's names is a CORS non-wildcard request-header name [Authorization] and is not a
       byte-case-insensitive match for an item in headerNames, then return a network error";
     - "For each unsafeName ...: If unsafeName is not a byte-case-insensitive match for an item in headerNames and, either
       request's credentials mode is "include" or headerNames does not contain *, return a network error". */
  var checkPreflight = function (request, response) {
    var access = check(request, response);
    if (access) return access;
    if (response.status < 200 || response.status > 299) return { code: 'PreflightInvalidStatus' };
    var methods = tokens(getHeader(response.headers, 'access-control-allow-methods'));
    if (methods === null) return { code: 'InvalidAllowMethodsPreflightResponse' };
    var names = tokens(getHeader(response.headers, 'access-control-allow-headers'));
    if (names === null) return { code: 'InvalidAllowHeadersPreflightResponse' };
    var credentialed = request.credentials === 'include';
    if (!has(methods, request.method) && !isSafelistedMethod(request.method) && (credentialed || !has(methods, '*'))) {
      return { code: 'MethodDisallowedByPreflightResponse', method: request.method };
    }
    var allowed = [];
    for (var n = 0; n < names.length; n++) append(allowed, lower(names[n]));
    var unsafe = unsafeHeaderNames(request.headers);
    for (var i = 0; i < request.headers.length; i++) {
      if (lower(request.headers[i][0]) === 'authorization' && !has(allowed, 'authorization')) return { code: 'HeaderDisallowedByPreflightResponse', header: 'authorization' };
    }
    for (var j = 0; j < unsafe.length; j++) {
      if (!has(allowed, unsafe[j]) && (credentialed || !has(allowed, '*'))) return { code: 'HeaderDisallowedByPreflightResponse', header: unsafe[j] };
    }
    return null;
  };

  /* Fetch, "CORS-filtered response": the safelisted response-header names, and those Access-Control-Expose-Headers
     names ("*" means every one, unless the request was credentialed); Set-Cookie never. */
  var exposedHeaders = function (response, credentials) {
    var exposed = tokens(getHeader(response.headers, 'access-control-expose-headers')) || [];
    var names = [];
    for (var n = 0; n < exposed.length; n++) append(names, lower(exposed[n]));
    var every = credentials !== 'include' && has(names, '*');
    var kept = [];
    for (var i = 0; i < response.headers.length; i++) {
      var name = lower(response.headers[i][0]);
      if (name === 'set-cookie' || name === 'set-cookie2') continue;
      if (has(SAFE_RESPONSE, name) || has(names, name) || every) append(kept, [name, toText(response.headers[i][1])]);
    }
    return kept;
  };

  /* Chrome's words for each refusal (cors_error_string.cc, as Chromium 158 says them), after "has been blocked by CORS
     policy: ". */
  var reason = function (refusal) {
    var problem = refusal.problem;
    var lead = refusal.preflight ? "Response to preflight request doesn't pass access control check: " : '';
    switch (problem.code) {
      case 'MissingAllowOriginHeader': return lead + "No 'Access-Control-Allow-Origin' header is present on the requested resource.";
      case 'WildcardOriginNotAllowed': return lead + "The value of the 'Access-Control-Allow-Origin' header in the response must not be the wildcard '*' when the request's credentials mode is 'include'.";
      case 'MultipleAllowOriginValues': return lead + "The 'Access-Control-Allow-Origin' header contains multiple values '" + problem.value + "', but only one is allowed." + VALID;
      case 'InvalidAllowOriginValue': return lead + "The 'Access-Control-Allow-Origin' header contains the invalid value '" + problem.value + "'." + VALID;
      case 'AllowOriginMismatch': return lead + "The 'Access-Control-Allow-Origin' header has a value '" + problem.value + "' that is not equal to the supplied origin." + VALID;
      case 'InvalidAllowCredentials': return lead + "The value of the 'Access-Control-Allow-Credentials' header in the response is '" + problem.value + "' which must be 'true' when the request's credentials mode is 'include'.";
      case 'PreflightInvalidStatus': return lead + 'It does not have HTTP ok status.';
      case 'InvalidAllowMethodsPreflightResponse': return 'Cannot parse Access-Control-Allow-Methods response header field in preflight response.';
      case 'InvalidAllowHeadersPreflightResponse': return 'Cannot parse Access-Control-Allow-Headers response header field in preflight response.';
      case 'MethodDisallowedByPreflightResponse': return 'Method ' + problem.method + ' is not allowed by Access-Control-Allow-Methods in preflight response.';
      case 'HeaderDisallowedByPreflightResponse': return 'Request header field ' + problem.header + ' is not allowed by Access-Control-Allow-Headers in preflight response.';
    }
    return 'The request was refused.';
  };

  var consoleLine = function (url, origin, refusal) {
    return "Access to fetch at '" + url + "' from origin '" + origin + "' has been blocked by CORS policy: " + reason(refusal);
  };

  return {
    isSafelistedMethod: isSafelistedMethod,
    isSafelistedHeader: isSafelistedHeader,
    isForbiddenHeader: isForbiddenHeader,
    requestHeaders: requestHeaders,
    unsafeHeaderNames: unsafeHeaderNames,
    needsPreflight: needsPreflight,
    preflightHeaders: preflightHeaders,
    check: check,
    checkPreflight: checkPreflight,
    exposedHeaders: exposedHeaders,
    reason: reason,
    consoleLine: consoleLine
  };
})`
