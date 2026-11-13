// Corner Bakery's shop as the Incidents levels (chapter 7) meet it: the order page of the Network levels (the menu from
// the server, Add, a basket, Order), now live with customers, so things go wrong in production. The server keeps logs
// (sandbox.logs, the Logs panel) and the shop has a deploy history (sandbox.deploys, the Deploys panel). This file has
// what the levels share: the page with its order box, the order code, and short ways to write log lines.
import { STYLE } from './bakery'
import type { OrderPageOptions } from './bakery'
import { MENU_ROUTE } from './shop-server'
import type { BackendRoute, LogLevel, PastLogLine } from './types'

/** What a customer reads once an order went through (the order number is the server's, 1042 in every level). */
export const THANKS = 'Thanks! Order 1042 is in. Pick it up tomorrow from 7:00.'

/** The order box: the note for the bakery (when the shop has notes), the Order button and the status line. */
export function orderBox(note: boolean): string[] {
  return [
    '<section class="summary" aria-label="Your order">',
    ...(note ? ['  <label class="note" for="note">A note for the bakery (optional)</label>', '  <textarea id="note" rows="2"></textarea>'] : []),
    '  <button class="action" id="order" type="button">Order for pickup</button>',
    '  <p class="note" id="order-status" role="status"></p>',
    '</section>'
  ]
}

/** The order page's options for a level: the order box, and what else the level puts on the page. */
export function incidentPage(note: boolean, extra: OrderPageOptions = {}): OrderPageOptions {
  return { header: extra.header, main: [...orderBox(note), ...(extra.main ?? [])] }
}

/** The stylesheet with the order box's field. */
export const INCIDENT_STYLE = `${STYLE}
textarea {
  display: block;
  box-sizing: border-box;
  width: 100%;
  margin: 2px 0 8px;
  border: 1px solid #eadfd0;
  border-radius: 6px;
  padding: 6px 8px;
  font: inherit;
  font-size: 13px;
}
`

/** The menu, as every incident level's server answers it. */
export const INCIDENT_MENU: BackendRoute = MENU_ROUTE

/** A line the server logged before you came: `[time, level, route, request, message, stack?]`. */
export type PastLine = readonly [at: string, level: LogLevel, route: string, request: string | null, message: string, stack?: readonly string[]]

/** The history as LogsSpec has it, from short rows. */
export const pastLines = (rows: readonly PastLine[]): PastLogLine[] => rows.map(([at, level, route, request, message, stack]) => ({
  at,
  level,
  route,
  request,
  message,
  ...(stack ? { stack } : {})
}))

/** The access line a past request left (as the server writes them for a load's requests too). */
export function accessRow(at: string, method: string, path: string, request: string, status: number, statusText: string, ms: number): PastLine {
  return [at, status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info', `${method} ${path.replace(/\?.*$/, '')}`, request, `${method} ${path} ${status} ${statusText} · ${ms} ms`]
}

/** A deploy going live, as the server logs it. */
export const deployRow = (at: string, id: string, author: string, message: string): PastLine => [at, 'info', '', null, `deploy ${id} is live (${author}: ${message})`]
