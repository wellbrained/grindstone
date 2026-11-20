import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import { A11Y_LIMITS, A11Y_SOURCE, a11yConfig, heardFacts, heardLine } from '../../../../shared/levels/web/a11y'
import type { A11yRow, ReaderLine } from '../../../../shared/levels/web/a11y'

// The accessibility model (ADR 0009, chapter 6) on happy-dom: roles after HTML-AAM, names and descriptions after the
// Accessible Name and Description Computation 1.2 (as Chrome has it), states, the Tab order and the modelled keyboard,
// focus and dialogs, and live regions, beside the specs' text. What needs a real browser's styles and layout (computed
// display and visibility, CSS generated content, a closed <details>) runs in e2e/web-levels.spec.ts and
// e2e/web-accessibility.spec.ts in three browsers.

interface Model {
  quiet: (then: () => void) => void
  act: () => void
  install: () => void
  start: () => void
  probing: () => void
  key: (name: string) => void
  tabTo: (element: Element) => number
  focusOn: (element: Element) => boolean
  top: () => void
  focused: (selector: string) => number
  reads: (element: Element) => string | null
  name: (element: Element) => string | null
  role: (element: Element) => string
  state: (element: Element, which: string) => string | null
  mark: () => number
  heard: (text: string, mark: number, live: boolean, after?: string | null, scene?: boolean) => number
  tabStops: () => number
  tree: () => void
  refresh: () => void
}

const create = new Function(`return ${A11Y_SOURCE}`)() as (config: unknown, hooks: unknown) => Model

/** The model on a fresh page with this body; what it posted is kept. */
function page(body: string) {
  const window = new Window({ url: 'https://cornerbakery.shop/order' })
  const document = window.document
  document.write(`<!doctype html><html lang="en"><head><title>Corner Bakery · Order</title><style>[hidden] { display: none }</style></head><body>${body}</body></html>`)
  const posted: { type: string, lines?: ReaderLine[], rows?: A11yRow[], focus?: string | null }[] = []
  const model = create(a11yConfig(), { win: window, post: (message: (typeof posted)[number]) => posted.push(message), check: true })
  model.install()
  model.start()
  const $ = (selector: string) => document.querySelector(selector) as unknown as Element
  // what was said, as of a task boundary taken now (the model takes the page's changes at the next one)
  const said = () => {
    model.refresh()
    return posted.flatMap(message => message.type === 'reader' ? message.lines! : [])
  }
  const heard = () => said().map(heardLine)
  // later than the model's task boundary (a frame after a change), so the page's changes have reached the reader
  const settle = () => new Promise(resolve => setTimeout(resolve, 30))
  return { window, document, model, $, posted, said, heard, settle }
}

describe('roles (HTML-AAM, an explicit role\'s first known token, presentational roles)', () => {
  it('gives elements their implicit roles', () => {
    const { model, $ } = page(`
      <a id="link" href="/menu">Menu</a><a id="anchor">No href</a>
      <button id="button">Add</button><input id="text"><input id="search" type="search"><input id="check" type="checkbox">
      <input id="radio" type="radio"><input id="submit" type="submit"><input id="list" list="x"><textarea id="area"></textarea>
      <select id="select"><option>7:00</option></select><select id="multi" multiple><option>a</option></select>
      <h2 id="heading">Menu</h2><ul id="ul"><li id="li">x</li></ul><nav id="nav"></nav><main id="main"></main>
      <section id="section"></section><section id="named" aria-label="Offers"></section><img id="decor" alt=""><img id="photo" alt="A croissant">
      <div id="div">x</div><p id="p">x</p><dialog id="dialog" open>x</dialog><output id="output"></output>`)
    const roles = ['link', 'anchor', 'button', 'text', 'search', 'check', 'radio', 'submit', 'list', 'area', 'select', 'multi', 'heading', 'ul', 'li', 'nav', 'main', 'section', 'named', 'decor', 'photo', 'div', 'p', 'dialog', 'output']
    expect(roles.map(id => model.role($(`#${id}`)))).toEqual(['link', 'generic', 'button', 'textbox', 'searchbox', 'checkbox', 'radio', 'button', 'combobox', 'textbox', 'combobox', 'listbox', 'heading', 'list', 'listitem', 'navigation', 'main', 'generic', 'region', 'none', 'img', 'generic', 'paragraph', 'dialog', 'status'])
  })

  it('takes an explicit role\'s first token it knows, and ignores none or presentation where focus or a global ARIA attribute is', () => {
    const { model, $ } = page('<div id="a" role="foo button">x</div><div id="b" role="BUTTON">x</div><h2 id="c" role="none">x</h2><button id="d" role="none">x</button><h2 id="e" role="presentation" aria-label="x">x</h2><div id="f" role="widget">x</div>')
    expect(['a', 'b', 'c', 'd', 'e', 'f'].map(id => model.role($(`#${id}`)))).toEqual(['button', 'button', 'none', 'button', 'heading', 'generic'])
  })

  it('says hidden for what is left out: aria-hidden on it or an ancestor, inert, hidden', () => {
    const { model, $ } = page('<div aria-hidden="true"><button id="a">x</button></div><button id="b" aria-hidden="TRUE">x</button><div inert><button id="c">x</button></div><button id="d" hidden>x</button><button id="e" aria-hidden="false">x</button>')
    expect(['a', 'b', 'c', 'e'].map(id => model.role($(`#${id}`)))).toEqual(['hidden', 'hidden', 'hidden', 'button'])
  })
})

