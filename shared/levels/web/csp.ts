// The page's security headers for the Web fundamentals track, chapter 7 (ADR 0009; docs/features/levels.md "The policy
// model"): what Chrome does with a page's Content-Security-Policy (CSP Level 3 as Chromium implements it: the parser,
// the fallback from script-src-elem and script-src-attr to script-src to default-src, 'self', hosts, schemes and `*`,
// nonces, hashes, 'unsafe-inline', 'unsafe-hashes', 'strict-dynamic', report-only, meta-delivered policies), with
// X-Frame-Options and frame-ancestors for a page another site frames, X-Content-Type-Options for a script's type, and
// Referrer-Policy for what a request's Referer says. And Chrome's Console words for each, word for word: Chromium's
// csp_directive_list.cc (the renderer's checks), services/network/.../content_security_policy.cc (the parser, and
// frame-ancestors), content/browser/renderer_host/ancestor_throttle.cc and x_frame_options_parser.cc (X-Frame-Options).
//
// The sealed frame keeps its own real policy (sandbox.ts), which this model never weakens; the page's policy is applied
// by the modelled browser (the bridge and the web backend ask this model before they run a script, an event handler or
// a request of the page). JavaScript in a string, like the other models: the web backend runs it in the frame and the
// unit tests run this very source on Node (test/unit/levels/web/csp.test.ts, each rule next to Chromium's code).
//
// Hardening, as the other models: it is made before the app runs and takes every built-in it uses then; every list is
// written through a descriptor without a prototype and every object is made whole, so a setter the app put on
// Object.prototype or Array.prototype never sees what the model decides.
//
// What it leaves out (the feature doc's "What the model simplifies"): eval and `new Function` (the frame's own policy
// allows them, the model never refuses them), styles (style-src), workers, plugins, base-uri and form-action, Trusted
// Types, sandbox, upgrade-insecure-requests, report-to (report-uri only), sha384 and sha512 (parsed, never matched: the
// model computes SHA-256 only, which is what Chrome's messages offer), hashes of external scripts (integrity), redirects.

import { SHA256_SOURCE } from './tokens'

/** One source expression the model keeps: a scheme (`https:`) or a host source (`https://*.example:443/path/`). */
export interface PolicySource {
  scheme: string
  host: string
  wildcard: boolean
  /** -1: none given; -2: `*`. */
  port: number
  path: string
}

/** A directive's source list, as Chromium's CSPSourceList keeps it. */
export interface SourceList {
  self: boolean
  star: boolean
  inline: boolean
  eval: boolean
  dynamic: boolean
  unsafeHashes: boolean
  sample: boolean
  nonces: string[]
  hashes: { algorithm: string, digest: string }[]
  sources: PolicySource[]
}

/** One policy (a header can carry several, comma-separated). */
export interface Policy {
  /** The policy's own text (one comma-separated part of the header or the meta tag's content). */
  text: string
  type: 'enforce' | 'report'
  source: 'header' | 'meta'
  /** Directive name to its value as written (whitespace at its ends taken off). */
  raw: Record<string, string>
  /** Directive name to its source list (source-list directives only). */
  lists: Record<string, SourceList>
  /** The names in the order they came. */
  names: string[]
  /** report-uri's endpoints, as written. */
  reportTo: string[]
}

/** A Console line the model says the browser writes. */
export interface PolicyLine {
  level: 'error' | 'info' | 'warning'
  text: string
}

/** One violation of one policy (a line for the Console, and what a report-uri report says). */
export interface Violation {
  policy: number
  /** The directive the check was for (script-src-elem, script-src-attr, connect-src, img-src, frame-ancestors). */
  effective: string
  /** The directive that decided (the effective one, or what it fell back to). */
  directive: string
  /** 'inline', or the address refused. */
  blocked: string
  disposition: 'enforce' | 'report'
  line: PolicyLine
  /** The first 40 characters of the inline code when the directive asks for 'report-sample'. */
  sample: string
}

/** What the browser decides about one thing: whether it may happen, and what every policy said. */
export interface Verdict {
  allowed: boolean
  violations: Violation[]
}

/** The page's policies once parsed, and what the Console says about the parsing. */
export interface Parsed {
  policies: Policy[]
  lines: PolicyLine[]
}

/** What X-Frame-Options and frame-ancestors decide for a page another page frames. */
export interface FrameVerdict {
  allowed: boolean
  /** Lines for the framing page's Console (Chrome writes them there). */
  lines: PolicyLine[]
  violations: Violation[]
  /** Which rule refused it: 'frame-ancestors', 'x-frame-options', or null. */
  by: string | null
}

