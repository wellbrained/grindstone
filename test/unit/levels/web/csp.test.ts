import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { CSP_SOURCE } from '../../../../shared/levels/web/csp'
import type { Policy, PolicyModel } from '../../../../shared/levels/web/csp'

// The policy model (ADR 0009 chapter 7, docs/features/levels.md "The policy model"): the very source the web backend
// runs in the sealed frame, run here on Node. Each rule next to the Chromium code it follows, and Chrome's Console
// words from csp_directive_list.cc, content_security_policy.cc (network), ancestor_throttle.cc.

const model = new Function(`return ${CSP_SOURCE}`)()() as PolicyModel

const SHOP = 'https://cornerbakery.shop'
const header = (value: string): Policy[] => model.parse(value, 'enforce', 'header').policies
const reportOnly = (value: string): Policy[] => model.parse(value, 'report', 'header').policies
const sha = (text: string) => `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`
const lines = (verdict: { violations: { line: { text: string } }[] }) => verdict.violations.map(each => each.line.text)

describe('parsing a policy', () => {
  it('splits a header on commas into policies and each on semicolons into directives, names in any case', () => {
    const parsed = model.parse(`SCRIPT-SRC 'self'; img-src *, connect-src 'none'`, 'enforce', 'header')
    expect(parsed.policies).toHaveLength(2)
    expect(parsed.policies[0]!.names).toEqual(['script-src', 'img-src'])
    expect(parsed.policies[0]!.raw['script-src']).toBe('\'self\'')
    expect(parsed.policies[1]!.names).toEqual(['connect-src'])
    expect(parsed.lines).toEqual([])
  })

  it('a meta tag\'s content is one policy: a comma is part of it', () => {
    expect(model.parse(`script-src 'self', img-src *`, 'enforce', 'meta').policies).toHaveLength(1)
  })

  it('says what it ignores in Chrome\'s words', () => {
    const texts = (value: string, type: 'enforce' | 'report' = 'enforce', source: 'header' | 'meta' = 'header') => model.parse(value, type, source).lines.map(line => line.text)
    expect(texts('scritp-src \'self\'')).toEqual(['Unrecognized Content-Security-Policy directive \'scritp-src\'.'])
    expect(texts('script-src \'self\'; script-src *')).toEqual(['Ignoring duplicate Content-Security-Policy directive \'script-src\'.'])
    expect(texts('frame-ancestors \'self\'', 'enforce', 'meta')).toEqual(['The Content Security Policy directive \'frame-ancestors\' is ignored when delivered via a <meta> element.'])
    expect(texts('report-uri /csp', 'enforce', 'meta')).toEqual(['The Content Security Policy directive \'report-uri\' is ignored when delivered via a <meta> element.'])
    expect(texts('script-src \'self\'', 'report', 'meta')).toEqual(['The report-only Content Security Policy \'script-src \'self\'\' was delivered via a <meta> element, which is disallowed. The policy has been ignored.'])
    expect(texts('script-src \'self\' img-src *')).toEqual(['The Content-Security-Policy directive \'script-src\' contains \'img-src\' as a source expression. Did you want to add it as a directive and forget a semicolon?'])
    // "img-src" is also a host name to Chromium's ParseSource: only the semicolon note fires
    expect(texts('frame-ancestors \'unsafe-inline\'')).toEqual(['The Content-Security-Policy directive \'frame-ancestors\' does not support the source expression \'\'unsafe-inline\'\''])
    expect(texts('script-src \'none\' \'self\'')).toEqual(['The Content-Security-Policy directive \'script-src\' contains the keyword \'none\' alongside with other source expressions. The keyword \'none\' must be the only source expression in the directive value, otherwise it is ignored.'])
    expect(texts('script-src \'unsafe-inlin\'')).toEqual(['The source list for the Content Security Policy directive \'script-src\' contains an invalid source: \'\'unsafe-inlin\'\'. It will be ignored.'])
  })

  it('keeps report-uri\'s endpoints, nonces and hashes', () => {
    const [policy] = header(`script-src 'nonce-r4nd0m' 'sha256-AbC_-1=' https://widgets.tastebuds.example; report-uri /csp-report https://reports.example/x`)
    expect(policy!.reportTo).toEqual(['/csp-report', 'https://reports.example/x'])
    expect(policy!.lists['script-src']!.nonces).toEqual(['r4nd0m'])
    expect(policy!.lists['script-src']!.hashes).toEqual([{ algorithm: 'sha256', digest: 'AbC/+1' }])
    expect(policy!.lists['script-src']!.sources).toEqual([{ scheme: 'https', host: 'widgets.tastebuds.example', wildcard: false, port: -1, path: '' }])
  })
})

