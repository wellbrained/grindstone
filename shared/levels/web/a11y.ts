// The accessibility model of Web fundamentals' chapter 6 (ADR 0009; docs/features/levels.md "The accessibility model"):
// what a screen reader gets from the page and what a keyboard does on it, computed from the real DOM in the sealed frame.
//
// Real where every engine already agrees, modelled where they don't:
// - **The tree is computed from the real DOM and the browser's computed styles**, after the specs as Chrome implements
//   them: roles (HTML-AAM's implicit roles, an explicit `role`'s first known token, presentational roles and their
//   conflicts), what is left out (`aria-hidden`, `hidden` and `display: none`, `visibility: hidden`, a closed
//   `<details>`, `inert`, what a modal dialog makes inert, and while focus is inside an `aria-modal` dialog everything
//   outside it), names (the Accessible Name and Description Computation 1.2: aria-labelledby, aria-label, labels, alt,
//   legend, an SVG's title, content for the roles that take their name from it, CSS generated content, Chrome's
//   placeholder before title), descriptions (aria-describedby, aria-description, title), values and states (checked,
//   expanded, pressed, selected, disabled, invalid, required, a heading's level).
// - **Focus and the keyboard are the model's**: which elements are focusable and in the Tab order (tabindex, disabled
//   controls, radio groups, inert content), Tab and Shift+Tab with Chrome's sequential focus navigation starting point,
//   Enter and Space activation (a button clicks on both, a link on Enter, a checkbox on Space, a div on neither), Escape
//   on a modal dialog. The page's `focus()`, `blur()`, `document.activeElement` and a dialog's `showModal()`, `show()`
//   and `close()` are the model's, with focus events dispatched in Chrome's order; the browser's own focus never moves
//   (a check run must not take the keyboard from Grindstone, and engines disagree about focus in a frame that isn't
//   focused). Key and focus events are the model's own (`isTrusted` false), so all three engines see the same.
// - **Live regions after Chrome**: a change is announced when its live region (aria-live polite or assertive, role
//   status, log, alert, an output) was already on the page and shown at the previous MutationObserver delivery; a
//   region inserted or made live together with its text says nothing, except a role="alert" that appears (Chrome fires
//   an alert event for it). aria-atomic reads the whole region.
// - **What a screen reader reads**: when focus moves (the dialog it entered, then the element: name, role, value,
//   states, description), when a state or the name of the focused element changes, when a live region announces, and
//   when Tab leaves the page.
//
// A11Y_SOURCE is JavaScript in a string (like the event loop model): the bridge runs it in the frame before any of the
// app's code, and the unit tests run it on happy-dom. Hardened like the other models: every built-in it uses is taken
// when it is made, its records are objects without a prototype, lists are written with a descriptor without a prototype,
// and nothing live goes to the page (only plain text).

/**
 * The model's numbers: a task boundary a frame (16 ms) after a change; after a key, quiet is 60 ms without a change (at
 * most 1 s); per load at most 300 reader lines and 400 tree rows; texts cut at 300; a name computation walks
 * at most 2,000 nodes and 40 levels deep; the Tab order looks at 5,000 elements; a probe's Tab presses at most 100; at
 * most 200 live regions followed.
 */
export const A11Y_LIMITS = {
  /** The model's task boundary comes a frame after a change (Chrome updates its tree once a frame). */
  frameMs: 16,
  /** After a key a probe waits until the page made no change for this long (at most quietMaxMs). */
  quietMs: 60,
  quietMaxMs: 1000,
  lines: 300,
  rows: 400,
  text: 300,
  nameNodes: 2000,
  depth: 40,
  elements: 5000,
  presses: 100,
  regions: 200
} as const

/** What the frame gets (`sandbox.web.a11y`). */
export interface A11yConfig {
  limits: typeof A11Y_LIMITS
}

export function a11yConfig(): A11yConfig {
  return { limits: A11Y_LIMITS }
}

/** What the reader said: focus moved, a dialog entered, a state or the name changed, a live region, Tab left the page. */
export type ReaderKind = 'focus' | 'dialog' | 'state' | 'name' | 'polite' | 'assertive' | 'leave'

export interface ReaderLine {
  kind: ReaderKind
  /** What it says ('Add Butter croissant, button', 'expanded', 'Enter a whole email address'); '' for an element hidden from screen readers. */
  text: string
  /**
   * The modelled key it followed: the last one pressed before it ('Tab', 'Enter'; what a timer said after Enter too),
   * 'user' after a real click or key in the app you see, '' before any.
   */
  key: string
  /** Said while the check run's probes ran (not part of what the prediction is about). */
  probe: boolean
}

export const READER_KINDS: readonly ReaderKind[] = ['focus', 'dialog', 'state', 'name', 'polite', 'assertive', 'leave']

