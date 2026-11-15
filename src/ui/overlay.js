/**
 * overlay — HTML-слой поверх канваса (ТЗ 3, 7).
 * Каждая сцена получает свой слой; он удаляется автоматически при выходе из сцены.
 * Модальные окна (настройки, «Как играть») живут в отдельном слое поверх всех сцен.
 */
import Phaser from 'phaser';
import { el } from './dom.js';

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
 * Открывает модальное окно. build(close) возвращает содержимое панели.
 * @returns {() => void} функция закрытия
 */
export function openModal(build, { id } = {}) {
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
  backdrop.append(
    el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, build(close)),
  );
  modalHost().append(backdrop);
  openModals.push({ id, backdrop, close });
  return close;
}

export function closeTopModal() {
  const top = openModals.at(-1);
  if (!top) return false;
  top.close();
  return true;
}

export function isModalOpen(id) {
  return id ? openModals.some((m) => m.id === id) : openModals.length > 0;
}
