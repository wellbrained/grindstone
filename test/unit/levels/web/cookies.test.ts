import { describe, expect, it } from 'vitest'
import { COOKIE_LIMITS, COOKIE_SOURCE, WEB_CLOCK } from '../../../../shared/levels/web/cookies'
import type { CookieJar, CookieModel } from '../../../../shared/levels/web/cookies'

// The cookie model (ADR 0009 chapter 2, docs/features/levels.md "The cookie model"): the very source the web backend
// runs in the sealed frame, run here on Node. Each rule next to the text of RFC 6265bis (draft-ietf-httpbis-rfc6265bis,
// "Cookies: HTTP State Management Mechanism") it follows, or the Chromium behaviour it copies where Chrome is stricter or
// kinder than the draft (Lax by default, Lax+POST, the 400-day cap, the size limits), and Chrome DevTools' words for
// each cookie it blocked (front_end/core/sdk/NetworkRequest.ts, as the shipped strings read: without the backticks).

const model = new Function(`return ${COOKIE_SOURCE}`)()() as CookieModel

const API = 'https://api.cornerbakery.shop'
const SHOP = 'https://cornerbakery.shop'
const MINUTE = 60_000

/** A jar on a clock the test moves. */
function jarAt(start = WEB_CLOCK) {
  let now = start
  const jar = model.createJar(() => now)
  const later = (ms: number) => {
    now += ms
  }
  return { jar, later }
}

const sameSite = { sameSite: true }
const set = (jar: CookieJar, line: string, url = `${API}/login`, context: { sameSite: boolean, topLevel?: boolean, script?: boolean } = sameSite) => jar.store(line, { url, ...context })
const send = (jar: CookieJar, url: string, context: { method?: string, sameSite: boolean, topLevel?: boolean } = sameSite) => jar.forRequest({ url, method: context.method ?? 'GET', sameSite: context.sameSite, topLevel: context.topLevel ?? false })
const names = (jar: CookieJar, url: string, context?: { method?: string, sameSite: boolean, topLevel?: boolean }) => send(jar, url, context).cookies.filter(cookie => cookie.problem === null).map(cookie => cookie.name)