/** The keys the modelled keyboard has. */
export const A11Y_KEYS = ['Tab', 'Shift+Tab', 'Enter', 'Space', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const
export type A11yKey = typeof A11Y_KEYS[number]

/** One row of the Accessibility panel's tree. */
export interface A11yRow {
  depth: number
  /** The computed role ('button', 'heading', 'text' for a text, 'document' for the page). */
  role: string
  name: string
  /** A field's value, a select's chosen option ('' when none). */
  value: string
  /** The states as the reader says them ('expanded', 'not checked', 'level 2', 'disabled'). */
  states: string[]
  description: string
  focused: boolean
}

/** A reader line as the facts and the tests write it: 'focus: Add Butter croissant, button'. */
export const heardLine = (line: Pick<ReaderLine, 'kind' | 'text'>): string => `${line.kind}: ${line.text}`

/** What the prediction is about: every line the reader said outside the check run's probes (the scene's), in order. */
export function heardFacts(lines: readonly ReaderLine[]): string[] {
  return lines.filter(line => !line.probe).map(heardLine)
}

// Runs inside the frame as part of the bridge (one line: block comments only, every statement ends with a semicolon), and
// in the unit tests. `hooks`: `win` (the window it installs on), `post` (to the page), `check` (a check run: the browser's
// own focus events never reach the page, and nothing is drawn).
export const A11Y_SOURCE = String.raw`(function (config, hooks) {
  'use strict';
  var win = hooks.win;
  var doc = win.document;
  var post = hooks.post;
  var check = hooks.check === true;
  var LIMITS = config.limits;

  /* The built-ins the model uses, taken now, before any of the app's code runs. */
  var FP = Function.prototype;
  var uncurry = FP.bind.bind(FP.call);
  var bindTo = uncurry(FP.bind);
  var createObject = Object.create;
  var define = Object.defineProperty;
  var describeProperty = Object.getOwnPropertyDescriptor;
  var protoOf = Object.getPrototypeOf;
  var toText = String;
  var lowerCase = uncurry(String.prototype.toLowerCase);
  var sliceText = uncurry(String.prototype.slice);
  var indexIn = uncurry(String.prototype.indexOf);
  var codeAt = uncurry(String.prototype.charCodeAt);
  var execPattern = uncurry(RegExp.prototype.exec);
  var accessor = function (object, name, kind) {
    for (var at = object; at; at = protoOf(at)) {
      var found = describeProperty(at, name);
      if (found) return found[kind] ? uncurry(found[kind]) : null;
    }
    return null;
  };
  /* A property's getter as a plain function of the object; one without an accessor (a test DOM) is read directly. */
  var getter = function (object, name) {
    var found = object ? accessor(object, name, 'get') : null;
    return found || function (target) { return target[name]; };
  };
  var setter = function (object, name) { return object ? accessor(object, name, 'set') : null; };
  var method = function (object, name) {
    var fn = object ? object[name] : null;
    return typeof fn === 'function' ? uncurry(fn) : null;
  };
  /* An object without a prototype: no field it lacks can come from something the app put on Object.prototype. */
  var fields = function (names, values) {
    var made = createObject(null);
    for (var i = 0; i < names.length; i++) made[names[i]] = values[i];
    return made;
  };
  /* Appends to a list without going through a setter the app may have put on Array.prototype's indices. */
  var put = function (list, value) {
    define(list, list.length, fields(['value', 'writable', 'enumerable', 'configurable'], [value, true, true, true]));
  };
  var has = function (list, value) {
    for (var i = 0; i < list.length; i++) if (list[i] === value) return true;
    return false;
  };

  var proto = function (name) { var made = win[name]; return made ? made.prototype : null; };
  var EP = proto('Element');
  var NP = proto('Node');
  var HP = proto('HTMLElement');
  var SP = proto('SVGElement');
  var DP = proto('Document');
  var inputProto = proto('HTMLInputElement');
  var selectProto = proto('HTMLSelectElement');
  var dialogProto = proto('HTMLDialogElement');
  var getAttr = uncurry(EP.getAttribute);
  var hasAttr = uncurry(EP.hasAttribute);
  var setAttr = uncurry(EP.setAttribute);
  var removeAttr = uncurry(EP.removeAttribute);
  var matchesOf = uncurry(EP.matches);
  var localNameOf = getter(EP, 'localName');
  var namespaceOf = getter(EP, 'namespaceURI');
  var firstChildOf = getter(NP, 'firstChild');
  var nextSiblingOf = getter(NP, 'nextSibling');
  var parentOf = getter(NP, 'parentNode');
  var nodeTypeOf = getter(NP, 'nodeType');
  var connectedOf = getter(NP, 'isConnected');
  var containsOf = uncurry(NP.contains);
  var positionOf = uncurry(NP.compareDocumentPosition);
  var appendTo = uncurry(NP.appendChild);
  var dataOf = getter(proto('CharacterData'), 'data');
  var byId = uncurry(DP.getElementById);
  var queryAll = uncurry(DP.querySelectorAll);
  var queryInside = uncurry(EP.querySelectorAll);
  var createIn = uncurry(DP.createElement);
  var bodyOf = getter(DP, 'body');
  var rootOf = getter(DP, 'documentElement');
  var titleOf = getter(DP, 'title');
  var nativeActive = getter(protoOf(doc) || DP, 'activeElement');
  var listLength = getter(proto('NodeList'), 'length');
  var listItem = uncurry(proto('NodeList').item);
  var collectionLength = getter(proto('HTMLCollection'), 'length');
  var collectionItem = method(proto('HTMLCollection'), 'item');
  var computedOf = uncurry(win.getComputedStyle);
  var styleValue = uncurry(proto('CSSStyleDeclaration').getPropertyValue);
  var editableOf = getter(HP, 'isContentEditable');
  var clickOn = uncurry(HP.click);
  var rectOf = uncurry(EP.getBoundingClientRect);
  var sampleRect = proto('DOMRectReadOnly') || proto('DOMRect');
  var rectLeft = fields(['left', 'top', 'width', 'height'], [getter(sampleRect, 'left'), getter(sampleRect, 'top'), getter(sampleRect, 'width'), getter(sampleRect, 'height')]);
  var shadowOf = method(EP, 'attachShadow');
  var dispatch = uncurry(proto('EventTarget').dispatchEvent);
  var listen = uncurry(proto('EventTarget').addEventListener);
  var stopNow = uncurry(proto('Event').stopImmediatePropagation);
  var eventTargetOf = getter(proto('Event'), 'target');
  var eventTypeOf = getter(proto('Event'), 'type');
  var NativeEvent = win.Event;
  var NativeFocusEvent = win.FocusEvent || win.Event;
  var NativeKeyboardEvent = win.KeyboardEvent || win.Event;
  var NativeError = win.DOMException || Error;
  var later = bindTo(win.setTimeout, win);
  var nativeSetTimeout = win.setTimeout;
  var nativeClearTimeout = win.clearTimeout;
  var applyTo = uncurry(FP.apply);
  var toNumberOf = Number;
  var labelsBy = fields(['input', 'select', 'textarea', 'button', 'meter', 'output', 'progress'], [
    getter(inputProto, 'labels'), getter(selectProto, 'labels'), getter(proto('HTMLTextAreaElement'), 'labels'), getter(proto('HTMLButtonElement'), 'labels'),
    getter(proto('HTMLMeterElement'), 'labels'), getter(proto('HTMLOutputElement'), 'labels'), getter(proto('HTMLProgressElement'), 'labels')
  ]);
  var checkedOf = getter(inputProto, 'checked');
  var mixedOf = getter(inputProto, 'indeterminate');
  var inputValueOf = getter(inputProto, 'value');
  var inputTypeOf = getter(inputProto, 'type');
  var areaValueOf = getter(proto('HTMLTextAreaElement'), 'value');
  var selectedOptionsOf = getter(selectProto, 'selectedOptions');
  var optionTextOf = getter(proto('HTMLOptionElement'), 'text');
  var optionSelectedOf = getter(proto('HTMLOptionElement'), 'selected');
  var detailsOpenOf = getter(proto('HTMLDetailsElement'), 'open');
  var returnValueSet = setter(dialogProto, 'returnValue');
  var NativeObserver = win.MutationObserver || null;
  var recordProto = proto('MutationRecord');
  var recordTypeOf = getter(recordProto, 'type');
  var recordTargetOf = getter(recordProto, 'target');
  var recordAddedOf = getter(recordProto, 'addedNodes');
  var takeRecordsOf = NativeObserver ? uncurry(NativeObserver.prototype.takeRecords) : null;
  var observeOf = NativeObserver ? uncurry(NativeObserver.prototype.observe) : null;
  var SVG = 'http://www.w3.org/2000/svg';

  /* Text helpers that use no built-in the app could have replaced. */
  var SPACE = /^\s$/;
  var isSpace = function (character) { return execPattern(SPACE, character) !== null; };
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
  var hasText = function (text) {
    for (var i = 0; i < text.length; i++) if (!isSpace(text[i])) return true;
    return false;
  };
  var cut = function (text, max) { return text.length > max ? sliceText(text, 0, max - 1) + '…' : text; };
  var join = function (a, b) { return a === '' ? b : b === '' ? a : a + ' ' + b; };
  /* The whitespace-separated tokens of an attribute's value, lower case or as written. */
  var tokens = function (value, lower) {
    var list = [];
    var word = '';
    for (var i = 0; i <= value.length; i++) {
      var character = i < value.length ? value[i] : ' ';
      if (isSpace(character)) {
        if (word !== '') put(list, lower ? lowerCase(word) : word);
        word = '';
      } else {
        word += character;
      }
    }
    return list;
  };
  /* The HTML standard's rules for parsing integers (a tabindex): optional whitespace, a sign, digits; null when invalid. */
  var integer = function (value) {
    if (value === null) return null;
    var i = 0;
    while (i < value.length && isSpace(value[i])) i++;
    var sign = 1;
    if (value[i] === '-') { sign = -1; i++; } else if (value[i] === '+') { i++; }
    var digits = 0;
    var number = 0;
    while (i < value.length && value[i] >= '0' && value[i] <= '9') {
      number = number * 10 + (codeAt(value, i) - 48);
      digits++;
      i++;
    }
    return digits ? sign * number : null;
  };

  /* --- the DOM, read through the functions taken above --- */
  var isElement = function (node) { return !!node && nodeTypeOf(node) === 1; };
  var isText = function (node) { return !!node && nodeTypeOf(node) === 3; };
  var tagOf = function (element) { var name = localNameOf(element); return name ? toText(name) : ''; };
  var attr = function (element, name) { var value = getAttr(element, name); return value === null ? null : toText(value); };
  var attrIs = function (element, name, expected) { var value = attr(element, name); return value !== null && lowerCase(squash(value)) === expected; };
  var parentElement = function (node) { var parent = parentOf(node); return isElement(parent) ? parent : null; };
  var css = function (element, name, pseudo) {
    try { return toText(styleValue(computedOf(win, element, pseudo || null), name)); } catch (error) { return ''; }
  };
  var each = function (list, visit) {
    var length = list ? listLength(list) : 0;
    for (var i = 0; i < length; i++) visit(listItem(list, i));
  };
  /* A record's added nodes: a NodeList in a browser (a test DOM may hand an array) */
  var addedLength = function (list) {
    try { var length = listLength(list); if (typeof length === 'number') return length; } catch (error) { /* not a NodeList */ }
    return list.length;
  };
  var addedAt = function (list, index) {
    try { var node = listItem(list, index); if (node) return node; } catch (error) { /* not a NodeList */ }
    return list[index];
  };
  var childrenOf = function (node, visit) {
    for (var child = firstChildOf(node); child; child = nextSiblingOf(child)) visit(child);
  };

  /* Grindstone's own elements (the focus ring) are never part of the page. */
  var ring = null;
  var ours = function (node) { return ring !== null && (node === ring.host || containsOf(ring.host, node)); };

  /* --- what is left out of the tree and the Tab order --- */
  var firstSummary = function (details) {
    for (var child = firstChildOf(details); child; child = nextSiblingOf(child)) if (isElement(child) && tagOf(child) === 'summary') return child;
    return null;
  };
  var detailsOpen = function (details) { try { return !!detailsOpenOf(details); } catch (error) { return hasAttr(details, 'open'); } };
  /* display: none. Firefox computes no style at all in a frame that is itself out of sight (the app you see behind
     another tab on a phone): there the hidden attribute stands in until it is shown again. */
  var displayNone = function (element) {
    var display = css(element, 'display');
    return display === 'none' || (display === '' && hasAttr(element, 'hidden'));
  };
  /* Not rendered: display: none on it or an ancestor, or inside a closed <details> (not its summary). */
  var notRendered = function (element) {
    for (var node = element; isElement(node); node = parentElement(node)) {
      if (displayNone(node)) return true;
      var parent = parentElement(node);
      if (parent && tagOf(parent) === 'details' && !detailsOpen(parent) && firstSummary(parent) !== node) return true;
    }
    return false;
  };
  var invisible = function (element) { var value = css(element, 'visibility'); return value === 'hidden' || value === 'collapse'; };
  /* The model's modal dialogs (showModal), the topmost last: everything outside the top one is inert. */
  var modals = [];
  var topModal = function () {
    while (modals.length) {
      var dialog = modals[modals.length - 1];
      if (connectedOf(dialog) && hasAttr(dialog, 'open')) return dialog;
      modals.length -= 1;
    }
    return null;
  };
  var isInert = function (element) {
    for (var node = element; isElement(node); node = parentElement(node)) if (hasAttr(node, 'inert')) return true;
    var modal = topModal();
    return modal !== null && !containsOf(modal, element);
  };
  var EXCLUDED = fields(['head', 'script', 'style', 'template', 'noscript', 'meta', 'link', 'title', 'base'], [1, 1, 1, 1, 1, 1, 1, 1, 1]);
  var excludedTag = function (element) {
    var tag = tagOf(element);
    if (EXCLUDED[tag]) return true;
    return tag === 'input' && lowerCase(toText(inputTypeOf(element))) === 'hidden';
  };
  /* While focus is inside an aria-modal dialog, Chrome leaves everything outside it out of the tree (Tab still goes there). */
  var focused = null;
  var ariaModal = function () {
    for (var node = focused; isElement(node); node = parentElement(node)) {
      var role = explicitRole(node);
      if ((role === 'dialog' || role === 'alertdialog') && attrIs(node, 'aria-modal', 'true')) return node;
    }
    return null;
  };
  /* Left out of the tree: why ('subtree': nothing in it either; 'self': only it, its children decide for themselves), or null. */
  var hiddenWhy = function (element) {
    if (!connectedOf(element) || ours(element) || excludedTag(element)) return 'subtree';
    if (attrIs(element, 'aria-hidden', 'true') || hasAttr(element, 'inert')) return 'subtree';
    if (displayNone(element)) return 'subtree';
    var parent = parentElement(element);
    if (parent && tagOf(parent) === 'details' && !detailsOpen(parent) && firstSummary(parent) !== element) return 'subtree';
    var modal = topModal();
    if (modal !== null && !containsOf(modal, element) && !containsOf(element, modal)) return 'subtree';
    var active = ariaModal();
    if (active !== null && !containsOf(active, element) && !containsOf(element, active)) return 'subtree';
    return invisible(element) ? 'self' : null;
  };
  /* An element on its own is left out: an ancestor or itself. */
  var hiddenFromTree = function (element) {
    if (!isElement(element) || !connectedOf(element) || ours(element)) return true;
    for (var node = element; isElement(node); node = parentElement(node)) {
      if (excludedTag(node) || attrIs(node, 'aria-hidden', 'true') || hasAttr(node, 'inert')) return true;
    }
    if (isInert(element)) return true;
    var active = ariaModal();
    if (active !== null && !containsOf(active, element)) return true;
    return notRendered(element) || invisible(element);
  };

  /* --- roles: an explicit role's first known token, else HTML-AAM's implicit one --- */
  var ROLE = createObject(null);
  var ROLE_NAMES = ['alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote', 'button', 'caption', 'cell', 'checkbox', 'code', 'columnheader', 'combobox', 'complementary', 'contentinfo', 'definition', 'deletion', 'dialog', 'document', 'emphasis', 'feed', 'figure', 'form', 'generic', 'grid', 'gridcell', 'group', 'heading', 'img', 'insertion', 'link', 'list', 'listbox', 'listitem', 'log', 'main', 'marquee', 'math', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'meter', 'navigation', 'none', 'note', 'option', 'paragraph', 'presentation', 'progressbar', 'radio', 'radiogroup', 'region', 'row', 'rowgroup', 'rowheader', 'scrollbar', 'search', 'searchbox', 'separator', 'slider', 'spinbutton', 'status', 'strong', 'subscript', 'superscript', 'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox', 'time', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem'];
  for (var r = 0; r < ROLE_NAMES.length; r++) ROLE[ROLE_NAMES[r]] = true;
  var setOf = function (names) {
    var made = createObject(null);
    for (var i = 0; i < names.length; i++) made[names[i]] = true;
    return made;
  };
  var FROM_CONTENT = setOf(['button', 'cell', 'checkbox', 'columnheader', 'gridcell', 'heading', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'radio', 'row', 'rowheader', 'switch', 'tab', 'tooltip', 'treeitem']);
  var LEAF = setOf(['button', 'checkbox', 'img', 'math', 'meter', 'menuitemcheckbox', 'menuitemradio', 'option', 'progressbar', 'radio', 'scrollbar', 'separator', 'slider', 'switch', 'tab', 'textbox', 'searchbox', 'combobox', 'spinbutton', 'listbox']);
  var EXPANDABLE = setOf(['application', 'button', 'checkbox', 'combobox', 'gridcell', 'link', 'listbox', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'row', 'rowheader', 'columnheader', 'switch', 'tab', 'treeitem']);
  var SELECTABLE = setOf(['option', 'tab', 'row', 'gridcell', 'treeitem', 'columnheader', 'rowheader']);
  var CHECKABLE = setOf(['checkbox', 'radio', 'switch', 'menuitemcheckbox', 'menuitemradio']);
  var GLOBAL_ARIA = ['aria-atomic', 'aria-busy', 'aria-controls', 'aria-current', 'aria-describedby', 'aria-description', 'aria-details', 'aria-dropeffect', 'aria-flowto', 'aria-grabbed', 'aria-keyshortcuts', 'aria-label', 'aria-labelledby', 'aria-live', 'aria-owns', 'aria-relevant', 'aria-roledescription'];
  var explicitRole = function (element) {
    var value = attr(element, 'role');
    if (value === null) return null;
    var list = tokens(value, true);
    for (var i = 0; i < list.length; i++) if (ROLE[list[i]]) return list[i] === 'presentation' ? 'none' : list[i];
    return null;
  };
  var hasGlobalAria = function (element) {
    for (var i = 0; i < GLOBAL_ARIA.length; i++) if (hasAttr(element, GLOBAL_ARIA[i])) return true;
    return false;
  };
  var inputType = function (element) { try { return lowerCase(toText(inputTypeOf(element))); } catch (error) { return 'text'; } };
  var sectioned = function (element) {
    for (var node = parentElement(element); node; node = parentElement(node)) {
      var tag = tagOf(node);
      if (tag === 'article' || tag === 'aside' || tag === 'main' || tag === 'nav' || tag === 'section') return true;
    }
    return false;
  };
  var labelledByAria = function (element) {
    var label = attr(element, 'aria-label');
    return (label !== null && hasText(label)) || attr(element, 'aria-labelledby') !== null || (attr(element, 'title') !== null && hasText(attr(element, 'title')));
  };
  var svgTitle = function (element) {
    for (var child = firstChildOf(element); child; child = nextSiblingOf(child)) {
      if (isElement(child) && tagOf(child) === 'title' && namespaceOf(child) === SVG) return squash(textOf(child));
    }
    return '';
  };
  var implicitRole = function (element) {
    var tag = tagOf(element);
    if (namespaceOf(element) === SVG) {
      if (tag === 'svg') return labelledByAria(element) || svgTitle(element) !== '' ? 'img' : 'none';
      if (tag === 'a' && (hasAttr(element, 'href') || hasAttr(element, 'xlink:href'))) return 'link';
      return 'none';
    }
    switch (tag) {
      case 'a': case 'area': return hasAttr(element, 'href') ? 'link' : 'generic';
      case 'article': return 'article';
      case 'aside': return 'complementary';
      case 'blockquote': return 'blockquote';
      case 'button': return 'button';
      case 'caption': return 'caption';
      case 'code': return 'code';
      case 'del': return 'deletion';
      case 'details': return 'group';
      case 'dialog': return 'dialog';
      case 'em': return 'emphasis';
      case 'fieldset': return 'group';
      case 'figure': return 'figure';
      case 'footer': return sectioned(element) ? 'generic' : 'contentinfo';
      case 'form': return labelledByAria(element) ? 'form' : 'generic';
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': return 'heading';
      case 'header': return sectioned(element) ? 'generic' : 'banner';
      case 'hr': return 'separator';
      case 'img': {
        var alt = attr(element, 'alt');
        return alt !== null && !hasText(alt) && !labelledByAria(element) ? 'none' : 'img';
      }
      case 'input': {
        var type = inputType(element);
        if (type === 'button' || type === 'submit' || type === 'reset' || type === 'image' || type === 'file') return 'button';
        if (type === 'checkbox') return 'checkbox';
        if (type === 'radio') return 'radio';
        if (type === 'range') return 'slider';
        if (type === 'number') return 'spinbutton';
        if (type === 'hidden') return 'none';
        if (hasAttr(element, 'list')) return 'combobox';
        return type === 'search' ? 'searchbox' : 'textbox';
      }
      case 'ins': return 'insertion';
      case 'li': {
        var list = parentElement(element);
        var listTag = list ? tagOf(list) : '';
        return listTag === 'ul' || listTag === 'ol' || listTag === 'menu' ? 'listitem' : 'generic';
      }
      case 'main': return 'main';
      case 'menu': case 'ol': case 'ul': return 'list';
      case 'meter': return 'meter';
      case 'nav': return 'navigation';
      case 'optgroup': return 'group';
      case 'option': return 'option';
      case 'output': return 'status';
      case 'p': return 'paragraph';
      case 'progress': return 'progressbar';
      case 'search': return 'search';
      case 'section': return labelledByAria(element) ? 'region' : 'generic';
      case 'select': return hasAttr(element, 'multiple') || (integer(attr(element, 'size')) || 0) > 1 ? 'listbox' : 'combobox';
      case 'strong': return 'strong';
      case 'sub': return 'subscript';
      case 'summary': return parentElement(element) && tagOf(parentElement(element)) === 'details' && firstSummary(parentElement(element)) === element ? 'button' : 'generic';
      case 'sup': return 'superscript';
      case 'table': return 'table';
      case 'tbody': case 'thead': case 'tfoot': return 'rowgroup';
      case 'td': return 'cell';
      case 'textarea': return 'textbox';
      case 'th': return attrIs(element, 'scope', 'row') ? 'rowheader' : 'columnheader';
      case 'time': return 'time';
      case 'tr': return 'row';
      default: return 'generic';
    }
  };
  var roleOf = function (element) {
    var role = explicitRole(element);
    /* a presentational role is ignored on what can take focus or has a global ARIA attribute (the conflict rule) */
    if (role === 'none' && (focusableArea(element) || hasGlobalAria(element))) role = null;
    return role || implicitRole(element);
  };

  /* --- names and descriptions: the Accessible Name and Description Computation 1.2, as Chrome has it --- */
  var budget = 0;
  var visiting = [];
  var textOf = function (node) {
    var out = '';
    childrenOf(node, function (child) {
      if (isText(child)) out += toText(dataOf(child));
      else if (isElement(child)) out += textOf(child);
    });
    return out;
  };
  /* CSS generated content (::before, ::after): its strings, or the alternative after a slash. */
  var generated = function (element, pseudo) {
    var value = css(element, 'content', pseudo);
    if (value === '' || value === 'none' || value === 'normal') return '';
    var out = '';
    var alt = '';
    var slashed = false;
    for (var i = 0; i < value.length; i++) {
      var character = value[i];
      if (character === '/') { slashed = true; continue; }
      if (character !== '"' && character !== "'") continue;
      var quote = character;
      var piece = '';
      for (i += 1; i < value.length && value[i] !== quote; i++) {
        if (value[i] === '\\' && i + 1 < value.length) i++;
        piece += value[i];
      }
      if (slashed) alt += piece;
      else out += piece;
    }
    return slashed ? alt : out;
  };
  var idTargets = function (value) {
    var list = [];
    var ids = tokens(value, false);
    for (var i = 0; i < ids.length; i++) {
      var found = byId(doc, ids[i]);
      if (found) put(list, found);
    }
    return list;
  };
  var isBlock = function (element) {
    var display = css(element, 'display');
    return display !== '' && display !== 'inline' && display !== 'contents';
  };
  var EMBEDDED = setOf(['textbox', 'searchbox', 'combobox', 'listbox', 'slider', 'spinbutton']);
  var selectText = function (element) {
    var out = '';
    try {
      var chosen = selectedOptionsOf(element);
      for (var i = 0, n = collectionLength(chosen); i < n; i++) out = join(out, squash(toText(optionTextOf(collectionItem(chosen, i)))));
    } catch (error) { out = ''; }
    return out;
  };
  /* What a field holds: a text field's value, a select's chosen option, a range's text or number. */
  var valueOf = function (element, role) {
    var tag = tagOf(element);
    if (tag === 'select') return selectText(element);
    if (role === 'slider' || role === 'spinbutton' || role === 'progressbar' || role === 'meter') {
      var text = attr(element, 'aria-valuetext');
      if (text !== null && hasText(text)) return squash(text);
      var now = attr(element, 'aria-valuenow');
      if (now !== null) return squash(now);
    }
    try {
      if (tag === 'input' && role !== 'checkbox' && role !== 'radio' && role !== 'button') return toText(inputValueOf(element));
      if (tag === 'textarea') return toText(areaValueOf(element));
    } catch (error) { return ''; }
    return '';
  };
  var compute;
  /* 2F: the name from an element's content (its ::before, children, ::after; a block child set apart by spaces). */
  var fromContent = function (element, flags, depth) {
    var out = generated(element, '::before');
    childrenOf(element, function (child) {
      var text = compute(child, flags, depth + 1);
      if (isElement(child) && isBlock(child)) out = join(out, text);
      else out += text;
      if (isElement(child) && isBlock(child)) out += ' ';
    });
    return out + generated(element, '::after');
  };
  var flagsOf = function (root, labelledby, nested, hiddenOk) {
    return fields(['root', 'labelledby', 'nested', 'hiddenOk'], [root, labelledby, nested, hiddenOk]);
  };
  /* 2D: what the host language gives (labels, alt, value, legend, caption, an SVG's title, Chrome's placeholder). */
  var nativeName = function (element, role, flags, depth) {
    var tag = tagOf(element);
    if (tag === 'input') {
      var type = inputType(element);
      if (type === 'button' || type === 'submit' || type === 'reset') {
        var value = attr(element, 'value');
        if (value !== null) return value;
        return type === 'submit' ? 'Submit' : type === 'reset' ? 'Reset' : '';
      }
      if (type === 'image') {
        var alt = attr(element, 'alt');
        if (alt !== null && hasText(alt)) return alt;
        var shown = attr(element, 'value');
        return shown !== null && hasText(shown) ? shown : 'Submit';
      }
    }
    var labels = labelsBy[tag];
    if (labels) {
      var named = '';
      try {
        var list = labels(element);
        for (var i = 0, n = list ? listLength(list) : 0; i < n; i++) named = join(named, compute(listItem(list, i), flagsOf(element, flags.labelledby, true, false), depth + 1));
      } catch (error) { named = ''; }
      if (hasText(named)) return named;
      if (tag === 'input' || tag === 'textarea') {
        var placeholder = attr(element, 'placeholder');
        if (placeholder !== null && hasText(placeholder)) return placeholder;
      }
      return null;
    }
    if (tag === 'img' || tag === 'area') return attr(element, 'alt');
    if (namespaceOf(element) === SVG && tag === 'svg') return svgTitle(element);
    var caption = tag === 'fieldset' ? 'legend' : tag === 'figure' ? 'figcaption' : tag === 'table' ? 'caption' : null;
    if (caption) {
      for (var child = firstChildOf(element); child; child = nextSiblingOf(child)) {
        if (isElement(child) && tagOf(child) === caption) return compute(child, flagsOf(element, flags.labelledby, true, false), depth + 1);
      }
    }
    return null;
  };
  compute = function (node, flags, depth) {
    budget -= 1;
    if (budget < 0 || depth > LIMITS.depth) return '';
    if (isText(node)) {
      var parent = parentElement(node);
      if (!flags.hiddenOk && parent && hiddenFromTree(parent)) return '';
      return toText(dataOf(node));
    }
    if (!isElement(node) || ours(node)) return '';
    if (has(visiting, node)) return '';
    put(visiting, node);
    /* 2A: hidden, unless a relation points at it (then all of it counts) */
    if (!flags.hiddenOk && hiddenFromTree(node)) return '';
    /* 2B: aria-labelledby, unless already following one */
    if (!flags.labelledby) {
      var ids = attr(node, 'aria-labelledby');
      if (ids !== null) {
        var targets = idTargets(ids);
        var named = '';
        for (var i = 0; i < targets.length; i++) {
          var target = targets[i];
          named = join(named, squash(compute(target, flagsOf(target, true, true, flags.hiddenOk || hiddenFromTree(target)), depth + 1)));
        }
        if (hasText(named)) return named;
      }
    }
    var role = roleOf(node);
    /* 2E: an embedded control inside a label or a name from content gives its value */
    if (flags.nested && node !== flags.root && EMBEDDED[role]) return valueOf(node, role);
    /* 2C: aria-label */
    var label = attr(node, 'aria-label');
    if (label !== null && hasText(label)) return label;
    /* 2D: the host language */
    if (role !== 'none') {
      var native = nativeName(node, role, flags, depth);
      if (native !== null && hasText(native)) return native;
      if (native !== null && (tagOf(node) === 'img' || tagOf(node) === 'area')) return '';
    }
    /* 2F: the content, for a role that takes its name from it, or anything inside a label or a relation */
    if (FROM_CONTENT[role] || flags.nested) {
      var content = fromContent(node, flagsOf(flags.root, flags.labelledby, true, flags.hiddenOk), depth);
      if (hasText(content)) return content;
    }
    /* 2I: the tooltip */
    var title = attr(node, 'title');
    if (title !== null && hasText(title)) return title;
    return '';
  };
  var nameOf = function (element) {
    budget = LIMITS.nameNodes;
    visiting = [];
    return cut(squash(compute(element, flagsOf(element, false, false, false), 0)), LIMITS.text);
  };
  var descriptionOf = function (element, name) {
    budget = LIMITS.nameNodes;
    visiting = [element];
    var ids = attr(element, 'aria-describedby');
    if (ids !== null) {
      var targets = idTargets(ids);
      var described = '';
      for (var i = 0; i < targets.length; i++) described = join(described, squash(compute(targets[i], flagsOf(targets[i], true, true, hiddenFromTree(targets[i])), 1)));
      if (hasText(described)) return cut(squash(described), LIMITS.text);
    }
    var own = attr(element, 'aria-description');
    if (own !== null && hasText(own)) return cut(squash(own), LIMITS.text);
    var title = attr(element, 'title');
    if (title !== null && hasText(title) && squash(title) !== name) return cut(squash(title), LIMITS.text);
    return '';
  };

  /* --- states, as a reader says them --- */
  var ariaState = function (element, name, mixed) {
    var value = attr(element, name);
    if (value === null) return null;
    value = lowerCase(squash(value));
    if (value === 'true' || value === 'false') return value;
    return mixed && value === 'mixed' ? 'mixed' : null;
  };
  var isDisabled = function (element) {
    try { if (matchesOf(element, ':disabled')) return true; } catch (error) { /* not a form control */ }
    return attrIs(element, 'aria-disabled', 'true');
  };
  /* A state's value ('true', 'false', 'mixed') or null when the element doesn't have it. */
  var stateOf = function (element, role, which) {
    var tag = tagOf(element);
    if (which === 'checked') {
      if (!CHECKABLE[role]) return null;
      if (tag === 'input' && (inputType(element) === 'checkbox' || inputType(element) === 'radio') && explicitRole(element) === null) {
        try { return mixedOf(element) ? 'mixed' : checkedOf(element) ? 'true' : 'false'; } catch (error) { return 'false'; }
      }
      return ariaState(element, 'aria-checked', role === 'checkbox' || role === 'menuitemcheckbox') || 'false';
    }
    if (which === 'pressed') return role === 'button' ? ariaState(element, 'aria-pressed', true) : null;
    if (which === 'expanded') {
      if (tag === 'summary' && role === 'button' && attr(element, 'aria-expanded') === null) return detailsOpen(parentElement(element)) ? 'true' : 'false';
      return EXPANDABLE[role] ? ariaState(element, 'aria-expanded', false) : null;
    }
    if (which === 'selected') {
      if (!SELECTABLE[role]) return null;
      if (tag === 'option' && explicitRole(element) === null) { try { return optionSelectedOf(element) ? 'true' : 'false'; } catch (error) { return 'false'; } }
      return ariaState(element, 'aria-selected', false);
    }
    if (which === 'disabled') return isDisabled(element) ? 'true' : 'false';
    if (which === 'required') {
      if ((tag === 'input' || tag === 'select' || tag === 'textarea') && hasAttr(element, 'required')) return 'true';
      return attrIs(element, 'aria-required', 'true') ? 'true' : 'false';
    }
    if (which === 'invalid') {
      var invalid = attr(element, 'aria-invalid');
      return invalid !== null && hasText(invalid) && lowerCase(squash(invalid)) !== 'false' ? 'true' : 'false';
    }
    return null;
  };
  var levelOf = function (element) {
    var level = integer(attr(element, 'aria-level'));
    if (level !== null && level > 0) return level;
    var tag = tagOf(element);
    return tag.length === 2 && tag[0] === 'h' && tag[1] >= '1' && tag[1] <= '6' ? codeAt(tag, 1) - 48 : 2;
  };
  /* The states a reader says, in its order. */
  var stateWords = function (element, role) {
    var words = [];
    var checked = stateOf(element, role, 'checked');
    if (checked !== null) put(words, role === 'switch' ? (checked === 'true' ? 'on' : 'off') : checked === 'true' ? 'checked' : checked === 'mixed' ? 'half checked' : 'not checked');
    var expanded = stateOf(element, role, 'expanded');
    if (expanded !== null) put(words, expanded === 'true' ? 'expanded' : 'collapsed');
    var pressed = stateOf(element, role, 'pressed');
    if (pressed !== null) put(words, pressed === 'true' ? 'pressed' : pressed === 'mixed' ? 'half pressed' : 'not pressed');
    if (stateOf(element, role, 'selected') === 'true') put(words, 'selected');
    if (stateOf(element, role, 'disabled') === 'true') put(words, 'disabled');
    if (stateOf(element, role, 'required') === 'true') put(words, 'required');
    if (stateOf(element, role, 'invalid') === 'true') put(words, 'invalid');
    return words;
  };
  var SILENT = setOf(['generic', 'none', 'paragraph', 'strong', 'emphasis', 'code', 'time', 'subscript', 'superscript', 'deletion', 'insertion', 'term', 'definition']);
  var roleWord = function (element, role) {
    if (SILENT[role]) return '';
    return role === 'heading' ? 'heading level ' + levelOf(element) : role;
  };
  /* What a screen reader says for an element: name, role, value, states, description ('' when it is hidden from it). */
  var readingOf = function (element) {
    if (hiddenFromTree(element)) return '';
    var role = roleOf(element);
    var name = nameOf(element);
    /* a focusable element with no role of its own: a reader reads its text */
    if (name === '' && SILENT[role]) {
      budget = LIMITS.nameNodes;
      visiting = [element];
      name = cut(squash(fromContent(element, flagsOf(element, false, true, false), 0)), LIMITS.text);
    }
    var parts = [];
    if (name !== '') put(parts, name);
    var word = roleWord(element, role);
    if (word !== '') put(parts, word);
    var value = EMBEDDED[role] ? squash(valueOf(element, role)) : '';
    if (value !== '' && value !== name) put(parts, cut(value, LIMITS.text));
    var states = stateWords(element, role);
    for (var i = 0; i < states.length; i++) put(parts, states[i]);
    var description = descriptionOf(element, name);
    if (description !== '') put(parts, description);
    var out = '';
    for (var j = 0; j < parts.length; j++) out += (j ? ', ' : '') + parts[j];
    return cut(out, LIMITS.text);
  };

  /* --- focus: what can take it, the Tab order --- */
  var tabIndexOf = function (element) { return integer(attr(element, 'tabindex')); };
  var naturallyFocusable = function (element) {
    var tag = tagOf(element);
    if (namespaceOf(element) === SVG) return tag === 'a' && (hasAttr(element, 'href') || hasAttr(element, 'xlink:href'));
    if ((tag === 'a' || tag === 'area') && hasAttr(element, 'href')) return true;
    if (tag === 'button' || tag === 'select' || tag === 'textarea' || tag === 'iframe') return true;
    if (tag === 'input') return inputType(element) !== 'hidden';
    if (tag === 'summary') return implicitRole(element) === 'button';
    if ((tag === 'audio' || tag === 'video') && hasAttr(element, 'controls')) return true;
    try {
      if (editableOf(element)) { var parent = parentElement(element); return !parent || !editableOf(parent); }
    } catch (error) { return false; }
    return false;
  };
  var FORM_CONTROL = setOf(['button', 'input', 'select', 'textarea', 'optgroup', 'option', 'fieldset']);
  var focusableArea = function (element) {
    if (!isElement(element) || !connectedOf(element) || ours(element)) return false;
    if (namespaceOf(element) !== SVG && namespaceOf(element) !== 'http://www.w3.org/1999/xhtml') return false;
    if (!naturallyFocusable(element) && tabIndexOf(element) === null) return false;
    if (FORM_CONTROL[tagOf(element)]) { try { if (matchesOf(element, ':disabled')) return false; } catch (error) { /* not one */ } }
    if (isInert(element)) return false;
    return !notRendered(element) && !invisible(element);
  };
  var inTabOrder = function (element) {
    if (!focusableArea(element)) return false;
    var index = tabIndexOf(element);
    return index === null || index >= 0;
  };
  var radioGroup = function (element) {
    if (tagOf(element) !== 'input' || inputType(element) !== 'radio') return null;
    var name = attr(element, 'name');
    return name !== null && name !== '' ? name : null;
  };
  /* The sequential focus navigation order: positive tabindex values first, smallest first, then the rest in tree order;
     of a radio group only the checked one (or, none checked, the first). */
  var tabOrder = function () {
    var positive = [];
    var rest = [];
    var all = queryAll(doc, '*');
    var count = listLength(all);
    if (count > LIMITS.elements) count = LIMITS.elements;
    for (var i = 0; i < count; i++) {
      var element = listItem(all, i);
      if (!inTabOrder(element)) continue;
      var index = tabIndexOf(element);
      if (index !== null && index > 0) {
        var at = positive.length;
        put(positive, element);
        while (at > 0 && tabIndexOf(positive[at - 1]) > index) {
          positive[at] = positive[at - 1];
          at--;
        }
        positive[at] = element;
      } else {
        put(rest, element);
      }
    }
    var order = [];
    var groups = [];
    var pick = function (element) {
      var group = radioGroup(element);
      if (group === null) return put(order, element);
      if (has(groups, group)) return;
      var chosen = null;
      var first = null;
      var candidates = queryAll(doc, 'input[type="radio" i]');
      for (var k = 0, n = listLength(candidates); k < n; k++) {
        var radio = listItem(candidates, k);
        if (radioGroup(radio) !== group || !inTabOrder(radio)) continue;
        if (!first) first = radio;
        try { if (checkedOf(radio)) { chosen = radio; break; } } catch (error) { /* not checkable */ }
      }
      put(groups, group);
      put(order, chosen || first || element);
    };
    for (var p = 0; p < positive.length; p++) pick(positive[p]);
    for (var q = 0; q < rest.length; q++) pick(rest[q]);
    return order;
  };

  /* --- the reader's log --- */
  var lines = [];
  var probing = false;
  var cause = '';
  var say = function (kind, text) {
    if (lines.length >= LIMITS.lines) return;
    var line = fields(['kind', 'text', 'key', 'probe'], [kind, cut(text, LIMITS.text), cause, probing]);
    put(lines, line);
    post({ type: 'reader', from: lines.length - 1, lines: [{ kind: line.kind, text: line.text, key: line.key, probe: line.probe }] });
  };

  /* --- focus, and what the reader says about it --- */
  var startPoint = null;
  var outside = false;
  var announced = null;
  var announcedStates = '';
  var announcedName = '';
  var focusDepth = 0;
  var STATE_KEYS = ['checked', 'expanded', 'pressed', 'selected'];
  var stateKey = function (element) {
    var role = roleOf(element);
    var key = '';
    for (var i = 0; i < STATE_KEYS.length; i++) key += STATE_KEYS[i] + '=' + stateOf(element, role, STATE_KEYS[i]) + ';';
    return key;
  };
  var dialogsOf = function (element) {
    var list = [];
    for (var node = parentElement(element); node; node = parentElement(node)) {
      var role = roleOf(node);
      if ((role === 'dialog' || role === 'alertdialog') && !hiddenFromTree(node)) {
        put(list, node);
      }
    }
    return list;
  };
  var announceFocus = function () {
    if (focused === announced) return;
    var previous = announced;
    announced = focused;
    if (!focused) {
      announcedStates = '';
      announcedName = '';
      return;
    }
    var dialogs = dialogsOf(focused);
    for (var i = dialogs.length - 1; i >= 0; i--) {
      if (previous && connectedOf(previous) && containsOf(dialogs[i], previous)) continue;
      var dialogName = nameOf(dialogs[i]);
      say('dialog', (dialogName ? dialogName + ', ' : '') + roleOf(dialogs[i]));
    }
    say('focus', readingOf(focused));
    announcedStates = stateKey(focused);
    announcedName = nameOf(focused);
  };
  /* After a change: the focused element still focusable (else focus falls back to the page, silently, as the HTML
     standard's focus fixup has it), and a state or name it changed is said. */
  /* The focus fixup alone (true when focus fell back): what the page's own focus(), showModal() and close() run, so the
     changes of the task they are called in still reach the reader together, at the next delivery. */
  var fixFocus = function () {
    if (!focused || focusableArea(focused) || (focused === heldBy && hasAttr(focused, 'open') && !notRendered(focused))) return false;
    var lost = focused;
    if (connectedOf(lost)) {
      /* hidden, disabled or inert: the HTML standard's focus fixup runs the focusing steps for the viewport (blur and
         focusout, as Chrome fires them); a listener may put focus somewhere else */
      setFocus(null);
      if (focused === null) startPoint = lost;
    } else {
      /* removed: the standard's fixup fires nothing (Chrome fires blur before the removal, which the model can't) */
      focused = null;
      startPoint = null;
      drawRing();
    }
    if (focused === null) announced = null;
    return true;
  };
  /* After a delivery: the focus fixup, then a state or name the focused element changed is said. */
  var noticeChanges = function () {
    if (fixFocus()) return;
    if (!focused || focused !== announced) return;
    var role = roleOf(focused);
    var nowStates = stateKey(focused);
    if (nowStates !== announcedStates) {
      for (var i = 0; i < STATE_KEYS.length; i++) {
        var which = STATE_KEYS[i];
        var before = announcedStates === '' ? null : announcedStateOf(which);
        var after = stateOf(focused, role, which);
        if (after === null || after === before) continue;
        if (which === 'checked') say('state', role === 'switch' ? (after === 'true' ? 'on' : 'off') : after === 'true' ? 'checked' : after === 'mixed' ? 'half checked' : 'not checked');
        else if (which === 'expanded') say('state', after === 'true' ? 'expanded' : 'collapsed');
        else if (which === 'pressed') say('state', after === 'true' ? 'pressed' : after === 'mixed' ? 'half pressed' : 'not pressed');
        else if (after === 'true') say('state', 'selected');
      }
      announcedStates = nowStates;
    }
    var nowName = nameOf(focused);
    if (nowName !== announcedName) {
      if (nowName !== '') say('name', nowName);
      announcedName = nowName;
    }
  };
  var announcedStateOf = function (which) {
    var marker = which + '=';
    var at = indexIn(announcedStates, marker);
    if (at < 0) return null;
    var end = indexIn(announcedStates, ';', at);
    var value = sliceText(announcedStates, at + marker.length, end);
    return value === 'null' ? null : value;
  };
  var fire = function (target, type, related, bubbles) {
    var event;
    try {
      event = new NativeFocusEvent(type, fields(['bubbles', 'cancelable', 'composed', 'relatedTarget', 'view'], [bubbles, false, true, related, win]));
    } catch (error) {
      event = new NativeEvent(type, fields(['bubbles', 'cancelable', 'composed'], [bubbles, false, true]));
    }
    dispatch(target, event);
  };
  /* Focus moves (focusing steps): blur and focusout on the old element, focus and focusin on the new one (Chrome's
     order); a listener that moves focus again wins, and the reader speaks once it all settled. */
  var setFocus = function (next) {
    var previous = focused;
    if (next === previous) return;
    focused = next;
    if (next) {
      startPoint = next;
      outside = false;
    }
    focusDepth += 1;
    try {
      if (previous && connectedOf(previous)) {
        fire(previous, 'blur', next, false);
        fire(previous, 'focusout', next, true);
      }
      if (next && focused === next) {
        fire(next, 'focus', previous, false);
        if (focused === next) fire(next, 'focusin', previous, true);
      }
    } finally {
      focusDepth -= 1;
    }
    if (focusDepth === 0) {
      schedule();
      drawRing();
    }
  };
  /* Tab leaves the page: the browser's own controls (the address bar) have focus; the next Tab starts at the top. */
  var leavePage = function () {
    setFocus(null);
    outside = true;
    startPoint = null;
    say('leave', 'Out of the page: the browser\'s own controls');
  };
  var FOLLOWING = 4;
  var PRECEDING = 2;
  /* Tab (1) or Shift+Tab (-1): from the focused element, else from the sequential focus navigation starting point. */
  var move = function (direction) {
    var order = tabOrder();
    var current = focused;
    var at = -1;
    if (current) {
      for (var i = 0; i < order.length; i++) if (order[i] === current) { at = i; break; }
      if (at < 0) { startPoint = current; current = null; }
    }
    var next = null;
    if (current) {
      next = at + direction >= 0 && at + direction < order.length ? order[at + direction] : null;
    } else if (!outside && startPoint && connectedOf(startPoint)) {
      if (direction > 0) {
        for (var a = 0; a < order.length; a++) {
          if (tabIndexOf(order[a]) !== null && tabIndexOf(order[a]) > 0) continue;
          if (positionOf(startPoint, order[a]) & FOLLOWING) { next = order[a]; break; }
        }
      } else {
        for (var b = order.length - 1; b >= 0; b--) {
          if (positionOf(startPoint, order[b]) & PRECEDING) { next = order[b]; break; }
        }
      }
    } else {
      next = order.length ? order[direction > 0 ? 0 : order.length - 1] : null;
    }
    if (next) setFocus(next);
    else leavePage();
  };

  /* --- live regions --- */
  var started = false;
  var liveBefore = [];
  var alertsBefore = [];
  /* elements inside a live region that were left out of the tree at the last delivery (the topmost of each hidden part) */
  var hiddenBefore = [];
  var regionOf = function (node) {
    for (var element = isElement(node) ? node : parentElement(node); element; element = parentElement(element)) {
      if (ours(element)) return null;
      var live = attr(element, 'aria-live');
      if (live !== null) {
        live = lowerCase(squash(live));
        return live === 'polite' || live === 'assertive' ? element : null;
      }
      var role = explicitRole(element) || (tagOf(element) === 'output' ? 'status' : null);
      if (role === 'status' || role === 'log' || role === 'alert') return element;
      if (role === 'timer' || role === 'marquee') return null;
    }
    return null;
  };
  var politenessOf = function (region) {
    var live = attr(region, 'aria-live');
    if (live !== null) return lowerCase(squash(live));
    return explicitRole(region) === 'alert' ? 'assertive' : 'polite';
  };
  var atomicOf = function (region) {
    var atomic = attr(region, 'aria-atomic');
    if (atomic !== null) return lowerCase(squash(atomic)) === 'true';
    var role = explicitRole(region) || (tagOf(region) === 'output' ? 'status' : null);
    return role === 'alert' || role === 'status';
  };
  var regionText = function (node) {
    budget = LIMITS.nameNodes;
    visiting = [];
    if (isText(node)) return compute(node, flagsOf(node, false, true, false), 0);
    if (hiddenFromTree(node)) return '';
    var label = attr(node, 'aria-label');
    if (label !== null && hasText(label)) return label;
    return fromContent(node, flagsOf(node, false, true, false), 0);
  };
  var liveRegions = function () {
    var list = [];
    var found = queryAll(doc, '[aria-live], [role], output');
    for (var i = 0, n = listLength(found); i < n && list.length < LIMITS.regions; i++) {
      var element = listItem(found, i);
      if (regionOf(element) === element && !hiddenFromTree(element)) put(list, element);
    }
    return list;
  };
  var hiddenInRegions = function (regions) {
    var list = [];
    for (var i = 0; i < regions.length && list.length < LIMITS.regions; i++) {
      var inside = queryInside(regions[i], '*');
      for (var j = 0, n = listLength(inside); j < n && list.length < LIMITS.regions; j++) {
        var element = listItem(inside, j);
        var parent = parentElement(element);
        if (hiddenFromTree(element) && parent && !hiddenFromTree(parent)) put(list, element);
      }
    }
    return list;
  };
  var alertsShown = function () {
    var list = [];
    var found = queryAll(doc, '[role]');
    for (var i = 0, n = listLength(found); i < n && list.length < LIMITS.regions; i++) {
      var element = listItem(found, i);
      if (explicitRole(element) === 'alert' && !hiddenFromTree(element)) put(list, element);
    }
    return list;
  };
  /* One MutationObserver delivery: each live region that was live at the last one and changed says what was added (or,
     aria-atomic, all of it); an alert that appeared says itself; then the focused element's state and name. */
  var process = function (records) {
    if (!started) return;
    /* the ring's own changes (its style) are no change of the page's */
    var theirs = false;
    for (var o = 0; o < records.length && !theirs; o++) theirs = !ours(recordTargetOf(records[o]));
    if (!theirs) return;
    var regions = [];
    var texts = [];
    var add = function (region, text) {
      for (var k = 0; k < regions.length; k++) {
        if (regions[k] !== region) continue;
        /* a part shown and filled in the same moment is one addition, said once */
        if (indexIn(texts[k], text) < 0) texts[k] = join(texts[k], text);
        return;
      }
      put(regions, region);
      put(texts, text);
    };
    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      var type = recordTypeOf(record);
      var target = recordTargetOf(record);
      if (ours(target)) continue;
      if (type !== 'childList' && type !== 'characterData') continue;
      var region = regionOf(target);
      if (!region || !has(liveBefore, region) || hiddenFromTree(region)) continue;
      if (type === 'characterData') {
        add(region, squash(regionText(target)));
        continue;
      }
      var added = recordAddedOf(record);
      if (!added) continue;
      for (var j = 0, n = added ? addedLength(added) : 0; j < n; j++) {
        var node = addedAt(added, j);
        if (ours(node)) continue;
        add(region, squash(regionText(node)));
      }
    }
    /* a part of a region that was live, hidden at the last delivery and shown now, is an addition (Chrome; NVDA and JAWS
       read it) */
    for (var h = 0; h < hiddenBefore.length; h++) {
      var shown = hiddenBefore[h];
      if (!connectedOf(shown) || hiddenFromTree(shown)) continue;
      var holder = regionOf(shown);
      if (holder && holder !== shown && has(liveBefore, holder) && !hiddenFromTree(holder)) add(holder, squash(regionText(shown)));
    }
    for (var r = 0; r < regions.length; r++) {
      var text = atomicOf(regions[r]) ? squash(regionText(regions[r])) : squash(texts[r]);
      if (hasText(text)) say(politenessOf(regions[r]) === 'assertive' ? 'assertive' : 'polite', text);
    }
    var alerts = alertsShown();
    for (var a = 0; a < alerts.length; a++) {
      if (has(alertsBefore, alerts[a]) || has(regions, alerts[a])) continue;
      var alertText = squash(regionText(alerts[a]));
      if (hasText(alertText)) say('assertive', alertText);
    }
    alertsBefore = alerts;
    liveBefore = liveRegions();
    hiddenBefore = hiddenInRegions(liveBefore);
    noticeChanges();
    drawRing();
  };
  var observer = null;
  /* Whatever changed since the last delivery is taken now (a probe's read, a key), so the reader is up to date. */
  /* A task boundary: what the page changed since the last one reaches the reader together, as Chrome updates its tree
     once for a task (so a microtask, an await or a focus() in the middle of a handler splits nothing): where focus is
     now (read once, with the name it has now), then the live regions, then the focus fixup and a state or name the
     focused element changed. */
  var held = [];
  var flush = function () {
    fixFocus();
    announceFocus();
    var records = held;
    held = [];
    var taken = observer ? takeRecordsOf(observer) : [];
    for (var t = 0; t < taken.length; t++) put(records, taken[t]);
    if (records.length) process(records);
    else noticeChanges();
    announceFocus();
  };
  /* The next update boundary: a frame after the change, as Chrome updates its tree once a frame; and not before the
     page's short timers (at most a frame) set while the update is open have run, nested ones too, so a timer that runs
     late on a busy machine still folds in (at most 200 ms); a probe's read, a key and a mark take one at once. */
  var scheduled = false;
  var lastChange = 0;
  var opened = 0;
  var shortTimers = 0;
  var counted = createObject(null);
  var clockNow = bindTo(win.performance.now, win.performance);
  var boundary = function () {
    if (shortTimers > 0 && clockNow() - opened < 200) return later(boundary, 5);
    scheduled = false;
    flush();
  };
  var schedule = function () {
    lastChange = clockNow();
    if (scheduled) return;
    scheduled = true;
    opened = lastChange;
    later(boundary, LIMITS.frameMs);
  };
  /* The page's setTimeout: the browser's own, counting a short one set while an update is open. */
  var pageSetTimeout = function setTimeout(callback, delay) {
    var extra = [];
    for (var a = 2; a < arguments.length; a++) put(extra, arguments[a]);
    var wait = toNumberOf(delay) || 0;
    if (!scheduled || typeof callback !== 'function' || wait > LIMITS.frameMs) {
      /* the delay read once: the browser gets the number counted here, never the object again */
      var given = [callback, wait];
      for (var b = 0; b < extra.length; b++) put(given, extra[b]);
      return applyTo(nativeSetTimeout, win, given);
    }
    shortTimers += 1;
    var id = 0;
    id = applyTo(nativeSetTimeout, win, [function () {
      if (counted[id]) {
        counted[id] = false;
        shortTimers -= 1;
      }
      applyTo(callback, win, extra);
    }, wait]);
    counted[id] = true;
    return id;
  };
  var pageClearTimeout = function clearTimeout(id) {
    if (counted[id]) {
      counted[id] = false;
      shortTimers -= 1;
    }
    return applyTo(nativeClearTimeout, win, arguments);
  };
  /* After a key: until the page made no change for LIMITS.quietMs (an async check, a debounce), at most LIMITS.quietMaxMs,
     then a task boundary. */
  var quiet = function (then) {
    var started = clockNow();
    var look = function () {
      var at = clockNow();
      if (at - lastChange >= LIMITS.quietMs || at - started >= LIMITS.quietMaxMs) {
        flush();
        return then();
      }
      later(look, 10);
    };
    look();
  };

  /* --- the keyboard --- */
  var KEYS = fields(['Tab', 'Shift+Tab', 'Enter', 'Space', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'], [
    ['Tab', 'Tab'], ['Tab', 'Tab'], ['Enter', 'Enter'], [' ', 'Space'], ['Escape', 'Escape'], ['ArrowUp', 'ArrowUp'], ['ArrowDown', 'ArrowDown'], ['ArrowLeft', 'ArrowLeft'], ['ArrowRight', 'ArrowRight']
  ]);
  var keyEvent = function (target, type, key, code, shift) {
    var init = fields(['key', 'code', 'shiftKey', 'bubbles', 'cancelable', 'composed', 'view'], [key, code, shift, true, true, true, win]);
    var event;
    try { event = new NativeKeyboardEvent(type, init); } catch (error) { event = new NativeEvent(type, init); }
    return dispatch(target, event);
  };
  var keyTarget = function () { return focused && connectedOf(focused) ? focused : bodyOf(doc) || rootOf(doc); };
  var buttonLike = function (element) {
    var tag = tagOf(element);
    if (tag === 'button') return true;
    if (tag === 'summary') return implicitRole(element) === 'button';
    if (tag === 'input') {
      var type = inputType(element);
      return type === 'button' || type === 'submit' || type === 'reset' || type === 'image';
    }
    return false;
  };
  var nativelyDisabled = function (element) {
    try { return matchesOf(element, ':disabled'); } catch (error) { return false; }
  };
  var activatesOnEnter = function (element) {
    if (!isElement(element) || nativelyDisabled(element)) return false;
    var tag = tagOf(element);
    return buttonLike(element) || ((tag === 'a' || tag === 'area') && hasAttr(element, 'href'));
  };
  var activatesOnSpace = function (element) {
    if (!isElement(element) || nativelyDisabled(element)) return false;
    if (buttonLike(element)) return true;
    if (tagOf(element) !== 'input') return false;
    var type = inputType(element);
    return type === 'checkbox' || type === 'radio';
  };
  var press = function (element) {
    try { clickOn(element); } catch (error) { dispatch(element, new NativeEvent('click', fields(['bubbles', 'cancelable'], [true, true]))); }
  };
  /* A key on whatever has focus: keydown, what the browser does by default (unless prevented), keyup. */
  var key = function (name) {
    var codes = KEYS[name];
    if (!codes) return;
    flush();
    /* what the reader says from now on follows this key, until the next one */
    cause = name;
    var shift = name === 'Shift+Tab';
    var target = keyTarget();
    var down = keyEvent(target, 'keydown', codes[0], codes[1], shift);
    if (name === 'Tab' || name === 'Shift+Tab') {
      if (down) move(shift ? -1 : 1);
    } else if (name === 'Enter') {
      if (down && focused === target && activatesOnEnter(target)) press(target);
    } else if (name === 'Escape') {
      var modal = topModal();
      if (down && modal) {
        if (dispatch(modal, new NativeEvent('cancel', fields(['cancelable'], [true])))) closeDialog(modal);
      }
    }
    var after = keyTarget();
    var up = keyEvent(after, 'keyup', codes[0], codes[1], shift);
    if (name === 'Space' && down && up && after === target && focused === target && activatesOnSpace(target)) press(target);
    /* what the key led to is taken at the next task boundary, with whatever the page's microtasks still do */
    schedule();
  };

  /* --- dialogs: the model's showModal(), show() and close() --- */
  var previousOf = [];
  var rememberPrevious = function (dialog, element) {
    for (var i = 0; i < previousOf.length; i++) if (previousOf[i].dialog === dialog) { previousOf[i].element = element; return; }
    put(previousOf, fields(['dialog', 'element'], [dialog, element]));
  };
  var takePrevious = function (dialog) {
    for (var i = 0; i < previousOf.length; i++) {
      if (previousOf[i].dialog === dialog) {
        var element = previousOf[i].element;
        previousOf[i].element = null;
        return element;
      }
    }
    return null;
  };
  /* The dialog focusing steps: its autofocus descendant, else its first focusable one, else the dialog itself. */
  var heldBy = null;
  var focusDialog = function (dialog) {
    heldBy = null;
    if (hasAttr(dialog, 'autofocus')) {
      heldBy = dialog;
      return setFocus(dialog);
    }
    var inside = queryInside(dialog, '*');
    var first = null;
    for (var i = 0, n = listLength(inside); i < n; i++) {
      var element = listItem(inside, i);
      if (!focusableArea(element)) continue;
      if (hasAttr(element, 'autofocus')) return setFocus(element);
      if (!first) first = element;
    }
    if (!first) heldBy = dialog;
    setFocus(first || dialog);
  };
  var openDialog = function (dialog, modal) {
    if (!connectedOf(dialog)) throw new NativeError('The dialog is not in a document.', 'InvalidStateError');
    if (hasAttr(dialog, 'open')) {
      if (modal !== has(modals, dialog)) throw new NativeError('The dialog is already open.', 'InvalidStateError');
      return;
    }
    fixFocus();
    rememberPrevious(dialog, focused);
    setAttr(dialog, 'open', '');
    if (modal) put(modals, dialog);
    focusDialog(dialog);
  };
  var closeDialog = function (dialog, value, hasValue) {
    if (!hasAttr(dialog, 'open')) return;
    var wasModal = has(modals, dialog);
    var inside = focused !== null && containsOf(dialog, focused);
    if (hasValue && returnValueSet) returnValueSet(dialog, value);
    removeAttr(dialog, 'open');
    for (var i = 0; i < modals.length; i++) {
      if (modals[i] === dialog) {
        for (var j = i; j < modals.length - 1; j++) modals[j] = modals[j + 1];
        modals.length -= 1;
        break;
      }
    }
    var previous = takePrevious(dialog);
    if (previous && (wasModal || inside) && focusableArea(previous)) setFocus(previous);
    later(function () { dispatch(dialog, new NativeEvent('close')); }, 0);
    fixFocus();
  };

  /* --- the focus ring (the app you see): where the model's focus is, drawn above the page, never clickable --- */
  var ringStyles = fields(['host', 'box'], ['', '']);
  /* an attribute written only when it changes: the ring's own writes must not keep the page's observer busy */
  var ringStyle = function (which, value) {
    if (ringStyles[which] === value) return;
    ringStyles[which] = value;
    setAttr(ring[which], 'style', value);
  };
  /* The ring's host is made in every run, the app you see and a check run alike, with the same attributes that never
     change (never clickable, hidden from screen readers): only the box in its closed shadow root moves or hides, so the
     page can't tell a check run by the host. */
  var makeRing = function () {
    if (ring || !shadowOf) return;
    try {
      var host = createIn(doc, 'grindstone-focus');
      setAttr(host, 'aria-hidden', 'true');
      var root = shadowOf(host, fields(['mode'], ['closed']));
      var box = createIn(doc, 'div');
      appendTo(root, box);
      ring = fields(['host', 'box'], [host, box]);
      ringStyle('host', 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; display: block;');
      ringStyle('box', 'display: none;');
    } catch (error) { ring = null; }
  };
  var drawRing = function () {
    if (!ring) return;
    if (!connectedOf(ring.host) && rootOf(doc)) appendTo(rootOf(doc), ring.host);
    if (check) return;
    try {
      if (!focused || !connectedOf(focused)) {
        ringStyle('box', 'display: none;');
        return;
      }
      var rect = rectOf(focused);
      var left = rectLeft.left(rect);
      var top = rectLeft.top(rect);
      var width = rectLeft.width(rect);
      var height = rectLeft.height(rect);
      ringStyle('box', 'position: fixed; box-sizing: border-box; pointer-events: none; border-radius: 6px; outline: 3px solid #1d4ed8; box-shadow: 0 0 0 2px #fff, inset 0 0 0 2px #fff; left: ' + (left - 4) + 'px; top: ' + (top - 4) + 'px; width: ' + (width + 8) + 'px; height: ' + (height + 8) + 'px;');
    } catch (error) { /* the ring is only a picture */ }
  };

  /* --- the tree, as the Accessibility panel shows it --- */
  var tree = function () {
    flush();
    var rows = [];
    var truncated = false;
    var row = function (depth, role, name, value, states, description, isFocused) {
      if (rows.length >= LIMITS.rows) { truncated = true; return false; }
      put(rows, { depth: depth, role: role, name: name, value: value, states: states, description: description, focused: isFocused });
      return true;
    };
    var walk = function (node, depth, inside, nest) {
      /* rows deeper than LIMITS.depth, or containers nested deeper than 200 (plain divs lifted out of the tree), are cut */
      if (depth > LIMITS.depth || nest > 200) {
        truncated = true;
        return;
      }
      childrenOf(node, function (child) {
        if (truncated) return;
        if (isText(child)) {
          if (inside) return;
          var text = squash(toText(dataOf(child)));
          var parent = parentElement(child);
          if (text !== '' && parent && !invisible(parent)) row(depth, 'text', cut(text, LIMITS.text), '', [], '', false);
          return;
        }
        if (!isElement(child)) return;
        var why = hiddenWhy(child);
        if (why === 'subtree') return;
        if (why === 'self') return walk(child, depth, inside, nest + 1);
        var role = roleOf(child);
        var isFocused = child === focused;
        if ((role === 'generic' || role === 'none') && !focusableArea(child)) return walk(child, depth, inside, nest + 1);
        if (inside) return;
        var name = nameOf(child);
        var value = EMBEDDED[role] ? cut(squash(valueOf(child, role)), LIMITS.text) : '';
        var states = stateWords(child, role);
        if (role === 'heading') put(states, 'level ' + levelOf(child));
        if (isFocused) put(states, 'focused');
        if (!row(depth, role, name, value, states, descriptionOf(child, name), isFocused)) return;
        walk(child, depth + 1, FROM_CONTENT[role] || LEAF[role] || tagOf(child) === 'select', nest + 1);
      });
    };
    row(0, 'document', cut(squash(toText(titleOf(doc) || '')), LIMITS.text), '', [], '', false);
    var body = bodyOf(doc);
    if (body) walk(body, 1, false, 0);
    post({ type: 'a11y', rows: rows, focus: focused ? readingOf(focused) : null, truncated: truncated });
  };

  /* --- what the page gets: focus(), blur(), activeElement, the dialog's methods; the browser's own focus events kept out --- */
  var replace = function (object, name, value) {
    if (!object) return;
    define(object, name, fields(['value', 'writable', 'enumerable', 'configurable'], [value, true, false, true]));
  };
  var userInput = false;
  var install = function () {
    replace(win, 'setTimeout', pageSetTimeout);
    replace(win, 'clearTimeout', pageClearTimeout);
    makeRing();
    drawRing();
    var focusMethod = function focus() {
      fixFocus();
      if (focusableArea(this)) setFocus(this);
    };
    replace(HP, 'focus', focusMethod);
    replace(SP, 'focus', focusMethod);
    replace(HP, 'blur', function blur() {
      if (this === focused) {
        setFocus(null);
        startPoint = this;
      }
    });
    replace(SP, 'blur', function blur() { if (this === focused) setFocus(null); });
    var owner = DP;
    for (var at = protoOf(doc); at; at = protoOf(at)) if (describeProperty(at, 'activeElement')) { owner = at; break; }
    define(owner, 'activeElement', fields(['get', 'enumerable', 'configurable'], [function () {
      if (this !== doc) return nativeActive(this);
      return focused && connectedOf(focused) ? focused : bodyOf(doc) || rootOf(doc);
    }, true, true]));
    if (dialogProto) {
      replace(dialogProto, 'showModal', function showModal() { openDialog(this, true); });
      replace(dialogProto, 'show', function show() { openDialog(this, false); });
      replace(dialogProto, 'close', function close(value) { closeDialog(this, value, arguments.length > 0); });
    }
    /* The browser's own focus events: in a check run never the page's (focus is the model's); in the app you see one that
       follows a real click or key moves the model's focus there too, any other is dropped. */
    var guard = function (event) {
      if (event.isTrusted !== true) return;
      var target = eventTargetOf(event);
      if (check || !isElement(target)) {
        if (isElement(target) || check) stopNow(event);
        return;
      }
      if (!userInput) { stopNow(event); return; }
      var type = eventTypeOf(event);
      if (target !== focused && (type === 'focus' || type === 'focusin')) {
        focused = target;
        startPoint = target;
        outside = false;
        announceFocus();
        drawRing();
      }
    };
    listen(win, 'focus', guard, true);
    listen(win, 'blur', guard, true);
    listen(win, 'focusin', guard, true);
    listen(win, 'focusout', guard, true);
    if (!check) {
      var input = function (event) {
        if (event.isTrusted !== true) return;
        userInput = true;
        cause = 'user';
        later(function () { userInput = false; }, 0);
      };
      listen(win, 'keydown', input, true);
      listen(win, 'mousedown', input, true);
      listen(win, 'pointerdown', input, true);
      listen(win, 'scroll', drawRing, true);
      listen(win, 'resize', drawRing, false);
    }
    if (NativeObserver) {
      /* a delivery is a microtask: its records wait for the task boundary */
      observer = new NativeObserver(function (records) {
        for (var r = 0; r < records.length; r++) put(held, records[r]);
        schedule();
      });
      observeOf(observer, doc, fields(['childList', 'subtree', 'attributes', 'characterData'], [true, true, true, true]));
    }
  };

  /* a check run's typing, click or focus move: what is said next follows no key */
  var act = function () {
    flush();
    cause = '';
  };
  var contains = function (said, text) {
    if (typeof text !== 'string') return said;
    return said !== null && indexIn(lowerCase(said), lowerCase(text)) >= 0 ? 1 : 0;
  };
  var api = fields(['quiet', 'act', 'install', 'start', 'probing', 'key', 'tabTo', 'focusOn', 'top', 'focused', 'reads', 'name', 'role', 'state', 'mark', 'heard', 'tabStops', 'tree', 'refresh', 'line'], [
    quiet,
    act,
    install,
    /* after the browser's load event: what is live and shown now is what later changes are compared with */
    function () {
      if (started) return;
      if (observer) takeRecordsOf(observer);
      started = true;
      liveBefore = liveRegions();
      alertsBefore = alertsShown();
      hiddenBefore = hiddenInRegions(liveBefore);
    },
    /* from now on the check run's probes speak (the prediction is about what was said before) */
    function () {
      flush();
      probing = true;
    },
    key,
    /* Tab until the element has focus: how many presses (-1: Tab never gets there) */
    function (element) {
      flush();
      if (focused === element) return 0;
      var left = 0;
      for (var presses = 1; presses <= LIMITS.presses; presses++) {
        key('Tab');
        if (focused === element) return presses;
        if (outside && (left += 1) > 2) return -1;
      }
      return -1;
    },
    /* focus on this element, as a click or a script would put it there (false: it can't take focus) */
    function (element) {
      flush();
      if (!focusableArea(element)) return false;
      /* what is said next follows this move, no key */
      cause = '';
      setFocus(element);
      return true;
    },
    /* back to a fresh page: nothing focused, no starting point */
    function () {
      flush();
      setFocus(null);
      startPoint = null;
      outside = false;
    },
    /* 1 when the focused element matches the selector */
    function (selector) {
      flush();
      if (!focused) return 0;
      try { return matchesOf(focused, selector) ? 1 : 0; } catch (error) { return 0; }
    },
    /* what a reader says for it (null: hidden from it); with a text, 1 when that is in it (any case), else 0 */
    function (element, text) { flush(); return contains(hiddenFromTree(element) ? null : readingOf(element), text); },
    function (element, text) { flush(); return contains(hiddenFromTree(element) ? null : nameOf(element), text); },
    function (element) { flush(); return hiddenFromTree(element) ? 'hidden' : roleOf(element); },
    function (element, which) { flush(); return hiddenFromTree(element) ? null : stateOf(element, roleOf(element), which); },
    function () {
      flush();
      return lines.length;
    },
    /* lines said since the mark that include the text (live: only live regions' announcements; after: only what
       followed that key; scene: only what was said before the probes, the scene's lines) */
    function (text, mark, live, after, scene) {
      flush();
      var count = 0;
      for (var i = scene ? 0 : mark; i < lines.length; i++) {
        var kind = lines[i].kind;
        if (scene && lines[i].probe) break;
        if (typeof after === 'string' && lines[i].key !== after) continue;
        if (live && kind !== 'polite' && kind !== 'assertive') continue;
        if (indexIn(lines[i].text, text) >= 0) count++;
      }
      return count;
    },
    /* the Tab stops of the page, from the top until Tab leaves it (or comes round again) */
    function () {
      flush();
      setFocus(null);
      startPoint = null;
      outside = false;
      var seen = [];
      for (var presses = 0; presses < LIMITS.presses; presses++) {
        key('Tab');
        if (!focused || has(seen, focused)) break;
        put(seen, focused);
      }
      return seen.length;
    },
    tree,
    flush,
    /* the reading of an element as the reader would say it (for tests) */
    function (element) { return readingOf(element); }
  ]);
  return api;
})`