describe('which scripts load (script-src-elem, then script-src, then default-src)', () => {
  const allowed = (policy: string, url: string, nonce: string | null = null, parser = true) => model.script(header(policy), SHOP, url, nonce, parser).allowed

  it('\'self\' is the page\'s own origin, and its https upgrade only', () => {
    expect(allowed('script-src \'self\'', `${SHOP}/app.js`)).toBe(true)
    expect(allowed('script-src \'self\'', 'https://api.cornerbakery.shop/x.js')).toBe(false)
    expect(allowed('script-src \'self\'', 'http://cornerbakery.shop/app.js')).toBe(false)
    expect(allowed('script-src \'self\'', `${SHOP}:8443/app.js`)).toBe(false)
    expect(allowed('default-src \'self\'', `${SHOP}/app.js`)).toBe(true)
  })

  it('a host without a scheme takes the page\'s; a wildcard takes subdomains, never the name itself', () => {
    expect(allowed('script-src widgets.tastebuds.example', 'https://widgets.tastebuds.example/reviews.js')).toBe(true)
    expect(allowed('script-src widgets.tastebuds.example', 'http://widgets.tastebuds.example/reviews.js')).toBe(false)
    expect(allowed('script-src https://*.tastebuds.example', 'https://cdn.tastebuds.example/v2.js')).toBe(true)
    expect(allowed('script-src https://*.tastebuds.example', 'https://tastebuds.example/v2.js')).toBe(false)
    expect(allowed('script-src http://widgets.tastebuds.example', 'https://widgets.tastebuds.example/reviews.js')).toBe(true)
    expect(allowed('script-src https:', 'https://cheap-flour.example/steal.js')).toBe(true)
  })

  it('a path ending in / is a folder, any other path exactly one file; ports by default port', () => {
    expect(allowed('script-src https://cdn.example/tastebuds/', 'https://cdn.example/tastebuds/reviews.js')).toBe(true)
    expect(allowed('script-src https://cdn.example/tastebuds/', 'https://cdn.example/someone/evil.js')).toBe(false)
    expect(allowed('script-src https://cdn.example/reviews.js', 'https://cdn.example/reviews.js')).toBe(true)
    expect(allowed('script-src https://cdn.example/reviews.js', 'https://cdn.example/reviews.js2')).toBe(false)
    expect(allowed('script-src https://cdn.example:443', 'https://cdn.example/a.js')).toBe(true)
    expect(allowed('script-src https://cdn.example:*', 'https://cdn.example:8443/a.js')).toBe(true)
    expect(allowed('script-src https://cdn.example', 'https://cdn.example:8443/a.js')).toBe(false)
  })

  it('* takes network schemes only: never data: or blob:', () => {
    expect(allowed('script-src *', 'https://cheap-flour.example/steal.js')).toBe(true)
    expect(allowed('script-src *', 'data:text/javascript,alert(1)')).toBe(false)
  })

  it('a matching nonce lets a script load from anywhere; \'strict-dynamic\' trusts what a trusted script adds, and no host', () => {
    expect(allowed(`script-src 'nonce-abc'`, 'https://anywhere.example/x.js', 'abc')).toBe(true)
    expect(allowed(`script-src 'nonce-abc'`, 'https://anywhere.example/x.js', 'abd')).toBe(false)
    expect(allowed(`script-src 'nonce-abc'`, 'https://anywhere.example/x.js', ' abc ')).toBe(true)
    expect(allowed(`script-src 'nonce-abc' 'strict-dynamic' https://widgets.tastebuds.example`, 'https://widgets.tastebuds.example/x.js', null, true)).toBe(false)
    expect(allowed(`script-src 'nonce-abc' 'strict-dynamic'`, 'https://cdn.tastebuds-static.example/v2.js', null, false)).toBe(true)
    expect(allowed(`script-src 'self' 'strict-dynamic'`, `${SHOP}/app.js`, null, true)).toBe(false)
  })

  it('every enforced policy must allow it; a report-only one only reports', () => {
    expect(model.script([...header('script-src *'), ...header('script-src \'self\'')], SHOP, 'https://cheap-flour.example/x.js', null, true).allowed).toBe(false)
    const watched = model.script(reportOnly('script-src \'self\''), SHOP, 'https://cheap-flour.example/x.js', null, true)
    expect(watched.allowed).toBe(true)
    expect(watched.violations[0]!.line).toEqual({ level: 'info', text: 'Loading the script \'https://cheap-flour.example/x.js\' violates the following Content Security Policy directive: "script-src \'self\'". Note that \'script-src-elem\' was not explicitly set, so \'script-src\' is used as a fallback. The policy is report-only, so the violation has been logged but no further action has been taken.' })
  })

  it('says it as Chrome does: the fallback, strict-dynamic and * notes', () => {
    expect(lines(model.script(header('script-src \'self\''), SHOP, 'https://widgets.tastebuds.example/reviews.js', null, true))).toEqual(['Loading the script \'https://widgets.tastebuds.example/reviews.js\' violates the following Content Security Policy directive: "script-src \'self\'". Note that \'script-src-elem\' was not explicitly set, so \'script-src\' is used as a fallback. The action has been blocked.'])
    expect(lines(model.script(header('default-src \'self\''), SHOP, 'https://x.example/a.js', null, true))).toEqual(['Loading the script \'https://x.example/a.js\' violates the following Content Security Policy directive: "default-src \'self\'". Note that \'script-src-elem\' was not explicitly set, so \'default-src\' is used as a fallback. The action has been blocked.'])
    expect(lines(model.script(header('script-src-elem \'self\''), SHOP, 'https://x.example/a.js', null, true))).toEqual(['Loading the script \'https://x.example/a.js\' violates the following Content Security Policy directive: "script-src-elem \'self\'". The action has been blocked.'])
    expect(lines(model.script(header(`script-src 'nonce-a' 'strict-dynamic' https://x.example`), SHOP, 'https://x.example/a.js', null, true))).toEqual([`Loading the script 'https://x.example/a.js' violates the following Content Security Policy directive: "script-src 'nonce-a' 'strict-dynamic' https://x.example". Note that 'strict-dynamic' is present, so host-based allowlisting is disabled. Note that 'script-src-elem' was not explicitly set, so 'script-src' is used as a fallback. The action has been blocked.`])
    expect(lines(model.script(header('script-src *'), SHOP, 'data:text/javascript,1', null, true))[0]).toContain('Note that \'*\' matches only URLs with network schemes (\'http\', \'https\', \'ws\', \'wss\'), or URLs whose scheme matches `self`\'s scheme. The scheme \'data:\' must be added explicitly.')
  })

  it('no script directive and no default-src: anything loads', () => {
    expect(allowed('frame-ancestors \'self\'; img-src \'self\'', 'https://cheap-flour.example/x.js')).toBe(true)
  })
})

