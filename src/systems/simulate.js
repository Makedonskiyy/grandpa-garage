/**
 * simulate.js — расчёт характеристик сборки и результатов заездов (ТЗ, раздел 4).
 *
 * Чистые функции без Phaser и DOM: одна сборка всегда даёт один результат,
 * поэтому модуль целиком покрыт тестами (tests/simulate.test.js).
 * Все коэффициенты берутся из data/parts.json и data/tests.json — в коде чисел баланса нет.
 */
import partsData from '../../data/parts.json';
import testsData from '../../data/tests.json';

const EPS = 1e-9;

/** Данные по умолчанию; в тестах можно подменить. */
export const defaultData = { parts: partsData, tests: testsData };

/** Слоты в фиксированном порядке: колёса, двигатель, кузов. */
export function getSlotIds(data = defaultData) {
  return data.parts.slots.map((s) => s.id);
}

export function getPart(id, data = defaultData) {
  return data.parts.parts.find((p) => p.id === id) ?? null;
}

export function getPartsBySlot(slotId, data = defaultData) {
  return data.parts.parts.filter((p) => p.slot === slotId);
}

export function getTest(testId, data = defaultData) {
  const test = data.tests.tests.find((t) => t.id === testId);
  if (!test) throw new Error(`Неизвестный заезд: ${testId}`);
  return test;
}

/**
 * Общие величины сборки (ТЗ 4.1).
 * @param {{wheels?: string|null, engine?: string|null, body?: string|null}} build
 * @returns {{
 *   complete: boolean, missing: string[], parts: Record<string, object|null>,
 *   mass: number, power: number, grip: {clay: number, asphalt: number},
 *   durability: number, weakestPart: object|null,
 *   display: {hp: number, kg: number}
 * }}
 */
export function computeStats(build, data = defaultData) {
  const slotIds = getSlotIds(data);
  const parts = {};
  const missing = [];

  for (const slot of slotIds) {
    const part = build?.[slot] ? getPart(build[slot], data) : null;
    if (part && part.slot !== slot) {
      throw new Error(`Деталь ${part.id} не подходит в слот ${slot}`);
    }
    parts[slot] = part;
    if (!part) missing.push(slot);
  }

  const installed = slotIds.map((s) => parts[s]).filter(Boolean);
  const mass = installed.reduce((sum, p) => sum + p.mass, 0);
  const power = parts.engine?.power ?? 0;
  const grip = {
    clay: parts.wheels?.grip?.clay ?? 0,
    asphalt: parts.wheels?.grip?.asphalt ?? 0,
  };

  // Прочность — минимум по трём деталям; при равенстве берём первую по порядку слотов.
  let weakestPart = null;
  for (const p of installed) {
    if (!weakestPart || p.durability < weakestPart.durability) weakestPart = p;
  }
  const durability = weakestPart ? weakestPart.durability : 0;

  const { hpPerPowerPoint, kgPerMassPoint } = data.parts.units;

  return {
    complete: missing.length === 0,
    missing,
    parts,
    mass,
    power,
    grip,
    durability,
    weakestPart,
    display: { hp: power * hpPerPowerPoint, kg: mass * kgPerMassPoint },
  };
}

function format(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}

function incompleteResult(stats) {
  return { ok: false, reasonKey: 'incomplete', reason: null, stats, details: null };
}

/**
 * Заезд 1: «Обкатка» по раскисшей грунтовке (ТЗ 4.2).
 *   F = min(10·P, 13·G_грунт), N = 3,2·M. Успех: F ≥ N и D ≥ 3.
 * Причины провала по порядку: поломка → мощность (10·P ≤ 13·G) → буксование.
 */
export function evaluateTrial(build, data = defaultData) {
  const test = getTest('trial', data);
  const stats = computeStats(build, data);
  if (!stats.complete) return incompleteResult(stats);

  const { powerFactor, gripFactor, resistancePerMass } = test.formula;
  const enginePush = powerFactor * stats.power;
  const wheelPush = gripFactor * stats.grip[test.surface];
  const force = Math.min(enginePush, wheelPush);
  const need = resistancePerMass * stats.mass;
  const broken = stats.durability < test.minDurability;
  const ok = !broken && force >= need - EPS;

  let reasonKey = null;
  if (!ok) {
    if (broken) reasonKey = 'broken';
    else if (enginePush <= wheelPush) reasonKey = 'power';
    else reasonKey = 'traction';
  }

  return {
    ok,
    reasonKey,
    reason: reasonKey ? format(test.reasons[reasonKey], { part: stats.weakestPart?.name }) : null,
    hint: reasonKey ? test.resultHints[reasonKey] : null,
    stats,
    details: { force, need, enginePush, wheelPush },
  };
}

