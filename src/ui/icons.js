/**
 * Иконки интерфейса — один набор (lucide, ISC), один размер и одна толщина линии.
 * Цвет — currentColor, то есть цвет текста кнопки. Новые иконки добавлять только из lucide.
 */
import {
  createElement,
  Play,
  CircleHelp,
  Settings,
  X,
  Disc3,
  Engine,
  Car,
  Wind,
  Palette,
  Droplets,
  Check,
} from 'lucide';

const ICONS = {
  play: Play,
  help: CircleHelp,
  gear: Settings,
  close: X,
  check: Check,
  wash: Droplets,
  // вкладки тюнинга
  wheels: Disc3,
  engine: Engine,
  body: Car,
  spoiler: Wind,
  looks: Palette,
};

/** Размер и толщина задаются здесь и в CSS (.icon) — больше нигде. */
const ICON_ATTRS = { width: 20, height: 20, 'stroke-width': 1.75, 'aria-hidden': 'true' };

export function icon(name) {
  const span = document.createElement('span');
  span.className = `icon icon--${name}`;
  const node = ICONS[name];
  if (node) span.append(createElement(node, ICON_ATTRS));
  return span;
}
