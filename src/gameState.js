/**
 * gameState — единственный источник правды о прохождении (ТЗ 7.2, 7.4).
 * Сцены не передают данные друг другу напрямую: читают и пишут только сюда.
 * Состояние живёт до перезагрузки страницы; «Играть снова» вызывает resetGame().
 */
import partsData from '../data/parts.json';
import cosmetics from '../data/cosmetics.json';
import config from '../data/config.json';
import { TEST_IDS } from './config/constants.js';
import { getPart, getSlot } from './systems/simulate.js';
import { loadGame, saveSoon, clearSave } from './systems/save.js';

const listeners = new Set();
const HEX = /^#[0-9a-f]{6}$/i;
/** Группы внешнего вида, где можно выбрать свой цвет, а не только готовый. */
export const CUSTOM_COLOR_GROUPS = Object.freeze(['paint', 'rim', 'caliper', 'neon']);

export function createInitialState() {
  return {
    build: Object.fromEntries(
      partsData.slots.map((s) => [s.id, partsData.initialBuild[s.id] ?? null]),
    ),
    cosmetics: { ...cosmetics.defaults },
    /**
     * Состояние машины вне деталей (вкладка «Обслуживание»): дед оставил её грязной
     * и со старым маслом; удары на колее обкатки копят повреждения кузова (0–1).
     */
    car: { dirty: true, oil: 'old', damage: 0 },
    attempts: { trial: 0, race: 0 },
    failStreak: { trial: 0, race: 0 },
    passed: { trial: false, race: false },
    /** Результат последнего заезда для ResultScene: { testId, ok, reason, hint, stats, details }. */
    lastResult: null,
    /** Последний результат успешного заезда — для итогов в финале. */
    winningResult: null,
    flags: {
      introSeen: false,
      garageIntroSeen: false,
      palychMet: false,
      // Свой мир объездной у каждого игрока (scenes/bypassWorld.js).
      worldSeed: Math.floor(Math.random() * 2 ** 31),
    },
  };
}

export const gameState = createInitialState();

function emit() {
  saveSoon(gameState);
  for (const fn of listeners) fn(gameState);
}

/** Подписка на изменения; возвращает функцию отписки. */
export function onStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Новая игра: всё с начала, сохранение стирается. */
export function resetGame() {
  Object.assign(gameState, createInitialState());
  clearSave();
  for (const fn of listeners) fn(gameState);
}

/** Продолжить: поднять сохранение поверх начального состояния. */
export function continueGame() {
  const save = loadGame();
  if (!save) return false;
  const base = createInitialState();
  Object.assign(gameState, base, {
    ...save,
    build: { ...base.build, ...save.build },
    cosmetics: { ...base.cosmetics, ...save.cosmetics },
    car: { ...base.car, ...save.car },
    flags: { ...base.flags, ...save.flags },
  });
  delete gameState.v;
  delete gameState.at;
  emit();
  return true;
}

/** Текущий заезд: обкатка, пока она не пройдена, затем заезд с Палычем. */
export function getCurrentTestId() {
  return TEST_IDS.find((id) => !gameState.passed[id]) ?? null;
}

export function setPart(slot, partId) {
  const part = getPart(partId);
  if (!part || part.slot !== slot) throw new Error(`Деталь ${partId} не подходит в слот ${slot}`);
  gameState.build[slot] = partId;
  emit();
}

/** Снять деталь. Обязательный слот без детали остаётся пустым — машина не поедет. */
export function removePart(slot) {
  if (!getSlot(slot)) throw new Error(`Нет слота ${slot}`);
  gameState.build[slot] = null;
  emit();
}

/**
 * Клик по карточке: ставит деталь. Повторный клик снимает её только в необязательном
 * слоте (впуск, выхлоп, ЭБУ, спойлер — там вместо детали штатная) и у шин: без шин —
 * машина на кирпичах (ТЗ 3.6).
 */
export function togglePart(partId) {
  const part = getPart(partId);
  if (!part) throw new Error(`Неизвестная деталь: ${partId}`);
  const slot = getSlot(part.slot);
  const removable = slot.required === false || slot.id === 'tires';
  if (gameState.build[part.slot] === partId) {
    if (removable) removePart(part.slot);
  } else setPart(part.slot, partId);
}

/** Готовый вариант по id или свой цвет #rrggbb (в группах CUSTOM_COLOR_GROUPS). */
export function setCosmetic(group, value) {
  const known = cosmetics[group]?.some((c) => c.id === value);
  const custom = CUSTOM_COLOR_GROUPS.includes(group) && HEX.test(String(value));
  if (!known && !custom) throw new Error(`Нет варианта ${group}.${value}`);
  gameState.cosmetics[group] = custom ? String(value).toLowerCase() : value;
  emit();
}

/** Цвет варианта внешнего вида: hex готового варианта или свой цвет; null — выключено. */
export function cosmeticHex(group, value) {
  if (HEX.test(String(value))) return value;
  const c = cosmetics[group].find((x) => x.id === value) ?? cosmetics[group][0];
  return c.hex;
}

// ---------- Обслуживание ----------

export function washCar() {
  gameState.car.dirty = false;
  emit();
}

export function changeOil() {
  gameState.car.oil = 'fresh';
  emit();
}

export function repairBody() {
  gameState.car.damage = 0;
  emit();
}

/**
 * Состояние машины 0–10 для плашки в гараже: масло, кузов, чистота.
 * @returns {{ score: number, items: {id: string, level: 'good'|'fair'|'bad'}[] }}
 */
export function conditionScore(car = gameState.car) {
  const body = car.damage >= 0.5 ? 'bad' : car.damage > 0.15 ? 'fair' : 'good';
  const items = [
    { id: 'oil', level: car.oil === 'fresh' ? 'good' : 'bad' },
    { id: 'body', level: body },
    { id: 'wash', level: car.dirty ? 'fair' : 'good' },
  ];
  const points = {
    oil: car.oil === 'fresh' ? 4 : 1,
    body: Math.round((1 - car.damage) * 4),
    wash: car.dirty ? 0 : 2,
  };
  return { score: points.oil + points.body + points.wash, items };
}

/** Записывает исход заезда. Провал сборку не сбрасывает (ТЗ 4.5). */
export function recordResult(testId, result) {
  gameState.attempts[testId] += 1;
  gameState.lastResult = { testId, ...result };
  // Обкатка бьёт кузов на колее: повреждения остаются до ремонта в гараже.
  const d = result.details;
  if (testId === 'trial' && d?.capacity > 0 && Number.isFinite(d.capacity)) {
    gameState.car.damage = Math.min(1, Math.max(gameState.car.damage, d.damage / d.capacity));
    if (!result.map || result.map === 'trial') gameState.car.dirty = true;
  }
  if (!gameState.car.dirty && d?.distance > 20) {
    gameState.car.dirty = 'dust';
  }
  if (result.ok) {
    gameState.passed[testId] = true;
    gameState.failStreak[testId] = 0;
    gameState.winningResult = gameState.lastResult;
  } else {
    gameState.failStreak[testId] += 1;
  }
  emit();
}

/** После трёх провалов подряд записка деда даёт прямой совет (ТЗ 4.5). */
export function shouldShowGrandpaHint(testId) {
  return gameState.failStreak[testId] >= config.hints.failStreakForGrandpaHint;
}

export function isGameComplete() {
  return TEST_IDS.every((id) => gameState.passed[id]);
}
