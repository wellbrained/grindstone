import { describe, expect, it } from 'vitest'
import { compareSpecificity, cssRules, isInherited, longhandsOf, parseCss, parseDeclarations, specificity, splitSelectorList, styleSheets } from '../../../../shared/levels/debugging/css'

// The Elements panel's CSS knowledge, on Grindstone's side (docs/features/levels.md, "The Elements panel"): the level's
// stylesheets read into rules with their file and line, selector specificity, and which properties a declaration sets
// and inherits. The bridge only says which rules match; everything here is pure and decides the panel's cascade.

describe('parseCss', () => {
  const sheet = (source: string, firstLine = 1, path = 'style.css') => parseCss({ path, source, firstLine })

  it('reads rules with the line of their selector and of each declaration', () => {
    const rules = sheet([
      '/* Corner Bakery (Maya) */',
      'body {',
      '  margin: 0;',
      '  color: #2a2118;',
      '}',
      '',
      '.add,',
      '.action {',
      '  background: var(--brand) !important;',
      '  color: #fff',
      '}'
    ].join('\n'))
    expect(rules).toEqual([
      {
        path: 'style.css',
        line: 2,
        selector: 'body',
        selectors: ['body'],
        conditions: [],
        declarations: [
          { property: 'margin', value: '0', important: false, line: 3 },
          { property: 'color', value: '#2a2118', important: false, line: 4 }
        ]
      },
      {
        path: 'style.css',
        line: 7,
        selector: '.add, .action',
        selectors: ['.add', '.action'],
        conditions: [],
        declarations: [
          { property: 'background', value: 'var(--brand)', important: true, line: 9 },
          { property: 'color', value: '#fff', important: false, line: 10 }
        ]
      }
    ])
  })

  it('keeps the media and supports conditions a rule sits in, with their lines', () => {
    const rules = sheet([
      '.bar { display: none; }',
      '@media (max-width: 600px) {',
      '  .bar { display: flex; }',
      '  @supports (display: grid) {',
      '    .list { display: grid; }',
      '  }',
      '}',
      '.after { color: red }'
    ].join('\n'))
    expect(rules.map(rule => [rule.selector, rule.line, rule.conditions])).toEqual([
      ['.bar', 1, []],
      ['.bar', 3, [{ kind: 'media', text: '(max-width: 600px)', line: 2 }]],
      ['.list', 5, [{ kind: 'media', text: '(max-width: 600px)', line: 2 }, { kind: 'supports', text: '(display: grid)', line: 4 }]],
      ['.after', 8, []]
    ])
  })

  it('skips comments, strings with braces, other at-rules and nested rules, and keeps custom properties as written', () => {
    const rules = sheet([
      '@import url("x.css");',
      ':root { --Brand: #7a3e12; --gap: { a: b }; }',
      '@keyframes spin { from { transform: rotate(0) } to { transform: rotate(1turn) } }',
      '@font-face { font-family: Bakery; }',
      '.cart::after { content: "} {"; /* a ; in a comment */ COLOR: Red; }',
      '.card { padding: 4px; &:hover { color: red; } margin: 0; }'
    ].join('\n'))
    expect(rules.map(rule => rule.selector)).toEqual([':root', '.cart::after', '.card'])
    expect(rules[0]!.declarations.map(d => [d.property, d.value])).toEqual([['--Brand', '#7a3e12'], ['--gap', '{ a: b }']])
    expect(rules[1]!.declarations.map(d => [d.property, d.value])).toEqual([['content', '"} {"'], ['color', 'Red']])
    expect(rules[2]!.declarations.map(d => d.property)).toEqual(['padding', 'margin'])
  })

  it('counts lines from where a <style> block starts, and survives broken text', () => {
    expect(sheet('p { color: red }', 12, 'index.html')[0]).toMatchObject({ path: 'index.html', line: 12, declarations: [{ line: 12 }] })
    // unclosed blocks, a stray brace, a declaration without a value: no throw, what can be read is read
    expect(sheet('.a { color: red; .b { margin').map(rule => rule.selector)).toEqual(['.a'])
    expect(sheet('} .a { color red; width: 1px }')[0]!.declarations).toEqual([{ property: 'width', value: '1px', important: false, line: 1 }])
    expect(sheet('/* never closed .a { color: red }')).toEqual([])
    expect(sheet('')).toEqual([])
  })
})

