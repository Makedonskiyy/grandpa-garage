import config from '../../data/config.json';

export const GAME_WIDTH = config.game.width;
export const GAME_HEIGHT = config.game.height;

/** Ключи сцен (ТЗ 3.1). Сцены ссылаются друг на друга только через эти константы. */
export const SCENES = Object.freeze({
  BOOT: 'Boot',
  MENU: 'Menu',
  INTRO: 'Intro',
  GARAGE: 'Garage',
  TRIAL: 'TrialRun',
  PALYCH: 'PalychScene',
  RACE: 'Race',
  RESULT: 'Result',
  ENDING: 'Ending',
});

/** Порядок заездов. */
export const TEST_IDS = Object.freeze(['trial', 'race']);

/** Ключи музыкальных дорожек (файлы появятся в public/assets/audio/music). */
export const MUSIC = Object.freeze({
  MENU: 'music_menu',
  INTRO: 'music_intro',
  GARAGE: 'music_garage',
  DRIVE: 'music_drive',
  ENDING: 'music_ending',
});

export const SFX = Object.freeze({
  CLICK: 'sfx_click',
  HOVER: 'sfx_hover',
  TYPE: 'sfx_type',
  SUCCESS: 'sfx_success',
  FAIL: 'sfx_fail',
  ENGINE: 'sfx_engine_loop',
  TREE_BEEP: 'sfx_tree_beep',
  TREE_GO: 'sfx_tree_go',
});

export const STORAGE_KEY = 'dedov-garage:settings';

/** Пиксельный шрифт с кириллицей (ТЗ 6.3); пока файла нет — системный моноширинный. */
export const FONT_FAMILY = '"Pixel", "Press Start 2P", monospace';

// Подставляется Vite из package.json (vite.config.js → VITE_APP_VERSION).
export const VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev';

export { config };
