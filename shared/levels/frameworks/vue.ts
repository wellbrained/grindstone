// Real Vue in the sealed frame (ADR 0010; docs/features/levels.md "The Framework deep dives environment"). The frame
// gets two modules besides the level's own: Vue's development ESM browser build (as `vue.esm-browser.js`, its one
// "development build" notice taken out) and the module the app imports, `vue`: a facade that re-exports all of Vue and
// wraps `computed`, `watch`, `watchEffect` (and its post and sync forms) and `createApp`, so every reaction Vue makes is
// reported to the bridge for the Reactivity panel and the `reactions` probes. The wrappers call the real function with
// the app's own arguments (its own onTrack and onTrigger kept), so Vue does exactly what it would do without them. The
// facade takes its channel to the bridge from a one-shot name on the window and deletes it before the app's code runs.
// JavaScript in a string; tested in a real browser (e2e/frameworks-levels.spec.ts).

/** The name the real build has in the frame's import map (never a file of the level, never linked from a stack). */
export const VUE_MODULE = 'vue.esm-browser.js'

/** What the development build prints once when it starts; the app never asked for it, so the frame doesn't get it. */
export const VUE_NOTICE = 'console.info(\n        `You are running a development build of Vue.\nMake sure to use the production build (*.prod.js) when deploying for production.`\n      );'

/** Vue's development build as the frame gets it: the start-up notice taken out (an error when the build no longer has it). */
export function prepareVue(source: string): string {
  if (!source.includes(VUE_NOTICE)) throw new Error('Vue\'s development notice moved: update VUE_NOTICE')
  return source.replace(VUE_NOTICE, '')
}

/**
 * At most this many reactions are posted a load (`reactions`) and kept for the probes (`kept`), and this many trigger
 * texts each, the newest (the facade and the bridge cut what they pass on).
 */
export const REACTION_LIMITS = { reactions: 1000, kept: 20000, why: 8, text: 120 } as const

/** A fresh name per load for the facade's channel to the bridge (on the window until the facade takes it). */
export function reactionHook(): string {
  const words = globalThis.crypto.getRandomValues(new Uint32Array(2))
  return `__gsReactions${words[0]!.toString(36)}${words[1]!.toString(36)}`
}

/** The kinds of reaction the facade reports. */
export const REACTION_KINDS = ['render', 'computed', 'watch', 'effect'] as const
export type ReactionKind = typeof REACTION_KINDS[number]

/**
 * The `vue` module the app imports, reporting to `window[hook]`. A reaction is posted as `{ kind, name, why, stack }`:
 * `name` a component's name (renders only), `why` what triggered it in Vue's own debugger events ('set .value: 1 → 2',
 * 'add [3]', 'mount', 'props'), `stack` where the computed or watcher was made (raw; the page maps it to the app's files).
 */
export function vueFacade(hook: string): string {
  return `import * as Vue from '${VUE_MODULE}';
export * from '${VUE_MODULE}';
const report = window[${JSON.stringify(hook)}];
delete window[${JSON.stringify(hook)}];
const isArray = Array.isArray;
const short = function (value) {
  let text;
  try {
    if (Vue.isRef(value)) text = 'Ref';
    else if (typeof value === 'string') text = JSON.stringify(value);
    else if (typeof value === 'function') text = 'function';
    else if (isArray(value)) text = 'Array(' + value.length + ')';
    else if (value instanceof Map) text = 'Map(' + value.size + ')';
    else if (value instanceof Set) text = 'Set(' + value.size + ')';
    else if (value !== null && typeof value === 'object') text = '{…}';
    else text = String(value);
  } catch (error) { text = '?'; }
  return text.length > 40 ? text.slice(0, 39) + '…' : text;
};
const describe = function (event) {
  /* a computed it reads went stale: Vue's event then names no target, key or type */
  if (event.type === undefined) return 'a computed it reads changed';
  const key = event.key === undefined ? '' : typeof event.key === 'symbol' ? '' : String(event.key);
  const target = event.target;
  const where = target && Vue.isRef(target) ? '.value' : isArray(target) && /^\\d+$/.test(key) ? '[' + key + ']' : key ? '.' + key : '';
  const type = String(event.type);
  if (type === 'set') return 'set ' + where + ': ' + short(event.oldValue) + ' → ' + short(event.newValue);
  if (type === 'add') return 'add ' + where + ': ' + short(event.newValue);
  if (type === 'delete') return 'delete ' + where;
  if (type === 'clear') return 'clear';
  return type + (where ? ' ' + where : '');
};
const send = function (kind, name, why, stack) {
  if (typeof report === 'function') report(kind, name, why, stack);
};
const origin = function () {
  try { return String(new Error().stack || ''); } catch (error) { return ''; }
};
const watching = function (options, pending) {
  const own = Object.assign({}, options);
  const theirs = own.onTrigger;
  own.onTrigger = function (event) {
    pending.push(describe(event));
    if (pending.length > ${REACTION_LIMITS.why}) pending.shift();
    if (typeof theirs === 'function') return theirs(event);
  };
  return own;
};
export function computed(getterOrOptions, debugOptions) {
  const stack = origin();
  const pending = [];
  const wrap = function (get) {
    return function (previous) {
      const why = pending.splice(0);
      send('computed', '', why.length ? why : ['first read'], stack);
      return get.call(this, previous);
    };
  };
  const options = watching(debugOptions, pending);
  if (typeof getterOrOptions === 'function') return Vue.computed(wrap(getterOrOptions), options);
  return Vue.computed({ get: wrap(getterOrOptions.get), set: getterOrOptions.set }, options);
}
export function watch(source, callback, options) {
  const stack = origin();
  const pending = [];
  const own = watching(options, pending);
  const reacting = typeof callback === 'function' ? function () {
    const why = pending.splice(0);
    send('watch', '', why.length ? why : ['immediate'], stack);
    return callback.apply(this, arguments);
  } : callback;
  return Vue.watch(source, reacting, own);
}
const effect = function (fn, options, stack) {
  const pending = [];
  const own = watching(options, pending);
  const reacting = typeof fn === 'function' ? function () {
    const why = pending.splice(0);
    send('effect', '', why.length ? why : ['first run'], stack);
    return fn.apply(this, arguments);
  } : fn;
  return Vue.watchEffect(reacting, own);
};
export function watchEffect(fn, options) {
  return effect(fn, options, origin());
}
export function watchPostEffect(fn, options) {
  return effect(fn, Object.assign({}, options, { flush: 'post' }), origin());
}
export function watchSyncEffect(fn, options) {
  return effect(fn, Object.assign({}, options, { flush: 'sync' }), origin());
}
const nameOf = function (instance) {
  const type = instance && instance.type;
  return String((type && (type.name || type.__name)) || 'Anonymous').slice(0, 60);
};
const triggers = new WeakMap();
const RENDERS = {
  renderTriggered(event) {
    const list = triggers.get(this.$) || [];
    list.push(describe(event));
    triggers.set(this.$, list);
  },
  beforeMount() {
    send('render', nameOf(this.$), ['mount'], '');
  },
  beforeUpdate() {
    const list = triggers.get(this.$) || [];
    triggers.delete(this.$);
    send('render', nameOf(this.$), list.length ? list : ['props'], '');
  }
};
export function createApp() {
  const app = Vue.createApp.apply(null, arguments);
  app.mixin(RENDERS);
  return app;
}
`
}