describe('parseDeclarations', () => {
  it('reads a style attribute', () => {
    expect(parseDeclarations('color: red; background:url("a;b.png") ;  ;opacity:0 !IMPORTANT', null)).toEqual([
      { property: 'color', value: 'red', important: false, line: null },
      { property: 'background', value: 'url("a;b.png")', important: false, line: null },
      { property: 'opacity', value: '0', important: true, line: null }
    ])
  })
})

describe('splitSelectorList', () => {
  it('splits on the commas between selectors only', () => {
    expect(splitSelectorList('.a, .b:is(.c, .d) > p,[data-x="1,2"]')).toEqual(['.a', '.b:is(.c, .d) > p', '[data-x="1,2"]'])
    expect(splitSelectorList('  h1  \n  .title ')).toEqual(['h1 .title'])
  })
})

describe('specificity', () => {
  it.each([
    ['*', [0, 0, 0]],
    ['li', [0, 0, 1]],
    ['ul li', [0, 0, 2]],
    ['.add', [0, 1, 0]],
    ['#products .price', [1, 1, 0]],
    ['.product button.add', [0, 2, 1]],
    ['a[href^="http"]:hover', [0, 2, 1]],
    ['.cart::after', [0, 1, 1]],
    ['p:first-line', [0, 0, 2]],
    [':root', [0, 1, 0]],
    [':not(#a, .b) span', [1, 0, 1]],
    [':is(.a, ul li) > p', [0, 1, 1]],
    [':where(#main .x) p', [0, 0, 1]],
    ['li:nth-child(2n + 1 of .special)', [0, 2, 1]],
    ['.a > .b ~ .c + .d', [0, 4, 0]],
    ['svg|rect', [0, 0, 1]]
  ] as const)('%s is %j', (selector, expected) => {
    expect(specificity(selector)).toEqual(expected)
  })

  it('orders specificities by ids, then classes, then types', () => {
    expect(compareSpecificity([1, 0, 0], [0, 9, 9])).toBeGreaterThan(0)
    expect(compareSpecificity([0, 1, 0], [0, 0, 9])).toBeGreaterThan(0)
    expect(compareSpecificity([0, 1, 2], [0, 1, 2])).toBe(0)
    expect(compareSpecificity([0, 0, 1], [0, 1, 0])).toBeLessThan(0)
  })
})

describe('longhands and inheritance', () => {
  it('knows what a shorthand sets', () => {
    expect(longhandsOf('margin')).toEqual(['margin-top', 'margin-right', 'margin-bottom', 'margin-left'])
    expect(longhandsOf('background')).toContain('background-color')
    expect(longhandsOf('border')).toContain('border-left-color')
    expect(longhandsOf('border-top')).toEqual(['border-top-width', 'border-top-style', 'border-top-color'])
    expect(longhandsOf('overflow')).toEqual(['overflow-x', 'overflow-y'])
    expect(longhandsOf('inset')).toEqual(['top', 'right', 'bottom', 'left'])
    expect(longhandsOf('color')).toEqual(['color'])
    expect(longhandsOf('--brand')).toEqual(['--brand'])
  })

  it('knows which properties an element inherits', () => {
    for (const property of ['color', 'font', 'font-size', 'visibility', 'pointer-events', 'white-space', 'cursor', '--brand']) expect(isInherited(property), property).toBe(true)
    for (const property of ['background', 'display', 'opacity', 'z-index', 'margin', 'width', 'overflow']) expect(isInherited(property), property).toBe(false)
  })
})

describe('the stylesheets of a page', () => {
  const files = {
    'index.html': [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '  <link rel="stylesheet" href="./style.css">',
      '  <style>',
      '    .note { color: gray }',
      '  </style>',
      '  <link rel="stylesheet" href="theme.css">',
      '  <link rel="icon" href="./style.css">',
      '  <link rel="stylesheet" href="https://example.com/x.css">',
      '</head>',
      '<body></body>',
      '</html>'
    ].join('\n'),
    'style.css': '.a { color: red }\n',
    'theme.css': '.b { color: blue }\n'
  }

  it('lists them in document order: linked files and <style> blocks with the line they start on', () => {
    expect(styleSheets(files)).toEqual([
      { path: 'style.css', source: '.a { color: red }\n', firstLine: 1 },
      { path: 'index.html', source: '\n    .note { color: gray }\n  ', firstLine: 5 },
      { path: 'theme.css', source: '.b { color: blue }\n', firstLine: 1 }
    ])
  })

  it('reads every rule of the page in cascade order', () => {
    expect(cssRules(files).map(rule => `${rule.path}:${rule.line} ${rule.selector}`)).toEqual(['style.css:1 .a', 'index.html:6 .note', 'theme.css:1 .b'])
  })
})

