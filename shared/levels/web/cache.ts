// HTTP caching for the Web fundamentals track (ADR 0009, chapter 4; docs/features/levels.md "The cache model"): two
// caches between the page and server.js. **The browser's HTTP cache** (a private cache: Lena's browser) follows Chrome's
// network stack where it reads an answer (`net/http/http_response_headers.cc`: `no-cache`, `no-store`, `Pragma: no-cache`
// and `Vary: *` make an answer stale at once, `max-age`, then `Expires`, then 10 % of the time since `Last-Modified`
// for a 200, 203 or 206, 300, 301, 308 and 410 fresh for ever; its age from `Age` and `Date`; the headers a 304 may not
// change). **The CDN** in front of the API (a shared cache) follows RFC 9111 (https://www.rfc-editor.org/rfc/rfc9111):
// `s-maxage` before `max-age`, `private` never kept, an answer to a request with `Authorization` only with `public`,
// `s-maxage` or `must-revalidate`, `Vary` keeping one copy per value of the named request headers, `Age` on what it
// serves, a 304 freshening the stored copy, an unsafe request taking the address's copies away.
//
// JavaScript in a string, like the cookie model (block comments only, every statement ends with a semicolon), because the
// web backend runs it inside the sealed frame; the unit tests run this very source on Node (test/unit/levels/web/
// cache.test.ts, each rule beside the RFC's text or Chrome's code). Pure but for the caches, which hold one load's copies
// and read the time from the clock they are given. Hardened like the cookie jar: every built-in taken when it is made,
// lists written with descriptors that have no prototype, optional fields read as own only, copies handed out.
//
// What it leaves out (the feature doc's "What the model simplifies"): `stale-while-revalidate` and `stale-if-error`,
// `immutable` (Chrome only skips revalidation of it on a reload, and the page here never reloads itself), request
// directives at the CDN (RFC 9111 makes `no-cache` and `max-age` in a request a preference: this CDN ignores them, as
// most do), partial content (`Range`, 206), HEAD, the memory cache and the back/forward cache, a cache's size limits
// beyond a count of copies, `Clear-Site-Data`, and purging a CDN by hand.

/** How many copies each cache keeps at most (the oldest go first), and how many CDN log lines a load keeps. */
export const CACHE_LIMITS = { entries: 100, log: 200 } as const

/** Statuses RFC 9111 lets a cache keep without an explicit lifetime (RFC 9110 15.1, "heuristically cacheable"). */
export const HEURISTIC_STATUSES = [200, 203, 204, 206, 300, 301, 308, 404, 405, 410, 414, 501] as const

/** Why a cache did not keep an answer (Grindstone's own words: neither Chrome nor a CDN says it in a panel). */
export type CacheRefusal = 'method' | 'no-store' | 'private' | 'authorization' | 'no-lifetime'

/** A copy as the caches hand it out (a copy, never the cache's own). */
export interface CachedCopy {
  id: number
  url: string
  status: number
  headers: [string, string][]
  body: string | null
  /** The names of the request headers it was kept for (`Vary`), lower case; ['*'] never matches. */
  vary: string[]
  /** The values of those headers in the request it was kept for (null: the request had none). */
  varyValues: (string | null)[]
  /** When the answer arrived (scripted ms). */
  stored: number
  /** Who asked for it (the CDN: 'Lena', 'Sam', a site's origin …). */
  by: string
  /** How often it was used since (served fresh, or after a 304). */
  hits: number
  /** Its age now (ms) and how long it is fresh for in all (ms; Infinity: for ever). */
  age: number
  lifetime: number
  fresh: boolean
}

export interface HttpCache {
  /** The copy a request may use, by its address and its headers (Vary), or null; never a live copy. */
  lookup: (url: string, headers: readonly (readonly [string, string])[]) => CachedCopy | null
  /** Keeps an answer (a copy of it) when it may: { stored, reason }; a copy for the same request is replaced. */
  store: (url: string, request: { method: string, headers: readonly (readonly [string, string])[] }, answer: { status: number, headers: readonly (readonly [string, string])[], body: string | null }, by: string, at?: number) => { stored: boolean, reason: CacheRefusal | null }
  /** A 304 for this copy: its headers updated (RFC 9111 3.2), its age from now on (4.3.4). */
  freshen: (id: number, headers: readonly (readonly [string, string])[]) => CachedCopy | null
  /** The copy was used once more. */
  hit: (id: number) => void
  /** Every copy of this address goes (an unsafe request's answer, RFC 9111 4.4). */
  invalidate: (url: string) => number
  list: () => CachedCopy[]
}

