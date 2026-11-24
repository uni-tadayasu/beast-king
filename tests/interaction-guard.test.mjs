import test from 'node:test';
import assert from 'node:assert/strict';
import { mountInteractionGuard } from '../interaction-guard.js';

class Element {
  nodeType = 1;
  parentElement = null;
  children = [];
  writes = 0;
  scans = 0;
  constructor(tag, attributes = {}) { this.tag = tag; this.attributes = new Map(Object.entries(attributes)); }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } return this; }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.writes++; this.attributes.set(name, String(value)); }
  matches(selector) {
    return selector.split(',').some(part => {
      const value = part.trim();
      if (value.startsWith('.')) return (this.getAttribute('class') || '').split(/\s+/).includes(value.slice(1));
      const attr = value.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
      if (attr) return this.attributes.has(attr[1]) && (attr[2] === undefined || this.getAttribute(attr[1]) === attr[2]);
      return this.tag === value;
    });
  }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  querySelectorAll(selector) {
    this.scans++;
    const result = [];
    const visit = node => { for (const child of node.children) { if (child.matches(selector)) result.push(child); visit(child); } };
    visit(this);
    return result;
  }
}

class Document extends EventTarget {
  documentElement = new Element('html');
  registrations = [];
  addEventListener(type, listener, options) { this.registrations.push({ type, listener, options }); super.addEventListener(type, listener, options); }
  removeEventListener(type, listener, options) {
    this.registrations = this.registrations.filter(item => item.type !== type || item.listener !== listener);
    super.removeEventListener(type, listener, options);
  }
  emit(type, target = this.documentElement, values = {}) {
    const event = new Event(type, { cancelable: true });
    for (const [name, value] of Object.entries({ target, ...values })) Object.defineProperty(event, name, { value });
    this.dispatchEvent(event);
    return event;
  }
}

function setup(...elements) {
  const doc = new Document();
  doc.documentElement.append(...elements);
  const observers = [];
  class Observer {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe(root, options) { this.root = root; this.options = options; }
    disconnect() { this.disconnected = true; }
  }
  const controller = mountInteractionGuard({ document: doc, MutationObserver: Observer });
  return { doc, controller, observers, Observer };
}

test('editable controls and readonly link codes remain selectable with page context menus disabled', () => {
  const span = new Element('span');
  const input = new Element('input');
  const code = new Element('input', { readonly: '' });
  const textarea = new Element('textarea');
  const select = new Element('select');
  const inner = new Element('span');
  const editable = new Element('div', { contenteditable: 'true' }).append(inner);
  const { doc } = setup(span, input, code, textarea, select, editable);
  assert.equal(doc.emit('selectstart', span).defaultPrevented, true);
  assert.equal(doc.emit('selectstart', { nodeType: 3, parentElement: span }).defaultPrevented, true);
  for (const target of [input, code, textarea, select, editable, inner]) {
    assert.equal(doc.emit('selectstart', target).defaultPrevented, false);
    assert.equal(doc.emit('contextmenu', target).defaultPrevented, true);
  }
});

