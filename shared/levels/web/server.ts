// The level's API server (ADR 0009; docs/features/levels.md "The server"): `server.js` is a file of the level, written
// like a small Node server with Express, that the learner reads and fixes. It is learner code, so it runs where the
// app's code runs, never on Grindstone's page: in a **worker** inside the sealed frame (the frame's opaque origin and
// Content-Security-Policy hold there too: no network, no storage, no parent). A worker, not the frame's own thread, so
// an endless loop in a route can be stopped from outside: a **watchdog** in the frame ends a worker that has not
// answered in time and starts a fresh one for the next request.
//
// Three parts, each JavaScript in a string (block comments only, every statement ends with a semicolon):
// - SERVER_RUNTIME_SOURCE: `express()` (a subset: routes by method and path with `:params`, `app.use` middleware,
//   `express.json()`, Express 5's automatic OPTIONS answer and 404 page, errors as 500) and the request and response
//   objects. Pure over messages: `handle(request, answer)`. The unit tests run this very source on Node.
// - the worker's prelude: the runtime, `require('express')`, the console captured for the Server panel, and the
//   message listener; the worker's script is the prelude, a line break, then server.js as written (its line N is the
//   worker's line N + 1, so errors point at server.js's own lines).
// - SERVER_HOST_SOURCE: the frame's side, part of the web backend: it makes the worker from a blob, sends it each
//   request, reads what it posts field by field (the worker runs learner code: nothing it posts is trusted), caps it,
//   and runs the watchdog.

import { WEB_CLOCK } from './cookies'
import { JWT_SOURCE } from './tokens'

/** What one load's server may do and how long it may take; the frame and the page read the same numbers. */
export const SERVER_LIMITS = {
  /** Milliseconds a request may take in server.js before the watchdog stops the worker (it never answered). */
  answerMs: 1000,
  /** Fresh workers after one that did not answer; then the server stays down for this load. */
  maxRestarts: 3,
  /** Headers one answer may set. */
  maxHeaders: 40,
  /** Characters of a header's name and value. */
  maxHeaderName: 100,
  maxHeaderValue: 2000,
  /** Characters of an answer's body. */
  maxBody: 100_000,
  /** Lines the Server panel gets from one load (access lines, the server's console, errors). */
  maxOutput: 300,
  /** Characters of one such line. */
  maxOutputText: 500,
  /**
   * The scripted clock (ms) a load starts at: `res.cookie`'s Expires for a `maxAge` counts from it, as the cookie jar does,
   * and so do jsonwebtoken's iat and exp. Chapter 3 moves it (`{ later }`): each request then carries the moment it is
   * answered at.
   */
  clock: WEB_CLOCK
} as const

/**
 * A Date that tells the scripted time (chapter 3: the page's and server.js's `new Date()` and `Date.now()` follow the
 * clock `{ later }` moves): `(RealDate, now) => Date`. A date made from arguments, `Date.UTC` and `Date.parse` are the
 * real ones; it shares the real Date's prototype, so `instanceof Date` holds both ways.
 */
export const SCRIPTED_DATE_SOURCE = String.raw`(function (RealDate, now) {
  var construct = Reflect.construct;
  var slice = Array.prototype.slice;
  var Scripted = function Date() {
    if (!new.target) return new RealDate(now()).toString();
    return construct(RealDate, arguments.length === 0 ? [now()] : slice.call(arguments), new.target);
  };
  Scripted.prototype = RealDate.prototype;
  Scripted.now = function () { return now(); };
  Scripted.parse = RealDate.parse;
  Scripted.UTC = RealDate.UTC;
  return Scripted;
})`

/**
 * Puts the scripted Date on a global (the frame's window, the worker's self) and closes the other ways to the real
 * time that are cheap to close: `new Date().constructor.now()` (the prototype's constructor is the scripted Date),
 * `Intl.DateTimeFormat`'s `format()` and `formatToParts()` without a date (they format the scripted now), and
 * `performance.timeOrigin` (plus `performance.now()` it gives the scripted now). `(global, Scripted, now) => void`.
 */
export const SCRIPTED_TIME_SOURCE = String.raw`(function (global, Scripted, now) {
  var RealDate = Object.getPrototypeOf(new Scripted(0)).constructor;
  var defineProperty = Object.defineProperty;
  var describe = Object.getOwnPropertyDescriptor;
  global.Date = Scripted;
  try { defineProperty(RealDate.prototype, 'constructor', { value: Scripted, writable: true, configurable: true, enumerable: false }); } catch (error) { /* kept */ }
  var Format = global.Intl && global.Intl.DateTimeFormat;
  if (typeof Format === 'function') {
    var proto = Format.prototype;
    var format = describe(proto, 'format');
    if (format && typeof format.get === 'function') {
      var getFormat = format.get;
      defineProperty(proto, 'format', { configurable: true, enumerable: false, get: function () {
        var bound = getFormat.call(this);
        return function (date) { return bound(date === undefined ? now() : date); };
      } });
    }
    var parts = describe(proto, 'formatToParts');
    if (parts && typeof parts.value === 'function') {
      var toParts = parts.value;
      defineProperty(proto, 'formatToParts', { configurable: true, writable: true, enumerable: false, value: function formatToParts(date) { return toParts.call(this, date === undefined ? now() : date); } });
    }
  }
  var timing = global.performance;
  if (timing && typeof timing.now === 'function') {
    var perfNow = timing.now.bind(timing);
    try { defineProperty(timing, 'timeOrigin', { configurable: true, enumerable: true, get: function () { return now() - perfNow(); } }); } catch (error) { /* kept */ }
  }
})`

export type ServerLimits = typeof SERVER_LIMITS

/** A request as the server gets it. */
export interface ServerRequest {
  method: string
  /** The whole address, `https://api.cornerbakery.shop/menu?x=1`. */
  url: string
  headers: [string, string][]
  body: string | null
}

/** The server's answer. */
export interface ServerAnswer {
  status: number
  headers: [string, string][]
  body: string | null
}

/** A line for the Server panel: an access line, the server's own console, or an error (with its line in server.js). */
export interface ServerOutput {
  level: 'access' | 'log' | 'warn' | 'error'
  text: string
  /** A line of server.js (an error's), or null. */
  line: number | null
}