describe('parsing a Set-Cookie line (RFC 6265bis 5.6)', () => {
  it('"name-value-pair" is everything up to the first ";", split at the first "=" and trimmed of whitespace', () => {
    expect(model.parse('session=lena-7f3a; Path=/')).toMatchObject({ name: 'session', value: 'lena-7f3a', path: '/' })
    expect(model.parse('  theme = dark=blue ;Secure')).toMatchObject({ name: 'theme', value: 'dark=blue', secure: true })
    // "If the name-value-pair string lacks a %x3D ("=") character, then the name string is empty, and the value string
    // is the value of name-value-pair."
    expect(model.parse('lonely')).toMatchObject({ name: '', value: 'lonely' })
    // "If the name string is empty and the value string is empty, ignore the set-cookie-string entirely."
    expect(model.parse(' = ; Secure')).toEqual({ problem: 'SyntaxError' })
    expect(model.parse('')).toEqual({ problem: 'SyntaxError' })
  })

  it('ignores a line with a control character, and (as Chrome) a tab inside a name or value', () => {
    // "If the set-cookie-string contains a %x00-08 / %x0A-1F / %x7F character (CTL characters excluding HTAB): Abort
    // these steps and ignore the set-cookie-string entirely."
    expect(model.parse('a=b\nc')).toEqual({ problem: 'DisallowedCharacter' })
    expect(model.parse('a=b\u007f')).toEqual({ problem: 'DisallowedCharacter' })
    expect(model.parse('a=b\tc')).toEqual({ problem: 'DisallowedCharacter' })
    expect(model.parse('a=bc\t; Secure')).toMatchObject({ name: 'a', value: 'bc' })
  })

  it('"If the sum of the lengths of the name string and the value string is more than 4096 octets, abort"', () => {
    expect(model.parse(`n=${'v'.repeat(4095)}`)).toMatchObject({ name: 'n' })
    expect(model.parse(`n=${'v'.repeat(4096)}`)).toEqual({ problem: 'NameValuePairExceedsMaxSize' })
  })

  it('reads attribute names in any case, the last of each wins, unknown ones and over-long values are ignored', () => {
    const parsed = model.parse('a=1; secure; HTTPONLY; SameSite=lax; samesite=Strict; Path=/x; path=/y; Priority=High; Domain=' + 'd'.repeat(1025))
    expect(parsed).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Strict', path: '/y', domain: null })
    // "If the attribute-value is empty or if the first character of the attribute-value is not "/": Let cookie-path be the default-path."
    expect(model.parse('a=1; Path=account')).toMatchObject({ path: null })
    expect(model.parse('a=1; Path=')).toMatchObject({ path: null })
  })

  it('takes SameSite None, Strict or Lax in any case, and anything else as not specified', () => {
    // "If cookie-av's attribute-value is a case-insensitive match for "None", set enforcement to "None"." …
    expect(model.parse('a=1; SameSite=NONE')).toMatchObject({ sameSite: 'None' })
    expect(model.parse('a=1; SameSite=strict')).toMatchObject({ sameSite: 'Strict' })
    expect(model.parse('a=1; SameSite=Lax')).toMatchObject({ sameSite: 'Lax' })
    // "Let enforcement be "Default"." (Chrome: an unknown value is as if none was given)
    expect(model.parse('a=1; SameSite=yes')).toMatchObject({ sameSite: 'Unspecified' })
    expect(model.parse('a=1')).toMatchObject({ sameSite: 'Unspecified' })
  })

  it('reads Domain without a leading dot, in lower case; an empty one is ignored', () => {
    // "If the first character of the attribute-value string is %x2E ("."): Let cookie-domain be the attribute-value
    // without the leading %x2E (".") character." … "Convert the cookie-domain to lower case."
    expect(model.parse('a=1; Domain=.CornerBakery.shop')).toMatchObject({ domain: 'cornerbakery.shop' })
    expect(model.parse('a=1; Domain=')).toMatchObject({ domain: null })
    // Chromium: the last Domain wins, also an empty one (the cookie is then host-only)
    expect(model.parse('a=1; Domain=cornerbakery.shop; Domain=')).toMatchObject({ domain: null })
  })

  it('reads Max-Age as a whole number of seconds (a leading + too, as Chromium reads it), else ignores it', () => {
    // "If the first character of the attribute-value is neither a DIGIT, nor a "-" character followed by a DIGIT, ignore
    // the cookie-av. If the remainder of attribute-value contains a non-DIGIT character, ignore the cookie-av."
    expect(model.parse('a=1; Max-Age=3600')).toMatchObject({ maxAge: 3600 })
    expect(model.parse('a=1; Max-Age=-1')).toMatchObject({ maxAge: -1 })
    expect(model.parse('a=1; Max-Age=1h')).toMatchObject({ maxAge: null })
    // the draft would ignore "+5"; Chromium's StringToInt64 takes it
    expect(model.parse('a=1; Max-Age=+5')).toMatchObject({ maxAge: 5 })
    expect(model.parse('a=1; Max-Age=+')).toMatchObject({ maxAge: null })
    expect(model.parse(`a=1; Max-Age=${'9'.repeat(40)}`)).toMatchObject({ maxAge: Number.MAX_SAFE_INTEGER })
  })

  it('reads Expires with the cookie-date algorithm (5.1.1), else ignores it', () => {
    expect(model.parse('a=1; Expires=Wed, 18 Nov 2026 09:41:00 GMT')).toMatchObject({ expires: Date.UTC(2026, 10, 18, 9, 41) })
    // the tokens may come in any order, with any delimiters; a two-digit year 70-99 is 19xx, 0-69 20xx
    expect(model.parse('a=1; expires=09:41:00 18-nov-26')).toMatchObject({ expires: Date.UTC(2026, 10, 18, 9, 41) })
    expect(model.parse('a=1; Expires=Thu, 01 Jan 1970 00:00:00 GMT')).toMatchObject({ expires: 0 })
    // "Abort these steps and fail to parse the cookie-date if: … the day-of-month-value is less than 1 or greater than
    // 31, … the year-value is less than 1601, … the hour-value is greater than 23, …"
    for (const bad of ['Wed, 32 Nov 2026 09:41:00 GMT', 'Wed, 18 Nov 2026 24:00:00 GMT', 'tomorrow', '18 Nov 2026'])
      expect(model.parse(`a=1; Expires=${bad}`), bad).toMatchObject({ expires: null })
    // where the draft fails a year before 1601, Chromium clamps it to 1601: long expired
    expect(model.parse('a=1; Expires=Wed, 18 Nov 1600 09:41:00 GMT')).toMatchObject({ expires: Date.UTC(1601, 10, 18, 9, 41) })
  })

  it('never throws and stays linear on long or odd input', () => {
    const started = Date.now()
    expect(model.parse(`a=${';'.repeat(200_000)}`)).toMatchObject({ name: 'a', value: '' })
    expect(model.parse(`a=1; Expires=${'1 '.repeat(100_000)}`)).toMatchObject({ expires: null })
    expect(Date.now() - started).toBeLessThan(1000)
    for (const odd of [undefined, null, 42, {}, '=', ';', '==', '\u0000']) expect(() => model.parse(odd as unknown as string)).not.toThrow()
  })
})

