/**
 * gameState — единственный источник правды о прохождении (ТЗ 7.2, 7.4).
 * Сцены не передают данные друг другу напрямую: читают и пишут только сюда.
 * Состояние живёт до перезагрузки страницы; «Играть снова» вызывает resetGame().
 */
import partsData from '../data/parts.json';
import cosmetics from '../data/cosmetics.json';
import config from '../data/config.json';
import { TEST_IDS } from './config/constants.js';
import { getPart } from './systems/simulate.js';

const listeners = new Set();

export function createInitialState() {
  return {
    build: { wheels: null, engine: null, body: null, ...partsData.initialBuild },
    cosmetics: { ...cosmetics.defaults },
    attempts: { trial: 0, race: 0 },
    failStreak: { trial: 0, race: 0 },
    passed: { trial: false, race: false },
    /** Результат последнего заезда для ResultScene: { testId, ok, reason, hint, stats, details }. */
    lastResult: null,
    /** Последний результат успешного заезда — для итогов в финале. */
    winningResult: null,
    flags: { introSeen: false, garageIntroSeen: false, palychMet: false },
  };
}

export const gameState = createInitialState();

function emit() {
  for (const fn of listeners) fn(gameState);
}

/** Подписка на изменения; возвращает функцию отписки. */
export function onStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetGame() {
  Object.assign(gameState, createInitialState());
  emit();
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

export function removePart(slot) {
  gameState.build[slot] = null;
  emit();
}

/** Клик по карточке: ставит деталь, а клик по уже выбранной — снимает (ТЗ 3.6). */
export function togglePart(partId) {
  const part = getPart(partId);
  if (!part) throw new Error(`Неизвестная деталь: ${partId}`);
  if (gameState.build[part.slot] === partId) removePart(part.slot);
  else setPart(part.slot, partId);
}

export function setCosmetic(group, id) {
  if (!cosmetics[group]?.some((c) => c.id === id)) {
    throw new Error(`Нет варианта ${group}.${id}`);
  }
  gameState.cosmetics[group] = id;
  emit();
}

/** Записывает исход заезда. Провал сборку не сбрасывает (ТЗ 4.5). */
export function recordResult(testId, result) {
  gameState.attempts[testId] += 1;
  gameState.lastResult = { testId, ...result };
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
