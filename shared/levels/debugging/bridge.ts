// The bridge: a small script that runs first inside the sealed frame, before the level's own code (docs/features/ui.md,
// "Sandbox and bridge"). It is the only way the frame talks to Grindstone: it posts plain data to the parent page and
// answers only the parent's Console input. It
// - loads the level's modules from blob URLs made inside the frame (so they share its sealed origin) through an import map,
// - reports console calls, uncaught errors and unhandled rejections with their raw stacks (the page maps them to files),
// - runs a check run's probes once the app has loaded (scripted clicks, typing and pauses, then reads the page) and says
//   when it is done,
// - evaluates Console input in the app's global scope,
// - keeps the app on its page (links do not navigate),
// - answers the app's `fetch` with the level's scripted backend (backend.ts) when it has one, inside the frame,
// - in levels with the Elements panel, answers the panel (inspector.ts): snapshots, matching rules, outline, pick mode,
// - in a recorded load (chapter 5), runs the recorder (recorder.ts) the instrumented modules report their steps to,
// - in a Performance level (chapter 6), watches what the app changes on the page and keeps the server's clock (answers
//   move it by their scripted delays); a recorded profile also reports the customer's actions to the counting recorder.
// It is JavaScript in a string, injected as one line (it never shifts index.html's lines), so it uses no line comments
// and ends every statement with a semicolon. Tested in a real browser: e2e/debugging-levels.spec.ts.
import { BACKEND_SOURCE } from './backend'
import { INSPECTOR_SOURCE } from './inspector'
import { RECORDER_GLOBAL, RECORDER_SOURCE } from './recorder'

/** The longest pause a probe may take (`{ wait }`): a check run gives up after 5 s. */
export const MAX_PROBE_WAIT_MS = 2000

