// Structure of the Web fundamentals cheat sheet (/web/cheat-sheet): one group per chapter, the entries in each (a rule
// and the lines that apply it: headers, server.js, the page's code), and the browser's messages the levels show in
// Chrome's words (data, not translated), plus the levels that teach each. Every visible text lives in the i18n locales
// under `webCheat.*`; the key helpers below say where. Same frame as the Debugging sheet (docs/features/ui.md, "Web
// fundamentals cheat sheet").
import { levelById } from '../../shared/levels'
import type { Level } from '../../shared/levels'
import type { CheatSource } from './cheat-sheet'

export interface WebCheatExample {
  /** A header, a line of server.js or of the page, or a key (data, not translated). Its note is an i18n key, see `webNoteKey`. */
  line: string
  /** false: shown as a plain row (a key, a directive, a status) instead of a line you click to copy. */
  copy?: false
}

export interface WebCheatEntry {
  /** Unique over the whole sheet; the i18n key part. */
  id: string
  examples: WebCheatExample[]
  /** Level ids (scenarios) that teach it, in level order. */
  levels: string[]
}

export interface WebCheatGroup {
  /** The chapter's id (`cors` … `security-headers`); the i18n key part. */
  id: string
  entries: WebCheatEntry[]
}

export interface BrowserMessage {
  /** Unique among the messages; the i18n key part. */
  id: string
  /** The message as Chrome words it, as the levels show it (data, not translated). */
  message: string
  levels: string[]
}

const line = (text: string): WebCheatExample => ({ line: text })
const plain = (text: string): WebCheatExample => ({ line: text, copy: false })

