import { h } from '../../shared/dom.js';
import { t } from '../../shared/i18n.js';

export function armOnce(button, onConfirm) {
  let timer = null;
  button.addEventListener('click', () => {
    if (button.dataset.confirm != null) {
      clearTimeout(timer);
      onConfirm();
      return;
    }
    button.dataset.confirm = '';
    const label = h('span', null, t('actionDeleteConfirm'));
    button.append(label);
    timer = setTimeout(() => {
      delete button.dataset.confirm;
      label.remove();
    }, 3000);
  });
}