describe('inline scripts and event handlers', () => {
  const inline = (policy: string, kind: 'script' | 'handler', text: string, nonce: string | null = null) => model.inline(header(policy), kind, text, nonce)

  it('hashes like Chrome: SHA-256 of the UTF-8 text, base64', () => {
    expect(model.hash('plausible(\'pageview\')')).toBe(sha('plausible(\'pageview\')'))
    expect(model.hash('')).toBe(sha(''))
    expect(model.hash('Grüße 🥐')).toBe(sha('Grüße 🥐'))
  })

  it('\'unsafe-inline\' runs everything inline, unless a nonce or hash is there (then it is ignored)', () => {
    expect(inline('script-src \'self\' \'unsafe-inline\'', 'handler', 'steal()').allowed).toBe(true)
    expect(inline('script-src \'self\' \'unsafe-inline\'', 'script', 'go()').allowed).toBe(true)
    expect(inline(`script-src 'self' 'unsafe-inline' 'nonce-abc'`, 'handler', 'steal()').allowed).toBe(false)
    expect(inline(`script-src 'unsafe-inline' 'strict-dynamic'`, 'script', 'go()').allowed).toBe(false)
    expect(inline('img-src *', 'handler', 'steal()').allowed).toBe(true)
  })

  it('a script runs by its nonce or its hash; a handler only by a hash with \'unsafe-hashes\', never a nonce', () => {
    expect(inline(`script-src 'nonce-abc'`, 'script', 'go()', 'abc').allowed).toBe(true)
    expect(inline(`script-src '${sha('go()')}'`, 'script', 'go()').allowed).toBe(true)
    expect(inline(`script-src '${sha('go()')}'`, 'script', 'go() ').allowed).toBe(false)
    expect(inline(`script-src '${sha('order()')}'`, 'handler', 'order()').allowed).toBe(false)
    expect(inline(`script-src 'unsafe-hashes' '${sha('order()')}'`, 'handler', 'order()').allowed).toBe(true)
    expect(inline(`script-src 'unsafe-hashes' '${sha('order()')}'`, 'handler', 'steal()').allowed).toBe(false)
    expect(inline(`script-src 'nonce-abc'`, 'handler', 'order()', 'abc').allowed).toBe(false)
  })

  it('says it as Chrome does: the hash to add for a script, sha256-... for a handler, and the notes', () => {
    expect(lines(inline('script-src \'self\'', 'script', 'go()'))).toEqual([`Executing inline script violates the following Content Security Policy directive 'script-src 'self''. Either the 'unsafe-inline' keyword, a hash ('${sha('go()')}'), or a nonce ('nonce-...') is required to enable inline execution. The action has been blocked.`])
    expect(lines(inline('script-src \'self\'', 'handler', 'steal()'))).toEqual(['Executing inline event handler violates the following Content Security Policy directive \'script-src \'self\'\'. Either the \'unsafe-inline\' keyword, a hash (\'sha256-...\'), or a nonce (\'nonce-...\') is required to enable inline execution. Note that hashes do not apply to event handlers, style attributes and javascript: navigations unless the \'unsafe-hashes\' keyword is present. The action has been blocked.'])
    expect(lines(inline('default-src \'self\'', 'script', 'go()'))[0]).toContain('is required to enable inline execution. Note also that \'script-src\' was not explicitly set, so \'default-src\' is used as a fallback. The action has been blocked.')
    expect(lines(inline(`script-src 'unsafe-inline' 'nonce-abc'`, 'script', 'go()'))).toEqual(['Executing inline script violates the following Content Security Policy directive \'script-src \'unsafe-inline\' \'nonce-abc\'\'. Note that \'unsafe-inline\' is ignored if either a hash or nonce value is present in the source list. The action has been blocked.'])
  })

  it('a report-only policy lets it run and says so; \'report-sample\' keeps 40 characters for the report', () => {
    const verdict = model.inline(reportOnly('script-src \'self\' \'report-sample\'; report-uri /csp-report'), 'handler', 'fetch(\'/account/email\', { method: \'POST\' })', null)
    expect(verdict.allowed).toBe(true)
    expect(verdict.violations[0]!.line.level).toBe('info')
    expect(verdict.violations[0]!.line.text).toMatch(/The policy is report-only, so the violation has been logged but no further action has been taken\.$/)
    expect(verdict.violations[0]!.sample).toBe('fetch(\'/account/email\', { method: \'POST\'')
  })
})

