import {
  Alert02Icon,
  ArrowLeft01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Delete02Icon,
  Edit02Icon,
  Globe02Icon,
  HighlighterIcon,
  InformationCircleIcon,
  LinkSquare02Icon,
  Note01Icon,
  NoteEditIcon,
  Search01Icon,
  Settings02Icon,
  Shield01Icon,
  Target02Icon,
  TextUnderlineIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';

const ICONS = {
  alert: Alert02Icon,
  back: ArrowLeft01Icon,
  close: Cancel01Icon,
  check: CheckmarkCircle02Icon,
  clock: Clock01Icon,
  delete: Delete02Icon,
  edit: Edit02Icon,
  globe: Globe02Icon,
  highlighter: HighlighterIcon,
  info: InformationCircleIcon,
  open: LinkSquare02Icon,
  note: Note01Icon,
  noteEdit: NoteEditIcon,
  search: Search01Icon,
  settings: Settings02Icon,
  shield: Shield01Icon,
  target: Target02Icon,
  underline: TextUnderlineIcon,
  tick: Tick02Icon,
};

const SVG_NS = 'http://www.w3.org/2000/svg';

const attrName = (key) => key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

export function icon(name, { size = 16, className = 'icon' } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  for (const [tag, attrs] of ICONS[name] ?? []) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key !== 'key') node.setAttribute(attrName(key), value);
    }
    svg.append(node);
  }
  return svg;
}

export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    el.replaceWith(icon(el.dataset.icon, { size: Number(el.dataset.size) || 16 }));
  }
}
