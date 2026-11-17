import { describe, expect, it } from 'vitest'
import { CORS_SOURCE } from '../../../../shared/levels/web/cors'
import type { CorsModel, CorsRequest, CorsResponse } from '../../../../shared/levels/web/cors'

// The CORS model (ADR 0009, docs/features/levels.md "The CORS model"): the very source the web backend runs in the
// sealed frame, run here on Node. Each rule next to the Fetch Living Standard's text it follows
// (https://fetch.spec.whatwg.org/), and Chrome's words for each refusal (Chromium's cors_error_string.cc).

const model = new Function(`return ${CORS_SOURCE}`)()() as CorsModel

const SHOP = 'https://cornerbakery.shop'
const API = 'https://api.cornerbakery.shop/menu'

const request = (fields: Partial<CorsRequest> = {}): CorsRequest => ({ origin: SHOP, method: 'GET', headers: [], credentials: 'same-origin', ...fields })
const response = (headers: [string, string][], status = 200): CorsResponse => ({ status, headers })

describe('what a page may send without asking', () => {
  it('"A CORS-safelisted method is a method that is `GET`, `HEAD`, or `POST`."', () => {
    expect(['GET', 'HEAD', 'POST'].every(model.isSafelistedMethod)).toBe(true)
    expect(['PUT', 'DELETE', 'PATCH', 'OPTIONS', 'get'].some(model.isSafelistedMethod)).toBe(false)
  })

  it('safelists Accept, Accept-Language, Content-Language and three Content-Types, each at most 128 bytes', () => {
    // "If value's length is greater than 128, then return false."
    expect(model.isSafelistedHeader('Accept', 'application/json')).toBe(true)
    expect(model.isSafelistedHeader('accept', 'a'.repeat(129))).toBe(false)
    // accept: "If value contains a CORS-unsafe request-header byte, then return false."
    expect(model.isSafelistedHeader('accept', 'text/html; q="1"')).toBe(false)
    // accept-language, content-language: "If value contains a byte that is not in the range 0x30 (0) to 0x39 (9),
    // inclusive, is not in the range 0x41 (A) to 0x5A (Z), inclusive, is not in the range 0x61 (a) to 0x7A (z),
    // inclusive, and is not 0x20 (SP), 0x2A (*), 0x2C (,), 0x2D (-), 0x2E (.), 0x3B (;), or 0x3D (=), then return false."
    expect(model.isSafelistedHeader('Content-Language', 'en-GB, de;q=0.5')).toBe(true)
    expect(model.isSafelistedHeader('Accept-Language', 'en_GB')).toBe(false)
    // content-type: "If mimeType's essence is not "application/x-www-form-urlencoded", "multipart/form-data", or
    // "text/plain", then return false."
    expect(model.isSafelistedHeader('Content-Type', 'text/plain;charset=UTF-8')).toBe(true)
    expect(model.isSafelistedHeader('content-type', 'Multipart/Form-Data; boundary=x')).toBe(true)
    expect(model.isSafelistedHeader('content-type', 'application/json')).toBe(false)
    expect(model.isSafelistedHeader('X-Basket-Id', 'b-1041')).toBe(false)
    expect(model.isSafelistedHeader('Authorization', 'Bearer abc')).toBe(false)
  })

  it('drops a forbidden request-header without a word, and in no-cors mode every header that is not safelisted', () => {
    const set: [string, string][] = [['Origin', 'https://cheap-flour.example'], ['Cookie', 'session=x'], ['Sec-Fetch-Site', 'none'], ['Proxy-Authorization', 'x'], ['X-HTTP-Method-Override', 'TRACE'], ['X-HTTP-Method-Override', 'PUT'], ['X-Basket-Id', 'b-1'], ['Content-Type', 'application/json']]
    expect(model.requestHeaders(set, 'cors')).toEqual([['x-http-method-override', 'PUT'], ['x-basket-id', 'b-1'], ['content-type', 'application/json']])
    // Headers' "request-no-cors" guard: only a no-CORS-safelisted request-header may be appended
    expect(model.requestHeaders([['X-Basket-Id', 'b-1'], ['Content-Type', 'application/json'], ['Accept', 'text/plain']], 'no-cors')).toEqual([['accept', 'text/plain']])
  })

  it('names the unsafe headers lower case, sorted, once each, and the safelisted ones too once their values pass 1024 bytes', () => {
    expect(model.unsafeHeaderNames([['X-Basket-Id', '1'], ['Content-Type', 'application/json'], ['x-basket-id', '2'], ['Accept', '*/*']])).toEqual(['content-type', 'x-basket-id'])
    // "If safelistValueSize is greater than 1024, then for each name of potentiallyUnsafeNames, append name to unsafeNames."
    const long: [string, string][] = Array.from({ length: 9 }, () => ['Accept', 'a'.repeat(120)] as [string, string])
    expect(model.unsafeHeaderNames(long)).toEqual(['accept'])
  })

  it('preflights a request whose method is not safelisted or that sets an unsafe header', () => {
    expect(model.needsPreflight('GET', [])).toBe(false)
    expect(model.needsPreflight('POST', [['content-type', 'text/plain;charset=UTF-8']])).toBe(false)
    expect(model.needsPreflight('POST', [['content-type', 'application/json']])).toBe(true)
    expect(model.needsPreflight('GET', [['x-basket-id', 'b-1']])).toBe(true)
    expect(model.needsPreflight('DELETE', [])).toBe(true)
  })

  it('asks the preflight with Accept, the method and the unsafe names "separated from each other by 0x2C (,)", never a cookie', () => {
    const asked = model.preflightHeaders(request({ method: 'POST', headers: [['content-type', 'application/json'], ['x-basket-id', 'b-1']], credentials: 'include' }))
    expect(asked).toEqual([['accept', '*/*'], ['access-control-request-method', 'POST'], ['access-control-request-headers', 'content-type,x-basket-id'], ['origin', SHOP]])
    expect(model.preflightHeaders(request({ method: 'DELETE' }))).toEqual([['accept', '*/*'], ['access-control-request-method', 'DELETE'], ['origin', SHOP]])
  })
})

