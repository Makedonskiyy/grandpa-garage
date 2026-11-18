/**
 * Свой цвет: поле насыщенности и яркости, полоса оттенка и поле кода #rrggbb.
 * Тянуть можно мышью и пальцем; цвет уходит наружу сразу (onInput) — машина
 * перекрашивается вживую. Чистые функции перевода цвета — в начале файла (тесты).
 */
import { el } from './dom.js';
import { t } from '../systems/strings.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function hsvToHex(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[f(5), f(3), f(1)]
    .map((x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s: max ? d / max : 0, v: max };
}

/**
 * @param {string} hex начальный цвет
 * @param {(hex: string) => void} onInput
 */
export function colorPicker(hex, onInput) {
  let { h, s, v } = hexToHsv(hex);
  const $sv = el('div', {
    class: 'cpick__sv',
    role: 'slider',
    'aria-label': t('garage.looks.custom'),
  });
  const $svDot = el('span', { class: 'cpick__dot' });
  $sv.append($svDot);
  const $hue = el('div', { class: 'cpick__hue', role: 'slider', 'aria-label': 'Оттенок' });
  const $hueDot = el('span', { class: 'cpick__hue-dot' });
  $hue.append($hueDot);
  const $swatch = el('span', { class: 'cpick__swatch' });
  const $hex = el('input', {
    class: 'cpick__hex',
    type: 'text',
    maxlength: '7',
    spellcheck: 'false',
    'aria-label': t('garage.looks.hex'),
  });

  const paint = (emit = true) => {
    const value = hsvToHex(h, s, v);
    $sv.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex(h, 1, 1)})`;
    $svDot.style.left = `${s * 100}%`;
    $svDot.style.top = `${(1 - v) * 100}%`;
    $hueDot.style.left = `${(h / 360) * 100}%`;
    $swatch.style.background = value;
    if (document.activeElement !== $hex) $hex.value = value;
    if (emit) onInput(value);
  };

  const drag = (node, move) => {
    const at = (e) => {
      const r = node.getBoundingClientRect();
      move(clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height));
      paint();
    };
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      node.setPointerCapture(e.pointerId);
      at(e);
      const onMove = (ev) => at(ev);
      const onUp = () => {
        node.removeEventListener('pointermove', onMove);
        node.removeEventListener('pointerup', onUp);
      };
      node.addEventListener('pointermove', onMove);
      node.addEventListener('pointerup', onUp);
    });
  };
  drag($sv, (x, y) => {
    s = x;
    v = 1 - y;
  });
  drag($hue, (x) => {
    h = Math.min(359.9, x * 360);
  });
  $hex.addEventListener('input', () => {
    const val = $hex.value.trim();
    if (/^#?[0-9a-f]{6}$/i.test(val)) {
      ({ h, s, v } = hexToHsv(val.startsWith('#') ? val : `#${val}`));
      paint();
    }
  });
  $hex.addEventListener('keydown', (e) => e.stopPropagation()); // не листать диалоги и не жать газ
  $hex.addEventListener('blur', () => paint(false));

  const node = el('div', { class: 'cpick' }, [
    $sv,
    $hue,
    el('div', { class: 'cpick__row' }, [
      $swatch,
      el('label', { class: 'cpick__label', text: t('garage.looks.hex') }),
      $hex,
    ]),
    el('p', { class: 'cpick__hint', text: t('garage.looks.customHint') }),
  ]);
  paint(false);
  return {
    node,
    set(value) {
      ({ h, s, v } = hexToHsv(value));
      paint(false);
    },
  };
}