/** The runtime as the unit tests and the worker use it. */
export interface ServerRuntime {
  /** `require('express')`: makes the app server.js configures. */
  express: () => unknown
  /** Answers one request with the app server.js made (the first one), at `now` on the scripted clock: calls `answer` once. */
  handle: (request: ServerRequest & { now?: number }, answer: (result: ServerAnswer) => void) => void
  /** `require(name)` for server.js: express, jsonwebtoken, cookie-parser, crypto. */
  require: (name: string) => unknown
  /** A Date on the scripted clock (what server.js gets as `Date` when the level's time moves). */
  Date: DateConstructor
  /** The scripted time (ms). */
  now: () => number
}

export const SERVER_RUNTIME_SOURCE = String.raw`(function (limits, emit) {
  'use strict';
  var apps = [];
  /* The scripted time: where the load's clock starts, then the moment each request is answered at (chapter 3 moves it). */
  var clockNow = limits.clock;
  var now = function () { return clockNow; };
  var ScriptedDate = (${SCRIPTED_DATE_SOURCE})(Date, now);
  /* jsonwebtoken (tokens.ts), on the scripted clock */
  var jwt = (${JWT_SOURCE})(now).module;
  /* crypto.randomUUID(), scripted: the same ids on every run (a real server's are random), a version 4 UUID's form */
  var seed = [0x9e3779b9, 0x243f6a88, 0xb7e15162, 0x6a09e667];
  var next32 = function () {
    var t = seed[3];
    var first = seed[0];
    seed[3] = seed[2];
    seed[2] = seed[1];
    seed[1] = first;
    t ^= t << 11;
    t ^= t >>> 8;
    seed[0] = (t ^ first ^ (first >>> 19)) >>> 0;
    return seed[0];
  };
  var randomUUID = function () {
    var bytes = [];
    for (var i = 0; i < 4; i++) {
      var word = next32();
      bytes.push(word >>> 24, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = bytes.map(function (byte) { return (byte < 16 ? '0' : '') + byte.toString(16); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  };
  /* cookie-parser: req.cookies from the Cookie header (each value URI-decoded, a j: value read as JSON, the first of a
     name wins); signed cookies are not here (req.signedCookies stays empty) */
  var cookieParser = function () {
    return function cookieParser(req, res, next) {
      if (req.cookies) return next();
      var cookies = {};
      String(req.get('cookie') || '').split(/; */).forEach(function (pair) {
        var at = pair.indexOf('=');
        if (at < 0) return;
        var name = pair.slice(0, at).trim();
        if (!name || Object.prototype.hasOwnProperty.call(cookies, name)) return;
        var value = pair.slice(at + 1).trim();
        if (value.charAt(0) === '"' && value.charAt(value.length - 1) === '"' && value.length > 1) value = value.slice(1, -1);
        try { value = decodeURIComponent(value); } catch (error) { /* kept as it came */ }
        if (value.slice(0, 2) === 'j:') { try { value = JSON.parse(value.slice(2)); } catch (error) { /* kept as text */ } }
        cookies[name] = value;
      });
      req.cookies = cookies;
      req.signedCookies = {};
      next();
    };
  };
  var MODULES = { 'jsonwebtoken': jwt, 'cookie-parser': cookieParser, 'crypto': { randomUUID: randomUUID }, 'node:crypto': { randomUUID: randomUUID } };
  /* SHA-1 (FIPS 180-4) over UTF-8 bytes, base64: what the etag package hashes a body with */
  var sha1Base64 = function (text) {
    var bytes = new TextEncoder().encode(text);
    var length = bytes.length;
    var padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[length] = 0x80;
    var bits = length * 8;
    for (var b = 0; b < 8; b++) padded[padded.length - 1 - b] = (bits / Math.pow(2, 8 * b)) & 0xff;
    var h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
    var w = new Array(80);
    for (var offset = 0; offset < padded.length; offset += 64) {
      for (var t = 0; t < 16; t++) w[t] = (padded[offset + 4 * t] << 24) | (padded[offset + 4 * t + 1] << 16) | (padded[offset + 4 * t + 2] << 8) | padded[offset + 4 * t + 3];
      for (t = 16; t < 80; t++) { var x = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16]; w[t] = (x << 1) | (x >>> 31); }
      var a = h[0], c1 = h[1], c2 = h[2], d = h[3], e = h[4];
      for (t = 0; t < 80; t++) {
        var f = t < 20 ? (c1 & c2) | (~c1 & d) : t < 40 ? c1 ^ c2 ^ d : t < 60 ? (c1 & c2) | (c1 & d) | (c2 & d) : c1 ^ c2 ^ d;
        var k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6;
        var temp = (((a << 5) | (a >>> 27)) + f + e + k + w[t]) | 0;
        e = d; d = c2; c2 = (c1 << 30) | (c1 >>> 2); c1 = a; a = temp;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + c1) | 0; h[2] = (h[2] + c2) | 0; h[3] = (h[3] + d) | 0; h[4] = (h[4] + e) | 0;
    }
    var digest = [];
    for (var i = 0; i < 5; i++) digest.push(h[i] >>> 24, (h[i] >>> 16) & 0xff, (h[i] >>> 8) & 0xff, h[i] & 0xff);
    var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var out = '';
    for (var j = 0; j < digest.length; j += 3) {
      var n = (digest[j] << 16) | ((j + 1 < digest.length ? digest[j + 1] : 0) << 8) | (j + 2 < digest.length ? digest[j + 2] : 0);
      out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + (j + 1 < digest.length ? ALPHABET[(n >> 6) & 63] : '=') + (j + 2 < digest.length ? ALPHABET[n & 63] : '=');
    }
    return { bytes: length, base64: out };
  };
  /* Express's ETag (the etag package): the body's length in bytes in hex and the first 27 characters of its SHA-1 in
     base64, quoted; W/ in front for Express's default, weak */
  var entityTag = function (body, weak) {
    var hash = sha1Base64(body);
    var tag = '"' + hash.bytes.toString(16) + '-' + hash.base64.slice(0, 27) + '"';
    return weak ? 'W/' + tag : tag;
  };
  /* the fresh package (Express's req.fresh): a conditional request whose If-None-Match names this ETag (W/ or not), or
     whose If-Modified-Since is not before Last-Modified, unless it says Cache-Control: no-cache (a reload) */
  var parseTokenList = function (text) {
    var list = [];
    var start = 0;
    var end = 0;
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code === 0x20) { if (start === end) start = end = i + 1; }
      else if (code === 0x2c) { list.push(text.substring(start, end)); start = end = i + 1; }
      else end = i + 1;
    }
    list.push(text.substring(start, end));
    return list;
  };
  var isFresh = function (reqHeaders, etag, lastModified) {
    var modifiedSince = reqHeaders['if-modified-since'];
    var noneMatch = reqHeaders['if-none-match'];
    if (!modifiedSince && !noneMatch) return false;
    var cacheControl = reqHeaders['cache-control'];
    if (cacheControl && /(?:^|,)\s*?no-cache\s*?(?:,|$)/.test(cacheControl)) return false;
    if (noneMatch) {
      if (noneMatch === '*') return true;
      if (!etag) return false;
      var matches = parseTokenList(noneMatch);
      for (var i = 0; i < matches.length; i++) {
        var match = matches[i];
        if (match === etag || match === 'W/' + etag || 'W/' + match === etag) return true;
      }
      return false;
    }
    var modified = Date.parse(lastModified);
    var since = Date.parse(modifiedSince);
    return !(!lastModified || !(modified <= since));
  };
  var STATUS = limits.statusText || {};
  var TOKEN = /^[!#$%&'*+.^_\x60|~0-9A-Za-z-]+$/;
  /* Where an error happened in server.js: the first frame of the worker's own script past the prelude (line 1), as
     server.js's line (the worker's line minus one). */
  var lineOf = function (error) {
    var stack = error && typeof error.stack === 'string' ? error.stack : '';
    var at = limits.scriptUrl ? stack.split(limits.scriptUrl + ':') : [];
    for (var i = 1; i < at.length; i++) {
      var match = /^(\d+):\d+/.exec(at[i]);
      if (match && Number(match[1]) > 1) return Number(match[1]) - 1;
    }
    return null;
  };
  var describe = function (error) {
    if (error && typeof error === 'object' && typeof error.message === 'string') return (error.name ? String(error.name) + ': ' : '') + error.message;
    return 'Uncaught ' + String(error);
  };
  var cut = function (text, max) { text = String(text); return text.length > max ? text.slice(0, max) + '…' : text; };

  /* A route's path as a pattern: /basket/lines/:id matches /basket/lines/2 with params.id '2'; a trailing slash is
     optional (Express is not strict). A prefix (app.use) also matches what lies below it. */
  var compile = function (path, prefix) {
    var keys = [];
    var parts = String(path).replace(/\/+$/, '').split('/');
    var source = parts.map(function (part) {
      if (part.charAt(0) === ':') { keys.push(part.slice(1)); return '([^/]+)'; }
      return part.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
    }).join('/');
    return { keys: keys, pattern: new RegExp('^' + source + (prefix ? '(?:/|$)' : '/?$')) };
  };
  var matchPath = function (layer, path) {
    if (layer.path === null) return {};
    var match = layer.compiled.pattern.exec(path);
    if (!match) return null;
    var params = {};
    for (var i = 0; i < layer.compiled.keys.length; i++) {
      try { params[layer.compiled.keys[i]] = decodeURIComponent(match[i + 1]); } catch (error) { params[layer.compiled.keys[i]] = match[i + 1]; }
    }
    return params;
  };

  var makeApp = function () {
    var layers = [];
    var app = {};
    var route = function (method) {
      return function (path) {
        if (method === 'GET' && arguments.length === 1 && typeof path === 'string') return settings[path];
        var handlers = Array.prototype.slice.call(arguments, 1).filter(function (each) { return typeof each === 'function'; });
        if (typeof path !== 'string') throw new TypeError('app.' + method.toLowerCase() + '() needs a path first, like \'/menu\'');
        if (!handlers.length) throw new TypeError('app.' + method.toLowerCase() + '() needs a function to answer with');
        layers.push({ method: method, path: path, compiled: compile(path, false), handlers: handlers });
        return app;
      };
    };
    ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].forEach(function (method) { app[method.toLowerCase()] = route(method); });
    app.all = route('ALL');
    app.use = function (path) {
      var hasPath = typeof path === 'string';
      var handlers = Array.prototype.slice.call(arguments, hasPath ? 1 : 0).filter(function (each) { return typeof each === 'function'; });
      layers.push({ method: 'USE', path: hasPath ? path : null, compiled: hasPath ? compile(path, true) : null, handlers: handlers });
      return app;
    };
    app.listen = function () {
      for (var i = 0; i < arguments.length; i++) if (typeof arguments[i] === 'function') arguments[i]();
      return app;
    };
    /* settings: only 'etag' changes anything here (true or 'weak': Express's default; 'strong'; false: none) */
    var settings = { etag: 'weak' };
    app.set = function (name, value) {
      if (arguments.length === 1) return settings[name];
      if (name === 'etag') {
        if (value === true || value === 'weak') settings.etag = 'weak';
        else if (value === 'strong') settings.etag = 'strong';
        else if (value === false) settings.etag = false;
        else throw new TypeError(typeof value === 'function' ? 'this trainer\'s app.set(\'etag\') takes true, false, \'weak\' or \'strong\', not a function' : 'unknown value for etag function: ' + String(value));
      } else settings[name] = value;
      return app;
    };
    app.enable = function (name) { return app.set(name, true); };
    app.disable = function (name) { return app.set(name, false); };
    app.enabled = function (name) { return Boolean(settings[name]); };
    app.disabled = function (name) { return !settings[name]; };
    app.settings = settings;
    app.layers = layers;
    return app;
  };

  var express = function () {
    var app = makeApp();
    apps.push(app);
    return app;
  };
  /* The body as it came, kept beside the request (not on it: Express has no req.rawBody either). */
  var rawBodies = new WeakMap();
  /* express.json(): reads a JSON body (Content-Type application/json) into req.body; text it can't read is a 400. Any
     other body stays unread: req.body is undefined, as in Express 5. This subset takes no options (type, limit, …):
     given some, it says so in the Server panel and still reads application/json only. */
  express.json = function (options) {
    if (options !== undefined) emit({ level: 'warn', text: 'express.json(): this trainer\'s express.json() takes no options; it reads application/json bodies only.', line: lineOf(new Error()) });
    return function jsonParser(req, res, next) {
      var type = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
      var raw = rawBodies.get(req);
      if (req.body !== undefined || type !== 'application/json' || raw === null || raw === undefined) return next();
      try { req.body = JSON.parse(raw); } catch (error) {
        var problem = new SyntaxError(error && error.message ? error.message : 'Unexpected token in JSON');
        problem.status = 400;
        return next(problem);
      }
      next();
    };
  };

  /* express.urlencoded(): reads a form's body (Content-Type application/x-www-form-urlencoded) into req.body, a name
     given twice as a list (Express 5's simple parser, extended: false; options are taken and not needed). Any other
     body stays unread. */
  express.urlencoded = function () {
    return function urlencodedParser(req, res, next) {
      var type = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
      var raw = rawBodies.get(req);
      if (req.body !== undefined || type !== 'application/x-www-form-urlencoded' || raw === null || raw === undefined) return next();
      var body = {};
      String(raw).split('&').forEach(function (pair) {
        if (!pair) return;
        var at = pair.indexOf('=');
        var key = at < 0 ? pair : pair.slice(0, at);
        var value = at < 0 ? '' : pair.slice(at + 1);
        try { key = decodeURIComponent(key.replace(/\+/g, ' ')); value = decodeURIComponent(value.replace(/\+/g, ' ')); } catch (error) { return; }
        if (!Object.prototype.hasOwnProperty.call(body, key)) body[key] = value;
        else if (Array.isArray(body[key])) body[key].push(value);
        else body[key] = [body[key], value];
      });
      req.body = body;
      next();
    };
  };

  var parseQuery = function (search) {
    var query = {};
    if (!search) return query;
    search.split('&').forEach(function (pair) {
      if (!pair) return;
      var at = pair.indexOf('=');
      var key = at < 0 ? pair : pair.slice(0, at);
      var value = at < 0 ? '' : pair.slice(at + 1);
      try { key = decodeURIComponent(key.replace(/\+/g, ' ')); value = decodeURIComponent(value.replace(/\+/g, ' ')); } catch (error) { return; }
      query[key] = value;
    });
    return query;
  };

  var makeRequest = function (request) {
    var url = new URL(request.url);
    /* req.headers in one fixed order (by name), whoever sent the request: the order a request's headers came in tells
       server.js nothing (a thief sending what it took is not told apart by how it lists its headers) */
    var joined = {};
    request.headers.forEach(function (pair) {
      var name = String(pair[0]).toLowerCase();
      joined[name] = joined[name] === undefined ? String(pair[1]) : joined[name] + ', ' + String(pair[1]);
    });
    var headers = {};
    Object.keys(joined).sort().forEach(function (name) { headers[name] = joined[name]; });
    var req = {
      method: request.method,
      url: url.pathname + url.search,
      originalUrl: url.pathname + url.search,
      path: url.pathname,
      hostname: url.hostname,
      protocol: url.protocol.replace(':', ''),
      secure: url.protocol === 'https:',
      query: parseQuery(url.search.slice(1)),
      params: {},
      headers: headers,
      body: undefined,
      get: function (name) { return headers[String(name).toLowerCase()]; }
    };
    req.header = req.get;
    req.app = apps[0] || null;
    rawBodies.set(req, request.body);
    return req;
  };

  var makeResponse = function (req, finish) {
    var headers = [];
    var res = { headersSent: false, locals: {} };
    /* A status outside what an answer can carry fails where it is set (Node: ERR_HTTP_INVALID_STATUS_CODE "Invalid
       status code: 99"), also as res.statusCode = 99, so the error names that line. */
    var status = 200;
    var checkStatus = function (code) {
      if (typeof code === 'number' && code % 1 === 0 && code >= 200 && code <= 599) return;
      var inNode = typeof code === 'number' && code % 1 === 0 && code >= 100 && code <= 999;
      throw new RangeError('Invalid status code: ' + String(code) + (inNode ? ' (this trainer answers with 200 to 599)' : ''));
    };
    Object.defineProperty(res, 'statusCode', {
      enumerable: true,
      get: function () { return status; },
      set: function (code) { checkStatus(code); status = code; }
    });
    var checkName = function (name) {
      if (typeof name !== 'string' || !TOKEN.test(name) || name.length > limits.maxHeaderName) throw new TypeError('Header name must be a valid HTTP token ["' + cut(name, 60) + '"]');
    };
    var checkValue = function (name, value) {
      if (value === undefined) throw new TypeError('Invalid value "undefined" for header "' + name + '"');
      var text = String(value);
      /* Node's rule (checkInvalidHeaderChar): a tab, visible ASCII and Latin-1 only; a line break or a ☕ is ERR_INVALID_CHAR */
      if (/[^\t\x20-\x7e\x80-\xff]/.test(text)) throw new TypeError('Invalid character in header content ["' + name + '"]');
      if (text.length > limits.maxHeaderValue) throw new RangeError('The value of header "' + name + '" is too long for this trainer');
      return text;
    };
    var notSent = function () {
      if (res.headersSent) throw new Error('Cannot set headers after they are sent to the client');
    };
    var remove = function (name) {
      var key = name.toLowerCase();
      for (var i = headers.length - 1; i >= 0; i--) if (headers[i][0] === key) headers.splice(i, 1);
    };
    var add = function (name, value) {
      if (headers.length >= limits.maxHeaders) throw new RangeError('Too many headers for this trainer (' + limits.maxHeaders + ')');
      headers.push([name.toLowerCase(), checkValue(name, value)]);
    };
    var setOne = function (name, value) {
      checkName(name);
      notSent();
      remove(name);
      if (Array.isArray(value)) value.forEach(function (each) { add(name, each); });
      else add(name, value);
    };
    res.status = function (code) {
      res.statusCode = code;
      return res;
    };
    res.set = function (name, value) {
      if (name && typeof name === 'object') { Object.keys(name).forEach(function (key) { setOne(key, name[key]); }); return res; }
      setOne(name, value);
      return res;
    };
    res.header = res.set;
    res.setHeader = function (name, value) { setOne(name, value); return res; };
    res.append = function (name, value) {
      checkName(name);
      notSent();
      if (Array.isArray(value)) value.forEach(function (each) { add(name, each); });
      else add(name, value);
      return res;
    };
    res.get = function (name) {
      var key = String(name).toLowerCase();
      var values = headers.filter(function (pair) { return pair[0] === key; }).map(function (pair) { return pair[1]; });
      return values.length ? values.join(', ') : undefined;
    };
    res.getHeader = res.get;
    res.removeHeader = function (name) { notSent(); remove(String(name)); return res; };
    res.vary = function (field) {
      var current = res.get('vary');
      var list = current ? current.split(/\s*,\s*/) : [];
      if (list.indexOf(field) < 0) list.push(field);
      setOne('Vary', list.join(', '));
      return res;
    };
    res.type = function (type) {
      setOne('Content-Type', type.indexOf('/') < 0 ? (type === 'json' ? 'application/json; charset=utf-8' : type === 'html' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8') : type);
      return res;
    };
    /* tagged: res.send's own way (res.json, res.sendStatus): Express 5 gives the body an ETag (in a level with a cache:
       limits.etag) and answers a conditional GET whose validator still matches with 304; res.end does neither */
    var send = function (body, type, tagged) {
      notSent();
      if (body !== null && body.length > limits.maxBody) throw new RangeError('The answer is too big for this trainer (over ' + limits.maxBody + ' characters)');
      if (body !== null && type && res.get('content-type') === undefined) add('Content-Type', type);
      if (tagged && limits.etag) {
        var mode = req.app ? req.app.settings.etag : 'weak';
        if (mode && body !== null && res.get('etag') === undefined) add('ETag', entityTag(body, mode === 'weak'));
        if (req.fresh) res.statusCode = 304;
      }
      if (res.statusCode === 204 || res.statusCode === 304) { remove('Content-Type'); remove('Content-Length'); remove('Transfer-Encoding'); }
      res.headersSent = true;
      finish({ status: res.statusCode, headers: headers.slice(), body: req.method === 'HEAD' || res.statusCode === 204 || res.statusCode === 304 ? null : body });
      return res;
    };
    res.json = function (value) {
      var text = JSON.stringify(value);
      return send(text === undefined ? '' : text, 'application/json; charset=utf-8', true);
    };
    res.send = function (body) {
      if (body === undefined || body === null) return send('', null, true);
      if (typeof body === 'object') return res.json(body);
      return send(String(body), 'text/html; charset=utf-8', true);
    };
    res.end = function (body) {
      return send(body === undefined || body === null ? null : String(body), null, false);
    };
    res.sendStatus = function (code) {
      res.status(code);
      return send(STATUS[code] || String(code), 'text/plain; charset=utf-8', true);
    };
    /* Express 5's res.cookie with the cookie module's serialize: the value URI-encoded (an object as j:JSON), Path=/
       unless given, maxAge in ms (Max-Age in seconds, and Expires that far from the scripted clock), the attributes in
       the module's order; a value the module refuses throws, as there. Signed cookies need cookie-parser: not here. */
    var COOKIE_NAME = /^[\x21-\x3a\x3c\x3e-\x7e]+$/;
    var COOKIE_VALUE = /^("?)[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*\1$/;
    var COOKIE_DOMAIN = /^([.]?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
    var COOKIE_PATH = /^[\x20-\x3a\x3d-\x7e]*$/;
    var serialize = function (name, value, options) {
      if (!COOKIE_NAME.test(name)) throw new TypeError('argument name is invalid');
      var encoded = encodeURIComponent(value);
      if (encoded && !COOKIE_VALUE.test(encoded)) throw new TypeError('argument val is invalid');
      var line = name + '=' + encoded;
      if (options.maxAge !== undefined && options.maxAge !== null) {
        if (!isFinite(options.maxAge)) throw new TypeError('option maxAge is invalid');
        line += '; Max-Age=' + Math.floor(options.maxAge);
      }
      if (options.domain) {
        if (!COOKIE_DOMAIN.test(options.domain)) throw new TypeError('option domain is invalid');
        line += '; Domain=' + options.domain;
      }
      if (options.path) {
        if (!COOKIE_PATH.test(options.path)) throw new TypeError('option path is invalid');
        line += '; Path=' + options.path;
      }
      if (options.expires) {
        if (!(options.expires instanceof Date) || isNaN(options.expires.valueOf())) throw new TypeError('option expires is invalid');
        line += '; Expires=' + options.expires.toUTCString();
      }
      if (options.httpOnly) line += '; HttpOnly';
      if (options.secure) line += '; Secure';
      if (options.partitioned) line += '; Partitioned';
      if (options.sameSite) {
        var mode = typeof options.sameSite === 'string' ? options.sameSite.toLowerCase() : options.sameSite;
        if (mode === true || mode === 'strict') line += '; SameSite=Strict';
        else if (mode === 'lax') line += '; SameSite=Lax';
        else if (mode === 'none') line += '; SameSite=None';
        else throw new TypeError('option sameSite is invalid');
      }
      return line;
    };
    res.cookie = function (name, value, options) {
      var opts = {};
      if (options && typeof options === 'object') Object.keys(options).forEach(function (key) { opts[key] = options[key]; });
      if (opts.signed) throw new Error('cookieParser("secret") required for signed cookies');
      var text = typeof value === 'object' && value !== null ? 'j:' + JSON.stringify(value) : String(value);
      if (opts.maxAge !== undefined && opts.maxAge !== null) {
        var age = opts.maxAge - 0;
        if (!isNaN(age)) {
          opts.expires = new Date(clockNow + age);
          opts.maxAge = Math.floor(age / 1000);
        }
      }
      if (opts.path === undefined || opts.path === null) opts.path = '/';
      return res.append('Set-Cookie', serialize(String(name), text, opts));
    };
    res.clearCookie = function (name, options) {
      var opts = { path: '/' };
      if (options && typeof options === 'object') Object.keys(options).forEach(function (key) { opts[key] = options[key]; });
      opts.expires = new Date(1);
      delete opts.maxAge;
      return res.cookie(name, '', opts);
    };
    /* res.redirect([status,] url): a Location and Express's short text; the browser here follows no redirect */
    res.redirect = function (first, second) {
      var code = typeof first === 'number' ? first : 302;
      var to = String(typeof first === 'number' ? second : first);
      res.status(code);
      setOne('Location', to);
      return send((STATUS[code] || String(code)) + '. Redirecting to ' + to, 'text/plain; charset=utf-8');
    };
    return res;
  };

  /* Express's last word (finalhandler): 404 "Cannot GET /path" for what no route answered, and for an error its status
     (a 4xx or 5xx it carries) or 500, with the error's message as the body. */
  var page = function (text) {
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>\n</body>\n</html>\n';
  };

  var handle = function (request, answer) {
    if (typeof request.now === 'number') clockNow = request.now;
    var done = false;
    var finish = function (result) {
      if (done) return;
      done = true;
      emit({ level: 'access', text: request.method + ' ' + req.url + ' ' + result.status, line: null });
      answer(result);
    };
    var req = makeRequest(request);
    var res = makeResponse(req, finish);
    /* Express's req.fresh: a GET or HEAD answered 2xx or 304 whose validators still match the request's conditions */
    Object.defineProperty(req, 'fresh', { enumerable: true, get: function () {
      if (req.method !== 'GET' && req.method !== 'HEAD') return false;
      var code = res.statusCode;
      if ((code >= 200 && code < 300) || code === 304) return isFresh(req.headers, res.get('etag'), res.get('last-modified'));
      return false;
    } });
    Object.defineProperty(req, 'stale', { enumerable: true, get: function () { return !req.fresh; } });
    var app = apps[0];
    if (!app) {
      res.statusCode = 404;
      res.set('Content-Type', 'text/html; charset=utf-8');
      return res.end(page('Cannot ' + request.method + ' ' + req.path));
    }
    var layers = app.layers;
    var allowed = [];
    /* where this request is in the app: the layer, the handler in it and the layer's params (each request its own) */
    var layerAt = 0;
    var handlerAt = 0;
    var params = {};
    var fail = function (error) {
      if (done) return;
      var status = error && typeof error === 'object' && typeof error.status === 'number' && error.status >= 400 && error.status <= 599 ? error.status : 500;
      if (status >= 500) emit({ level: 'error', text: cut(describe(error), limits.maxOutputText), line: lineOf(error) });
      try {
        res.statusCode = status;
        if (!res.headersSent) send500(status, error);
      } catch (problem) { finish({ status: status, headers: [], body: null }); }
    };
    var send500 = function (status, error) {
      res.statusCode = status;
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.end(page(status >= 500 ? describe(error) : (STATUS[status] || String(status))));
    };
    /* each handler in turn; next() goes on, next(error) skips to the error handlers (four parameters) */
    var takes = function (layer) {
      if (layer.method === 'USE' || layer.method === 'ALL' || layer.method === req.method) return true;
      return layer.method === 'GET' && req.method === 'HEAD';
    };
    var run = function (error) {
      if (done) return;
      while (layerAt < layers.length) {
        var layer = layers[layerAt];
        if (handlerAt === 0) {
          var found = matchPath(layer, req.path);
          if (found === null || !takes(layer)) {
            if (found !== null && layer.method !== 'USE' && layer.method !== 'ALL' && allowed.indexOf(layer.method) < 0) allowed.push(layer.method);
            layerAt += 1;
            continue;
          }
          params = found;
        }
        if (handlerAt >= layer.handlers.length) {
          layerAt += 1;
          handlerAt = 0;
          continue;
        }
        var handler = layer.handlers[handlerAt];
        handlerAt += 1;
        if ((error !== undefined) !== (handler.length === 4)) continue;
        req.params = params;
        call(handler, error);
        return;
      }
      if (error !== undefined) return fail(error);
      /* nothing answered: Express answers OPTIONS itself (with the methods it has for the path, and no CORS headers),
         anything else gets its 404 page */
      if (req.method === 'OPTIONS' && allowed.length) {
        if (allowed.indexOf('GET') >= 0 && allowed.indexOf('HEAD') < 0) allowed.push('HEAD');
        /* Express 5's router (sendOptionsResponse): the methods sorted, joined with ', ', as plain text */
        var list = allowed.slice().sort().join(', ');
        res.set('Allow', list);
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.set('X-Content-Type-Options', 'nosniff');
        return res.end(list);
      }
      res.statusCode = 404;
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.end(page('Cannot ' + req.method + ' ' + req.path));
    };
    var called = 0;
    var call = function (handler, error) {
      var mine = ++called;
      var next = function (problem) {
        if (mine !== called || done) return;
        if (problem === 'route' || problem === 'router') problem = undefined;
        run(problem === undefined || problem === null ? undefined : problem);
      };
      try {
        var result = error === undefined ? handler(req, res, next) : handler(error, req, res, next);
        /* Express 5: a promise a handler returns that rejects is an error too */
        if (result && typeof result.then === 'function') result.then(null, function (problem) { next(problem === undefined ? new Error('Rejected') : problem); });
      } catch (problem) {
        next(problem === undefined ? new Error('Thrown undefined') : problem);
      }
    };
    run(undefined);
  };

  /* require(name) for server.js: Express, and the packages chapter 3's servers use */
  var load = function (name) {
    if (name === 'express') return express;
    if (typeof name === 'string' && Object.prototype.hasOwnProperty.call(MODULES, name)) return MODULES[name];
    var error = new Error("Cannot find module '" + String(name) + "'");
    error.code = 'MODULE_NOT_FOUND';
    throw error;
  };

  return { express: express, handle: handle, lineOf: lineOf, describe: describe, require: load, Date: ScriptedDate, now: now };
})`