describe('the CORS check on an answer', () => {
  it('lets the page read an answer that names its origin, or `*` when it sent no credentials', () => {
    expect(model.check(request(), response([['access-control-allow-origin', SHOP]]))).toBeNull()
    // "If request's credentials mode is not "include" and origin is `*`, return success."
    expect(model.check(request(), response([['Access-Control-Allow-Origin', '*']]))).toBeNull()
  })

  it('refuses an answer without Access-Control-Allow-Origin: "If origin is null, return failure."', () => {
    expect(model.check(request(), response([['content-type', 'application/json']]))).toEqual({ code: 'MissingAllowOriginHeader' })
  })

  it('refuses `*` with credentials, before anything else (Chrome looks at the wildcard first)', () => {
    expect(model.check(request({ credentials: 'include' }), response([['access-control-allow-origin', '*'], ['access-control-allow-credentials', 'true']]))).toEqual({ code: 'WildcardOriginNotAllowed' })
  })

  it('"If the result of byte-serializing a request origin with request is not origin, then return failure."', () => {
    expect(model.check(request(), response([['access-control-allow-origin', 'https://cornerbakery.shop/']]))).toEqual({ code: 'AllowOriginMismatch', value: 'https://cornerbakery.shop/' })
    expect(model.check(request(), response([['access-control-allow-origin', 'https://www.cornerbakery.shop']]))).toEqual({ code: 'AllowOriginMismatch', value: 'https://www.cornerbakery.shop' })
    expect(model.check(request(), response([['access-control-allow-origin', 'null']]))).toEqual({ code: 'AllowOriginMismatch', value: 'null' })
    // a value that is no URL, and two values (two headers are combined with ", " when the header is got)
    expect(model.check(request(), response([['access-control-allow-origin', 'cornerbakery.shop']]))).toEqual({ code: 'InvalidAllowOriginValue', value: 'cornerbakery.shop' })
    // anything with a scheme is a URL to Chrome (GURL), so it is "not equal" rather than invalid
    expect(model.check(request(), response([['access-control-allow-origin', 'foo:bar']]))).toEqual({ code: 'AllowOriginMismatch', value: 'foo:bar' })
    expect(model.check(request(), response([['access-control-allow-origin', SHOP], ['access-control-allow-origin', 'https://promo.cornerbakery.shop']]))).toEqual({ code: 'MultipleAllowOriginValues', value: `${SHOP}, https://promo.cornerbakery.shop` })
  })

  it('with credentials, needs Access-Control-Allow-Credentials: "If credentials is `true`, then return success." (case-sensitive)', () => {
    const credentialed = request({ credentials: 'include' })
    expect(model.check(credentialed, response([['access-control-allow-origin', SHOP]]))).toEqual({ code: 'InvalidAllowCredentials', value: '' })
    expect(model.check(credentialed, response([['access-control-allow-origin', SHOP], ['access-control-allow-credentials', 'True']]))).toEqual({ code: 'InvalidAllowCredentials', value: 'True' })
    expect(model.check(credentialed, response([['access-control-allow-origin', SHOP], ['access-control-allow-credentials', 'true']]))).toBeNull()
    // "If request's credentials mode is not "include", then return success."
    expect(model.check(request(), response([['access-control-allow-origin', SHOP]]))).toBeNull()
  })
})

