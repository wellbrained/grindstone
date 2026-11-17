// The browser's cookie rules for the Web fundamentals track (ADR 0009, chapter 2; docs/features/levels.md "The cookie
// model"): a model of what RFC 6265bis (https://datatracker.ietf.org/doc/draft-ietf-httpbis-rfc6265bis/) says a browser
// does with a `Set-Cookie` line and which cookies a request carries, with Chrome's own rules where it departs from the
// draft (a cookie without SameSite is Lax, and for its first two minutes still goes with another site's top-level POST;
// an expiry is at most 400 days away; Chrome's size and count limits) and Chrome DevTools' words for every cookie it
// blocked. No request leaves the sealed frame, so this model is the browser's cookie jar there: the web backend asks it
// for the `Cookie` header of each request and hands it each `Set-Cookie` of an answer, and the frame's `document.cookie`
// reads and writes through it.
//
// JavaScript in a string, like the CORS model (block comments only, every statement ends with a semicolon), because the
// web backend runs it inside the sealed frame; the unit tests run this very source on Node
// (test/unit/levels/web/cookies.test.ts, each rule next to the draft's text). Pure but for the jar, which holds the
// cookies of one load and reads the time from the clock it is given.
//
// What it leaves out (the feature doc's "What the model simplifies"): the Public Suffix List (a host's last label is its
// public suffix), cookie prefixes (`__Secure-`, `__Host-`), partitioned cookies (CHIPS), third-party cookie blocking,
// `Priority`, IP addresses as hosts, and a clock that moves: the scripted clock stands at WEB_CLOCK for a whole load.

/** The scripted clock: every load of a Web fundamentals app runs at this moment (Tuesday 17 November 2026, 09:41 GMT). */
export const WEB_CLOCK = Date.UTC(2026, 10, 17, 9, 41, 0)

/** Chrome's limits (net/cookies), and how long a line the model reads at all. */
export const COOKIE_LIMITS = {
  /** A cookie's name and value together (ParsedCookie::kMaxCookieNamePlusValueSize). */
  nameValue: 4096,
  /** An attribute's value; a longer one is ignored (kMaxCookieAttributeValueSize). */
  attribute: 1024,
  /** The latest expiry, in days from now (Chrome since 104; RFC 6265bis: "MUST NOT be greater than 400 days"). */
  maxAgeDays: 400,
  /** Cookies of one site (registrable domain); past it the ones used longest ago go, down to perSite - purge. */
  perSite: 180,
  perSitePurge: 30,
  /** Cookies in all. */
  total: 3300,
  totalPurge: 300,
  /** Chrome's Lax+POST: a cookie set without SameSite this long ago or less still goes with a top-level cross-site POST. */
  laxAllowUnsafeMs: 120_000,
  /** Characters of a line the model reads (the rest is never looked at). */
  line: 16_384
} as const

export type CookieSameSite = 'Strict' | 'Lax' | 'None' | 'Unspecified'

/** A `Set-Cookie` line as the parsing algorithm reads it (RFC 6265bis 5.6), before the storage model decides. */
export interface ParsedCookie {
  name: string
  value: string
  /** Expires as a time (ms since 1970), null: none that parses. */
  expires: number | null
  /** Max-Age in seconds (it wins over Expires), null: none that parses. */
  maxAge: number | null
  /** Domain without its leading dot, in lower case; null: none. */
  domain: string | null
  /** Path when it is one (starts with "/"); null: the default-path. */
  path: string | null
  secure: boolean
  httpOnly: boolean
  sameSite: CookieSameSite
}

/** Why a cookie was not stored (Chrome's CookieInclusionStatus names; the last two: from document.cookie). */
export type SetCookieProblem
  = | 'SyntaxError' | 'DisallowedCharacter' | 'NameValuePairExceedsMaxSize' | 'InvalidDomain' | 'SecureOnly'
    | 'SameSiteStrict' | 'SameSiteLax' | 'SameSiteUnspecifiedTreatedAsLax' | 'SameSiteNoneInsecure' | 'OverwriteSecure'
    | 'HttpOnlyFromScript' | 'OverwriteHttpOnly'

/** Why a cookie in the jar did not go with a request. */
export type SendCookieProblem = 'DomainMismatch' | 'NotOnPath' | 'SecureOnly' | 'SameSiteStrict' | 'SameSiteLax' | 'SameSiteUnspecifiedTreatedAsLax'

/** A cookie in the jar. */
export interface StoredCookie {
  name: string
  value: string
  /** The host (host-only) or the Domain it goes to. */
  domain: string
  hostOnly: boolean
  path: string
  /** When it expires (ms); null: a session cookie. */
  expires: number | null
  secure: boolean
  httpOnly: boolean
  sameSite: CookieSameSite
  created: number
  accessed: number
}

