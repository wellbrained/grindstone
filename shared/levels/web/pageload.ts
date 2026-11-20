// Chapter 7's page load inside the sealed frame (ADR 0009; docs/features/levels.md "The policy model"): the modelled
// browser loads the page the way Chrome does once it has the page's headers. The frame's own policy stays as it is,
// and sandbox.ts adds a second real one for these levels that only takes away (`script-src 'nonce-…' blob:
// 'unsafe-eval'`): the browser itself then runs no inline script, no inline event handler and no script from an
// address, only what this loader hands it (blob URLs, and inline code with the load's nonce) after the policy model said
// yes. So nothing of the page's (or of an attacker's text in it) runs past the page's policy, in any of the three
// engines, and the sandbox is never weaker than in any other track.
//
// - The page's `<script>` elements arrive inert (sandbox.ts gives them a type no browser runs, in place, lines kept).
//   The document request goes to server.js first (the web backend's `security.load`): its answer's headers are the
//   page's policies, and its body must be index.html (nonce values aside: a page server.js fills with a fresh nonce is
//   still the page); anything else is what the frame shows instead, as text. Then the meta tags of the head, then each
//   script in document order: an inline one by its nonce or hash, a `src` one by the policy, then its request through
//   the same backend (status, type, X-Content-Type-Options), then it runs as a blob (or inline with the load's nonce).
// - Inline event handlers (`onerror="…"` on an element, in index.html or written later by a script) are found by a
//   MutationObserver set up before anything else; each gets a listener that asks the model when the event comes and,
//   allowed, runs the handler's code with the scope a browser gives it (document, form, element). The browser's own
//   attempt is refused by the real policy (its violation event is no line of the page's).
// - A `<script>` the page's code adds (appendChild and its kin) is made inert before it is inserted and then loaded by
//   the model as not parser-inserted ('strict-dynamic' trusts it), with its load or error event on the element.
// - The probes' "next XSS" (`inject`): markup an attacker gets into the page some other day, asked of the model as the
//   browser would ask, and run when allowed.
//
// It takes every built-in it uses when the bridge makes it, before the app runs. What it leaves out (the feature doc's
// "What the model simplifies"): the page's scripts run after the page is parsed (DOMContentLoaded and load have fired
// already: a script finds the whole page, and readyState is 'complete'), a module's imports, `document.write`, handlers
// on body for the window (`<body onload>`), `javascript:` URLs, styles.

/** The class of type sandbox.ts gives the page's scripts: no browser runs a script of this type. */
export const INERT_SCRIPT_TYPE = 'text/x-grindstone-script'

/** The attribute that numbers each inert script (its place in PageLoadConfig.scripts). */
export const SCRIPT_INDEX = 'data-grindstone-script'

/**
 * A script tag with a nonce attribute, as both sandbox.ts (the page as saved) and the loader (the page as served) read
 * them: the k-th match is the k-th nonce in either text, which are equal but for those values.
 */
export const NONCE_TAG = String.raw`(<script\b[^>]*?\snonce\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)`

/** The attribute a meta tag's http-equiv becomes (the frame's real policy must never be the page's). */
export const INERT_HTTP_EQUIV = 'data-grindstone-http-equiv'

/** What sandbox.ts tells the loader about the page's scripts, in document order. */
export interface PageScript {
  module: boolean
  /** Which nonce attribute of index.html it carries (the k-th `<script … nonce=…>` in the text), or -1. */
  nonce: number
  /**
   * When the browser runs it: 0 while parsing (a classic script without async or defer, inline or not), 1 once parsed
   * (a module, a classic defer), 2 when it arrives (async: here after the others, in document order).
   */
  when: 0 | 1 | 2
  /** The line of index.html its tag starts on. */
  line: number
}

export interface PageLoadConfig {
  scripts: PageScript[]
  /** The nonce of the frame's own second policy (the bridge's script, the import map and every inline script it runs carry it). */
  nonce: string
  /** index.html as saved: what server.js must answer the page with. */
  pageSource: string
  /** The level's files the page's origin serves under their names (a script from there is named so in traces). */
  files: string[]
}

