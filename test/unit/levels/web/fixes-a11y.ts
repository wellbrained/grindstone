// Other edits a player may make to a chapter 6 level (accessibility): real fixes the goals must accept and tempting
// non-fixes they must reject, the chapter's list among them: a label the icon keeps hidden, the same name on every
// button, hidden text, a description for a name; tabindex="0" or role="button" alone, a link, tabindex on everything;
// aria-expanded written once, on the wrong element, or only one way; a live region added or made live with its text,
// or shown with it; focus put on the page, on main, or only on one way out of the dialog. Applied like fixes.ts's; run
// in a browser by e2e/web-levels.spec.ts.
import { ADD_BUTTON } from '../../../../shared/levels/web/26-every-button'
import { CHECKOUT_DIV, CHECKOUT_LISTENER } from '../../../../shared/levels/web/27-checkout'
import { ALLERGEN_LIST, TOGGLE_BUTTON, TOGGLE_LINE } from '../../../../shared/levels/web/28-allergens'
import { EMAIL_ERROR, EMAIL_FIELD, SEND, SEND_INTO } from '../../../../shared/levels/web/29-silent-error'
import { CLOSE, DIALOG_DIV, OPEN } from '../../../../shared/levels/web/30-focus-lost'
import type { OtherFix } from './fixes'

type Edit = OtherFix['edits'][number]

const app = (from: string, to: string): Edit => ({ save: 'app.js', replace: [from, to] })
const html = (from: string, to: string): Edit => ({ save: 'index.html', replace: [from, to] })

// --- 6.1 ---------------------------------------------------------------------------------------------------------------

/** The Add button's line with this inside the <button …> tag and this as its content. */
const addButton = (attributes: string, content = '${BASKET_ICON}'): Edit => app(ADD_BUTTON, `    <button class="add icon-button" type="button"${attributes}>${content}</button>\``)
const NAME_SPAN = '<span class="name">${product.name}</span>'
const namedSpan = app(NAME_SPAN, '<span class="name" id="name-${product.id}">${product.name}</span>')

// --- 6.2 ---------------------------------------------------------------------------------------------------------------

const checkout = (tag: string): Edit => html(CHECKOUT_DIV, `  ${tag}`)
/** Keys handled on Check out next to its click listener: these keys click it. */
const checkoutKeys = (test: string): Edit => app(CHECKOUT_LISTENER, `${CHECKOUT_LISTENER}document.querySelector('#checkout').addEventListener('keydown', (event) => {
  if (${test}) {
    event.preventDefault()
    event.target.click()
  }
})
`)
const BUTTON = '<button id="checkout" class="checkout" type="button">Check out</button>'

// --- 6.3 ---------------------------------------------------------------------------------------------------------------

const toggleMarkup = (attributes: string): Edit => html(TOGGLE_BUTTON, `  <button id="allergens-toggle" class="toggle" type="button"${attributes}>Allergens</button>`)
const toggleThen = (line: string): Edit => app(TOGGLE_LINE, `${TOGGLE_LINE}  ${line}\n`)
const LISTENER = `toggle.addEventListener('click', () => {\n${TOGGLE_LINE}})\n`

// --- 6.4 ---------------------------------------------------------------------------------------------------------------

/** A paragraph for the error right after the field, in the markup from the start. */
const errorPlace = (attributes: string): Edit => html(EMAIL_FIELD, `${EMAIL_FIELD}        <p id="email-error" class="error"${attributes}></p>\n`)
const fillInstead = app(SEND, SEND_INTO)
const WRITE_ERROR = `    error.textContent = '${EMAIL_ERROR}'\n`
const SET_CLASS = '    error.className = \'error\'\n'
const sendWith = (line: string): Edit => app(SET_CLASS, `${SET_CLASS}    ${line}\n`)
const ERROR_CONST = 'const error = document.querySelector(\'#email-error\')\n'
/** The error written again while Tomás types (a re-check on input), so a later Enter finds the region live. */
const recheckOnInput = (shown: string): Edit => app(ERROR_CONST, `${ERROR_CONST}field.addEventListener('input', () => {\n  if (${shown} && !looksLikeEmail(field.value.trim())) {\n    error.textContent = ''\n    error.textContent = '${EMAIL_ERROR}'\n  }\n})\n`)