export interface PolicyModel {
  /** A Content-Security-Policy (or -Report-Only) header's value, or a meta tag's content: its policies and the parse's Console lines. */
  parse: (value: string, type: 'enforce' | 'report', source: 'header' | 'meta') => Parsed
  /** A `<script src>`: may it load? (`parserInserted`: the HTML parser made it, not a script; `nonce`: its nonce attribute.) */
  script: (policies: readonly Policy[], self: string, url: string, nonce: string | null, parserInserted: boolean) => Verdict
  /**
   * An inline `<script>` (its text and nonce; `parserInserted` false: a script added it, which 'strict-dynamic' lets
   * run) or an inline event handler (`onclick="…"`: its value): may it run?
   */
  inline: (policies: readonly Policy[], kind: 'script' | 'handler', text: string, nonce: string | null, parserInserted?: boolean) => Verdict
  /** A request of the page's script (`connect-src`: fetch, sendBeacon) or an image (`img-src`). */
  request: (policies: readonly Policy[], self: string, kind: 'connect-src' | 'img-src', url: string) => Verdict
  /** A page another page frames: its headers' policies, its X-Frame-Options values, its own address, its ancestors' origins. */
  frame: (policies: readonly Policy[], xfo: readonly string[], url: string, ancestors: readonly string[]) => FrameVerdict
  /** Whether a script answer may run, by its Content-Type and X-Content-Type-Options (null: it may; else Chrome's line). */
  scriptType: (url: string, contentType: string | null, nosniff: boolean, module: boolean) => PolicyLine | null
  /** X-Content-Type-Options' values: nosniff or not. */
  nosniff: (values: readonly string[]) => boolean
  /** The referrer policy a Referrer-Policy header (its values) or a meta tag (`meta`: its old names too) sets; '' for none it knows. */
  referrerPolicy: (values: readonly string[], meta?: boolean) => string
  /** The Referer a request carries under a referrer policy: the whole address, the origin with a slash, or null (none). */
  referrer: (policy: string, page: string, target: string) => string | null
  /** The JSON a report-uri report carries (Chrome's legacy report, its fields in Chrome's order; `line`: where in index.html, when known). */
  report: (policy: Policy, violation: Violation, page: string, status: number, line?: number | null) => string
  /** 'sha256-…' of a text, as Chrome's messages offer it (UTF-8, base64). */
  hash: (text: string) => string
}

/** Every directive Chromium knows (anything else is "Unrecognized"). */
export const DIRECTIVES = [
  'base-uri', 'block-all-mixed-content', 'child-src', 'connect-src', 'default-src', 'fenced-frame-src', 'font-src',
  'form-action', 'frame-ancestors', 'frame-src', 'img-src', 'manifest-src', 'media-src', 'object-src', 'report-to',
  'report-uri', 'require-trusted-types-for', 'sandbox', 'script-src', 'script-src-attr', 'script-src-elem', 'style-src',
  'style-src-attr', 'style-src-elem', 'trusted-types', 'upgrade-insecure-requests', 'worker-src'
] as const