describe('stylesheets the browser does not apply, or applies only sometimes', () => {
  const page = (head: string[]) => ({
    'index.html': ['<!doctype html>', '<html lang="en">', '<head>', ...head, '</head>', '<body></body>', '</html>'].join('\n'),
    'style.css': '.a { color: red }\n',
    'print.css': '.b { color: blue }\n'
  })

  it('leaves out links and blocks inside <!-- -->, and keeps the lines after them right', () => {
    const files = page(['<!-- <link rel="stylesheet" href="print.css">', '<style>.x { color: red }</style> -->', '<link rel="stylesheet" href="style.css">', '<style>', '.c { margin: 0 }', '</style>', '<!-- never closed <link rel="stylesheet" href="print.css">'])
    expect(cssRules(files).map(rule => `${rule.path}:${rule.line} ${rule.selector}`)).toEqual(['style.css:1 .a', 'index.html:8 .c'])
  })

  it('leaves out a disabled link, and makes a media attribute a condition of every rule of its sheet', () => {
    const files = page(['<link rel="stylesheet" href="print.css" disabled>', '<link rel="stylesheet" href="style.css" media="(max-width: 600px)">', '<style media="print">.c { margin: 0 }</style>', '<link rel="stylesheet" href="print.css" media="all">'])
    const rules = cssRules(files)
    expect(rules.map(rule => [rule.path, rule.selector, rule.conditions])).toEqual([
      ['style.css', '.a', [{ kind: 'media', text: '(max-width: 600px)', line: 5, path: 'index.html' }]],
      ['index.html', '.c', [{ kind: 'media', text: 'print', line: 6, path: 'index.html' }]],
      ['print.css', '.b', []]
    ])
  })
})

describe('hostile CSS: never throws, stays fast', () => {
  const quick = (run: () => unknown, ms = 300) => {
    const started = performance.now()
    expect(run).not.toThrow()
    expect(performance.now() - started).toBeLessThan(ms)
  }
  const parse = (source: string) => parseCss({ path: 'style.css', source, firstLine: 1 })

  it('reads a huge stylesheet of whitespace, or of one endless selector, in linear time', () => {
    quick(() => parse(' '.repeat(100_000)))
    quick(() => parse('a'.repeat(200_000)))
    quick(() => parse(`.a { color: red${' '.repeat(40_000)}!important }`))
    quick(() => parse(`.a { color: red${' '.repeat(40_000)}x }`))
    quick(() => parseDeclarations(`color: red${' '.repeat(40_000)}! important`, null))
    expect(parse(`.a { color: red${' '.repeat(40_000)}!important }`)[0]!.declarations).toEqual([{ property: 'color', value: 'red', important: true, line: 1 }])
  })

  it('caps how deep media queries and selectors nest', () => {
    const media = `${'@media (min-width: 1px) {'.repeat(5000)} .deep { color: red } ${'}'.repeat(5000)} .after { color: blue }`
    quick(() => parse(media))
    expect(parse(media).map(rule => rule.selector)).toEqual(['.after'])
    const nested = `${':is('.repeat(5000)}.a${')'.repeat(5000)}`
    quick(() => specificity(nested))
    quick(() => parse(`${nested} { color: red }`))
    expect(specificity(`${':is('.repeat(3)}#a${')'.repeat(3)}`)).toEqual([1, 0, 0])
  })

  it('reads an index.html full of unclosed tags quickly', () => {
    quick(() => styleSheets({ 'index.html': '<link '.repeat(20_000) }))
    quick(() => styleSheets({ 'index.html': '<style>'.repeat(20_000) }))
    quick(() => styleSheets({ 'index.html': '<!--'.repeat(20_000) }))
  })
})
