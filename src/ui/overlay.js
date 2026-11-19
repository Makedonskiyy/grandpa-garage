/**
 * overlay — HTML-слой поверх канваса (ТЗ 3, 7).
 * Каждая сцена получает свой слой; он удаляется автоматически при выходе из сцены.
 * Модальные окна (настройки, «Как играть») живут в отдельном слое поверх всех сцен.
 */
import Phaser from 'phaser';
import { el } from './dom.js';
import { icon } from './icons.js';
import { audio } from '../systems/AudioManager.js';
import { SFX } from '../config/constants.js';

const root = () => document.getElementById('ui-root');

/** Слой интерфейса сцены; удаляется при shutdown сцены. */
export function createLayer(scene) {
  const layer = el('div', { class: 'ui-layer', 'data-scene': scene.scene.key });
  // Модальный слой должен оставаться последним, поэтому вставляем перед ним.
  root().insertBefore(layer, modalHost());
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => layer.remove());
  return layer;
}

let host = null;
function modalHost() {
  if (!host || !host.isConnected) {
    host = el('div', { class: 'ui-modals' });
    root().append(host);
  }
  return host;
}

const openModals = [];

/**
 * Открывает модальное окно: тёмная панель с заголовком, крестиком и подсказкой «Esc — закрыть».
 * build(close) возвращает содержимое панели.
 * @param {{ id?: string, title?: string, size?: 'md'|'lg' }} [opts]
 * @returns {() => void} функция закрытия
 */
export function openModal(build, { id, title, size = 'md' } = {}) {
  if (id && openModals.some((m) => m.id === id)) return () => {};
  const backdrop = el('div', { class: 'modal-backdrop' });
  const close = () => {
    backdrop.remove();
    const i = openModals.findIndex((m) => m.backdrop === backdrop);
    if (i >= 0) openModals.splice(i, 1);
  };
  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop) close();
  });
  const closeBtn = el(
    'button',
    {
      class: 'modal__close',
      type: 'button',
      'aria-label': 'Закрыть',
      onclick: close,
    },
    icon('close'),
  );
  backdrop.append(
    el(
      'div',
      { class: `modal modal--${size}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      [
        el('header', { class: 'modal__head' }, [
          el('h2', { class: 'modal__title', text: title }),
          closeBtn,
        ]),
        el('div', { class: 'modal__body' }, build(close)),
        el('footer', { class: 'modal__foot' }, [el('kbd', { text: 'Esc' }), 'закрыть']),
      ],
    ),
  );
  modalHost().append(backdrop);
  openModals.push({ id, backdrop, close });
  closeBtn.focus({ preventScroll: true });
  return close;
}

/** Закрыть все окна (при смене сцены). */
export function closeAllModals() {
  while (openModals.length) openModals.at(-1).close();
}

export function closeTopModal() {
  const top = openModals.at(-1);
  if (!top) return false;
  audio.playSfx(SFX.BACK);
  top.close();
  return true;
}

export function isModalOpen(id) {
  return id ? openModals.some((m) => m.id === id) : openModals.length > 0;
}