export const CSP_SOURCE = String.raw`(function () {
  'use strict';
  var FP = Function.prototype;
  var uncurry = FP.bind.bind(FP.call);
  var SP = String.prototype;
  var lower = uncurry(SP.toLowerCase);
  var slice = uncurry(SP.slice);
  var indexOf = uncurry(SP.indexOf);
  var charAt = uncurry(SP.charAt);
  var charCode = uncurry(SP.charCodeAt);
  var trimText = uncurry(SP.trim);
  var startsWith = function (text, start) { return slice(text, 0, start.length) === start; };
  var endsWith = function (text, end) { return end.length <= text.length && slice(text, text.length - end.length) === end; };
  /* text split at every occurrence of a string (indexOf asks nothing of the app) */
  var splitText = function (text, separator) {
    var parts = [];
    var from = 0;
    for (;;) {
      var at = indexOf(text, separator, from);
      if (at === -1) { put(parts, slice(text, from)); return parts; }
      put(parts, slice(text, from, at));
      from = at + separator.length;
    }
  };
  /* RegExp.prototype.exec as it is now: the engine's own matcher. test, replace and split with a pattern, and split,
     startsWith and endsWith with a string, all ask the pattern's (or String.prototype's) methods again when they run,
     which the app may have replaced by then: the model uses none of them. */
  var exec = uncurry(RegExp.prototype.exec);
  var test = function (pattern, text) { return exec(pattern, text) !== null; };
  var createObject = Object.create;
  var defineProperty = Object.defineProperty;
  var describe = Object.getOwnPropertyDescriptor;
  var hasOwn = uncurry(Object.prototype.hasOwnProperty);
  var toText = String;
  var NativeURL = URL;
  var urlGetter = function (name) { return uncurry(describe(NativeURL.prototype, name).get); };
  var protocolOf = urlGetter('protocol');
  var hostnameOf = urlGetter('hostname');
  var portOf = urlGetter('port');
  var pathnameOf = urlGetter('pathname');
  var originOf = urlGetter('origin');
  var hrefOf = urlGetter('href');
  var searchOf = urlGetter('search');
  var decode = decodeURIComponent;
  var encoder = new TextEncoder();
  var encode = uncurry(TextEncoder.prototype.encode);
  var stringify = JSON.stringify;
  var fromCode = String.fromCharCode;
  /* where a pattern first matches, or -1 (String.prototype.search is the app's to replace) */
  var searchText = function (text, pattern) { var found = exec(pattern, text); return found ? found.index : -1; };
  var sha256 = ${SHA256_SOURCE}();

  /* lists written through descriptors without a prototype (no setter on Array.prototype ever runs) */
  var put = function (list, item) {
    var entry = createObject(null);
    entry.value = item;
    entry.writable = true;
    entry.enumerable = true;
    entry.configurable = true;
    defineProperty(list, list.length, entry);
  };
  var map = function () { return createObject(null); };
  var own = function (object, name) { return object !== null && typeof object === 'object' && hasOwn(object, name) ? object[name] : undefined; };
  var has = function (list, item) {
    for (var i = 0; i < list.length; i++) if (list[i] === item) return true;
    return false;
  };

  /* base64 of bytes, by hand (btoa is the app's to replace) */
  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var base64 = function (bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var a = bytes[i];
      var b = i + 1 < bytes.length ? bytes[i + 1] : 0;
      var c = i + 2 < bytes.length ? bytes[i + 2] : 0;
      out += charAt(ALPHABET, a >> 2) + charAt(ALPHABET, ((a & 3) << 4) | (b >> 4));
      out += i + 1 < bytes.length ? charAt(ALPHABET, ((b & 15) << 2) | (c >> 6)) : '=';
      out += i + 2 < bytes.length ? charAt(ALPHABET, c & 63) : '=';
    }
    return out;
  };
  var hashOf = function (text) { return 'sha256-' + base64(sha256(encode(encoder, toText(text)))); };

  /* --- parsing (services/network/public/cpp/content_security_policy/content_security_policy.cc) ------------------ */
  var KNOWN = ${JSON.stringify(DIRECTIVES)};
  var SOURCE_LISTS = ['base-uri', 'child-src', 'connect-src', 'default-src', 'fenced-frame-src', 'font-src', 'form-action', 'frame-ancestors', 'frame-src', 'img-src', 'manifest-src', 'media-src', 'object-src', 'script-src', 'script-src-attr', 'script-src-elem', 'style-src', 'style-src-attr', 'style-src-elem', 'worker-src'];
  var EMPTY_ONLY = ['block-all-mixed-content', 'upgrade-insecure-requests'];
  var NOT_IN_META = ['frame-ancestors', 'report-uri', 'sandbox'];
  var NOT_IN_REPORT_ONLY = ['sandbox', 'upgrade-insecure-requests'];
  /* ASCII whitespace (CSP's): tab, line feed, form feed, carriage return, space */
  var isSpace = function (code) { return code === 9 || code === 10 || code === 12 || code === 13 || code === 32; };
  var trimmed = function (text) {
    var start = 0;
    var end = text.length;
    while (start < end && isSpace(charCode(text, start))) start += 1;
    while (end > start && isSpace(charCode(text, end - 1))) end -= 1;
    return slice(text, start, end);
  };
  var tokens = function (text) {
    var out = [];
    var start = -1;
    for (var i = 0; i <= text.length; i++) {
      var space = i === text.length || isSpace(charCode(text, i));
      if (space && start !== -1) { put(out, slice(text, start, i)); start = -1; } else if (!space && start === -1) start = i;
    }
    return out;
  };
  var nameError = function (name) {
    var low = lower(name);
    if (low === 'allow') return 'The \'allow\' directive has been replaced with \'default-src\'. Please use that directive instead, as \'allow\' has no effect.';
    if (low === 'options') return 'The \'options\' directive has been replaced with the \'unsafe-inline\' and \'unsafe-eval\' source expressions for the \'script-src\' and \'style-src\' directives. Please use those directives instead, as \'options\' has no effect.';
    if (low === 'policy-uri') return 'The \'policy-uri\' directive has been removed from the specification. Please specify a complete policy via the Content-Security-Policy header.';
    if (low === 'plugin-types') return 'The Content-Security-Policy directive \'plugin-types\' has been removed from the specification. If you want to block plugins, consider specifying "object-src \'none\'" instead.';
    return 'Unrecognized Content-Security-Policy directive \'' + name + '\'.';
  };
  var parseScheme = function (text) {
    return text !== '' && test(/^[A-Za-z][A-Za-z0-9+\-.]*$/, text) ? lower(text) : null;
  };
  var parseHost = function (text, source) {
    if (text === '') return false;
    if (text === '*') { source.wildcard = true; source.host = ''; return true; }
    if (charAt(text, 0) === '*') {
      if (charAt(text, 1) !== '.') return false;
      source.wildcard = true;
      text = slice(text, 2);
    }
    if (!test(/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*$/, text)) return false;
    source.host = lower(text);
    return true;
  };
  var parsePort = function (text, source) {
    if (text === '*') { source.port = -2; return true; }
    if (!test(/^[0-9]{1,5}$/, text)) return false;
    var port = +text;
    if (port > 65535) return false;
    source.port = port;
    return true;
  };
  /* ParseSource: scheme:, scheme://host[:port][/path], host[:port][/path] */
  var parseSource = function (directive, expression, errors) {
    var source = { scheme: '', host: '', wildcard: false, port: -1, path: '' };
    var at = searchText(expression, /[:/]/);
    if (at !== -1 && charAt(expression, at) === ':') {
      if (at + 1 === expression.length) {
        var only = parseScheme(slice(expression, 0, at));
        if (only === null) return null;
        source.scheme = only;
        return source;
      }
      if (charAt(expression, at + 1) === '/') {
        if (at + 2 >= expression.length || charAt(expression, at + 2) !== '/') return null;
        var scheme = parseScheme(slice(expression, 0, at));
        if (scheme === null) return null;
        source.scheme = scheme;
        expression = slice(expression, at + 3);
        at = searchText(expression, /[:/]/);
      }
    }
    if (!parseHost(at === -1 ? expression : slice(expression, 0, at), source)) return null;
    if (at === -1) return source;
    expression = slice(expression, at);
    if (charAt(expression, 0) === ':') {
      var end = indexOf(expression, '/');
      if (!parsePort(end === -1 ? slice(expression, 1) : slice(expression, 1, end), source)) return null;
      if (end === -1) return source;
      expression = slice(expression, end);
    }
    if (expression === '') return source;
    var cut = searchText(expression, /[#?]/);
    var path = cut === -1 ? expression : slice(expression, 0, cut);
    if (!test(/^[A-Za-z0-9\-._~!$&'()*+,;=:@%/]*$/, path)) return null;
    try { source.path = decode(path); } catch (error) { return null; }
    if (cut !== -1) {
      put(errors, 'The source list for Content Security Policy directive \'' + directive + '\' contains a source with an invalid path: \'' + expression + '\'. ' + (charAt(expression, cut) === '?' ? 'The query component, including the \'?\', will be ignored.' : 'The fragment identifier, including the \'#\', will be ignored.'));
    }
    return source;
  };
  var NONCE = /^'nonce-([A-Za-z0-9+/\-_]+={0,2})'$/i;
  var HASH = /^'(sha256|sha384|sha512)-([A-Za-z0-9+/\-_]+={0,2})'$/i;
  /* base64url and base64 name the same digest */
  var digestOf = function (text) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var char = charAt(text, i);
      if (char === '=') break;
      out += char === '-' ? '+' : char === '_' ? '/' : char;
    }
    return out;
  };
  var parseList = function (directive, value, errors) {
    var list = { self: false, star: false, inline: false, eval: false, dynamic: false, unsafeHashes: false, sample: false, nonces: [], hashes: [], sources: [] };
    var all = tokens(value);
    var none = false;
    for (var i = 0; i < all.length; i++) {
      var expression = all[i];
      var low = lower(expression);
      if (low === '\'none\'') { none = true; continue; }
      if (low === '\'self\'') { list.self = true; continue; }
      if (low === '*') { list.star = true; continue; }
      if (has(KNOWN, low)) put(errors, 'The Content-Security-Policy directive \'' + directive + '\' contains \'' + expression + '\' as a source expression. Did you want to add it as a directive and forget a semicolon?');
      var source = parseSource(directive, expression, errors);
      if (source) { put(list.sources, source); continue; }
      if (directive === 'frame-ancestors') {
        put(errors, 'The Content-Security-Policy directive \'frame-ancestors\' does not support the source expression \'' + expression + '\'');
        continue;
      }
      if (low === '\'unsafe-inline\'') { list.inline = true; continue; }
      if (low === '\'unsafe-eval\'') { list.eval = true; continue; }
      if (low === '\'wasm-eval\'' || low === '\'wasm-unsafe-eval\'' || low === '\'inline-speculation-rules\'' || low === '\'trusted-types-eval\'') continue;
      if (low === '\'strict-dynamic\'') { list.dynamic = true; continue; }
      if (low === '\'unsafe-hashes\'') { list.unsafeHashes = true; continue; }
      if (low === '\'report-sha256\'' || low === '\'report-sha384\'' || low === '\'report-sha512\'') continue;
      if (low === '\'report-sample\'') { list.sample = true; continue; }
      var nonce = exec(NONCE, expression);
      if (nonce) { put(list.nonces, nonce[1]); continue; }
      var hash = exec(HASH, expression);
      if (hash) { put(list.hashes, { algorithm: lower(hash[1]), digest: digestOf(hash[2]) }); continue; }
      put(errors, 'The source list for the Content Security Policy directive \'' + directive + '\' contains an invalid source: \'' + expression + '\'. It will be ignored.');
    }
    if (none) {
      for (var j = 0; j < all.length; j++) {
        var each = lower(all[j]);
        if (each !== '\'report-sample\'' && each !== '\'none\'') {
          put(errors, 'The Content-Security-Policy directive \'' + directive + '\' contains the keyword \'none\' alongside with other source expressions. The keyword \'none\' must be the only source expression in the directive value, otherwise it is ignored.');
          break;
        }
      }
    }
    return list;
  };
  var parseOne = function (text, type, sourceKind, errors) {
    var raw = map();
    var lists = map();
    var names = [];
    var reportTo = [];
    var parts = splitText(text, ';');
    for (var i = 0; i < parts.length; i++) {
      var directive = trimmed(parts[i]);
      if (directive === '') continue;
      var space = searchText(directive, /[\t\n\f\r ]/);
      var written = space === -1 ? directive : slice(directive, 0, space);
      var value = space === -1 ? '' : trimmed(slice(directive, space + 1));
      var name = lower(written);
      if (!test(/^[A-Za-z0-9-]+$/, written)) { put(errors, 'The Content-Security-Policy directive name \'' + written + '\' contains one or more invalid characters. Only ASCII alphanumeric characters or dashes \'-\' are allowed in directive names.'); continue; }
      if (!has(KNOWN, name)) { put(errors, nameError(written)); continue; }
      if (hasOwn(raw, name)) { put(errors, 'Ignoring duplicate Content-Security-Policy directive \'' + written + '\'.'); continue; }
      raw[name] = value;
      if (!test(/^[\x21-\x7e\t\n\f\r ]*$/, value)) {
        put(errors, 'The value for the Content-Security-Policy directive \'' + written + '\' contains one or more invalid characters. In a source expression, non-whitespace characters outside ASCII 0x21-0x7E must be Punycode-encoded, as described in RFC 3492 (https://tools.ietf.org/html/rfc3492), if part of the hostname and percent-encoded, as described in RFC 3986, section 2.1 (http://tools.ietf.org/html/rfc3986#section-2.1), if part of the path.');
        continue;
      }
      if (type === 'report' && has(NOT_IN_REPORT_ONLY, name)) { put(errors, 'The Content Security Policy directive \'' + written + '\' is ignored when delivered in a report-only policy.'); continue; }
      if (sourceKind === 'meta' && has(NOT_IN_META, name)) { put(errors, 'The Content Security Policy directive \'' + written + '\' is ignored when delivered via a <meta> element.'); continue; }
      put(names, name);
      if (has(SOURCE_LISTS, name)) lists[name] = parseList(name, value, errors);
      else if (name === 'report-uri') {
        var uris = tokens(value);
        for (var u = 0; u < uris.length; u++) put(reportTo, uris[u]);
      } else if (has(EMPTY_ONLY, name) && value !== '') {
        put(errors, 'The Content Security Policy directive \'' + written + '\' should be empty, but was delivered with a value of \'' + value + '\'. The directive has been applied, and the value ignored.');
      }
    }
    return { text: text, type: type, source: sourceKind, raw: raw, lists: lists, names: names, reportTo: reportTo };
  };
  /* A header's value: one policy per comma-separated part (ParseContentSecurityPolicies); a meta tag's content is one. */
  var parse = function (value, type, sourceKind) {
    var policies = [];
    var errors = [];
    value = toText(value);
    if (sourceKind === 'meta' && type === 'report') {
      return { policies: [], lines: [{ level: 'error', text: 'The report-only Content Security Policy \'' + value + '\' was delivered via a <meta> element, which is disallowed. The policy has been ignored.' }] };
    }
    var parts = sourceKind === 'meta' ? [value] : splitText(value, ',');
    for (var i = 0; i < parts.length; i++) {
      var text = trimmed(parts[i]);
      if (sourceKind === 'header' && text === '') continue;
      put(policies, parseOne(text, type, sourceKind, errors));
    }
    var lines = [];
    for (var e = 0; e < errors.length; e++) put(lines, { level: 'error', text: errors[e] });
    return { policies: policies, lines: lines };
  };

  /* --- matching (third_party/blink/renderer/core/frame/csp/csp_source.cc, source_list_directive.cc) -------------- */
  var DEFAULT_PORTS = { 'http:': 80, 'https:': 443, 'ws:': 80, 'wss:': 443, 'ftp:': 21 };
  var urlOf = function (text) {
    try { return new NativeURL(text); } catch (error) { return null; }
  };
  var schemeOfUrl = function (url) { return slice(protocolOf(url), 0, -1); };
  var defaultPort = function (scheme) { return own(DEFAULT_PORTS, scheme + ':') === undefined ? -1 : DEFAULT_PORTS[scheme + ':']; };
  var portNumber = function (url) { var port = portOf(url); return port === '' ? -1 : +port; };
  var schemeMatch = function (source, protocol, self) {
    var scheme = source.scheme === '' ? self : source.scheme;
    if (scheme === protocol) return 'exact';
    if ((scheme === 'http' && protocol === 'https') || (scheme === 'ws' && protocol === 'wss')) return 'upgrade';
    return 'no';
  };
  var hostMatch = function (source, host) {
    if (source.wildcard) return source.host === '' || endsWith(host, '.' + source.host);
    return source.host === host;
  };
  var pathMatch = function (source, path) {
    if (source.path === '' || (source.path === '/' && path === '')) return true;
    var decoded;
    try { decoded = decode(path); } catch (error) { decoded = path; }
    return endsWith(source.path, '/') ? startsWith(decoded, source.path) : decoded === source.path;
  };
  var portMatch = function (source, self, port, protocol) {
    if (source.port === -2) return 'wildcard';
    if (port === source.port) return port === -1 ? 'wildcard' : 'exact';
    var isHttp = source.scheme === '' ? self === 'http' : source.scheme === 'http';
    if ((source.port === 80 || ((source.port === -1 || source.port === 443) && isHttp)) && (port === 443 || (port === -1 && defaultPort(protocol) === 443))) return 'upgrade';
    if (port === -1) return defaultPort(protocol) === source.port ? 'exact' : 'no';
    if (source.port === -1) return defaultPort(protocol) === port ? 'exact' : 'no';
    return 'no';
  };
  var sourceMatches = function (source, self, url) {
    var protocol = schemeOfUrl(url);
    var schemes = schemeMatch(source, protocol, self);
    if (schemes === 'no') return false;
    if (source.host === '' && !source.wildcard) return true;
    var ports = portMatch(source, self, portNumber(url), protocol);
    if ((schemes === 'upgrade' || ports === 'upgrade') && (schemes !== 'upgrade' || (ports !== 'upgrade' && ports !== 'wildcard'))) return false;
    return hostMatch(source, hostnameOf(url)) && ports !== 'no' && pathMatch(source, pathnameOf(url));
  };
  /* 'self': the page's own origin (and its https upgrade) */
  var selfMatches = function (selfUrl, url) {
    var self = { scheme: schemeOfUrl(selfUrl), host: hostnameOf(selfUrl), wildcard: false, port: portNumber(selfUrl), path: '' };
    var protocol = schemeOfUrl(url);
    var schemes = schemeMatch(self, protocol, self.scheme);
    var hosts = hostMatch(self, hostnameOf(url));
    var ports = portMatch(self, self.scheme, portNumber(url), protocol);
    if (schemes === 'exact' && hosts && (ports === 'exact' || ports === 'wildcard')) return true;
    var urlPort = portNumber(url);
    var defaults = ports === 'exact' || ((self.port === -1 || self.port === defaultPort(self.scheme)) && (urlPort === -1 || urlPort === defaultPort(protocol)));
    return hosts && defaults && (protocol === 'https' || protocol === 'wss' || self.scheme === 'http');
  };
  var listAllows = function (list, selfUrl, url) {
    var protocol = schemeOfUrl(url);
    if (list.star && (protocol === 'http' || protocol === 'https' || protocol === 'ws' || protocol === 'wss' || protocol === schemeOfUrl(selfUrl))) return true;
    if (list.self && selfMatches(selfUrl, url)) return true;
    for (var i = 0; i < list.sources.length; i++) if (sourceMatches(list.sources[i], schemeOfUrl(selfUrl), url)) return true;
    return false;
  };

  /* --- checks (csp_directive_list.cc) ---------------------------------------------------------------------------- */
  var FALLBACK = { 'script-src-elem': 'script-src', 'script-src-attr': 'script-src', 'script-src': 'default-src', 'connect-src': 'default-src', 'img-src': 'default-src' };
  var operative = function (policy, name) {
    for (var at = name; at; at = own(FALLBACK, at) || null) {
      if (hasOwn(policy.lists, at)) return { name: at, list: policy.lists[at] };
    }
    return null;
  };
  var isScriptDirective = function (name) { return name === 'script-src' || name === 'script-src-attr' || name === 'script-src-elem' || name === 'default-src'; };
  var rawDirective = function (policy, name) { return name + ' ' + policy.raw[name]; };
  var ending = function (policy) {
    return policy.type === 'report' ? ' The policy is report-only, so the violation has been logged but no further action has been taken.' : ' The action has been blocked.';
  };
  var violation = function (policies, index, effective, directive, blocked, text, sample) {
    var policy = policies[index];
    return {
      policy: index,
      effective: effective,
      directive: directive,
      blocked: blocked,
      disposition: policy.type,
      line: { level: policy.type === 'report' ? 'info' : 'error', text: text + ending(policy) },
      sample: sample
    };
  };
  var verdictOf = function (policies, check) {
    var allowed = true;
    var violations = [];
    for (var i = 0; i < policies.length; i++) {
      var found = check(policies[i], i);
      if (found) {
        put(violations, found);
        if (policies[i].type === 'enforce') allowed = false;
      }
    }
    return { allowed: allowed, violations: violations };
  };
  var URL_PREFIX = { 'script-src-elem': 'Loading the script \'', 'connect-src': 'Connecting to \'', 'img-src': 'Loading the image \'' };
  /* CheckSource and ReportViolationForCheckSource: the address against the operative list, Chrome's notes after it */
  var urlViolation = function (policies, index, effective, found, url, dynamicNote) {
    var policy = policies[index];
    var suffix = dynamicNote ? ' Note that \'strict-dynamic\' is present, so host-based allowlisting is disabled.' : '';
    if (found.name !== effective) suffix += ' Note that \'' + effective + '\' was not explicitly set, so \'' + found.name + '\' is used as a fallback.';
    if (found.list.star) suffix += ' Note that \'*\' matches only URLs with network schemes (\'http\', \'https\', \'ws\', \'wss\'), or URLs whose scheme matches ' + fromCode(96) + 'self' + fromCode(96) + '\'s scheme. The scheme \'' + protocolOf(url) + '\' must be added explicitly.';
    return violation(policies, index, effective, found.name, hrefOf(url), URL_PREFIX[effective] + hrefOf(url) + '\' violates the following Content Security Policy directive: "' + rawDirective(policy, found.name) + '".' + suffix, '');
  };
  var stripped = function (nonce) { return nonce === null || nonce === undefined ? null : trimText(toText(nonce)); };
  var nonceMatches = function (list, nonce) { return nonce !== null && nonce !== '' && has(list.nonces, nonce); };
  var script = function (policies, self, address, nonce, parserInserted) {
    var selfUrl = urlOf(self);
    var url = urlOf(address);
    nonce = stripped(nonce);
    return verdictOf(policies, function (policy, index) {
      var found = operative(policy, 'script-src-elem');
      if (!found) return null;
      if (nonceMatches(found.list, nonce)) return null;
      if (!parserInserted && found.list.dynamic) return null;
      if (url && listAllows(found.list, selfUrl, url)) {
        if (!found.list.dynamic) return null;
        return urlViolation(policies, index, 'script-src-elem', found, url, true);
      }
      return urlViolation(policies, index, 'script-src-elem', found, url || urlOf('about:blank'), false);
    });
  };
  var request = function (policies, self, kind, address) {
    var selfUrl = urlOf(self);
    var url = urlOf(address);
    return verdictOf(policies, function (policy, index) {
      var found = operative(policy, kind);
      if (!found) return null;
      if (url && listAllows(found.list, selfUrl, url)) return null;
      return urlViolation(policies, index, kind, found, url || urlOf('about:blank'), false);
    });
  };
  var hashMatches = function (list, hash) {
    var digest = digestOf(slice(hash, 7));
    for (var i = 0; i < list.hashes.length; i++) if (list.hashes[i].algorithm === 'sha256' && list.hashes[i].digest === digest) return true;
    return false;
  };
  var allowAllInline = function (name, list) {
    return list.inline && !list.nonces.length && !list.hashes.length && (!isScriptDirective(name) || !list.dynamic);
  };
  /* ContentSecurityPolicy::AllowInline: per policy, a matching hash, or CSPDirectiveListAllowInline (a nonce for a script,
     else every inline allowed, else CheckInlineAndReportViolation's line) */
  var inline = function (policies, kind, text, nonce, parserInserted) {
    var effective = kind === 'handler' ? 'script-src-attr' : 'script-src-elem';
    text = toText(text);
    nonce = stripped(nonce);
    var hash = hashOf(text);
    return verdictOf(policies, function (policy, index) {
      var found = operative(policy, effective);
      if (!found) return null;
      if ((kind === 'script' || found.list.unsafeHashes) && hashMatches(found.list, hash)) return null;
      if (kind === 'script' && nonceMatches(found.list, nonce)) return null;
      /* an inline script a script added (not the parser) runs under 'strict-dynamic' (CSPDirectiveListAllowInline) */
      if (kind === 'script' && parserInserted === false && found.list.dynamic) return null;
      if (allowAllInline(found.name, found.list)) return null;
      var suffix;
      if (found.list.inline && (found.list.nonces.length || found.list.hashes.length)) {
        suffix = ' Note that \'unsafe-inline\' is ignored if either a hash or nonce value is present in the source list.';
      } else {
        suffix = ' Either the \'unsafe-inline\' keyword, a hash (\'' + (kind === 'handler' ? 'sha256-...' : hash) + '\'), or a nonce (\'nonce-...\') is required to enable inline execution.';
        if (kind === 'handler' && !found.list.unsafeHashes) suffix += ' Note that hashes do not apply to event handlers, style attributes and javascript: navigations unless the \'unsafe-hashes\' keyword is present.';
        if (found.name === 'default-src') suffix += ' Note also that \'script-src\' was not explicitly set, so \'default-src\' is used as a fallback.';
      }
      var what = kind === 'handler' ? 'Executing inline event handler' : 'Executing inline script';
      return violation(policies, index, effective, found.name, 'inline', what + ' violates the following Content Security Policy directive \'' + rawDirective(policy, found.name) + '\'.' + suffix, found.list.sample ? slice(text, 0, 40) : '');
    });
  };

  /* --- framing (ancestor_throttle.cc, x_frame_options_parser.cc) --------------------------------------------------- */
  var xfoOf = function (values) {
    var result = 'none';
    var all = [];
    for (var i = 0; i < values.length; i++) {
      var parts = splitText(toText(values[i]), ',');
      for (var j = 0; j < parts.length; j++) put(all, parts[j]);
    }
    for (var k = 0; k < all.length; k++) {
      var value = lower(trimText(all[k]));
      var current = value === 'deny' ? 'deny' : value === 'allowall' ? 'allowall' : value === 'sameorigin' ? 'sameorigin' : 'invalid';
      if (result === 'none') result = current;
      else if (result !== current) result = 'conflict';
    }
    return result;
  };
  var frameAncestorsText = function (policy) {
    var value = tokens(policy.raw['frame-ancestors']);
    var text = 'frame-ancestors';
    for (var i = 0; i < value.length; i++) text += ' ' + value[i];
    return value.length ? text : text + ' \'none\'';
  };
  var frame = function (policies, xfoValues, address, ancestors) {
    var url = urlOf(address);
    var origin = originOf(url) + '/';
    var lines = [];
    var violations = [];
    var allowed = true;
    var hasFrameAncestors = false;
    for (var i = 0; i < policies.length; i++) {
      var policy = policies[i];
      if (policy.source !== 'header' || !hasOwn(policy.lists, 'frame-ancestors')) continue;
      if (policy.type === 'enforce') hasFrameAncestors = true;
      for (var a = 0; a < ancestors.length; a++) {
        var ancestor = urlOf(ancestors[a]);
        if (ancestor && listAllows(policy.lists['frame-ancestors'], url, ancestor)) continue;
        var text = 'Framing \'' + origin + '\' violates the following ' + (policy.type === 'report' ? 'report-only ' : '') + 'Content Security Policy directive: "' + frameAncestorsText(policy) + '". ' + (policy.type === 'report' ? 'The violation has been logged, but no further action has been taken.' : 'The request has been blocked.');
        var line = { level: 'error', text: text };
        put(lines, line);
        put(violations, { policy: i, effective: 'frame-ancestors', directive: 'frame-ancestors', blocked: origin, disposition: policy.type, line: line, sample: '' });
        if (policy.type === 'enforce') allowed = false;
        break;
      }
    }
    if (!allowed) return { allowed: false, lines: lines, violations: violations, by: 'frame-ancestors' };
    var xfo = xfoOf(xfoValues);
    if (xfo !== 'none' && xfo !== 'allowall' && hasFrameAncestors) return { allowed: true, lines: lines, violations: violations, by: null };
    var shown = '';
    for (var v = 0; v < xfoValues.length; v++) shown += (v ? ', ' : '') + trimText(toText(xfoValues[v]));
    if (xfo === 'conflict') {
      put(lines, { level: 'error', text: 'Refused to display \'' + origin + '\' in a frame because it set multiple \'X-Frame-Options\' headers with conflicting values (\'' + shown + '\'). Falling back to \'deny\'.' });
      return { allowed: false, lines: lines, violations: violations, by: 'x-frame-options' };
    }
    if (xfo === 'invalid') {
      put(lines, { level: 'error', text: 'Invalid \'X-Frame-Options\' header encountered when loading \'' + origin + '\': \'' + shown + '\' is not a recognized directive. The header will be ignored.' });
      return { allowed: true, lines: lines, violations: violations, by: null };
    }
    var refused = xfo === 'deny';
    if (xfo === 'sameorigin') {
      for (var s = 0; s < ancestors.length; s++) {
        var parent = urlOf(ancestors[s]);
        if (!parent || originOf(parent) !== originOf(url)) { refused = true; break; }
      }
    }
    if (refused) {
      put(lines, { level: 'error', text: 'Refused to display \'' + origin + '\' in a frame because it set \'X-Frame-Options\' to \'' + xfo + '\'.' });
      return { allowed: false, lines: lines, violations: violations, by: 'x-frame-options' };
    }
    return { allowed: true, lines: lines, violations: violations, by: null };
  };

  /* --- a script's type (allowed_by_nosniff.cc), Referrer-Policy (referrer_policy.cc, the Referrer Policy spec) ------ */
  var JS_TYPES = ['application/ecmascript', 'application/javascript', 'application/x-ecmascript', 'application/x-javascript', 'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2', 'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5', 'text/jscript', 'text/livescript', 'text/x-ecmascript', 'text/x-javascript'];
  var essence = function (type) {
    if (type === null || type === undefined) return '';
    var semi = indexOf(toText(type), ';');
    return lower(trimText(semi === -1 ? toText(type) : slice(toText(type), 0, semi)));
  };
  var scriptType = function (address, contentType, nosniff, module) {
    var mime = essence(contentType);
    if (module) {
      if (has(JS_TYPES, mime)) return null;
      return { level: 'error', text: 'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "' + mime + '". Strict MIME type checking is enforced for module scripts per HTML spec.' };
    }
    if (startsWith(mime, 'image/') || startsWith(mime, 'audio/') || startsWith(mime, 'video/') || mime === 'text/csv') {
      return { level: 'error', text: 'Refused to execute script from \'' + address + '\' because its MIME type (\'' + mime + '\') is not executable.' };
    }
    if (nosniff && !has(JS_TYPES, mime)) {
      return { level: 'error', text: 'Refused to execute script from \'' + address + '\' because its MIME type (\'' + mime + '\') is not executable, and strict MIME type checking is enabled.' };
    }
    return null;
  };
  var nosniff = function (values) {
    if (!values.length) return false;
    var first = splitText(toText(values[0]), ',')[0];
    return lower(trimText(first)) === 'nosniff';
  };
  var POLICIES = ['no-referrer', 'no-referrer-when-downgrade', 'same-origin', 'origin', 'strict-origin', 'origin-when-cross-origin', 'strict-origin-when-cross-origin', 'unsafe-url'];
  var referrerPolicy = function (values, meta) {
    var chosen = '';
    for (var i = 0; i < values.length; i++) {
      /* a meta tag's content is one token (HTML's "the referrer metadata name"), a header a list */
      var parts = meta ? [toText(values[i])] : splitText(toText(values[i]), ',');
      for (var j = 0; j < parts.length; j++) {
        var token = lower(trimText(parts[j]));
        /* a meta tag also takes the old names */
        if (meta) token = token === 'never' ? 'no-referrer' : token === 'default' ? 'strict-origin-when-cross-origin' : token === 'always' ? 'unsafe-url' : token === 'origin-when-crossorigin' ? 'origin-when-cross-origin' : token;
        if (has(POLICIES, token)) chosen = token;
      }
    }
    return chosen;
  };
  var referrer = function (policy, page, target) {
    var from = urlOf(page);
    var to = urlOf(target);
    if (!from || !to) return null;
    var whole = originOf(from) + pathnameOf(from) + searchOf(from);
    var origin = originOf(from) + '/';
    var same = originOf(from) === originOf(to);
    var downgrade = protocolOf(from) === 'https:' && protocolOf(to) !== 'https:';
    switch (policy || 'strict-origin-when-cross-origin') {
      case 'no-referrer': return null;
      case 'no-referrer-when-downgrade': return downgrade ? null : whole;
      case 'same-origin': return same ? whole : null;
      case 'origin': return origin;
      case 'strict-origin': return downgrade ? null : origin;
      case 'origin-when-cross-origin': return same ? whole : origin;
      case 'unsafe-url': return whole;
      default: return same ? whole : downgrade ? null : origin;
    }
  };

  /* --- report-uri (Chrome's legacy report: ContentSecurityPolicy::PostViolationReport's fields) -------------------- */
  /* the address without its fragment, as Chrome strips it for a report */
  var withoutFragment = function (address) {
    var at = indexOf(address, '#');
    return at === -1 ? address : slice(address, 0, at);
  };
  var report = function (policy, found, page, status, line) {
    var where = typeof line === 'number' && line >= 1
      ? ',"line-number":' + stringify(line) + ',"source-file":' + stringify(withoutFragment(page))
      : '';
    var body = '{"csp-report":{"document-uri":' + stringify(withoutFragment(page)) +
      ',"referrer":""' +
      ',"violated-directive":' + stringify(found.effective) +
      ',"effective-directive":' + stringify(found.effective) +
      ',"original-policy":' + stringify(policy.text) +
      ',"disposition":' + stringify(found.disposition) +
      ',"blocked-uri":' + stringify(found.blocked === 'inline' ? 'inline' : withoutFragment(found.blocked)) +
      where +
      ',"status-code":' + stringify(status) +
      ',"script-sample":' + stringify(found.sample) + '}}';
    return body;
  };

  return {
    parse: parse,
    script: script,
    inline: inline,
    request: request,
    frame: frame,
    scriptType: scriptType,
    nosniff: nosniff,
    referrerPolicy: referrerPolicy,
    referrer: referrer,
    report: report,
    hash: hashOf
  };
})`