describe('sites and domains', () => {
  it('a site is the scheme and the registrable domain: the public suffix (here: the last label) and one label more', () => {
    expect(model.siteOf('https://api.cornerbakery.shop/menu')).toBe('https://cornerbakery.shop')
    expect(model.siteOf('https://promo.cornerbakery.shop')).toBe('https://cornerbakery.shop')
    expect(model.siteOf('https://cheap-flour.example/deal')).toBe('https://cheap-flour.example')
    // schemeful same-site: http and https of one domain are two sites
    expect(model.siteOf('http://cornerbakery.shop')).toBe('http://cornerbakery.shop')
    expect(model.siteOf('https://localhost:8080')).toBe('https://localhost')
    expect(model.isPublicSuffix('shop')).toBe(true)
    expect(model.isPublicSuffix('cornerbakery.shop')).toBe(false)
  })

  it('"domain-matches": the same string, or a suffix after a dot (5.1.3)', () => {
    expect(model.domainMatch('api.cornerbakery.shop', 'cornerbakery.shop')).toBe(true)
    expect(model.domainMatch('cornerbakery.shop', 'cornerbakery.shop')).toBe(true)
    expect(model.domainMatch('notcornerbakery.shop', 'cornerbakery.shop')).toBe(false)
    expect(model.domainMatch('cornerbakery.shop', 'api.cornerbakery.shop')).toBe(false)
  })

  it('"default-path" is the request path up to its last slash, "/" when that is the first (5.1.4)', () => {
    expect(model.defaultPath('/auth/login')).toBe('/auth')
    expect(model.defaultPath('/login')).toBe('/')
    expect(model.defaultPath('/')).toBe('/')
    expect(model.defaultPath('')).toBe('/')
    expect(model.defaultPath('/a/b/')).toBe('/a/b')
  })

  it('"path-matches": the same path, or a prefix that ends at a slash (5.1.4)', () => {
    expect(model.pathMatch('/auth/login', '/auth')).toBe(true)
    expect(model.pathMatch('/auth', '/auth')).toBe(true)
    expect(model.pathMatch('/account', '/')).toBe(true)
    expect(model.pathMatch('/authors', '/auth')).toBe(false)
    expect(model.pathMatch('/account', '/auth')).toBe(false)
  })
})

