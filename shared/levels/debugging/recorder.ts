// The recorder: the part of the bridge that runs only in a recorded load (chapter 5, ADR 0007 "Breakpoints"), as the
// global the instrumented modules call (instrument.ts). Before each statement it reads the values the statement can see
// and keeps them as plain data: strings cut, objects only a few levels deep and a few dozen entries wide, cycles as a
// reference, getters never called (a getter shows as "(...)"), functions, elements, promises and errors as one line.
// It keeps the call stack from the calls it is told about (a function starts, ends, waits at an `await` or `yield`, comes
// back); a function back from an `await` shows the calls that started it as async frames. Steps go to the page in
// batches (never a message per step). It stops on its own after RECORD_LIMITS.maxSteps steps, or once reading values has
// taken RECORD_LIMITS.maxMs in all (a huge object read at every step), and on the page's Stop; the app runs on as usual.
// A Proxy can't be told from its target, so reading one runs its traps (`instanceof`, keys, descriptors): a known limit.
// JavaScript in a string, like the bridge (one line there): block comments only, every statement ends with a semicolon.
// Tested on Node in test/unit/levels/debugging/instrument.test.ts, in a browser in e2e/debugging-breakpoints.spec.ts.

/** The recorder's global in the frame, which the instrumented code calls (instrument.ts never touches a file that uses it). */
export const RECORDER_GLOBAL = '__gs$'

/** How much a recording keeps (the page reads steps with the same numbers). */
export const RECORD_LIMITS = {
  /** Steps in one recording: then it stops ("steps"). */
  maxSteps: 2000,
  /** Object levels opened below a variable (deeper objects show as `{…}`). */
  maxDepth: 3,
  /** Properties shown of one object. */
  maxEntries: 40,
  /** Items shown of one array, map or set. */
  maxItems: 50,
  /** Characters kept of a string. */
  maxString: 200,
  /** Values read for one step before objects stop being opened. */
  maxNodes: 400,
  /** Frames of one call stack. */
  maxFrames: 30,
  /** Milliseconds spent reading values in one recording: then it stops ("slow"). */
  maxMs: 3000,
  /** Steps per message to the page. */
  batch: 100
} as const

export type RecordLimits = { -readonly [K in keyof typeof RECORD_LIMITS]: number }

/** Why a recording ended: the page's Stop, the step cap, or values too slow to read. */
export type RecordEndReason = 'stopped' | 'steps' | 'slow'

/** One call the recorder knows about (the instrumented code holds its token). */
export interface Invocation {
  id: number
  fn: number
  point: number
}

/** The recorder as the instrumented code sees it (its global, RECORDER_GLOBAL). */
export interface RecorderRuntime {
  on: boolean
  /** A function (or a module's top level) starts: its token. */
  e: (fn: number, module: 0 | 1) => Invocation
  /** It ends (returns or throws). */
  x: (call: Invocation) => void
  /** It waits (`await`, `yield`): hands the value on. */
  w: <T>(call: Invocation, value: T) => T
  /** It is back: hands what it waited for on. */
  r: <T>(call: Invocation, value: T) => T
  /** A statement is about to run: its point, its call and readers of the values it can see. */
  s: (point: number, call: Invocation, getters: (() => unknown)[]) => void
  stop: (reason: RecordEndReason) => void
}