/** What became of a line: stored (the cookie), deleted (an expiry in the past), or refused (why). */
export interface StoreResult {
  name: string
  cookie: StoredCookie | null
  deleted: boolean
  problem: SetCookieProblem | null
}

/** Where a line came from: the answer to a request to `url` (or document.cookie on the page at `url`). */
export interface StoreContext {
  url: string
  /** The request was same-site (its initiator's site, and the top level's, is the URL's). */
  sameSite: boolean
  /** The answer navigates the top level (a link, a form). */
  topLevel?: boolean
  /** Written by document.cookie, not by a header. */
  script?: boolean
  /** When it was set, if not now (a cookie the browser kept from earlier). */
  created?: number
}

export interface RequestContext {
  url: string
  method: string
  sameSite: boolean
  topLevel: boolean
  /** false: the request goes without credentials (no cookie at all). */
  credentials?: boolean
}

/** A cookie the jar considered for a request: sent (problem null), or why not. */
export interface RequestCookie {
  name: string
  value: string
  problem: SendCookieProblem | null
  /** Sent only by Chrome's Lax+POST (no SameSite, set less than two minutes ago, a top-level cross-site POST). */
  laxAllowUnsafe: boolean
}

export interface CookieJar {
  /** A Set-Cookie line (or a document.cookie write) through the storage model. */
  store: (line: string, context: StoreContext) => StoreResult
  /** The cookies a request carries: the `Cookie` header (null: none) and every cookie of the URL's site, sent or why not. */
  forRequest: (context: RequestContext) => { header: string | null, cookies: RequestCookie[] }
  /** `document.cookie` on the page at this URL: its cookies without the HttpOnly ones. */
  document: (url: string) => string
  /** `document.cookie = text` on the page at this URL. */
  write: (text: string, url: string) => StoreResult
  /** The names a script on this origin could read, on any of its paths (Path does not keep a cookie from scripts). */
  readable: (origin: string) => string[]
  /** What a script on this origin could read and send away, on any of its paths: a Cookie header ('' for none). */
  steal: (origin: string) => string
  /** Every cookie, by domain, then path, then name (expired ones gone). */
  list: () => StoredCookie[]
}

export interface CookieModel {
  parse: (line: string) => ParsedCookie | { problem: 'SyntaxError' | 'DisallowedCharacter' | 'NameValuePairExceedsMaxSize' }
  /** The cookie-date algorithm (5.1.1): ms since 1970, or null. */
  parseDate: (text: string) => number | null
  isPublicSuffix: (domain: string) => boolean
  /** The scheme and the registrable domain: `https://cornerbakery.shop` (schemeful same-site). */
  siteOf: (url: string) => string
  domainMatch: (host: string, domain: string) => boolean
  defaultPath: (path: string) => string
  pathMatch: (requestPath: string, cookiePath: string) => boolean
  createJar: (clock: () => number) => CookieJar
  /**
   * Chrome DevTools' words for a cookie it blocked: `set` (a Set-Cookie line), `send` (a cookie a request did not
   * carry; `LaxAllowUnsafe` says why one went anyway) or `script` (document.cookie, where Chrome says nothing: these are
   * Grindstone's words).
   */
  reason: (problem: string, kind: 'set' | 'send' | 'script') => string
}