/**
 * The worker's script up to server.js (one line): the runtime with the limits, `require('express')`, the console sent
 * to the Server panel, an error of server.js's own top level reported once (the server "crashed": Node would stop), and
 * the requests. Messages to the frame: `{ t: 'res', id, status, headers, body }`, `{ t: 'out', level, text, line }`,
 * `{ t: 'crash', text, line }`.
 */
const WORKER_PRELUDE = String.raw`(function (limits) {
  'use strict';
  var post = self.postMessage.bind(self);
  var listen = self.addEventListener.bind(self);
  limits.scriptUrl = self.location.href;
  var outputs = 0;
  var emit = function (line) {
    outputs += 1;
    if (outputs > limits.maxOutput) return;
    post({ t: 'out', level: line.level, text: outputs === limits.maxOutput ? 'server.js wrote more than ' + limits.maxOutput + ' lines: the rest are not shown.' : String(line.text).slice(0, limits.maxOutputText), line: line.line });
  };
  var runtime = (${SERVER_RUNTIME_SOURCE})(limits, emit);
  var crashed = false;
  var preview = function (value) {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return runtime.describe(value);
    try { var text = JSON.stringify(value); return text === undefined ? String(value) : text; } catch (error) { return String(value); }
  };
  var logger = function (level) {
    return function () { emit({ level: level, text: Array.prototype.map.call(arguments, preview).join(' '), line: null }); };
  };
  var output = self.console;
  ['log', 'info', 'debug', 'table', 'dir'].forEach(function (name) { output[name] = logger('log'); });
  output.warn = logger('warn');
  output.error = logger('error');
  self.require = runtime.require;
  self.express = runtime.express;
  /* chapter 3: server.js's Date (and Intl's default date, performance.timeOrigin) tell the scripted time, which moves */
  if (limits.time) (${SCRIPTED_TIME_SOURCE})(self, runtime.Date, runtime.now);
  listen('error', function (event) {
    if (crashed) return;
    crashed = true;
    event.preventDefault();
    var line = typeof event.lineno === 'number' && event.lineno > 1 ? event.lineno - 1 : runtime.lineOf(event.error);
    post({ t: 'crash', text: String(event.error ? runtime.describe(event.error) : event.message).slice(0, limits.maxOutputText), line: line });
  });
  /* a promise rejected with nobody to catch it: Node reports it (and stops); here it is reported in the Server panel */
  listen('unhandledrejection', function (event) {
    event.preventDefault();
    emit({ level: 'error', text: 'Unhandled rejection: ' + runtime.describe(event.reason), line: runtime.lineOf(event.reason) });
  });
  listen('message', function (event) {
    var data = event.data;
    if (crashed || !data || data.t !== 'req') return;
    runtime.handle(data.request, function (answer) {
      post({ t: 'res', id: data.id, status: answer.status, headers: answer.headers, body: answer.body });
    });
  });
})`

