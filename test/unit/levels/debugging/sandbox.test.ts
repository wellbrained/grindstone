import { describe, expect, it } from 'vitest'
import { BRIDGE_SOURCE } from '../../../../shared/levels/debugging/bridge'
import { COMPUTED_PROPERTIES } from '../../../../shared/levels/debugging/elements'
import { INSPECTOR_SOURCE } from '../../../../shared/levels/debugging/inspector'
import { CHECK_VIEWPORT, SANDBOX_CSP, SHOP_ORIGIN, checkFrames, resolveImport, rewriteImports, sandboxDocument } from '../../../../shared/levels/debugging/sandbox'

const files = {
  'index.html': [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <link rel="stylesheet" href="./style.css">',
    '</head>',
    '<body>',
    '  <ul id="products"></ul>',
    '  <script type="module" src="./app.js"></script>',
    '</body>',
    '</html>'
  ].join('\n'),
  'style.css': 'body { color: #2a2118; }\n.cart::after { content: "</style>"; }\n',
  'app.js': 'import { cart } from \'./cart.js\'\nimport \'./lib/log.js\'\nconsole.log(cart)\n',
  'cart.js': 'export { formatPrice } from "./lib/money.js"\nexport const cart = { items: [] }\n',
  'lib/money.js': 'import { log } from \'../lib/log.js\'\nexport const formatPrice = amount => amount.toFixed(2)\n',
  'lib/log.js': 'export const log = () => import(\'./money.js\')\n'
}

describe('resolveImport', () => {
  it('resolves ./ and ../ against the importing file', () => {
    expect(resolveImport('app.js', './cart.js')).toBe('cart.js')
    expect(resolveImport('lib/money.js', '../cart.js')).toBe('cart.js')
    expect(resolveImport('lib/money.js', './log.js')).toBe('lib/log.js')
    expect(resolveImport('app.js', '../outside.js')).toBeNull()
  })
})

describe('rewriteImports', () => {
  it('points relative imports of the level files at their own names, which the import map knows', () => {
    expect(rewriteImports(files['app.js'], 'app.js', files)).toBe('import { cart } from \'cart.js\'\nimport \'lib/log.js\'\nconsole.log(cart)\n')
    expect(rewriteImports(files['cart.js'], 'cart.js', files)).toBe('export { formatPrice } from "lib/money.js"\nexport const cart = { items: [] }\n')
    expect(rewriteImports(files['lib/money.js'], 'lib/money.js', files)).toContain('from \'lib/log.js\'')
    expect(rewriteImports(files['lib/log.js'], 'lib/log.js', files)).toBe('export const log = () => import(\'lib/money.js\')\n')
  })

  it('leaves an import of a file that does not exist as written, so the browser reports it', () => {
    expect(rewriteImports('import { x } from \'./nope.js\'\n', 'app.js', files)).toBe('import { x } from \'./nope.js\'\n')
  })

  it('never changes the number of lines', () => {
    for (const [path, text] of Object.entries(files)) {
      if (!path.endsWith('.js')) continue
      expect(rewriteImports(text, path, files).split('\n')).toHaveLength(text.split('\n').length)
    }
  })
})

