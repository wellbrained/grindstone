import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { JWT_SOURCE, decodeToken } from '../../../../shared/levels/web/tokens'
import type { JwtInternals, JwtModule } from '../../../../shared/levels/web/tokens'
import { WEB_CLOCK } from '../../../../shared/levels/web/cookies'

// Signed tokens (ADR 0009 chapter 3, docs/features/levels.md "Tokens"): the jsonwebtoken subset server.js gets, the very
// source the worker runs, here on Node on a clock the test moves. SHA-256 and HMAC against the standards' test vectors
// and Node's crypto, a token jwt.io shows, and the package's options, claims, errors and words.

function at(start = WEB_CLOCK) {
  let now = start
  const made = new Function(`return ${JWT_SOURCE}`)()(() => now) as { module: JwtModule, internals: JwtInternals }
  const later = (seconds: number) => {
    now += seconds * 1000
  }
  return { jwt: made.module, internals: made.internals, later }
}

const SECRET = 'oven-mitt-4417'
const IAT = Math.floor(WEB_CLOCK / 1000)
const part = (token: string, index: number) => JSON.parse(Buffer.from(token.split('.')[index]!, 'base64url').toString('utf8')) as Record<string, unknown>
const thrown = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return error as Error & { expiredAt?: Date }
  }
  throw new Error('did not throw')
}