describe('names and descriptions (accname 1.2)', () => {
  it('follows the steps in their order: aria-labelledby, aria-label, the host language, content, title', () => {
    const { model, $ } = page(`
      <span id="l1">Add</span><span id="l2">Butter croissant</span>
      <button id="a" aria-labelledby="l1 l2" aria-label="ignored">x</button>
      <button id="b" aria-label="Close the basket">✕</button>
      <button id="c"><svg aria-hidden="true"><path d=""></path></svg></button>
      <button id="d" title="Save to favourites"><svg aria-hidden="true"></svg></button>
      <button id="e">Add <span>to basket</span></button>
      <label for="f">Find</label><input id="f" type="search" placeholder="Search the menu">
      <input id="g" placeholder="Search the menu" title="Search">
      <label>Email <input id="h"></label>
      <img id="i" alt="A croissant"><a id="j" href="/"><img alt="Corner Bakery home"></a>
      <button id="k" aria-label="  ">Pay</button>
      <button id="m"><svg role="img" aria-label="Add Butter croissant"></svg></button>
      <button id="n"><svg><title>Add Pain au chocolat</title></svg></button>
      <fieldset id="o"><legend>Pickup time</legend></fieldset>
      <input id="p" type="submit"><input id="q" type="button" value="Go">
      <button id="r" aria-labelledby="nowhere">Text</button>`)
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'm', 'n', 'o', 'p', 'q', 'r'].map(id => model.name($(`#${id}`)))
    expect(names).toEqual(['Add Butter croissant', 'Close the basket', '', 'Save to favourites', 'Add to basket', 'Find', 'Search the menu', 'Email', 'A croissant', 'Corner Bakery home', 'Pay', 'Add Butter croissant', 'Add Pain au chocolat', 'Pickup time', 'Submit', 'Go', 'Text'])
  })

  it('leaves hidden content out of a name, unless aria-labelledby points at it', () => {
    const { model, $ } = page('<button id="a">Add<span hidden> Butter croissant</span></button><span id="hid" hidden>Butter croissant</span><button id="b" aria-labelledby="hid"></button><button id="c">Add<span aria-hidden="true">+</span></button>')
    expect(['a', 'b', 'c'].map(id => model.name($(`#${id}`)))).toEqual(['Add', 'Butter croissant', 'Add'])
  })

  it('gives a field inside a label its value, and a description from aria-describedby or a title that is not the name', () => {
    const { model, $ } = page('<label id="lab">Quantity <input id="q" value="2"> croissants</label><button id="other" aria-labelledby="lab">x</button><input id="e" aria-label="Email" aria-describedby="err"><p id="err">Enter a whole email address</p><button id="t" title="Adds it">Add</button>')
    expect(model.name($('#other'))).toBe('Quantity 2 croissants')
    expect(model.reads($('#e'))).toBe('Email, textbox, Enter a whole email address')
    expect(model.reads($('#t'))).toBe('Add, button, Adds it')
  })
})