describe('requests of the page (connect-src, img-src)', () => {
  it('a fetch to a host the list leaves out is refused, falling back to default-src', () => {
    const verdict = model.request(header('default-src \'self\''), SHOP, 'connect-src', 'https://cheap-flour.example/collect')
    expect(verdict.allowed).toBe(false)
    expect(lines(verdict)).toEqual(['Connecting to \'https://cheap-flour.example/collect\' violates the following Content Security Policy directive: "default-src \'self\'". Note that \'connect-src\' was not explicitly set, so \'default-src\' is used as a fallback. The action has been blocked.'])
    expect(model.request(header('script-src \'self\''), SHOP, 'connect-src', 'https://cheap-flour.example/collect').allowed).toBe(true)
    expect(lines(model.request(header('img-src \'self\''), SHOP, 'img-src', 'https://cheap-flour.example/p.gif'))).toEqual(['Loading the image \'https://cheap-flour.example/p.gif\' violates the following Content Security Policy directive: "img-src \'self\'". The action has been blocked.'])
  })
})

describe('framing (frame-ancestors, X-Frame-Options)', () => {
  const PAGE = `${SHOP}/account`
  const frame = (csp: string | null, xfo: string[], ancestor: string) => model.frame(csp === null ? [] : header(csp), xfo, PAGE, [ancestor])

  it('frame-ancestors lists who may frame the page; refused, the framing page\'s Console says so', () => {
    expect(frame('frame-ancestors \'self\' https://market.example', [], 'https://market.example').allowed).toBe(true)
    const refused = frame('frame-ancestors \'self\' https://market.example', [], 'https://cheap-flour.example')
    expect(refused).toMatchObject({ allowed: false, by: 'frame-ancestors' })
    expect(refused.lines.map(line => line.text)).toEqual(['Framing \'https://cornerbakery.shop/\' violates the following Content Security Policy directive: "frame-ancestors \'self\' https://market.example". The request has been blocked.'])
    expect(frame('frame-ancestors https://*.example', [], 'https://cheap-flour.example').allowed).toBe(true)
    expect(frame('frame-ancestors \'none\'', [], SHOP).allowed).toBe(false)
  })

  it('X-Frame-Options: DENY, SAMEORIGIN; ALLOW-FROM is no value Chrome knows, so it is ignored', () => {
    expect(frame(null, ['DENY'], 'https://cheap-flour.example')).toMatchObject({ allowed: false, by: 'x-frame-options', lines: [{ text: 'Refused to display \'https://cornerbakery.shop/\' in a frame because it set \'X-Frame-Options\' to \'deny\'.' }] })
    expect(frame(null, ['SAMEORIGIN'], SHOP).allowed).toBe(true)
    expect(frame(null, ['sameorigin'], 'https://market.example').lines[0]!.text).toBe('Refused to display \'https://cornerbakery.shop/\' in a frame because it set \'X-Frame-Options\' to \'sameorigin\'.')
    expect(frame(null, ['ALLOW-FROM https://market.example'], 'https://cheap-flour.example')).toMatchObject({ allowed: true, lines: [{ text: 'Invalid \'X-Frame-Options\' header encountered when loading \'https://cornerbakery.shop/\': \'ALLOW-FROM https://market.example\' is not a recognized directive. The header will be ignored.' }] })
    expect(frame(null, ['DENY', 'SAMEORIGIN'], SHOP)).toMatchObject({ allowed: false, lines: [{ text: 'Refused to display \'https://cornerbakery.shop/\' in a frame because it set multiple \'X-Frame-Options\' headers with conflicting values (\'DENY, SAMEORIGIN\'). Falling back to \'deny\'.' }] })
  })

  it('an enforced frame-ancestors makes Chrome ignore X-Frame-Options; a report-only one does not', () => {
    expect(frame('frame-ancestors https://market.example', ['DENY'], 'https://market.example').allowed).toBe(true)
    expect(model.frame(reportOnly('frame-ancestors https://market.example'), ['DENY'], PAGE, ['https://market.example']).allowed).toBe(false)
    expect(model.frame(reportOnly('frame-ancestors \'self\''), [], PAGE, ['https://cheap-flour.example']).lines[0]!.text).toBe('Framing \'https://cornerbakery.shop/\' violates the following report-only Content Security Policy directive: "frame-ancestors \'self\'". The violation has been logged, but no further action has been taken.')
  })

  it('a policy from a meta tag never decides framing', () => {
    const meta = model.parse('frame-ancestors \'none\'', 'enforce', 'meta').policies
    expect(model.frame(meta, [], PAGE, ['https://cheap-flour.example']).allowed).toBe(true)
  })
})