describe('storing a cookie (5.7)', () => {
  it('without Domain is host-only; with Domain it goes to every host under it', () => {
    const { jar } = jarAt()
    expect(set(jar, 'host=1').cookie).toMatchObject({ domain: 'api.cornerbakery.shop', hostOnly: true, path: '/' })
    expect(set(jar, 'wide=1; Domain=cornerbakery.shop').cookie).toMatchObject({ domain: 'cornerbakery.shop', hostOnly: false })
    expect(names(jar, `${API}/basket`)).toEqual(['host', 'wide'])
    expect(names(jar, `${SHOP}/api/hours`)).toEqual(['wide'])
    // a host-only cookie of another host of the same site is listed, blocked by its domain (as Chrome does)
    expect(send(jar, `${SHOP}/api/hours`).cookies.find(cookie => cookie.name === 'host')!.problem).toBe('DomainMismatch')
  })

  it('refuses a Domain that is a public suffix, or that the host does not domain-match', () => {
    const { jar } = jarAt()
    // "If cookie-domain is a public suffix: If the request-host is identical to cookie-domain: Set the host-only-flag …
    // Otherwise: Abort these steps and ignore the cookie entirely."
    expect(set(jar, 'a=1; Domain=shop')).toMatchObject({ problem: 'InvalidDomain', cookie: null })
    // "If the canonicalized request-host does not domain-match the domain-attribute: Ignore the cookie entirely"
    expect(set(jar, 'b=1; Domain=cheap-flour.example')).toMatchObject({ problem: 'InvalidDomain' })
    expect(set(jar, 'c=1; Domain=promo.cornerbakery.shop')).toMatchObject({ problem: 'InvalidDomain' })
    expect(set(jar, 'd=1; Domain=api.cornerbakery.shop').cookie).toMatchObject({ hostOnly: false })
    expect(jar.list().map(cookie => cookie.name)).toEqual(['d'])
  })

  it('uses the default-path when Path is missing or not a path', () => {
    const { jar } = jarAt()
    expect(set(jar, 'session=1', `${API}/auth/login`).cookie).toMatchObject({ path: '/auth' })
    expect(set(jar, 'other=1; Path=/', `${API}/auth/login`).cookie).toMatchObject({ path: '/' })
    expect(names(jar, `${API}/auth/me`)).toEqual(['session', 'other'])
    expect(names(jar, `${API}/account`)).toEqual(['other'])
    expect(send(jar, `${API}/account`).cookies.find(cookie => cookie.name === 'session')!.problem).toBe('NotOnPath')
  })

  it('refuses Secure from an insecure connection and SameSite=None without Secure', () => {
    const { jar } = jarAt()
    // "If the scheme component of the request-uri does not denote a "secure" protocol … and the cookie's
    // secure-only-flag is true, then abort these steps and ignore the cookie entirely."
    expect(set(jar, 'a=1; Secure', 'http://api.cornerbakery.shop/login')).toMatchObject({ problem: 'SecureOnly' })
    // "If the cookie's same-site-flag is "None", abort these steps and ignore the cookie entirely unless the cookie's
    // secure-only-flag is true."
    expect(set(jar, 'session=lena; SameSite=None; HttpOnly')).toMatchObject({ problem: 'SameSiteNoneInsecure', cookie: null })
    expect(set(jar, 'session=lena; SameSite=None; Secure').cookie).toMatchObject({ sameSite: 'None', secure: true })
  })

  it('refuses a SameSite cookie from a cross-site response unless it navigates the top level', () => {
    const { jar } = jarAt()
    const cross = { sameSite: false }
    expect(set(jar, 'a=1; SameSite=Lax; Secure', `${API}/x`, cross)).toMatchObject({ problem: 'SameSiteLax' })
    expect(set(jar, 'b=1; SameSite=Strict', `${API}/x`, cross)).toMatchObject({ problem: 'SameSiteStrict' })
    expect(set(jar, 'c=1', `${API}/x`, cross)).toMatchObject({ problem: 'SameSiteUnspecifiedTreatedAsLax' })
    expect(set(jar, 'd=1; SameSite=None; Secure', `${API}/x`, cross).problem).toBeNull()
    expect(set(jar, 'e=1; SameSite=Strict', `${API}/x`, { sameSite: false, topLevel: true }).problem).toBeNull()
  })

  it('replaces a cookie of the same name, domain, host-only flag and path; Chromium keeps its creation time only for the same value', () => {
    const { jar, later } = jarAt()
    set(jar, 'theme=dark')
    later(MINUTE)
    set(jar, 'theme=dark')
    expect(jar.list()[0]!.created).toBe(WEB_CLOCK)
    later(MINUTE)
    set(jar, 'theme=light')
    expect(jar.list()[0]!.created).toBe(WEB_CLOCK + 2 * MINUTE)
    set(jar, 'theme=dark')
    set(jar, 'theme=wide; Domain=cornerbakery.shop')
    const themes = jar.list().filter(cookie => cookie.name === 'theme')
    expect(themes.map(cookie => [cookie.value, cookie.hostOnly])).toEqual([['dark', true], ['wide', false]])
    expect(themes[0]!.created).toBe(WEB_CLOCK + 2 * MINUTE)
  })

  it('deletes with an expiry in the past (Max-Age=0, an old Expires), and Max-Age wins over Expires', () => {
    const { jar } = jarAt()
    set(jar, 'session=lena; Path=/')
    expect(set(jar, 'session=; Max-Age=0; Path=/')).toMatchObject({ deleted: true, cookie: null, problem: null })
    set(jar, 'b=1')
    expect(set(jar, 'b=; Expires=Thu, 01 Jan 1970 00:00:00 GMT').deleted).toBe(true)
    // "If the cookie-attribute-list contains an attribute with an attribute-name of "Max-Age": Set the cookie's
    // persistent-flag to true. Set the cookie's expiry-time to attribute-value of the last attribute …"
    expect(set(jar, 'c=1; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=60').cookie).toMatchObject({ expires: WEB_CLOCK + MINUTE })
    expect(jar.list().map(cookie => cookie.name)).toEqual(['c'])
  })

  it('caps an expiry at 400 days (Chrome), and lets a cookie expire on the clock', () => {
    const { jar, later } = jarAt()
    expect(set(jar, 'a=1; Max-Age=999999999').cookie!.expires).toBe(WEB_CLOCK + 400 * 24 * 60 * MINUTE)
    expect(set(jar, 'short=1; Max-Age=60').cookie!.expires).toBe(WEB_CLOCK + MINUTE)
    expect(set(jar, 'session=1').cookie!.expires).toBeNull()
    later(MINUTE)
    expect(jar.list().map(cookie => cookie.name)).toEqual(['a', 'session'])
  })

  it('keeps a Secure cookie from an insecure overwrite ("Leave Secure Cookies Alone")', () => {
    const { jar } = jarAt()
    set(jar, 'session=lena; Secure; Path=/')
    expect(set(jar, 'session=evil; Path=/', 'http://api.cornerbakery.shop/x')).toMatchObject({ problem: 'OverwriteSecure' })
    expect(jar.list()[0]!.value).toBe('lena')
  })

  it('caps the cookies of one site at 180, dropping the 30 used longest ago (Chrome\'s limits)', () => {
    const { jar, later } = jarAt()
    for (let i = 0; i < COOKIE_LIMITS.perSite; i++) {
      set(jar, `c${i}=1`)
      later(1)
    }
    expect(jar.list()).toHaveLength(180)
    set(jar, 'one-more=1')
    expect(jar.list()).toHaveLength(150)
    expect(jar.list().some(cookie => cookie.name === 'c0')).toBe(false)
    expect(jar.list().some(cookie => cookie.name === 'one-more')).toBe(true)
  })
})