describe('states and readings', () => {
  it('reads name, role, value, states and description in the reader\'s order', () => {
    const { model, $, document } = page(`
      <input id="c" type="checkbox" aria-label="Gift wrap"><button id="p" aria-pressed="false">Vegan only</button>
      <button id="x" aria-expanded="false">Allergens</button><div id="g" tabindex="0" aria-checked="true">Gift wrap</div>
      <div id="s" role="switch" aria-checked="true" tabindex="0">Receipt by email</div><h3 id="h">Opening hours</h3>
      <input id="r" required aria-invalid="true" aria-label="Email" value="tomas@"><button id="d" disabled>Pay</button>`)
    ;(document.querySelector('#c') as unknown as { checked: boolean }).checked = true
    expect(['c', 'p', 'x', 'g', 's', 'h', 'r', 'd'].map(id => model.reads($(`#${id}`)))).toEqual(['Gift wrap, checkbox, checked', 'Vegan only, button, not pressed', 'Allergens, button, collapsed', 'Gift wrap', 'Receipt by email, switch, on', 'Opening hours, heading level 3', 'Email, textbox, tomas@, required, invalid', 'Pay, button, disabled'])
    // aria-checked means nothing without a role that has it
    expect(model.state($('#g'), 'checked')).toBeNull()
    expect(model.state($('#x'), 'expanded')).toBe('false')
    expect(model.state($('#p'), 'expanded')).toBeNull()
  })
})

describe('the Tab order and the modelled keyboard', () => {
  it('visits positive tabindex values first, then the page in order; skips -1, disabled controls and what is hidden', () => {
    const { model, heard } = page('<a href="/menu">Skip to the menu</a><input type="search" tabindex="2" aria-label="Search the menu"><button tabindex="1">Newsletter</button><h2 tabindex="-1">Today\'s menu</h2><button>Add croissant</button><button disabled>Order later</button><button hidden>Hidden</button><div>Not focusable</div>')
    for (let i = 0; i < 5; i++) model.key('Tab')
    expect(heard()).toEqual(['focus: Newsletter, button', 'focus: Search the menu, searchbox', 'focus: Skip to the menu, link', 'focus: Add croissant, button', 'leave: Out of the page: the browser\'s own controls'])
    model.key('Shift+Tab')
    expect(heard().at(-1)).toBe('focus: Add croissant, button')
    expect(model.tabStops()).toBe(4)
  })

  it('takes one radio of a group: the checked one, else the first', () => {
    const { model, heard } = page('<input type="radio" name="t" aria-label="7:00"><input type="radio" name="t" aria-label="8:00" checked><input type="radio" name="t" aria-label="9:00"><input type="radio" name="u" aria-label="a"><input type="radio" name="u" aria-label="b">')
    model.key('Tab')
    model.key('Tab')
    expect(heard()).toEqual(['focus: 8:00, radio, checked', 'focus: a, radio, not checked'])
  })

  it('activates a button with Enter and Space, a link with Enter, a checkbox with Space, a div with role=button with neither', async () => {
    const { model, $, document, window } = page('<button id="b">Order</button><a id="a" href="#x">Menu</a><input id="c" type="checkbox" aria-label="Gift wrap"><div id="d" role="button" tabindex="0">Favourite</div>')
    const clicks: string[] = []
    let lastKey = ''
    document.addEventListener('keydown', (event) => {
      const pressed = (event as unknown as KeyboardEvent).key
      lastKey = pressed === ' ' ? 'Space' : pressed
    }, true)
    for (const id of ['b', 'a', 'c', 'd']) {
      document.querySelector(`#${id}`)!.addEventListener('click', (event) => {
        if (id === 'a') event.preventDefault()
        clicks.push(`${id} ${lastKey}`)
      })
    }
    for (const id of ['b', 'a', 'c', 'd']) {
      expect(model.focusOn($(`#${id}`))).toBe(true)
      model.key('Enter')
      model.key('Space')
    }
    expect(clicks).toEqual(['b Enter', 'b Space', 'a Enter', 'c Space'])
    expect((document.querySelector('#c') as unknown as { checked: boolean }).checked).toBe(true)
    void window
  })

  it('lets a keydown that is prevented stop the activation, and Tab', () => {
    const { model, $, document, heard } = page('<button id="b">Order</button><button id="c">Next</button>')
    let clicked = 0
    document.querySelector('#b')!.addEventListener('click', () => {
      clicked++
    })
    document.addEventListener('keydown', event => event.preventDefault())
    model.focusOn($('#b'))
    model.key('Enter')
    model.key('Space')
    model.key('Tab')
    expect(clicked).toBe(0)
    expect(heard()).toEqual(['focus: Order, button'])
  })

  it('dispatches blur, focusout, focus and focusin in Chrome\'s order, and keeps document.activeElement', () => {
    const { model, $, document } = page('<button id="a">A</button><button id="b">B</button>')
    const events: string[] = []
    for (const type of ['blur', 'focusout', 'focus', 'focusin']) document.addEventListener(type, event => events.push(`${type} ${(event.target as unknown as Element).id}`), true)
    model.focusOn($('#a'))
    ;($('#b') as unknown as HTMLElement).focus()
    expect(events).toEqual(['focus a', 'focusin a', 'blur a', 'focusout a', 'focus b', 'focusin b'])
    expect(document.activeElement).toBe($('#b'))
    ;($('#b') as unknown as HTMLElement).blur()
    expect(document.activeElement).toBe(document.body)
    // a div without tabindex can't take focus
    ;(document.createElement('div') as unknown as HTMLElement).focus()
    expect(document.activeElement).toBe(document.body)
  })
})

