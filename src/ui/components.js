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
    audio.playSfx(node.classList.contains('wbtn--primary') ? SFX.CONFIRM : SFX.CLICK);
    onClick?.(e);
  });
  // Клик по HTML не должен листать диалог или срабатывать в сцене.
  node.addEventListener('pointerdown', (e) => e.stopPropagation());
  return node;
}

/**
 * Обычная веб-кнопка нового стиля (макет меню): скруглённая, со шрифтом интерфейса (Onest) и иконкой.
 * Варианты: primary — оранжевая главная, light — светлая (гараж), dark — тёмная (меню, окна).
 * @param {{ variant?: 'primary'|'light'|'dark', icon?: string, disabled?: boolean, title?: string, className?: string }} [opts]
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

/**
 * Сегменты — выбор одного из нескольких вариантов (режим экрана, масштаб, скорость текста).
 * Выбранный сегмент — светлее, с оранжевой «контрольной лампой».
 * @param {{ value: string, label: string }[]} options
 */
export function segmented(options, value, onChange, { label } = {}) {
  const root = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  const buttons = options.map((o) =>
    wire(
      el(
        'button',
        {
          class: 'seg__item',
          type: 'button',
          role: 'radio',
          'aria-checked': String(o.value === value),
        },
        [el('span', { class: 'seg__lamp', 'aria-hidden': 'true' }), o.label],
      ),
      () => {
        for (const b of buttons)
          b.setAttribute('aria-checked', String(b === buttons[options.indexOf(o)]));
        onChange(o.value);
      },
    ),
  );
  root.append(...buttons);
  return root;
}

/** Переключатель «вкл/выкл». */
export function toggle(checked, onChange, { label } = {}) {
  const node = el('button', {
    class: 'switch',
    type: 'button',
    role: 'switch',
    'aria-checked': String(checked),
    'aria-label': label,
  });
  return wire(node, () => {
    const on = node.getAttribute('aria-checked') !== 'true';
    node.setAttribute('aria-checked', String(on));
    onChange(on);
  });
}

/** Ползунок 0…100 со значением справа; пройденная часть — цветом ушанки. */
export function slider(value, onChange, { label } = {}) {
  const out = el('span', { class: 'slider__value', text: String(value) });
  const input = el('input', {
    class: 'slider__input',
    type: 'range',
    min: 0,
    max: 100,
    step: 5,
    value,
    'aria-label': label,
  });
  const paint = () => input.style.setProperty('--fill', `${input.value}%`);
  paint();
  input.addEventListener('input', () => {
    out.textContent = input.value;
    paint();
    onChange(Number(input.value));
  });
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
  return el('div', { class: 'slider' }, [input, out]);
}