export interface CacheModel {
  /** Cache-Control's directives: lower-case names to their value (a quoted one unquoted) or true; the first of a name wins. */
  directives: (value: string) => Record<string, string | true>
  /** How long an answer is fresh for (ms; Infinity: for ever), as a private (Chrome's) or a shared (RFC 9111) cache reads it. */
  lifetime: (answer: { status: number, headers: readonly (readonly [string, string])[] }, shared: boolean, received: number) => number
  /** Its age at `now` (ms), from Age and Date (RFC 9111 4.2.3, as Chrome counts it). */
  age: (headers: readonly (readonly [string, string])[], received: number, now: number) => number
  /** Why a cache may not keep this answer, or null. */
  refusal: (request: { method: string, headers: readonly (readonly [string, string])[] }, answer: { status: number, headers: readonly (readonly [string, string])[] }, shared: boolean) => CacheRefusal | null
  /** The request headers a revalidation adds for this copy: If-None-Match from its ETag, If-Modified-Since from its Last-Modified. */
  validators: (headers: readonly (readonly [string, string])[]) => [string, string][]
  /** A conditional request a cache answers itself (RFC 9111 4.3.2): true when its copy has not changed (a 304). */
  notModified: (request: readonly (readonly [string, string])[], copy: readonly (readonly [string, string])[]) => boolean
  createCache: (options: { shared: boolean, clock: () => number }) => HttpCache
  /** Grindstone's words for why it was not kept. */
  reason: (refusal: CacheRefusal, shared: boolean) => string
  /** A header's combined value (several lines joined with ", "), or null. */
  headerValue: (headers: readonly (readonly [string, string])[], name: string) => string | null
}