export const PAGE_LOAD_SOURCE = String.raw`(function (config, hooks) {
  'use strict';
  var FP = Function.prototype;
  var uncurry = FP.bind.bind(FP.call);
  var describe = Object.getOwnPropertyDescriptor;
  var protoOf = Object.getPrototypeOf;
  var createObject = Object.create;
  var defineProperty = Object.defineProperty;
  var accessor = function (object, name, kind) {
    for (var at = object; at; at = protoOf(at)) {
      var found = describe(at, name);
      if (found) return found[kind] ? uncurry(found[kind]) : null;
    }
    return null;
  };
  var win = hooks.win;
  var doc = hooks.doc;
  var security = hooks.security;
  var post = hooks.post;
  var later = setTimeout;
  var NativeFunction = Function;
  var NativeEvent = Event;
  var NativeBlob = Blob;
  var NativeWeakMap = WeakMap;
  var makeUrl = URL.createObjectURL;
  var weakGet = uncurry(NativeWeakMap.prototype.get);
  var weakSet = uncurry(NativeWeakMap.prototype.set);
  var listen = uncurry(EventTarget.prototype.addEventListener);
  var dispatch = uncurry(EventTarget.prototype.dispatchEvent);
  var preventDefault = uncurry(NativeEvent.prototype.preventDefault);
  var getAttribute = uncurry(Element.prototype.getAttribute);
  var setAttribute = uncurry(Element.prototype.setAttribute);
  /* the element's nonce slot (the browser's check reads it), set without an attribute */
  var setNonceSlot = accessor(HTMLElement.prototype, 'nonce', 'set');
  var hasAttribute = uncurry(Element.prototype.hasAttribute);
  var attributesOf = accessor(Element.prototype, 'attributes', 'get');
  var mapLength = accessor(NamedNodeMap.prototype, 'length', 'get');
  var mapItem = uncurry(NamedNodeMap.prototype.item);
  var attrName = accessor(Attr.prototype, 'name', 'get');
  var tagOf = accessor(Element.prototype, 'tagName', 'get');
  var parentOf = accessor(Node.prototype, 'parentNode', 'get');
  var nextOf = accessor(Node.prototype, 'nextSibling', 'get');
  var nodeTypeOf = accessor(Node.prototype, 'nodeType', 'get');
  var formOf = function (element) { try { var form = element.form; return form && typeof form === 'object' ? form : null; } catch (error) { return null; } };
  var textOf = accessor(Node.prototype, 'textContent', 'get');
  var setText = accessor(Node.prototype, 'textContent', 'set');
  var insertBefore = uncurry(Node.prototype.insertBefore);
  var appendChild = uncurry(Node.prototype.appendChild);
  var replaceChildren = uncurry(Element.prototype.replaceChildren);
  var createElement = uncurry(Document.prototype.createElement);
  var querySelectorAll = uncurry(Document.prototype.querySelectorAll);
  var elementQueryAll = uncurry(Element.prototype.querySelectorAll);
  var listLength = accessor(NodeList.prototype, 'length', 'get');
  var listItem = uncurry(NodeList.prototype.item);
  var bodyOf = accessor(Document.prototype, 'body', 'get');
  var headOf = accessor(Document.prototype, 'head', 'get');
  var lower = uncurry(String.prototype.toLowerCase);
  var trimText = uncurry(String.prototype.trim);
  var hasOwnField = uncurry(Object.prototype.hasOwnProperty);
  var slice = uncurry(String.prototype.slice);
  var replaceText = uncurry(String.prototype.replace);
  var repeatText = uncurry(String.prototype.repeat);
  var exec = uncurry(RegExp.prototype.exec);
  var charAt = uncurry(String.prototype.charAt);
  var apply = Reflect.apply;
  var toNumber = Number;
  var toText = String;
  var NativeMutationObserver = MutationObserver;
  var observe = uncurry(NativeMutationObserver.prototype.observe);
  var recordType = accessor(MutationRecord.prototype, 'type', 'get');
  var recordTarget = accessor(MutationRecord.prototype, 'target', 'get');
  var recordAdded = accessor(MutationRecord.prototype, 'addedNodes', 'get');
  var recordName = accessor(MutationRecord.prototype, 'attributeName', 'get');
  var isScript = function (node) { return !!node && nodeTypeOf(node) === 1 && tagOf(node) === 'SCRIPT'; };
  var put = function (list, item) {
    var entry = createObject(null);
    entry.value = item;
    entry.writable = true;
    entry.enumerable = true;
    entry.configurable = true;
    defineProperty(list, list.length, entry);
  };

  /* --- the page's state: loading until the policy is known, then running its scripts, then loaded ------------------ */
  var state = 'loading';
  var waiting = [];
  var heldEvents = [];
  var whenLoaded = function (then) {
    if (state === 'loaded') { later(then, 0); return; }
    put(waiting, then);
  };
  var loaded = function () {
    state = 'loaded';
    for (var i = 0; i < waiting.length; i++) later(waiting[i], 0);
    waiting = [];
  };

  /* --- inline event handlers ------------------------------------------------------------------------------------- */
  var handled = new NativeWeakMap();
  /* the handler's code with the scope a browser gives it: the document, the element's form, the element (sloppy mode,
     so "with"); a syntax error throws where the event comes, as Chrome reports it there */
  var compile = function (code) {
    return new NativeFunction('__grindstoneScope', 'return function (event) { with (__grindstoneScope[0]) { with (__grindstoneScope[1]) { with (__grindstoneScope[2]) {\n' + code + '\n} } } };');
  };
  var runHandler = function (element, name, event) {
    var code = getAttribute(element, name);
    if (code === null) return;
    if (!security.inline('handler', code, null, null)) return;
    var form = formOf(element);
    var handler = compile(code)([doc, form || createObject(null), element]);
    if (apply(handler, element, [event]) === false) preventDefault(event);
  };
  var onHandlerEvent = function (element, name) {
    return function (event) {
      if (state === 'loading') { put(heldEvents, [element, name, event]); return; }
      runHandler(element, name, event);
    };
  };
  var watchHandlers = function (element) {
    var attributes = attributesOf(element);
    var names = weakGet(handled, element);
    for (var i = 0; i < mapLength(attributes); i++) {
      var name = lower(attrName(mapItem(attributes, i)));
      if (slice(name, 0, 2) !== 'on' || name.length < 3) continue;
      if (!names) { names = createObject(null); weakSet(handled, element, names); }
      if (names[name]) continue;
      names[name] = true;
      listen(element, slice(name, 2), onHandlerEvent(element, name));
    }
  };
  var watchTree = function (node) {
    if (!node || nodeTypeOf(node) !== 1) return;
    watchHandlers(node);
    var all = elementQueryAll(node, '*');
    for (var i = 0; i < listLength(all); i++) watchHandlers(listItem(all, i));
  };
  var watcher = new NativeMutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      if (recordType(record) === 'attributes') {
        var name = recordName(record);
        if (name && lower(slice(name, 0, 2)) === 'on') watchHandlers(recordTarget(record));
        continue;
      }
      var added = recordAdded(record);
      for (var j = 0; j < listLength(added); j++) watchTree(listItem(added, j));
    }
  });

  /* --- scripts -------------------------------------------------------------------------------------------------- */
  var nonceAttribute = function (element) { return hasAttribute(element, 'nonce') ? getAttribute(element, 'nonce') : null; };
  var named = function (url, body) {
    var blob = makeUrl(new NativeBlob([body], { type: 'text/javascript' }));
    if (url) {
      var path = slice(toText(url), hooks.origin.length + 1);
      var known = false;
      for (var f = 0; f < config.files.length; f++) if (config.files[f] === path) known = true;
      if (slice(toText(url), 0, hooks.origin.length + 1) === hooks.origin + '/' && known) {
        var urls = createObject(null);
        urls[blob] = path;
        post({ type: 'files', urls: urls });
      }
    }
    return blob;
  };
  /* What the page's code reads of a script's nonce, as Chrome shows it under a header policy: the served value from the
     element's nonce property, an empty attribute. */
  var showNonce = function (element, nonce) {
    if (nonce === null) return;
    try {
      setAttribute(element, 'nonce', '');
      defineProperty(element, 'nonce', { configurable: true, enumerable: false, get: function () { return nonce; }, set: function () {} });
    } catch (error) { /* kept */ }
  };
  /* Runs code the model allowed, right after where its element is: a blob for a script from an address (load or error
     comes on the copy), inline code with the load's nonce in its slot (no attribute; lines padded so traces keep
     index.html's); the copy shows the page's own nonce, as the original does */
  var runCopy = function (original, module, src, body, line, then, nonce) {
    var copy = createElement(doc, 'script');
    if (module) setAttribute(copy, 'type', 'module');
    showNonce(copy, typeof nonce === 'string' ? nonce : null);
    var done = false;
    security.busy(1);
    var finish = function (ok) { if (!done) { done = true; security.busy(-1); then(ok); } };
    if (src !== null) {
      setAttribute(copy, 'src', named(src, body));
      listen(copy, 'load', function () { finish(true); });
      listen(copy, 'error', function () { finish(false); });
    } else {
      if (setNonceSlot) setNonceSlot(copy, config.nonce);
      else setAttribute(copy, 'nonce', config.nonce);
      setText(copy, repeatText('\n', line > 1 ? line - 1 : 0) + body);
    }
    var parent = parentOf(original);
    if (parent) insertBefore(parent, copy, nextOf(original));
    else appendChild(headOf(doc), copy);
    if (src === null) later(function () { finish(true); }, 0);
  };
  var fire = function (element, type) { try { dispatch(element, new NativeEvent(type)); } catch (error) { /* gone */ } };
  /* every address whose script ran (its copy loaded): the probes ask (ran), the page can't add to it */
  var ranFrom = createObject(null);
  /* One script: the policy (and for src, its request) decide; then({ ran }) */
  var loadScript = function (element, module, parserInserted, line, nonce, then) {
    var src = getAttribute(element, 'src');
    if (src !== null) {
      security.script(src, nonce, parserInserted, module, line, function (result) {
        if (!result.ran) { fire(element, 'error'); return then(false); }
        runCopy(element, module, result.url, result.body, line, function (ok) {
          if (ok) ranFrom[result.url] = (ranFrom[result.url] || 0) + 1;
          fire(element, ok ? 'load' : 'error');
          then(ok);
        }, nonce);
      });
      return;
    }
    var code = textOf(element);
    if (!security.inline('script', code, nonce, line, parserInserted)) return later(function () { then(false); }, 0);
    runCopy(element, module, null, code, line, then, nonce);
  };

  /* A <script> the page's code adds: made inert before it goes in, then loaded as not parser-inserted */
  var adopted = new NativeWeakMap();
  /* HTML's JavaScript MIME type essences */
  var JAVASCRIPT_TYPES = ['application/ecmascript', 'application/javascript', 'application/x-ecmascript', 'application/x-javascript', 'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2', 'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5', 'text/jscript', 'text/livescript', 'text/x-ecmascript', 'text/x-javascript'];
  var isJavaScript = function (essence) {
    for (var i = 0; i < JAVASCRIPT_TYPES.length; i++) if (JAVASCRIPT_TYPES[i] === essence) return true;
    return false;
  };
  var take = function (node) {
    if (!isScript(node) || weakGet(adopted, node)) return null;
    var type = getAttribute(node, 'type');
    var essence = type === null ? '' : lower(trimText(type));
    var kind = essence === '' ? 'classic' : essence === 'module' ? 'module' : isJavaScript(essence) ? 'classic' : null;
    if (kind === 'classic' && hasAttribute(node, 'nomodule')) return null;
    if (kind === null) return null;
    weakSet(adopted, node, true);
    var nonce = null;
    try { nonce = node.nonce || nonceAttribute(node); } catch (error) { nonce = nonceAttribute(node); }
    setAttribute(node, 'type', '${INERT_SCRIPT_TYPE}');
    return { node: node, module: kind === 'module', nonce: nonce };
  };
  var adopt = function (taken) {
    for (var i = 0; i < taken.length; i++) {
      (function (item) {
        if (state === 'loading') { put(heldScripts, item); return; }
        loadScript(item.node, item.module, false, null, item.nonce, function () {});
      })(taken[i]);
    }
  };
  var heldScripts = [];
  var wrapInsertion = function (proto, name, nodesOf) {
    var original = proto[name];
    if (typeof original !== 'function') return;
    var wrapped = {
      [name]: function () {
        var taken = [];
        var nodes = nodesOf(arguments);
        for (var i = 0; i < nodes.length; i++) {
          var item = take(nodes[i]);
          if (item) put(taken, item);
        }
        var args = [];
        for (var a = 0; a < arguments.length; a++) put(args, arguments[a]);
        var result = apply(original, this, args);
        if (taken.length) adopt(taken);
        return result;
      }
    }[name];
    try { defineProperty(proto, name, { value: wrapped, writable: true, configurable: true, enumerable: false }); } catch (error) { /* kept */ }
  };
  var firstArg = function (args) { return args.length ? [args[0]] : []; };
  var allArgs = function (args) { var out = []; for (var i = 0; i < args.length; i++) put(out, args[i]); return out; };
  var secondArg = function (args) { return args.length > 1 ? [args[1]] : []; };

  /* --- the document's answer, the meta tags, the scripts in order --------------------------------------------------- */
  /* index.html with every nonce attribute's value taken out, and the values in order */
  /* by hand with the engine's own matcher taken first (replace and a new RegExp would be the app's by now) */
  var NONCE = new RegExp(${JSON.stringify(NONCE_TAG)}, 'gi');
  var withoutNonces = function (html) {
    var out = '';
    var from = 0;
    var match;
    NONCE.lastIndex = 0;
    while ((match = exec(NONCE, html)) !== null) {
      out += slice(html, from, match.index) + match[1] + '""';
      from = NONCE.lastIndex;
    }
    return out + slice(html, from);
  };
  var noncesOf = function (html) {
    var found = [];
    var match;
    NONCE.lastIndex = 0;
    while ((match = exec(NONCE, html)) !== null) {
      var value = match[2];
      if (charAt(value, 0) === '"' || charAt(value, 0) === '\'') value = slice(value, 1, -1);
      put(found, value);
    }
    return found;
  };
  /* every 'nonce-…' source written in a text (a policy) */
  var NONCE_SOURCE = /'nonce-([A-Za-z0-9+/_=-]+)'/gi;
  var nonceSources = function (text) {
    var found = [];
    var match;
    NONCE_SOURCE.lastIndex = 0;
    while ((match = exec(NONCE_SOURCE, text)) !== null) put(found, match[1]);
    return found;
  };
  var showInstead = function (text) {
    var body = bodyOf(doc);
    if (!body) return;
    var pre = createElement(doc, 'pre');
    setText(pre, text);
    replaceChildren(body, pre);
  };
  var answer = null;
  var parsed = false;
  var proceed = function () {
    if (!answer || !parsed || state !== 'loading') return;
    var served = answer;
    if (!served.ok || withoutNonces(served.body) !== withoutNonces(config.pageSource)) {
      state = 'running';
      showInstead(served.status === null
        ? 'This site can\'t be reached: ' + hooks.origin + ' did not answer (' + served.body + ').'
        : served.ok ? served.body : served.body || 'HTTP ERROR ' + served.status);
      return loaded();
    }
    var nonces = noncesOf(served.body);
    /* the meta tags as the parser met them: in the head a policy (or Chrome's line on why not), outside it ignored */
    var metas = querySelectorAll(doc, 'meta[${INERT_HTTP_EQUIV}], meta[name]');
    var head = headOf(doc);
    for (var m = 0; m < listLength(metas); m++) {
      var meta = listItem(metas, m);
      var equiv = getAttribute(meta, '${INERT_HTTP_EQUIV}');
      var content = getAttribute(meta, 'content');
      if (equiv === null) {
        if (lower(getAttribute(meta, 'name') || '') === 'referrer' && content !== null) security.referrerMeta(content);
        continue;
      }
      security.meta(equiv, content === null ? '' : content, parentOf(meta) === head, null);
    }
    state = 'running';
    for (var h = 0; h < heldEvents.length; h++) runHandler(heldEvents[h][0], heldEvents[h][1], heldEvents[h][2]);
    heldEvents = [];
    /* each inert script by the number sandbox.ts gave it (a script in a template or a comment has none in the document),
       its nonce the served page's at the same place */
    var scripts = querySelectorAll(doc, 'script[${SCRIPT_INDEX}]');
    var order = [];
    for (var s = 0; s < listLength(scripts); s++) {
      var element = listItem(scripts, s);
      var at = toNumber(getAttribute(element, '${SCRIPT_INDEX}'));
      if (!(at >= 0 && at < config.scripts.length && at % 1 === 0) || getAttribute(element, 'type') !== '${INERT_SCRIPT_TYPE}') continue;
      var about = config.scripts[at];
      var nonce = about.nonce >= 0 && about.nonce < nonces.length ? nonces[about.nonce] : null;
      showNonce(element, nonce);
      put(order, { element: element, about: about, nonce: nonce });
    }
    /* the parser's scripts first, then the deferred ones and modules, then async ones, each group in document order */
    var pass = 0;
    var index = 0;
    var next = function () {
      while (pass < 3) {
        while (index < order.length && order[index].about.when !== pass) index += 1;
        if (index < order.length) break;
        pass += 1;
        index = 0;
      }
      if (pass >= 3) {
        var held = heldScripts;
        heldScripts = [];
        adopt(held);
        return loaded();
      }
      var item = order[index];
      index += 1;
      loadScript(item.element, item.about.module, true, item.about.line, item.nonce, function () { next(); });
    };
    next();
  };

  /* --- the probes' next XSS ------------------------------------------------------------------------------------- */
  /* what an attacker gets into the page another day, asked of the model as the browser would: 'ran' or 'refused'
     (or 'failed': allowed, but it never arrived) */
  var inject = function (step, then) {
    var kind = toText(step.inject);
    if (kind === 'handler') {
      var code = typeof step.code === 'string' ? step.code : '';
      if (!security.inline('handler', code, null, null)) return then('refused');
      try { compile(code)([doc, createObject(null), bodyOf(doc) || doc]).call(bodyOf(doc), new NativeEvent('error')); } catch (error) { /* the attacker's code: what it does is its own */ }
      return then('ran');
    }
    if (kind === 'inline') {
      var text = typeof step.code === 'string' ? step.code : '';
      var run = function (nonces) {
        for (var i = 0; i < nonces.length; i++) {
          if (!security.inline('script', text, nonces[i], null, true)) continue;
          try { (0, NativeFunction(text))(); } catch (error) { /* its own */ }
          return then('ran');
        }
        then('refused');
      };
      /* 'seen': the page asked for again exactly as Lena's browser asked, from the running server.js and from a fresh
         one; each answer must be the page (else the probe fails), and the attacker tries every nonce in them */
      if (step.nonce === 'seen') {
        return security.peek(function (answers) {
          var seen = [];
          for (var a = 0; a < answers.length; a++) {
            var given = answers[a];
            if (!given.ok || withoutNonces(given.body) !== withoutNonces(config.pageSource)) return then('failed');
            var found = noncesOf(given.body);
            for (var f = 0; f < found.length; f++) put(seen, found[f]);
            /* a nonce the policies (the header's, a meta tag's in the body) name is one the attacker sees too */
            var named = nonceSources(given.body + ' ' + toText(given.policies));
            for (var g = 0; g < named.length; g++) put(seen, named[g]);
          }
          /* each nonce once */
          var tried = [];
          for (var t = 0; t < seen.length; t++) {
            var again = false;
            for (var u = 0; u < tried.length; u++) if (tried[u] === seen[t]) again = true;
            if (!again) put(tried, seen[t]);
          }
          run(tried.length ? tried : [null]);
        });
      }
      return run([typeof step.nonce === 'string' ? step.nonce : null]);
    }
    if (kind === 'src') {
      return security.script(toText(step.src), null, true, false, null, function (result) {
        var refused = hasOwnField(result, 'refused') && result.refused === true;
        then(result.ran ? 'ran' : result.url === null ? 'failed' : refused ? 'refused' : 'failed');
      });
    }
    if (kind === 'img' || kind === 'connect') return then(security.allows(kind, toText(step.src)) ? 'ran' : 'refused');
    return then('failed');
  };

  return {
    /* before anything of the page's: the handler watch, the insertion wrappers, the document request */
    start: function () {
      observe(watcher, doc, { childList: true, subtree: true, attributes: true });
      var nodeProto = Node.prototype;
      var elementProto = Element.prototype;
      wrapInsertion(nodeProto, 'appendChild', firstArg);
      wrapInsertion(nodeProto, 'insertBefore', firstArg);
      wrapInsertion(nodeProto, 'replaceChild', firstArg);
      wrapInsertion(elementProto, 'append', allArgs);
      wrapInsertion(elementProto, 'prepend', allArgs);
      wrapInsertion(elementProto, 'before', allArgs);
      wrapInsertion(elementProto, 'after', allArgs);
      wrapInsertion(elementProto, 'replaceWith', allArgs);
      wrapInsertion(elementProto, 'insertAdjacentElement', secondArg);
      wrapInsertion(Document.prototype, 'append', allArgs);
      listen(doc, 'DOMContentLoaded', function () { parsed = true; proceed(); });
      security.load(function (result) { answer = result; proceed(); });
    },
    whenLoaded: whenLoaded,
    inject: inject,
    /* how often a script from this address ran (its copy loaded) */
    ran: function (address) {
      var key = toText(address);
      return ranFrom[key] || 0;
    }
  };
})`
