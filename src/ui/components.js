import { el } from './dom.js';
import { audio } from '../systems/AudioManager.js';
import { SFX } from '../config/constants.js';

/** Кнопка со звуками наведения и клика (ТЗ 3.3). */
export function button(label, onClick, { variant, disabled, title, className = '' } = {}) {
  const cls = ['btn', variant && `btn--${variant}`, className].filter(Boolean).join(' ');
  const node = el('button', { class: cls, type: 'button', disabled, title }, label);
  node.addEventListener('pointerenter', () => !node.disabled && audio.playSfx(SFX.HOVER));
  node.addEventListener('click', (e) => {
    e.stopPropagation();
    if (node.disabled) return;
    audio.playSfx(SFX.CLICK);
    onClick?.(e);
  });
  // Клик по HTML не должен «проваливаться» в канвас (например, листать диалог).
  node.addEventListener('pointerdown', (e) => e.stopPropagation());
  return node;
}
