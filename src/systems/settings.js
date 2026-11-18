/**
 * settings — настройки игрока в localStorage (ТЗ 3.4).
 * Применяются сразу, без кнопки «Применить». Любая ошибка хранилища
 * (приватный режим, запрет cookies) не ломает игру: работаем со значениями по умолчанию.
 *
 *   scale     — масштаб картинки: «авто» по окну или фиксированный 1×/2×/3×;
 *   display   — режим экрана: ask (спросить при запуске), fullscreen, window;
 *   music/sfx — громкость 0…100, muted — «Без звука»;
 *   textSpeed — скорость печати реплик: slow, normal, fast, instant;
 *   shake     — тряска экрана при ударах на обкатке.
 */
import config from '../../data/config.json';
import { STORAGE_KEY } from '../config/constants.js';

export const SCALE_MODES = Object.freeze(['auto', '1', '2', '3']);
export const DISPLAY_MODES = Object.freeze(['ask', 'fullscreen', 'window']);
export const TEXT_SPEEDS = Object.freeze(['slow', 'normal', 'fast', 'instant']);

const DEFAULTS = Object.freeze({ ...config.settingsDefaults });
const listeners = new Set();
let current = { ...DEFAULTS };

function clampVolume(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null;
}

/** Приводит произвольный объект к корректным настройкам; мусор заменяется значениями по умолчанию. */
export function sanitize(raw) {
  const out = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  if (SCALE_MODES.includes(String(raw.scale))) out.scale = String(raw.scale);
  // Старые сохранения: «На весь экран» было одним из масштабов.
  if (raw.scale === 'fullscreen') out.display = 'fullscreen';
  if (DISPLAY_MODES.includes(raw.display)) out.display = raw.display;
  for (const k of ['music', 'sfx']) {
    const v = clampVolume(raw[k]);
    if (v !== null) out[k] = v;
  }
  if (typeof raw.muted === 'boolean') out.muted = raw.muted;
  if (TEXT_SPEEDS.includes(raw.textSpeed)) out.textSpeed = raw.textSpeed;
  if (typeof raw.shake === 'boolean') out.shake = raw.shake;
  return out;
}

export function loadSettings(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    current = sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    current = { ...DEFAULTS };
  }
  return getSettings();
}

export function getSettings() {
  return { ...current };
}

export function updateSettings(patch, storage = globalThis.localStorage) {
  const previous = current;
  current = sanitize({ ...current, ...patch });
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Хранилище недоступно — настройки живут до перезагрузки страницы.
  }
  for (const fn of listeners) fn(getSettings(), previous);
  return getSettings();
}

/** Подписка на изменения: fn(новые, прежние). */
export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Итоговая громкость 0..1 с учётом «Без звука». */
export function effectiveVolume(kind, s = current) {
  return s.muted ? 0 : s[kind] / 100;
}

/** Задержка между буквами реплики, мс; 0 — реплика появляется сразу. */
export function charDelayMs(s = current) {
  const cps = config.dialog.charsPerSecond[s.textSpeed];
  return cps ? 1000 / cps : 0;
}
