import { createNoteEditor, MAX_NOTE_LENGTH } from '../../shared/note-editor.js';

const text = (value, max = 500) => (typeof value === 'string' ? value.slice(0, max) : '');

const token = location.hash.slice(1);
let port = null;

function start(opts) {
  document.body.classList.toggle('panel', opts?.variant === 'panel');
  const editor = createNoteEditor({
    value: text(opts.value, MAX_NOTE_LENGTH),
    placeholder: text(opts.placeholder),
    label: text(opts.label),
    openTip: text(opts.openTip),
    openKeys: text(opts.openKeys),
    onInput: () => port.postMessage({ type: 'input', value: editor.value }),
  });
  const wrap = document.getElementById('wrap');
  wrap.append(editor.el);

  let height = 0;
  const report = () => {
    const next = Math.ceil(wrap.getBoundingClientRect().height);
    if (next !== height) {
      height = next;
      port.postMessage({ type: 'height', height });
    }
  };
  new ResizeObserver(report).observe(wrap);

  editor.el.addEventListener('focus', () => port.postMessage({ type: 'focus' }));
  editor.el.addEventListener('blur', () => port.postMessage({ type: 'blur' }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      port.postMessage({ type: 'escape' });
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      port.postMessage({ type: 'submit', value: editor.value });
    }
  });

  port.onmessage = ({ data }) => {
    if (data?.type === 'value' && typeof data.value === 'string') editor.value = data.value.slice(0, MAX_NOTE_LENGTH);
    else if (data?.type === 'focus') {
      editor.focus({ preventScroll: true });
      if (data.caret) editor.setCaret(editor.value.length);
    }
  };
  report();
  port.postMessage({ type: 'ready' });
}

window.addEventListener('message', (e) => {
  if (port || !token || e.source !== window.parent || e.data?.type !== 'init' || e.data.token !== token || !e.ports[0]) return;
  port = e.ports[0];
  start(e.data.opts && typeof e.data.opts === 'object' ? e.data.opts : {});
});
