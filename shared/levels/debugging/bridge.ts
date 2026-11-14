// The bridge: a small script that runs first inside the sealed frame, before anything of the level's own (docs/features/ui.md,
// "Sandbox and bridge"). It is the only way the frame talks to Grindstone: before any of the app's code can run it takes
// its own text off the page, keeps the browser's own functions it relies on, and hands the page two ports of its own (in
// its first message, with the load's token); everything else goes over those ports, and the port to the page lives
// only in the bridge's closure, so nothing in the frame (the app's code, the Console input) can post to the page as the
// bridge, or forge a check run's results. It posts plain data to the page and answers only what the page sends over its
// port. It
// - loads the level's modules from blob URLs made inside the frame (so they share its sealed origin) through an import map,
// - reports console calls, uncaught errors and unhandled rejections with their raw stacks (the page maps them to files),
// - runs a check run's probes once the app has loaded (scripted clicks, typing and pauses, then reads the page) and says
//   when it is done; the probes use only the browser's functions taken before the app ran and the config's own data, so
//   a built-in the app replaced or a property it put on a prototype can't change what they do or read,
// - evaluates Console input in the app's global scope,
// - keeps the app on its page (links do not navigate),
// - answers the app's `fetch` with the level's scripted backend (backend.ts) when it has one, inside the frame,
// - in levels with the Elements panel, answers the panel (inspector.ts): snapshots, matching rules, outline, pick mode,
// - in a recorded load (chapter 5), runs the recorder (recorder.ts) the instrumented modules report their steps to,
// - in a Performance level (chapter 6), watches what the app changes on the page and keeps the server's clock (answers
//   move it by their scripted delays); a recorded profile also reports the customer's actions to the counting recorder.
// It is JavaScript in a string, injected as one line (it never shifts index.html's lines), so it uses no line comments
// and ends every statement with a semicolon. Tested in a real browser: e2e/debugging-levels.spec.ts, and
// e2e/debugging-cheat.spec.ts (the app's code tries to post a check run's results itself).
import { BACKEND_SOURCE } from './backend'
import { INSPECTOR_SOURCE } from './inspector'
import { BRIDGE_HELLO } from './messages'
import { RECORDER_GLOBAL, RECORDER_SOURCE } from './recorder'

/** The longest pause a probe may take (`{ wait }`): a check run gives up after 5 s. */
export const MAX_PROBE_WAIT_MS = 2000

