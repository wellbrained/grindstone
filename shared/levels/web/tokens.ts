// Signed tokens for the Web fundamentals track (ADR 0009, chapter 3; docs/features/levels.md "Tokens"): the part of
// the `jsonwebtoken` package a small Express server uses, for server.js (`const jwt = require('jsonwebtoken')`): `sign`,
// `verify` and `decode` of JSON Web Tokens (RFC 7519) signed with HMAC-SHA256 ("HS256", RFC 7518 3.2) and a secret,
// with the package's options, claims, errors and words where a level needs them. The time is the scripted clock's
// (the worker passes the moment each request is answered at), so `exp` is the same on every run.
//
// What it leaves out (the feature doc's "What the model simplifies"): every algorithm but HS256 (RS256 and the rest:
// "invalid algorithm"), key objects and buffers as secrets, string and buffer payloads, the `audience`, `issuer`,
// `subject` and `jwtid` checks in `verify` (they are written by `sign`), `clockTimestamp`, and asynchronous keys.
//
// JavaScript in a string (block comments only, every statement ends with a semicolon): the server's runtime runs it in
// the worker, and the unit tests run this very source on Node (test/unit/levels/web/tokens.test.ts), SHA-256 and HMAC
// against FIPS 180-4's and RFC 4231's test vectors and Node's crypto. `decodeToken` (TypeScript) reads a token for the
// Application panel: its header and payload, never checked (as jwt.io shows them).

/** The jsonwebtoken subset server.js gets, as the unit tests use it. */
export interface JwtModule {
  sign: (payload: unknown, secret: unknown, options?: unknown, callback?: unknown) => string | undefined
  verify: (token: unknown, secret: unknown, options?: unknown, callback?: unknown) => Record<string, unknown> | undefined
  decode: (token: unknown, options?: unknown) => unknown
  JsonWebTokenError: new (message: string) => Error
  TokenExpiredError: new (message: string, expiredAt: Date) => Error & { expiredAt: Date }
  NotBeforeError: new (message: string, date: Date) => Error & { date: Date }
}

/** The source's own helpers the tests check against the standards' vectors. */
export interface JwtInternals {
  sha256Hex: (text: string) => string
  hmacHex: (key: string, text: string) => string
  /** The `ms` package's reading of a time span ('15m', '2 days'), in ms; undefined when it can't read it. */
  ms: (text: string) => number | undefined
}