test('shadow-root editable targets preserve selection and drag while their context menus are disabled', () => {
  const island = new Element('span', { contenteditable: 'false' });
  const editable = new Element('div', { contenteditable: 'plaintext-only' }).append(island);
  const input = new Element('input');
  const host = new Element('div', { 'data-protect-art': '' });
  const { doc } = setup(editable, host);
  assert.equal(doc.emit('selectstart', island).defaultPrevented, true);
  for (const type of ['selectstart', 'dragstart']) {
    const event = doc.emit(type, host, { composedPath: () => [input, host, doc] });
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(doc.emit('contextmenu', host, { composedPath: () => [input, host, doc] }).defaultPrevented, true);
});

test('context menus are blocked across the page while drag protection remains limited to artwork', () => {
  const image = new Element('img');
  const vector = new Element('path');
  const svg = new Element('svg').append(vector);
  const text = new Element('span');
  const card = new Element('button', { class: 'game-card' }).append(text);
  const custom = new Element('div', { 'data-protect-art': '' });
  const input = new Element('input');
  const arena = new Element('section', { class: 'arena' }).append(input);
  const link = new Element('a');
  const { doc } = setup(image, svg, card, custom, arena, link);
  for (const target of [doc.documentElement, image, vector, card, text, custom, arena, input, link]) {
    assert.equal(doc.emit('contextmenu', target).defaultPrevented, true);
  }
  for (const target of [image, vector, text, custom]) assert.equal(doc.emit('dragstart', target).defaultPrevented, true);
  for (const target of [input, link]) assert.equal(doc.emit('dragstart', target).defaultPrevented, false);
});

test('single-touch scrolling, ordinary wheel and seven consecutive logo clicks stay available', () => {
  const logo = new Element('img');
  const button = new Element('button').append(logo);
  const { doc } = setup(button);
  let clicks = 0;
  doc.addEventListener('click', () => clicks++);
  for (let i = 0; i < 7; i++) {
    for (const type of ['pointerdown', 'touchstart', 'touchmove', 'touchend', 'click', 'dblclick']) {
      assert.equal(doc.emit(type, logo, { touches: [{}] }).defaultPrevented, false);
    }
  }
  assert.equal(clicks, 7);
  assert.equal(doc.emit('wheel', button, { ctrlKey: false, deltaY: 100 }).defaultPrevented, false);
});

test('pinches and page-zoom shortcuts are cancelled but text editing and focus shortcuts are preserved', () => {
  const input = new Element('input');
  const { doc } = setup(input);
  for (const type of ['touchstart', 'touchmove']) assert.equal(doc.emit(type, input, { touches: [{}, {}] }).defaultPrevented, true);
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) assert.equal(doc.emit(type, input).defaultPrevented, true);
  assert.equal(doc.emit('wheel', input, { ctrlKey: true }).defaultPrevented, true);
  for (const modifier of ['ctrlKey', 'metaKey']) {
    for (const key of ['+', '=', '-', '_', '0']) assert.equal(doc.emit('keydown', input, { key, [modifier]: true }).defaultPrevented, true);
    for (const key of ['a', 'c', 'v', 'x', 'z', 'y', 'ArrowLeft', 'Backspace']) assert.equal(doc.emit('keydown', input, { key, [modifier]: true }).defaultPrevented, false);
  }
  for (const key of ['Tab', 'Enter', ' ', '0', '+', '-']) assert.equal(doc.emit('keydown', input, { key }).defaultPrevented, false);
  assert.equal(doc.emit('keydown', input, { code: 'NumpadAdd', ctrlKey: true }).defaultPrevented, true);
  assert.equal(doc.emit('keydown', input, { key: '=', ctrlKey: true, altKey: true }).defaultPrevented, false);
  for (const type of ['wheel', 'touchstart', 'touchmove', 'gesturestart']) {
    assert.equal(doc.registrations.find(item => item.type === type).options.passive, false);
  }
});

test('initial and inserted images cannot drag, and attribute observation does not loop or rescan the page', () => {
  const image = new Element('img', { draggable: 'true' });
  const alreadyProtected = new Element('img', { draggable: 'false' });
  const { doc, observers } = setup(image, alreadyProtected);
  assert.equal(image.getAttribute('draggable'), 'false');
  assert.equal(alreadyProtected.writes, 0);
  const observer = observers[0];
  assert.deepEqual(observer.options.attributeFilter, ['draggable']);
  const initialScans = doc.documentElement.scans;
  const addedImage = new Element('img');
  const subtree = new Element('section').append(addedImage);
  observer.callback([{ type: 'childList', addedNodes: [subtree, { nodeType: 3 }] }]);
  assert.equal(addedImage.getAttribute('draggable'), 'false');
  assert.equal(doc.documentElement.scans, initialScans);
  const writes = addedImage.writes;
  observer.callback([{ type: 'attributes', target: addedImage }]);
  assert.equal(addedImage.writes, writes);
  addedImage.setAttribute('draggable', 'true');
  observer.callback([{ type: 'attributes', target: addedImage }]);
  assert.equal(addedImage.getAttribute('draggable'), 'false');
});

test('mounting twice is idempotent and teardown releases event handlers and the image observer', () => {
  const { doc, controller, observers, Observer } = setup();
  const handlers = doc.registrations.length;
  assert.equal(mountInteractionGuard({ document: doc, MutationObserver: Observer }), controller);
  assert.equal(doc.registrations.length, handlers);
  assert.equal(observers.length, 1);
  controller.destroy();
  controller.destroy();
  assert.equal(observers[0].disconnected, true);
  assert.equal(doc.registrations.length, 0);
  assert.equal(doc.emit('selectstart').defaultPrevented, false);
  assert.notEqual(mountInteractionGuard({ document: doc, MutationObserver: Observer }), controller);
  assert.equal(observers.length, 2);
});

test('a head-loaded guard protects later images when the document element becomes available', () => {
  const doc = new Document();
  doc.documentElement = null;
  const controller = mountInteractionGuard({ document: doc, MutationObserver: null });
  const image = new Element('img');
  doc.documentElement = new Element('html').append(image);
  doc.emit('DOMContentLoaded');
  assert.equal(image.getAttribute('draggable'), 'false');
  controller.destroy();
  assert.equal(mountInteractionGuard({ document: null }), null);
});