/**
 * Заезд 2: драг 400 м с Палычем по сухому асфальту (ТЗ 4.3).
 *   F = min(10·P, 14·G_асфальт), a = F / M, t = √(2·400 / a). Успех: t < 13,0 и D ≥ 2.
 * Причины провала: поломка → сцепление (14·G < 10·P) → мощность; при M ≥ 17 — «и машина тяжёлая».
 */
export function evaluateRace(build, data = defaultData) {
  const test = getTest('race', data);
  const stats = computeStats(build, data);
  if (!stats.complete) return incompleteResult(stats);

  const { powerFactor, gripFactor, distance } = test.formula;
  const enginePush = powerFactor * stats.power;
  const wheelPush = gripFactor * stats.grip[test.surface];
  const force = Math.min(enginePush, wheelPush);
  const accel = force / stats.mass;
  const time = Math.sqrt((2 * distance) / accel);
  const rivalAccel = (2 * distance) / test.rivalTime ** 2;
  const diff = time - test.rivalTime;
  const broken = stats.durability < test.minDurability;
  const ok = !broken && time < test.rivalTime - EPS;

  let reasonKey = null;
  let reason = null;
  if (!ok) {
    if (broken) {
      reasonKey = 'broken';
      reason = format(test.reasons.broken, { part: stats.weakestPart?.name });
    } else {
      reasonKey = wheelPush < enginePush ? 'traction' : 'power';
      reason = test.reasons[reasonKey];
      if (stats.mass >= test.heavyMass) reason += test.reasons.heavySuffix;
    }
  }

  const diffText = format(diff >= 0 ? test.reasons.slower : test.reasons.faster, {
    diff: formatSeconds(Math.abs(diff)),
  });

  return {
    ok,
    reasonKey,
    reason,
    hint: reasonKey ? test.resultHints[reasonKey] : null,
    stats,
    details: {
      force,
      enginePush,
      wheelPush,
      accel,
      time,
      rivalTime: test.rivalTime,
      rivalAccel,
      diff,
      diffText,
      heavy: stats.mass >= test.heavyMass,
    },
  };
}

/** Универсальная точка входа по id заезда. */
export function evaluate(testId, build, data = defaultData) {
  if (testId === 'trial') return evaluateTrial(build, data);
  if (testId === 'race') return evaluateRace(build, data);
  throw new Error(`Неизвестный заезд: ${testId}`);
}

/**
 * Телеметрия для приборов в заезде (ТЗ 4.4). Только показ — на результат не влияет.
 * @param {number} accel ускорение машины, м/с²
 * @param {number} s время с начала заезда, с
 */
export function raceTelemetry(accel, s, data = defaultData) {
  const test = getTest('race', data);
  const { distance } = test.formula;
  const g = test.gauges;
  const finishTime = Math.sqrt((2 * distance) / accel);
  const tt = Math.min(Math.max(s, 0), finishTime);

  const dist = (accel * tt * tt) / 2;
  const speed = accel * tt;
  const topSpeed = accel * finishTime;
  const speedKmh = speed * g.speedToKmh * g.speedDisplayFactor;

  // Тахометр декоративный: 5 передач на равные доли конечной скорости.
  const share = topSpeed / g.gears;
  const gear = Math.min(g.gears, Math.floor(speed / share) + 1);
  const inGear = share > 0 ? (speed - (gear - 1) * share) / share : 0;
  const rpm = g.idleRpm + (g.redlineRpm - g.idleRpm) * Math.min(1, inGear);

  return { distance: dist, speed, speedKmh, gear, rpm, finished: s >= finishTime, finishTime };
}

/** 12.649… → «12,65» (время до сотых, ТЗ 3.9). */
export function formatSeconds(sec) {
  return sec.toFixed(2).replace('.', ',');
}