describe('sandboxDocument', () => {
  const built = sandboxDocument(files, { token: 'tok-123' })
  const lines = built.html.split('\n')

  it('keeps every line of index.html where it was, so traces point at the right line', () => {
    expect(lines).toHaveLength(files['index.html'].split('\n').length)
    expect(lines[7]).toBe('  <ul id="products"></ul>')
    expect(lines[9]).toBe('</body>')
  })

  it('puts the base, the Content-Security-Policy and the bridge on the <head> line', () => {
    expect(built.bridgeLine).toBe(3)
    expect(lines[2]).toMatch(/^<head><base href="https:\/\/cornerbakery\.shop\/"><meta http-equiv="Content-Security-Policy" content="[^"]+"><script>.*<\/script>$/)
    expect(lines[2]).toContain(SANDBOX_CSP)
    expect(SHOP_ORIGIN).toBe('https://cornerbakery.shop/')
  })

  it('seals the frame: no network, no other scripts, eval only for the Console', () => {
    expect(SANDBOX_CSP).toContain('default-src \'none\'')
    expect(SANDBOX_CSP).toContain('connect-src \'none\'')
    expect(SANDBOX_CSP).toMatch(/script-src 'unsafe-inline' 'unsafe-eval' blob:;/)
    expect(SANDBOX_CSP).toContain('base-uri \'none\'')
    expect(SANDBOX_CSP).toContain('form-action \'none\'')
  })

  it('loads the entry module through the import map and the stylesheet from a data URL', () => {
    expect(lines[8]).toBe('  <script type="module">import "app.js"</script>')
    expect(lines[4]).toMatch(/^ {2}<link rel="stylesheet" href="data:text\/css;charset=utf-8,[^"\s]+">$/)
    expect(decodeURIComponent(lines[4]!.match(/charset=utf-8,([^"]+)"/)![1]!)).toBe(files['style.css'])
  })

  it('hands the bridge the token, the rewritten modules and no raw "<" that could close its script', () => {
    const script = lines[2]!.slice(lines[2]!.indexOf('<script>') + 8, lines[2]!.lastIndexOf('</script>'))
    expect(script).not.toMatch(/<\/script|<!--/i)
    expect(script).toContain('"tok-123"')
    expect(script).toContain('import { cart } from \'cart.js\'')
    expect(script).not.toContain('</style>')
  })

  it('passes the probes to the check run only', () => {
    const probes = [{ id: 'badge', steps: [{ text: '#cart-count' }] }]
    expect(sandboxDocument(files, { token: 't', probes }).html).toContain('"probes":[{"id":"badge"')
    expect(built.html).toContain('"probes":null')
  })

  it('works without a <head> (someone deleted it): the bridge goes first on line 1, the lines stay', () => {
    const bare = sandboxDocument({ 'index.html': '<p>hi</p>\n<p>there</p>' }, { token: 't' })
    expect(bare.bridgeLine).toBe(1)
    expect(bare.html.split('\n')).toHaveLength(2)
    expect(bare.html).toMatch(/<\/script><p>hi<\/p>\n<p>there<\/p>$/)
  })

  it('still runs without an index.html: an empty page with the bridge', () => {
    expect(sandboxDocument({ 'app.js': '' }, { token: 't' }).html).toContain('<script>')
  })
})

describe('the bridge', () => {
  it('is one line of JavaScript that parses, the inspector inside it', () => {
    for (const source of [BRIDGE_SOURCE, INSPECTOR_SOURCE]) {
      expect(source).not.toContain('\n')

      expect(() => new Function(`return ${source}`)).not.toThrow()
    }
    expect(BRIDGE_SOURCE).toContain(INSPECTOR_SOURCE)
  })
})

describe('the Elements panel in the frame', () => {
  const config = (html: string) => JSON.parse(html.slice(html.indexOf('({"token":') + 1, html.lastIndexOf(');</script>')))

  it('hands the bridge the rules of the page, the names of the linked stylesheets and the computed values to read', () => {
    const elements = config(sandboxDocument(files, { token: 't', elements: true }).html).elements
    expect(elements).toEqual({
      rules: [
        { selectors: ['body'], conditions: [], declarations: [['color', '#2a2118']] },
        { selectors: ['.cart::after'], conditions: [], declarations: [['content', '"</style>"']] }
      ],
      sheets: ['style.css'],
      computed: [...COMPUTED_PROPERTIES]
    })
  })

  it('leaves it out for levels without the panel and for check runs', () => {
    expect(config(sandboxDocument(files, { token: 't' }).html).elements).toBeNull()
    expect(config(sandboxDocument(files, { token: 't', probes: [] }).html).elements).toBeNull()
  })

  it('passes media and supports conditions as the browser can test them', () => {
    const page = { ...files, 'style.css': '@media (max-width: 600px) { @supports (display: grid) { .a { display: grid } } }' }
    expect(config(sandboxDocument(page, { token: 't', elements: true }).html).elements.rules).toEqual([
      { selectors: ['.a'], conditions: [['media', '(max-width: 600px)'], ['supports', '(display: grid)']], declarations: [['display', 'grid']] }
    ])
  })
})

describe('checkFrames', () => {
  const probe = (id: string, width?: number) => ({ id, steps: [{ text: 'p' }], ...(width ? { width } : {}) })

  it('runs the probes in one frame as wide as a phone', () => {
    expect(CHECK_VIEWPORT).toEqual({ width: 390, height: 700 })
    expect(checkFrames([probe('a'), probe('b')])).toEqual([{ width: 390, height: 700, probes: [probe('a'), probe('b')] }])
    expect(checkFrames([])).toEqual([{ width: 390, height: 700, probes: [] }])
  })

  it('gives each other width a frame of its own, the phone first, the probes in their order', () => {
    expect(checkFrames([probe('wide', 1024), probe('a'), probe('wide-2', 1024), probe('b', 390)])).toEqual([
      { width: 390, height: 700, probes: [probe('a'), probe('b', 390)] },
      { width: 1024, height: 700, probes: [probe('wide', 1024), probe('wide-2', 1024)] }
    ])
    expect(checkFrames([probe('wide', 1024)])).toEqual([{ width: 1024, height: 700, probes: [probe('wide', 1024)] }])
  })
})