const SOURCE = String.raw`(function (config) {
  'use strict';

  /* First, before any of the app's code can run (the bridge is the first thing on the page): its own text (the config
     with the load's token) goes off the page, the browser's own functions it relies on are kept (the app's code may
     replace any built-in it can reach, later), and the page gets the two ports this load talks over. The port to the
     page lives only in this closure and is only used through the postMessage bound here, so no code in the frame can
     post to the page as the bridge; the port from the page is only read. */
  var script = document.currentScript;
  try { script.textContent = ''; } catch (error) { /* nothing to take off */ }
  var FP = Function.prototype;
  var uncurry = FP.bind.bind(FP.call);
  var createObject = Object.create;
  var keysOf = Object.keys;
  var describeProperty = Object.getOwnPropertyDescriptor;
  var protoOf = Object.getPrototypeOf;
  var isArray = Array.isArray;
  var isInstance = uncurry(FP[Symbol.hasInstance]);
  /* A property's getter or setter as a plain function of the object (from where the browser defines it); null: none. */
  var accessor = function (object, name, kind) {
    for (var at = object; at; at = protoOf(at)) {
      var found = describeProperty(at, name);
      if (found) return found[kind] ? uncurry(found[kind]) : null;
    }
    return null;
  };
  var getterOf = function (object, name) {
    return accessor(object, name, 'get') || function (target) { return target[name]; };
  };
  /* The config as data without prototypes: a property it lacks can't come from something the app put on Object.prototype. */
  var pure = function (value) {
    if (value === null || typeof value !== 'object') return value;
    var copy;
    var i;
    if (isArray(value)) {
      copy = [];
      for (i = 0; i < value.length; i++) copy[i] = pure(value[i]);
      return copy;
    }
    copy = createObject(null);
    var keys = keysOf(value);
    for (i = 0; i < keys.length; i++) copy[keys[i]] = pure(value[keys[i]]);
    return copy;
  };
  config = pure(config);

  var host = window.parent;
  var toPage = new MessageChannel();
  var fromPage = new MessageChannel();
  var send = toPage.port1.postMessage.bind(toPage.port1);
  host.postMessage({ type: '${BRIDGE_HELLO}', token: config.token }, '*', [toPage.port2, fromPage.port2]);
  /* Every message is a fresh object of plain data, never changed once made (no setter the app defines ever sees it). */
  var post = function (message) {
    try { send(message); } catch (error) { /* only plain data is posted; a value that can't be copied is lost */ }
  };

  /* The browser's own functions the probes, the page watch and the error reports use, taken before the app runs. */
  var win = window;
  var doc = document;
  var later = setTimeout;
  var globalEval = eval;
  var listen = uncurry(EventTarget.prototype.addEventListener);
  var dispatch = uncurry(EventTarget.prototype.dispatchEvent);
  var NativeEvent = Event;
  var NativeErrorEvent = ErrorEvent;
  var NativeMouseEvent = MouseEvent;
  var NativeKeyboardEvent = KeyboardEvent;
  var NativeInputEvent = typeof InputEvent === 'function' ? InputEvent : null;
  var NativeMutationObserver = typeof MutationObserver === 'function' ? MutationObserver : null;
  var mathMin = Math.min;
  var mathMax = Math.max;
  var mathPow = Math.pow;
  var mathRound = Math.round;
  var toNumber = parseFloat;
  var toText = String;
  var lowerCase = uncurry(String.prototype.toLowerCase);
  var sliceText = uncurry(String.prototype.slice);
  var execPattern = uncurry(RegExp.prototype.exec);
  var perfNow = uncurry(Performance.prototype.now);
  var timing = performance;
  var now = function () { return perfNow(timing); };
  var querySelector = uncurry(Document.prototype.querySelector);
  var querySelectorAll = uncurry(Document.prototype.querySelectorAll);
  var listLength = getterOf(NodeList.prototype, 'length');
  var textOf = getterOf(Node.prototype, 'textContent');
  var parentOf = getterOf(Node.prototype, 'parentElement');
  var nodeTypeOf = getterOf(Node.prototype, 'nodeType');
  var nodeDataOf = getterOf(CharacterData.prototype, 'data');
  var contains = uncurry(Node.prototype.contains);
  var tagOf = getterOf(Element.prototype, 'tagName');
  var idOf = getterOf(Element.prototype, 'id');
  var classesOf = getterOf(Element.prototype, 'classList');
  var tokenCount = getterOf(DOMTokenList.prototype, 'length');
  var rootOf = getterOf(Document.prototype, 'documentElement');
  var readyStateOf = getterOf(Document.prototype, 'readyState');
  var clientWidthOf = getterOf(Element.prototype, 'clientWidth');
  var scrollWidthOf = getterOf(Element.prototype, 'scrollWidth');
  var boxOf = uncurry(Element.prototype.getBoundingClientRect);
  var boxesOf = uncurry(Element.prototype.getClientRects);
  var sampleBox = boxOf(rootOf(doc));
  var boxLeft = getterOf(sampleBox, 'left');
  var boxTop = getterOf(sampleBox, 'top');
  var boxWidth = getterOf(sampleBox, 'width');
  var boxHeight = getterOf(sampleBox, 'height');
  var boxCount = getterOf(boxesOf(rootOf(doc)), 'length');
  var styleOf = win.getComputedStyle;
  var styleValue = uncurry(CSSStyleDeclaration.prototype.getPropertyValue);
  var scrollYOf = getterOf(win, 'scrollY');
  var innerHeightOf = getterOf(win, 'innerHeight');
  var scrollWindow = uncurry(win.scrollTo);
  var elementAt = uncurry(Document.prototype.elementFromPoint);
  var clickOn = uncurry(HTMLElement.prototype.click);
  var valueSetters = [accessor(HTMLInputElement.prototype, 'value', 'set'), accessor(HTMLTextAreaElement.prototype, 'value', 'set'), accessor(HTMLSelectElement.prototype, 'value', 'set')];
  var valueGetters = [accessor(HTMLInputElement.prototype, 'value', 'get'), accessor(HTMLTextAreaElement.prototype, 'value', 'get'), accessor(HTMLSelectElement.prototype, 'value', 'get')];
  var eventTargetOf = getterOf(NativeEvent.prototype, 'target');
  var errorOf = getterOf(NativeErrorEvent.prototype, 'error');
  var errorMessageOf = getterOf(NativeErrorEvent.prototype, 'message');
  var errorFileOf = getterOf(NativeErrorEvent.prototype, 'filename');
  var errorLineOf = getterOf(NativeErrorEvent.prototype, 'lineno');
  var errorColumnOf = getterOf(NativeErrorEvent.prototype, 'colno');
  var reasonOf = typeof PromiseRejectionEvent === 'function' ? getterOf(PromiseRejectionEvent.prototype, 'reason') : function (event) { return event.reason; };
  var records = NativeMutationObserver ? MutationRecord.prototype : null;
  var recordTypeOf = records ? getterOf(records, 'type') : null;
  var recordTargetOf = records ? getterOf(records, 'target') : null;
  var recordAddedOf = records ? getterOf(records, 'addedNodes') : null;
  var recordRemovedOf = records ? getterOf(records, 'removedNodes') : null;
  var takeRecordsOf = NativeMutationObserver ? uncurry(NativeMutationObserver.prototype.takeRecords) : null;
  var observeWith = NativeMutationObserver ? uncurry(NativeMutationObserver.prototype.observe) : null;
  /* A listener the bridge sets now, capturing on the window: it runs before any the app sets, which can't stop it. */
  var onWindow = function (type, listener) { listen(win, type, listener, true); };
  /* An object without a prototype for the browser to read (an event's init, scroll options): no member of it comes from the app. */
  var fields = function (names, values) {
    var made = createObject(null);
    for (var i = 0; i < names.length; i++) made[names[i]] = values[i];
    return made;
  };

  /* Text helpers that use no built-in the app could have replaced. */
  var SPACE = /^\s$/;
  var isSpace = function (character) { return execPattern(SPACE, character) !== null; };
  /* Whitespace collapsed to one space and none at either end (what .replace(/\s+/g, ' ').trim() gives). */
  var squash = function (text) {
    var out = '';
    var gap = false;
    for (var i = 0; i < text.length; i++) {
      var character = text[i];
      if (isSpace(character)) {
        gap = out !== '';
        continue;
      }
      if (gap) out += ' ';
      gap = false;
      out += character;
    }
    return out;
  };
  var trimText = function (text) {
    var from = 0;
    var to = text.length;
    while (from < to && isSpace(text[from])) from++;
    while (to > from && isSpace(text[to - 1])) to--;
    return sliceText(text, from, to);
  };
  var hasText = function (text) {
    for (var i = 0; i < text.length; i++) if (!isSpace(text[i])) return true;
    return false;
  };
  var wait = function (ms, then) { later(then, ms); };
  var probes = config.probes;

  /* What the Console shows for a value: one short line, like the browser's own preview. */
  var quote = function (text) {
    return "'" + text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
  };
  var describe = function (element) {
    var text = lowerCase(tagOf(element));
    var id = idOf(element);
    if (id) text += '#' + id;
    var classes = classesOf(element);
    for (var i = 0, count = classes ? tokenCount(classes) : 0; i < count; i++) text += '.' + classes[i];
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
     its request went out plus its scripted delay, so the same run reads the same times in every browser. A check run
     keeps the changes (by number, without a prototype) for its changes probes. */
  var perf = config.perf || null;
  var recorder = null;
  var clock = { now: 0, times: createObject(null), count: 0, active: 0 };
  var domLog = createObject(null);
  var domBase = 0;
  var domEnd = 0;
  var watcher = null;
  var lateDom = null;
  var noChanges = function () { return fields(['length'], [0]); };
  var visibleNode = function (node) {
    var type = nodeTypeOf(node);
    return type === 1 || (type === 3 && hasText(nodeDataOf(node)));
  };
  var countNodes = function (list) {
    var n = 0;
    for (var i = 0, length = listLength(list); i < length; i++) if (visibleNode(list[i])) n++;
    return n;
  };
  var logDom = function (changes) {
    var counts = noChanges();
    for (var i = 0; i < changes.length; i++) {
      var record = changes[i];
      var nodes = recordTypeOf(record) === 'childList' ? countNodes(recordAddedOf(record)) + countNodes(recordRemovedOf(record)) : 1;
      if (!nodes) continue;
      counts[counts.length] = nodes;
      counts.length += 1;
      if (!probes) continue;
      var list = recordAddedOf(record);
      var added = fields(['length'], [mathMin(listLength(list), 20)]);
      for (var j = 0; j < added.length; j++) added[j] = list[j];
      domLog[domEnd] = fields(['target', 'added', 'nodes'], [recordTargetOf(record), added, nodes]);
      domEnd += 1;
    }
    while (domEnd - domBase > 20000) {
      delete domLog[domBase];
      domBase += 1;
    }
    return counts;
  };
  var takeDom = function () { return watcher ? logDom(takeRecordsOf(watcher)) : noChanges(); };
  /* A look from the bridge's side (a probe): what changed is logged, and counted for the statement that made it. */
  var takeAll = function () {
    var counts = takeDom();
    if (lateDom) lateDom(counts);
  };
  if (perf && NativeMutationObserver) {
    var watch = function () {
      if (watcher || readyStateOf(doc) === 'loading') return;
      watcher = new NativeMutationObserver(function (changes) {
        var counts = logDom(changes);
        if (lateDom) lateDom(counts);
      });
      observeWith(watcher, doc, fields(['childList', 'subtree', 'attributes', 'characterData'], [true, true, true, true]));
    };
    watch();
    onWindow('readystatechange', watch);
  }
  var sentAt = function (id, delay) {
    clock.active = now();
    if (clock.count < 200) {
      clock.count += 1;
      clock.times[id] = [clock.now, -1, delay];
    }
    if (recorder && recorder.request) recorder.request(id);
  };
  var arrivedAt = function (id) {
    clock.active = now();
    var times = clock.times[id];
    if (!times) return;
    times[1] = times[0] + times[2];
    if (times[1] > clock.now) clock.now = times[1];
  };
  var abortedAt = function (id) {
    clock.active = now();
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
      now: now,
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
    ['click', 'input', 'change', 'keydown', 'submit'].forEach(function (type) { onWindow(type, onAction); });
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
  script.after(map);
  /* What Grindstone put on the page (the base, the policy, the bridge, the import map): never shown in the Elements panel. */
  var own = [script, map, document.querySelector('base'), document.querySelector('meta[http-equiv]')];

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

  /* Uncaught errors (with the error's own stack, or where a syntax error was found) and files that failed to load. The
     listeners are the first on the window and read the events through the browser's own getters, so the app's code
     can't keep an uncaught error from being reported. */
  /* An error's fields read without trusting it: the app may have planted a getter (or a toString) that throws, which
     must never stop the error from being reported. */
  function safeField(value, key) {
    try {
      var field = value[key];
      return field === undefined || field === null ? null : String(field);
    } catch (failed) {
      return null;
    }
  }

  onWindow('error', function (event) {
    if (!isInstance(NativeErrorEvent, event)) {
      var tag = null;
      try {
        var target = eventTargetOf(event);
        tag = target && target !== win && nodeTypeOf(target) === 1 ? tagOf(target) : null;
      } catch (error) { tag = null; }
      if (tag) post({ type: 'error', kind: 'error', name: null, message: tag === 'LINK' ? 'Failed to load stylesheet' : 'Failed to load module script', stack: null, url: null, line: null, column: null });
      return;
    }
    var error = errorOf(event);
    var known = error && typeof error === 'object';
    var message = errorMessageOf(event);
    var name = known ? safeField(error, 'name') : null;
    var text = known ? safeField(error, 'message') : null;
    post({
      type: 'error',
      kind: 'error',
      name: name || null,
      message: text !== null ? text : String(message || '').replace(/^Uncaught /, ''),
      stack: known ? safeField(error, 'stack') || null : null,
      url: errorFileOf(event) || null,
      line: errorLineOf(event) || null,
      column: errorColumnOf(event) || null
    });
  });
  onWindow('unhandledrejection', function (event) {
    var reason = reasonOf(event);
    var isError = false;
    try { isError = reason instanceof Error; } catch (failed) { isError = false; }
    var text = isError ? safeField(reason, 'message') : null;
    var shown = '';
    if (!isError) { try { shown = preview(reason, false); } catch (failed) { shown = 'a value that could not be shown'; } }
    post({ type: 'error', kind: 'rejection', name: isError ? safeField(reason, 'name') : null, message: isError ? (text !== null ? text : '') : shown, stack: isError ? safeField(reason, 'stack') : null, url: null, line: null, column: null });
  });
  onWindow('securitypolicyviolation', function (event) {
    if (event.blockedURI === 'inline' || event.blockedURI === 'eval') return;
    post({ type: 'console', level: 'error', args: ["Refused to load '" + event.blockedURI + "': the practice app runs in a sealed frame without network."], stack: '' });
  });

  /* The app stays on its page: a link does not navigate the frame away. */
  onWindow('click', function (event) {
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (link && (link.getAttribute('href') || '').charAt(0) !== '#') event.preventDefault();
  });

  /* The fake backend (ADR 0007, chapter 2): a level with one gets every fetch answered here, from its scripted routes;
     it posts each request and answer (the Network panel) and the browser's lines for failed ones. Without one, requests
     go on to the network, which the frame's Content-Security-Policy refuses (connect-src 'none'). */
  var backend = config.backend
    ? (${BACKEND_SOURCE})(config.backend, {
        post: post,
        now: now,
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
  var idle = function (left, then) {
    if (!backend || left <= 0) return then();
    if (backend.pending() === 0 && (!perf || now() - clock.active >= 50)) return then();
    wait(10, function () { idle(left - 10, then); });
  };
  var settle = function (ms, then) {
    wait(ms, function () {
      idle(3000, function () {
        if (backend) wait(20, then);
        else then();
      });
    });
  };

  /* The Elements panel (chapter 3), in levels that use it: snapshots, matching rules, the outline and pick mode. */
  var inspector = config.elements ? (${INSPECTOR_SOURCE})(config.elements, { post: post, describe: describe, own: own }) : null;

  /* Messages from the page, over its own port: Console input, the Elements panel's requests and the Debugger's Stop. */
  var messageData = getterOf(MessageEvent.prototype, 'data');
  fromPage.port1.onmessage = function (event) {
    var data = messageData(event);
    if (!data || typeof data !== 'object') return;
    if (inspector && data.type === 'dom') { inspector.snapshot(); return; }
    if (inspector && data.type === 'inspect' && typeof data.node === 'number' && typeof data.seq === 'number') { inspector.inspect(data.node, data.seq); return; }
    if (inspector && data.type === 'highlight' && typeof data.node === 'number') { inspector.highlight(data.node); return; }
    if (inspector && data.type === 'pick') { inspector.pick(data.on === true); return; }
    if (recorder && data.type === 'recordStop') { recorder.stop('stopped'); return; }
    if (data.type === 'eval' && typeof data.code === 'string') evaluate(data);
  };

  /* Console input: evaluated in the app's global scope; an object literal works as in DevTools, and so does a top-level
     await (await fetch('/api/menu')): the input runs in an async function and the Console shows what it settles to. A
     trailing semicolon is dropped first, so it stays an expression. One declaration of one name (const total = await …)
     defines it for later inputs, as a property of the window (the Console shows undefined, like DevTools). */
  var DECLARATION = /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]*?)\s*;?\s*$/;
  var asExpression = function (code) { return (0, globalEval)('(async () => (' + code + '\n))()'); };
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
      return (0, globalEval)('(async () => {' + code + '\n})()');
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
      value = literal ? (0, globalEval)('(' + code + ')') : (0, globalEval)(code);
    } catch (first) {
      if (first instanceof SyntaxError && /\bawait\b/.test(code)) {
        var running;
        try { running = awaited(code); } catch (error) { fail(first); return; }
        running.then(done, fail);
        return;
      }
      if (!literal || !(first instanceof SyntaxError)) { fail(first); return; }
      try { value = (0, globalEval)(code); } catch (error) { fail(error); return; }
    }
    done(value);
  };

  /* A check run: once the app has loaded, each probe clicks and reads like a customer, then the run is done. From here
     on only the functions taken above, the config's own data and callbacks on the kept timer (no promise, no array
     method), so nothing the app's code changed in the frame's built-ins changes which probes run, what they do or read,
     or when the run is done. */
  var find = function (selector) {
    try { return querySelector(doc, selector); } catch (error) { return null; }
  };
  /* A click as element.click() does it; an element without click() (SVG) gets the event. */
  var press = function (element, point) {
    try { clickOn(element); } catch (error) {
      dispatch(element, new NativeMouseEvent('click', fields(['bubbles', 'cancelable', 'view', 'clientX', 'clientY'], [true, true, win, point ? point.x : 0, point ? point.y : 0])));
    }
  };

  /* Layout probes (chapter 3): what a customer can see and tap, from the browser's own layout. */
  var scrollTo = function (top) {
    try { scrollWindow(win, fields(['top', 'left', 'behavior'], [top, 0, 'instant'])); } catch (error) { scrollWindow(win, 0, top); }
  };
  /* The centre of an element, scrolled into view vertically only (sideways is where a too wide layout hides things); null without a box. */
  var centre = function (element) {
    var rect = boxOf(element);
    if (!boxCount(boxesOf(element)) || boxWidth(rect) < 1 || boxHeight(rect) < 1) return null;
    scrollTo(scrollYOf(win) + boxTop(rect) + boxHeight(rect) / 2 - innerHeightOf(win) / 2);
    rect = boxOf(element);
    return { x: boxLeft(rect) + boxWidth(rect) / 2, y: boxTop(rect) + boxHeight(rect) / 2 };
  };
  var onScreen = function (point) { return point.x >= 0 && point.x < clientWidthOf(rootOf(doc)) && point.y >= 0 && point.y < innerHeightOf(win); };
  var styleOfNode = function (node, property) { return styleValue(styleOf(node), property); };
  var isElement = function (node) { return !!node && nodeTypeOf(node) === 1; };
  var visibility = function (element) {
    var node;
    for (node = element; isElement(node); node = parentOf(node)) {
      if (styleOfNode(node, 'display') === 'none') return node === element ? 'display: none' : 'display: none on ' + describe(node);
    }
    var hidden = styleOfNode(element, 'visibility');
    if (hidden !== 'visible') return 'visibility: ' + hidden;
    for (node = element; isElement(node); node = parentOf(node)) {
      if (toNumber(styleOfNode(node, 'opacity')) === 0) return node === element ? 'opacity: 0' : 'opacity: 0 on ' + describe(node);
    }
    var point = centre(element);
    if (!point) return 'no size';
    return onScreen(point) ? 'visible' : 'off screen';
  };
  var hitOf = function (element) {
    var point = centre(element);
    if (!point) return 'no box';
    if (!onScreen(point)) return 'off screen';
    var top = elementAt(doc, point.x, point.y);
    if (!top) return 'nothing';
    return top === element || contains(element, top) ? 'itself' : describe(top);
  };
  var tap = function (element) {
    var point = centre(element);
    var top = point && onScreen(point) ? elementAt(doc, point.x, point.y) : null;
    if (top) press(top, point);
  };
  var RGBA = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/;
  var rgba = function (text) {
    var match = execPattern(RGBA, text);
    if (!match) return null;
    var alpha = match[4] === undefined ? 1 : toNumber(match[4]) / (match[5] ? 100 : 1);
    return [toNumber(match[1]), toNumber(match[2]), toNumber(match[3]), alpha];
  };
  var over = function (top, below) {
    var a = top[3];
    return [top[0] * a + below[0] * (1 - a), top[1] * a + below[1] * (1 - a), top[2] * a + below[2] * (1 - a), 1];
  };
  var channel = function (value) {
    value /= 255;
    return value <= 0.03928 ? value / 12.92 : mathPow((value + 0.055) / 1.055, 2.4);
  };
  var luminance = function (colour) { return 0.2126 * channel(colour[0]) + 0.7152 * channel(colour[1]) + 0.0722 * channel(colour[2]); };
  /* The text's colour against what is behind it: the backgrounds of the element and its ancestors over a white page. */
  var contrastOf = function (element) {
    var layers = createObject(null);
    var count = 0;
    for (var node = element; isElement(node); node = parentOf(node)) layers[count++] = styleOfNode(node, 'background-color');
    var ground = [255, 255, 255, 1];
    for (var i = count - 1; i >= 0; i--) {
      var colour = rgba(layers[i]);
      if (!colour) return null;
      ground = over(colour, ground);
    }
    var text = rgba(styleOfNode(element, 'color'));
    if (!text) return null;
    var a = luminance(over(text, ground));
    var b = luminance(ground);
    return mathRound((mathMax(a, b) + 0.05) / (mathMin(a, b) + 0.05) * 100) / 100;
  };
  /* A field's value through its own setter (an input, a text area, a select); anything else gets a property, as before. */
  var setValue = function (field, value) {
    for (var i = 0; i < 3; i++) {
      if (!valueSetters[i]) continue;
      try { valueSetters[i](field, value); return; } catch (error) { /* not this kind of field */ }
    }
    field.value = value;
  };
  var valueOf = function (field) {
    for (var i = 0; i < 3; i++) {
      if (!valueGetters[i]) continue;
      try { return valueGetters[i](field); } catch (error) { /* not this kind of field */ }
    }
    return field.value;
  };
  var inputEvent = function (data) {
    if (NativeInputEvent) {
      try { return new NativeInputEvent('input', fields(['bubbles', 'inputType', 'data'], [true, 'insertText', data])); } catch (error) { /* an old browser */ }
    }
    return new NativeEvent('input', fields(['bubbles'], [true]));
  };
  var changeEvent = function () { return new NativeEvent('change', fields(['bubbles'], [true])); };
  /* Typing, as a customer does it: the field gets the whole value at once, then input and change. It never takes the
     focus: a check run must not take the keyboard from Grindstone (Firefox lets a script in a sealed frame do that). */
  var typeInto = function (field, value) {
    setValue(field, value);
    dispatch(field, inputEvent(value));
    dispatch(field, changeEvent());
  };
  /* A key event (true: nothing prevented it). */
  var keyEvent = function (target, type, key) {
    return dispatch(target, new NativeKeyboardEvent(type, fields(['key', 'bubbles', 'cancelable'], [key, true, true])));
  };
  /* One letter as a customer types it: keydown, the letter in the field with an input event (unless the keydown was
     prevented), keyup. Never the focus, never a change. */
  var typeLetter = function (field, letter) {
    if (keyEvent(field, 'keydown', letter)) {
      var current = valueOf(field);
      setValue(field, (typeof current === 'string' ? current : '') + letter);
      dispatch(field, inputEvent(letter));
    }
    keyEvent(field, 'keyup', letter);
  };
  var LOOKS = ['style', 'visible', 'hit', 'overflows', 'contrast'];
  /* One probe: its steps in order, then its result is posted and the run goes on (callbacks only, no promises). */
  var runProbe = function (probe, then) {
    var value = null;
    var problem = null;
    var steps = probe.steps;
    var at = 0;
    takeAll();
    /* where the page's changes, the server's clock and the work were when this probe started */
    var startDom = domEnd;
    var startClock = clock.now;
    var startWork = workNow();
    var finish = function () {
      post({ type: 'probe', id: probe.id, ok: problem === null, value: problem === null ? value : null, error: problem });
      then();
    };
    var fail = function (text) {
      problem = text;
      finish();
    };
    var missing = function (selector) { fail('Nothing on the page matches ' + selector); };
    var next = function () {
      if (problem !== null || at >= steps.length) return finish();
      var step = steps[at];
      at += 1;
      if (typeof step.keys === 'string') {
        var typed = find(step.keys);
        if (!typed) return missing(step.keys);
        var letters = toText(step.value);
        var letterAt = 0;
        var gap = mathMin(mathMax(typeof step.gap === 'number' ? step.gap : 80, 0), ${MAX_PROBE_WAIT_MS});
        var typeOn = function () {
          if (letterAt >= letters.length) return next();
          typeLetter(typed, letters[letterAt]);
          letterAt += 1;
          wait(gap, typeOn);
        };
        return typeOn();
      }
      if (typeof step.press === 'string') {
        var pressed = find(step.press);
        if (!pressed) return missing(step.press);
        var key = toText(step.key);
        /* Enter in a text field commits it, as in the browser: a change (no form is submitted in a sealed frame) */
        if (keyEvent(pressed, 'keydown', key) && key === 'Enter' && tagOf(pressed) === 'INPUT') dispatch(pressed, changeEvent());
        keyEvent(pressed, 'keyup', key);
        return wait(20, next);
      }
      if (typeof step.changes === 'string') {
        if (!perf) return fail('The page is not watched in this run');
        takeAll();
        var area = find(step.changes);
        if (!area) return missing(step.changes);
        var changed = 0;
        for (var index = mathMax(startDom, domBase); index < domEnd; index++) {
          var entry = domLog[index];
          var inside = contains(area, entry.target);
          for (var k = 0; !inside && k < entry.added.length; k++) inside = contains(entry.added[k], area);
          if (inside) changed += entry.nodes;
        }
        value = changed;
        return next();
      }
      if (typeof step.work === 'string') {
        var counted = workNow();
        var from = step.work === 'load' ? 0 : startWork;
        var upTo = step.work === 'load' ? loadWork : counted;
        if (counted === null) return fail('The app\'s work is not counted in this run');
        if (counted < 0 || from < 0 || upTo < 0) return fail('The app did more work than is counted: counting stopped');
        value = upTo - from;
        return next();
      }
      if (typeof step.waited === 'string') {
        if (!perf) return fail('The server\'s time is not kept in this run');
        value = step.waited === 'load' ? loadClock : clock.now - startClock;
        return next();
      }
      if (typeof step.click === 'string') {
        var target = find(step.click);
        if (!target) return missing(step.click);
        for (var times = mathMin(mathMax(step.times || 1, 1), 10); times > 0; times--) press(target, null);
        return step.settle === false ? wait(20, next) : settle(20, next);
      }
      if (typeof step.type === 'string') {
        var field = find(step.type);
        if (!field) return missing(step.type);
        typeInto(field, toText(step.value));
        return wait(20, next);
      }
      if (typeof step.wait === 'number') return wait(mathMin(mathMax(step.wait, 0), ${MAX_PROBE_WAIT_MS}), next);
      if (step.settle === true) return settle(20, next);
      if (typeof step.text === 'string') {
        var element = find(step.text);
        if (!element) return missing(step.text);
        value = squash(textOf(element) || '');
        return next();
      }
      if (typeof step.count === 'string') {
        try { value = listLength(querySelectorAll(doc, step.count)); } catch (error) { value = 0; }
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
        if (!tapped) return missing(step.tap);
        tap(tapped);
        return settle(20, next);
      }
      for (var l = 0; l < LOOKS.length; l++) {
        var look = LOOKS[l];
        if (typeof step[look] !== 'string') continue;
        var seen = find(step[look]);
        if (!seen) return missing(step[look]);
        if (look === 'style') value = trimText(styleOfNode(seen, toText(step.property)));
        else if (look === 'visible') value = visibility(seen);
        else if (look === 'hit') value = hitOf(seen);
        else if (look === 'overflows') value = scrollWidthOf(seen) > clientWidthOf(seen) + 1 ? 'overflows' : 'fits';
        else value = contrastOf(seen);
        return next();
      }
      return next();
    };
    next();
  };
  /* Every probe in turn, then (a moment later, for what the last one set off) the run is done. */
  var runProbes = function (index) {
    if (index >= probes.length) return wait(60, function () { post({ type: 'done' }); });
    runProbe(probes[index], function () { runProbes(index + 1); });
  };
  /* What loading cost (chapter 6): the work counted and the server's time once the loaded page is quiet. Only the
     browser's own load event starts the probes, once. */
  var loadWork = null;
  var loadClock = 0;
  var loaded = false;
  onWindow('load', function (event) {
    if (loaded || event.isTrusted !== true) return;
    loaded = true;
    settle(30, function () {
      loadWork = workNow();
      loadClock = clock.now;
      post({ type: 'ready' });
      if (inspector) inspector.snapshot();
      if (probes) runProbes(0);
    });
  });
})`

/** The bridge as one line of JavaScript: a function expression that takes the config. */
export const BRIDGE_SOURCE = SOURCE.replace(/\s*\n\s*/g, ' ')