describe('focus fixup, dialogs and the starting point', () => {
  it('drops focus silently when the focused element goes, and Tab goes on from where it was', () => {
    const { model, $, heard } = page('<button id="first">First</button><div id="box"><button id="inner">Inner</button></div><button id="after">After</button>')
    model.focusOn($('#inner'))
    model.refresh()
    $('#box').setAttribute('hidden', '')
    model.refresh()
    expect(model.focused('*')).toBe(0)
    model.key('Tab')
    expect(heard()).toEqual(['focus: Inner, button', 'focus: After, button'])
  })

  it('opens a modal dialog with focus on its first control, keeps Tab inside, closes on Escape and gives focus back', () => {
    const { model, $, heard, document } = page('<button id="open">Change pickup time</button><dialog id="d" aria-labelledby="t"><h2 id="t">Pickup time</h2><button>7:00</button><button>8:00</button></dialog><button id="after">Check out</button>')
    model.focusOn($('#open'))
    model.refresh()
    ;(document.querySelector('#d') as unknown as { showModal: () => void }).showModal()
    model.key('Tab')
    model.key('Tab')
    model.key('Tab')
    model.key('Escape')
    expect(heard()).toEqual([
      'focus: Change pickup time, button',
      'dialog: Pickup time, dialog',
      'focus: 7:00, button',
      'focus: 8:00, button',
      'leave: Out of the page: the browser\'s own controls',
      'dialog: Pickup time, dialog',
      'focus: 7:00, button',
      'focus: Change pickup time, button'
    ])
    expect(model.role($('#after'))).toBe('button')
  })

  it('leaves the page outside an aria-modal dialog out of the tree while focus is in it, but Tab still walks out', () => {
    const { model, $, heard } = page('<button id="open">Change pickup time</button><div role="dialog" aria-modal="true" aria-label="Pickup time"><button id="slot">7:00</button></div>')
    model.focusOn($('#slot'))
    expect(model.role($('#open'))).toBe('hidden')
    model.key('Tab')
    model.key('Tab')
    expect(heard().slice(-1)).toEqual(['focus: Change pickup time, button'])
    expect(model.role($('#open'))).toBe('button')
  })
})