describe('a script\'s type (X-Content-Type-Options) and the Referer (Referrer-Policy)', () => {
  const URL_ = `${SHOP}/uploads/cake.txt`
  it('Chrome never runs an image, audio, video or CSV as a script; nosniff runs only JavaScript types', () => {
    expect(model.scriptType(URL_, 'text/plain', false, false)).toBeNull()
    expect(model.scriptType(URL_, 'text/plain; charset=utf-8', true, false)).toEqual({ level: 'error', text: `Refused to execute script from '${URL_}' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.` })
    expect(model.scriptType(URL_, 'image/png', false, false)).toEqual({ level: 'error', text: `Refused to execute script from '${URL_}' because its MIME type ('image/png') is not executable.` })
    expect(model.scriptType(URL_, 'application/javascript; charset=utf-8', true, false)).toBeNull()
    expect(model.scriptType(URL_, null, true, false)!.text).toContain('MIME type (\'\')')
    expect(model.scriptType(URL_, 'text/plain', false, true)!.text).toBe('Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/plain". Strict MIME type checking is enforced for module scripts per HTML spec.')
    expect(model.nosniff(['nosniff'])).toBe(true)
    expect(model.nosniff([' NoSniff , x'])).toBe(true)
    expect(model.nosniff(['no-sniff'])).toBe(false)
  })

  it('reads a Referrer-Policy (the last one it knows wins) and gives the Referer it allows', () => {
    expect(model.referrerPolicy(['no-referrer, fancy-new-policy'])).toBe('no-referrer')
    expect(model.referrerPolicy(['unsafe-url', 'strict-origin'])).toBe('strict-origin')
    expect(model.referrerPolicy(['nope'])).toBe('')
    const page = `${SHOP}/reset?token=t0k3n#top`
    expect(model.referrer('', page, 'https://stats.example/hit')).toBe(`${SHOP}/`)
    expect(model.referrer('', page, `${SHOP}/api`)).toBe(`${SHOP}/reset?token=t0k3n`)
    expect(model.referrer('unsafe-url', page, 'https://stats.example/hit')).toBe(`${SHOP}/reset?token=t0k3n`)
    expect(model.referrer('no-referrer-when-downgrade', page, 'https://stats.example/hit')).toBe(`${SHOP}/reset?token=t0k3n`)
    expect(model.referrer('no-referrer-when-downgrade', page, 'http://stats.example/hit')).toBeNull()
    expect(model.referrer('same-origin', page, 'https://stats.example/hit')).toBeNull()
    expect(model.referrer('no-referrer', page, `${SHOP}/api`)).toBeNull()
    expect(model.referrer('origin', page, `${SHOP}/api`)).toBe(`${SHOP}/`)
  })
})

