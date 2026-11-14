import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { debuggingLevels, editedText, reload, startDebugLevel } from '../shared/levels'
import type { DebugLevel, Observation, ProbeValue } from '../shared/levels'
import { expected } from '../test/unit/levels/debugging/expected'
import { runCheck } from './helpers/sandbox'

// The app's code can't post a check run's results (docs/features/ui.md, "Sandbox and bridge"; CoreHub todo #522). Code
// written into the level's index.html, before its <head> (the bridge still goes first), tries every way it knows to post
// the results that would solve the level, and to make the bridge's own probes read them: it looks for the load's token
// on the page, hooks every way a port could pass it (MessagePort's and Function's methods, promises, the window's
// messages, window.event), posts a hello of its own with its own port, posts the results to the page and to every port
// it found, replaces what the old probes read with (their steps' slice, textContent) and hides the app's errors. The
// level stays unsolved, the probes read what the app does, and the real fix still solves it with all that in the page.
// Runs in Chromium, Firefox and WebKit.
const level = (id: string) => debuggingLevels.find(each => each.id === id)!

/** The results that would solve the level (its solved run), as the bridge would post them. */
function solvedResults(id: string) {
  const probes = expected[id]!.solved!.probes as Record<string, ProbeValue>
  return [...Object.entries(probes).map(([probe, value]) => ({ type: 'probe', id: probe, ok: true, value, error: null })), { type: 'done' }]
}

/** The text each text probe would read in the solved run, by its selector (what the forged textContent says). */
function solvedTexts(of: DebugLevel) {
  const probes = expected[of.id]!.solved!.probes as Record<string, ProbeValue>
  const texts: Record<string, string> = {}
  for (const probe of of.sandbox.probes) {
    const last = probe.steps.at(-1)
    if (last && 'text' in last && typeof probes[probe.id] === 'string') texts[last.text] = probes[probe.id] as string
  }
  return texts
}

/** The cheat: a classic script that runs before the app's modules (and tries to run before the bridge). */
function cheat(of: DebugLevel) {
  return `(function () {
  var FORGED = ${JSON.stringify(solvedResults(of.id))};
  var TEXTS = ${JSON.stringify(solvedTexts(of))};
  var apply = Reflect.apply;
  var ports = [];
  var isPort = function (value) { try { return value instanceof MessagePort; } catch (error) { return false; } };
  var seen = function (port) { if (isPort(port) && ports.indexOf(port) < 0) ports[ports.length] = port; };
  var root = document.documentElement;
  var token = null;
  /* the load's token, wherever the page has it (looked for again with every try: the page grows while it loads) */
  var findToken = function () {
    var text = root.outerHTML;
    for (var i = 0; i < document.scripts.length; i++) text += document.scripts[i].textContent;
    var found = new RegExp('"tok' + 'en":"([^"]+)"').exec(text);
    if (found) token = found[1];
    root.setAttribute('data-token', token || '');
  };
  findToken();
  root.setAttribute('data-cheat', 'ran');
  var realPost = MessagePort.prototype.postMessage;
  MessagePort.prototype.postMessage = function () { seen(this); return apply(realPost, this, arguments); };
  ['call', 'apply', 'bind'].forEach(function (name) {
    var real = Function.prototype[name];
    Function.prototype[name] = function (self) { seen(self); return apply(real, this, arguments); };
  });
  var peek = function () {
    var event = window.event;
    if (event) { seen(event.target); seen(event.currentTarget); }
  };
  var realThen = Promise.prototype.then;
  Promise.prototype.then = function () { peek(); return apply(realThen, this, arguments); };
  new MutationObserver(peek).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
  window.addEventListener('message', function (event) {
    peek();
    for (var i = 0; i < event.ports.length; i++) seen(event.ports[i]);
  }, true);
  var realSlice = Array.prototype.slice;
  Array.prototype.slice = function () {
    if (this.length && this[0] && typeof this[0] === 'object' && 'waited' in this[0]) return [{ count: '.gs-nothing' }];
    return apply(realSlice, this, arguments);
  };
  var realText = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
  Object.defineProperty(Node.prototype, 'textContent', {
    configurable: true,
    get: function () {
      for (var selector in TEXTS) if (this.nodeType === 1 && this.matches(selector)) return TEXTS[selector];
      return apply(realText.get, this, []);
    },
    set: realText.set
  });
  window.ErrorEvent = function ErrorEvent() {};
  window.addEventListener('error', function (event) { event.stopImmediatePropagation(); event.preventDefault(); }, true);
  window.onerror = function () { return true; };
  var forge = function () {
    findToken();
    /* a hello of its own, with the token it has: ports the page might read the load from */
    var own = new MessageChannel();
    seen(own.port1);
    try { parent.postMessage({ type: 'grindstone:bridge', token: token }, '*', [own.port2, new MessageChannel().port2]); } catch (error) {}
    root.setAttribute('data-ports', String(ports.length));
    for (var f = 0; f < FORGED.length; f++) {
      var message = Object.assign({ grindstone: token }, FORGED[f]);
      try { parent.postMessage(message, '*'); } catch (error) {}
      for (var p = 0; p < ports.length; p++) { try { apply(realPost, ports[p], [message]); } catch (error) {} }
    }
  };
  forge();
  setTimeout(forge, 0);
  setInterval(forge, 100);
  window.addEventListener('load', forge);
})();`
}