export const COOKIE_SOURCE = String.raw`(function () {
  'use strict';
  /* The built-ins the rules use, taken when the model is made (the web backend makes it with the bridge, before any of
     the app's code runs): a String.prototype, RegExp.prototype or URL the app changes later never changes a decision.
     No array method of the data is called; lists are walked by index. */
  var LIMITS = ${JSON.stringify(COOKIE_LIMITS)};
  var FP = Function.prototype;
  var uncurry = FP.bind.bind(FP.call);
  var describeProperty = Object.getOwnPropertyDescriptor;
  var getter = function (proto, name) { return uncurry(describeProperty(proto, name).get); };
  var NativeURL = URL;
  var hostnameOf = getter(NativeURL.prototype, 'hostname');
  var protocolOf = getter(NativeURL.prototype, 'protocol');
  var pathnameOf = getter(NativeURL.prototype, 'pathname');
  var lowerCase = uncurry(String.prototype.toLowerCase);
  var charCode = uncurry(String.prototype.charCodeAt);
  var sliceText = uncurry(String.prototype.slice);
  var exec = uncurry(RegExp.prototype.exec);
  var dateUtc = Date.UTC;
  var toText = String;
  var toNumber = Number;
  var hasOwn = uncurry(Object.prototype.hasOwnProperty);
  var defineProperty = Object.defineProperty;
  var createObject = Object.create;
  var MAX_SAFE = 9007199254740991;
  var DAY = 86400000;
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var TIME = /^(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\D|$)/;
  var DAY_OF_MONTH = /^(\d{1,2})(?:\D|$)/;
  var YEAR = /^(\d{2,4})(?:\D|$)/;
  var SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS', 'TRACE'];

  /* Every write into a list defines its element (an assignment to an index a list doesn't have yet would run a setter
     the app put on Array.prototype or Object.prototype, and hand it what is written); every read of a field the caller
     may have left out looks at the object's own fields only (an inherited getter never answers). */
  var put = function (list, index, item) {
    /* a descriptor without a prototype: defineProperty reads get and set through the chain too */
    var descriptor = createObject(null);
    descriptor.value = item;
    descriptor.writable = true;
    descriptor.enumerable = true;
    descriptor.configurable = true;
    defineProperty(list, index, descriptor);
  };
  var append = function (list, item) { put(list, list.length, item); };
  var own = function (object, name) { return object !== null && typeof object === 'object' && hasOwn(object, name) ? object[name] : undefined; };
  var has = function (list, item) {
    for (var i = 0; i < list.length; i++) if (list[i] === item) return true;
    return false;
  };
  var text = function (value) {
    if (typeof value === 'string') return value;
    try { return toText(value); } catch (error) { return ''; }
  };
  var isSpace = function (character) { return character === ' ' || character === '\t'; };
  /* whitespace (SP and HTAB) off both ends */
  var trim = function (value) {
    var from = 0;
    var to = value.length;
    while (from < to && isSpace(value[from])) from++;
    while (to > from && isSpace(value[to - 1])) to--;
    return sliceText(value, from, to);
  };
  var hasTab = function (value) {
    for (var i = 0; i < value.length; i++) if (value[i] === '\t') return true;
    return false;
  };
  var indexOf = function (value, character, from) {
    for (var i = from || 0; i < value.length; i++) if (value[i] === character) return i;
    return -1;
  };
  var startsDigit = function (value, at) { var code = charCode(value, at); return code >= 48 && code <= 57; };
  var allDigits = function (value, from) {
    if (from >= value.length) return false;
    for (var i = from; i < value.length; i++) if (!startsDigit(value, i)) return false;
    return true;
  };

  /* RFC 6265bis 5.1.1, "Dates": the cookie-date tokens, in any order, between delimiters. */
  var isDelimiter = function (code) { return code === 0x09 || (code >= 0x20 && code <= 0x2f) || (code >= 0x3b && code <= 0x40) || (code >= 0x5b && code <= 0x60) || (code >= 0x7b && code <= 0x7e); };
  var DAYS_IN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var parseDate = function (value) {
    value = text(value);
    var time = null;
    var day = null;
    var month = null;
    var year = null;
    var from = 0;
    for (var i = 0; i <= value.length; i++) {
      if (i < value.length && !isDelimiter(charCode(value, i))) continue;
      if (i > from) {
        var token = sliceText(value, from, i);
        var found;
        if (time === null && (found = exec(TIME, token)) !== null) time = [toNumber(found[1]), toNumber(found[2]), toNumber(found[3])];
        else if (day === null && (found = exec(DAY_OF_MONTH, token)) !== null) day = toNumber(found[1]);
        else if (month === null && token.length >= 3 && has(MONTHS, lowerCase(sliceText(token, 0, 3)))) {
          var name = lowerCase(sliceText(token, 0, 3));
          for (var m = 0; m < MONTHS.length; m++) if (MONTHS[m] === name) month = m;
        } else if (year === null && (found = exec(YEAR, token)) !== null) year = toNumber(found[1]);
      }
      from = i + 1;
    }
    if (time === null || day === null || month === null || year === null) return null;
    /* "If the year-value is greater than or equal to 70 and less than or equal to 99, increment the year-value by 1900.
       If the year-value is greater than or equal to 0 and less than or equal to 69, increment the year-value by 2000." */
    if (year >= 70 && year <= 99) year += 1900;
    else if (year >= 0 && year <= 69) year += 2000;
    if (day < 1 || day > 31 || time[0] > 23 || time[1] > 59 || time[2] > 59) return null;
    /* Chromium (cookie_util.cc) clamps a year before 1601 to 1601, where the draft fails the date: such a cookie is
       already expired and goes */
    if (year < 1601) year = 1601;
    var leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    /* "the date does not exist" (30 February) */
    if (day > (month === 1 && leap ? 29 : DAYS_IN[month])) return null;
    return dateUtc(year, month, day, time[0], time[1], time[2]);
  };

  /* RFC 6265bis 5.6, "The Set-Cookie Header Field" (the user agent's side). */
  var parse = function (line) {
    line = text(line);
    if (line.length > LIMITS.line) line = sliceText(line, 0, LIMITS.line);
    /* "If the set-cookie-string contains a %x00-08 / %x0A-1F / %x7F character (CTL characters excluding HTAB): Abort
       these steps and ignore the set-cookie-string entirely." */
    for (var c = 0; c < line.length; c++) {
      var code = charCode(line, c);
      if ((code <= 0x08) || (code >= 0x0a && code <= 0x1f) || code === 0x7f) return { problem: 'DisallowedCharacter' };
    }
    var semicolon = indexOf(line, ';', 0);
    var pair = semicolon < 0 ? line : sliceText(line, 0, semicolon);
    var equals = indexOf(pair, '=', 0);
    /* "If the name-value-pair string lacks a %x3D ("=") character, then the name string is empty, and the value string
       is the value of name-value-pair." */
    var name = trim(equals < 0 ? '' : sliceText(pair, 0, equals));
    var value = trim(equals < 0 ? pair : sliceText(pair, equals + 1));
    if (!name && !value) return { problem: 'SyntaxError' };
    /* Chrome: a tab inside the name or the value is no character a cookie may have */
    if (hasTab(name) || hasTab(value)) return { problem: 'DisallowedCharacter' };
    if (name.length + value.length > LIMITS.nameValue) return { problem: 'NameValuePairExceedsMaxSize' };
    var cookie = { name: name, value: value, expires: null, maxAge: null, domain: null, path: null, secure: false, httpOnly: false, sameSite: 'Unspecified', problem: null };
    var at = semicolon < 0 ? line.length : semicolon + 1;
    while (at < line.length) {
      var end = indexOf(line, ';', at);
      if (end < 0) end = line.length;
      var av = sliceText(line, at, end);
      at = end + 1;
      var split = indexOf(av, '=', 0);
      var key = lowerCase(trim(split < 0 ? av : sliceText(av, 0, split)));
      var raw = trim(split < 0 ? '' : sliceText(av, split + 1));
      if (hasTab(key) || hasTab(raw)) return { problem: 'DisallowedCharacter' };
      /* "If the attribute-value is longer than 1024 octets, ignore the cookie-av." */
      if (raw.length > LIMITS.attribute) continue;
      if (key === 'expires') cookie.expires = parseDate(raw);
      else if (key === 'max-age') {
        /* "If the first character of the attribute-value is neither a DIGIT, nor a "-" character followed by a DIGIT,
           ignore the cookie-av. If the remainder of attribute-value contains a non-DIGIT character, ignore the cookie-av." */
        var negative = raw[0] === '-';
        var signed = negative || raw[0] === '+';
        if (!allDigits(raw, signed ? 1 : 0)) { cookie.maxAge = null; continue; }
        var digits = sliceText(raw, signed ? 1 : 0);
        var seconds = digits.length > 15 ? MAX_SAFE : toNumber(digits);
        cookie.maxAge = negative ? -seconds : seconds;
      } else if (key === 'domain') {
        /* "If the attribute-value is empty, the behavior is undefined. However, the user agent SHOULD ignore the
           cookie-av entirely." "If the first character of the attribute-value string is %x2E ("."): Let cookie-domain be
           the attribute-value without the leading %x2E (".") character." "Convert the cookie-domain to lower case." */
        cookie.domain = raw ? lowerCase(raw[0] === '.' ? sliceText(raw, 1) : raw) : null;
      } else if (key === 'path') cookie.path = raw && raw[0] === '/' ? raw : null;
      else if (key === 'secure') cookie.secure = true;
      else if (key === 'httponly') cookie.httpOnly = true;
      else if (key === 'samesite') {
        var mode = lowerCase(raw);
        cookie.sameSite = mode === 'none' ? 'None' : mode === 'strict' ? 'Strict' : mode === 'lax' ? 'Lax' : 'Unspecified';
      }
    }
    return cookie;
  };

  /* A host's public suffix is its last label: no Public Suffix List (every host here has a one-label suffix). */
  var isPublicSuffix = function (domain) { return indexOf(text(domain), '.', 0) < 0; };
  /* The registrable domain: the public suffix and the label before it (null: the host is a suffix itself). */
  var registrable = function (host) {
    var dots = 0;
    var at = host.length;
    while (at > 0) {
      if (host[at - 1] === '.' && ++dots === 2) break;
      at--;
    }
    return dots === 0 ? null : sliceText(host, at);
  };
  var parts = function (url) {
    var parsed = new NativeURL(text(url));
    return { scheme: protocolOf(parsed), host: lowerCase(hostnameOf(parsed)), path: pathnameOf(parsed) };
  };
  var siteOf = function (url) {
    var where = parts(url);
    return sliceText(where.scheme, 0, where.scheme.length - 1) + '://' + (registrable(where.host) || where.host);
  };
  var siteKey = function (domain) { return registrable(domain) || domain; };
  /* 5.1.3: "The domain string and the string are identical", or the string ends with "." and the domain string. */
  var domainMatch = function (host, domain) {
    if (host === domain) return true;
    var lead = host.length - domain.length;
    return lead > 0 && sliceText(host, lead) === domain && host[lead - 1] === '.';
  };
  /* 5.1.4: the request path up to (not including) its right-most "/", or "/" when that is its only one. */
  var defaultPath = function (path) {
    path = text(path);
    if (!path || path[0] !== '/') return '/';
    var last = 0;
    for (var i = 0; i < path.length; i++) if (path[i] === '/') last = i;
    return last === 0 ? '/' : sliceText(path, 0, last);
  };
  var pathMatch = function (requestPath, cookiePath) {
    if (requestPath === cookiePath) return true;
    if (sliceText(requestPath, 0, cookiePath.length) !== cookiePath) return false;
    return cookiePath[cookiePath.length - 1] === '/' || requestPath[cookiePath.length] === '/';
  };

  var copy = function (cookie) {
    return { name: cookie.name, value: cookie.value, domain: cookie.domain, hostOnly: cookie.hostOnly, path: cookie.path, expires: cookie.expires, secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite, created: cookie.created, accessed: cookie.accessed };
  };
  var sameSiteProblem = function (mode) { return mode === 'Strict' ? 'SameSiteStrict' : mode === 'Lax' ? 'SameSiteLax' : 'SameSiteUnspecifiedTreatedAsLax'; };

  var createJar = function (clock) {
    var cookies = [];
    var nextSeq = 0;
    var now = function () { return clock(); };
    var remove = function (index) {
      for (var i = index; i < cookies.length - 1; i++) cookies[i] = cookies[i + 1];
      cookies.length -= 1;
    };
    var expire = function () {
      var time = now();
      for (var i = cookies.length - 1; i >= 0; i--) if (cookies[i].expires !== null && cookies[i].expires <= time) remove(i);
    };
    /* the cookie used longest ago (then the oldest) among those that match */
    var stalest = function (test) {
      var found = -1;
      for (var i = 0; i < cookies.length; i++) {
        if (!test(cookies[i])) continue;
        if (found < 0 || cookies[i].accessed < cookies[found].accessed || (cookies[i].accessed === cookies[found].accessed && cookies[i].seq < cookies[found].seq)) found = i;
      }
      return found;
    };
    /* Chrome's garbage collection: past 180 cookies of a site, the ones used longest ago go down to 150; past 3300 in
       all, down to 3000. */
    var collect = function (site) {
      var ofSite = function (cookie) { return siteKey(cookie.domain) === site; };
      var count = 0;
      for (var i = 0; i < cookies.length; i++) if (ofSite(cookies[i])) count++;
      if (count > LIMITS.perSite) for (var drop = count - (LIMITS.perSite - LIMITS.perSitePurge); drop > 0; drop--) remove(stalest(ofSite));
      if (cookies.length > LIMITS.total) for (var more = cookies.length - (LIMITS.total - LIMITS.totalPurge); more > 0; more--) remove(stalest(function () { return true; }));
    };
    var refused = function (name, problem) { return { name: name, cookie: null, deleted: false, problem: problem }; };

    /* RFC 6265bis 5.7, "Storage Model". */
    var store = function (line, context) {
      var parsed = parse(line);
      if (own(parsed, 'problem')) return refused('', parsed.problem);
      var where = parts(own(context, 'url'));
      var script = own(context, 'script') === true;
      var sameSiteContext = own(context, 'sameSite') === true;
      var topLevel = own(context, 'topLevel') === true;
      var createdAt = own(context, 'created');
      var secureScheme = where.scheme === 'https:';
      var domain = where.host;
      var hostOnly = true;
      if (parsed.domain !== null) {
        /* "If cookie-domain is a public suffix: If the request-host is identical to cookie-domain: set the host-only-flag
           … Otherwise: Abort these steps and ignore the cookie entirely." "If the canonicalized request-host does not
           domain-match the domain-attribute: Ignore the cookie entirely." */
        if (isPublicSuffix(parsed.domain)) {
          if (parsed.domain !== where.host) return refused(parsed.name, 'InvalidDomain');
        } else if (!domainMatch(where.host, parsed.domain)) return refused(parsed.name, 'InvalidDomain');
        else { domain = parsed.domain; hostOnly = false; }
      }
      var path = parsed.path !== null ? parsed.path : defaultPath(where.path);
      /* "If the scheme component of the request-uri does not denote a "secure" protocol … and the cookie's
         secure-only-flag is true, then abort these steps and ignore the cookie entirely." */
      if (parsed.secure && !secureScheme) return refused(parsed.name, 'SecureOnly');
      /* "If the cookie was received from a "non-HTTP" API and the cookie's http-only-flag is true, abort these steps" */
      if (script && parsed.httpOnly) return refused(parsed.name, 'HttpOnlyFromScript');
      /* "If the cookie's same-site-flag is not "None": … If the cookie was received from a "same-site" request, skip the
         remaining substeps. If the cookie was received from a request which is navigating a top-level traversable, skip
         the remaining substeps. Abort these steps and ignore the newly created cookie entirely." */
      if (parsed.sameSite !== 'None' && !sameSiteContext && !topLevel) return refused(parsed.name, sameSiteProblem(parsed.sameSite));
      /* "If the cookie's same-site-flag is "None", abort these steps and ignore the cookie entirely unless the cookie's
         secure-only-flag is true." */
      if (parsed.sameSite === 'None' && !parsed.secure) return refused(parsed.name, 'SameSiteNoneInsecure');
      /* "If the cookie's secure-only-flag is false, and the scheme component of request-uri does not denote a "secure"
         protocol, then abort … if the cookie store contains one or more cookies that meet all of the following: their
         name matches …, their secure-only-flag is true, their domain domain-matches the domain of the newly created
         cookie, or vice-versa, the path of the newly created cookie path-matches the path of the existing cookie." */
      expire();
      if (!parsed.secure && !secureScheme) {
        for (var s = 0; s < cookies.length; s++) {
          var other = cookies[s];
          if (other.secure && other.name === parsed.name && (domainMatch(domain, other.domain) || domainMatch(other.domain, domain)) && pathMatch(path, other.path)) return refused(parsed.name, 'OverwriteSecure');
        }
      }
      var time = now();
      var old = -1;
      for (var i = 0; i < cookies.length; i++) {
        var each = cookies[i];
        if (each.name === parsed.name && each.domain === domain && each.hostOnly === hostOnly && each.path === path) { old = i; break; }
      }
      /* "If the newly-created cookie was received from a "non-HTTP" API and the old-cookie's http-only-flag is true,
         abort these steps and ignore the newly created cookie entirely." */
      if (old >= 0 && script && cookies[old].httpOnly) return refused(parsed.name, 'OverwriteHttpOnly');
      /* Max-Age wins over Expires; Chrome caps either at 400 days */
      var latest = time + LIMITS.maxAgeDays * DAY;
      var expires = null;
      if (parsed.maxAge !== null) expires = parsed.maxAge <= 0 ? -1 : (parsed.maxAge > LIMITS.maxAgeDays * 86400 ? latest : time + parsed.maxAge * 1000);
      else if (parsed.expires !== null) expires = parsed.expires > latest ? latest : parsed.expires;
      if (expires !== null && expires <= time) {
        if (old >= 0) remove(old);
        return { name: parsed.name, cookie: null, deleted: true, problem: null };
      }
      /* Chromium (CookieMonster::SetCanonicalCookie): an overwrite keeps the old creation time only when the value is the
         same; a new value is a new cookie (its place in the header's order, a new Lax+POST window) */
      var keep = old >= 0 && cookies[old].value === parsed.value;
      var cookie = {
        name: parsed.name,
        value: parsed.value,
        domain: domain,
        hostOnly: hostOnly,
        path: path,
        expires: expires,
        secure: parsed.secure,
        httpOnly: parsed.httpOnly,
        sameSite: parsed.sameSite,
        created: keep ? cookies[old].created : typeof createdAt === 'number' ? createdAt : time,
        accessed: time,
        seq: keep ? cookies[old].seq : nextSeq++
      };
      if (old >= 0) cookies[old] = cookie;
      else append(cookies, cookie);
      collect(siteKey(domain));
      return { name: parsed.name, cookie: copy(cookie), deleted: false, problem: null };
    };

    /* the cookies of a URL's site that go with it (in header order), and those that don't, with why (5.8.3) */
    var consider = function (context, script) {
      expire();
      var where = parts(own(context, 'url'));
      var site = siteKey(where.host);
      var time = now();
      var sameSiteContext = own(context, 'sameSite') === true;
      var topLevel = own(context, 'topLevel') === true;
      var safeTop = topLevel && has(SAFE_METHODS, own(context, 'method'));
      var sent = [];
      var blocked = [];
      for (var i = 0; i < cookies.length; i++) {
        var cookie = cookies[i];
        if (siteKey(cookie.domain) !== site) continue;
        if (script && cookie.httpOnly) continue;
        var problem = null;
        var unsafe = false;
        if (cookie.hostOnly ? where.host !== cookie.domain : !domainMatch(where.host, cookie.domain)) problem = 'DomainMismatch';
        else if (!pathMatch(where.path, cookie.path)) problem = 'NotOnPath';
        else if (cookie.secure && where.scheme !== 'https:') problem = 'SecureOnly';
        else if (!sameSiteContext && cookie.sameSite !== 'None') {
          /* "If the cookie's same-site-flag is not "None" and the request is cross-site": Strict never; Lax only for a
             top-level navigation with a safe method. Chrome's Lax+POST: a cookie set without SameSite at most two
             minutes ago also goes with an unsafe top-level navigation. */
          if (cookie.sameSite === 'Strict') problem = 'SameSiteStrict';
          else if (!safeTop) {
            if (cookie.sameSite === 'Unspecified' && topLevel && time - cookie.created <= LIMITS.laxAllowUnsafeMs) unsafe = true;
            else problem = sameSiteProblem(cookie.sameSite);
          }
        }
        if (problem === null) {
          /* "Cookies with longer paths are listed before cookies with shorter paths. Among cookies that have equal-length
             path fields, cookies with earlier creation-times are listed before cookies with later creation-times." */
          var at = sent.length;
          while (at > 0) {
            var before = sent[at - 1].cookie;
            if (before.path.length > cookie.path.length || (before.path.length === cookie.path.length && (before.created < cookie.created || (before.created === cookie.created && before.seq < cookie.seq)))) break;
            put(sent, at, sent[at - 1]);
            at--;
          }
          put(sent, at, { cookie: cookie, unsafe: unsafe });
        } else append(blocked, { name: cookie.name, value: cookie.value, problem: problem, laxAllowUnsafe: false });
      }
      var header = '';
      var list = [];
      for (var k = 0; k < sent.length; k++) {
        var chosen = sent[k].cookie;
        chosen.accessed = time;
        header += (k ? '; ' : '') + (chosen.name === '' ? chosen.value : chosen.name + '=' + chosen.value);
        append(list, { name: chosen.name, value: chosen.value, problem: null, laxAllowUnsafe: sent[k].unsafe });
      }
      for (var b = 0; b < blocked.length; b++) append(list, blocked[b]);
      return { header: sent.length ? header : null, cookies: list };
    };

    /* the cookies a script on this origin can read on one of its paths: not HttpOnly, its host's, Secure only on https
       (RFC 6265bis 8.5: Path is no protection from a script of the same origin) */
    var scriptable = function (origin) {
      expire();
      var where = parts(origin);
      var found = [];
      for (var i = 0; i < cookies.length; i++) {
        var cookie = cookies[i];
        if (cookie.httpOnly || (cookie.secure && where.scheme !== 'https:')) continue;
        if (cookie.hostOnly ? where.host !== cookie.domain : !domainMatch(where.host, cookie.domain)) continue;
        append(found, cookie);
      }
      return found;
    };

    return {
      store: store,
      steal: function (origin) {
        var found = scriptable(origin);
        var header = '';
        for (var i = 0; i < found.length; i++) header += (i ? '; ' : '') + (found[i].name === '' ? found[i].value : found[i].name + '=' + found[i].value);
        return header;
      },
      forRequest: function (context) {
        if (own(context, 'credentials') === false) return { header: null, cookies: [] };
        return consider(context, false);
      },
      document: function (url) {
        var result = consider({ url: url, method: 'GET', sameSite: true, topLevel: true }, true);
        return result.header === null ? '' : result.header;
      },
      write: function (line, url) { return store(line, { url: url, sameSite: true, script: true }); },
      readable: function (origin) {
        var found = scriptable(origin);
        var names = [];
        for (var i = 0; i < found.length; i++) {
          var cookie = found[i];
          if (has(names, cookie.name)) continue;
          var at = names.length;
          while (at > 0 && names[at - 1] > cookie.name) { put(names, at, names[at - 1]); at--; }
          put(names, at, cookie.name);
        }
        return names;
      },
      list: function () {
        expire();
        var out = [];
        for (var i = 0; i < cookies.length; i++) {
          var cookie = cookies[i];
          var at = out.length;
          while (at > 0) {
            var before = out[at - 1];
            if (before.domain < cookie.domain || (before.domain === cookie.domain && (before.path < cookie.path || (before.path === cookie.path && before.name <= cookie.name)))) break;
            put(out, at, out[at - 1]);
            at--;
          }
          put(out, at, copy(cookie));
        }
        return out;
      }
    };
  };

  /* Chrome DevTools' words (front_end/core/sdk/NetworkRequest.ts, as shipped: the code marks without backticks). */
  var SET = 'This attempt to set a cookie via a "Set-Cookie" header was blocked because ';
  var SETTING = {
    SyntaxError: 'This "Set-Cookie" header had invalid syntax',
    DisallowedCharacter: 'This "Set-Cookie" header contained a disallowed character (a forbidden ASCII control character, or the tab character if it appears in the middle of the cookie name, value, an attribute name, or an attribute value)',
    NameValuePairExceedsMaxSize: SET + 'the cookie was too large. The combined size of the name and value must be less than or equal to 4096 characters.',
    InvalidDomain: SET + 'its "Domain" attribute was invalid with regards to the current host URL',
    SecureOnly: SET + 'it had the "Secure" attribute but wasn’t received over a secure connection',
    SameSiteStrict: SET + 'it had the "SameSite=Strict" attribute but came from a cross-site response which wasn’t the response to a top-level navigation',
    SameSiteLax: SET + 'it had the "SameSite=Lax" attribute but came from a cross-site response which wasn’t the response to a top-level navigation',
    SameSiteUnspecifiedTreatedAsLax: 'This "Set-Cookie" header didn’t specify a "SameSite" attribute and was defaulted to "SameSite=Lax", and was blocked because it came from a cross-site response which wasn’t the response to a top-level navigation. The "Set-Cookie" header had to have been set with "SameSite=None" to enable cross-site usage.',
    SameSiteNoneInsecure: SET + 'it had the "SameSite=None" attribute but didn’t have the "Secure" attribute, which is required in order to use "SameSite=None"',
    OverwriteSecure: SET + 'it wasn’t sent over a secure connection and would have overwritten a cookie with the "Secure" attribute'
  };
  var SENDING = {
    SecureOnly: 'This cookie was blocked because it had the "Secure" attribute and the connection wasn’t secure',
    NotOnPath: 'This cookie was blocked because its path wasn’t an exact match for or a superdirectory of the request URL’s path',
    DomainMismatch: 'This cookie was blocked because neither did the request URL’s domain exactly match the cookie’s domain, nor was the request URL’s domain a subdomain of the cookie’s Domain attribute value',
    SameSiteStrict: 'This cookie was blocked because it had the "SameSite=Strict" attribute and the request was made from a different site. This includes top-level navigation requests initiated by other sites.',
    SameSiteLax: 'This cookie was blocked because it had the "SameSite=Lax" attribute and the request was made from a different site and wasn’t initiated by a top-level navigation',
    SameSiteUnspecifiedTreatedAsLax: 'This cookie didn’t specify a "SameSite" attribute when it was stored and was defaulted to "SameSite=Lax", and was blocked because the request was made from a different site and wasn’t initiated by a top-level navigation. The cookie had to have been set with "SameSite=None" to enable cross-site usage.',
    /* not Chrome's: it sends such a cookie without a word in the Network panel */
    LaxAllowUnsafe: 'Sent anyway: it has no SameSite attribute and was set less than 2 minutes ago, so Chrome still sends it with another site\'s top-level POST ("Lax+POST"). Set SameSite=Lax to stop that.'
  };
  /* document.cookie: Chrome says nothing when it ignores a write; these are Grindstone's words */
  var SCRIPT = {
    HttpOnlyFromScript: 'document.cookie can\'t set an HttpOnly cookie: the browser ignores the write.',
    OverwriteHttpOnly: 'document.cookie can\'t replace an HttpOnly cookie: the browser ignores the write.',
    SyntaxError: 'document.cookie: that is no cookie (no name and no value), so the browser ignores the write.',
    DisallowedCharacter: 'document.cookie: the text has a control character (or a tab inside the name or value), so the browser ignores the write.',
    NameValuePairExceedsMaxSize: 'document.cookie: the name and value are longer than 4096 characters together, so the browser ignores the write.',
    InvalidDomain: 'document.cookie: the Domain attribute is neither this page\'s host nor a parent of it (or it is a public suffix), so the browser ignores the write.',
    SecureOnly: 'document.cookie: a Secure cookie can\'t be set from a page that is not https, so the browser ignores the write.',
    SameSiteNoneInsecure: 'document.cookie: SameSite=None needs Secure as well, so the browser ignores the write.',
    OverwriteSecure: 'document.cookie: it would replace a Secure cookie from a page that is not https, so the browser ignores the write.'
  };
  var reason = function (problem, kind) {
    var table = kind === 'set' ? SETTING : kind === 'send' ? SENDING : SCRIPT;
    var found = typeof problem === 'string' && hasOwn(table, problem) ? table[problem] : null;
    if (found) return found;
    return kind === 'send' ? 'This cookie was blocked.' : kind === 'set' ? 'This attempt to set a cookie via a "Set-Cookie" header was blocked.' : 'document.cookie: the browser ignores the write.';
  };

  return {
    parse: parse,
    parseDate: parseDate,
    isPublicSuffix: isPublicSuffix,
    siteOf: siteOf,
    domainMatch: domainMatch,
    defaultPath: defaultPath,
    pathMatch: pathMatch,
    createJar: createJar,
    reason: reason
  };
})`
