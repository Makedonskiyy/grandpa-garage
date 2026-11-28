/**
 * save — сохранение прохождения в браузере (localStorage), без сервера.
 * Пишется после каждого изменения (с задержкой) и при смене сцены: сборка, внешний вид,
 * состояние машины, пройденные заезды, попытки, флаги сюжета, выбранная карта.
 * Хранилище недоступно (приватный режим) — игра просто идёт без сохранения.
 */
import parts from '../../data/parts.json';
import cosmetics from '../../data/cosmetics.json';

const KEY = 'dedov-garage:save';
const VERSION = 1;
const FIELDS = [
  'build',
  'cosmetics',
  'car',
  'attempts',
  'failStreak',
  'passed',
  'flags',
  'trialMap',
];
let timer = null;

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Снимок состояния для записи. */
export function snapshot(state) {
  const out = { v: VERSION, at: Date.now() };
  for (const k of FIELDS) out[k] = state[k];
  // Для финала нужно только время победного заезда.
  const time = state.winningResult?.details?.time;
  out.winningResult = time ? { details: { time } } : null;
  return out;
}

export function saveGame(state, store = storage()) {
  try {
    store?.setItem(KEY, JSON.stringify(snapshot(state)));
  } catch {
    // Нет места или запрещено — играем без сохранения.
  }
}

/** Отложенная запись: частые изменения в гараже не пишут хранилище каждый клик. */
export function saveSoon(state) {
  clearTimeout(timer);
  timer = setTimeout(() => saveGame(state), 400);
}

/** Прочитать сохранение; битое или от другой версии — null. Неизвестные детали отбрасываются. */
export function loadGame(store = storage()) {
  try {
    const raw = JSON.parse(store?.getItem(KEY) ?? 'null');
    if (!raw || raw.v !== VERSION || typeof raw.build !== 'object') return null;
    const ids = new Set(parts.parts.map((p) => p.id));
    for (const [slot, id] of Object.entries(raw.build))
      if (id && !ids.has(id)) raw.build[slot] = null;
    for (const [group, value] of Object.entries(raw.cosmetics ?? {})) {
      const known =
        group === 'windowTintStrength'
          ? Number.isInteger(value) && value >= 0 && value <= 100
          : Array.isArray(cosmetics[group]) &&
            (cosmetics[group].some((c) => c.id === value) || /^#[0-9a-f]{6}$/i.test(value));
      if (!known) delete raw.cosmetics[group];
    }
    return raw;
  } catch {
    return null;
  }
}

export function hasSave(store = storage()) {
  return loadGame(store) !== null;
}

export function clearSave(store = storage()) {
  try {
    store?.removeItem(KEY);
  } catch {
    // ничего
  }
}
