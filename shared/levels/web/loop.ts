// The event loop of Web fundamentals' chapter 5 (ADR 0009; docs/features/levels.md "The event loop model"): how a browser
// orders the page's work, as the HTML standard's event loop has it and Chrome does it, run inside the sealed frame.
//
// Real where the browser's order is already the same everywhere, scripted where it is not:
// - **Microtasks are the browser's own**: Promise reactions, `await`, `queueMicrotask` and MutationObserver callbacks
//   run in the engine's real microtask checkpoint, which every engine runs by the same rules.
// - **Tasks and frames run on a scripted clock**: `setTimeout`/`setInterval` (with the standard's clamp: nested more than
//   five deep, at least 4 ms), `requestAnimationFrame`, `MessageChannel` and `window.postMessage`, and a customer's tap.
//   A frame comes every 16 ms of that clock, when something needs painting: its rAF callbacks, then style, layout and
//   paint (the browser's real style and layout, forced at that moment, so CSS transitions start as they would). Real
//   time is never read: a hidden check frame, Firefox and Safari all order the same work the same way.
// - **Each unit of work is its own callback of one real event**: a private MessagePort with many listeners; the browser
//   runs the microtasks after each listener (it dispatched the event), and nothing renders in the middle of one event,
//   so the real style is only computed where the model says (a frame, or the page forcing it).
// - **A customer's tap** is dispatched as the browser does it, listener by listener with a microtask checkpoint after
//   each; `element.click()` from the page's code stays the browser's own (no checkpoint in between).
// - **Forced layouts are counted**: reading a size or position (offsetHeight, getBoundingClientRect, a computed size …)
//   after the page changed (a MutationObserver record since the last layout) is one.
// - **The app you see runs like the check run**: its batches run in native requestAnimationFrame callbacks (each gets
//   the browser's microtask checkpoint, all before the real frame's style), up to and including one model frame per real
//   frame, so the browser never works out a style the model says nobody worked out.
// - **The clock moves only by work**: each unit takes 10 µs, and each read of the clock (performance.now(), Date) another
//   10 µs, so code that waits on the clock (`busy(900)`, a stand-in for real work) takes that long on it.
//
// LOOP_SOURCE is JavaScript in a string (like the web backend): the bridge runs it in the frame before any of the app's
// code, and the unit tests run it on Node with a fake window. Hardened like the cookie jar: every built-in taken when it
// is made, its records objects without a prototype, lists written by index on objects without a prototype, what goes to
// the page built whole.
import { WEB_CLOCK } from './cookies'
import { SCRIPTED_DATE_SOURCE, SCRIPTED_TIME_SOURCE } from './server'

/** An element a frame's snapshot looks at: is it painted (displayed, visible, with a box), and its text. */
export interface LoopWatch {
  selector: string
  /** Its name in the Event loop panel and the probes ('spinner', 'status'). */
  name: string
  /** The snapshot says its text too ('status: Thank you!'). */
  text?: boolean
  /** Each frame also keeps its computed opacity (the `faded` probe: a fade someone can see). */
  opacity?: boolean
  /**
   * Every element that matches, not only the first (with `opacity`; never in the frame's items): the `faded` probe
   * follows each one that appears after the tap, so a decoy can't stand in for the toast Lena sees.
   */
  all?: boolean
}

/** Chapter 5: the page's work runs on the modelled event loop (`sandbox.web.loop`). */
export interface LoopSpec {
  /** What each painted frame records (the Event loop panel shows it; `painted` probes read it). */
  watch: readonly LoopWatch[]
}

/**
 * The model's numbers: a frame every 16 ms (a 60 Hz screen, rounded), 10 µs per unit of work and per read of the clock,
 * a tap 5 ms after a frame; per load at most 20,000 units of work and 2,000 pending tasks (then the loop stops: something
 * keeps queueing work), 1,000 entries for the panel, 2,000 frames and 500 animations followed; a tap lets the page run on
 * for 500 ms, a load until it is quiet (at most 1 s), a settle at most 2 s; 256 units per real event in a check run,
 * 1,024 rAF callbacks a real frame in the app you see; times on the panel at most 1e9 ms; a fade is seen when an element
 * first painted at an opacity of at most 0.05 shows one between 0.05 and 0.95, then (96 ms or more after its first
 * frame) a whole one.
 */
export const LOOP_LIMITS = {
  frameUs: 16_000,
  unitUs: 10,
  tapUs: 5000,
  units: 20_000,
  pending: 2000,
  animations: 500,
  entries: 1000,
  frames: 2000,
  stacks: 600,
  text: 300,
  watchText: 80,
  batch: 256,
  visibleBatch: 1024,
  tapMs: 500,
  loadMs: 1000,
  settleMs: 2000,
  maxAt: 1e9,
  fadeLow: 0.05,
  fadeHigh: 0.95,
  fadeMs: 96
} as const

/** What the frame gets. */
export interface LoopConfig {
  watch: { selector: string, name: string, text: boolean, opacity: boolean, all: boolean }[]
  /** The global the page's module script calls when its synchronous part is over (null: none). */
  marker: string | null
  /** The scripted clock the page's Date starts at. */
  clock: number
  limits: typeof LOOP_LIMITS
}

/** The level's loop as plain data (throws for what a level cannot mean). */
export function loopConfig(spec: LoopSpec, marker: string | null): LoopConfig {
  const names = new Set<string>()
  const watch = spec.watch.map((each) => {
    if (!/^[a-z][a-z0-9-]*$/.test(each.name)) throw new Error(`${each.name}: a watched element's name is lower case letters, digits and dashes`)
    if (names.has(each.name)) throw new Error(`${each.name}: watched twice`)
    names.add(each.name)
    if (!each.selector.trim()) throw new Error(`${each.name}: no selector`)
    if (each.all && (!each.opacity || each.text)) throw new Error(`${each.name}: a watch of every match keeps opacities only`)
    return { selector: each.selector, name: each.name, text: each.text === true, opacity: each.opacity === true, all: each.all === true }
  })
  if (watch.length > 12) throw new Error('a frame watches at most 12 elements')
  if (marker !== null && !/^[A-Za-z_$][\w$]*$/.test(marker)) throw new Error(`${marker} is no name`)
  return { watch, marker, clock: WEB_CLOCK, limits: LOOP_LIMITS }
}

/** What ran, as the Event loop panel lists it. */
export type LoopEntryKind = 'task' | 'listener' | 'callback' | 'render' | 'layout' | 'log' | 'note'

/** Where a task came from (`source` of a task). */
export type LoopTaskSource = 'script' | 'timeout' | 'interval' | 'message' | 'tap' | 'event' | 'console'

export interface LoopEntry {
  kind: LoopEntryKind
  /** When, on the scripted clock: ms since the page loaded (two decimals). */
  at: number
  /**
   * A task: where it came from (LoopTaskSource); a log: 'sync' (in the task, listener or callback itself) or 'microtask'
   * (after it, in the microtask checkpoint); a note: why ('units', 'tasks': the loop stopped; 'entries', 'animations':
   * no more are listed or followed); else ''.
   */
  source: string
  /** What ran, as code: 'setTimeout(tick, 0)', 'click', 'requestAnimationFrame(show)', 'offsetHeight', a log's text. */
  text: string
  /** What it ran on ('button#place', 'document', 'window', 'a MessageChannel port'); a log: its console level; else ''. */
  target: string
  /** A timer: the delay it asked for; a frame: its number; a forced layout: how many in a row; else 0. */
  count: number
  /** A timer that waited 4 ms because it was nested more than five deep. */
  clamped: boolean
  /** A frame: what it painted of the watched elements ('spinner', 'status: Thank you! …'). */
  painted: string[]
  /** A frame: the transitions and animations that started in it ('p.toast.visible opacity'). */
  started: string[]
  /** Where it was set up: the call that queued it, the listener's registration, the read that forced the layout (a raw stack). */
  stack: string | null
}

/** What a run shows of the loop, as the predictions' facts and the tests read it. */
export interface LoopFacts {
  /** Every painted item of every frame, in order. */
  painted: string[]
  /** Each forced layout, by the read that forced it, in order (`offsetHeight` 40 times). */
  forced: string[]
  /** Each transition or animation that started, in order ('p.toast.visible opacity'). */
  animated: string[]
  frames: number
}

/** The facts of a run's timeline. */
export function loopFacts(entries: readonly LoopEntry[]): LoopFacts {
  const facts: LoopFacts = { painted: [], forced: [], animated: [], frames: 0 }
  for (const entry of entries) {
    if (entry.kind === 'render') {
      facts.frames += 1
      facts.painted.push(...entry.painted)
      facts.animated.push(...entry.started)
    } else if (entry.kind === 'layout') {
      for (let i = 0; i < entry.count; i++) facts.forced.push(entry.text)
    }
  }
  return facts
}

/** A name for the global the page's script calls when it is done (a fresh one per load, so the page can't know it ahead). */
export function loopMarker(): string {
  const words = globalThis.crypto.getRandomValues(new Uint32Array(2))
  return `__gsScriptDone${words[0]!.toString(36)}${words[1]!.toString(36)}`
}