export const webCheatGroups: WebCheatGroup[] = [
  {
    id: 'cors',
    entries: [
      {
        id: 'origin',
        examples: [plain('https://cornerbakery.shop'), plain('https://api.cornerbakery.shop'), plain('https://www.cornerbakery.shop'), plain('https://cornerbakery.shop:8443')],
        levels: ['web-01-menu-blocked']
      },
      {
        id: 'allow-origin',
        examples: [line('res.set(\'Access-Control-Allow-Origin\', SHOP)'), line('res.set(\'Access-Control-Allow-Origin\', \'*\')')],
        levels: ['web-01-menu-blocked']
      },
      {
        id: 'preflight',
        examples: [
          line('app.options(\'/orders\', (req, res) => {'),
          line('res.set(\'Access-Control-Allow-Origin\', SHOP)'),
          line('res.set(\'Access-Control-Allow-Headers\', \'Content-Type\')'),
          line('res.sendStatus(204)'),
          line('})')
        ],
        levels: ['web-02-order-preflight', 'web-04-basket-header', 'web-05-works-with-curl']
      },
      {
        id: 'credentials',
        examples: [line('fetch(url, { credentials: \'include\' })'), line('res.set(\'Access-Control-Allow-Credentials\', \'true\')'), line('if ([SHOP].includes(req.get(\'Origin\'))) res.set(\'Access-Control-Allow-Origin\', req.get(\'Origin\'))')],
        levels: ['web-03-basket-credentials']
      },
      {
        id: 'allow-headers',
        examples: [line('res.set(\'Access-Control-Allow-Headers\', \'Content-Type, X-Basket-Id\')'), line('res.set(\'Access-Control-Allow-Methods\', \'GET, POST, DELETE\')')],
        levels: ['web-04-basket-header', 'web-05-works-with-curl']
      },
      { id: 'not-browsers', examples: [], levels: ['web-05-works-with-curl'] }
    ]
  },
  {
    id: 'cookies',
    entries: [
      {
        id: 'session-cookie',
        examples: [line('res.cookie(\'session\', \'lena-7f3a\', { httpOnly: true, secure: true, sameSite: \'lax\' })'), line('res.set(\'Set-Cookie\', \'session=lena-7f3a; Path=/; HttpOnly; Secure; SameSite=Lax\')')],
        levels: ['web-06-sign-in-lost', 'web-08-script-reads-session', 'web-09-cookie-path']
      },
      {
        id: 'same-site',
        examples: [plain('SameSite=Strict'), plain('SameSite=Lax'), plain('SameSite=None; Secure'), plain('(no SameSite)')],
        levels: ['web-06-sign-in-lost', 'web-07-order-from-elsewhere', 'web-10-email-link']
      },
      { id: 'site', examples: [], levels: ['web-06-sign-in-lost'] },
      {
        id: 'csrf',
        examples: [line('if (req.get(\'Origin\') !== SHOP) return res.sendStatus(403)')],
        levels: ['web-07-order-from-elsewhere']
      },
      { id: 'http-only', examples: [line('document.cookie')], levels: ['web-08-script-reads-session'] },
      { id: 'path-domain', examples: [plain('Path=/'), plain('Domain=cornerbakery.shop')], levels: ['web-09-cookie-path'] }
    ]
  },
  {
    id: 'auth',
    entries: [
      {
        id: 'where-token',
        examples: [line('const token = req.cookies.session'), line('fetch(`${API}${path}`, { ...options, credentials: \'include\' })')],
        levels: ['web-11-token-in-storage']
      },
      {
        id: 'text-as-text',
        examples: [line('const item = document.createElement(\'li\')'), line('item.textContent = `“${review.text}” · ${review.name}`')],
        levels: ['web-12-review-runs']
      },
      {
        id: 'expiry',
        examples: [line('jwt.sign({ sub: customer }, SECRET, { expiresIn: \'15m\' })'), line('jwt.verify(token, SECRET)')],
        levels: ['web-13-token-never-expires']
      },
      {
        id: 'refresh',
        examples: [line('const send = () => fetch(`${API}${path}`, { ...options, credentials: \'include\' })'), line('fetch(`${API}/auth/refresh`, { method: \'POST\', credentials: \'include\' })')],
        levels: ['web-14-signed-out-again']
      },
      {
        id: 'sign-out',
        examples: [line('const SIGNED_OUT = new Set()'), line('SIGNED_OUT.add(req.cookies.session)'), line('REFRESH.delete(req.cookies.refresh)'), line('if (SIGNED_OUT.has(req.cookies.session)) return null')],
        levels: ['web-15-logout-stays']
      }
    ]
  },
  {
    id: 'caching',
    entries: [
      {
        id: 'cache-control',
        examples: [plain('max-age=3600'), plain('no-cache'), plain('no-store'), plain('private'), plain('public, max-age=60')],
        levels: ['web-16-old-price', 'web-17-whole-menu', 'web-18-someone-elses-account']
      },
      {
        id: 'revalidate',
        examples: [line('res.set(\'Cache-Control\', \'no-cache\')')],
        levels: ['web-16-old-price', 'web-17-whole-menu']
      },
      { id: 'cache-rows', examples: [plain('(disk cache)'), plain('304 Not Modified'), plain('200')], levels: ['web-16-old-price', 'web-17-whole-menu'] },
      { id: 'shared-cache', examples: [line('res.set(\'Cache-Control\', \'private\')')], levels: ['web-18-someone-elses-account'] },
      { id: 'vary', examples: [line('res.vary(\'Origin\')')], levels: ['web-19-vary-origin'] },
      { id: 'new-address', examples: [line('const response = await fetch(`${API}/menu?v=2`)'), line('fetch(url, { cache: \'no-cache\' })')], levels: ['web-20-stale-deploy'] }
    ]
  },
  {
    id: 'event-loop',
    entries: [
      {
        id: 'order',
        examples: [plain('console.log(…)'), plain('await · .then(…) · queueMicrotask(…)'), plain('setTimeout(…) · a tap · postMessage(…)'), plain('requestAnimationFrame(…)')],
        levels: ['web-21-spinner', 'web-25-progress-bar']
      },
      {
        id: 'paint-first',
        examples: [line('await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve)))')],
        levels: ['web-21-spinner']
      },
      {
        id: 'dispatch',
        examples: [line('if (menu.hidden || toggle.contains(event.target)) return'), line('event.stopPropagation()')],
        levels: ['web-22-pickup-menu']
      },
      {
        id: 'forced-layout',
        examples: [line('list.scrollTop = list.scrollHeight'), line('const fragment = document.createDocumentFragment()')],
        levels: ['web-23-kitchen-screen']
      },
      {
        id: 'transition',
        examples: [line('requestAnimationFrame(() => requestAnimationFrame(() => element.classList.add(\'visible\')))'), line('getComputedStyle(element).opacity')],
        levels: ['web-24-toast']
      },
      {
        id: 'yield',
        examples: [line('await new Promise(resolve => setTimeout(resolve))'), line('await new Promise(resolve => requestAnimationFrame(resolve))')],
        levels: ['web-25-progress-bar']
      }
    ]
  },
  {
    id: 'accessibility',
    entries: [
      {
        id: 'name',
        examples: [line('aria-label="Add ${product.name} to your basket"'), line('<span class="visually-hidden">Add ${product.name} to your basket</span>'), line('aria-hidden="true"')],
        levels: ['web-26-every-button']
      },
      { id: 'button', examples: [line('<button id="checkout" class="checkout" type="button">Check out</button>')], levels: ['web-27-checkout'] },
      { id: 'keys', examples: [plain('Tab · Shift+Tab'), plain('Enter'), plain('Space'), plain('Escape')], levels: ['web-27-checkout', 'web-30-focus-lost'] },
      {
        id: 'expanded',
        examples: [line('aria-expanded="false"'), line('toggle.setAttribute(\'aria-expanded\', String(!list.hidden))'), line('<details><summary>Allergens</summary>')],
        levels: ['web-28-allergens']
      },
      {
        id: 'live',
        examples: [line('<p id="email-error" class="error" role="alert"></p>'), line('role="status"'), line('aria-describedby="email-error"')],
        levels: ['web-29-silent-error']
      },
      { id: 'focus', examples: [line('opener.focus()'), line('dialog.showModal()')], levels: ['web-30-focus-lost'] }
    ]
  },
  {
    id: 'security-headers',
    entries: [
      {
        id: 'inline',
        examples: [line('res.set(\'Content-Security-Policy\', "script-src \'self\' https://widgets.tastebuds.example")'), line('document.querySelector(\'#place\').addEventListener(\'click\', placeOrder)')],
        levels: ['web-31-lets-it-run']
      },
      {
        id: 'framing',
        examples: [line('res.set(\'Content-Security-Policy\', "frame-ancestors \'self\' https://market.example")'), line('res.set(\'X-Frame-Options\', \'DENY\')')],
        levels: ['web-32-free-flour']
      },
      {
        id: 'fetch-directives',
        examples: [line('default-src \'self\'; script-src \'self\' https://widgets.tastebuds.example; connect-src \'self\' https://widgets.tastebuds.example https://stats.cornerbakery.shop')],
        levels: ['web-33-phones-home']
      },
      {
        id: 'report-only',
        examples: [
          line('res.set(\'Content-Security-Policy-Report-Only\', "script-src \'self\' https://widgets.tastebuds.example; report-uri /csp-report")'),
          line('res.set(\'Content-Security-Policy\', "script-src \'self\' https://widgets.tastebuds.example; report-uri /csp-report")')
        ],
        levels: ['web-34-only-watched']
      },
      {
        id: 'strict',
        examples: [
          line('const nonce = crypto.randomBytes(16).toString(\'base64\')'),
          line('res.set(\'Content-Security-Policy\', `script-src \'nonce-${nonce}\' \'strict-dynamic\'`)'),
          line('<script type="module" src="./app.js" nonce="{{nonce}}"></script>')
        ],
        levels: ['web-35-widget-moved']
      },
      { id: 'more-headers', examples: [line('res.set(\'X-Content-Type-Options\', \'nosniff\')'), line('res.set(\'Referrer-Policy\', \'strict-origin-when-cross-origin\')')], levels: [] }
    ]
  }
]