const SOURCE = String.raw`(function (config) {
  'use strict';
  var host = window.parent;
  var token = config.token;
  var post = function (message) {
    message.grindstone = token;
    try { host.postMessage(message, '*'); } catch (error) { /* only plain data is posted; nothing else can fail */ }
  };
  var wait = function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };

  /* What the Console shows for a value: one short line, like the browser's own preview. */
  var quote = function (text) {
    return "'" + text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
  };
  var describe = function (element) {
    var text = element.tagName.toLowerCase();
    if (element.id) text += '#' + element.id;
    if (element.classList && element.classList.length) text += '.' + Array.prototype.join.call(element.classList, '.');
    return text;
  };
  var functionText = function (fn) {
    var source = '';
    try { source = Function.prototype.toString.call(fn); } catch (error) { source = ''; }
    var params = /^[^(=]*\(([^)]*)\)/.exec(source);
    return 'ƒ ' + (fn.name || '') + '(' + (params ? params[1].replace(/\s+/g, ' ').trim() : '') + ')';
  };
  var short = function (value) {
    if (value === null) return 'null';
    var type = typeof value;
    if (type === 'string') return quote(value.length > 60 ? value.slice(0, 60) + '…' : value);
    if (type === 'bigint') return String(value) + 'n';
    if (type === 'symbol') return value.toString();
    if (type === 'function') return 'ƒ';
    if (type !== 'object') return String(value);
    if (Array.isArray(value)) return 'Array(' + value.length + ')';
    if (value instanceof Error) return value.name + ': ' + value.message;
    if (typeof Element !== 'undefined' && value instanceof Element) return describe(value);
    if (value instanceof Promise) return 'Promise';
    return '{…}';
  };
  var preview = function (value, raw) {
    if (typeof value === 'string') return raw ? value : quote(value);
    if (typeof value === 'function') return functionText(value);
    if (value === null || typeof value !== 'object') return short(value);
    try {
      if (value instanceof Error) return value.name + ': ' + value.message;
      if (typeof Element !== 'undefined' && value instanceof Element) {
        var html = value.outerHTML;
        return html.length > 160 ? html.slice(0, 160) + '…' : html;
      }
      if (Array.isArray(value)) {
        return '(' + value.length + ') [' + value.slice(0, 20).map(short).join(', ') + (value.length > 20 ? ', …' : '') + ']';
      }
      if (value instanceof Map) return 'Map(' + value.size + ') {…}';
      if (value instanceof Set) return 'Set(' + value.size + ') {…}';
      if (value instanceof Promise) return 'Promise {…}';
      var keys = Object.keys(value);
      var maker = Object.getPrototypeOf(value);
      var name = maker && maker !== Object.prototype && maker.constructor && maker.constructor.name ? maker.constructor.name + ' ' : '';
      return name + '{' + keys.slice(0, 12).map(function (key) { return key + ': ' + short(value[key]); }).join(', ') + (keys.length > 12 ? ', …' : '') + '}';
    } catch (error) {
      return '{…}';
    }
  };

  /* Performance (chapter 6): what the app changes on the page, watched by a MutationObserver from the moment the page is
     parsed (readyState 'interactive', before any module runs); a change counts the elements and texts it adds or
     removes, or one attribute or text it sets. And the server's clock: it moves only when an answer arrives, to the time
     its request went out plus its scripted delay, so the same run reads the same times in every browser. */
  var perf = config.perf || null;
  var recorder = null;
  var clock = { now: 0, times: Object.create(null), count: 0, active: 0 };
  var domLog = [];
  var domBase = 0;
  var watcher = null;
  var lateDom = null;
  var visibleNode = function (node) { return node.nodeType === 1 || (node.nodeType === 3 && /\S/.test(node.data)); };
  var countNodes = function (list) {
    var n = 0;
    for (var i = 0; i < list.length; i++) if (visibleNode(list[i])) n++;
    return n;
  };
  var logDom = function (records) {
    var counts = [];
    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      var nodes = record.type === 'childList' ? countNodes(record.addedNodes) + countNodes(record.removedNodes) : 1;
      if (!nodes) continue;
      counts.push(nodes);
      if (config.probes) domLog.push({ target: record.target, added: Array.prototype.slice.call(record.addedNodes, 0, 20), nodes: nodes });
    }
    if (domLog.length > 20000) {
      domBase += domLog.length - 20000;
      domLog.splice(0, domLog.length - 20000);
    }
    return counts;
  };
  var takeDom = function () { return watcher ? logDom(watcher.takeRecords()) : []; };
  /* A look from the bridge's side (a probe): what changed is logged, and counted for the statement that made it. */
  var takeAll = function () {
    var counts = takeDom();
    if (lateDom) lateDom(counts);
  };
  if (perf && typeof MutationObserver === 'function') {
    var watch = function () {
      if (watcher || document.readyState === 'loading') return;
      watcher = new MutationObserver(function (records) {
        var counts = logDom(records);
        if (lateDom) lateDom(counts);
      });
      watcher.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
    };
    watch();
    document.addEventListener('readystatechange', watch);
  }
  var sentAt = function (id, delay) {
    clock.active = performance.now();
    if (clock.count < 200) {
      clock.count += 1;
      clock.times[id] = [clock.now, -1, delay];
    }
    if (recorder && recorder.request) recorder.request(id);
  };
  var arrivedAt = function (id) {
    clock.active = performance.now();
    var times = clock.times[id];
    if (!times) return;
    times[1] = times[0] + times[2];
    if (times[1] > clock.now) clock.now = times[1];
  };
  var abortedAt = function (id) {
    clock.active = performance.now();
    var times = clock.times[id];
    if (times) times[1] = clock.now;
  };
  var requestTimes = function () {
    var list = [];
    for (var id in clock.times) list.push([Number(id), clock.times[id][0], clock.times[id][1]]);
    return list;
  };

  /* A recorded load (chapter 5): the recorder the instrumented modules call before each statement, set up before any of
     them runs. It posts the steps in batches and stops on its caps or on the page's Stop. Chapter 6 runs it counting. */
  if (config.record) {
    recorder = (${RECORDER_SOURCE})(config.record, {
      post: post,
      now: function () { return performance.now(); },
      describe: describe,
      takeDom: perf ? takeDom : null,
      requests: requestTimes,
      clock: function () { return clock.now; }
    });
    try { Object.defineProperty(window, '${RECORDER_GLOBAL}', { value: recorder }); } catch (error) { recorder = null; }
    if (recorder && perf) lateDom = recorder.dom;
  }
  var counting = !!(recorder && config.record.profile);
  /* The work counted so far: null when this load does not count, -1 once counting stopped at its cap. */
  var workNow = function () { return counting ? recorder.work() : null; };

  /* A recorded profile (chapter 6): each click, typing, change or Enter starts an action, and what follows is counted
     for it; the events of one press in one task (a checkbox's click, input and change) are one action. */
  if (perf && perf.actions && counting) {
    var acting = false;
    var actionLabel = function (type, target) {
      if (type === 'keydown') return 'Enter';
      var tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (target.type === 'checkbox' || target.type === 'radio') return target.checked ? 'checked' : 'unchecked';
        return String(target.value || '').slice(0, 40);
      }
      return (target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    };
    var onAction = function (event) {
      if (acting || !recorder.on) return;
      if (event.type === 'keydown' && event.key !== 'Enter') return;
      var target = event.target && event.target.nodeType === 1 ? event.target : null;
      if (target && event.type === 'click' && target.closest) target = target.closest('button, a, label, summary, [role="button"]') || target;
      acting = true;
      setTimeout(function () { acting = false; }, 0);
      recorder.action(event.type, target ? describe(target) : '', target ? actionLabel(event.type, target) : '');
    };
    ['click', 'input', 'change', 'keydown', 'submit'].forEach(function (type) { window.addEventListener(type, onAction, true); });
  }

  /* The level's modules: blob URLs made here, and an import map from each file's name (and ./name) to its URL. */
  var imports = {};
  var urls = {};
  Object.keys(config.modules).forEach(function (path) {
    var url = URL.createObjectURL(new Blob([config.modules[path]], { type: 'text/javascript' }));
    urls[url] = path;
    imports[path] = url;
    imports['./' + path] = url;
  });
  post({ type: 'files', urls: urls });
  var map = document.createElement('script');
  map.type = 'importmap';
  map.textContent = JSON.stringify({ imports: imports });
  document.currentScript.after(map);
  /* What Grindstone put on the page (the base, the policy, the bridge, the import map): never shown in the Elements panel. */
  var own = [document.currentScript, map, document.querySelector('base'), document.querySelector('meta[http-equiv]')];

  /* The Console: every call is posted with its call stack (an Error argument brings its own), then goes on as usual. */
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var original = console[level];
    console[level] = function () {
      var args = Array.prototype.slice.call(arguments);
      var error = null;
      for (var i = 0; i < args.length; i++) if (args[i] instanceof Error) { error = args[i]; break; }
      var stack = error && error.stack ? String(error.stack) : String(new Error().stack || '');
      post({ type: 'console', level: level, args: args.map(function (arg) { return preview(arg, true); }), stack: stack });
      return original.apply(console, args);
    };
  });

  /* Uncaught errors (with the error's own stack, or where a syntax error was found) and files that failed to load. */
  window.addEventListener('error', function (event) {
    if (!(event instanceof ErrorEvent)) {
      var target = event.target;
      if (target && target !== window && target.tagName) {
        post({ type: 'error', kind: 'error', name: null, message: target.tagName === 'LINK' ? 'Failed to load stylesheet' : 'Failed to load module script', stack: null, url: null, line: null, column: null });
      }
      return;
    }
    var error = event.error;
    var known = error && typeof error === 'object';
    post({
      type: 'error',
      kind: 'error',
      name: known && error.name ? String(error.name) : null,
      message: known && error.message !== undefined ? String(error.message) : String(event.message || '').replace(/^Uncaught /, ''),
      stack: known && error.stack ? String(error.stack) : null,
      url: event.filename || null,
      line: event.lineno || null,
      column: event.colno || null
    });
  }, true);
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    var isError = reason instanceof Error;
    post({ type: 'error', kind: 'rejection', name: isError ? reason.name : null, message: isError ? reason.message : preview(reason, false), stack: isError && reason.stack ? String(reason.stack) : null, url: null, line: null, column: null });
  });
  document.addEventListener('securitypolicyviolation', function (event) {
    if (event.blockedURI === 'inline' || event.blockedURI === 'eval') return;
    post({ type: 'console', level: 'error', args: ["Refused to load '" + event.blockedURI + "': the practice app runs in a sealed frame without network."], stack: '' });
  });

  /* The app stays on its page: a link does not navigate the frame away. */
  window.addEventListener('click', function (event) {
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (link && (link.getAttribute('href') || '').charAt(0) !== '#') event.preventDefault();
  }, true);

  /* The fake backend (ADR 0007, chapter 2): a level with one gets every fetch answered here, from its scripted routes;
     it posts each request and answer (the Network panel) and the browser's lines for failed ones. Without one, requests
     go on to the network, which the frame's Content-Security-Policy refuses (connect-src 'none'). */
  var backend = config.backend
    ? (${BACKEND_SOURCE})(config.backend, {
        post: post,
        now: function () { return performance.now(); },
        sent: perf ? sentAt : null,
        arrived: perf ? arrivedAt : null,
        aborted: perf ? abortedAt : null
      })
    : null;
  var realFetch = window.fetch;
  window.fetch = function fetch(input, init) {
    return backend ? backend.fetch(input, init) : realFetch.apply(window, arguments);
  };
  /* Until the backend has answered everything the app asked (at most 3 s): a check run reads the page after that. In
     chapter 6 also 50 ms without a request sent or answered, so a page that loads one request after another is not
     taken for quiet in the moment between an answer and the next request (reading it takes a slow machine a while). */
  var idle = function (left) {
    if (!backend || left <= 0) return Promise.resolve();
    if (backend.pending() === 0 && (!perf || performance.now() - clock.active >= 50)) return Promise.resolve();
    return wait(10).then(function () { return idle(left - 10); });
  };
  var settle = function (ms) {
    return wait(ms).then(function () { return idle(3000); }).then(function () { return backend ? wait(20) : null; });
  };

  /* The Elements panel (chapter 3), in levels that use it: snapshots, matching rules, the outline and pick mode. */
  var inspector = config.elements ? (${INSPECTOR_SOURCE})(config.elements, { post: post, describe: describe, own: own }) : null;

  /* Messages from the page (only the parent, with this load's token): Console input, the Elements panel's requests and
     the Debugger's Stop. */
  window.addEventListener('message', function (event) {
    if (event.source !== host) return;
    var data = event.data;
    if (!data || data.grindstone !== token) return;
    if (inspector && data.type === 'dom') { inspector.snapshot(); return; }
    if (inspector && data.type === 'inspect' && typeof data.node === 'number' && typeof data.seq === 'number') { inspector.inspect(data.node, data.seq); return; }
    if (inspector && data.type === 'highlight' && typeof data.node === 'number') { inspector.highlight(data.node); return; }
    if (inspector && data.type === 'pick') { inspector.pick(data.on === true); return; }
    if (recorder && data.type === 'recordStop') { recorder.stop('stopped'); return; }
    if (data.type === 'eval' && typeof data.code === 'string') evaluate(data);
  });

  /* Console input: evaluated in the app's global scope; an object literal works as in DevTools, and so does a top-level
     await (await fetch('/api/menu')): the input runs in an async function and the Console shows what it settles to. A
     trailing semicolon is dropped first, so it stays an expression. One declaration of one name (const total = await …)
     defines it for later inputs, as a property of the window (the Console shows undefined, like DevTools). */
  var DECLARATION = /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]*?)\s*;?\s*$/;
  var asExpression = function (code) { return (0, eval)('(async () => (' + code + '\n))()'); };
  var awaited = function (code) {
    var declared = DECLARATION.exec(code);
    if (declared) {
      var name = declared[1];
      var value = null;
      try { value = asExpression(declared[2]); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
      if (value) return value.then(function (result) { window[name] = result; return undefined; });
    }
    try { return asExpression(code.replace(/;\s*$/, '')); } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return (0, eval)('(async () => {' + code + '\n})()');
    }
  };
  var evaluate = function (data) {
    var code = data.code;
    var trimmed = code.trim();
    var literal = trimmed.charAt(0) === '{' && trimmed.charAt(trimmed.length - 1) === '}';
    var done = function (value) { post({ type: 'result', id: data.id, ok: true, value: preview(value, false) }); };
    var fail = function (error) {
      var isError = error instanceof Error;
      post({ type: 'result', id: data.id, ok: false, name: isError ? error.name : null, message: isError ? error.message : preview(error, false), stack: isError && error.stack ? String(error.stack) : null });
    };
    var value;
    try {
      value = literal ? (0, eval)('(' + code + ')') : (0, eval)(code);
    } catch (first) {
      if (first instanceof SyntaxError && /\bawait\b/.test(code)) {
        var running;
        try { running = awaited(code); } catch (error) { fail(first); return; }
        running.then(done, fail);
        return;
      }
      if (!literal || !(first instanceof SyntaxError)) { fail(first); return; }
      try { value = (0, eval)(code); } catch (error) { fail(error); return; }
    }
    done(value);
  };

  /* A check run: once the app has loaded, each probe clicks and reads like a customer, then the run is done. */
  var find = function (selector) {
    try { return document.querySelector(selector); } catch (error) { return null; }
  };

  /* Layout probes (chapter 3): what a customer can see and tap, from the browser's own layout. */
  var scrollTo = function (top) {
    try { window.scrollTo({ top: top, left: 0, behavior: 'instant' }); } catch (error) { window.scrollTo(0, top); }
  };
  /* The centre of an element, scrolled into view vertically only (sideways is where a too wide layout hides things); null without a box. */
  var centre = function (element) {
    var rect = element.getBoundingClientRect();
    if (!element.getClientRects().length || rect.width < 1 || rect.height < 1) return null;
    scrollTo(window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2);
    rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };
  var onScreen = function (point) { return point.x >= 0 && point.x < document.documentElement.clientWidth && point.y >= 0 && point.y < window.innerHeight; };
  var visibility = function (element) {
    var node;
    for (node = element; node && node.nodeType === 1; node = node.parentElement) {
      if (getComputedStyle(node).display === 'none') return node === element ? 'display: none' : 'display: none on ' + describe(node);
    }
    var hidden = getComputedStyle(element).visibility;
    if (hidden !== 'visible') return 'visibility: ' + hidden;
    for (node = element; node && node.nodeType === 1; node = node.parentElement) {
      if (parseFloat(getComputedStyle(node).opacity) === 0) return node === element ? 'opacity: 0' : 'opacity: 0 on ' + describe(node);
    }
    var point = centre(element);
    if (!point) return 'no size';
    return onScreen(point) ? 'visible' : 'off screen';
  };
  var hitOf = function (element) {
    var point = centre(element);
    if (!point) return 'no box';
    if (!onScreen(point)) return 'off screen';
    var top = document.elementFromPoint(point.x, point.y);
    if (!top) return 'nothing';
    return top === element || element.contains(top) ? 'itself' : describe(top);
  };
  var tap = function (element) {
    var point = centre(element);
    var top = point && onScreen(point) ? document.elementFromPoint(point.x, point.y) : null;
    if (!top) return;
    if (typeof top.click === 'function') top.click();
    else top.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: point.x, clientY: point.y }));
  };
  var rgba = function (text) {
    var match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(text);
    if (!match) return null;
    var alpha = match[4] === undefined ? 1 : parseFloat(match[4]) / (match[5] ? 100 : 1);
    return [parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]), alpha];
  };
  var over = function (top, below) {
    return [0, 1, 2].map(function (i) { return top[i] * top[3] + below[i] * (1 - top[3]); }).concat([1]);
  };
  var luminance = function (colour) {
    var channel = colour.slice(0, 3).map(function (value) {
      value /= 255;
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channel[0] + 0.7152 * channel[1] + 0.0722 * channel[2];
  };
  /* The text's colour against what is behind it: the backgrounds of the element and its ancestors over a white page. */
  var contrastOf = function (element) {
    var layers = [];
    for (var node = element; node && node.nodeType === 1; node = node.parentElement) layers.unshift(getComputedStyle(node).backgroundColor);
    var ground = [255, 255, 255, 1];
    for (var i = 0; i < layers.length; i++) {
      var colour = rgba(layers[i]);
      if (!colour) return null;
      ground = over(colour, ground);
    }
    var text = rgba(getComputedStyle(element).color);
    if (!text) return null;
    var a = luminance(over(text, ground));
    var b = luminance(ground);
    return Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 100) / 100;
  };
  /* Typing, as a customer does it: the field gets the whole value at once, then input and change. It never takes the
     focus: a check run must not take the keyboard from Grindstone (Firefox lets a script in a sealed frame do that). */
  var typeInto = function (field, value) {
    field.value = value;
    var input;
    try { input = new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }); } catch (error) { input = new Event('input', { bubbles: true }); }
    field.dispatchEvent(input);
    field.dispatchEvent(new Event('change', { bubbles: true }));
  };
  /* A key event (true: nothing prevented it). */
  var keyEvent = function (target, type, key) {
    return target.dispatchEvent(new KeyboardEvent(type, { key: key, bubbles: true, cancelable: true }));
  };
  /* One letter as a customer types it: keydown, the letter in the field with an input event (unless the keydown was
     prevented), keyup. Never the focus, never a change. */
  var typeLetter = function (field, letter) {
    if (keyEvent(field, 'keydown', letter)) {
      field.value = (typeof field.value === 'string' ? field.value : '') + letter;
      var input;
      try { input = new InputEvent('input', { bubbles: true, inputType: 'insertText', data: letter }); } catch (error) { input = new Event('input', { bubbles: true }); }
      field.dispatchEvent(input);
    }
    keyEvent(field, 'keyup', letter);
  };
  var LOOKS = { style: 1, visible: 1, hit: 1, overflows: 1, contrast: 1 };
  var runProbe = function (probe) {
    var value = null;
    var problem = null;
    var steps = probe.steps.slice();
    takeAll();
    /* where the page's changes, the server's clock and the work were when this probe started */
    var start = { dom: domBase + domLog.length, clock: clock.now, work: workNow() };
    var next = function () {
      if (problem !== null || !steps.length) return Promise.resolve();
      var step = steps.shift();
      if (typeof step.keys === 'string') {
        var typed = find(step.keys);
        if (!typed) { problem = 'Nothing on the page matches ' + step.keys; return Promise.resolve(); }
        var letters = String(step.value).split('');
        var gap = Math.min(Math.max(typeof step.gap === 'number' ? step.gap : 80, 0), ${MAX_PROBE_WAIT_MS});
        var typeOn = function () {
          if (!letters.length) return next();
          typeLetter(typed, letters.shift());
          return wait(gap).then(typeOn);
        };
        return typeOn();
      }
      if (typeof step.press === 'string') {
        var pressed = find(step.press);
        if (!pressed) { problem = 'Nothing on the page matches ' + step.press; return Promise.resolve(); }
        /* Enter in a text field commits it, as in the browser: a change (no form is submitted in a sealed frame) */
        if (keyEvent(pressed, 'keydown', String(step.key)) && step.key === 'Enter' && pressed.tagName === 'INPUT') pressed.dispatchEvent(new Event('change', { bubbles: true }));
        keyEvent(pressed, 'keyup', String(step.key));
        return wait(20).then(next);
      }
      if (typeof step.changes === 'string') {
        if (!perf) { problem = 'The page is not watched in this run'; return Promise.resolve(); }
        takeAll();
        var area = find(step.changes);
        if (!area) { problem = 'Nothing on the page matches ' + step.changes; return Promise.resolve(); }
        var changed = 0;
        var holds = function (node) { return node.contains(area); };
        for (var at = Math.max(start.dom - domBase, 0); at < domLog.length; at++) {
          var entry = domLog[at];
          if (area.contains(entry.target) || entry.added.some(holds)) changed += entry.nodes;
        }
        value = changed;
        return next();
      }
      if (typeof step.work === 'string') {
        var counted = workNow();
        var from = step.work === 'load' ? 0 : start.work;
        var upTo = step.work === 'load' ? loadWork : counted;
        if (counted === null) problem = 'The app\'s work is not counted in this run';
        else if (counted < 0 || from < 0 || upTo < 0) problem = 'The app did more work than is counted: counting stopped';
        else value = upTo - from;
        return next();
      }
      if (typeof step.waited === 'string') {
        if (!perf) { problem = 'The server\'s time is not kept in this run'; return Promise.resolve(); }
        value = step.waited === 'load' ? loadClock : clock.now - start.clock;
        return next();
      }
      if (typeof step.click === 'string') {
        var target = find(step.click);
        if (!target) { problem = 'Nothing on the page matches ' + step.click; return Promise.resolve(); }
        for (var times = Math.min(Math.max(step.times || 1, 1), 10); times > 0; times--) target.click();
        return (step.settle === false ? wait(20) : settle(20)).then(next);
      }
      if (typeof step.type === 'string') {
        var field = find(step.type);
        if (!field) { problem = 'Nothing on the page matches ' + step.type; return Promise.resolve(); }
        typeInto(field, String(step.value));
        return wait(20).then(next);
      }
      if (typeof step.wait === 'number') {
        return wait(Math.min(Math.max(step.wait, 0), ${MAX_PROBE_WAIT_MS})).then(next);
      }
      if (step.settle === true) return settle(20).then(next);
      if (typeof step.text === 'string') {
        var element = find(step.text);
        if (!element) { problem = 'Nothing on the page matches ' + step.text; return Promise.resolve(); }
        value = (element.textContent || '').replace(/\s+/g, ' ').trim();
        return next();
      }
      if (typeof step.count === 'string') {
        try { value = document.querySelectorAll(step.count).length; } catch (error) { value = 0; }
        return next();
      }
      if (typeof step.requests === 'string') {
        value = backend ? backend.count(step.requests) : 0;
        return next();
      }
      if (typeof step.sent === 'string') {
        value = backend ? backend.sent(step.sent, typeof step.json === 'string' ? step.json : null) : null;
        return next();
      }
      if (typeof step.tap === 'string') {
        var tapped = find(step.tap);
        if (!tapped) { problem = 'Nothing on the page matches ' + step.tap; return Promise.resolve(); }
        tap(tapped);
        return settle(20).then(next);
      }
      var look = Object.keys(LOOKS).filter(function (kind) { return typeof step[kind] === 'string'; })[0];
      if (look) {
        var seen = find(step[look]);
        if (!seen) { problem = 'Nothing on the page matches ' + step[look]; return Promise.resolve(); }
        if (look === 'style') value = getComputedStyle(seen).getPropertyValue(String(step.property)).trim();
        else if (look === 'visible') value = visibility(seen);
        else if (look === 'hit') value = hitOf(seen);
        else if (look === 'overflows') value = seen.scrollWidth > seen.clientWidth + 1 ? 'overflows' : 'fits';
        else value = contrastOf(seen);
        return next();
      }
      return next();
    };
    return next().then(function () {
      post({ type: 'probe', id: probe.id, ok: problem === null, value: problem === null ? value : null, error: problem });
    });
  };
  /* What loading cost (chapter 6): the work counted and the server's time once the loaded page is quiet. */
  var loadWork = null;
  var loadClock = 0;
  window.addEventListener('load', function () {
    settle(30).then(function () {
      loadWork = workNow();
      loadClock = clock.now;
      post({ type: 'ready' });
      if (inspector) inspector.snapshot();
      if (!config.probes) return null;
      return config.probes.reduce(function (done, probe) {
        return done.then(function () { return runProbe(probe); });
      }, Promise.resolve()).then(function () { return wait(60); }).then(function () { post({ type: 'done' }); });
    });
  });
})`

/** The bridge as one line of JavaScript: a function expression that takes the config. */
export const BRIDGE_SOURCE = SOURCE.replace(/\s*\n\s*/g, ' ')