describe('report-uri', () => {
  it('posts Chrome\'s legacy report: the directive, the policy, the disposition, what it blocked', () => {
    const policies = header('script-src \'self\'; report-uri /csp-report')
    const verdict = model.inline(policies, 'handler', 'steal()', null)
    expect(JSON.parse(model.report(policies[0]!, verdict.violations[0]!, `${SHOP}/order`, 200))).toEqual({
      'csp-report': {
        'document-uri': `${SHOP}/order`,
        'referrer': '',
        'violated-directive': 'script-src-attr',
        'effective-directive': 'script-src-attr',
        'original-policy': 'script-src \'self\'; report-uri /csp-report',
        'disposition': 'enforce',
        'blocked-uri': 'inline',
        'status-code': 200,
        'script-sample': ''
      }
    })
  })
})

describe('hardening', () => {
  it('a setter on Object.prototype or Array.prototype never sees what the model decides', () => {
    let seen = 0
    const count = () => {
      seen += 1
    }
    const fresh = new Function(`return ${CSP_SOURCE}`)()() as PolicyModel
    Object.defineProperty(Object.prototype, 'allowed', { set: count, configurable: true })
    Object.defineProperty(Array.prototype, '0', { set: count, configurable: true })
    try {
      const verdict = fresh.inline(header('script-src \'self\''), 'handler', 'steal()', null)
      expect(verdict.allowed).toBe(false)
      expect(verdict.violations).toHaveLength(1)
      expect(fresh.parse('script-src \'self\', img-src *', 'enforce', 'header').policies).toHaveLength(2)
    } finally {
      delete (Object.prototype as Record<string, unknown>).allowed
      delete (Array.prototype as unknown as Record<string, unknown>)['0']
    }
    expect(seen).toBe(0)
  })
})