describe('which cookies a request carries (5.8.3)', () => {
  const lena = () => {
    const made = jarAt()
    set(made.jar, 'none=1; SameSite=None; Secure')
    set(made.jar, 'lax=1; SameSite=Lax')
    set(made.jar, 'strict=1; SameSite=Strict')
    set(made.jar, 'unset=1')
    return made
  }

  it('sends every cookie with a same-site request, in the order of their paths and creation', () => {
    const { jar, later } = jarAt()
    set(jar, 'b=1; Path=/')
    later(1)
    set(jar, 'a=1; Path=/')
    set(jar, 'deep=1; Path=/basket')
    // "Cookies with longer paths are listed before cookies with shorter paths. Among cookies that have equal-length
    // path fields, cookies with earlier creation-times are listed before cookies with later creation-times."
    expect(send(jar, `${API}/basket/lines`).header).toBe('deep=1; b=1; a=1')
  })

  it('a subresource from another site gets SameSite=None only', () => {
    const { jar } = lena()
    const result = send(jar, `${API}/orders`, { method: 'POST', sameSite: false })
    expect(result.header).toBe('none=1')
    expect(Object.fromEntries(result.cookies.map(cookie => [cookie.name, cookie.problem]))).toEqual({ none: null, lax: 'SameSiteLax', strict: 'SameSiteStrict', unset: 'SameSiteUnspecifiedTreatedAsLax' })
  })

  it('a top-level GET navigation from another site gets Lax too, never Strict', () => {
    const { jar } = lena()
    expect(names(jar, `${API}/pickup/1042`, { sameSite: false, topLevel: true })).toEqual(['none', 'lax', 'unset'])
  })

  it('a top-level POST from another site gets None, and (Chrome\'s Lax+POST) a cookie without SameSite for its first 2 minutes', () => {
    const { jar, later } = lena()
    const post = { method: 'POST', sameSite: false, topLevel: true }
    const fresh = send(jar, `${API}/orders`, post)
    expect(fresh.header).toBe('none=1; unset=1')
    expect(fresh.cookies.find(cookie => cookie.name === 'unset')).toMatchObject({ problem: null, laxAllowUnsafe: true })
    later(2 * MINUTE + 1)
    expect(names(jar, `${API}/orders`, post)).toEqual(['none'])
  })

  it('sends a Secure cookie only over https, and none at all without credentials', () => {
    const { jar } = jarAt()
    set(jar, 'a=1; Secure; Domain=cornerbakery.shop')
    expect(send(jar, 'http://api.cornerbakery.shop/x', { sameSite: false }).cookies[0]!.problem).toBe('SecureOnly')
    expect(jar.forRequest({ url: `${API}/x`, method: 'GET', sameSite: true, topLevel: false, credentials: false })).toEqual({ header: null, cookies: [] })
  })
})

