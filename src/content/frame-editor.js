// A note editor that lives in an extension-origin iframe, so scripts of the page cannot observe what is typed.
// A shadow root does not help here: key, input and paste events are composed and reach page listeners.
import { api } from '../shared/api.js';

const randomToken = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

export function createFrameEditor({
  value = '',
  variant = 'popover',
  placeholder = '',
  label = '',
  openTip = '',
  openKeys = '',
  onInput = () => {},
  onResize = () => {},
  onSubmit = () => {},
  onEscape = () => {},
  onBlur = () => {},
} = {}) {
  let text = value;
  let focused = false;
  let port = null;
  let pendingFocus = null;
  const token = randomToken();
  const src = `${api.runtime.getURL('editor.html')}#${token}`;
  const iframe = document.createElement('iframe');
  iframe.className = `note-frame in-${variant}`;
  iframe.title = label;
  iframe.setAttribute('allowtransparency', 'true');
  iframe.src = src;

  iframe.addEventListener('load', () => {
    // A second load means the frame navigated away; never hand the text to whatever is there now.
    if (port) {
      port.close();
      port = null;
      iframe.remove();
      return;
    }
    const channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = ({ data }) => {
      switch (data?.type) {
        case 'ready':
          if (pendingFocus) focus(pendingFocus);
          break;
        case 'input':
          if (typeof data.value === 'string') {
            text = data.value;
            onInput(text);
          }
          break;
        case 'height':
          if (Number.isFinite(data.height)) {
            iframe.style.height = `${Math.min(Math.max(data.height, 20), 400)}px`;
            onResize();
          }
          break;
        case 'focus':
          focused = true;
          break;
        case 'blur':
          focused = false;
          onBlur();
          break;
        case 'submit':
          if (typeof data.value === 'string') text = data.value;
          onSubmit();
          break;
        case 'escape':
          onEscape();
          break;
      }
    };
    const origin = new URL(src).origin;
    iframe.contentWindow.postMessage({ type: 'init', token, opts: { value: text, variant, placeholder, label, openTip, openKeys } }, origin, [channel.port2]);
  });

  function focus({ caret = false } = {}) {
    if (!port) {
      pendingFocus = { caret };
      return;
    }
    pendingFocus = null;
    iframe.focus({ preventScroll: true });
    port.postMessage({ type: 'focus', caret });
  }

  return {
    el: iframe,
    get value() {
      return text;
    },
    set value(next) {
      text = String(next ?? '');
      port?.postMessage({ type: 'value', value: text });
    },
    get focused() {
      return focused;
    },
    focus,
  };
}
