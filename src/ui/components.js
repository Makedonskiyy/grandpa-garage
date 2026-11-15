import { el } from './dom.js';
import { icon as makeIcon } from './icons.js';
import { audio } from '../systems/AudioManager.js';
import { SFX } from '../config/constants.js';

/** Общая логика: звуки наведения и клика (ТЗ 3.3), клик не «проваливается» в канвас. */
function wire(node, onClick) {
  node.addEventListener('pointerenter', () => !node.disabled && audio.playSfx(SFX.HOVER));
  node.addEventListener('click', (e) => {
    e.stopPropagation();
    if (node.disabled) return;
    audio.playSfx(SFX.CLICK);
    onClick?.(e);
  });
  // Клик по HTML не должен листать диалог или срабатывать в сцене.
  node.addEventListener('pointerdown', (e) => e.stopPropagation());
  return node;
}

/**
 * Обычная веб-кнопка нового стиля (макет меню): скруглённая, со шрифтом Literata и иконкой.
 * @param {{ variant?: 'primary'|'light', icon?: string, disabled?: boolean, title?: string, className?: string }} [opts]
 */
export function webButton(
  label,
  onClick,
  { variant = 'light', icon, disabled, title, className = '' } = {},
) {
  const cls = ['wbtn', `wbtn--${variant}`, className].filter(Boolean).join(' ');
  const node = el('button', { class: cls, type: 'button', disabled, title }, [
    icon ? makeIcon(icon) : null,
    el('span', { class: 'wbtn__label', text: label }),
  ]);
  return wire(node, onClick);
}