const CORS = 'Access to fetch at \'https://api.cornerbakery.shop/'
const FROM = '\' from origin \'https://cornerbakery.shop\' has been blocked by CORS policy: '
const POLICY = 'script-src \'self\' https://widgets.tastebuds.example'

/** The browser's messages the levels show, in the order the chapters meet them. */
export const browserMessages: BrowserMessage[] = [
  { id: 'no-allow-origin', message: `${CORS}menu${FROM}No 'Access-Control-Allow-Origin' header is present on the requested resource.`, levels: ['web-01-menu-blocked'] },
  { id: 'failed-fetch', message: 'TypeError: Failed to fetch', levels: ['web-01-menu-blocked', 'web-33-phones-home'] },
  { id: 'preflight', message: `${CORS}orders${FROM}Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.`, levels: ['web-02-order-preflight'] },
  { id: 'wildcard', message: `${CORS}basket${FROM}The value of the 'Access-Control-Allow-Origin' header in the response must not be the wildcard '*' when the request's credentials mode is 'include'.`, levels: ['web-03-basket-credentials'] },
  { id: 'header-not-allowed', message: `${CORS}basket${FROM}Request header field x-basket-id is not allowed by Access-Control-Allow-Headers in preflight response.`, levels: ['web-04-basket-header'] },
  { id: 'method-not-allowed', message: `${CORS}basket/lines/2${FROM}Method DELETE is not allowed by Access-Control-Allow-Methods in preflight response.`, levels: ['web-05-works-with-curl'] },
  {
    id: 'none-insecure',
    message: 'This attempt to set a cookie via a "Set-Cookie" header was blocked because it had the "SameSite=None" attribute but didn’t have the "Secure" attribute, which is required in order to use "SameSite=None"',
    levels: ['web-06-sign-in-lost']
  },
  {
    id: 'lax-blocked',
    message: 'This cookie was blocked because it had the "SameSite=Lax" attribute and the request was made from a different site and wasn’t initiated by a top-level navigation',
    levels: ['web-07-order-from-elsewhere']
  },
  {
    id: 'not-on-path',
    message: 'This cookie was blocked because its path wasn’t an exact match for or a superdirectory of the request URL’s path',
    levels: ['web-09-cookie-path']
  },
  {
    id: 'strict-blocked',
    message: 'This cookie was blocked because it had the "SameSite=Strict" attribute and the request was made from a different site. This includes top-level navigation requests initiated by other sites.',
    levels: ['web-10-email-link']
  },
  {
    id: 'inline-handler',
    message: `Executing inline event handler violates the following Content Security Policy directive '${POLICY}'. Either the 'unsafe-inline' keyword, a hash ('sha256-...'), or a nonce ('nonce-...') is required to enable inline execution. Note that hashes do not apply to event handlers, style attributes and javascript: navigations unless the 'unsafe-hashes' keyword is present. The action has been blocked.`,
    levels: ['web-31-lets-it-run']
  },
  {
    id: 'script-src',
    message: `Loading the script 'https://bread-offers.example/c.js' violates the following Content Security Policy directive: "${POLICY}". Note that 'script-src-elem' was not explicitly set, so 'script-src' is used as a fallback. The action has been blocked.`,
    levels: ['web-31-lets-it-run', 'web-35-widget-moved']
  },
  {
    id: 'framing',
    message: 'Framing \'https://cornerbakery.shop/\' violates the following Content Security Policy directive: "frame-ancestors \'self\' https://market.example". The request has been blocked.',
    levels: ['web-32-free-flour']
  },
  {
    id: 'x-frame-options',
    message: 'Refused to display \'https://cornerbakery.shop/\' in a frame because it set \'X-Frame-Options\' to \'deny\'.',
    levels: ['web-32-free-flour']
  },
  {
    id: 'connect-src',
    message: 'Connecting to \'https://cheap-flour.example/collect\' violates the following Content Security Policy directive: "connect-src \'self\' https://widgets.tastebuds.example https://stats.cornerbakery.shop". The action has been blocked.',
    levels: ['web-33-phones-home']
  },
  {
    id: 'report-only',
    message: `Loading the script 'https://bread-offers.example/c.js' violates the following Content Security Policy directive: "${POLICY}". Note that 'script-src-elem' was not explicitly set, so 'script-src' is used as a fallback. The policy is report-only, so the violation has been logged but no further action has been taken.`,
    levels: ['web-34-only-watched']
  },
  {
    id: 'nosniff',
    message: 'Refused to execute script from \'https://cornerbakery.shop/files/card.txt\' because its MIME type (\'text/plain\') is not executable, and strict MIME type checking is enabled.',
    levels: []
  }
]