describe('document.cookie (a "non-HTTP" API)', () => {
  it('reads the page\'s cookies without the HttpOnly ones', () => {
    const { jar } = jarAt()
    set(jar, 'session=lena; HttpOnly; Domain=cornerbakery.shop')
    set(jar, 'theme=dark; Domain=cornerbakery.shop')
    set(jar, 'api-only=1')
    expect(jar.document(`${SHOP}/order`)).toBe('theme=dark')
    expect(jar.readable(SHOP)).toEqual(['theme'])
  })

  it('writes through the same rules, and can neither set nor replace an HttpOnly cookie', () => {
    const { jar } = jarAt()
    // "If the cookie was received from a "non-HTTP" API and the cookie's http-only-flag is true, abort these steps"
    expect(jar.write('session=forged; HttpOnly', `${SHOP}/order`)).toMatchObject({ problem: 'HttpOnlyFromScript' })
    set(jar, 'session=lena; HttpOnly; Path=/', `${SHOP}/login`)
    // "If the newly-created cookie was received from a "non-HTTP" API and the old-cookie's http-only-flag is true,
    // abort these steps and ignore the newly created cookie entirely."
    expect(jar.write('session=forged; Path=/', `${SHOP}/order`)).toMatchObject({ problem: 'OverwriteHttpOnly' })
    expect(jar.write('theme=dark', `${SHOP}/order`).cookie).toMatchObject({ domain: 'cornerbakery.shop', hostOnly: true, path: '/' })
    expect(jar.write('wide=1; Domain=cheap-flour.example', `${SHOP}/order`)).toMatchObject({ problem: 'InvalidDomain' })
    expect(jar.document(`${SHOP}/order`)).toBe('theme=dark')
  })

  it('reads what a script on any path of the origin could read: Path does not protect a cookie from scripts', () => {
    const { jar } = jarAt()
    set(jar, 'session=lena; Path=/account; Domain=cornerbakery.shop')
    expect(jar.document(`${SHOP}/order`)).toBe('')
    expect(jar.readable(SHOP)).toEqual(['session'])
    // what such a script could send away: every cookie it can read, as a Cookie header
    set(jar, 'hidden=1; HttpOnly; Domain=cornerbakery.shop')
    set(jar, 'theme=dark; Domain=cornerbakery.shop')
    expect(jar.steal(SHOP)).toBe('session=lena; theme=dark')
  })
})