describe('live regions', () => {
  it('announces a change in a region that was live and shown before it, and nothing for one added or made live with its text', async () => {
    const { model, document, heard, settle } = page('<p id="a" role="status"></p><div id="b"></div><div id="c"></div><p id="d"></p><p id="e" aria-live="polite" hidden></p><p id="f" aria-live="assertive" aria-atomic="true">Basket: <span id="n">1</span></p>')
    void model
    document.querySelector('#a')!.textContent = 'A: 2 croissants in your basket'
    await settle()
    const alert = document.createElement('p')
    alert.setAttribute('role', 'alert')
    alert.textContent = 'B: payment failed'
    document.querySelector('#b')!.append(alert)
    await settle()
    const polite = document.createElement('p')
    polite.setAttribute('aria-live', 'polite')
    polite.textContent = 'C: saved'
    document.querySelector('#c')!.append(polite)
    await settle()
    document.querySelector('#d')!.setAttribute('aria-live', 'polite')
    document.querySelector('#d')!.textContent = 'D: saved'
    await settle()
    document.querySelector('#e')!.removeAttribute('hidden')
    document.querySelector('#e')!.textContent = 'E: saved'
    await settle()
    document.querySelector('#n')!.textContent = '2'
    await settle()
    expect(heard()).toEqual(['polite: A: 2 croissants in your basket', 'assertive: B: payment failed', 'assertive: Basket: 2'])
    // once they are live and shown, they speak
    document.querySelector('#d')!.textContent = 'D: again'
    document.querySelector('#e')!.textContent = 'E: again'
    await settle()
    expect(heard().slice(3)).toEqual(['polite: D: again', 'polite: E: again'])
  })

  it('says a state or name change of the focused element', () => {
    const { model, $ } = page('<button id="x" aria-expanded="false">Allergens</button>')
    model.focusOn($('#x'))
    const mark = model.mark()
    $('#x').setAttribute('aria-expanded', 'true')
    $('#x').textContent = 'Hide allergens'
    expect(model.heard('expanded', mark, false)).toBe(1)
    expect(model.heard('Hide allergens', mark, false)).toBe(1)
    expect(model.heard('expanded', mark, true)).toBe(0)
  })
})

describe('the tree and the reader\'s lines as the page gets them', () => {
  it('lists what is in the tree, lifting generic containers, with names, states and the focus', () => {
    const { model, $, posted } = page('<main><h2>Today\'s menu</h2><ul><li><span>Butter croissant</span> <button id="add" aria-label="Add Butter croissant">+</button></li></ul><div aria-hidden="true">Decoration</div></main>')
    model.focusOn($('#add'))
    model.tree()
    const tree = posted.filter(message => message.type === 'a11y').at(-1)!
    expect(tree.rows!.map(row => `${'  '.repeat(row.depth)}${row.role} "${row.name}"${row.states.length ? ` ${row.states.join(' ')}` : ''}`)).toEqual([
      'document "Corner Bakery · Order"',
      '  main ""',
      '    heading "Today\'s menu" level 2',
      '    list ""',
      '      listitem ""',
      '        text "Butter croissant"',
      '        button "Add Butter croissant" focused'
    ])
    expect(tree.focus).toBe('Add Butter croissant, button')
  })

  it('marks lines said while the probes ran, and keeps the prediction\'s facts to the others', () => {
    const lines: ReaderLine[] = [{ kind: 'focus', text: 'button', key: 'Tab', probe: false }, { kind: 'polite', text: 'Saved', key: '', probe: true }]
    expect(heardFacts(lines)).toEqual(['focus: button'])
    expect(A11Y_LIMITS.lines).toBe(300)
  })
})