export const JWT_SOURCE = String.raw`(function (now) {
  'use strict';
  /* SHA-256 (FIPS 180-4) over bytes, and HMAC (RFC 2104) with it: what HS256 signs with. */
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  var sha256 = function (bytes) {
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var length = bytes.length;
    var padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[length] = 0x80;
    var bits = length * 8;
    for (var b = 0; b < 8; b++) padded[padded.length - 1 - b] = (bits / Math.pow(2, 8 * b)) & 0xff;
    var w = new Array(64);
    for (var offset = 0; offset < padded.length; offset += 64) {
      for (var t = 0; t < 16; t++) w[t] = (padded[offset + 4 * t] << 24) | (padded[offset + 4 * t + 1] << 16) | (padded[offset + 4 * t + 2] << 8) | padded[offset + 4 * t + 3];
      for (t = 16; t < 64; t++) {
        var x = w[t - 15];
        var y = w[t - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = h[0], c1 = h[1], c2 = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var temp1 = (hh + S1 + ch + K[t] + w[t]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & c1) ^ (a & c2) ^ (c1 & c2);
        var temp2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + temp1) | 0; d = c2; c2 = c1; c1 = a; a = (temp1 + temp2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + c1) | 0; h[2] = (h[2] + c2) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    var out = new Uint8Array(32);
    for (var i = 0; i < 8; i++) {
      out[4 * i] = h[i] >>> 24;
      out[4 * i + 1] = (h[i] >>> 16) & 0xff;
      out[4 * i + 2] = (h[i] >>> 8) & 0xff;
      out[4 * i + 3] = h[i] & 0xff;
    }
    return out;
  };
  var concat = function (first, second) {
    var out = new Uint8Array(first.length + second.length);
    out.set(first);
    out.set(second, first.length);
    return out;
  };
  var hmac = function (key, message) {
    if (key.length > 64) key = sha256(key);
    var inner = new Uint8Array(64);
    var outer = new Uint8Array(64);
    for (var i = 0; i < 64; i++) {
      var byte = i < key.length ? key[i] : 0;
      inner[i] = byte ^ 0x36;
      outer[i] = byte ^ 0x5c;
    }
    return sha256(concat(outer, sha256(concat(inner, message))));
  };
  var utf8 = function (text) { return new TextEncoder().encode(text); };
  var fromUtf8 = function (bytes) { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); };
  var hex = function (bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return out;
  };

  /* base64url without padding (RFC 7515 2), both ways; a character outside its alphabet makes it unreadable */
  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  var toBase64url = function (bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | ((i + 1 < bytes.length ? bytes[i + 1] : 0) << 8) | (i + 2 < bytes.length ? bytes[i + 2] : 0);
      out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
      if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63];
      if (i + 2 < bytes.length) out += ALPHABET[n & 63];
    }
    return out;
  };
  var fromBase64url = function (text) {
    /* the package reads with Buffer.from(…, 'base64'), which also takes + / and padding */
    text = String(text).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    if (text.length % 4 === 1) return null;
    var bytes = [];
    var bits = 0;
    var value = 0;
    for (var i = 0; i < text.length; i++) {
      var at = ALPHABET.indexOf(text[i]);
      if (at < 0) return null;
      value = (value << 6) | at;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((value >> bits) & 0xff);
      }
    }
    return new Uint8Array(bytes);
  };
  var readPart = function (text) {
    var bytes = fromBase64url(text);
    if (bytes === null) return undefined;
    try { return JSON.parse(fromUtf8(bytes)); } catch (error) { return undefined; }
  };

  /* The ms package (what jsonwebtoken reads a string time span with): a number and a unit, ms when there is none. */
  var UNITS = { ms: 1, msec: 1, msecs: 1, millisecond: 1, milliseconds: 1, s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000, m: 60000, min: 60000, mins: 60000, minute: 60000, minutes: 60000, h: 3600000, hr: 3600000, hrs: 3600000, hour: 3600000, hours: 3600000, d: 86400000, day: 86400000, days: 86400000, w: 604800000, week: 604800000, weeks: 604800000, y: 31557600000, yr: 31557600000, yrs: 31557600000, year: 31557600000, years: 31557600000 };
  var ms = function (text) {
    if (typeof text !== 'string' || text.length === 0 || text.length > 100) return undefined;
    var match = /^(-?(?:\d+)?\.?\d+) *([a-z]+)?$/i.exec(text);
    if (!match) return undefined;
    var unit = (match[2] || 'ms').toLowerCase();
    return Object.prototype.hasOwnProperty.call(UNITS, unit) ? parseFloat(match[1]) * UNITS[unit] : undefined;
  };
  /* jsonwebtoken's timespan: a number is seconds, a string goes through ms; undefined when it can't be read */
  var timespan = function (time, iat) {
    if (typeof time === 'string') {
      var milliseconds = ms(time);
      return milliseconds === undefined ? undefined : Math.floor(iat + milliseconds / 1000);
    }
    if (typeof time === 'number') return iat + time;
    return undefined;
  };

  var made = function (name, parent) {
    var Made = function (message) {
      var error = new Error(message);
      Object.setPrototypeOf(error, Made.prototype);
      return error;
    };
    Made.prototype = Object.create(parent.prototype, { constructor: { value: Made, writable: true, configurable: true }, name: { value: name, writable: true, configurable: true } });
    return Made;
  };
  var JsonWebTokenError = made('JsonWebTokenError', Error);
  var TokenExpiredError = function (message, expiredAt) {
    var error = JsonWebTokenError(message);
    Object.setPrototypeOf(error, TokenExpiredError.prototype);
    error.expiredAt = expiredAt;
    return error;
  };
  TokenExpiredError.prototype = Object.create(JsonWebTokenError.prototype, { constructor: { value: TokenExpiredError, writable: true, configurable: true }, name: { value: 'TokenExpiredError', writable: true, configurable: true } });
  var NotBeforeError = function (message, date) {
    var error = JsonWebTokenError(message);
    Object.setPrototypeOf(error, NotBeforeError.prototype);
    error.date = date;
    return error;
  };
  NotBeforeError.prototype = Object.create(JsonWebTokenError.prototype, { constructor: { value: NotBeforeError, writable: true, configurable: true }, name: { value: 'NotBeforeError', writable: true, configurable: true } });

  var seconds = function () { return Math.floor(now() / 1000); };
  var isPlainObject = function (value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); };
  var signature = function (secret, data) { return toBase64url(hmac(utf8(secret), utf8(data))); };
  var HEADER = toBase64url(utf8(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  var callbackOf = function (options, callback) { return typeof options === 'function' ? options : typeof callback === 'function' ? callback : null; };
  var later = function (callback, error, value) { setTimeout(function () { callback(error, value); }, 0); };

  /* jwt.sign(payload, secret, [options, callback]): the payload with iat (and exp, nbf, the claims the options name) */
  var sign = function (payload, secret, options, callback) {
    var done = callbackOf(options, callback);
    var opts = options && typeof options === 'object' ? options : {};
    var fail = function (error) {
      if (done) { later(done, error); return undefined; }
      throw error;
    };
    if (opts.algorithm !== undefined && opts.algorithm !== 'HS256') return fail(new Error(opts.algorithm === 'none' || /^(HS384|HS512|RS256|RS384|RS512|PS256|PS384|PS512|ES256|ES384|ES512)$/.test(String(opts.algorithm)) ? 'This trainer\'s jsonwebtoken signs with HS256 only (a secret, not a key pair).' : '"algorithm" must be a valid string enum value'));
    if (typeof secret !== 'string' || secret === '') return fail(new Error('secretOrPrivateKey must have a value'));
    if (!isPlainObject(payload)) return fail(new Error('This trainer\'s jsonwebtoken signs an object payload only, like { sub: \'lena\' }.'));
    var claims = {};
    var keys = Object.keys(payload);
    for (var i = 0; i < keys.length; i++) claims[keys[i]] = payload[keys[i]];
    if (opts.expiresIn !== undefined && claims.exp !== undefined) return fail(new Error('Bad "options.expiresIn" option the payload already has an "exp" property.'));
    if (opts.notBefore !== undefined && claims.nbf !== undefined) return fail(new Error('Bad "options.notBefore" option the payload already has an "nbf" property.'));
    var timestamp = typeof claims.iat === 'number' ? claims.iat : seconds();
    if (opts.noTimestamp) delete claims.iat;
    else claims.iat = timestamp;
    if (opts.notBefore !== undefined) {
      claims.nbf = timespan(opts.notBefore, timestamp);
      if (claims.nbf === undefined) return fail(new Error('"notBefore" should be a number of seconds or string representing a timespan eg: "1d", "20h", 60'));
    }
    if (opts.expiresIn !== undefined) {
      claims.exp = timespan(opts.expiresIn, timestamp);
      if (claims.exp === undefined) return fail(new Error('"expiresIn" should be a number of seconds or string representing a timespan eg: "1d", "20h", 60'));
    }
    var names = { audience: 'aud', issuer: 'iss', subject: 'sub', jwtid: 'jti' };
    var named = Object.keys(names);
    for (var n = 0; n < named.length; n++) {
      if (opts[named[n]] === undefined) continue;
      if (claims[names[named[n]]] !== undefined) return fail(new Error('Bad "options.' + named[n] + '" option. The payload already has an "' + names[named[n]] + '" property.'));
      claims[names[named[n]]] = opts[named[n]];
    }
    var body = toBase64url(utf8(JSON.stringify(claims)));
    var token = HEADER + '.' + body + '.' + signature(secret, HEADER + '.' + body);
    if (done) { later(done, null, token); return undefined; }
    return token;
  };

  /* jwt.decode(token, [options]): the payload (or with complete, header, payload and signature), never checked; null
     for what isn't a token */
  var decode = function (token, options) {
    if (typeof token !== 'string') return null;
    var parts = token.split('.');
    if (parts.length !== 3) return null;
    var header = readPart(parts[0]);
    var payload = readPart(parts[1]);
    if (!header || typeof header !== 'object' || payload === undefined) return null;
    if (options && options.complete) return { header: header, payload: payload, signature: parts[2] };
    return payload;
  };

  /* jwt.verify(token, secret, [options, callback]): the payload when the signature is the secret's and the token is in
     its time (exp, nbf, and maxAge from iat when asked), else the package's error */
  var verify = function (token, secret, options, callback) {
    var done = callbackOf(options, callback);
    var opts = options && typeof options === 'object' ? options : {};
    var finish = function (error, value) {
      if (done) { later(done, error, value); return undefined; }
      if (error) throw error;
      return value;
    };
    var fail = function (message) { return finish(new JsonWebTokenError(message)); };
    if (!token) return fail('jwt must be provided');
    if (typeof token !== 'string') return fail('jwt must be a string');
    var parts = token.split('.');
    if (parts.length !== 3) return fail('jwt malformed');
    var header = readPart(parts[0]);
    var payload = readPart(parts[1]);
    if (!header || typeof header !== 'object' || payload === undefined) return fail('invalid token');
    var signed = parts[2].trim() !== '';
    if (!signed && secret) return fail('jwt signature is required');
    if (signed && !secret) return fail('secret or public key must be provided');
    if (typeof secret !== 'string') return fail('secret or public key must be provided');
    var algorithms = Array.isArray(opts.algorithms) ? opts.algorithms : ['HS256', 'HS384', 'HS512'];
    if (algorithms.indexOf(header.alg) < 0 || header.alg !== 'HS256') return fail('invalid algorithm');
    if (signature(secret, parts[0] + '.' + parts[1]) !== parts[2]) return fail('invalid signature');
    if (payload === null || typeof payload !== 'object') return fail('invalid token');
    var tolerance = typeof opts.clockTolerance === 'number' ? opts.clockTolerance : 0;
    var at = seconds();
    if (payload.nbf !== undefined && !opts.ignoreNotBefore) {
      if (typeof payload.nbf !== 'number') return fail('invalid nbf value');
      if (payload.nbf > at + tolerance) return finish(new NotBeforeError('jwt not active', new Date(payload.nbf * 1000)));
    }
    if (payload.exp !== undefined && !opts.ignoreExpiration) {
      if (typeof payload.exp !== 'number') return fail('invalid exp value');
      if (at >= payload.exp + tolerance) return finish(new TokenExpiredError('jwt expired', new Date(payload.exp * 1000)));
    }
    if (opts.maxAge !== undefined) {
      if (typeof payload.iat !== 'number') return fail('iat required when maxAge is specified');
      var latest = timespan(opts.maxAge, payload.iat);
      if (latest === undefined) return fail('"maxAge" should be a number of seconds or string representing a timespan eg: "1d", "20h", 60');
      if (at >= latest + tolerance) return finish(new TokenExpiredError('maxAge exceeded', new Date(latest * 1000)));
    }
    return finish(null, opts.complete ? { header: header, payload: payload, signature: parts[2] } : payload);
  };

  return {
    module: { sign: sign, verify: verify, decode: decode, JsonWebTokenError: JsonWebTokenError, TokenExpiredError: TokenExpiredError, NotBeforeError: NotBeforeError },
    internals: { sha256Hex: function (text) { return hex(sha256(utf8(text))); }, hmacHex: function (key, text) { return hex(hmac(utf8(key), utf8(text))); }, ms: ms }
  };
})`

/** A token read for the Application panel: its header and payload (never checked; the signature stays a secret's). */
export interface DecodedToken {
  header: Record<string, unknown>
  payload: Record<string, unknown>
}

const base64urlText = (part: string): string | null => {
  if (!/^[A-Za-z0-9_-]*$/.test(part) || part.length % 4 === 1) return null
  try {
    const binary = atob(part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - part.length % 4) % 4))
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, character => character.charCodeAt(0)))
  } catch {
    return null
  }
}

const jsonObject = (text: string | null): Record<string, unknown> | null => {
  if (text === null) return null
  try {
    const value: unknown = JSON.parse(text)
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

/**
 * Reads a JSON Web Token (`header.payload.signature`, base64url JSON objects): its header and payload, or null for
 * anything else (at most 4096 characters, as a cookie holds). Never verifies: anyone can read a token.
 */
export function decodeToken(text: string): DecodedToken | null {
  if (text.length > 4096) return null
  const parts = text.split('.')
  if (parts.length !== 3) return null
  const header = jsonObject(base64urlText(parts[0]!))
  const payload = jsonObject(base64urlText(parts[1]!))
  if (!header || !payload || typeof header.alg !== 'string') return null
  return { header, payload }
}
