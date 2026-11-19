import config from '../../data/config.json';

export const GAME_WIDTH = config.game.width;
export const GAME_HEIGHT = config.game.height;

/** Размер мира игры: в этих координатах живут сцены (камера растягивает его на холст). */
export const WORLD = Object.freeze({ width: GAME_WIDTH, height: GAME_HEIGHT });

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
  CREDITS: 'Credits',
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

/** Звуки — ключи из data/sounds.json (файлы: src/assets/audio/<группа>/<ключ>.mp3). */
export const SFX = Object.freeze({
  HOVER: 'ui_hover',
  CLICK: 'ui_click',
  CONFIRM: 'ui_confirm',
  BACK: 'ui_back',
  TAB: 'ui_tab',
  ERROR: 'ui_error',
  SHUTTER_DOWN: 'ui_shutter_down',
  SHUTTER_UP: 'ui_shutter_up',
  TYPE: 'dlg_type',
  DLG_NEXT: 'dlg_next',
  NOTE_APPEAR: 'note_appear',
  NOTE_UNFOLD: 'note_unfold',
  NOTE_WRITE: 'note_write',
  NOTE_FOLD: 'note_fold',
  PHONE: 'phone_dial',
  INSTALL: 'tune_install',
  REMOVE: 'tune_remove',
  WHEEL: 'tune_wheel',
  PAINT: 'tune_paint',
  OIL: 'svc_oil',
  REPAIR: 'svc_repair',
  WASH: 'svc_wash',
  CAR_START: 'car_start',
  ENGINE: 'car_engine_loop',
  SHIFT: 'car_shift',
  BACKFIRE: 'car_backfire',
  LIMITER: 'car_limiter',
  SKID: 'car_skid_loop',
  MUD: 'car_mud_loop',
  BUMP: 'car_bump',
  BREAK: 'car_break',
  PEDAL_DOWN: 'pedal_down',
  PEDAL_UP: 'pedal_up',
  PADDLE: 'paddle_click',
  TREE_BEEP: 'light_beep',
  TREE_GO: 'light_go',
  FOUL: 'light_foul',
  SUCCESS: 'res_win',
  FAIL: 'res_lose',
});

/** Атмосфера (петли под сценами). */
export const AMB = Object.freeze({
  COOP: 'amb_coop_day',
  GARAGE: 'amb_garage_inside',
  ROAD: 'amb_road',
  NIGHT: 'amb_night',
  DAWN: 'amb_dawn',
});

export const STORAGE_KEY = 'dedov-garage:settings';

/** Пиксельный шрифт с кириллицей (ТЗ 6.3); пока файла нет — системный моноширинный. */
export const FONT_FAMILY = '"Pixel", "Press Start 2P", monospace';

// Подставляется Vite из package.json (vite.config.js → VITE_APP_VERSION).
export const VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev';

export { config };