describe('the preflight\'s answer', () => {
  const post = request({ method: 'POST', headers: [['content-type', 'application/json']] })
  const ok = (headers: [string, string][], status = 204) => response([['access-control-allow-origin', SHOP], ...headers], status)

  it('passes the CORS check first, then needs an ok status (200 to 299)', () => {
    expect(model.checkPreflight(post, response([['allow', 'POST']], 404))).toEqual({ code: 'MissingAllowOriginHeader' })
    expect(model.checkPreflight(post, ok([['access-control-allow-headers', 'Content-Type']], 404))).toEqual({ code: 'PreflightInvalidStatus' })
    expect(model.checkPreflight(post, ok([['access-control-allow-headers', 'Content-Type']], 200))).toBeNull()
  })

  it('allows a method that is safelisted, listed, or `*` without credentials: "request\'s credentials mode is "include" or methods does not contain `*`"', () => {
    const remove = request({ method: 'DELETE' })
    expect(model.checkPreflight(remove, ok([['access-control-allow-methods', 'GET, POST']]))).toEqual({ code: 'MethodDisallowedByPreflightResponse', method: 'DELETE' })
    expect(model.checkPreflight(remove, ok([['access-control-allow-methods', 'GET, POST, DELETE']]))).toBeNull()
    expect(model.checkPreflight(remove, ok([['access-control-allow-methods', '*']]))).toBeNull()
    expect(model.checkPreflight({ ...remove, credentials: 'include' }, ok([['access-control-allow-methods', '*'], ['access-control-allow-credentials', 'true']]))).toEqual({ code: 'MethodDisallowedByPreflightResponse', method: 'DELETE' })
    // "If request's method is not in methods": the list is compared as written (case-sensitive)
    expect(model.checkPreflight(remove, ok([['access-control-allow-methods', 'delete']]))).toEqual({ code: 'MethodDisallowedByPreflightResponse', method: 'DELETE' })
    // POST is safelisted: no Allow-Methods needed
    expect(model.checkPreflight(post, ok([['access-control-allow-headers', 'content-type']]))).toBeNull()
  })

  it('allows each unsafe header by name (any case), or `*` without credentials; Authorization never by `*`', () => {
    const basket = request({ headers: [['x-basket-id', 'b-1']] })
    expect(model.checkPreflight(basket, ok([['access-control-allow-headers', 'Content-Type']]))).toEqual({ code: 'HeaderDisallowedByPreflightResponse', header: 'x-basket-id' })
    expect(model.checkPreflight(basket, ok([['access-control-allow-headers', 'Content-Type, X-Basket-Id']]))).toBeNull()
    expect(model.checkPreflight(basket, ok([['access-control-allow-headers', '*']]))).toBeNull()
    const credentialed = { ...basket, credentials: 'include' as const }
    expect(model.checkPreflight(credentialed, ok([['access-control-allow-headers', '*'], ['access-control-allow-credentials', 'true']]))).toEqual({ code: 'HeaderDisallowedByPreflightResponse', header: 'x-basket-id' })
    // "a CORS non-wildcard request-header name" (Authorization) must be named
    expect(model.checkPreflight(request({ headers: [['authorization', 'Bearer x']] }), ok([['access-control-allow-headers', '*']]))).toEqual({ code: 'HeaderDisallowedByPreflightResponse', header: 'authorization' })
  })

  it('refuses a list it can\'t parse ("If either methods or headerNames is failure, return a network error")', () => {
    expect(model.checkPreflight(request({ method: 'PUT' }), ok([['access-control-allow-methods', 'PUT DELETE']]))).toEqual({ code: 'InvalidAllowMethodsPreflightResponse' })
    expect(model.checkPreflight(request({ headers: [['x-a', '1']] }), ok([['access-control-allow-headers', 'x-a, x b']]))).toEqual({ code: 'InvalidAllowHeadersPreflightResponse' })
  })
})

describe('header values as the HTTP layer reads them', () => {
  it('takes spaces and tabs off both ends of a value: "<origin> " and "true\\t" pass', () => {
    expect(model.check(request({ credentials: 'include' }), response([['access-control-allow-origin', ` ${SHOP} `], ['access-control-allow-credentials', 'true\t']]))).toBeNull()
    expect(model.checkPreflight(request({ method: 'DELETE' }), response([['access-control-allow-origin', SHOP], ['access-control-allow-methods', ' GET , DELETE ']], 204))).toBeNull()
  })
})