describe('SHA-256 and HMAC-SHA256 (what HS256 signs with)', () => {
  const { internals } = at()

  it('give FIPS 180-4\'s and RFC 4231\'s test vectors', () => {
    expect(internals.sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(internals.sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(internals.sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
    // RFC 4231, test case 2
    expect(internals.hmacHex('Jefe', 'what do ya want for nothing?')).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843')
  })

  it('agree with Node\'s crypto for every length around the block size, a key longer than a block, and UTF-8', () => {
    for (let length = 0; length < 140; length++) {
      const text = 'é€'.repeat(length % 7) + 'x'.repeat(length)
      expect(internals.sha256Hex(text), `${length}`).toBe(createHash('sha256').update(text).digest('hex'))
    }
    const long = 'k'.repeat(100)
    expect(internals.hmacHex(long, 'payload')).toBe(createHmac('sha256', long).update('payload').digest('hex'))
    expect(internals.hmacHex(SECRET, 'header.payload')).toBe(createHmac('sha256', SECRET).update('header.payload').digest('hex'))
  })
})

describe('jwt.sign (jsonwebtoken)', () => {
  it('makes the token jwt.io shows for its example (header, payload, and the HS256 signature with its secret)', () => {
    const { jwt } = at()
    expect(jwt.sign({ sub: '1234567890', name: 'John Doe', iat: 1516239022 }, 'your-256-bit-secret')).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c')
  })

  it('adds iat (the scripted clock, in seconds) and exp from expiresIn (a number is seconds, a string goes through ms)', () => {
    const { jwt } = at()
    const token = jwt.sign({ sub: 'lena' }, SECRET, { expiresIn: '15m' })!
    expect(part(token, 0)).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(part(token, 1)).toEqual({ sub: 'lena', iat: IAT, exp: IAT + 900 })
    expect(part(jwt.sign({ sub: 'lena' }, SECRET, { expiresIn: 60 })!, 1).exp).toBe(IAT + 60)
    expect(part(jwt.sign({ sub: 'lena' }, SECRET, { expiresIn: '30 days' })!, 1).exp).toBe(IAT + 30 * 86400)
    // the package's gotcha: a string without a unit is milliseconds
    expect(part(jwt.sign({ sub: 'lena' }, SECRET, { expiresIn: '60' })!, 1).exp).toBe(IAT)
    // no expiresIn: no exp at all, a token that never runs out
    expect(part(jwt.sign({ sub: 'lena' }, SECRET)!, 1)).toEqual({ sub: 'lena', iat: IAT })
    // the claims the options name, after exp, as the package writes them
    expect(Object.keys(part(jwt.sign({ sub: 'lena' }, SECRET, { expiresIn: '1h', jwtid: 'j-1' })!, 1))).toEqual(['sub', 'iat', 'exp', 'jti'])
    expect(part(jwt.sign({ sub: 'lena' }, SECRET, { noTimestamp: true })!, 1)).toEqual({ sub: 'lena' })
  })

  it('signs exactly as HMAC-SHA256 over header.payload, so any other secret or a changed payload gives another signature', () => {
    const { jwt } = at()
    const token = jwt.sign({ sub: 'lena' }, SECRET)!
    const [header, payload, signature] = token.split('.') as [string, string, string]
    expect(signature).toBe(createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url'))
  })

  it('refuses what the package refuses, in its words', () => {
    const { jwt } = at()
    expect(thrown(() => jwt.sign({ sub: 'lena' }, '')).message).toBe('secretOrPrivateKey must have a value')
    expect(thrown(() => jwt.sign({ sub: 'lena', exp: 1 }, SECRET, { expiresIn: '1h' })).message).toBe('Bad "options.expiresIn" option the payload already has an "exp" property.')
    expect(thrown(() => jwt.sign({ sub: 'lena' }, SECRET, { expiresIn: 'soon' })).message).toBe('"expiresIn" should be a number of seconds or string representing a timespan eg: "1d", "20h", 60')
    expect(thrown(() => jwt.sign({ sub: 'lena' }, SECRET, { algorithm: 'RS256' })).message).toMatch(/HS256 only/)
  })
})

describe('jwt.verify (jsonwebtoken)', () => {
  it('returns the payload of a token signed with the secret, while it is in its time', () => {
    const { jwt, later } = at()
    const token = jwt.sign({ sub: 'lena' }, SECRET, { expiresIn: '15m' })!
    expect(jwt.verify(token, SECRET)).toEqual({ sub: 'lena', iat: IAT, exp: IAT + 900 })
    later(899)
    expect(jwt.verify(token, SECRET)).toMatchObject({ sub: 'lena' })
    // "jwt expired" from the second exp is reached, with expiredAt
    later(1)
    const expired = thrown(() => jwt.verify(token, SECRET))
    expect(expired).toBeInstanceOf(jwt.TokenExpiredError)
    expect(expired).toBeInstanceOf(jwt.JsonWebTokenError)
    expect([expired.name, expired.message, expired.expiredAt?.toISOString()]).toEqual(['TokenExpiredError', 'jwt expired', '2026-11-17T09:56:00.000Z'])
    // ignoreExpiration takes it anyway; a token without exp is never too old (unless maxAge is asked)
    expect(jwt.verify(token, SECRET, { ignoreExpiration: true })).toMatchObject({ sub: 'lena' })
    const forever = at(WEB_CLOCK - 7 * 86400_000).jwt.sign({ sub: 'lena' }, SECRET)!
    expect(jwt.verify(forever, SECRET)).toMatchObject({ sub: 'lena' })
    expect(thrown(() => jwt.verify(forever, SECRET, { maxAge: '15m' })).message).toBe('maxAge exceeded')
  })

  it('refuses a changed payload, another secret, no signature, another algorithm and what isn\'t a token, in the package\'s words', () => {
    const { jwt } = at()
    const token = jwt.sign({ sub: 'lena' }, SECRET, { expiresIn: '15m' })!
    const [header, , signature] = token.split('.') as [string, string, string]
    const ben = Buffer.from(JSON.stringify({ sub: 'ben', iat: IAT, exp: IAT + 900 })).toString('base64url')
    const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = token.split('.')[1]!
    const cases: [unknown, string][] = [
      [`${header}.${ben}.${signature}`, 'invalid signature'],
      [jwt.sign({ sub: 'lena' }, 'guessed-secret'), 'invalid signature'],
      [`${none}.${payload}.`, 'jwt signature is required'],
      [`${Buffer.from(JSON.stringify({ alg: 'HS512', typ: 'JWT' })).toString('base64url')}.${payload}.${signature}`, 'invalid algorithm'],
      ['not-a-token', 'jwt malformed'],
      ['a.b.c', 'invalid token'],
      ['', 'jwt must be provided'],
      [undefined, 'jwt must be provided'],
      [42, 'jwt must be a string']
    ]
    for (const [given, message] of cases) {
      const error = thrown(() => jwt.verify(given, SECRET))
      expect([error.name, error.message], String(given)).toEqual(['JsonWebTokenError', message])
    }
  })

  it('answers through a callback when given one, as the package does', async () => {
    const { jwt } = at()
    const token = jwt.sign({ sub: 'lena' }, SECRET)!
    const result = await new Promise(resolve => jwt.verify(token, SECRET, (error: unknown, payload: unknown) => resolve([error, payload])))
    expect(result).toEqual([null, { sub: 'lena', iat: IAT }])
    const failed = await new Promise<unknown[]>(resolve => jwt.verify('x', SECRET, {}, (error: unknown, payload: unknown) => resolve([error, payload])))
    expect((failed[0] as Error).message).toBe('jwt malformed')
  })
})

describe('jwt.decode and decodeToken (the Application panel\'s): anyone can read a token', () => {
  it('reads the payload (and the header) without the secret, and null for anything else', () => {
    const { jwt } = at()
    const token = jwt.sign({ sub: 'lena' }, SECRET, { expiresIn: '15m' })!
    expect(jwt.decode(token)).toEqual({ sub: 'lena', iat: IAT, exp: IAT + 900 })
    expect(jwt.decode(token, { complete: true })).toMatchObject({ header: { alg: 'HS256', typ: 'JWT' }, payload: { sub: 'lena' } })
    expect(jwt.decode('nope')).toBeNull()
    expect(decodeToken(token)).toEqual({ header: { alg: 'HS256', typ: 'JWT' }, payload: { sub: 'lena', iat: IAT, exp: IAT + 900 } })
    expect(decodeToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c')?.payload).toEqual({ sub: '1234567890', name: 'John Doe', iat: 1516239022 })
    for (const text of ['lena-7f3a', 'a.b.c', 'eyJ.eyJ.x', `${token}.x`, 'x'.repeat(5000)]) expect(decodeToken(text), text.slice(0, 20)).toBeNull()
  })
})
