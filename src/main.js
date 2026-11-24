/**
 * Точка входа: конфиг Phaser, список сцен, глобальные системы (ТЗ 7.1).
 */
import Phaser from 'phaser';
// Шрифт интерфейса лежит в сборке (woff2 из npm), игрокам не нужен доступ к Google Fonts.
import '@fontsource-variable/onest'; // интерфейс
import '@fontsource-variable/literata'; // реплики сюжета
import '@fontsource-variable/caveat'; // почерк деда в записке
import '@fontsource/cormorant-garamond/500.css'; // подпись команды на заставке
import '@fontsource-variable/inter'; // строка загрузки на заставке
import './styles/main.css';
import './styles/ui.css';
import './styles/drive.css';
import './styles/drive-hud.css';
import './styles/garage.css';
import { GAME_WIDTH, GAME_HEIGHT, SCENES, config } from './config/constants.js';
import { loadSettings } from './systems/settings.js';
import { initScale } from './systems/scale.js';
import { audio } from './systems/AudioManager.js';
import { openSettings } from './ui/SettingsPanel.js';
import { closeTopModal } from './ui/overlay.js';
import { initTooltips } from './ui/tooltip.js';

import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { IntroScene } from './scenes/IntroScene.js';
import { GarageScene } from './scenes/GarageScene.js';
import { TrialScene } from './scenes/TrialScene.js';
import { PalychScene } from './scenes/PalychScene.js';
import { RaceScene } from './scenes/RaceScene.js';
import { ResultScene } from './scenes/ResultScene.js';
import { EndingScene } from './scenes/EndingScene.js';
import { CreditsScene } from './scenes/CreditsScene.js';

loadSettings();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: config.game.backgroundColor,
  pixelArt: true,
  roundPixels: true,
  // Масштаб делаем сами (src/systems/scale.js), чтобы HTML-оверлей масштабировался вместе с канвасом.
  scale: { mode: Phaser.Scale.NONE },
  audio: { disableWebAudio: false },
  scene: [
    BootScene,
    MenuScene,
    IntroScene,
    GarageScene,
    TrialScene,
    PalychScene,
    RaceScene,
    ResultScene,
    EndingScene,
    CreditsScene,
  ],
});

audio.init(game);
game.events.once(Phaser.Core.Events.READY, () => initScale(game));
initTooltips(document);

// Esc в игре открывает настройки (ТЗ 3.4), повторный Esc закрывает окно.
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (closeTopModal()) return;
  if (game.scene.isActive(SCENES.BOOT)) return;
  openSettings();
});

if (import.meta.env.DEV) window.__game = game;