// --- 6.5 ---------------------------------------------------------------------------------------------------------------

const closeWith = (body: string): Edit => app(CLOSE, `function close() {\n${body}}\n`)
const ESCAPE_LISTENER = 'dialog.addEventListener(\'keydown\', (event) => {\n'
const openWith = (body: string): Edit => app(OPEN, `function open() {\n${body}}\n`)

export const a11yFixes: Record<string, OtherFix[]> = {
  'web-26-every-button': [
    { name: 'aria-label with the product\'s name', edits: [addButton(' aria-label="Add ${product.name}"')], solves: true },
    { name: 'aria-labelledby pointing at the product\'s name', edits: [namedSpan, addButton(' aria-labelledby="name-${product.id}"')], solves: true },
    { name: 'text hidden on screen but not from readers (visually-hidden)', edits: [addButton('', '${BASKET_ICON}<span class="visually-hidden">Add ${product.name}</span>')], solves: true },
    { name: 'the icon made an image with a name (role="img" and aria-label instead of aria-hidden)', edits: [addButton('', '${BASKET_ICON.replace(\'aria-hidden="true"\', `role="img" aria-label="Add ${product.name}"`)}')], solves: true },
    { name: 'the icon given an SVG <title> (and no aria-hidden)', edits: [addButton('', '${BASKET_ICON.replace(\'aria-hidden="true">\', `><title>Add ${product.name}</title>`)}')], solves: true },
    { name: 'a title on the button (Chrome names it by the title)', edits: [addButton(' title="Add ${product.name}"')], solves: true },
    { name: 'aria-label on the icon that stays aria-hidden', edits: [addButton('', '${BASKET_ICON.replace(\'aria-hidden\', `aria-label="Add ${product.name}" aria-hidden`)}')], solves: false },
    { name: 'a <title> in the icon that stays aria-hidden', edits: [addButton('', '${BASKET_ICON.replace(\'aria-hidden="true">\', `aria-hidden="true"><title>Add ${product.name}</title>`)}')], solves: false },
    { name: 'the same aria-label on every button', edits: [addButton(' aria-label="Add to basket"')], solves: false },
    { name: 'the name in text hidden with the hidden attribute', edits: [addButton('', '${BASKET_ICON}<span hidden>Add ${product.name}</span>')], solves: false },
    { name: 'the name in text with display: none', edits: [addButton('', '${BASKET_ICON}<span style="display: none">Add ${product.name}</span>')], solves: false },
    { name: 'aria-describedby pointing at the product\'s name (a description, not a name)', edits: [namedSpan, addButton(' aria-describedby="name-${product.id}"')], solves: false },
    { name: 'aria-label on the row instead of the button', edits: [app('  row.dataset.id = product.id\n', '  row.dataset.id = product.id\n  row.setAttribute(\'aria-label\', `Add ${product.name}`)\n')], solves: false },
    { name: 'a blank aria-label', edits: [addButton(' aria-label=" "')], solves: false },
    { name: 'one label naming every product on every button', edits: [addButton(' aria-label="Add Butter croissant, Pain au chocolat or Cinnamon bun"')], solves: false },
    { name: 'the button swapped for a span with role="img" and a label (no button: no Tab, no Enter)', edits: [app(ADD_BUTTON, '    <span class="add icon-button" role="img" aria-label="Add ${product.name}">${BASKET_ICON}</span>`')], solves: false }
  ],
  'web-27-checkout': [
    { name: 'role="button", tabindex="0" and Enter and Space handled', edits: [checkout('<div id="checkout" class="checkout" role="button" tabindex="0">Check out</div>'), checkoutKeys('event.key === \'Enter\' || event.key === \' \'')], solves: true },
    { name: 'an <input type="button">', edits: [checkout('<input id="checkout" class="checkout" type="button" value="Check out">')], solves: true },
    { name: 'tabindex="0" alone (reached, and then nothing)', edits: [checkout('<div id="checkout" class="checkout" tabindex="0">Check out</div>')], solves: false },
    { name: 'role="button" and tabindex="0" without keys', edits: [checkout('<div id="checkout" class="checkout" role="button" tabindex="0">Check out</div>')], solves: false },
    { name: 'role="button", tabindex="0" and Enter only', edits: [checkout('<div id="checkout" class="checkout" role="button" tabindex="0">Check out</div>'), checkoutKeys('event.key === \'Enter\'')], solves: false },
    { name: 'tabindex="0" and both keys, but no role (the reader never says button)', edits: [checkout('<div id="checkout" class="checkout" tabindex="0">Check out</div>'), checkoutKeys('event.key === \'Enter\' || event.key === \' \'')], solves: false },
    { name: 'aria-label on the div', edits: [checkout('<div id="checkout" class="checkout" aria-label="Check out">Check out</div>')], solves: false },
    { name: 'an <a> without href', edits: [checkout('<a id="checkout" class="checkout">Check out</a>')], solves: false },
    { name: 'a link with an href (Enter, not Space; and it is a link)', edits: [checkout('<a id="checkout" class="checkout" href="/checkout">Check out</a>')], solves: false },
    { name: 'a button with tabindex="1" (first on the page, not after +)', edits: [checkout('<button id="checkout" class="checkout" type="button" tabindex="1">Check out</button>')], solves: false },
    { name: 'a button, and tabindex="0" on the heading and the total too', edits: [checkout(BUTTON), html('<h2 id="basket-heading">', '<h2 id="basket-heading" tabindex="0">'), html('<p class="total">', '<p class="total" tabindex="0">')], solves: false },
    { name: 'role="button" with tabindex="-1", reached only by catching Tab on + (Shift+Tab never gets there)', edits: [checkout('<div id="checkout" class="checkout" role="button" tabindex="-1">Check out</div>'), checkoutKeys('event.key === \'Enter\' || event.key === \' \''), app('// Check out: styled', 'document.querySelector(\'#more\').addEventListener(\'keydown\', (event) => {\n  if (event.key === \'Tab\' && !event.shiftKey) {\n    event.preventDefault()\n    document.querySelector(\'#checkout\').focus()\n  }\n})\n\n// Check out: styled')], solves: false },
    { name: 'a button whose listener listens for keydown instead of click (the mouse no longer works)', edits: [checkout(BUTTON), app('document.querySelector(\'#checkout\').addEventListener(\'click\'', 'document.querySelector(\'#checkout\').addEventListener(\'keydown\'')], solves: false }
  ],
  'web-28-allergens': [
    { name: 'aria-expanded set in the listener only (nothing in the markup)', edits: [toggleThen('toggle.setAttribute(\'aria-expanded\', String(!list.hidden))')], solves: true },
    { name: 'the ariaExpanded property, and false in the markup', edits: [toggleMarkup(' aria-expanded="false"'), toggleThen('toggle.ariaExpanded = String(!list.hidden)')], solves: true },
    { name: 'a <details> with a <summary>, no script', edits: [html(TOGGLE_BUTTON, '  <details>\n      <summary id="allergens-toggle" class="toggle">Allergens</summary>'), html(ALLERGEN_LIST[0]!, '  <ul id="allergens-list" class="allergens">'), html(ALLERGEN_LIST[4]!, '  </ul>\n    </details>'), app(LISTENER, '')], solves: true },
    { name: 'aria-expanded="false" in the markup, never changed', edits: [toggleMarkup(' aria-expanded="false"')], solves: false },
    { name: 'aria-expanded="true" in the markup', edits: [toggleMarkup(' aria-expanded="true"')], solves: false },
    { name: 'aria-expanded on the list', edits: [toggleThen('list.setAttribute(\'aria-expanded\', String(!list.hidden))')], solves: false },
    { name: 'aria-pressed toggled instead', edits: [toggleMarkup(' aria-pressed="false"'), toggleThen('toggle.setAttribute(\'aria-pressed\', String(!list.hidden))')], solves: false },
    { name: 'the label changed (Show allergens / Hide allergens)', edits: [toggleThen('toggle.textContent = list.hidden ? \'Show allergens\' : \'Hide allergens\'')], solves: false },
    { name: 'aria-expanded set when it opens, never back to false', edits: [toggleMarkup(' aria-expanded="false"'), toggleThen('if (!list.hidden) toggle.setAttribute(\'aria-expanded\', \'true\')')], solves: false },
    { name: 'aria-hidden toggled with aria-expanded, the list never hidden on screen', edits: [toggleMarkup(' aria-expanded="false"'), html(ALLERGEN_LIST[0]!, '  <ul id="allergens-list" class="allergens" aria-hidden="true">'), app(TOGGLE_LINE, '  const open = toggle.getAttribute(\'aria-expanded\') !== \'true\'\n  toggle.setAttribute(\'aria-expanded\', String(open))\n  list.setAttribute(\'aria-hidden\', String(!open))\n')], solves: false },
    { name: 'aria-expanded right, but the list never hidden', edits: [toggleMarkup(' aria-expanded="false"'), html(ALLERGEN_LIST[0]!, '  <ul id="allergens-list" class="allergens">'), app(TOGGLE_LINE, '  toggle.setAttribute(\'aria-expanded\', String(toggle.getAttribute(\'aria-expanded\') !== \'true\'))\n')], solves: false }
  ],
  'web-29-silent-error': [
    { name: 'an aria-live="polite" paragraph in the markup, filled', edits: [errorPlace(' aria-live="polite"'), fillInstead], solves: true },
    { name: 'a role="status" paragraph in the markup, filled', edits: [errorPlace(' role="status"'), fillInstead], solves: true },
    { name: 'an aria-live="assertive" paragraph in the markup, filled', edits: [errorPlace(' aria-live="assertive"'), fillInstead], solves: true },
    { name: 'a role="alert" paragraph in the markup, filled 50 ms after Enter (an async check)', edits: [errorPlace(' role="alert"'), fillInstead, app(WRITE_ERROR, `    setTimeout(() => {\n      error.textContent = '${EMAIL_ERROR}'\n    }, 50)\n`)], solves: true },
    { name: 'the new error added with role="alert" (Chrome reads an alert that appears)', edits: [sendWith('error.setAttribute(\'role\', \'alert\')')], solves: true },
    { name: 'focus moved to the field, with aria-invalid and aria-describedby the error', edits: [app('    field.after(error)\n', '    field.after(error)\n    field.setAttribute(\'aria-invalid\', \'true\')\n    field.setAttribute(\'aria-describedby\', \'email-error\')\n    field.focus()\n')], solves: true },
    { name: 'aria-live="polite" on the field\'s wrapper (the new error is added inside it)', edits: [html('<div class="field">', '<div class="field" aria-live="polite">')], solves: true },
    { name: 'a live wrapper in the markup with the error written in it, hidden, shown when the address is wrong (and hidden again as he types)', edits: [app('const status = document.querySelector(\'#status\')\n', 'const status = document.querySelector(\'#status\')\nfield.addEventListener(\'input\', () => {\n  document.querySelector(\'#email-error\').hidden = true\n})\n'), html(EMAIL_FIELD, `${EMAIL_FIELD}        <div aria-live="polite"><p id="email-error" class="error" hidden>${EMAIL_ERROR}</p></div>\n`), app('  document.querySelector(\'#email-error\')?.remove()\n', '  const error = document.querySelector(\'#email-error\')\n  error.hidden = true\n'), app(`    const error = document.createElement('p')\n    error.id = 'email-error'\n    error.className = 'error'\n    error.textContent = '${EMAIL_ERROR}'\n    field.after(error)\n`, '    error.hidden = false\n')], solves: true },
    { name: 'aria-live="polite" on the new error, added with its text', edits: [sendWith('error.setAttribute(\'aria-live\', \'polite\')')], solves: false },
    { name: 'role="status" on the new error, added with its text', edits: [sendWith('error.setAttribute(\'role\', \'status\')')], solves: false },
    { name: 'an empty paragraph in the markup, made live in the same moment as its text', edits: [errorPlace(''), fillInstead, app(WRITE_ERROR, `    error.setAttribute('aria-live', 'polite')\n${WRITE_ERROR}`)], solves: false },
    { name: 'a live region in the markup, hidden until the error and shown with it', edits: [errorPlace(' aria-live="polite" hidden'), fillInstead, app(WRITE_ERROR, `    error.hidden = false\n${WRITE_ERROR}`)], solves: false },
    { name: 'made live with its text, and written again while Tomás types (his first Enter still silent)', edits: [errorPlace(''), fillInstead, app(WRITE_ERROR, `    error.setAttribute('aria-live', 'polite')\n${WRITE_ERROR}`), recheckOnInput('error.textContent')], solves: false },
    { name: 'hidden until the error and shown with it, and written again while Tomás types (his first Enter still silent)', edits: [errorPlace(' aria-live="polite" hidden'), fillInstead, app(WRITE_ERROR, `    error.hidden = false\n${WRITE_ERROR}`), recheckOnInput('!error.hidden')], solves: false },
    { name: 'made live, then focus() on Send, then its text, all in one handler (a focus() is no new moment)', edits: [errorPlace(''), fillInstead, app(WRITE_ERROR, `    error.setAttribute('aria-live', 'polite')\n    document.querySelector('#send').focus()\n${WRITE_ERROR}`)], solves: false },
    { name: 'an empty live paragraph added, then document.body.focus(), then its text, all in one handler', edits: [app(`    error.textContent = '${EMAIL_ERROR}'\n    field.after(error)\n`, `    error.setAttribute('aria-live', 'polite')\n    field.after(error)\n    document.body.focus()\n    error.textContent = '${EMAIL_ERROR}'\n`)], solves: false },
    { name: 'made live, then await Promise.resolve(), then its text (a microtask is the same task)', edits: [errorPlace(''), fillInstead, app('document.querySelector(\'#send\').addEventListener(\'click\', () => {', 'document.querySelector(\'#send\').addEventListener(\'click\', async () => {'), app(WRITE_ERROR, `    error.setAttribute('aria-live', 'polite')\n    await Promise.resolve()\n${WRITE_ERROR}`)], solves: false },
    { name: 'made live with its text, and written again by a 0 ms timer (folded into the same update)', edits: [errorPlace(''), fillInstead, app(WRITE_ERROR, `    error.setAttribute('aria-live', 'polite')\n${WRITE_ERROR}    setTimeout(() => {\n      error.textContent = ''\n      error.textContent = '${EMAIL_ERROR}'\n    }, 0)\n`)], solves: false },
    { name: 'made live with its text, and written again by a 0 ms timer inside a 0 ms timer (one frame: one update)', edits: [errorPlace(''), fillInstead, app(WRITE_ERROR, `    error.setAttribute('aria-live', 'polite')\n${WRITE_ERROR}    setTimeout(() => setTimeout(() => {\n      error.textContent = ''\n      error.textContent = '${EMAIL_ERROR}'\n    }, 0), 0)\n`)], solves: false },
    { name: 'made live with its text, then await, then written again by a 0 ms timer', edits: [errorPlace(''), fillInstead, app('document.querySelector(\'#send\').addEventListener(\'click\', () => {', 'document.querySelector(\'#send\').addEventListener(\'click\', async () => {'), app(WRITE_ERROR, `    error.setAttribute('aria-live', 'polite')\n${WRITE_ERROR}    await Promise.resolve()\n    setTimeout(() => {\n      error.textContent = ''\n      error.textContent = '${EMAIL_ERROR}'\n    }, 0)\n`)], solves: false },
    { name: 'an empty live paragraph added, its text written in a queueMicrotask', edits: [app(`    error.textContent = '${EMAIL_ERROR}'\n    field.after(error)\n`, `    error.setAttribute('aria-live', 'polite')\n    field.after(error)\n    queueMicrotask(() => {\n      error.textContent = '${EMAIL_ERROR}'\n    })\n`)], solves: false },
    { name: 'an empty live paragraph added, its text written by the page\'s own MutationObserver', edits: [app('const status = document.querySelector(\'#status\')\n', `const status = document.querySelector('#status')\nnew MutationObserver(() => {\n  const empty = document.querySelector('#email-error[aria-live]:empty')\n  if (empty) empty.textContent = '${EMAIL_ERROR}'\n}).observe(document.body, { childList: true, subtree: true })\n`), app(`    error.textContent = '${EMAIL_ERROR}'\n    field.after(error)\n`, `    error.setAttribute('aria-live', 'polite')\n    field.after(error)\n`)], solves: false },
    { name: 'aria-invalid and aria-describedby on the field, focus left on the button', edits: [app('    field.after(error)\n', '    field.after(error)\n    field.setAttribute(\'aria-invalid\', \'true\')\n    field.setAttribute(\'aria-describedby\', \'email-error\')\n')], solves: false },
    { name: 'an aria-live="off" paragraph in the markup, filled', edits: [errorPlace(' aria-live="off"'), fillInstead], solves: false }
  ],
  'web-30-focus-lost': [
    { name: 'what had focus remembered when it opens, focused again when it closes', edits: [openWith('  before = document.activeElement\n  dialog.hidden = false\n  dialog.querySelector(\'.slot\').focus()\n'), app('const time = document.querySelector(\'#pickup-time\')\n', 'const time = document.querySelector(\'#pickup-time\')\nlet before = null\n'), closeWith('  dialog.hidden = true\n  before?.focus()\n')], solves: true },
    { name: 'focus put back before the dialog is hidden', edits: [closeWith('  opener.focus()\n  dialog.hidden = true\n')], solves: true },
    { name: 'focus put back a task later (setTimeout)', edits: [closeWith('  dialog.hidden = true\n  setTimeout(() => opener.focus())\n')], solves: true },
    { name: 'a <dialog> with showModal() and close()', edits: [html(DIALOG_DIV, '<dialog id="pickup-dialog" class="dialog" aria-labelledby="pickup-title">'), html('Cancel</button>\n    </div>', 'Cancel</button>\n    </dialog>'), openWith('  dialog.showModal()\n  dialog.querySelector(\'.slot\').focus()\n'), closeWith('  dialog.close()\n')], solves: true },
    { name: 'focus put back from a focusout listener when the dialog is hidden (the focus fixup fires focusout)', edits: [app(ESCAPE_LISTENER, `dialog.addEventListener('focusout', () => {\n  if (dialog.hidden) opener.focus()\n})\n${ESCAPE_LISTENER}`)], solves: true },
    { name: 'focus put back only after a time is picked (Cancel and Escape still lose it)', edits: [app('    time.textContent = slot.dataset.time\n    close()\n', '    time.textContent = slot.dataset.time\n    close()\n    opener.focus()\n')], solves: false },
    { name: 'document.body.focus() (the body can\'t take focus)', edits: [closeWith('  dialog.hidden = true\n  document.body.focus()\n')], solves: false },
    { name: 'focus put on <main> with tabindex="-1"', edits: [closeWith('  dialog.hidden = true\n  const main = document.querySelector(\'main\')\n  main.setAttribute(\'tabindex\', \'-1\')\n  main.focus()\n')], solves: false },
    { name: 'document.activeElement.blur() before hiding', edits: [closeWith('  document.activeElement.blur()\n  dialog.hidden = true\n')], solves: false },
    { name: 'autofocus put on the opener', edits: [closeWith('  dialog.hidden = true\n  opener.setAttribute(\'autofocus\', \'\')\n')], solves: false },
    { name: 'focus never moved into the dialog (so it is never lost)', edits: [openWith('  dialog.hidden = false\n')], solves: false },
    { name: 'focus put on the opener when it opens (behind the dialog)', edits: [openWith('  dialog.hidden = false\n  opener.focus()\n')], solves: false }
  ]
}
