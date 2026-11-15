/**
 * scale — масштаб окна игры (ТЗ 3.4, 7.5).
 * Внутреннее разрешение всегда 640×360. Масштабируется весь #stage (канвас + HTML-оверлей)
 * одним CSS-трансформом, поэтому координаты интерфейса всегда в игровых пикселях.
 */
import { GAME_WIDTH, GAME_HEIGHT } from '../config/constants.js';
import { getSettings, onSettingsChange } from './settings.js';

/**
 * Множитель масштаба для режима и размера окна.
 * «Авто» и «На весь экран» берут наибольший целый множитель, который влезает
 * (целые множители — без неровных пикселей); если окно меньше 640×360 — дробный.
 */
export function computeZoom(mode, viewportW, viewportH) {
  if (mode === '1' || mode === '2' || mode === '3') return Number(mode);
  const fit = Math.min(viewportW / GAME_WIDTH, viewportH / GAME_HEIGHT);
  return fit >= 1 ? Math.floor(fit) : fit;
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
  stage.style.width = `${GAME_WIDTH}px`;
  stage.style.height = `${GAME_HEIGHT}px`;

  const apply = () => {
    const { scale } = getSettings();
    const zoom = computeZoom(scale, window.innerWidth, window.innerHeight);
    stage.style.setProperty('--zoom', String(zoom));
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