describe('the review of 2026-11-20', () => {
  it('fires blur and focusout when the focused element is hidden (the standard\'s focus fixup, as Chrome), nothing when it is removed', () => {
    const { model, $, document } = page('<div id="box"><button id="a">A</button></div><button id="b">B</button><div id="gone"><button id="c">C</button></div>')
    const events: string[] = []
    for (const type of ['blur', 'focusout']) document.addEventListener(type, event => events.push(`${type} ${(event.target as unknown as Element).id}`), true)
    model.focusOn($('#a'))
    $('#box').setAttribute('hidden', '')
    model.refresh()
    expect(events).toEqual(['blur a', 'focusout a'])
    model.focusOn($('#c'))
    events.length = 0
    $('#gone').remove()
    model.refresh()
    expect(events).toEqual([])
    expect(document.activeElement).toBe(document.body)
  })

  it('lets a focusout listener put focus somewhere else when the focused element is hidden', () => {
    const { model, $, heard } = page('<button id="open">Change pickup time</button><div id="dialog"><button id="slot">8:00</button></div>')
    $('#dialog').addEventListener('focusout', () => ($('#open') as unknown as HTMLElement).focus())
    model.focusOn($('#slot'))
    $('#dialog').setAttribute('hidden', '')
    model.refresh()
    expect(model.focused('#open')).toBe(1)
    expect(heard().at(-1)).toBe('focus: Change pickup time, button')
  })

  it('clicks a button with aria-disabled="true" on Enter and Space (only :disabled stops it, as in Chrome)', () => {
    const { model, $ } = page('<button id="b" aria-disabled="true">Pay</button>')
    let clicked = 0
    $('#b').addEventListener('click', () => {
      clicked++
    })
    model.focusOn($('#b'))
    model.key('Enter')
    model.key('Space')
    expect(clicked).toBe(2)
    expect(model.reads($('#b'))).toBe('Pay, button, disabled')
  })

  it('keeps focus on a non-modal dialog with nothing focusable in it, which show() focused', () => {
    const { model, $ } = page('<dialog id="d"><p>Saved</p></dialog>')
    ;($('#d') as unknown as { show: () => void }).show()
    model.refresh()
    expect(model.focused('#d')).toBe(1)
  })

  it('announces a part of a live region that was hidden and is shown now, once, and nothing for a region shown itself', async () => {
    const { model, document, heard, settle } = page('<div id="live" aria-live="polite"><p id="err" hidden>Enter a whole email address</p></div><p id="self" aria-live="polite" hidden>Saved</p>')
    void model
    document.querySelector('#err')!.removeAttribute('hidden')
    await settle()
    document.querySelector('#err')!.setAttribute('hidden', '')
    await settle()
    document.querySelector('#err')!.removeAttribute('hidden')
    document.querySelector('#err')!.textContent = 'Enter a whole email address'
    await settle()
    document.querySelector('#self')!.removeAttribute('hidden')
    await settle()
    expect(heard()).toEqual(['polite: Enter a whole email address', 'polite: Enter a whole email address'])
  })

  it('takes typing, a click or a focus move as the end of what follows a key, and can count the scene\'s lines alone', async () => {
    const { model, $, document, settle } = page('<p id="s" role="status"></p><button id="b">Send</button>')
    model.focusOn($('#b'))
    model.key('Enter')
    document.querySelector('#s')!.textContent = 'after Enter'
    await settle()
    model.act()
    document.querySelector('#s')!.textContent = 'after typing'
    await settle()
    model.probing()
    model.key('Enter')
    document.querySelector('#s')!.textContent = 'in a probe'
    await settle()
    expect([model.heard('after', 0, true, 'Enter', true), model.heard('after', 0, true, null, true), model.heard('probe', 0, true, 'Enter', true), model.heard('probe', 0, true, 'Enter', false)]).toEqual([1, 2, 0, 1])
  })

  it('makes the focus ring\'s host in every run, with the same attributes in a check run and the app you see', () => {
    const hostIn = (check: boolean) => {
      const window = new Window({ url: 'https://cornerbakery.shop/order' })
      window.document.write('<!doctype html><html><head></head><body><button id="a">A</button></body></html>')
      const model = create(a11yConfig(), { win: window, post: () => {}, check })
      model.install()
      model.start()
      model.focusOn(window.document.querySelector('#a') as unknown as Element)
      const host = window.document.querySelector('grindstone-focus') as unknown as Element
      return [...host.getAttributeNames()].map(name => `${name}=${host.getAttribute(name)}`).join(' ')
    }
    expect(hostIn(true)).toBe(hostIn(false))
    expect(hostIn(true)).toContain('pointer-events: none')
  })

  it('keeps a handler\'s changes together when it calls focus() between them (no new moment for the reader)', async () => {
    const { $, document, heard, settle } = page('<p id="e"></p><button id="b">Send</button>')
    $('#b').addEventListener('click', () => {
      $('#e').setAttribute('aria-live', 'polite')
      ;(document.body as unknown as HTMLElement).focus()
      ;($('#b') as unknown as HTMLElement).focus()
      $('#e').textContent = 'Enter a whole email address'
    })
    ;($('#b') as unknown as HTMLElement).click()
    await settle()
    expect(heard().filter(line => line.startsWith('polite'))).toEqual([])
  })

  it('cuts the tree where plain containers nest more than 200 deep', () => {
    const { model, posted } = page(`${'<div>'.repeat(260)}<button>Deep</button>${'</div>'.repeat(260)}`)
    model.tree()
    const tree = posted.filter(message => message.type === 'a11y').at(-1)! as unknown as { rows: A11yRow[], truncated: boolean }
    expect(tree.truncated).toBe(true)
    expect(tree.rows.some(row => row.role === 'button')).toBe(false)
  })

  it('stops the tree at 40 levels deep and says it was cut', () => {
    const deep = `${'<div role="group" aria-label="g">'.repeat(60)}<button>Deep</button>${'</div>'.repeat(60)}`
    const { model, posted } = page(deep)
    model.tree()
    const tree = posted.filter(message => message.type === 'a11y').at(-1)! as unknown as { rows: A11yRow[], truncated: boolean }
    expect(Math.max(...tree.rows.map(row => row.depth))).toBeLessThanOrEqual(41)
    expect(tree.truncated).toBe(true)
  })
})

