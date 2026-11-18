// Web Storage for the Web fundamentals track (ADR 0009, chapter 3; docs/features/levels.md "The storage model"):
// `localStorage` and `sessionStorage` as the HTML Living Standard's "Web storage" section describes them, with Chrome's
// quota and words. The sealed frame has an opaque origin, where the browser's own storage throws, so this model is the
// page's storage there: one area per origin and kind (sessionStorage per origin of the page's one tab), each a list of
// keys and string values in the order they were first set, with a quota (Chromium: 10 MiB per area, counted as UTF-16,
// two bytes a code unit, so 5,242,880 code units of keys and values together).
//
// JavaScript in a string, like the cookie model (block comments only, every statement ends with a semicolon): the web
// backend runs it in the frame, and the unit tests run this very source on Node (test/unit/levels/web/storage.test.ts).
// Two halves: the areas (pure data, what the probes and the Application panel read) and what the page gets (`expose`:
// a Proxy that behaves like the browser's Storage object, named properties and all; `install`: Storage.prototype's
// methods, which find their area through a WeakMap). Every built-in it relies on is taken when the model is made (the
// bridge makes it before any of the app's code runs), lists are walked by index and written with descriptors that have no
// prototype, and the areas hand out copies only: a setter or a patched built-in of the app changes what the app itself
// sees, never an area, a probe or the panel.

/** Chromium's quota and what the Application panel gets of a load. */
export const STORAGE_LIMITS = {
  /** Code units of keys and values together in one area (Chromium's kPerStorageAreaQuota, 10 MiB of UTF-16). */
  quota: 5_242_880,
  /** Rows the panel gets per area, and characters of a key or value it shows. */
  rows: 200,
  text: 300
} as const

export type StorageKind = 'local' | 'session'

/** One area: an origin's localStorage, or its sessionStorage in the page's tab. */
export interface StorageArea {
  readonly kind: StorageKind
  readonly origin: string
  length: () => number
  key: (index: number) => string | null
  getItem: (key: string) => string | null
  /** null, or 'QuotaExceededError' (nothing changed). */
  setItem: (key: string, value: string) => 'QuotaExceededError' | null
  removeItem: (key: string) => void
  clear: () => void
  has: (key: string) => boolean
  /** Code units in use (keys and values). */
  size: () => number
  /** Copies of the items, in order. */
  entries: () => [string, string][]
}

/** What the Application panel and the probes read: every area that has items, or is the page's. */
export interface StorageSnapshot {
  kind: StorageKind
  origin: string
  items: [string, string][]
  size: number
}

export interface StorageModel {
  /** The area of this kind for this origin (made on first use). */
  area: (kind: StorageKind, origin: string) => StorageArea
  /** Every area with items, plus the ones already asked for, by kind then origin. */
  list: () => StorageSnapshot[]
  /**
   * The page's Storage object over an area: a Proxy that reads and writes through it as Chrome's does (named
   * properties, `Object.keys`, `JSON.stringify`, `delete`; Storage.prototype's own members are never hidden by an item),
   * its prototype `proto` (the frame's Storage.prototype).
   */
  expose: (area: StorageArea, proto: object) => object
  /**
   * Storage.prototype's members for objects `expose` made: getItem, setItem, removeItem, clear, key and the length
   * getter (the browser's own refuse a Proxy). `changed` runs after every write (the Application panel).
   */
  install: (proto: object, changed: () => void) => void
}

