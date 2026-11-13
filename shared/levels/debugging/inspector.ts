// The Elements panel's side inside the sealed frame (ADR 0007, chapter 3; docs/features/ui.md, "Elements"), part of the
// bridge in levels that use the panel. It
// - takes a snapshot of the app's DOM as plain data (tag, a few attributes, a short own text, whether it has a box and
//   whether its content sticks out), capped, and leaves out what Grindstone put on the page,
// - says which of the page's rules (read by Grindstone from the level's CSS, css.ts) match an element and its
//   ancestors (the browser's own `matches` and `matchMedia` decide), which declarations the browser refuses, the box and
//   a few computed values,
// - outlines an element on the page (margin, border, padding, content, like DevTools) in a layer the app can't click,
// - and in pick mode outlines what is under the pointer and selects what you click, without the app seeing the click.
// Everything it posts is plain data; the page reads it with readBridgeMessage and shows it as text. Like the bridge, it
// is JavaScript in a string (no line comments, every statement ends in a semicolon), tested in a real browser
// (e2e/debugging-elements.spec.ts).
import { MAX_DOM_NODES } from './elements'

const SOURCE = String.raw`(function (config, tools) {
  var post = tools.post;
  var describe = tools.describe;
  var own = tools.own;
  var MAX_NODES = ${MAX_DOM_NODES};
  var nodes = [];
  var ids = new Map();
  var picking = false;
  var highlighted = null;
  var layer = null;

  var cut = function (text, max) { return text.length > max ? text.slice(0, max - 1) + '…' : text; };
  var mine = function (element) { return own.indexOf(element) >= 0 || (layer !== null && element === layer.host); };
  var ownText = function (element) {
    var text = '';
    for (var child = element.firstChild; child; child = child.nextSibling) if (child.nodeType === 3) text += child.nodeValue;
    text = text.replace(/\s+/g, ' ').trim();
    return text ? cut(text, 80) : null;
  };
  var round = function (value) { return Math.round(value * 100) / 100; };

  /* The snapshot: elements in document order, each with its parent's id; the stylesheets' data URLs named by their file. */
  var snapshot = function () {
    nodes = [];
    ids = new Map();
    var list = [];
    var truncated = false;
    var sheet = 0;
    var visit = function (element, parent) {
      if (nodes.length >= MAX_NODES) { truncated = true; return; }
      if (mine(element)) return;
      var id = nodes.length;
      nodes.push(element);
      ids.set(element, id);
      var tag = String(element.localName || element.tagName || '').toLowerCase();
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(tag)) tag = 'unknown';
      var attrs = [];
      for (var i = 0; i < element.attributes.length && attrs.length < 12; i++) {
        var name = element.attributes[i].name;
        var value = element.attributes[i].value;
        if (!/^[^\s"'<>\/=]{1,64}$/.test(name)) continue;
        if (tag === 'link' && name === 'href' && value.indexOf('data:text/css') === 0) value = './' + (config.sheets[sheet++] || 'style.css');
        attrs.push([name, cut(value, 120)]);
      }
      if (tag === 'script' && !element.hasAttribute('src')) {
        var entry = /^import "([^"]+)"\s*$/.exec(element.textContent || '');
        if (entry && attrs.length < 12) attrs.push(['src', './' + entry[1]]);
      }
      var shown = element.getClientRects().length > 0;
      var overflows = shown && element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1;
      var leaf = tag === 'script' || tag === 'style' || tag === 'template';
      list.push({ id: id, parent: parent, tag: tag, attrs: attrs, text: leaf ? null : ownText(element), shown: shown, overflows: overflows });
      if (leaf) return;
      for (var child = element.firstElementChild; child; child = child.nextElementSibling) visit(child, id);
    };
    if (document.documentElement) visit(document.documentElement, -1);
    post({ type: 'dom', nodes: list, truncated: truncated });
  };

  /* Which of the page's rules hold here (their media and supports conditions) and match the element (by selector). */
  var holds = function (rule) {
    for (var i = 0; i < rule.conditions.length; i++) {
      var kind = rule.conditions[i][0];
      var text = rule.conditions[i][1];
      try {
        if (kind === 'media' ? !window.matchMedia(text).matches : !CSS.supports(text)) return false;
      } catch (error) {
        return false;
      }
    }
    return true;
  };
  var accepted = function (declaration) {
    if (declaration[0].indexOf('--') === 0) return true;
    try { return CSS.supports(declaration[0], declaration[1]); } catch (error) { return false; }
  };
  var inspect = function (id, seq) {
    var element = nodes[id];
    var answer = { type: 'inspected', seq: seq, node: id, found: false, chain: [], invalid: [], box: null, computed: [], scroll: null };
    if (!element || !element.isConnected) { post(answer); return; }
    var checked = {};
    var live = config.rules.map(holds);
    for (var current = element; current && current.nodeType === 1 && answer.chain.length < 64; current = current.parentElement) {
      var matches = [];
      for (var r = 0; r < config.rules.length; r++) {
        if (!live[r]) continue;
        var hit = [];
        for (var s = 0; s < config.rules[r].selectors.length; s++) {
          try { if (current.matches(config.rules[r].selectors[s])) hit.push(s); } catch (error) { /* a selector the browser can't read matches nothing */ }
        }
        if (!hit.length) continue;
        matches.push({ rule: r, selectors: hit });
        if (checked[r]) continue;
        checked[r] = true;
        var refused = [];
        config.rules[r].declarations.forEach(function (declaration, index) { if (!accepted(declaration)) refused.push(index); });
        if (refused.length) answer.invalid.push({ rule: r, declarations: refused });
      }
      answer.chain.push({ node: ids.has(current) ? ids.get(current) : -1, label: describe(current), inline: current.getAttribute('style'), matches: matches });
    }
    var style = getComputedStyle(element);
    var px = function (name) { return round(parseFloat(style.getPropertyValue(name)) || 0); };
    var sides = function (prefix, suffix) { return ['top', 'right', 'bottom', 'left'].map(function (side) { return px(prefix + side + suffix); }); };
    if (element.getClientRects().length) {
      var rect = element.getBoundingClientRect();
      var padding = sides('padding-', '');
      var border = sides('border-', '-width');
      answer.box = {
        width: round(Math.max(rect.width - padding[1] - padding[3] - border[1] - border[3], 0)),
        height: round(Math.max(rect.height - padding[0] - padding[2] - border[0] - border[2], 0)),
        padding: padding,
        border: border,
        margin: sides('margin-', '')
      };
    }
    answer.computed = config.computed.map(function (name) { return [name, cut(style.getPropertyValue(name), 200)]; });
    answer.scroll = { scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight };
    answer.found = true;
    post(answer);
  };

  /* The outline: margin, border, padding and content boxes in a closed shadow root on top of everything, never clickable. */
  var box = function (root, colour) {
    var element = document.createElement('div');
    element.style.cssText = 'position: fixed; box-sizing: border-box; pointer-events: none; background: ' + colour + ';';
    root.appendChild(element);
    return element;
  };
  var ensureLayer = function () {
    if (!layer) {
      var host = document.createElement('grindstone-highlight');
      host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; display: block;';
      host.setAttribute('aria-hidden', 'true');
      var root = host.attachShadow({ mode: 'closed' });
      layer = { host: host, margin: box(root, 'rgba(246, 178, 107, 0.55)'), border: box(root, 'rgba(255, 220, 140, 0.7)'), padding: box(root, 'rgba(147, 196, 125, 0.55)'), content: box(root, 'rgba(111, 168, 220, 0.55)'), label: box(root, '#1f2328') };
      layer.label.style.cssText += 'color: #fff; font: 11px/1.4 ui-monospace, Menlo, Consolas, monospace; padding: 2px 6px; border-radius: 3px; white-space: nowrap; max-width: 90vw; overflow: hidden; text-overflow: ellipsis;';
    }
    if (!layer.host.isConnected) document.documentElement.appendChild(layer.host);
    return layer;
  };
  var place = function (element, left, top, width, height) {
    element.style.left = left + 'px';
    element.style.top = top + 'px';
    element.style.width = Math.max(width, 0) + 'px';
    element.style.height = Math.max(height, 0) + 'px';
  };
  var draw = function () {
    var target = highlighted;
    if (!target || !target.isConnected || !target.getClientRects().length) {
      if (layer) layer.host.style.display = 'none';
      return;
    }
    var shapes = ensureLayer();
    shapes.host.style.display = 'block';
    var rect = target.getBoundingClientRect();
    var style = getComputedStyle(target);
    var n = function (name) { return parseFloat(style.getPropertyValue(name)) || 0; };
    var m = [n('margin-top'), n('margin-right'), n('margin-bottom'), n('margin-left')];
    var b = [n('border-top-width'), n('border-right-width'), n('border-bottom-width'), n('border-left-width')];
    var p = [n('padding-top'), n('padding-right'), n('padding-bottom'), n('padding-left')];
    place(shapes.margin, rect.left - m[3], rect.top - m[0], rect.width + m[1] + m[3], rect.height + m[0] + m[2]);
    place(shapes.border, rect.left, rect.top, rect.width, rect.height);
    place(shapes.padding, rect.left + b[3], rect.top + b[0], rect.width - b[1] - b[3], rect.height - b[0] - b[2]);
    place(shapes.content, rect.left + b[3] + p[3], rect.top + b[0] + p[0], rect.width - b[1] - b[3] - p[1] - p[3], rect.height - b[0] - b[2] - p[0] - p[2]);
    shapes.label.textContent = describe(target) + '  ' + round(rect.width) + ' × ' + round(rect.height);
    shapes.label.style.left = Math.max(Math.min(rect.left, window.innerWidth - 80), 0) + 'px';
    shapes.label.style.top = (rect.top - m[0] >= 22 ? rect.top - m[0] - 22 : Math.min(rect.bottom + m[2] + 2, window.innerHeight - 20)) + 'px';
    shapes.label.style.width = 'auto';
    shapes.label.style.height = 'auto';
  };
  var redraw = 0;
  var follow = function () {
    if (!highlighted || redraw) return;
    redraw = requestAnimationFrame(function () { redraw = 0; draw(); });
  };
  window.addEventListener('scroll', follow, true);
  window.addEventListener('resize', follow);
  var highlight = function (id) {
    highlighted = id >= 0 && nodes[id] ? nodes[id] : null;
    draw();
  };

  /* Pick mode: what is under the pointer is outlined; a click selects it, and neither the move nor the click reach the app. */
  var hovering = null;
  var hoverFrame = 0;
  var cursor = null;
  var swallow = function (event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  var onMove = function (event) {
    var target = event.target instanceof Element && !mine(event.target) ? event.target : null;
    if (target === hovering) return;
    hovering = target;
    highlighted = target;
    draw();
    if (hoverFrame) return;
    hoverFrame = requestAnimationFrame(function () {
      hoverFrame = 0;
      post({ type: 'hovered', node: hovering && ids.has(hovering) ? ids.get(hovering) : -1 });
    });
  };
  var SWALLOWED = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'contextmenu', 'auxclick'];
  var stop = function () {
    if (!picking) return;
    picking = false;
    hovering = null;
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKey, true);
    SWALLOWED.forEach(function (type) { window.removeEventListener(type, swallow, { capture: true }); });
    if (cursor) document.adoptedStyleSheets = document.adoptedStyleSheets.filter(function (each) { return each !== cursor; });
  };
  var onClick = function (event) {
    swallow(event);
    var target = event.target instanceof Element && !mine(event.target) ? event.target : null;
    stop();
    snapshot();
    if (target && ids.has(target)) post({ type: 'picked', node: ids.get(target) });
    else post({ type: 'pickEnd' });
  };
  var onKey = function (event) {
    if (event.key !== 'Escape') return;
    swallow(event);
    stop();
    highlighted = null;
    draw();
    post({ type: 'pickEnd' });
  };
  var start = function () {
    if (picking) return;
    picking = true;
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
    SWALLOWED.forEach(function (type) { window.addEventListener(type, swallow, { capture: true, passive: false }); });
    try {
      if (!cursor) {
        cursor = new CSSStyleSheet();
        cursor.replaceSync('* { cursor: crosshair !important; }');
      }
      document.adoptedStyleSheets = document.adoptedStyleSheets.concat([cursor]);
    } catch (error) { cursor = null; }
  };

  return {
    snapshot: snapshot,
    inspect: inspect,
    highlight: highlight,
    pick: function (on) { if (on) start(); else stop(); }
  };
})`

/** The inspector as one line of JavaScript: a function expression that takes its config and the bridge's tools. */
export const INSPECTOR_SOURCE = SOURCE.replace(/\s*\n\s*/g, ' ')