describe('the third re-check: a frame per update, and quiet after a key', () => {
  const later = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  it('folds a page\'s 0 and 1 ms timers, nested or after an await, into the update of the task that set them', async () => {
    const { $, heard, window } = page('<p id="a"></p><p id="b"></p><p id="c"></p>')
    const setTimeout = window.setTimeout.bind(window) as unknown as (callback: () => void, ms: number) => number
    const rewrite = (id: string) => () => {
      $(id).textContent = ''
      $(id).textContent = `${id} again`
    }
    $('#a').setAttribute('aria-live', 'polite')
    $('#a').textContent = 'a'
    setTimeout(() => setTimeout(rewrite('#a'), 0), 0)
    $('#b').setAttribute('aria-live', 'polite')
    $('#b').textContent = 'b'
    setTimeout(rewrite('#b'), 1)
    $('#c').setAttribute('aria-live', 'polite')
    $('#c').textContent = 'c'
    await Promise.resolve()
    setTimeout(rewrite('#c'), 0)
    await later(60)
    expect(heard().filter(line => line.startsWith('polite'))).toEqual([])
  })

  it('waits for the page\'s short timers set in an open update, even when they run late (a busy machine)', async () => {
    const { $, heard, window } = page('<p id="a"></p>')
    const pageTimer = window.setTimeout.bind(window) as unknown as (callback: () => void, ms: number) => number
    $('#a').setAttribute('aria-live', 'polite')
    $('#a').textContent = 'first'
    await Promise.resolve()
    // a 16 ms page timer set once the update is open, whose own timer comes after the boundary would have
    pageTimer(() => {
      const busyUntil = Date.now() + 25
      while (Date.now() < busyUntil) { /* a busy machine */ }
      pageTimer(() => {
        $('#a').textContent = ''
        $('#a').textContent = 'again'
      }, 0)
    }, 16)
    await later(120)
    expect(heard().filter(line => line.startsWith('polite'))).toEqual([])
  })

  it('takes a write a frame or more later as a new update, so a region made live first speaks then', async () => {
    const { $, heard } = page('<p id="a"></p>')
    $('#a').setAttribute('aria-live', 'polite')
    setTimeout(() => {
      $('#a').textContent = 'Saved'
    }, 40)
    await later(80)
    expect(heard()).toEqual(['polite: Saved'])
  })

  it('waits after a key until the page made no change for 60 ms, so a write 50 ms after Enter is in', async () => {
    const { model, $, heard } = page('<p id="s" role="status"></p><button id="b">Send</button>')
    $('#b').addEventListener('click', () => setTimeout(() => {
      $('#s').textContent = 'Checked'
    }, 50))
    model.focusOn($('#b'))
    model.key('Enter')
    const started = Date.now()
    await new Promise<void>(resolve => model.quiet(resolve))
    expect(Date.now() - started).toBeGreaterThanOrEqual(100)
    expect(model.heard('Checked', 0, true, 'Enter', false)).toBe(1)
    void heard
  })
})