/** i18n key of a group's title (the message reference has one too: id `messages`). */
export const webGroupKey = (groupId: string) => `webCheat.groups.${groupId}`
/** i18n key of an entry's title. */
export const webTitleKey = (entryId: string) => `webCheat.entries.${entryId}.title`
/** i18n key of an entry's one-line rule. */
export const webRuleKey = (entryId: string) => `webCheat.entries.${entryId}.rule`
/** i18n key of an entry's summary (shown behind the entry's "Why and how" disclosure). */
export const webSummaryKey = (entryId: string) => `webCheat.entries.${entryId}.summary`
/** i18n key of the note above an example line (counted from 0 in the order of `examples`). */
export const webNoteKey = (entryId: string, index: number) => `webCheat.entries.${entryId}.examples.${index}`
/** i18n key of what a message usually means, or where to look first (`part`). */
export const webMessageKey = (messageId: string, part: 'means' | 'look') => `webCheat.messages.${messageId}.${part}`

/** The sheet's data and where its texts live, for the page to turn into cards (`buildCheatSheet`, `app/utils/cheat-sheet.ts`). */
export const webCheatSource: CheatSource = {
  groups: webCheatGroups,
  messages: browserMessages,
  messagesId: 'messages',
  keys: {
    group: webGroupKey,
    title: webTitleKey,
    rule: webRuleKey,
    summary: webSummaryKey,
    note: webNoteKey,
    means: messageId => webMessageKey(messageId, 'means'),
    look: messageId => webMessageKey(messageId, 'look')
  },
  labels: { why: 'webCheat.why', look: 'webCheat.look' },
  levels: ids => webCheatLevels(ids)
}

/** The levels behind a list of ids, in the order given; an unknown id is skipped (the unit test pins that none is). */
export function webCheatLevels(ids: readonly string[]): Level[] {
  return ids.flatMap((id) => {
    const level = levelById(id)
    return level ? [level] : []
  })
}