export const STORAGE_SOURCE = String.raw`(function () {
  'use strict';
  var LIMITS = ${JSON.stringify(STORAGE_LIMITS)};
  var FP = Function.prototype;
  var uncurry = FP.bind.bind(FP.call);
  var createObject = Object.create;
  var defineProperty = Object.defineProperty;
  var hasOwn = uncurry(Object.prototype.hasOwnProperty);
  var toText = String;
  var toNumber = Number;
  var NativeProxy = Proxy;
  var NativeTypeError = TypeError;
  var NativeDOMException = typeof DOMException === 'function' ? DOMException : null;
  var NativeWeakMap = WeakMap;
  var mapGet = uncurry(NativeWeakMap.prototype.get);
  var mapSet = uncurry(NativeWeakMap.prototype.set);
  var reflectGet = Reflect.get;
  var reflectSet = Reflect.set;
  var reflectHas = Reflect.has;
  var reflectDelete = Reflect.deleteProperty;
  var reflectOwnKeys = Reflect.ownKeys;
  var reflectDescribe = Reflect.getOwnPropertyDescriptor;
  var reflectDefine = Reflect.defineProperty;

  /* a descriptor without a prototype (defineProperty reads get and set through the chain too) */
  var plain = function (value, enumerable) {
    var descriptor = createObject(null);
    descriptor.value = value;
    descriptor.writable = true;
    descriptor.enumerable = enumerable;
    descriptor.configurable = true;
    return descriptor;
  };
  var put = function (list, index, item) { defineProperty(list, index, plain(item, true)); };
  var own = function (object, name) { return object !== null && typeof object === 'object' && hasOwn(object, name) ? object[name] : undefined; };
  /* WebIDL's DOMString: ToString, which refuses a Symbol */
  var domString = function (value) {
    if (typeof value === 'symbol') throw new NativeTypeError('Cannot convert a Symbol value to a string');
    return toText(value);
  };

  /* One area: its keys in the order they were first set (an overwrite keeps the place), the values by key in an object
     without a prototype, and the code units in use. */
  var createArea = function (kind, origin) {
    var keys = [];
    var values = createObject(null);
    var used = 0;
    var indexOfKey = function (key) {
      for (var i = 0; i < keys.length; i++) if (keys[i] === key) return i;
      return -1;
    };
    var area = {
      kind: kind,
      origin: origin,
      length: function () { return keys.length; },
      key: function (index) { return index >= 0 && index < keys.length ? keys[index] : null; },
      getItem: function (key) { return hasOwn(values, key) ? values[key] : null; },
      has: function (key) { return hasOwn(values, key); },
      setItem: function (key, value) {
        var old = hasOwn(values, key) ? values[key] : null;
        /* "If the storage quota would be exceeded by setting the given key to the given value, throw a QuotaExceededError" */
        var next = used - (old === null ? 0 : key.length + old.length) + key.length + value.length;
        if (next > LIMITS.quota) return 'QuotaExceededError';
        if (old === null) put(keys, keys.length, key);
        defineProperty(values, key, plain(value, true));
        used = next;
        return null;
      },
      removeItem: function (key) {
        var at = indexOfKey(key);
        if (at < 0) return;
        used -= key.length + values[key].length;
        delete values[key];
        for (var i = at; i < keys.length - 1; i++) put(keys, i, keys[i + 1]);
        keys.length -= 1;
      },
      clear: function () {
        keys.length = 0;
        values = createObject(null);
        used = 0;
      },
      size: function () { return used; },
      entries: function () {
        var out = [];
        for (var i = 0; i < keys.length; i++) put(out, i, [keys[i], values[keys[i]]]);
        return out;
      }
    };
    return area;
  };

  var areas = [];
  var area = function (kind, origin) {
    kind = kind === 'session' ? 'session' : 'local';
    origin = toText(origin);
    for (var i = 0; i < areas.length; i++) if (areas[i].kind === kind && areas[i].origin === origin) return areas[i];
    var made = createArea(kind, origin);
    put(areas, areas.length, made);
    return made;
  };
  var list = function () {
    var out = [];
    for (var pass = 0; pass < 2; pass++) {
      var kind = pass === 0 ? 'local' : 'session';
      var found = [];
      for (var i = 0; i < areas.length; i++) {
        if (areas[i].kind !== kind) continue;
        var at = found.length;
        while (at > 0 && found[at - 1].origin > areas[i].origin) { put(found, at, found[at - 1]); at--; }
        put(found, at, areas[i]);
      }
      for (var k = 0; k < found.length; k++) put(out, out.length, { kind: kind, origin: found[k].origin, items: found[k].entries(), size: found[k].size() });
    }
    return out;
  };

  /* The page's Storage objects, by the Proxy that stands for each: Storage.prototype's members find their area here. */
  var owners = new NativeWeakMap();
  var areaOf = function (object) {
    var found = object !== null && (typeof object === 'object' || typeof object === 'function') ? mapGet(owners, object) : undefined;
    if (!found) throw new NativeTypeError('Illegal invocation');
    return found;
  };
  var quotaError = function (key) {
    var message = "Failed to execute 'setItem' on 'Storage': Setting the value of '" + key + "' exceeded the quota.";
    return NativeDOMException ? new NativeDOMException(message, 'QuotaExceededError') : new NativeTypeError(message);
  };
  var needs = function (given, count, name) {
    if (given < count) throw new NativeTypeError("Failed to execute '" + name + "' on 'Storage': " + count + ' argument' + (count > 1 ? 's' : '') + ' required, but only ' + given + ' present.');
  };
  var changedHook = function () {};
  var write = function (target, key, value) {
    var problem = target.setItem(key, value);
    if (problem) throw quotaError(key);
    changedHook();
  };

  /* The page's object, as Chrome has it: an item reads, lists (Object.keys, JSON.stringify) and is set like a property,
     unless its name is one of Storage.prototype's own members (getItem, length, clear …): those stay the members, and
     setting one is an ordinary assignment (a method gets an own property beside the item, the getter-only length is
     not changed). Names from Object.prototype (toString, __proto__) don't hide an item, as in Chrome (WebIDL would hide
     them). Its prototype is Storage.prototype, and can be set as on any object. */
  var expose = function (target, proto) {
    var member = function (key) { return hasOwn(proto, key); };
    var self = null;
    var base = createObject(null);
    var current = proto;
    var visible = function (key) { return typeof key === 'string' && target.has(key) && !member(key) && !hasOwn(base, key); };
    var handler = createObject(null);
    handler.get = function (object, key, receiver) {
      if (visible(key)) return target.getItem(key);
      if (hasOwn(object, key)) return reflectGet(object, key, receiver);
      return current === null ? undefined : reflectGet(current, key, receiver);
    };
    handler.set = function (object, key, value, receiver) {
      if (receiver === self && typeof key === 'string' && !hasOwn(object, key) && !member(key)) { write(target, key, domString(value)); return true; }
      /* a member's name: the ordinary assignment along the prototype chain (an own property, or nothing for a getter) */
      if (!hasOwn(object, key) && current !== null) return reflectSet(current, key, value, receiver);
      return reflectSet(object, key, value, receiver);
    };
    handler.has = function (object, key) { return visible(key) || reflectHas(object, key) || (current !== null && reflectHas(current, key)); };
    handler.deleteProperty = function (object, key) {
      if (visible(key)) { target.removeItem(key); changedHook(); return true; }
      return reflectDelete(object, key);
    };
    handler.ownKeys = function (object) {
      var keys = [];
      var items = target.entries();
      for (var i = 0; i < items.length; i++) if (visible(items[i][0])) put(keys, keys.length, items[i][0]);
      var mine = reflectOwnKeys(object);
      for (var k = 0; k < mine.length; k++) put(keys, keys.length, mine[k]);
      return keys;
    };
    handler.getOwnPropertyDescriptor = function (object, key) {
      if (visible(key)) return plain(target.getItem(key), true);
      return reflectDescribe(object, key);
    };
    handler.defineProperty = function (object, key, descriptor) {
      if (typeof key === 'string' && !hasOwn(object, key) && !member(key)) {
        /* "If IsDataDescriptor(Desc) is false, then return false"; else the named setter with Desc.[[Value]] */
        if (!hasOwn(descriptor, 'value') && !hasOwn(descriptor, 'writable')) return false;
        write(target, key, domString(own(descriptor, 'value')));
        return true;
      }
      return reflectDefine(object, key, descriptor);
    };
    handler.getPrototypeOf = function () { return current; };
    handler.setPrototypeOf = function (object, value) {
      if (value !== null && typeof value !== 'object' && typeof value !== 'function') return false;
      current = value;
      return true;
    };
    handler.preventExtensions = function () { return false; };
    handler.isExtensible = function () { return true; };
    self = new NativeProxy(base, handler);
    mapSet(owners, self, target);
    return self;
  };

  /* Storage.prototype's members, as WebIDL defines operations (writable, enumerable, configurable) and the length
     attribute (an enumerable, configurable getter). The browser's own refuse anything but a real Storage object. */
  var install = function (proto, changed) {
    changedHook = typeof changed === 'function' ? changed : function () {};
    var method = function (name, fn) { defineProperty(proto, name, plain(fn, true)); };
    method('key', function key(index) {
      var target = areaOf(this);
      needs(arguments.length, 1, 'key');
      /* WebIDL's unsigned long: ToNumber, then modulo 2^32 */
      var at = toNumber(index);
      at = at !== at || at === Infinity || at === -Infinity ? 0 : at < 0 ? (4294967296 - (-at % 4294967296)) % 4294967296 : at % 4294967296;
      return target.key(at - at % 1);
    });
    method('getItem', function getItem(key) {
      var target = areaOf(this);
      needs(arguments.length, 1, 'getItem');
      return target.getItem(domString(key));
    });
    method('setItem', function setItem(key, value) {
      var target = areaOf(this);
      needs(arguments.length, 2, 'setItem');
      write(target, domString(key), domString(value));
    });
    method('removeItem', function removeItem(key) {
      var target = areaOf(this);
      needs(arguments.length, 1, 'removeItem');
      target.removeItem(domString(key));
      changedHook();
    });
    method('clear', function clear() {
      areaOf(this).clear();
      changedHook();
    });
    var length = createObject(null);
    length.get = function length() { return areaOf(this).length(); };
    length.enumerable = true;
    length.configurable = true;
    defineProperty(proto, 'length', length);
  };

  return { area: area, list: list, expose: expose, install: install };
})`