export const RECORDER_SOURCE = String.raw`(function (limits, host) {
  'use strict';
  var post = host.post;
  var now = host.now;
  var describe = host.describe;
  var later = setTimeout;
  var cancel = clearTimeout;
  var microtask = typeof queueMicrotask === 'function' ? queueMicrotask : function (fn) { Promise.resolve().then(fn); };
  var keysOf = Object.keys;
  var property = Object.getOwnPropertyDescriptor;
  var protoOf = Object.getPrototypeOf;
  var isArray = Array.isArray;
  var isView = ArrayBuffer.isView;
  var fnSource = Function.prototype.toString;
  var symbolText = Symbol.prototype.toString;
  var dateIso = Date.prototype.toISOString;
  var dateTime = Date.prototype.getTime;
  var regexpText = RegExp.prototype.toString;
  var mapSize = property(Map.prototype, 'size').get;
  var setSize = property(Set.prototype, 'size').get;
  var mapEntries = Map.prototype.entries;
  var setValues = Set.prototype.values;
  var mapNext = protoOf(new Map().entries()).next;
  var setNext = protoOf(new Set().values()).next;
  var weakGet = WeakMap.prototype.get;
  var weakSet = WeakMap.prototype.set;
  var NativeMap = Map;
  var NativeSet = Set;
  var NativePromise = Promise;
  var NativeError = Error;
  var NativeDate = Date;
  var NativeRegExp = RegExp;
  var NativeDataView = DataView;
  var DomNode = typeof Node === 'function' ? Node : null;
  var global = typeof window !== 'undefined' ? window : globalThis;

  var api = { on: true };
  var stack = [];
  var calls = 0;
  var resetQueued = false;
  var count = 0;
  var spent = 0;
  var buffer = [];
  var timer = null;
  var busy = false;
  var ids = new WeakMap();
  var nextId = 1;
  var budget = 0;
  var path = [];

  /* Once the code that runs now has finished (the JavaScript stack is empty), no call is running any more: a module's
     top level never says it ended, and a call that threw past an await is caught up here. */
  var reset = function () { resetQueued = false; stack.length = 0; };
  var queueReset = function () {
    if (resetQueued) return;
    resetQueued = true;
    microtask(reset);
  };
  var frameOf = function (call) { return [call.id, call.fn, call.point]; };
  var frames = function () {
    var list = [];
    for (var i = stack.length - 1; i >= 0 && list.length < limits.maxFrames; i--) list.push(frameOf(stack[i]));
    return list;
  };

  api.e = function (fn, module) {
    var call = { id: ++calls, fn: fn, point: -1, parents: null, resumed: false };
    if (!api.on) return call;
    if (module) stack.length = 0;
    queueReset();
    call.parents = frames();
    stack.push(call);
    return call;
  };
  api.x = function (call) {
    if (!api.on) return;
    var at = stack.lastIndexOf(call);
    if (at >= 0) stack.length = at;
  };
  api.w = function (call, value) {
    api.x(call);
    return value;
  };
  api.r = function (call, value) {
    if (api.on) {
      queueReset();
      stack.push(call);
      call.resumed = true;
    }
    return value;
  };
  /* A step of a call that is not on top: the calls above it have ended; one that is not on the stack at all is back
     from an await that threw. */
  var heal = function (call) {
    if (stack[stack.length - 1] === call) return;
    var at = stack.lastIndexOf(call);
    if (at >= 0) stack.length = at + 1;
    else {
      stack.push(call);
      call.resumed = true;
    }
  };

  var cut = function (text, max) { return text.length > max ? text.slice(0, max) : text; };
  var idOf = function (object) {
    var id = weakGet.call(ids, object);
    if (!id) {
      id = nextId++;
      weakSet.call(ids, object, id);
    }
    return id;
  };
  /* A property's value without calling a getter (undefined for a getter), up the prototype chain. */
  var dataValue = function (object, key) {
    for (var target = object, hops = 0; target && hops < 32; target = protoOf(target), hops++) {
      var found = property(target, key);
      if (found) return 'value' in found ? found.value : undefined;
    }
    return undefined;
  };
  var functionText = function (fn) {
    var source = '';
    try { source = fnSource.call(fn); } catch (error) { source = ''; }
    var own = property(fn, 'name');
    var name = own && typeof own.value === 'string' ? cut(own.value, 80) : '';
    if (/^class\b/.test(source)) return 'class ' + name;
    var params = /^[^(=]*\(([^)]*)\)/.exec(source.slice(0, 400));
    var single = params ? null : /^(?:async\s+)?([\w$]+)\s*=>/.exec(source.slice(0, 200));
    return 'ƒ ' + name + '(' + (params ? cut(params[1].replace(/\s+/g, ' ').trim(), 80) : single ? single[1] : '') + ')';
  };
  var className = function (object) {
    var proto = protoOf(object);
    if (proto === null || proto === Object.prototype) return '';
    var maker = property(proto, 'constructor');
    var fn = maker && typeof maker.value === 'function' ? maker.value : null;
    var own = fn ? property(fn, 'name') : null;
    return own && typeof own.value === 'string' ? cut(own.value, 60) : '';
  };
  var keyText = function (key) {
    if (typeof key === 'string') return "'" + cut(key, 60) + "'";
    if (key === null || typeof key !== 'object' && typeof key !== 'function') return cut(String(typeof key === 'symbol' ? symbolText.call(key) : key), 60);
    return typeof key === 'function' ? 'ƒ' : '{…}';
  };
  var nodeText = function (node) {
    if (node.nodeType === 1) return describe(node);
    var name = dataValue(node, 'nodeName');
    return typeof name === 'string' ? name.toLowerCase() : 'node';
  };
  var summary = function (object, c, n) { return { t: 'object', id: idOf(object), c: c, n: n, e: null, more: 0 }; };

  var read = function (value, depth) {
    budget--;
    if (value === undefined) return { t: 'undefined' };
    if (value === null) return { t: 'null' };
    var type = typeof value;
    if (type === 'boolean') return { t: 'boolean', v: value };
    if (type === 'number') return { t: 'number', v: value };
    if (type === 'string') return value.length > limits.maxString ? { t: 'string', v: value.slice(0, limits.maxString), full: value.length } : { t: 'string', v: value };
    if (type === 'bigint') return { t: 'bigint', v: cut(String(value), 100) };
    if (type === 'symbol') return { t: 'symbol', v: cut(symbolText.call(value), 100) };
    if (type === 'function') return { t: 'function', v: functionText(value) };
    try {
      if (value === global) return summary(value, 'Window', null);
      if (DomNode && value instanceof DomNode) return { t: 'element', v: cut(nodeText(value), 120) };
      if (value instanceof NativePromise) return { t: 'promise' };
      if (value instanceof NativeError) {
        var name = dataValue(value, 'name');
        var message = dataValue(value, 'message');
        return { t: 'error', v: cut((typeof name === 'string' ? name : 'Error') + (typeof message === 'string' && message ? ': ' + message : ''), 200) };
      }
      if (value instanceof NativeDate) {
        var time = dateTime.call(value);
        return { t: 'date', v: time === time ? dateIso.call(value) : 'Invalid Date' };
      }
      if (value instanceof NativeRegExp) return { t: 'regexp', v: cut(regexpText.call(value), 200) };
      if (path.indexOf(value) >= 0) return { t: 'ref', id: idOf(value) };
      return object(value, depth);
    } catch (error) {
      return summary(value, '', null);
    }
  };

  var object = function (value, depth) {
    var array = isArray(value);
    var typed = !array && isView(value) && !(value instanceof NativeDataView);
    var map = !array && value instanceof NativeMap;
    var set = !array && value instanceof NativeSet;
    var c = array ? 'Array' : className(value);
    var n = array || typed ? value.length : map ? mapSize.call(value) : set ? setSize.call(value) : null;
    if (depth >= limits.maxDepth || budget <= 0) return summary(value, c, n);
    var entries = [];
    var more = 0;
    path.push(value);
    try {
      var i;
      var found;
      if (array || typed) {
        var shown = Math.min(n, limits.maxItems);
        for (i = 0; i < shown; i++) {
          found = property(value, String(i));
          if (found) entries.push([String(i), 'value' in found ? read(found.value, depth + 1) : { t: 'getter' }]);
        }
        more = n - shown;
      } else if (map || set) {
        var it = map ? mapEntries.call(value) : setValues.call(value);
        var next = map ? mapNext : setNext;
        var item;
        for (i = 0; i < limits.maxItems && !(item = next.call(it)).done; i++) {
          entries.push(map ? [keyText(item.value[0]), read(item.value[1], depth + 1)] : [String(i), read(item.value, depth + 1)]);
        }
        more = n - i;
      } else {
        var keys = keysOf(value);
        var count = Math.min(keys.length, limits.maxEntries);
        for (i = 0; i < count; i++) {
          found = property(value, keys[i]);
          if (found) entries.push([cut(keys[i], 100), 'value' in found ? read(found.value, depth + 1) : { t: 'getter' }]);
        }
        more = keys.length - count;
      }
    } catch (error) {
      /* a hostile object (a proxy that throws): what was read so far */
    } finally {
      path.pop();
    }
    return { t: 'object', id: idOf(value), c: c, n: n, e: entries, more: more };
  };

  var flush = function () {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
    if (!buffer.length) return;
    var steps = buffer;
    buffer = [];
    post({ type: 'steps', steps: steps });
  };

  api.s = function (point, call, getters) {
    if (!api.on || busy) return;
    queueReset();
    heal(call);
    call.point = point;
    if (count >= limits.maxSteps) {
      api.stop('steps');
      return;
    }
    busy = true;
    var started = now();
    try {
      budget = limits.maxNodes;
      var values = [];
      for (var i = 0; i < getters.length; i++) {
        var got = null;
        try { got = { value: getters[i]() }; } catch (error) { got = null; }
        values.push(got ? read(got.value, 0) : { t: 'uninitialized' });
      }
      var list = frames();
      var asyncAt = -1;
      var bottom = stack[0];
      if (bottom && bottom.resumed && bottom.parents && bottom.parents.length && list.length < limits.maxFrames) {
        asyncAt = list.length;
        list = list.concat(bottom.parents.slice(0, limits.maxFrames - list.length));
      }
      buffer.push([point, call.id, list, asyncAt, values]);
      count++;
    } finally {
      busy = false;
    }
    spent += now() - started;
    if (spent > limits.maxMs) {
      api.stop('slow');
      return;
    }
    if (buffer.length >= limits.batch) flush();
    else if (timer === null) timer = later(flush, 50);
  };

  api.stop = function (reason) {
    if (!api.on) return;
    api.on = false;
    stack.length = 0;
    flush();
    post({ type: 'recordEnd', reason: reason, count: count });
  };

  return api;
})`