/** The worker's whole script: the prelude (one line, the limits filled in), a line break, then server.js as written. */
export function serverWorkerScript(prelude: string, source: string): string {
  return `${prelude}\n${source}`
}

/**
 * The frame's side of the server (part of the web backend): `(config, hooks)` with `config.source` (server.js, or null
 * when the level has none any more), `config.limits` and `hooks.output(line)` (the Server panel), returns
 * `{ serve(request, done) }`; `done` gets `{ status, headers, body }` or `{ fail: 'net::ERR_…' }` once.
 */
export const SERVER_HOST_SOURCE = String.raw`(function (config, hooks) {
  'use strict';
  var limits = config.limits;
  /* Everything the host relies on is taken now, when the bridge makes it, before any of the app's code runs: the Worker
     and its members, the event getters, the string and pattern functions. A replacement the app makes later (on
     Worker.prototype, MessageEvent.prototype, String.prototype …) never sees a request or an answer. */
  var FP = Function.prototype;
  var uncurry = FP.bind.bind(FP.call);
  var describeProperty = Object.getOwnPropertyDescriptor;
  var getter = function (proto, name) { var found = describeProperty(proto, name); return found && found.get ? uncurry(found.get) : null; };
  var NativeWorker = typeof Worker === 'function' ? Worker : null;
  var toWorker = NativeWorker ? uncurry(NativeWorker.prototype.postMessage) : null;
  var endWorker = NativeWorker ? uncurry(NativeWorker.prototype.terminate) : null;
  var listen = uncurry(EventTarget.prototype.addEventListener);
  var dataOf = getter(MessageEvent.prototype, 'data');
  var messageOf = getter(ErrorEvent.prototype, 'message');
  var linenoOf = getter(ErrorEvent.prototype, 'lineno');
  var preventDefault = uncurry(Event.prototype.preventDefault);
  var NativeBlob = Blob;
  var NativeFunction = Function;
  var makeUrl = URL.createObjectURL;
  var later = setTimeout;
  var stop = clearTimeout;
  var keysOf = Object.keys;
  var isArray = Array.isArray;
  var hasOwn = uncurry(Object.prototype.hasOwnProperty);
  var defineProperty = Object.defineProperty;
  var createObject = Object.create;
  var exec = uncurry(RegExp.prototype.exec);
  var sliceText = uncurry(String.prototype.slice);
  var toText = String;
  var NAME = /^[!#$%&'*+.^_\x60|~0-9a-z-]{1,100}$/;
  /* Node's rule for a header's value: a tab, visible ASCII and Latin-1 only */
  var BAD_VALUE = /[^\t\x20-\x7e\x80-\xff]/;
  var PREFIX = /^https?:\/\/[^/]+/;
  var worker = null;
  var down = config.source === null ? 'server.js is missing: there is no server to answer.' : null;
  var restarts = 0;
  var waiting = Object.create(null);
  var nextId = 1;
  var outputs = 0;
  /* a field the worker's message has itself (a missing one is never read from a prototype the app changed) */
  var field = function (object, name) { return hasOwn(object, name) ? object[name] : undefined; };
  var cut = function (text, max) { return text.length > max ? sliceText(text, 0, max) : text; };
  /* spaces and tabs off both ends of a header's value, as the HTTP layer reads it */
  var trimValue = function (text) {
    var from = 0;
    var to = text.length;
    while (from < to && (text[from] === ' ' || text[from] === '\t')) from++;
    while (to > from && (text[to - 1] === ' ' || text[to - 1] === '\t')) to--;
    return sliceText(text, from, to);
  };
  var output = function (level, text, line) {
    outputs += 1;
    if (outputs > limits.maxOutput) return;
    hooks.output({ level: level, text: cut(toText(text), limits.maxOutputText), line: typeof line === 'number' && line >= 1 && line % 1 === 0 ? line : null });
  };
  if (down && config.hasServer) output('error', down, null);
  /* every request still waiting gets this failure (the worker is gone) */
  var failAll = function (error) {
    var ids = keysOf(waiting);
    for (var i = 0; i < ids.length; i++) {
      var entry = waiting[ids[i]];
      delete waiting[ids[i]];
      stop(entry.timer);
      entry.done({ fail: error });
    }
  };
  var crash = function (text, line) {
    if (down) return;
    down = text;
    output('error', 'server.js crashed: ' + text + (line ? ' (server.js:' + line + ')' : ''), line);
    if (worker) endWorker(worker);
    worker = null;
    failAll('net::ERR_CONNECTION_REFUSED');
  };
  /* what the worker posts is read field by field and capped: it runs learner code */
  var headerList = function (value) {
    if (!isArray(value)) return null;
    var list = [];
    for (var i = 0; i < value.length && i < limits.maxHeaders; i++) {
      var pair = value[i];
      if (!isArray(pair) || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') return null;
      if (exec(NAME, pair[0]) === null || exec(BAD_VALUE, pair[1]) !== null) return null;
      var item = createObject(null);
      item.value = [pair[0], cut(trimValue(pair[1]), limits.maxHeaderValue)];
      item.writable = true;
      item.enumerable = true;
      item.configurable = true;
      /* defined, not assigned: a setter the app put on Array.prototype never sees (or changes) a header */
      defineProperty(list, list.length, item);
    }
    return list;
  };
  var onMessage = function (event) {
    var data = dataOf(event);
    if (!data || typeof data !== 'object') return;
    var kind = field(data, 't');
    var text = field(data, 'text');
    var level = field(data, 'level');
    var line = field(data, 'line');
    if (kind === 'out' && typeof text === 'string' && (level === 'access' || level === 'log' || level === 'warn' || level === 'error')) {
      output(level, text, line);
      return;
    }
    if (kind === 'crash' && typeof text === 'string') { crash(cut(text, limits.maxOutputText), typeof line === 'number' ? line : null); return; }
    var id = field(data, 'id');
    if (kind !== 'res' || typeof id !== 'number' || !waiting[id]) return;
    var entry = waiting[id];
    var status = field(data, 'status');
    var headers = headerList(field(data, 'headers'));
    var raw = field(data, 'body');
    var body = raw === null ? null : typeof raw === 'string' ? cut(raw, limits.maxBody) : undefined;
    if (typeof status !== 'number' || status % 1 !== 0 || status < 200 || status > 599 || headers === null || body === undefined) return;
    delete waiting[id];
    stop(entry.timer);
    entry.done({ status: status, headers: headers, body: body });
  };
  /* A syntax error never reaches the prelude: the worker itself reports it. Chromium says what and where (the prelude
     is line 1); Firefox and WebKit say nothing to the frame, so the frame compiles server.js once more, never calling
     it, for the engine's own message and line (new Function puts two lines in front of the body). */
  var onError = function (event) {
    preventDefault(event);
    /* Firefox and WebKit fire a plain Event for a script that does not load: an ErrorEvent's getters refuse it */
    var read = function (get, fallback) { try { return get ? get(event) : fallback; } catch (error) { return fallback; } };
    var message = read(messageOf, '');
    if (message) {
      var at = read(linenoOf, 0);
      var plain = toText(message);
      crash(sliceText(plain, 0, 9) === 'Uncaught ' ? sliceText(plain, 9) : plain, typeof at === 'number' && at > 1 ? at - 1 : null);
      return;
    }
    try {
      new NativeFunction(config.source);
    } catch (error) {
      var where = error && typeof error.lineNumber === 'number' ? error.lineNumber : error && typeof error.line === 'number' ? error.line : 0;
      crash((error && error.name ? error.name + ': ' : '') + (error && error.message ? error.message : 'server.js does not parse'), where > 2 ? where - 2 : null);
      return;
    }
    crash('server.js could not run', null);
  };
  var start = function () {
    if (!NativeWorker) { down = 'This browser cannot run server.js here.'; output('error', down, null); return false; }
    var script = config.prelude + '\n' + config.source;
    try {
      worker = new NativeWorker(makeUrl(new NativeBlob([script], { type: 'text/javascript' })));
    } catch (error) {
      down = 'server.js could not start: ' + (error && error.message ? error.message : toText(error));
      output('error', down, null);
      return false;
    }
    listen(worker, 'message', onMessage);
    listen(worker, 'error', onError);
    return true;
  };
  var serve = function (request, done) {
    if (down) { later(function () { done({ fail: 'net::ERR_CONNECTION_REFUSED' }); }, 0); return; }
    if (!worker && !start()) { later(function () { done({ fail: 'net::ERR_CONNECTION_REFUSED' }); }, 0); return; }
    var id = nextId++;
    var found = exec(PREFIX, request.url);
    var path = found ? sliceText(request.url, found[0].length) : request.url;
    var entry = { done: done, timer: null };
    waiting[id] = entry;
    entry.timer = later(function () {
      if (!waiting[id]) return;
      output('error', 'server.js did not answer ' + request.method + ' ' + path + ' within ' + (limits.answerMs / 1000) + ' s: a route that never sends an answer (res.json, res.send, res.end), or a loop that never ends. The server was restarted.', null);
      if (worker) endWorker(worker);
      worker = null;
      restarts += 1;
      failAll('net::ERR_EMPTY_RESPONSE');
      if (restarts > limits.maxRestarts) {
        down = 'server.js stopped answering too often.';
        output('error', 'server.js was restarted ' + limits.maxRestarts + ' times: it stays down until the next reload.', null);
      }
    }, limits.answerMs);
    toWorker(worker, { t: 'req', id: id, request: { method: request.method, url: request.url, headers: request.headers, body: request.body, now: typeof request.now === 'number' ? request.now : limits.clock } });
  };
  return { serve: serve };
})`

/**
 * The worker's prelude for these limits and status texts: one line of JavaScript, server.js follows on the next. `time`:
 * the level's clock moves (chapter 3), so server.js's Date tells the scripted time. `etag` (chapter 4, a level with a
 * cache): res.send gives a body Express's ETag and answers a conditional GET with 304.
 */
export function serverPrelude(statusText: Readonly<Record<number, string>>, time = false, etag = false): string {
  const limits = JSON.stringify({ ...SERVER_LIMITS, statusText, time, etag })
  return `${WORKER_PRELUDE.replace(/\s*\n\s*/g, ' ')}(${limits});`
}