// Runs inside the frame as part of the bridge (one line: block comments only, every statement ends with a semicolon), and
// in the unit tests. `hooks`: `win` (the window it installs on), `post` (to the page), `check` (a check run: the loop
// moves only while a probe drives it; else it runs on by itself, paced to real time), `describe(element)`, `squash(text)`,
// `hit(element)` (where a finger lands on it: [element on top, x, y] or null), and in the tests `batch(count, unit)` in
// place of the private port (each unit in a macrotask of its own).
export const LOOP_SOURCE = String.raw`(function (config, hooks) {
  'use strict';
  var win = hooks.win;
  var doc = win.document || null;
  var post = hooks.post;
  var check = hooks.check === true;
  var LIMITS = config.limits;
  var FRAME = LIMITS.frameUs;
  var UNIT = LIMITS.unitUs;
  var K = LIMITS.batch;
  var KV = LIMITS.visibleBatch;

  /* The built-ins the loop uses, taken now, before any of the app's code runs. */
  var FP = Function.prototype;
  var uncurry = FP.bind.bind(FP.call);
  var call = uncurry(FP.call);
  var apply = uncurry(FP.apply);
  var createObject = Object.create;
  var defineProperty = Object.defineProperty;
  var describeProperty = Object.getOwnPropertyDescriptor;
  var toNumber = parseFloat;
  var lowerCase = uncurry(String.prototype.toLowerCase);
  var charCodeOf = uncurry(String.prototype.charCodeAt);
  var execPattern = uncurry(RegExp.prototype.exec);
  var protoOf = Object.getPrototypeOf;
  var keysOf = Object.keys;
  var hasOwn = uncurry(Object.prototype.hasOwnProperty);
  var mathFloor = Math.floor;
  var mathMin = Math.min;
  var mathMax = Math.max;
  var toText = String;
  var sliceText = uncurry(String.prototype.slice);
  var indexOfText = uncurry(String.prototype.indexOf);
  var NativeError = Error;
  var NativeTypeError = TypeError;
  var NativeProxy = typeof Proxy === 'function' ? Proxy : null;
  var reflectGet = Reflect.get;
  var reflectApply = Reflect.apply;
  var NativeWeakMap = WeakMap;
  var mapGet = uncurry(WeakMap.prototype.get);
  var mapSet = uncurry(WeakMap.prototype.set);
  var NativeWeakSet = WeakSet;
  var setAdd = uncurry(WeakSet.prototype.add);
  var setHas = uncurry(WeakSet.prototype.has);
  var isInstance = uncurry(FP[Symbol.hasInstance]);
  var globalEval = win.eval;
  var later = win.setTimeout;
  var cancelLater = win.clearTimeout;
  var nativeFrame = typeof win.requestAnimationFrame === 'function' ? win.requestAnimationFrame : null;
  var cancelNativeFrame = typeof win.cancelAnimationFrame === 'function' ? win.cancelAnimationFrame : null;
  var clone = typeof win.structuredClone === 'function' ? win.structuredClone : function (value) { return value; };
  var NativeChannel = win.MessageChannel;
  var NativeEventTarget = win.EventTarget;
  var ET = NativeEventTarget.prototype;
  var nativeAddRaw = ET.addEventListener;
  var nativeRemoveRaw = ET.removeEventListener;
  var nativeAdd = uncurry(nativeAddRaw);
  var nativeRemove = uncurry(nativeRemoveRaw);
  var NativeEvent = win.Event;
  var EP = NativeEvent.prototype;
  var NativeMessageEvent = typeof win.MessageEvent === 'function' ? win.MessageEvent : null;
  var NativeMouseEvent = typeof win.MouseEvent === 'function' ? win.MouseEvent : null;
  var getterOf = function (proto, name) {
    for (var at = proto; at; at = protoOf(at)) {
      var found = describeProperty(at, name);
      if (found) return found.get ? uncurry(found.get) : null;
    }
    return null;
  };
  var preventDefault = uncurry(EP.preventDefault);
  var stopPropagationNative = uncurry(EP.stopPropagation);
  var stopImmediateNative = uncurry(EP.stopImmediatePropagation);
  var typeOf = getterOf(EP, 'type');
  var bubblesOf = getterOf(EP, 'bubbles');
  var cancelBubbleOf = getterOf(EP, 'cancelBubble');
  var eventTargetOf = getterOf(EP, 'target');
  var NodeProto = win.Node ? win.Node.prototype : null;
  var parentNodeOf = NodeProto ? getterOf(NodeProto, 'parentNode') : null;
  var nodeTypeOf = NodeProto ? getterOf(NodeProto, 'nodeType') : null;
  var textOf = NodeProto ? getterOf(NodeProto, 'textContent') : null;
  var parentElementOf = NodeProto ? getterOf(NodeProto, 'parentElement') : null;
  var ElementProto = win.Element ? win.Element.prototype : null;
  var matchesOf = ElementProto ? uncurry(ElementProto.matches) : null;
  var boxOf = ElementProto ? uncurry(ElementProto.getBoundingClientRect) : null;
  var DocumentProto = win.Document ? win.Document.prototype : null;
  var querySelector = DocumentProto ? uncurry(DocumentProto.querySelector) : null;
  var querySelectorAllOf = DocumentProto ? uncurry(DocumentProto.querySelectorAll) : null;
  var NodeListProto = win.NodeList ? win.NodeList.prototype : null;
  var nodeListLength = NodeListProto ? getterOf(NodeListProto, 'length') : null;
  var nodeListItem = NodeListProto ? uncurry(NodeListProto.item) : null;
  var rootOf = DocumentProto ? getterOf(DocumentProto, 'documentElement') : null;
  var getAnimations = DocumentProto && typeof DocumentProto.getAnimations === 'function' ? uncurry(DocumentProto.getAnimations) : null;
  var computedStyle = typeof win.getComputedStyle === 'function' ? win.getComputedStyle : null;
  var styleValue = win.CSSStyleDeclaration ? uncurry(win.CSSStyleDeclaration.prototype.getPropertyValue) : null;
  var sampleBox = boxOf && rootOf && doc ? boxOf(rootOf(doc)) : null;
  var boxWidth = sampleBox ? getterOf(sampleBox, 'width') : null;
  var boxHeight = sampleBox ? getterOf(sampleBox, 'height') : null;
  var NativeMutationObserver = typeof win.MutationObserver === 'function' ? win.MutationObserver : null;
  var takeRecordsOf = NativeMutationObserver ? uncurry(NativeMutationObserver.prototype.takeRecords) : null;
  var observeWith = NativeMutationObserver ? uncurry(NativeMutationObserver.prototype.observe) : null;
  var AnimationProto = win.Animation ? win.Animation.prototype : null;
  var effectOf = AnimationProto ? getterOf(AnimationProto, 'effect') : null;
  var pauseAnimation = AnimationProto && typeof AnimationProto.pause === 'function' ? uncurry(AnimationProto.pause) : null;
  var playStateOf = AnimationProto ? getterOf(AnimationProto, 'playState') : null;
  var currentTimeFound = AnimationProto ? describeProperty(AnimationProto, 'currentTime') : null;
  var setCurrentTime = currentTimeFound && currentTimeFound.set ? uncurry(currentTimeFound.set) : null;
  var KeyframeProto = win.KeyframeEffect ? win.KeyframeEffect.prototype : null;
  var effectTargetOf = KeyframeProto ? getterOf(KeyframeProto, 'target') : null;
  var keyframesOf = KeyframeProto && typeof KeyframeProto.getKeyframes === 'function' ? uncurry(KeyframeProto.getKeyframes) : null;
  var EffectProto = win.AnimationEffect ? win.AnimationEffect.prototype : null;
  var timingOf = EffectProto && typeof EffectProto.getComputedTiming === 'function' ? uncurry(EffectProto.getComputedTiming) : null;
  var NativeTransition = typeof win.CSSTransition === 'function' ? win.CSSTransition : null;
  var NativeCssAnimation = typeof win.CSSAnimation === 'function' ? win.CSSAnimation : null;
  var transitionPropertyOf = NativeTransition ? getterOf(NativeTransition.prototype, 'transitionProperty') : null;
  var animationNameOf = NativeCssAnimation ? getterOf(NativeCssAnimation.prototype, 'animationName') : null;
  var abortedOf = win.AbortSignal ? getterOf(win.AbortSignal.prototype, 'aborted') : null;
  var portProto = null;
  var portSend = null;
  var portStart = null;

  /* Lists are objects without a prototype (a setter the app puts on Array.prototype or Object.prototype never sees what
     is written); what goes to the page is built whole, with arrays filled by defineProperty. */
  var list = function () { var made = createObject(null); made.length = 0; return made; };
  var push = function (target, item) { target[target.length] = item; target.length += 1; };
  var removeAt = function (target, index) {
    for (var i = index + 1; i < target.length; i++) target[i - 1] = target[i];
    target.length -= 1;
    delete target[target.length];
  };
  var put = function (array, index, item) {
    var descriptor = createObject(null);
    descriptor.value = item;
    descriptor.writable = true;
    descriptor.enumerable = true;
    descriptor.configurable = true;
    defineProperty(array, index, descriptor);
  };
  var toArray = function (from) {
    var out = [];
    for (var i = 0; from && i < from.length; i++) put(out, i, from[i]);
    return out;
  };
  var record0 = function () { return createObject(null); };
  /* a property of an object the app gets (a channel's port, an event's own field), defined, never assigned */
  var value = function (target, name, made, writable) {
    var descriptor = createObject(null);
    descriptor.value = made;
    descriptor.writable = writable !== false;
    descriptor.enumerable = false;
    descriptor.configurable = true;
    defineProperty(target, name, descriptor);
  };
  var accessor = function (target, name, get, set, configurable) {
    var descriptor = createObject(null);
    descriptor.get = get;
    if (set) descriptor.set = set;
    descriptor.enumerable = false;
    descriptor.configurable = configurable !== false;
    defineProperty(target, name, descriptor);
  };
  /* a function the page gets, with the name the browser's has (the bridge itself never writes a call that posts to the page) */
  var named = function (fn, name) {
    var descriptor = createObject(null);
    descriptor.value = name;
    descriptor.configurable = true;
    defineProperty(fn, 'name', descriptor);
    return fn;
  };
  var cut = function (text, max) {
    text = toText(text);
    var limit = max || LIMITS.text;
    return text.length > limit ? sliceText(text, 0, limit) + '…' : text;
  };
  var startsWith = function (text, start) { return indexOfText(text, start) === 0; };
  /* the first item of a frame that starts with this, or null */
  var itemOf = function (frame, start) {
    for (var j = 0; j < frame.items.length; j++) if (startsWith(frame.items[j], start)) return frame.items[j];
    return null;
  };
  /* the first number in a text ('Importing… 150 of 600': 150), or NaN */
  var firstNumber = function (text) {
    var digits = '';
    for (var i = 0; i < text.length; i++) {
      var code = charCodeOf(text, i);
      if (code >= 48 && code <= 57) digits += text[i];
      else if (digits) break;
    }
    return digits ? toNumber(digits) : NaN;
  };
  /* the time of the probe's tap: the first since its mark, else the last before it; -1 without a tap */
  var probeTap = function (mark) {
    var taps = mark ? mark.taps : 0;
    return taps < tapLog.length ? tapLog[taps] : tapLog.length ? tapLog[tapLog.length - 1] : -1;
  };

  /* The scripted clock, in µs since the page loaded. */
  var now = 0;
  var nextFrame = FRAME;
  var frames = 0;
  var units = 0;
  var stopped = null;
  var started = false;
  /* how deep in the page's own code: 0 between callbacks (the microtask checkpoint), 1 while the page's script runs */
  var depth = 1;
  var scriptRunning = true;
  /* the running task's timer nesting level (HTML: timer initialization steps) */
  var nesting = 0;
  var seq = 0;
  var boundaryAfter = function (time) { return (mathFloor(time / FRAME) + 1) * FRAME; };
  /* a customer's tap comes 5 ms after the next frame, so it never lands on a frame */
  var tapTime = function () { return boundaryAfter(now) + LIMITS.tapUs; };
  var readClock = function () { now += UNIT; return now / 1000; };

  /* What ran, for the Event loop panel: entries posted as they come, at most LIMITS.entries a load. */
  var entries = list();
  var postedUpTo = 0;
  var stacks = 0;
  var entriesCut = false;
  var flushQueued = false;
  var stackHere = function () {
    if (stacks >= LIMITS.stacks) return null;
    stacks += 1;
    try {
      var made = new NativeError();
      var text = made.stack;
      return typeof text === 'string' ? sliceText(text, 0, 4000) : null;
    } catch (error) { return null; }
  };
  /* ms on the panel's clock, two decimals, never past what the page reads (a timer weeks away) */
  var atNow = function () { return mathMin(mathFloor(now / 10) / 100, LIMITS.maxAt); };
  var flush = function () {
    flushQueued = false;
    while (postedUpTo < entries.length) {
      var upTo = mathMin(entries.length, postedUpTo + 200);
      var out = [];
      for (var i = postedUpTo; i < upTo; i++) {
        var each = entries[i];
        put(out, i - postedUpTo, { kind: each.kind, at: each.at, source: each.source, text: each.text, target: each.target, count: each.count, clamped: each.clamped, painted: toArray(each.painted), started: toArray(each.started), stack: each.stack });
      }
      post({ type: 'loop', from: postedUpTo, entries: out });
      postedUpTo = upTo;
    }
  };
  var batchOn = false;
  var flushSoon = function () {
    if (flushQueued || batchOn) return;
    flushQueued = true;
    later(flush, 0);
  };
  var record = function (kind, source, text, target, count) {
    if (entries.length >= LIMITS.entries) {
      if (!entriesCut) {
        entriesCut = true;
        var note = record0();
        note.kind = 'note'; note.at = atNow(); note.source = 'entries'; note.text = ''; note.target = ''; note.count = 0; note.clamped = false; note.painted = null; note.started = null; note.stack = null;
        push(entries, note);
        flushSoon();
      }
      return null;
    }
    var made = record0();
    made.kind = kind;
    made.at = atNow();
    made.source = source;
    made.text = cut(text);
    made.target = cut(target);
    made.count = count;
    made.clamped = false;
    made.painted = null;
    made.started = null;
    made.stack = null;
    push(entries, made);
    flushSoon();
    return made;
  };
  var ports = new NativeWeakSet();
  var describeTarget = function (target) {
    if (target === win) return 'window';
    if (doc && target === doc) return 'document';
    try { if (setHas(ports, target)) return 'a MessageChannel port'; } catch (error) { /* not an object */ }
    try { if (nodeTypeOf && nodeTypeOf(target) === 1) return hooks.describe(target); } catch (error) { /* not a node */ }
    return 'an object';
  };
  var nameOf = function (fn) {
    if (typeof fn !== 'function') return 'code';
    var found = describeProperty(fn, 'name');
    var name = found && typeof found.value === 'string' ? found.value : '';
    return name ? cut(name, 40) : '…';
  };

  /* Layout: dirty once the page changed since the last layout (a MutationObserver record), painted when the next frame
     shows a change. A read of a size or position while it is dirty is a forced (synchronous) layout. */
  var dirty = false;
  var needsPaint = false;
  var forcedTotal = 0;
  var observer = null;
  var kick = function () {};
  if (NativeMutationObserver && doc) {
    observer = new NativeMutationObserver(function () {
      dirty = true;
      needsPaint = true;
      kick();
    });
    var watchAll = createObject(null);
    watchAll.childList = true;
    watchAll.subtree = true;
    watchAll.attributes = true;
    watchAll.characterData = true;
    observeWith(observer, doc, watchAll);
  }
  var takeDirty = function () {
    if (!observer) return;
    var records = takeRecordsOf(observer);
    if (records.length > 0) {
      dirty = true;
      needsPaint = true;
    }
  };
  /* Whose read it is. In a check run every read counts: nothing but the page's code reads its layout there (the bridge
     and the model read with the browser's own functions, taken before). In the app you see a test tool's snapshot or
     DevTools may read it too, so there a read counts while the page loads (its script, the microtasks it queued, its
     load event), inside a unit (depth), or in the real event a batch or a browser's event runs in (their microtasks). No
     stack is read: the page could hide its frames. */
  var inWindow = false;
  var loading = false;
  var pageCodeRunning = function () { return check || !started || loading || depth > 0 || inWindow; };
  var noteRead = function (name) {
    takeDirty();
    if (!dirty || !pageCodeRunning()) return;
    dirty = false;
    forcedTotal += 1;
    var last = entries.length > postedUpTo ? entries[entries.length - 1] : null;
    if (last && last.kind === 'layout' && last.text === name) {
      last.count += 1;
      return;
    }
    var made = record('layout', '', name, '', 1);
    if (made) made.stack = stackHere();
  };

  /* The queue of tasks, by when they may run, then in the order they were queued: a binary heap. At most LIMITS.pending
     tasks wait (cancelled ones are dropped first); past that the loop stops. */
  var queue = list();
  var before = function (a, b) { return a.runAt < b.runAt || (a.runAt === b.runAt && a.seq < b.seq); };
  var swap = function (i, j) { var t = queue[i]; queue[i] = queue[j]; queue[j] = t; };
  var siftUp = function (i) {
    while (i > 0) {
      var parent = (i - 1) >> 1;
      if (!before(queue[i], queue[parent])) return;
      swap(i, parent);
      i = parent;
    }
  };
  var siftDown = function (i) {
    for (;;) {
      var left = 2 * i + 1;
      var right = left + 1;
      var least = i;
      if (left < queue.length && before(queue[left], queue[least])) least = left;
      if (right < queue.length && before(queue[right], queue[least])) least = right;
      if (least === i) return;
      swap(i, least);
      i = least;
    }
  };
  var popHead = function () {
    var last = queue.length - 1;
    swap(0, last);
    delete queue[last];
    queue.length = last;
    if (last > 0) siftDown(0);
  };
  var compact = function () {
    var kept = list();
    for (var i = 0; i < queue.length; i++) if (!queue[i].cancelled) push(kept, queue[i]);
    for (var j = 0; j < queue.length; j++) delete queue[j];
    queue.length = 0;
    for (var k = 0; k < kept.length; k++) {
      queue[queue.length] = kept[k];
      queue.length += 1;
      siftUp(queue.length - 1);
    }
  };
  var enqueue = function (task) {
    if (stopped) return;
    if (queue.length >= LIMITS.pending) compact();
    if (queue.length >= LIMITS.pending) {
      stop('tasks');
      return;
    }
    task.seq = ++seq;
    queue[queue.length] = task;
    queue.length += 1;
    siftUp(queue.length - 1);
    kick();
  };
  var head = function () {
    while (queue.length && queue[0].cancelled) popHead();
    return queue.length ? queue[0] : null;
  };
  var timers = createObject(null);
  var nextTimer = 1;
  var rafs = list();
  var rafIds = createObject(null);
  var nextRaf = 1;
  var framing = null;
  var dispatching = null;
  /* each painted frame: its time (µs) and what it showed, with the opacities of the watched elements that keep one */
  var frameLog = list();
  /* when each customer's tap ran (µs), in order */
  var tapLog = list();
  var animationLog = list();
  /* the finite animations still running: a frame is needed until one has been painted at or after each one's end */
  var running = list();
  var animationsCut = false;
  var seenAnimations = new NativeWeakSet();
  var notedEvents = new NativeWeakSet();
  var enter = function () { depth += 1; };
  var leave = function () { depth -= 1; };
  var spend = function () {
    units += 1;
    if (units > LIMITS.units) {
      stop('units');
      return false;
    }
    now += UNIT;
    return true;
  };

  /* Timers, as the HTML standard's timer initialization steps: the delay a long (ToInt32), at least 0; nested more than
     five deep, at least 4 ms; an interval runs its steps again after each run, one level deeper. */
  var arm = function (task, delay, level) {
    var wait = delay;
    task.clamped = false;
    if (level > 5 && wait < 4) {
      wait = 4;
      task.clamped = true;
    }
    task.nesting = level + 1;
    task.runAt = now + wait * 1000;
    task.cancelled = false;
    enqueue(task);
  };
  var setTimer = function (repeat, handler, timeout, rest) {
    var delay = timeout | 0;
    if (delay < 0) delay = 0;
    var id = nextTimer;
    nextTimer += 1;
    var task = record0();
    task.kind = 'timer';
    task.id = id;
    task.repeat = repeat;
    task.fn = handler;
    task.args = rest;
    task.delay = delay;
    task.stack = stackHere();
    task.label = (repeat ? 'setInterval(' : 'setTimeout(') + nameOf(handler) + ', ' + delay + ')';
    timers[id] = task;
    arm(task, delay, nesting);
    return id;
  };
  var rest = function (args, from) {
    var out = list();
    for (var i = from; i < args.length; i++) push(out, args[i]);
    return out;
  };
  var clearTimer = function (id) {
    var key = toText(id | 0);
    var task = timers[key];
    if (!task) return;
    task.cancelled = true;
    delete timers[key];
  };
  var runTimer = function (task) {
    nesting = task.nesting;
    if (!task.repeat) delete timers[toText(task.id)];
    var made = record('task', task.repeat ? 'interval' : 'timeout', task.label, '', task.delay);
    if (made) {
      made.clamped = task.clamped;
      made.stack = task.stack;
    }
    enter();
    try {
      if (typeof task.fn === 'function') apply(task.fn, win, task.args);
      else globalEval(toText(task.fn));
    } finally {
      leave();
      if (task.repeat && !task.cancelled && timers[toText(task.id)] === task) arm(task, task.delay, task.nesting);
    }
  };

  /* Animation frames: callbacks for the next frame; a frame runs the ones asked for before it started, in order. */
  var requestFrame = function requestAnimationFrame(callback) {
    if (typeof callback !== 'function') throw new NativeTypeError('Failed to execute \'requestAnimationFrame\' on \'Window\': The callback provided as parameter 1 is not a function.');
    var id = nextRaf;
    nextRaf += 1;
    var made = record0();
    made.id = id;
    made.fn = callback;
    made.cancelled = false;
    made.stack = stackHere();
    push(rafs, made);
    rafIds[toText(id)] = made;
    kick();
    return id;
  };
  var cancelFrame = function cancelAnimationFrame(id) {
    var key = toText(id | 0);
    var made = rafIds[key];
    if (!made) return;
    made.cancelled = true;
    delete rafIds[key];
  };
  var animating = function () {
    for (var i = running.length - 1; i >= 0; i--) {
      var each = running[i];
      var idle = false;
      try { idle = playStateOf ? playStateOf(each.animation) === 'idle' : true; } catch (error) { idle = true; }
      if (each.ended || idle) removeAt(running, i);
    }
    return running.length > 0;
  };
  var needsRender = function () {
    if (!started) return false;
    takeDirty();
    return rafs.length > 0 || needsPaint || animating();
  };
  var startFrame = function () {
    frames += 1;
    framing = record0();
    framing.list = rafs;
    framing.index = 0;
    framing.time = now;
    framing.number = frames;
    rafs = list();
  };

  /* What a frame paints of the watched elements: displayed (no display: none up the tree), visible, with a box; its
     text when the level says so. Its opacity is kept apart (elements that keep one): in a check run animations run on the
     scripted clock, so it is the same every run; it is never part of the panel's items. */
  var watch = config.watch;
  var shown = function (element) {
    for (var node = element; node && nodeTypeOf(node) === 1; node = parentElementOf(node)) {
      if (styleValue(computedStyle(node), 'display') === 'none') return false;
    }
    if (styleValue(computedStyle(element), 'visibility') !== 'visible') return false;
    var box = boxOf(element);
    return boxWidth(box) > 0 && boxHeight(box) > 0;
  };
  var opacities = createObject(null);
  /* which element a watched name was, frame by frame (a new toast is a new element) */
  var elementIds = new NativeWeakMap();
  var nextElementId = 1;
  var idOf = function (element) {
    var id = mapGet(elementIds, element);
    if (!id) {
      id = nextElementId;
      nextElementId += 1;
      mapSet(elementIds, element, id);
    }
    return id;
  };
  /* the elements a watched name painted with their opacity: [{ id, opacity }] */
  var keepFade = function (name, element) {
    var made = record0();
    made.id = idOf(element);
    made.opacity = toNumber(styleValue(computedStyle(element), 'opacity'));
    if (!opacities[name]) opacities[name] = list();
    push(opacities[name], made);
  };
  var snapshot = function () {
    opacities = createObject(null);
    var out = list();
    if (!doc || !querySelector) return out;
    for (var i = 0; i < watch.length; i++) {
      var each = watch[i];
      if (each.all) {
        var matched = null;
        try { matched = querySelectorAllOf(doc, each.selector); } catch (error) { matched = null; }
        for (var m = 0; matched && m < mathMin(nodeListLength(matched), 20); m++) {
          var one = nodeListItem(matched, m);
          if (one && shown(one)) keepFade(each.name, one);
        }
        continue;
      }
      var element = null;
      try { element = querySelector(doc, each.selector); } catch (error) { element = null; }
      if (!element || !shown(element)) continue;
      if (each.opacity) keepFade(each.name, element);
      if (!each.text) {
        push(out, each.name);
        continue;
      }
      var text = hooks.squash(textOf(element) || '');
      if (text) push(out, each.name + ': ' + cut(text, LIMITS.watchText));
    }
    return out;
  };
  var CHANGED_SKIP = createObject(null);
  CHANGED_SKIP.offset = true;
  CHANGED_SKIP.easing = true;
  CHANGED_SKIP.composite = true;
  CHANGED_SKIP.computedOffset = true;
  /* the properties an animation changes (its first and last keyframes differ), if it lasts long enough to be seen (100 ms) */
  var changedProperties = function (effect) {
    var out = list();
    if (!keyframesOf || !timingOf) return out;
    var timing = timingOf(effect);
    var lasts = timing && hasOwn(timing, 'activeDuration') ? timing.activeDuration : 0;
    if (!(lasts >= 100)) return out;
    var frames = keyframesOf(effect);
    if (!frames || frames.length < 2) return out;
    var first = frames[0];
    var last = frames[frames.length - 1];
    var names = keysOf(first);
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      if (CHANGED_SKIP[name] || !hasOwn(last, name) || !hasOwn(first, name)) continue;
      if (toText(first[name]) !== toText(last[name])) push(out, name);
    }
    return out;
  };
  var animationsStarted = function (number) {
    var out = list();
    if (!getAnimations || !doc) return out;
    var all = getAnimations(doc);
    for (var i = 0; i < all.length; i++) {
      var animation = all[i];
      if (setHas(seenAnimations, animation)) continue;
      setAdd(seenAnimations, animation);
      if (animationLog.length >= LIMITS.animations) {
        if (!animationsCut) {
          animationsCut = true;
          record('note', 'animations', '', '', LIMITS.animations);
        }
        continue;
      }
      var effect = effectOf ? effectOf(animation) : null;
      var element = effect && effectTargetOf ? effectTargetOf(effect) : null;
      if (!element) continue;
      var name = NativeTransition && isInstance(NativeTransition, animation) ? transitionPropertyOf(animation) : NativeCssAnimation && isInstance(NativeCssAnimation, animation) ? animationNameOf(animation) : 'animation';
      push(out, describeTarget(element) + ' ' + name);
      var made = record0();
      made.element = element;
      made.changes = changedProperties(effect);
      made.frame = number;
      made.animation = animation;
      made.start = now;
      made.done = false;
      made.ended = false;
      var timing = timingOf ? timingOf(effect) : null;
      var ends = timing && hasOwn(timing, 'endTime') ? timing.endTime : Infinity;
      made.end = typeof ends === 'number' && ends >= 0 && ends < 600000 ? ends * 1000 : -1;
      push(animationLog, made);
      if (made.end >= 0) push(running, made);
      /* a check run: the animation's time is the scripted clock's, not the real one's (which hardly moves there) */
      if (check && pauseAnimation && setCurrentTime) {
        try {
          pauseAnimation(animation);
          setCurrentTime(animation, 0);
          push(synced, made);
        } catch (error) { /* left to run */ }
      }
    }
    return out;
  };
  /* A check run: every animation that started is at its time on the scripted clock at each frame (before the frame works
     out styles, so a transition that ended on that clock has ended for the next one); one that was cancelled (replaced
     by another transition, its element gone) is left alone. */
  var synced = list();
  var syncAnimations = function () {
    if (!check || !setCurrentTime || !playStateOf) return;
    for (var i = synced.length - 1; i >= 0; i--) {
      var each = synced[i];
      if (each.done) {
        removeAt(synced, i);
        continue;
      }
      try {
        if (playStateOf(each.animation) === 'idle') {
          each.done = true;
          continue;
        }
        setCurrentTime(each.animation, (now - each.start) / 1000);
      } catch (error) { each.done = true; }
    }
  };
  /* The frame's style, layout and paint: the browser's real style and layout, forced now (so a transition starts here,
     as in a real frame), then what it shows. */
  var paint = function () {
    syncAnimations();
    if (doc && boxOf && rootOf) boxOf(rootOf(doc));
    takeDirty();
    dirty = false;
    needsPaint = false;
    /* animations found first: a check run pauses a new one at its start, so the frame reads it there */
    var begun = animationsStarted(framing.number);
    var painted = snapshot();
    var made = record('render', '', '', '', framing.number);
    if (made) {
      made.painted = painted;
      made.started = begun;
    }
    if (frameLog.length < LIMITS.frames) {
      var kept = record0();
      /* when it was painted: after its callbacks (work in them delays what the screen shows) */
      kept.time = now;
      kept.items = painted;
      kept.fades = opacities;
      push(frameLog, kept);
    }
    /* an animation is over once a frame at or after its end was painted */
    for (var r = 0; r < running.length; r++) if (now - running[r].start >= running[r].end) running[r].ended = true;
    nextFrame = boundaryAfter(now);
  };
  var stepFrame = function () {
    while (framing.index < framing.list.length) {
      var callback = framing.list[framing.index];
      framing.index += 1;
      if (callback.cancelled) continue;
      delete rafIds[toText(callback.id)];
      if (!spend()) return 'pause';
      nesting = 0;
      var made = record('callback', '', 'requestAnimationFrame(' + nameOf(callback.fn) + ')', '', framing.number);
      if (made) made.stack = callback.stack;
      enter();
      try { call(callback.fn, win, framing.time / 1000); } finally { leave(); }
      return 'ran';
    }
    paint();
    framing = null;
    return 'paint';
  };

  /* Listeners: every one the page adds is kept here too (by target and type), so a customer's tap and a message can call
     them one at a time, as the browser does; the browser's own dispatch (element.click(), dispatchEvent, its own events)
     calls them through a wrapper that notes them for the panel. */
  var registry = new NativeWeakMap();
  var NOISY = createObject(null);
  var noisyTypes = ['mousemove', 'pointermove', 'pointerrawupdate', 'touchmove', 'scroll', 'wheel', 'mouseover', 'mouseout', 'pointerover', 'pointerout', 'mouseenter', 'mouseleave', 'pointerenter', 'pointerleave', 'resize', 'selectionchange', 'visibilitychange', 'focus', 'blur', 'focusin', 'focusout'];
  for (var n = 0; n < noisyTypes.length; n++) NOISY[noisyTypes[n]] = true;
  var USER = createObject(null);
  var userTypes = ['click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'keydown', 'keyup', 'input', 'change', 'touchstart', 'touchend', 'submit', 'dblclick', 'contextmenu'];
  for (var u = 0; u < userTypes.length; u++) USER[userTypes[u]] = true;
  var listenersOf = function (target, type, make) {
    var byType = mapGet(registry, target);
    if (!byType) {
      if (!make) return null;
      byType = createObject(null);
      mapSet(registry, target, byType);
    }
    var found = byType[type];
    if (!found && make) {
      found = list();
      byType[type] = found;
    }
    return found || null;
  };
  var removeEntry = function (entry, native) {
    if (entry.removed) return;
    entry.removed = true;
    var listeners = listenersOf(entry.owner, entry.type, false);
    for (var i = 0; listeners && i < listeners.length; i++) {
      if (listeners[i] === entry) {
        removeAt(listeners, i);
        break;
      }
    }
    if (native) nativeRemove(entry.owner, entry.type, entry.wrapper, entry.capture);
  };
  var noteListener = function (type, currentTarget, stack) {
    if (NOISY[type]) return;
    var made = record('listener', '', type, describeTarget(currentTarget), 0);
    if (made) made.stack = stack;
  };
  var invokeListener = function (listener, currentTarget, event) {
    if (typeof listener === 'function') return call(listener, currentTarget, event);
    var handle = listener.handleEvent;
    if (typeof handle === 'function') return call(handle, listener, event);
    return undefined;
  };
  var runEntry = function (entry, currentTarget, event) {
    noteListener(entry.type, currentTarget, entry.stack);
    enter();
    try { return invokeListener(entry.listener, currentTarget, event); } finally { leave(); }
  };
  /* An event the browser dispatched itself (load, a real tap in the app you see, an event the page's own code sent from
     outside any callback): a task of its own on the panel. A real tap comes 5 ms after a frame, and the browser has just
     laid out the page to find what was tapped. */
  var browserEvent = function (event) {
    if (setHas(notedEvents, event)) return;
    setAdd(notedEvents, event);
    var type = typeOf(event);
    nesting = 0;
    if (USER[type] && started && !check) {
      now = mathMax(now, tapTime());
      takeDirty();
      dirty = false;
    }
    if (NOISY[type]) return;
    var target = null;
    try { target = eventTargetOf(event); } catch (error) { target = null; }
    record('task', 'event', type, describeTarget(target), 0);
  };
  var fromBrowser = function (entry, currentTarget, event) {
    if (entry.removed) return undefined;
    if (entry.once) removeEntry(entry, false);
    var outer = depth === 0;
    if (outer) {
      browserEvent(event);
      if (!inWindow) {
        inWindow = true;
        later(function () { inWindow = batchOn; }, 0);
      }
    }
    try { return runEntry(entry, currentTarget, event); } finally { if (outer) kick(); }
  };
  var flagsOf = function (options) {
    var flags = record0();
    flags.capture = false;
    flags.once = false;
    flags.signal = null;
    if (typeof options === 'boolean') flags.capture = options;
    else if (options !== null && typeof options === 'object') {
      flags.capture = !!options.capture;
      flags.once = !!options.once;
      flags.signal = options.signal || null;
    }
    return flags;
  };
  /* (a bare addEventListener(…) in the page's code has no this: the browser takes the window, as WebIDL says) */
  var addListener = function addEventListener(type, listener, options) {
    var target = this === null || this === undefined ? win : this;
    if (listener === null || listener === undefined || (typeof listener !== 'function' && typeof listener !== 'object')) return apply(nativeAddRaw, target, arguments);
    var name = toText(type);
    var flags = flagsOf(options);
    var listeners = listenersOf(target, name, true);
    for (var i = 0; i < listeners.length; i++) if (listeners[i].listener === listener && listeners[i].capture === flags.capture) return undefined;
    if (flags.signal && abortedOf) {
      var aborted = false;
      try { aborted = abortedOf(flags.signal) === true; } catch (error) { aborted = false; }
      if (aborted) return undefined;
    }
    var entry = record0();
    entry.owner = target;
    entry.type = name;
    entry.listener = listener;
    entry.capture = flags.capture;
    entry.once = flags.once;
    entry.removed = false;
    entry.stack = stackHere();
    entry.wrapper = function (event) { return fromBrowser(entry, this, event); };
    push(listeners, entry);
    var passed = [];
    put(passed, 0, name);
    put(passed, 1, entry.wrapper);
    put(passed, 2, options);
    apply(nativeAddRaw, target, passed);
    if (flags.signal) {
      try { nativeAdd(flags.signal, 'abort', function () { removeEntry(entry, false); }); } catch (error) { /* no signal */ }
    }
    return undefined;
  };
  var removeListener = function removeEventListener(type, listener, options) {
    var target = this === null || this === undefined ? win : this;
    var name = toText(type);
    var flags = flagsOf(options);
    var listeners = listener ? listenersOf(target, name, false) : null;
    for (var i = 0; listeners && i < listeners.length; i++) {
      if (listeners[i].listener === listener && listeners[i].capture === flags.capture && !listeners[i].slot) {
        removeEntry(listeners[i], true);
        return undefined;
      }
    }
    return apply(nativeRemoveRaw, target, arguments);
  };
  /* An event handler (onclick = …, a port's onmessage) takes its place among the listeners when it is first set, and
     keeps it while it is set to another function (the DOM's event handler processing); set to null, it leaves. */
  var handlerSlot = function (target, type, set) {
    var listeners = listenersOf(target, type, true);
    for (var i = 0; i < listeners.length; i++) {
      if (!listeners[i].slot) continue;
      if (!set) {
        listeners[i].removed = true;
        removeAt(listeners, i);
      }
      return;
    }
    if (!set) return;
    var slot = record0();
    slot.slot = true;
    slot.capture = false;
    slot.removed = false;
    push(listeners, slot);
  };
  /* An object's on<type> handler (an onclick property, an inline onclick attribute, a port's onmessage), if it has one. */
  var handlerOf = function (object, type) {
    var name = 'on' + type;
    for (var at = object; at; at = protoOf(at)) {
      var found = describeProperty(at, name);
      if (!found) continue;
      var got = null;
      try { got = found.get ? call(found.get, object) : found.value; } catch (error) { got = null; }
      return typeof got === 'function' ? got : null;
    }
    return null;
  };

  /* A dispatch the browser runs itself (a customer's tap, a message): the event's path, capturing then at the target
     (capturing listeners first) then bubbling; the listeners of each object read when the event gets there; one
     listener per unit, so the microtasks run after each. The event's target, currentTarget, eventPhase, composedPath and
     the stop flags are the dispatch's, as own properties of the event. */
  var startDispatch = function (target, event, source, label, stack) {
    var path = list();
    push(path, target);
    var isNode = false;
    try { isNode = !!nodeTypeOf && typeof nodeTypeOf(target) === 'number'; } catch (error) { isNode = false; }
    if (isNode) {
      for (var node = parentNodeOf(target); node; node = parentNodeOf(node)) push(path, node);
      if (doc && path[path.length - 1] === doc) push(path, win);
    }
    var bubbles = bubblesOf(event);
    var plan = list();
    var planStep = function (object, phase, capture) {
      var made = record0();
      made.object = object;
      made.phase = phase;
      made.capture = capture;
      push(plan, made);
    };
    for (var i = path.length - 1; i >= 1; i--) planStep(path[i], 1, true);
    planStep(path[0], 2, true);
    planStep(path[0], 2, false);
    if (bubbles) for (var j = 1; j < path.length; j++) planStep(path[j], 3, false);
    var d = record0();
    d.event = event;
    d.type = typeOf(event);
    d.path = path;
    d.plan = plan;
    d.step = -1;
    d.list = null;
    d.at = 0;
    d.current = null;
    d.phase = 0;
    d.stop = false;
    d.immediate = false;
    accessor(event, 'target', function () { return target; });
    accessor(event, 'srcElement', function () { return target; });
    accessor(event, 'currentTarget', function () { return dispatching === d ? d.current : null; });
    accessor(event, 'eventPhase', function () { return dispatching === d ? d.phase : 0; });
    value(event, 'composedPath', function composedPath() { return dispatching === d ? toArray(path) : []; });
    value(event, 'stopPropagation', function stopPropagation() { d.stop = true; stopPropagationNative(event); });
    value(event, 'stopImmediatePropagation', function stopImmediatePropagation() { d.stop = true; d.immediate = true; stopImmediateNative(event); });
    var made = record('task', source, label, describeTarget(target), 0);
    if (made) made.stack = stack;
    dispatching = d;
  };
  var finishDispatch = function () {
    var d = dispatching;
    dispatching = null;
    try {
      delete d.event.currentTarget;
      delete d.event.eventPhase;
      delete d.event.composedPath;
    } catch (error) { /* kept */ }
  };
  /* The next listener of the dispatch, in a unit of its own; false when the dispatch is over without one. */
  var stepDispatch = function () {
    var d = dispatching;
    for (;;) {
      if (d.list && d.at < d.list.length && !d.immediate) {
        var entry = d.list[d.at];
        d.at += 1;
        if (entry.removed) continue;
        if (!spend()) return false;
        nesting = 0;
        if (entry.handler) {
          noteListener(d.type, d.current, null);
          enter();
          try {
            var result = call(entry.handler, d.current, d.event);
            if (result === false) preventDefault(d.event);
          } finally { leave(); }
        } else {
          if (entry.once) removeEntry(entry, true);
          runEntry(entry, d.current, d.event);
        }
        return true;
      }
      var stopNow = d.stop || d.immediate;
      if (!stopNow) {
        try { stopNow = cancelBubbleOf(d.event) === true; } catch (error) { stopNow = false; }
      }
      if (d.list && stopNow) {
        finishDispatch();
        return false;
      }
      d.step += 1;
      if (d.step >= d.plan.length) {
        finishDispatch();
        return false;
      }
      var planned = d.plan[d.step];
      d.current = planned.object;
      d.phase = planned.phase;
      var listeners = listenersOf(planned.object, d.type, false);
      var taken = list();
      var takeHandler = function () {
        var handler = handlerOf(planned.object, d.type);
        if (!handler) return;
        var pseudo = record0();
        pseudo.handler = handler;
        pseudo.removed = false;
        push(taken, pseudo);
      };
      var hasSlot = false;
      for (var s = 0; listeners && s < listeners.length; s++) if (listeners[s].slot) hasSlot = true;
      /* a handler set before the model saw it (an onclick attribute in the page's HTML) was there first */
      if (!planned.capture && !hasSlot) takeHandler();
      for (var i = 0; listeners && i < listeners.length; i++) {
        if (listeners[i].slot) {
          if (!planned.capture) takeHandler();
        } else if (listeners[i].capture === planned.capture) push(taken, listeners[i]);
      }
      d.list = taken;
      d.at = 0;
    }
  };

  /* MessageChannel and window.postMessage: a message is a task (Chrome: posted, it runs before the next frame unless one
     is due), delivered to a port once it is started (onmessage or start()). */
  var deliver = function (target, data, origin, source, stack) {
    var task = record0();
    task.kind = 'message';
    task.target = target;
    task.data = data;
    task.origin = origin;
    task.source = source;
    task.stack = stack;
    task.runAt = now;
    task.cancelled = false;
    enqueue(task);
  };
  var flushPort = function (state) {
    while (state.waiting.length) {
      var data = state.waiting[0];
      removeAt(state.waiting, 0);
      deliver(state.port, data, '', null, null);
    }
  };
  var makePort = function () {
    var port = new NativeEventTarget();
    var state = record0();
    state.port = port;
    state.other = null;
    state.started = false;
    state.closed = false;
    state.waiting = list();
    state.handler = null;
    state.error = null;
    setAdd(ports, port);
    value(port, 'postMessage', named(function (message) {
      if (state.closed) return;
      var data = clone(message);
      var other = state.other;
      if (!other || other.closed) return;
      if (other.started) deliver(other.port, data, '', null, stackHere());
      else push(other.waiting, data);
    }, 'postMessage'));
    value(port, 'start', function start() {
      if (state.started || state.closed) return;
      state.started = true;
      flushPort(state);
    });
    value(port, 'close', function close() { state.closed = true; });
    accessor(port, 'onmessage', function () { return state.handler; }, function (handler) {
      state.handler = typeof handler === 'function' ? handler : null;
      handlerSlot(port, 'message', state.handler !== null);
      if (state.handler && !state.started && !state.closed) {
        state.started = true;
        flushPort(state);
      }
    });
    accessor(port, 'onmessageerror', function () { return state.error; }, function (handler) { state.error = typeof handler === 'function' ? handler : null; });
    var closedOf = function () { return state.closed; };
    state.isClosed = closedOf;
    return state;
  };
  var portStates = new NativeWeakMap();
  var VirtualChannel = function MessageChannel() {
    if (!new.target) throw new NativeTypeError('Failed to construct \'MessageChannel\': Please use the \'new\' operator, this DOM object constructor cannot be called as a function.');
    var one = makePort();
    var two = makePort();
    one.other = two;
    two.other = one;
    mapSet(portStates, one.port, one);
    mapSet(portStates, two.port, two);
    value(this, 'port1', one.port, false);
    value(this, 'port2', two.port, false);
  };
  var runMessage = function (task) {
    var state = mapGet(portStates, task.target);
    if (state && state.closed) return false;
    if (!NativeMessageEvent) return false;
    var init = record0();
    init.data = task.data;
    init.origin = task.origin;
    if (task.source) init.source = task.source;
    var event = new NativeMessageEvent('message', init);
    startDispatch(task.target, event, 'message', 'message', task.stack);
    return true;
  };

  /* A customer's tap: it lands where a finger would (the browser lays out the page to find what is there), then the
     click goes listener by listener. Only click: a tap's pointer and mouse events are left out. */
  var runTap = function (task) {
    nesting = 0;
    if (tapLog.length < LIMITS.frames) push(tapLog, now);
    var hit = hooks.hit ? hooks.hit(task.element) : null;
    takeDirty();
    dirty = false;
    if (!hit || !NativeMouseEvent) {
      record('task', 'tap', 'click', 'nothing there to tap', 0);
      return;
    }
    var init = record0();
    init.bubbles = true;
    init.cancelable = true;
    init.composed = true;
    init.view = win;
    init.detail = 1;
    init.button = 0;
    init.clientX = hit[1];
    init.clientY = hit[2];
    startDispatch(hit[0], new NativeMouseEvent('click', init), 'tap', 'click', null);
  };
  var runTask = function (task) {
    popHead();
    if (!spend()) return;
    if (task.kind === 'timer') runTimer(task);
    else if (task.kind === 'message') { nesting = 0; if (runMessage(task)) stepDispatch(); }
    else if (task.kind === 'tap') { runTap(task); if (dispatching) stepDispatch(); }
  };

  /* The pump: units run one per listener of one real event on a private port, so the browser runs the microtasks after
     each and renders nothing in the middle; a batch ends after a frame's paint (where a real browser may render too) or
     when there is nothing to do now. A check run moves the clock only while a probe drives it; the app you see runs on
     by itself, waiting in real time (a frame for a frame), so it looks like the page would. */
  var drive = null;
  var thenQueue = null;
  var posted = false;
  var after = 'none';
  var waiting = null;
  var waitFor = 0;
  /* the app you see: how far a batch may move the clock (up to and including the next model frame), and what it waited for */
  var batchUntil = 0;
  var waitTarget = 0;
  /* the loop stops for good (the note goes past the entries' cap: it says why nothing more happens) */
  var stop = function (reason) {
    if (stopped) return;
    stopped = reason;
    var note = record0();
    note.kind = 'note'; note.at = atNow(); note.source = reason; note.text = ''; note.target = ''; note.count = units; note.clamped = false; note.painted = null; note.started = null; note.stack = null;
    push(entries, note);
    flushSoon();
    if (drive) endDrive();
  };
  var endDrive = function () {
    var then = drive.then;
    drive = null;
    thenQueue = then;
  };
  var step = function () {
    for (;;) {
      if (stopped) {
        after = 'none';
        return 'pause';
      }
      if (dispatching) {
        if (stepDispatch()) return 'ran';
        if (stopped) continue;
      }
      if (framing) return stepFrame();
      if (now >= nextFrame) {
        if (needsRender()) {
          startFrame();
          return stepFrame();
        }
        nextFrame = boundaryAfter(now);
      }
      var task = head();
      if (task && task.runAt <= now) {
        runTask(task);
        if (dispatching && !stopped) return 'ran';
        if (task.kind === 'timer') return 'ran';
        continue;
      }
      var next = task ? task.runAt : Infinity;
      if (needsRender()) next = mathMin(next, nextFrame);
      if (drive && (now >= drive.target || (drive.idle && next === Infinity))) {
        endDrive();
        if (check) {
          after = 'none';
          return 'pause';
        }
      }
      if (next === Infinity && !drive) {
        after = 'none';
        return 'pause';
      }
      var wake = drive ? mathMin(next, drive.target) : next;
      /* a check run jumps; the app you see jumps only within this real frame's share, then waits in real time */
      if (check || wake <= batchUntil) {
        now = mathMax(now, wake);
        continue;
      }
      after = 'wait';
      waitFor = wake;
      return 'pause';
    }
  };
  var clearWait = function () {
    if (!waiting) return;
    cancelLater(waiting[0]);
    if (waiting[1] !== null && cancelNativeFrame) cancelNativeFrame(waiting[1]);
    waiting = null;
  };
  /* The app you see waits in real time for what comes after this real frame (less the frame its batch runs in), at most a
     minute at a time (the clock then moves on a minute: a timer weeks away never jumps the clock there). */
  var waitReal = function () {
    var target = waitFor;
    var ms = (target - now) / 1000 - FRAME / 1000;
    if (ms <= 0) {
      waitTarget = target;
      postBatch();
      return;
    }
    var capped = ms > 60000;
    waiting = [later(function () {
      waiting = null;
      if (capped) now += 60000 * 1000;
      else waitTarget = target;
      postBatch();
    }, mathMin(ms, 60000)), null];
  };
  var finishBatch = function () {
    flush();
    var then = thenQueue;
    thenQueue = null;
    if (after === 'post') postBatch();
    else if (after === 'wait') waitReal();
    if (then) then();
  };
  /* the units of the batch running now: K by the port, KV in the app you see's rAF callbacks */
  var batchSize = K;
  var batchUnit = function (index) {
    if (index === 0) {
      posted = false;
      batchOn = true;
      inWindow = true;
      after = 'post';
      batchUntil = boundaryAfter(mathMax(now, waitTarget));
      waitTarget = 0;
    }
    try {
      if (batchOn) {
        var result = 'ran';
        result = step();
        if (result !== 'ran') {
          batchOn = false;
          if (result === 'paint') after = 'post';
        }
      }
    } finally {
      if (index === batchSize - 1) {
        batchOn = false;
        /* the microtasks after the last unit are the page's too */
        later(function () { if (!batchOn) inWindow = false; }, 0);
        finishBatch();
      }
    }
  };
  var pumpSend = null;
  if (!hooks.batch) {
    var pump = new NativeChannel();
    portProto = protoOf(pump.port1);
    portSend = uncurry(portProto.postMessage);
    portStart = uncurry(portProto.start);
    var unitListener = function (index) { return function () { batchUnit(index); }; };
    for (var k = 0; k < K; k++) nativeAdd(pump.port2, 'message', unitListener(k));
    portStart(pump.port2);
    pumpSend = function () {
      batchSize = K;
      portSend(pump.port1, 0);
    };
  }
  /* The app you see runs a batch in KV (1,024) native rAF callbacks of the next real frame: the browser runs the
     microtasks after each, and works out that frame's style only after the last, so a model frame's callbacks and paint
     come before the real style as in a check run. More units than that before the next model frame go on in the next
     real frame (a real style in between: listed in what the model simplifies). A hidden frame gets no real frames: after
     100 ms the batch goes by the port instead. */
  var rafUnit = function (index, batch) {
    return function () {
      if (batch.done) return;
      if (index === 0) cancelLater(batch.fallback);
      batchUnit(index);
    };
  };
  var postFrameBatch = function () {
    var batch = record0();
    batch.done = false;
    batch.ids = list();
    batch.fallback = later(function () {
      batch.done = true;
      for (var i = 0; i < batch.ids.length; i++) cancelNativeFrame(batch.ids[i]);
      pumpSend();
    }, 100);
    batchSize = KV;
    for (var k = 0; k < KV; k++) push(batch.ids, nativeFrame(rafUnit(k, batch)));
  };
  var postBatch = function () {
    if (posted || stopped) return;
    posted = true;
    if (hooks.batch) {
      batchSize = K;
      hooks.batch(K, batchUnit);
    } else if (!check && nativeFrame && cancelNativeFrame) postFrameBatch();
    else pumpSend();
  };
  kick = function () {
    if (!started || stopped || batchOn || posted) return;
    if (check && !drive) return;
    clearWait();
    postBatch();
  };
  var driveTo = function (target, idle, then) {
    if (stopped) return then();
    var made = record0();
    made.target = target;
    made.idle = idle;
    made.then = then;
    drive = made;
    if (!started) return;
    clearWait();
    postBatch();
  };

  /* The page's globals, before any of its code runs. */
  var define = function (target, name, made) {
    var descriptor = createObject(null);
    descriptor.value = made;
    descriptor.writable = true;
    descriptor.enumerable = true;
    descriptor.configurable = true;
    try { defineProperty(target, name, descriptor); } catch (error) { /* kept */ }
  };
  var fixed = function (target, name, descriptor) {
    try { defineProperty(target, name, descriptor); } catch (error) { /* a browser without it */ }
  };
  var iteratorKey = Symbol.iterator;
  var wrapGetter = function (proto, name, label) {
    var noted = label || name;
    var found = proto ? describeProperty(proto, name) : null;
    if (!found || !found.get || !found.configurable) return;
    var get = uncurry(found.get);
    var set = found.set ? uncurry(found.set) : null;
    var descriptor = createObject(null);
    descriptor.configurable = false;
    descriptor.enumerable = found.enumerable;
    descriptor.get = function () { noteRead(noted); return get(this); };
    if (set) descriptor.set = function (to) {
      if (name === 'scrollTop' || name === 'scrollLeft') noteRead(noted);
      set(this, to);
    };
    fixed(proto, name, descriptor);
  };
  /* the event handler accessors the model dispatches for (taps' click, window's message) note when they are set */
  var wrapHandler = function (target, type) {
    var name = 'on' + type;
    var found = target ? describeProperty(target, name) : null;
    if (!found || !found.set || !found.get || !found.configurable) return;
    var get = found.get;
    var set = uncurry(found.set);
    var descriptor = createObject(null);
    descriptor.configurable = false;
    descriptor.enumerable = found.enumerable;
    descriptor.get = get;
    descriptor.set = function (handler) {
      var owner = this === null || this === undefined ? win : this;
      set(owner, handler);
      handlerSlot(owner, type, typeof handler === 'function');
    };
    fixed(target, name, descriptor);
  };
  /* a read of the scripted clock, without moving it (an event's timeStamp, the document timeline's time) */
  var clockGetter = function (proto, name, scale) {
    var found = proto ? describeProperty(proto, name) : null;
    if (!found || !found.get || !found.configurable) return;
    var descriptor = createObject(null);
    descriptor.configurable = false;
    descriptor.enumerable = found.enumerable;
    descriptor.get = function () { return now / scale; };
    fixed(proto, name, descriptor);
  };
  /* computed values Chrome resolves from the layout (css_properties.json5's layout_dependent: sizes, insets, margins,
     paddings, transforms and their origins, translate, perspective-origin, the grid's templates) */
  var LAYOUT_STYLE = /^(?:width|height|inline-size|block-size|top|right|bottom|left|inset(?:-(?:block|inline)(?:-(?:start|end))?)?|margin(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|padding(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|transform|transform-origin|translate|perspective-origin|grid|grid-lanes|grid-template(?:-(?:columns|rows))?)$/;
  var kebab = function (key) {
    var out = '';
    for (var i = 0; i < key.length; i++) {
      var character = key[i];
      var lower = lowerCase(character);
      out += lower !== character ? '-' + lower : character;
    }
    return out;
  };
  var layoutStyle = function (key) { return typeof key === 'string' && execPattern(LAYOUT_STYLE, kebab(key)) !== null; };
  var wrapMethod = function (proto, name) {
    var found = proto ? describeProperty(proto, name) : null;
    if (!found || typeof found.value !== 'function' || !found.configurable) return;
    var method = found.value;
    var descriptor = createObject(null);
    descriptor.configurable = false;
    descriptor.enumerable = found.enumerable;
    descriptor.writable = false;
    descriptor.value = function () { noteRead(name); return apply(method, this, arguments); };
    fixed(proto, name, descriptor);
  };
  var install = function () {
    define(win, 'setTimeout', function setTimeout(handler, timeout) { return setTimer(false, handler, timeout, rest(arguments, 2)); });
    define(win, 'setInterval', function setInterval(handler, timeout) { return setTimer(true, handler, timeout, rest(arguments, 2)); });
    define(win, 'clearTimeout', function clearTimeout(id) { clearTimer(id); });
    define(win, 'clearInterval', function clearInterval(id) { clearTimer(id); });
    define(win, 'requestAnimationFrame', requestFrame);
    define(win, 'cancelAnimationFrame', cancelFrame);
    define(win, 'MessageChannel', VirtualChannel);
    define(win, 'postMessage', named(function (message) { deliver(win, clone(message), 'null', win, stackHere()); }, 'postMessage'));
    /* left out (Safari has neither; the model has no idle periods or task priorities); a channel across tabs has no other end */
    var LEFT_OUT = ['requestIdleCallback', 'cancelIdleCallback', 'scheduler', 'BroadcastChannel'];
    for (var gone = 0; gone < LEFT_OUT.length; gone++) {
      try { delete win[LEFT_OUT[gone]]; } catch (error) { /* kept */ }
      if (LEFT_OUT[gone] in win) define(win, LEFT_OUT[gone], undefined);
    }
    if (win.Performance && win.Performance.prototype) {
      var nowDescriptor = createObject(null);
      nowDescriptor.value = function now() { return readClock(); };
      nowDescriptor.writable = true;
      nowDescriptor.enumerable = true;
      nowDescriptor.configurable = true;
      fixed(win.Performance.prototype, 'now', nowDescriptor);
    }
    var scriptedNow = function () { return config.clock + mathFloor(readClock()); };
    var Scripted = (${SCRIPTED_DATE_SOURCE})(win.Date, scriptedNow);
    (${SCRIPTED_TIME_SOURCE})(win, Scripted, scriptedNow);
    define(ET, 'addEventListener', addListener);
    define(ET, 'removeEventListener', removeListener);
    var LAYOUT = ['clientTop', 'clientLeft', 'clientWidth', 'clientHeight', 'scrollTop', 'scrollLeft', 'scrollWidth', 'scrollHeight'];
    for (var i = 0; i < LAYOUT.length; i++) wrapGetter(ElementProto, LAYOUT[i]);
    var LAYOUT_CALLS = ['getBoundingClientRect', 'getClientRects', 'scrollIntoView', 'scrollIntoViewIfNeeded', 'scrollTo', 'scrollBy', 'scroll'];
    for (var j = 0; j < LAYOUT_CALLS.length; j++) wrapMethod(ElementProto, LAYOUT_CALLS[j]);
    /* computedStyleMap() forces nothing itself; reading a layout-dependent value from the map it gives does */
    var computedMaps = new NativeWeakSet();
    var styleMapFound = ElementProto ? describeProperty(ElementProto, 'computedStyleMap') : null;
    var MapProto = win.StylePropertyMapReadOnly ? win.StylePropertyMapReadOnly.prototype : null;
    if (styleMapFound && typeof styleMapFound.value === 'function' && styleMapFound.configurable && MapProto) {
      var styleMapOf = styleMapFound.value;
      var mapDescriptor = createObject(null);
      mapDescriptor.configurable = false;
      mapDescriptor.enumerable = styleMapFound.enumerable;
      mapDescriptor.writable = false;
      mapDescriptor.value = function computedStyleMap() {
        var map = apply(styleMapOf, this, arguments);
        try { setAdd(computedMaps, map); } catch (error) { /* not an object */ }
        return map;
      };
      fixed(ElementProto, 'computedStyleMap', mapDescriptor);
      var MAP_READS = ['get', 'getAll', 'has'];
      for (var r = 0; r < MAP_READS.length; r++) {
        (function (name) {
          var found = describeProperty(MapProto, name);
          if (!found || typeof found.value !== 'function' || !found.configurable) return;
          var read = found.value;
          var readDescriptor = createObject(null);
          readDescriptor.configurable = false;
          readDescriptor.enumerable = found.enumerable;
          readDescriptor.writable = false;
          readDescriptor.value = function (property) {
            var computed = false;
            try { computed = setHas(computedMaps, this); } catch (error) { computed = false; }
            if (computed && layoutStyle(property)) noteRead('computedStyleMap');
            return apply(read, this, arguments);
          };
          fixed(MapProto, name, readDescriptor);
        })(MAP_READS[r]);
      }
      /* iterating it reads every value, the layout's among them */
      var MAP_ITERATE = ['entries', 'values', 'forEach', iteratorKey];
      for (var it = 0; it < MAP_ITERATE.length; it++) {
        (function (key) {
          var found = describeProperty(MapProto, key);
          if (!found || typeof found.value !== 'function' || !found.configurable) return;
          var iterate = found.value;
          var iterateDescriptor = createObject(null);
          iterateDescriptor.configurable = false;
          iterateDescriptor.enumerable = found.enumerable;
          iterateDescriptor.writable = false;
          iterateDescriptor.value = function () {
            var computed = false;
            try { computed = setHas(computedMaps, this); } catch (error) { computed = false; }
            if (computed) noteRead('computedStyleMap');
            return apply(iterate, this, arguments);
          };
          fixed(MapProto, key, iterateDescriptor);
        })(MAP_ITERATE[it]);
      }
    }
    var VisualProto = win.VisualViewport ? win.VisualViewport.prototype : null;
    var VISUAL = ['offsetLeft', 'offsetTop', 'pageLeft', 'pageTop', 'width', 'height', 'scale'];
    for (var vv = 0; vv < VISUAL.length; vv++) wrapGetter(VisualProto, VISUAL[vv], 'visualViewport.' + VISUAL[vv]);
    var HTMLProto = win.HTMLElement ? win.HTMLElement.prototype : null;
    var OFFSETS = ['offsetTop', 'offsetLeft', 'offsetWidth', 'offsetHeight', 'offsetParent', 'innerText'];
    for (var o = 0; o < OFFSETS.length; o++) wrapGetter(HTMLProto, OFFSETS[o]);
    wrapMethod(HTMLProto, 'focus');
    wrapMethod(win.SVGElement ? win.SVGElement.prototype : null, 'focus');
    var ImageProto = win.HTMLImageElement ? win.HTMLImageElement.prototype : null;
    var IMAGE = ['x', 'y', 'width', 'height'];
    for (var m = 0; m < IMAGE.length; m++) wrapGetter(ImageProto, IMAGE[m]);
    wrapGetter(NativeMouseEvent ? NativeMouseEvent.prototype : null, 'offsetX');
    wrapGetter(NativeMouseEvent ? NativeMouseEvent.prototype : null, 'offsetY');
    var VIEWPORT = ['scrollX', 'scrollY', 'pageXOffset', 'pageYOffset', 'innerWidth', 'innerHeight'];
    for (var v = 0; v < VIEWPORT.length; v++) wrapGetter(win, VIEWPORT[v]);
    var VIEWPORT_CALLS = ['scrollTo', 'scrollBy', 'scroll'];
    for (var w = 0; w < VIEWPORT_CALLS.length; w++) wrapMethod(win, VIEWPORT_CALLS[w]);
    var RangeProto = win.Range ? win.Range.prototype : null;
    wrapMethod(RangeProto, 'getBoundingClientRect');
    wrapMethod(RangeProto, 'getClientRects');
    wrapMethod(DocumentProto, 'elementFromPoint');
    wrapMethod(DocumentProto, 'elementsFromPoint');
    /* the handlers a tap or a message runs, in the order they were set among the listeners */
    wrapHandler(HTMLProto, 'click');
    wrapHandler(win.SVGElement ? win.SVGElement.prototype : null, 'click');
    wrapHandler(DocumentProto, 'click');
    wrapHandler(win, 'click');
    wrapHandler(win, 'message');
    /* the page's other clocks tell the scripted time too */
    clockGetter(EP, 'timeStamp', 1000);
    clockGetter(win.AnimationTimeline ? win.AnimationTimeline.prototype : null, 'currentTime', 1000);
    if (computedStyle && NativeProxy) {
      /* a computed value forces a layout only where it comes from the layout (a size, a margin); the rest needs the style
         alone, which the model doesn't count */
      var styleHandler = createObject(null);
      styleHandler.get = function (target, key) {
        var got = reflectGet(target, key);
        if (typeof got === 'function') {
          return function (name) {
            if (key === 'getPropertyValue' && layoutStyle(name)) noteRead('getComputedStyle');
            return reflectApply(got, target, arguments);
          };
        }
        if (layoutStyle(key)) noteRead('getComputedStyle');
        return got;
      };
      define(win, 'getComputedStyle', function getComputedStyle(element) {
        return new NativeProxy(apply(computedStyle, win, arguments), styleHandler);
      });
    }
    if (config.marker) {
      var markerDescriptor = createObject(null);
      markerDescriptor.value = function () {
        if (!scriptRunning) return;
        scriptRunning = false;
        depth = 0;
      };
      markerDescriptor.writable = false;
      markerDescriptor.enumerable = false;
      markerDescriptor.configurable = false;
      fixed(win, config.marker, markerDescriptor);
    }
    /* the page's scripts are over by DOMContentLoaded, whatever they did (a script that threw never calls the marker) */
    if (doc) {
      nativeAdd(win, 'DOMContentLoaded', function () {
        if (scriptRunning) {
          scriptRunning = false;
          depth = 0;
        }
      }, true);
    }
    record('task', 'script', 'script', '', 0);
  };

  return {
    install: install,
    /* after the browser's load event: the loop starts (the first frame paints the page) and runs until it is quiet, at
       most LIMITS.loadMs */
    start: function (then) {
      if (started) return then();
      started = true;
      /* the rest of the load event (the page's own onload) and its microtasks are the page's loading too */
      loading = true;
      later(function () { loading = false; }, 0);
      scriptRunning = false;
      depth = 0;
      needsPaint = true;
      nextFrame = boundaryAfter(now);
      driveTo(now + LIMITS.loadMs * 1000, true, then);
    },
    /* a customer's tap on this element, then the page runs on for LIMITS.tapMs */
    tap: function (element, then) {
      var task = record0();
      task.kind = 'tap';
      task.element = element;
      task.runAt = tapTime();
      task.cancelled = false;
      enqueue(task);
      driveTo(task.runAt + LIMITS.tapMs * 1000, false, then);
    },
    /* the page runs on for this many ms */
    wait: function (ms, then) { driveTo(now + mathMax(0, ms) * 1000, false, then); },
    /* until nothing is left to do, at most LIMITS.settleMs */
    settle: function (then) { driveTo(now + LIMITS.settleMs * 1000, true, then); },
    /* where the counts are now, for a probe's reads since it started */
    mark: function () {
      var made = record0();
      made.frames = frameLog.length;
      made.taps = tapLog.length;
      made.forced = forcedTotal;
      made.animations = animationLog.length;
      return made;
    },
    /* frames since the mark that painted an item starting with this ('spinner', 'status: Thank you'); with within (ms),
       only frames painted that soon after the probe's tap (the first since the mark, else the last before it); with
       rising, only a frame whose item's first number is more than the last one counted (steps, not frames) */
    painted: function (start, mark, within, rising) {
      var count = 0;
      var from = mark ? mark.frames : 0;
      var tapAt = -1;
      var last = -Infinity;
      if (typeof within === 'number') {
        tapAt = probeTap(mark);
        if (tapAt < 0) return 0;
        from = 0;
      }
      for (var i = from; i < frameLog.length; i++) {
        var frame = frameLog[i];
        if (tapAt >= 0 && (frame.time < tapAt || frame.time - tapAt > within * 1000)) continue;
        var item = itemOf(frame, start);
        if (item === null) continue;
        if (rising) {
          var number = firstNumber(item);
          if (!(number > last)) continue;
          last = number;
        }
        count += 1;
      }
      return count;
    },
    /* ms from the probe's tap to the first frame at or after it that painted an item starting with this; null without one */
    when: function (start, mark) {
      var tapAt = probeTap(mark);
      if (tapAt < 0) return null;
      for (var i = 0; i < frameLog.length; i++) {
        var frame = frameLog[i];
        if (frame.time >= tapAt && itemOf(frame, start) !== null) return mathFloor((frame.time - tapAt) / 10) / 100;
      }
      return null;
    },
    /* the longest wait (ms) between painted frames from the probe's tap to the first frame that painted an item starting
       with this (the tap to the first frame counts too); null without one */
    longestGap: function (start, mark) {
      var tapAt = probeTap(mark);
      if (tapAt < 0) return null;
      var last = tapAt;
      var longest = 0;
      for (var i = 0; i < frameLog.length; i++) {
        var frame = frameLog[i];
        if (frame.time < tapAt) continue;
        longest = mathMax(longest, frame.time - last);
        last = frame.time;
        if (itemOf(frame, start) !== null) return mathFloor(longest / 10) / 100;
      }
      return null;
    },
    /* fades in of a watched element that keeps its opacity: each element first painted at or after the probe's tap
       must fade in (its first painted frame at most 0.05, then a frame between 0.05 and 0.95, then, at least 96 ms after
       its first frame and painted every frame in between, a frame at 1); the value is how many did, or 0 when one of
       them didn't (a decoy beside a toast that pops) */
    faded: function (name, mark) {
      var tapAt = probeTap(mark);
      if (tapAt < 0) return 0;
      var states = createObject(null);
      var ids = list();
      for (var i = 0; i < frameLog.length; i++) {
        var frame = frameLog[i];
        var painted = frame.fades ? frame.fades[name] : null;
        for (var j = 0; painted && j < painted.length; j++) {
          var id = painted[j].id;
          var opacity = painted[j].opacity;
          var state = states[id];
          if (!state) {
            state = record0();
            state.began = frame.time;
            state.tracking = opacity <= LIMITS.fadeLow;
            state.midway = false;
            state.faded = false;
            state.last = i;
            states[id] = state;
            push(ids, id);
            continue;
          }
          /* a frame without it in between ends its fade */
          if (state.last !== i - 1) state.tracking = false;
          state.last = i;
          if (!state.tracking) continue;
          if (opacity > LIMITS.fadeLow && opacity < LIMITS.fadeHigh) state.midway = true;
          else if (opacity >= 0.999) {
            state.faded = state.midway && frame.time - state.began >= LIMITS.fadeMs * 1000;
            state.tracking = false;
          } else if (opacity <= LIMITS.fadeLow && state.midway) state.tracking = false;
        }
      }
      var count = 0;
      for (var k = 0; k < ids.length; k++) {
        var each = states[ids[k]];
        if (each.began < tapAt) continue;
        if (!each.faded) return 0;
        count += 1;
      }
      return count;
    },
    forced: function (mark) { return forcedTotal - (mark ? mark.forced : 0); },
    /* transitions and animations started since the mark on an element that matches, changing this property */
    animated: function (selector, property, mark) {
      var count = 0;
      for (var i = mark ? mark.animations : 0; i < animationLog.length; i++) {
        var each = animationLog[i];
        var matches = false;
        try { matches = matchesOf(each.element, selector); } catch (error) { matches = false; }
        if (!matches) continue;
        for (var j = 0; j < each.changes.length; j++) {
          if (each.changes[j] === property) {
            count += 1;
            break;
          }
        }
      }
      return count;
    },
    /* a console call of the page's: logged in the timeline, in the task or after it (a microtask) */
    logged: function (level, text) { record('log', depth > 0 ? 'sync' : 'microtask', text, level, 0); },
    /* Console input: a task of its own */
    run: function (fn) {
      record('task', 'console', '', '', 0);
      enter();
      try { return fn(); } finally {
        leave();
        kick();
      }
    },
    now: function () { return now; }
  };
})`
