/**
 * transition — переход между сценами: гаражная рольставня.
 *
 * Уходя со сцены, ставня с рёбрами опускается сверху и закрывает экран; новая сцена
 * создаётся под ней, и ставня поднимается. Ставня живёт поверх слоёв сцен (но под модальными
 * окнами) и переживает смену сцены. При «уменьшении движения» в системе — простое затемнение.
 */
import { el } from './dom.js';
import { audio } from '../systems/AudioManager.js';
import { SFX } from '../config/constants.js';

const CLOSE_MS = 420;
const OPEN_MS = 560;

let shutter = null;

function getShutter() {
  if (!shutter || !shutter.isConnected) {
    shutter = el('div', { class: 'shutter', 'aria-hidden': 'true' }, [
      el('div', { class: 'shutter__slats' }),
      el('div', { class: 'shutter__bar' }, el('div', { class: 'shutter__handle' })),
    ]);
    document.getElementById('ui-root').append(shutter);
  }
  return shutter;
}

/** Закрыта ли ставня (сцена ещё не показана). */
export function isShutterClosed() {
  return shutter?.isConnected === true && shutter.classList.contains('is-closed');
}

/** Опускает ставню; промис — когда экран полностью закрыт. */
export function closeShutter() {
  const node = getShutter();
  node.classList.remove('is-opening');
  audio.playSfx(SFX.SHUTTER_DOWN);
  // Кадр между вставкой и классом — чтобы сработал CSS-переход.
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      node.classList.add('is-closed');
      setTimeout(resolve, CLOSE_MS);
    });
  });
}

/** Поднимает ставню над новой сценой. */
export function openShutter() {
  if (!isShutterClosed()) return;
  const node = getShutter();
  node.classList.add('is-opening');
  node.classList.remove('is-closed');
  audio.playSfx(SFX.SHUTTER_UP);
  setTimeout(() => node.classList.remove('is-opening'), OPEN_MS);
}
