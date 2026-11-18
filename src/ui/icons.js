/**
 * Иконки интерфейса — один набор: Phosphor (MIT), начертание regular.
 * SVG лежат в пакете @phosphor-icons/core и попадают в сборку как текст.
 * Цвет — currentColor, то есть цвет текста кнопки; размер задаёт CSS (.icon).
 * Новые иконки добавлять только из Phosphor regular.
 */
import play from '@phosphor-icons/core/assets/regular/play.svg?raw';
import bookOpen from '@phosphor-icons/core/assets/regular/book-open-text.svg?raw';
import sliders from '@phosphor-icons/core/assets/regular/sliders-horizontal.svg?raw';
import close from '@phosphor-icons/core/assets/regular/x.svg?raw';
import check from '@phosphor-icons/core/assets/regular/check.svg?raw';
import drop from '@phosphor-icons/core/assets/regular/drop.svg?raw';
import tire from '@phosphor-icons/core/assets/regular/tire.svg?raw';
import engine from '@phosphor-icons/core/assets/regular/engine.svg?raw';
import carProfile from '@phosphor-icons/core/assets/regular/car-profile.svg?raw';
import wind from '@phosphor-icons/core/assets/regular/wind.svg?raw';
import palette from '@phosphor-icons/core/assets/regular/palette.svg?raw';
import arrowsOut from '@phosphor-icons/core/assets/regular/arrows-out.svg?raw';
import monitor from '@phosphor-icons/core/assets/regular/monitor.svg?raw';
import mouse from '@phosphor-icons/core/assets/regular/mouse.svg?raw';

const ICONS = {
  play,
  help: bookOpen,
  gear: sliders,
  close,
  check,
  wash: drop,
  fullscreen: arrowsOut,
  window: monitor,
  mouse,
  // вкладки тюнинга
  wheels: tire,
  engine,
  body: carProfile,
  spoiler: wind,
  looks: palette,
};

export function icon(name) {
  const span = document.createElement('span');
  span.className = `icon icon--${name}`;
  span.setAttribute('aria-hidden', 'true');
  if (ICONS[name]) span.innerHTML = ICONS[name];
  return span;
}
