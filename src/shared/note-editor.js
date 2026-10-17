import { h } from './dom.js';
import { isMac } from './platform.js';
import { markdownLineSpans } from './markdown.js';

const PLAINTEXT = (() => {
  const probe = document.createElement('div');
  probe.contentEditable = 'plaintext-only';
  return probe.contentEditable === 'plaintext-only';
})();

export function createNoteEditor({ value = '', placeholder = '', label = '', openTip = '', openKeys = '', onInput = () => {} } = {}) {
  let text = value;
  let undo = [];
  let redo = [];
  let lastTyped = 0;
  const el = h('div', {
    class: 'note-editor',
    contenteditable: PLAINTEXT ? 'plaintext-only' : 'true',
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': label,
    spellcheck: 'true',
    dataset: { placeholder },
  });

  const selection = () => el.getRootNode().getSelection?.() ?? getSelection();

  function offsetOf(node, offset) {
    if (!el.contains(node)) return null;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.setEnd(node, offset);
    return Math.min(text.length, range.toString().length);
  }

  function readSelection() {
    const sel = selection();
    if (!sel?.rangeCount || !sel.anchorNode) return null;
    const a = offsetOf(sel.anchorNode, sel.anchorOffset);
    const b = offsetOf(sel.focusNode, sel.focusOffset);
    return a == null || b == null ? null : { start: Math.min(a, b), end: Math.max(a, b), backward: b < a };
  }

  function locate(target) {
    let seen = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement.closest('.md-mark')) {
        seen += node.length;
        continue;
      }
      if (target <= seen + node.length) return [node, target - seen];
      seen += node.length;
    }
    return [el, el.childNodes.length];
  }

  function writeSelection({ start, end, backward = false }) {
    const sel = selection();
    if (!sel) return;
    const [startNode, startOffset] = locate(start);
    const [endNode, endOffset] = start === end ? [startNode, startOffset] : locate(end);
    sel.setBaseAndExtent(...(backward ? [endNode, endOffset, startNode, startOffset] : [startNode, startOffset, endNode, endOffset]));
  }

  function build(nodes, into) {
    for (const node of nodes) {
      if (node.type === 'text') {
        into.append(node.text);
        continue;
      }
      const dataset = node.start == null ? {} : { start: node.start, end: node.end };
      if (node.href) Object.assign(dataset, { href: node.href, tip: openTip, tipKeys: openKeys });
      const span = h('span', { class: `md-${node.type}`, dataset });
      if (node.open) span.append(h('span', { class: 'md-mark' }, node.open));
      build(node.children, span);
      if (node.close) span.append(h('span', { class: 'md-mark' }, node.close));
      into.append(span);
    }
  }

  function paint(range) {
    const pad = text.endsWith('\n') ? '\n' : '';
    const fragment = document.createDocumentFragment();
    build(markdownLineSpans(text), fragment);
    if (pad) fragment.append(h('span', { class: 'md-pad' }, pad));
    el.replaceChildren(fragment);
    el.toggleAttribute('data-empty', !text);
    reveal(range);
  }

  function reveal(range = readSelection()) {
    for (const span of el.querySelectorAll('[data-start]')) {
      const active = !!range && range.start <= Number(span.dataset.end) && range.end >= Number(span.dataset.start);
      span.classList.toggle('md-active', active);
    }
  }

  function commit(next, range, typing = false) {
    if (next === text) return;
    const now = Date.now();
    if (!(typing && undo.length && now - lastTyped < 1000)) {
      undo.push({ text, range: readSelection() ?? { start: text.length, end: text.length } });
      if (undo.length > 200) undo.shift();
    }
    lastTyped = typing ? now : 0;
    redo = [];
    apply(next, range);
    onInput();
  }

  function apply(next, range) {
    text = next;
    paint(range);
    if (document.activeElement === el || el.getRootNode().activeElement === el) writeSelection(range);
  }

  function replace(insert, typing = false) {
    const range = readSelection() ?? { start: text.length, end: text.length };
    const caret = range.start + insert.length;
    commit(text.slice(0, range.start) + insert + text.slice(range.end), { start: caret, end: caret }, typing);
  }

  function step(from, to) {
    const entry = from.pop();
    if (!entry) return;
    to.push({ text, range: readSelection() ?? entry.range });
    apply(entry.text, entry.range);
    onInput();
  }

  el.addEventListener('beforeinput', (e) => {
    switch (e.inputType) {
      case 'historyUndo':
        step(undo, redo);
        break;
      case 'historyRedo':
        step(redo, undo);
        break;
      case 'insertParagraph':
      case 'insertLineBreak':
        replace('\n');
        break;
      case 'insertText':
        replace(e.data ?? '', true);
        break;
      case 'insertReplacementText':
      case 'insertFromPaste':
      case 'insertFromDrop':
        replace(e.data ?? e.dataTransfer?.getData('text/plain') ?? '');
        break;
      case 'deleteContentBackward':
      case 'deleteContentForward':
      case 'deleteWordBackward':
      case 'deleteWordForward':
      case 'deleteSoftLineBackward':
      case 'deleteSoftLineForward':
      case 'deleteHardLineBackward':
      case 'deleteHardLineForward':
      case 'deleteByCut':
      case 'deleteByDrag':
        if (!deleteInput(e)) return;
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  function deleteInput(e) {
    const range = readSelection();
    if (!range) return false;
    let { start, end } = range;
    if (start === end) {
      const target = e.getTargetRanges?.()[0];
      const a = target && offsetOf(target.startContainer, target.startOffset);
      const b = target && offsetOf(target.endContainer, target.endOffset);
      if (a != null && b != null && a !== b) [start, end] = [Math.min(a, b), Math.max(a, b)];
      else if (e.inputType.endsWith('Backward')) start = Math.max(0, start - 1);
      else end = Math.min(text.length, end + 1);
    }
    if (start === end) return true;
    commit(text.slice(0, start) + text.slice(end), { start, end: start });
    return true;
  }

  el.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.isComposing) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) step(undo, redo);
    else if ((key === 'z' && e.shiftKey) || (key === 'y' && !e.metaKey)) step(redo, undo);
    else return;
    e.preventDefault();
  });

  el.addEventListener('paste', (e) => {
    if (!e.clipboardData) return;
    e.preventDefault();
    replace(e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'));
  });

  el.addEventListener('copy', (e) => copyOrCut(e, false));
  el.addEventListener('cut', (e) => copyOrCut(e, true));
  function copyOrCut(e, cut) {
    const range = readSelection();
    if (!range || range.start === range.end || !e.clipboardData) return;
    e.clipboardData.setData('text/plain', text.slice(range.start, range.end));
    e.preventDefault();
    if (cut) commit(text.slice(0, range.start) + text.slice(range.end), { start: range.start, end: range.start });
  }

  const opens = (e) => (isMac ? e.metaKey : e.ctrlKey) && !e.shiftKey && !e.altKey;
  const linkAt = (e) => {
    const link = e.button === 0 && opens(e) && e.target.closest?.('[data-href]');
    return link && el.contains(link) ? link : null;
  };
  const follow = (e) => el.classList.toggle('md-follow', opens(e));
  el.addEventListener('pointermove', follow);
  el.addEventListener('pointerleave', () => el.classList.remove('md-follow'));
  el.addEventListener('keydown', follow);
  el.addEventListener('keyup', follow);
  el.addEventListener('mousedown', (e) => {
    if (linkAt(e)) e.preventDefault();
  });
  el.addEventListener('click', (e) => {
    const link = linkAt(e);
    if (!link) return;
    e.preventDefault();
    window.open(link.dataset.href, '_blank', 'noopener,noreferrer');
  });

  document.addEventListener('selectionchange', () => {
    if (el.isConnected && (el.getRootNode().activeElement === el || document.activeElement === el)) reveal();
  });
  el.addEventListener('focus', () => reveal());
  el.addEventListener('blur', () => reveal(null));

  paint(null);

  return {
    el,
    get value() {
      return text;
    },
    set value(next) {
      text = String(next ?? '');
      paint(null);
    },
    focus(options) {
      el.focus(options);
    },
    setCaret(position) {
      writeSelection({ start: position, end: position });
      reveal({ start: position, end: position });
    },
  };
}
