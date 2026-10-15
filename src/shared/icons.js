import {
  Alert02Icon,
  ArrowLeft01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Copy01Icon,
  Download04Icon,
  Folder01Icon,
  MoreHorizontalIcon,
  Add01Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  Tag01Icon,
  KeyboardIcon,
  Pin02Icon,
  SidebarRightIcon,
  Sorting01Icon,
  StickyNote02Icon,
  Undo02Icon,
  Upload04Icon,
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
  CommandIcon,
  OptionIcon,
  CornerDownLeftIcon,
} from '@hugeicons/core-free-icons';

// Apple's key symbols are too thin as font glyphs.
const stroke = (d) => ['path', { d, stroke: 'currentColor', strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round' }];
const KEY_ICONS = {
  keyCommand: CommandIcon,
  keyOption: OptionIcon,
  keyReturn: CornerDownLeftIcon,
  keyShift: [stroke('M12 3.5L20.5 12.5H15.5V20.5H8.5V12.5H3.5L12 3.5Z')],
  keyControl: [stroke('M5.5 14.5L12 8L18.5 14.5')],
  keyTab: [stroke('M3.5 12H17.5'), stroke('M13 7.5L17.5 12L13 16.5'), stroke('M20.5 6V18')],
  keyBackspace: [stroke('M8.5 5.5H19C20.1 5.5 21 6.4 21 7.5V16.5C21 17.6 20.1 18.5 19 18.5H8.5L2.5 12L8.5 5.5Z'), stroke('M11.5 9.5L16.5 14.5M16.5 9.5L11.5 14.5')],
  keyUp: [stroke('M12 19V5'), stroke('M6 11L12 5L18 11')],
  keyDown: [stroke('M12 5V19'), stroke('M6 13L12 19L18 13')],
  keyLeft: [stroke('M19 12H5'), stroke('M11 6L5 12L11 18')],
  keyRight: [stroke('M5 12H19'), stroke('M13 6L19 12L13 18')],
};

const dot = (cx, cy) => ['circle', { cx, cy, r: '1.6', fill: 'currentColor' }];
const GRIP = [dot('9', '6'), dot('15', '6'), dot('9', '12'), dot('15', '12'), dot('9', '18'), dot('15', '18')];

const ICONS = {
  ...KEY_ICONS,
  grip: GRIP,
  alert: Alert02Icon,
  back: ArrowLeft01Icon,
  close: Cancel01Icon,
  check: CheckmarkCircle02Icon,
  clock: Clock01Icon,
  copy: Copy01Icon,
  download: Download04Icon,
  folder: Folder01Icon,
  more: MoreHorizontalIcon,
  add: Add01Icon,
  up: ArrowUp01Icon,
  down: ArrowDown01Icon,
  tag: Tag01Icon,
  keyboard: KeyboardIcon,
  pin: Pin02Icon,
  panel: SidebarRightIcon,
  sort: Sorting01Icon,
  pageNote: StickyNote02Icon,
  undo: Undo02Icon,
  upload: Upload04Icon,
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