/** index.html with the cheat in front of its <head> (and its <html>), right after the doctype, and again at the end. */
function withCheat(of: DebugLevel, files: Readonly<Record<string, string>>) {
  const page = files['index.html']!
  expect(page.startsWith('<!doctype html>\n<html lang="en">\n<head>')).toBe(true)
  expect(page).toContain('</body>')
  const script = `<script>${cheat(of)}</script>`
  return { ...files, 'index.html': page.replace('<!doctype html>\n', () => `<!doctype html>\n${script}\n`).replace('</body>', () => `${script}</body>`) }
}

function solvedFiles(of: DebugLevel) {
  let files = startDebugLevel(of).state.files
  for (const step of of.solution) if (typeof step === 'object' && 'save' in step) files = { ...files, [step.save]: editedText(files, step) }
  return files
}

const solves = (of: DebugLevel, observation: Observation) => reload(startDebugLevel(of), of, observation).session.solved

async function check(page: Page, of: DebugLevel, files: Readonly<Record<string, string>>) {
  return (await runCheck(page, files, of.sandbox.probes, of.sandbox.backend, { performance: of.sandbox.performance })).observation
}

for (const id of ['debugging-01-add-to-cart', 'debugging-29-one-after-another']) {
  test(`${id}: the app's code can't post the check run's results or change what the probes read`, async ({ page }) => {
    await page.setContent('<!doctype html><title>check</title>')
    const of = level(id)
    const table = expected[id]!
    // what the cheat posts would solve the level, were it believed
    expect(solves(of, { finished: true, errors: [], probes: Object.fromEntries(solvedResults(id).flatMap(each => each.type === 'probe' ? [[each.id, each.value]] : [])), probeErrors: {}, logs: [] })).toBe(true)

    // the starting files with the cheat: the probes read what the app does, the errors are reported, nothing is solved
    const cheated = await check(page, of, withCheat(of, startDebugLevel(of).state.files))
    expect(cheated.finished).toBe(true)
    expect(cheated.probes).toEqual(table.start.probes)
    expect(cheated.errors).toHaveLength(table.start.errors)
    expect(solves(of, cheated)).toBe(false)

    // the real fix, the cheat still in the page: solved, with the real values
    const fixed = await check(page, of, withCheat(of, solvedFiles(of)))
    expect(fixed.probes).toEqual(table.solved!.probes)
    expect(fixed.errors).toHaveLength(table.solved!.errors)
    expect(solves(of, fixed)).toBe(true)
  })
}

// The same through the play page, as a player would try it on 6.4 (the level the cheat was found on): the code goes
// into index.html, Save, Reload: the goal stays unmet; the real fix (the cheat still in) solves it.
test('6.4 on the play page: a cheat in index.html leaves the goal unmet, the real fix solves it', async ({ page }) => {
  const of = level('debugging-29-one-after-another')
  const start = startDebugLevel(of).state.files
  const replaceFile = async (path: string, text: string) => {
    await page.locator(`[data-file="${path}"]`).click()
    await expect(page.locator(`[data-file="${path}"]`)).toHaveAttribute('aria-selected', 'true')
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.insertText(text)
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page.locator(`[data-file="${path}"]`)).not.toContainText('●')
  }

  await page.goto(`/debugging/${of.id.replace('debugging-', '')}`)
  await expect(page.locator('[data-goal="at-once"]')).toHaveAttribute('data-met', 'false')
  await replaceFile('index.html', withCheat(of, start)['index.html']!)
  await page.getByTestId('reload').click()
  await expect(page.getByTestId('reloads')).toHaveText('Reloads: 1')
  await expect(page.locator('[data-goal="at-once"]')).toHaveAttribute('data-met', 'false')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // the cheat ran in the app, and found no token on its page
  const app = page.frameLocator('[data-testid="app-frame"]')
  await expect(app.locator('html')).toHaveAttribute('data-cheat', 'ran')
  await expect(app.locator('html')).toHaveAttribute('data-token', '')

  await replaceFile('load.js', solvedFiles(of)['load.js']!)
  await page.getByTestId('reload').click()
  await expect(page.getByRole('dialog')).toContainText('Ask for everything at once')
})