describe('the review of 2026-11-20', () => {
  it('an inline script a script added runs under \'strict-dynamic\' (Blink\'s CSPDirectiveListAllowInline); one the parser made does not', () => {
    const policies = header(`script-src 'nonce-abc' 'strict-dynamic'`)
    expect(model.inline(policies, 'script', 'go()', null, false).allowed).toBe(true)
    expect(model.inline(policies, 'script', 'go()', null, true).allowed).toBe(false)
    expect(model.inline(policies, 'handler', 'go()', null, false).allowed).toBe(false)
  })

  it('a report leaves the fragment out and names the line when it is known', () => {
    const policies = header('script-src \'self\'; report-uri /csp-report')
    const verdict = model.script(policies, SHOP, 'https://x.example/a.js#top', null, true)
    const body = JSON.parse(model.report(policies[0]!, verdict.violations[0]!, `${SHOP}/order#reviews`, 200, 12))['csp-report']
    expect(body).toMatchObject({ 'document-uri': `${SHOP}/order`, 'blocked-uri': 'https://x.example/a.js', 'line-number': 12, 'source-file': `${SHOP}/order` })
  })

  it('a meta tag takes the old referrer names', () => {
    expect(model.referrerPolicy(['never'], true)).toBe('no-referrer')
    expect(model.referrerPolicy(['always'], true)).toBe('unsafe-url')
    expect(model.referrerPolicy(['never'])).toBe('')
  })

  it('RegExp.prototype.exec, String.prototype.split and Symbol.split replaced after the model was made change nothing it reads', () => {
    const fresh = new Function(`return ${CSP_SOURCE}`)()() as PolicyModel
    const exec = RegExp.prototype.exec
    const split = String.prototype.split
    const prototype = String.prototype as unknown as Record<symbol, unknown>
    RegExp.prototype.exec = function () {
      return null
    }
    String.prototype.split = function () {
      return []
    }
    prototype[Symbol.split] = () => []
    try {
      const parsed = fresh.parse('frame-ancestors \'self\' https://market.example, script-src \'self\'', 'enforce', 'header')
      expect(parsed.policies.map(policy => policy.names)).toEqual([['frame-ancestors'], ['script-src']])
      expect(fresh.frame(parsed.policies, [], `${SHOP}/quick-order`, ['https://cheap-flour.example']).allowed).toBe(false)
      expect(fresh.frame(parsed.policies, [], `${SHOP}/quick-order`, ['https://market.example']).allowed).toBe(true)
    } finally {
      RegExp.prototype.exec = exec
      String.prototype.split = split
      Reflect.deleteProperty(prototype, Symbol.split)
    }
  })
})