export const CACHE_SOURCE = String.raw`(function () {
  'use strict';
  var FP = Function.prototype;
  var uncurry = FP.bind.bind(FP.call);
  var lowerCase = uncurry(String.prototype.toLowerCase);
  var indexOfText = uncurry(String.prototype.indexOf);
  var sliceText = uncurry(String.prototype.slice);
  var codeAt = uncurry(String.prototype.charCodeAt);
  var hasOwn = uncurry(Object.prototype.hasOwnProperty);
  var execPattern = uncurry(RegExp.prototype.exec);
  var createObject = Object.create;
  var defineProperty = Object.defineProperty;
  var parseDate = Date.parse;
  var mathFloor = Math.floor;
  var mathMax = Math.max;
  var toText = String;
  var INFINITY = 1 / 0;
  var LIMITS = { entries: ${CACHE_LIMITS.entries} };
  var HEURISTIC = [${HEURISTIC_STATUSES.join(', ')}];
  /* A cap RFC 9111 1.2.2 sets for delta-seconds: a larger value counts as 2147483648. */
  var MAX_DELTA = 2147483648;
  /* the headers a 304 does not change in Chrome's copy (HttpResponseHeaders::Update: kNonUpdatedHeaders, and the prefixes
     x-content- and x-webkit-); RFC 9111 3.2 leaves only Content-Length out, as the CDN does */
  var NOT_UPDATED = ['connection', 'proxy-connection', 'keep-alive', 'www-authenticate', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-location', 'content-md5', 'etag', 'content-encoding', 'content-range', 'content-type', 'content-length', 'x-frame-options', 'x-xss-protection'];
  var DIGITS = /^[0-9]+$/;

  var put = function (list, index, item) {
    var descriptor = createObject(null);
    descriptor.value = item;
    descriptor.writable = true;
    descriptor.enumerable = true;
    descriptor.configurable = true;
    defineProperty(list, index, descriptor);
  };
  var push = function (list, item) { put(list, list.length, item); };
  var has = function (list, item) {
    for (var i = 0; i < list.length; i++) if (list[i] === item) return true;
    return false;
  };
  var isSpace = function (code) { return code === 32 || code === 9; };
  var trim = function (text) {
    var from = 0;
    var to = text.length;
    while (from < to && isSpace(codeAt(text, from))) from++;
    while (to > from && isSpace(codeAt(text, to - 1))) to--;
    return sliceText(text, from, to);
  };
  /* a list header split at its commas (not inside a quoted string), each part trimmed, empty parts left out */
  var splitList = function (text) {
    var parts = [];
    var from = 0;
    var quoted = false;
    for (var i = 0; i <= text.length; i++) {
      var code = i < text.length ? codeAt(text, i) : 44;
      if (code === 34) quoted = !quoted;
      else if (code === 92 && quoted) i++;
      else if (code === 44 && !quoted) {
        var part = trim(sliceText(text, from, i));
        if (part) push(parts, part);
        from = i + 1;
      }
    }
    return parts;
  };
  /* the combined value of a header (several lines joined with ", "), or null */
  var headerValue = function (headers, name) {
    var value = null;
    for (var i = 0; i < headers.length; i++) {
      if (lowerCase(toText(headers[i][0])) !== name) continue;
      value = value === null ? toText(headers[i][1]) : value + ', ' + toText(headers[i][1]);
    }
    return value;
  };
  var copyHeaders = function (headers) {
    var out = [];
    for (var i = 0; i < headers.length; i++) push(out, [lowerCase(toText(headers[i][0])), toText(headers[i][1])]);
    return out;
  };

  /* Cache-Control (RFC 9111 5.2): directive names in any case, a value after =, quoted or not; the first of a name wins
     (4.2.1: "either the first occurrence should be used or the response should be considered stale"; Chrome reads the
     first) */
  var directives = function (value) {
    var found = createObject(null);
    var parts = splitList(toText(value === null || value === undefined ? '' : value));
    for (var i = 0; i < parts.length; i++) {
      var at = indexOfText(parts[i], '=');
      var name = lowerCase(trim(at < 0 ? parts[i] : sliceText(parts[i], 0, at)));
      if (!name || hasOwn(found, name)) continue;
      if (at < 0) { found[name] = true; continue; }
      var raw = trim(sliceText(parts[i], at + 1));
      if (raw.length >= 2 && codeAt(raw, 0) === 34 && codeAt(raw, raw.length - 1) === 34) {
        var unquoted = '';
        for (var k = 1; k < raw.length - 1; k++) {
          if (codeAt(raw, k) === 92 && k + 1 < raw.length - 1) k++;
          unquoted += raw[k];
        }
        raw = unquoted;
      }
      found[name] = raw;
    }
    return found;
  };
  var directivesOf = function (headers) { return directives(headerValue(headers, 'cache-control')); };
  /* Chrome's HasHeaderValue: one of the header's comma-separated values is this token exactly (any case) */
  var hasToken = function (headers, name, token) {
    var value = headerValue(headers, name);
    if (value === null) return false;
    var parts = splitList(value);
    for (var i = 0; i < parts.length; i++) if (lowerCase(parts[i]) === token) return true;
    return false;
  };
  /* delta-seconds (RFC 9111 1.2.2): digits only; more than the cap counts as the cap; anything else is invalid (NaN) */
  var deltaSeconds = function (value) {
    if (value === true || execPattern(DIGITS, toText(value)) === null) return NaN;
    var text = toText(value);
    var number = 0;
    for (var i = 0; i < text.length; i++) {
      number = number * 10 + (codeAt(text, i) - 48);
      if (number > MAX_DELTA) return MAX_DELTA;
    }
    return number;
  };
  var dateOf = function (value) {
    if (value === null) return NaN;
    var time = parseDate(toText(value));
    return time === time ? time : NaN;
  };

  /* How long an answer is fresh for, in ms (RFC 9111 4.2.1; for a private cache, Chrome's GetFreshnessLifetimes). */
  var lifetime = function (answer, shared, received) {
    var headers = answer.headers;
    var cc = directivesOf(headers);
    var date = dateOf(headerValue(headers, 'date'));
    if (date !== date) date = received;
    var expires = dateOf(headerValue(headers, 'expires'));
    var lastModified = dateOf(headerValue(headers, 'last-modified'));
    var seconds;
    if (shared) {
      /* 5.2.2.4: a stored no-cache answer is never used without revalidation (qualified or not: a cache may treat a
         qualified one as unqualified) */
      if (hasOwn(cc, 'no-cache')) return 0;
      if (hasOwn(cc, 's-maxage')) { seconds = deltaSeconds(cc['s-maxage']); return seconds === seconds ? seconds * 1000 : 0; }
      if (hasOwn(cc, 'max-age')) { seconds = deltaSeconds(cc['max-age']); return seconds === seconds ? seconds * 1000 : 0; }
      /* 5.3: an Expires that doesn't parse ("0") is a time in the past */
      if (headerValue(headers, 'expires') !== null) return expires === expires ? mathMax(0, expires - date) : 0;
      /* 4.2.2: a heuristic only for a status that allows one (or public), from Last-Modified (10 %, as the RFC suggests) */
      if ((has(HEURISTIC, answer.status) || hasOwn(cc, 'public')) && lastModified === lastModified && lastModified <= date) return mathFloor((date - lastModified) / 10);
      return 0;
    }
    /* Chrome: "For backwards compat, we treat Pragma: no-cache as a synonym for Cache-Control: no-cache"; Vary: * is never usable */
    if (hasToken(headers, 'cache-control', 'no-cache') || hasToken(headers, 'cache-control', 'no-store') || hasToken(headers, 'pragma', 'no-cache') || hasToken(headers, 'vary', '*')) return 0;
    var mustRevalidate = hasToken(headers, 'cache-control', 'must-revalidate');
    if (hasOwn(cc, 'max-age')) { seconds = deltaSeconds(cc['max-age']); return seconds === seconds ? seconds * 1000 : 0; }
    if (expires === expires) return expires > date ? expires - date : 0;
    if ((answer.status === 200 || answer.status === 203 || answer.status === 206) && !mustRevalidate && lastModified === lastModified && lastModified <= date) return mathFloor((date - lastModified) / 10);
    if (answer.status === 300 || answer.status === 301 || answer.status === 308 || answer.status === 410) return INFINITY;
    return 0;
  };

  /* The age of a copy (RFC 9111 4.2.3, as Chrome's GetCurrentAge counts it): the Age it came with, or how much older
     than its Date it arrived, whichever is more, plus how long it has been kept. The network here takes no scripted time,
     so the request was sent when the answer arrived. */
  var age = function (headers, received, now) {
    var date = dateOf(headerValue(headers, 'date'));
    if (date !== date) date = received;
    var told = deltaSeconds(trim(toText(headerValue(headers, 'age') || '')));
    var ageValue = told === told ? told * 1000 : 0;
    return mathMax(mathMax(0, received - date), ageValue) + mathMax(0, now - received);
  };

  /* Whether a cache may keep an answer (RFC 9111 3, 3.5): only GET here; never no-store; a shared cache never private,
     nor an answer to a request with Authorization unless public, s-maxage or must-revalidate allow it; and only with a
     lifetime of its own (max-age, s-maxage, Expires, public, private for a private cache) or a status a heuristic may
     use. Chrome keeps no Set-Cookie line with a copy (it stores the headers without them); the CDN keeps it. */
  var refusal = function (request, answer, shared) {
    if (request.method !== 'GET') return 'method';
    var cc = directivesOf(answer.headers);
    if (hasOwn(cc, 'no-store') || (shared && hasOwn(directivesOf(request.headers), 'no-store'))) return 'no-store';
    if (shared && hasOwn(cc, 'private')) return 'private';
    if (shared && headerValue(request.headers, 'authorization') !== null && !hasOwn(cc, 'public') && !hasOwn(cc, 's-maxage') && !hasOwn(cc, 'must-revalidate')) return 'authorization';
    var explicit = hasOwn(cc, 'public') || hasOwn(cc, 'max-age') || headerValue(answer.headers, 'expires') !== null || (shared ? hasOwn(cc, 's-maxage') : hasOwn(cc, 'private'));
    if (!explicit && !has(HEURISTIC, answer.status)) return 'no-lifetime';
    return null;
  };

  var validators = function (headers) {
    var out = [];
    var etag = headerValue(headers, 'etag');
    var lastModified = headerValue(headers, 'last-modified');
    if (etag !== null) push(out, ['if-none-match', etag]);
    if (lastModified !== null) push(out, ['if-modified-since', lastModified]);
    return out;
  };
  /* an entity-tag without W/ (the weak comparison of RFC 9110 8.8.3.2) */
  var opaque = function (tag) {
    tag = trim(tag);
    return sliceText(tag, 0, 2) === 'W/' ? sliceText(tag, 2) : tag;
  };
  /* RFC 9111 4.3.2 with RFC 9110 13.1.2 and 13.1.3: If-None-Match (weak comparison, * matches any copy) decides when it
     is there; else If-Modified-Since against the copy's Last-Modified */
  var notModified = function (request, copy) {
    var noneMatch = headerValue(request, 'if-none-match');
    if (noneMatch !== null) {
      var tag = headerValue(copy, 'etag');
      var tags = splitList(noneMatch);
      for (var i = 0; i < tags.length; i++) {
        if (tags[i] === '*') return true;
        if (tag !== null && opaque(tags[i]) === opaque(tag)) return true;
      }
      return false;
    }
    var since = dateOf(headerValue(request, 'if-modified-since'));
    var modified = dateOf(headerValue(copy, 'last-modified'));
    return since === since && modified === modified && modified <= since;
  };

  /* Vary (RFC 9111 4.1): the request headers it names, and their values in a request, whitespace around commas
     normalised; * never matches */
  var varyNames = function (headers) {
    var value = headerValue(headers, 'vary');
    var names = [];
    if (value === null) return names;
    var parts = splitList(value);
    for (var i = 0; i < parts.length; i++) {
      var name = lowerCase(parts[i]);
      if (!has(names, name)) push(names, name);
    }
    return names;
  };
  var normalised = function (value) {
    if (value === null) return null;
    var parts = splitList(value);
    var out = '';
    for (var i = 0; i < parts.length; i++) out += (i ? ', ' : '') + parts[i];
    return out;
  };
  var varyValuesOf = function (names, headers) {
    var values = [];
    for (var i = 0; i < names.length; i++) push(values, normalised(headerValue(headers, names[i])));
    return values;
  };
  var sameValues = function (first, second) {
    if (first.length !== second.length) return false;
    for (var i = 0; i < first.length; i++) if (first[i] !== second[i]) return false;
    return true;
  };

  var createCache = function (options) {
    var shared = options.shared === true;
    var clock = options.clock;
    var entries = [];
    var nextId = 1;
    var copyOf = function (entry) {
      var now = clock();
      var kept = lifetime(entry, shared, entry.stored);
      var old = age(entry.headers, entry.stored, now);
      var vary = [];
      var values = [];
      for (var i = 0; i < entry.vary.length; i++) { push(vary, entry.vary[i]); push(values, entry.varyValues[i]); }
      return { id: entry.id, url: entry.url, status: entry.status, headers: copyHeaders(entry.headers), body: entry.body, vary: vary, varyValues: values, stored: entry.stored, by: entry.by, hits: entry.hits, age: old, lifetime: kept, fresh: kept > old };
    };
    var find = function (id) {
      for (var i = 0; i < entries.length; i++) if (entries[i].id === id) return entries[i];
      return null;
    };
    var matches = function (entry, headers) {
      if (has(entry.vary, '*')) return false;
      return sameValues(entry.varyValues, varyValuesOf(entry.vary, headers));
    };
    var remove = function (keep) {
      var kept = [];
      for (var i = 0; i < entries.length; i++) if (keep(entries[i])) push(kept, entries[i]);
      var gone = entries.length - kept.length;
      entries = kept;
      return gone;
    };
    return {
      /* the newest copy of the address its Vary lets this request use (RFC 9111 4.1: "the most recent"); a private cache
         (Chrome's) holds one copy an address, and a request its Vary doesn't match does without it */
      lookup: function (url, headers) {
        url = toText(url);
        for (var i = entries.length - 1; i >= 0; i--) {
          if (entries[i].url === url && matches(entries[i], headers)) return copyOf(entries[i]);
        }
        return null;
      },
      /* at: when the answer arrived (a copy kept from before the load), else now */
      store: function (url, request, answer, by, at) {
        url = toText(url);
        var problem = refusal(request, answer, shared);
        if (problem) return { stored: false, reason: problem };
        var headers = [];
        for (var i = 0; i < answer.headers.length; i++) {
          var name = lowerCase(toText(answer.headers[i][0]));
          if (!shared && (name === 'set-cookie' || name === 'set-cookie2')) continue;
          push(headers, [name, toText(answer.headers[i][1])]);
        }
        var vary = varyNames(headers);
        var values = varyValuesOf(vary, request.headers);
        /* a private cache: one copy an address; a shared one: one for each set of Vary values */
        remove(function (entry) { return !(entry.url === url && (!shared || sameValues(entry.vary, vary) && sameValues(entry.varyValues, values))); });
        if (entries.length >= LIMITS.entries) remove(function (entry) { return entry !== entries[0]; });
        var entry = createObject(null);
        entry.id = nextId++;
        entry.url = url;
        entry.status = answer.status;
        entry.headers = headers;
        entry.body = typeof answer.body === 'string' ? answer.body : null;
        entry.vary = vary;
        entry.varyValues = values;
        entry.stored = typeof at === 'number' ? at : clock();
        entry.by = toText(by);
        entry.hits = 0;
        push(entries, entry);
        return { stored: true, reason: null };
      },
      /* RFC 9111 4.3.4 and 3.2: the 304's headers replace the copy's (Chrome's copy keeps some of its own); the copy is
         as old as the 304 from now on */
      freshen: function (id, headers) {
        var entry = find(id);
        if (!entry) return null;
        var updated = copyHeaders(entry.headers);
        var given = copyHeaders(headers);
        var names = [];
        for (var i = 0; i < given.length; i++) {
          var name = given[i][0];
          if (name === 'content-length' || (!shared && (has(NOT_UPDATED, name) || sliceText(name, 0, 10) === 'x-content-' || sliceText(name, 0, 9) === 'x-webkit-'))) continue;
          if (!shared && (name === 'set-cookie' || name === 'set-cookie2')) continue;
          if (!has(names, name)) push(names, name);
        }
        var kept = [];
        for (var k = 0; k < updated.length; k++) if (!has(names, updated[k][0])) push(kept, updated[k]);
        for (var g = 0; g < given.length; g++) if (has(names, given[g][0])) push(kept, given[g]);
        entry.headers = kept;
        entry.stored = clock();
        return copyOf(entry);
      },
      hit: function (id) {
        var entry = find(id);
        if (entry) entry.hits += 1;
      },
      invalidate: function (url) {
        url = toText(url);
        return remove(function (entry) { return entry.url !== url; });
      },
      list: function () {
        var out = [];
        for (var i = 0; i < entries.length; i++) push(out, copyOf(entries[i]));
        return out;
      }
    };
  };

  var WORDS = {
    'method': 'Not kept: only the answer to a GET is cached.',
    'no-store': 'Not kept: Cache-Control: no-store.',
    'private': 'Not kept: Cache-Control: private is for the customer\'s own browser only.',
    'authorization': 'Not kept: the request carried Authorization, and the answer doesn\'t say public, s-maxage or must-revalidate.',
    'no-lifetime': 'Not kept: no max-age, s-maxage or Expires, and a status that may not be cached without one.'
  };
  var reason = function (problem, shared) {
    var text = hasOwn(WORDS, problem) ? WORDS[problem] : 'Not kept.';
    return shared ? 'CDN: ' + text : text;
  };

  return { directives: directives, lifetime: lifetime, age: age, refusal: refusal, validators: validators, notModified: notModified, createCache: createCache, reason: reason, headerValue: headerValue };
})`
