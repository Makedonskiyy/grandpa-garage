/**
 * settings — настройки игрока в localStorage (ТЗ 3.4).
 * Применяются сразу, без кнопки «Применить». Любая ошибка хранилища
 * (приватный режим, запрет cookies) не ломает игру: работаем со значениями по умолчанию.
 */
import config from '../../data/config.json';
import { STORAGE_KEY } from '../config/constants.js';

export const SCALE_MODES = Object.freeze(['auto', '1', '2', '3', 'fullscreen']);

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
  for (const k of ['music', 'sfx']) {
    const v = clampVolume(raw[k]);
    if (v !== null) out[k] = v;
  }
  if (typeof raw.muted === 'boolean') out.muted = raw.muted;
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
  current = sanitize({ ...current, ...patch });
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Хранилище недоступно — настройки живут до перезагрузки страницы.
  }
  for (const fn of listeners) fn(getSettings());
  return getSettings();
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Итоговая громкость 0..1 с учётом «Без звука». */
export function effectiveVolume(kind, s = current) {
  return s.muted ? 0 : s[kind] / 100;
}
