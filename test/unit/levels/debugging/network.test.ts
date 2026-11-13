import { describe, expect, it } from 'vitest'
import { bodyView, durationText, requestEntry, requestName, statusLabel, statusTone, withResponse } from '../../../../shared/levels/debugging/network'
import type { RequestMessage, ResponseMessage } from '../../../../shared/levels/debugging/messages'

// The Network panel's entries (docs/features/ui.md, "Network"): a request as the bridge reported it, its answer when it
// arrives, and how the panel words and colours them. Pure: the panel only draws these.
const MENU = 'blob:null/0f1d2c3b-aaaa-bbbb-cccc-1234567890ab'
const mapping = { urls: { [MENU]: 'menu.js' }, bridgeLine: 3 }

const request: RequestMessage = {
  type: 'request',
  id: 4,
  method: 'POST',
  url: 'https://cornerbakery.shop/api/orders?source=web',
  headers: [['content-type', 'application/json']],
  body: '{"items":[{"id":"croissant","qty":3}]}',
  stack: `Error\n    at fetch (about:srcdoc:3:9120)\n    at placeOrder (${MENU}:12:26)`
}
const answer = (fields: Partial<ResponseMessage> = {}): ResponseMessage => ({
  type: 'response',
  id: 4,
  status: 201,
  statusText: 'Created',
  headers: [['content-type', 'application/json; charset=utf-8']],
  body: '{"number":1042}',
  failure: null,
  time: 412,
  ...fields
})

describe('the Network entries', () => {
  it('make an entry of a request: the name in the list, what was sent, the line that sent it, no answer yet', () => {
    expect(requestEntry(request, mapping)).toEqual({
      id: 4,
      method: 'POST',
      url: 'https://cornerbakery.shop/api/orders?source=web',
      name: '/api/orders?source=web',
      requestHeaders: [['content-type', 'application/json']],
      requestBody: '{"items":[{"id":"croissant","qty":3}]}',
      initiator: { path: 'menu.js', line: 12 },
      response: null
    })
    expect(requestEntry({ ...request, stack: '' }, mapping).initiator).toBeNull()
  })

  it('name a request on the shop by its path, anywhere else by its whole address', () => {
    expect(requestName('https://cornerbakery.shop/api/menu')).toBe('/api/menu')
    expect(requestName('https://cornerbakery.shop/')).toBe('/')
    expect(requestName('https://api.cornerbakery.shop/specials')).toBe('https://api.cornerbakery.shop/specials')
    expect(requestName('not a url')).toBe('not a url')
  })

  it('put the answer on its request, and leave the others alone', () => {
    const other = requestEntry({ ...request, id: 5 }, mapping)
    const entries = [requestEntry(request, mapping), other]
    const answered = withResponse(entries, answer())
    expect(answered[0]!.response).toEqual({ status: 201, statusText: 'Created', headers: [['content-type', 'application/json; charset=utf-8']], body: '{"number":1042}', failure: null, time: 412 })
    expect(answered[1]).toBe(other)
    // an answer for no known request changes nothing
    expect(withResponse(entries, answer({ id: 99 }))).toEqual(entries)
  })

  it('word and colour the status the way the browser\'s panel does', () => {
    const entry = (fields: Partial<ResponseMessage> | null) => fields === null ? requestEntry(request, mapping) : withResponse([requestEntry(request, mapping)], answer(fields))[0]!
    const cases: [Partial<ResponseMessage> | null, string, string][] = [
      [null, 'pending', 'pending'],
      [{}, '201', 'success'],
      [{ status: 200 }, '200', 'success'],
      [{ status: 304 }, '304', 'neutral'],
      [{ status: 404 }, '404', 'error'],
      [{ status: 500 }, '500', 'error'],
      [{ status: 200, failure: 'cors' }, 'CORS error', 'error'],
      [{ status: null, failure: 'cors' }, 'CORS error', 'error'],
      [{ status: null, failure: 'network' }, 'failed', 'error'],
      [{ status: null, failure: 'aborted' }, 'canceled', 'neutral']
    ]
    for (const [fields, label, tone] of cases) {
      expect([statusLabel(entry(fields)), statusTone(entry(fields))], JSON.stringify(fields)).toEqual([label, tone])
    }
  })

  it('give times in ms, and seconds from one second', () => {
    expect(durationText(0)).toBe('0 ms')
    expect(durationText(412)).toBe('412 ms')
    expect(durationText(999)).toBe('999 ms')
    expect(durationText(1000)).toBe('1.00 s')
    expect(durationText(1234)).toBe('1.23 s')
  })

  it('show a JSON body indented, anything else as it came (text, never HTML)', () => {
    const json: [string, string][] = [['content-type', 'application/json; charset=utf-8']]
    expect(bodyView('{"number":1042,"items":[{"id":"croissant"}]}', json)).toBe('{\n  "number": 1042,\n  "items": [\n    {\n      "id": "croissant"\n    }\n  ]\n}')
    // a request body without a content type that is JSON is still shown as JSON
    expect(bodyView('{"a":1}', [])).toBe('{\n  "a": 1\n}')
    expect(bodyView('<pre>Cannot GET /api/products</pre>', [['content-type', 'text/html; charset=utf-8']])).toBe('<pre>Cannot GET /api/products</pre>')
    expect(bodyView('{"broken', json)).toBe('{"broken')
    expect(bodyView('3', [])).toBe('3')
    expect(bodyView('', json)).toBe('')
  })
})