describe('setters and getters the page puts on the prototypes', () => {
  it('see nothing the jar writes, and change nothing it decides', () => {
    let caught = 0
    const seen = { names: '' }
    const indices = Array.from({ length: 20 }, (_, index) => String(index))
    const fields = ['cookie', 'problem', 'script', 'topLevel', 'credentials', 'created']
    try {
      const count = () => {
        caught += 1
      }
      for (const index of indices) Object.defineProperty(Array.prototype, index, { configurable: true, set: count, get: () => undefined })
      for (const field of fields) Object.defineProperty(Object.prototype, field, { configurable: true, set: count, get: () => field === 'problem' ? 'SyntaxError' : true })
      const { jar } = jarAt()
      expect(set(jar, 'session=lena; HttpOnly; Secure; SameSite=Lax; Path=/').cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' })
      set(jar, 'theme=dark; Secure; Path=/')
      // a cross-site subresource: the inherited sameSite/topLevel getters (true) answer nothing
      expect(jar.forRequest({ url: `${API}/orders`, method: 'POST', sameSite: false, topLevel: false }).header).toBeNull()
      expect(jar.forRequest({ url: `${API}/orders`, method: 'GET', sameSite: true, topLevel: false }).header).toBe('session=lena; theme=dark')
      seen.names = jar.list().map(cookie => cookie.name).join(',')
      expect(jar.write('forged=1; HttpOnly', `${API}/page`).problem).toBe('HttpOnlyFromScript')
    } finally {
      for (const index of indices) Reflect.deleteProperty(Array.prototype, index)
      for (const field of fields) Reflect.deleteProperty(Object.prototype, field)
    }
    expect(caught).toBe(0)
    expect(seen.names).toBe('session,theme')
  })
})

describe('Chrome\'s words', () => {
  it('for a Set-Cookie it blocked', () => {
    expect(model.reason('SameSiteNoneInsecure', 'set')).toBe('This attempt to set a cookie via a "Set-Cookie" header was blocked because it had the "SameSite=None" attribute but didn’t have the "Secure" attribute, which is required in order to use "SameSite=None"')
    expect(model.reason('InvalidDomain', 'set')).toBe('This attempt to set a cookie via a "Set-Cookie" header was blocked because its "Domain" attribute was invalid with regards to the current host URL')
    expect(model.reason('SameSiteLax', 'set')).toBe('This attempt to set a cookie via a "Set-Cookie" header was blocked because it had the "SameSite=Lax" attribute but came from a cross-site response which wasn’t the response to a top-level navigation')
    expect(model.reason('SyntaxError', 'set')).toBe('This "Set-Cookie" header had invalid syntax')
  })

  it('for a cookie it did not send', () => {
    expect(model.reason('SameSiteLax', 'send')).toBe('This cookie was blocked because it had the "SameSite=Lax" attribute and the request was made from a different site and wasn’t initiated by a top-level navigation')
    expect(model.reason('SameSiteStrict', 'send')).toBe('This cookie was blocked because it had the "SameSite=Strict" attribute and the request was made from a different site. This includes top-level navigation requests initiated by other sites.')
    expect(model.reason('NotOnPath', 'send')).toBe('This cookie was blocked because its path wasn’t an exact match for or a superdirectory of the request URL’s path')
    expect(model.reason('DomainMismatch', 'send')).toMatch(/^This cookie was blocked because neither did the request URL’s domain exactly match the cookie’s domain/)
  })

  it('for what document.cookie could not write (Chrome says nothing there; these are Grindstone\'s words)', () => {
    expect(model.reason('HttpOnlyFromScript', 'script')).toMatch(/^document\.cookie can't set an HttpOnly cookie/)
    expect(model.reason('InvalidDomain', 'script')).toMatch(/^document\.cookie: /)
  })
})
