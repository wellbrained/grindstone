// The bridge: a small script that runs first inside the sealed frame, before the level's own code (docs/features/ui.md,
// "Sandbox and bridge"). It is the only way the frame talks to Grindstone: it posts plain data to the parent page and
// answers only the parent's Console input. It
// - loads the level's modules from blob URLs made inside the frame (so they share its sealed origin) through an import map,
// - reports console calls, uncaught errors and unhandled rejections with their raw stacks (the page maps them to files),
// - runs a check run's probes once the app has loaded (scripted clicks, then reads the page) and says when it is done,
// - evaluates Console input in the app's global scope,
// - keeps the app on its page (links do not navigate) and holds the hook for the fake backend (fetch).
// It is JavaScript in a string, injected as one line (it never shifts index.html's lines), so it uses no line comments
// and ends every statement with a semicolon. Tested in a real browser: e2e/debugging-levels.spec.ts.

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

  /* The fake backend (ADR 0007, chapter 2) answers here: config.backend will hold the level's scripted answers and
     answer() turn a request into a Response (data, an error status, a delay). Chapter 1 has none, so requests go on to
     the network, which the frame's Content-Security-Policy refuses (connect-src 'none'). */
  var realFetch = window.fetch;
  var answer = function () { return null; };
  window.fetch = function (input, init) {
    var answered = config.backend ? answer(input, init, config.backend) : null;
    return answered || realFetch.apply(window, arguments);
  };

  /* Console input from the page: evaluated in the app's global scope; an object literal works as in DevTools. */
  window.addEventListener('message', function (event) {
    if (event.source !== host) return;
    var data = event.data;
    if (!data || data.grindstone !== token || data.type !== 'eval' || typeof data.code !== 'string') return;
    var code = data.code;
    var trimmed = code.trim();
    var literal = trimmed.charAt(0) === '{' && trimmed.charAt(trimmed.length - 1) === '}';
    var fail = function (error) {
      var isError = error instanceof Error;
      post({ type: 'result', id: data.id, ok: false, name: isError ? error.name : null, message: isError ? error.message : preview(error, false), stack: isError && error.stack ? String(error.stack) : null });
    };
    var value;
    try {
      value = literal ? (0, eval)('(' + code + ')') : (0, eval)(code);
    } catch (first) {
      if (!literal || !(first instanceof SyntaxError)) { fail(first); return; }
      try { value = (0, eval)(code); } catch (error) { fail(error); return; }
    }
    post({ type: 'result', id: data.id, ok: true, value: preview(value, false) });
  });

  /* A check run: once the app has loaded, each probe clicks and reads like a customer, then the run is done. */
  var find = function (selector) {
    try { return document.querySelector(selector); } catch (error) { return null; }
  };
  var runProbe = function (probe) {
    var value = null;
    var problem = null;
    var steps = probe.steps.slice();
    var next = function () {
      if (problem !== null || !steps.length) return Promise.resolve();
      var step = steps.shift();
      if (typeof step.click === 'string') {
        var target = find(step.click);
        if (!target) { problem = 'Nothing on the page matches ' + step.click; return Promise.resolve(); }
        target.click();
        return wait(20).then(next);
      }
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
      return next();
    };
    return next().then(function () {
      post({ type: 'probe', id: probe.id, ok: problem === null, value: problem === null ? value : null, error: problem });
    });
  };
  window.addEventListener('load', function () {
    wait(30).then(function () {
      post({ type: 'ready' });
      if (!config.probes) return null;
      return config.probes.reduce(function (done, probe) {
        return done.then(function () { return runProbe(probe); });
      }, Promise.resolve()).then(function () { return wait(60); }).then(function () { post({ type: 'done' }); });
    });
  });
})`

/** The bridge as one line of JavaScript: a function expression that takes the config. */
export const BRIDGE_SOURCE = SOURCE.replace(/\s*\n\s*/g, ' ')