describe('built-ins the app replaces after the model was made', () => {
  it('change no decision: the model took its own string and pattern functions when it was made', () => {
    const made = new Function(`return ${CORS_SOURCE}`)()() as CorsModel
    const original = { lower: String.prototype.toLowerCase, exec: RegExp.prototype.exec, indexOf: Array.prototype.indexOf }
    try {
      String.prototype.toLowerCase = () => 'access-control-allow-origin'
      RegExp.prototype.exec = () => null
      Array.prototype.indexOf = () => 0
      expect(made.check(request(), response([['content-type', 'application/json']]))).toEqual({ code: 'MissingAllowOriginHeader' })
      expect(made.needsPreflight('DELETE', [])).toBe(true)
      expect(made.checkPreflight(request({ headers: [['x-basket-id', '1']] }), response([['access-control-allow-origin', SHOP]], 204))).toEqual({ code: 'HeaderDisallowedByPreflightResponse', header: 'x-basket-id' })
    } finally {
      String.prototype.toLowerCase = original.lower
      RegExp.prototype.exec = original.exec
      Array.prototype.indexOf = original.indexOf
    }
  })
})

describe('what the page sees of a readable answer (a CORS-filtered response)', () => {
  it('only the safelisted response headers and those Access-Control-Expose-Headers names; `*` only without credentials; never Set-Cookie', () => {
    const answer = response([['content-type', 'application/json'], ['x-request-id', 'req-1'], ['x-basket', 'b'], ['set-cookie', 'a=b'], ['access-control-expose-headers', 'X-Request-Id']])
    expect(model.exposedHeaders(answer, 'same-origin').map(([name]) => name)).toEqual(['content-type', 'x-request-id'])
    const every = response([['content-type', 'text/plain'], ['x-basket', 'b'], ['set-cookie', 'a=b'], ['access-control-expose-headers', '*']])
    expect(model.exposedHeaders(every, 'same-origin').map(([name]) => name)).toEqual(['content-type', 'x-basket', 'access-control-expose-headers'])
    expect(model.exposedHeaders(every, 'include').map(([name]) => name)).toEqual(['content-type'])
  })
})

describe('Chrome\'s words', () => {
  const line = (problem: Parameters<CorsModel['reason']>[0]['problem'], preflight = false) => model.consoleLine(API, SHOP, { problem, preflight })

  it('says each refusal as Chrome 158 does, with "Response to preflight request doesn\'t pass access control check:" for a preflight\'s', () => {
    const lead = `Access to fetch at '${API}' from origin '${SHOP}' has been blocked by CORS policy: `
    // no "If an opaque response serves your needs…" tail any more, on any CORS message
    expect(line({ code: 'MissingAllowOriginHeader' })).toBe(`${lead}No 'Access-Control-Allow-Origin' header is present on the requested resource.`)
    expect(line({ code: 'MissingAllowOriginHeader' }, true)).toBe(`${lead}Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.`)
    expect(line({ code: 'WildcardOriginNotAllowed' })).toBe(`${lead}The value of the 'Access-Control-Allow-Origin' header in the response must not be the wildcard '*' when the request's credentials mode is 'include'.`)
    expect(line({ code: 'AllowOriginMismatch', value: 'https://cornerbakery.shop/' })).toBe(`${lead}The 'Access-Control-Allow-Origin' header has a value 'https://cornerbakery.shop/' that is not equal to the supplied origin. Have the server send the header with a valid value.`)
    expect(line({ code: 'MultipleAllowOriginValues', value: 'a, b' })).toBe(`${lead}The 'Access-Control-Allow-Origin' header contains multiple values 'a, b', but only one is allowed. Have the server send the header with a valid value.`)
    expect(line({ code: 'InvalidAllowOriginValue', value: 'cornerbakery.shop' })).toBe(`${lead}The 'Access-Control-Allow-Origin' header contains the invalid value 'cornerbakery.shop'. Have the server send the header with a valid value.`)
    expect(line({ code: 'InvalidAllowCredentials', value: '' })).toBe(`${lead}The value of the 'Access-Control-Allow-Credentials' header in the response is '' which must be 'true' when the request's credentials mode is 'include'.`)
    expect(line({ code: 'PreflightInvalidStatus' }, true)).toBe(`${lead}Response to preflight request doesn't pass access control check: It does not have HTTP ok status.`)
    expect(line({ code: 'MethodDisallowedByPreflightResponse', method: 'DELETE' }, true)).toBe(`${lead}Method DELETE is not allowed by Access-Control-Allow-Methods in preflight response.`)
    expect(line({ code: 'HeaderDisallowedByPreflightResponse', header: 'x-basket-id' }, true)).toBe(`${lead}Request header field x-basket-id is not allowed by Access-Control-Allow-Headers in preflight response.`)
  })
})
