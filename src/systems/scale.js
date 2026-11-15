/**
 * scale — масштаб и разрешение (ТЗ 3.4, 7.5).
 *
 * Три системы координат:
 *   • мир игры — 640×360 (WORLD): фоны, машины, позиции в сценах;
 *   • интерфейс — 1920×1080 (UI): вся HTML-вёрстка в обычных экранных пикселях Full HD;
 *   • холст — реальное разрешение окна (с учётом devicePixelRatio).
 *
 * Камера каждой сцены увеличивает мир до размера холста. Пиксельные фоны при этом остаются
 * крупными, а машина, нарисованная в 3 раза детальнее, выглядит чётко (ТЗ: «разрешение
 * машины выше любого другого объекта»). #stage — коробка 1920×1080, которую CSS-трансформ
 * вписывает в окно; канвас внутри растянут на неё же, поэтому клики совпадают.
 */
import { GAME_WIDTH, GAME_HEIGHT } from '../config/constants.js';
import { getSettings, onSettingsChange } from './settings.js';

export const UI_WIDTH = 1920;
export const UI_HEIGHT = 1080;
const UI_PER_WORLD = UI_WIDTH / GAME_WIDTH; // 3

let renderZoom = 1;
const listeners = new Set();

/**
 * Масштаб мира (640×360) в CSS-пикселях окна.
 * «Авто» и «На весь экран» заполняют окно целиком (дробный множитель),
 * «1×/2×/3×» — фиксированный размер 640×360 / 1280×720 / 1920×1080.
 */
export function computeZoom(mode, viewportW, viewportH) {
  if (mode === '1' || mode === '2' || mode === '3') return Number(mode);
  return Math.min(viewportW / GAME_WIDTH, viewportH / GAME_HEIGHT);
}

/** Масштаб камеры: сколько пикселей холста в одной единице мира. */
export function getRenderZoom() {
  return renderZoom;
}

/** Подписка сцен на смену масштаба камеры. */
export function onRenderZoom(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Настраивает камеру сцены: мир 640×360 растягивается на весь холст. */
export function fitCamera(camera) {
  camera.setOrigin(0, 0).setZoom(renderZoom).setScroll(0, 0);
}

async function syncFullscreen(mode) {
  try {
    if (mode === 'fullscreen' && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
    } else if (mode !== 'fullscreen' && document.fullscreenElement) {
      await document.exitFullscreen?.();
    }
  } catch {
    // Браузер может отказать без жеста пользователя — остаёмся в окне.
  }
}

export function initScale(game, stage = document.getElementById('stage')) {
  stage.style.width = `${UI_WIDTH}px`;
  stage.style.height = `${UI_HEIGHT}px`;

  const apply = () => {
    const { scale } = getSettings();
    const zoom = computeZoom(scale, window.innerWidth, window.innerHeight);
    const dpr = window.devicePixelRatio || 1;
    stage.style.setProperty('--ui-scale', String(zoom / UI_PER_WORLD));

    // Холст — в физических пикселях окна, камера увеличивает мир под него.
    renderZoom = zoom * dpr;
    game.scale.resize(Math.round(GAME_WIDTH * renderZoom), Math.round(GAME_HEIGHT * renderZoom));
    for (const scene of game.scene.getScenes(false)) {
      if (scene.cameras?.main) fitCamera(scene.cameras.main);
    }
    for (const fn of listeners) fn(renderZoom);
    // Phaser пересчитывает координаты указателя по getBoundingClientRect канваса.
    game.scale.refresh();
  };

  window.addEventListener('resize', apply);
  document.addEventListener('fullscreenchange', apply);
  onSettingsChange((s) => {
    syncFullscreen(s.scale).finally(apply);
  });
  apply();
}
