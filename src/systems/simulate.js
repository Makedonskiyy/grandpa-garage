/**
 * simulate.js — характеристики сборки и итог заезда.
 *
 * Чистые функции без Phaser и DOM. Сам разгон по кадрам считает drive.js (газ, передачи,
 * пробуксовка, грязь, удары); здесь — свод характеристик для гаража и «прогноз»:
 * тот же заезд, который проезжает идеальный водитель (drive.js → runBot).
 * Коэффициенты — в data/parts.json, data/tests.json, data/physics.json.
 */
import partsData from '../../data/parts.json';
import testsData from '../../data/tests.json';
import physicsData from '../../data/physics.json';

/** Данные по умолчанию; в тестах можно подменить. */
export const defaultData = { parts: partsData, tests: testsData, physics: physicsData };

/** Состояние машины вне деталей (обслуживание в гараже). */
export const FRESH_CONDITION = Object.freeze({ oil: 'fresh', dirty: false, damage: 0 });

export function getSlotIds(data = defaultData) {
  return data.parts.slots.map((s) => s.id);
}

export function getSlot(slotId, data = defaultData) {
  return data.parts.slots.find((s) => s.id === slotId) ?? null;
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

/** Кривая момента: точки [доля отсечки, доля пикового момента], между ними — прямые. */
export function curveAt(curve, x) {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i];
    if (x <= x1) {
      const [x0, y0] = curve[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return curve[curve.length - 1][1];
}

/** Пиковый момент (Н·м), при котором максимум мощности по кривой равен hp. */
function peakTorque(hp, redline, curve) {
  let best = 0;
  for (let i = 1; i <= 100; i++) best = Math.max(best, curveAt(curve, i / 100) * (i / 100));
  return (hp * 745.7) / (best * redline * ((2 * Math.PI) / 60));
}

/**
 * Свод характеристик сборки.
 * @param {Record<string, string|null>} build
 * @param {{oil?: string, damage?: number}} [condition]
 */
export function computeStats(build, condition = FRESH_CONDITION, data = defaultData) {
  const ph = data.physics;
  const parts = {};
  const missing = [];
  for (const slot of data.parts.slots) {
    const part = build?.[slot.id] ? getPart(build[slot.id], data) : null;
    if (part && part.slot !== slot.id) {
      throw new Error(`Деталь ${part.id} не подходит в слот ${slot.id}`);
    }
    parts[slot.id] = part;
    if (!part && slot.required !== false) missing.push(slot.id);
  }
  const installed = getSlotIds(data)
    .map((s) => parts[s])
    .filter(Boolean);

  const mass = installed.reduce((sum, p) => sum + p.mass, 0);
  const engine = parts.engine;
  const powerMul =
    1 +
    installed.reduce((sum, p) => sum + (p.powerMul ?? 0), 0) -
    (condition.oil === 'old' ? 1 - ph.oldOilPowerMul : 0);
  const power = Math.round((engine?.power ?? 0) * powerMul);
  const redline =
    (engine?.redline ?? 7000) + installed.reduce((s, p) => s + (p.redlineAdd ?? 0), 0);
  const curve = ph.engine.curves[engine?.curve ?? 'atmo'];
  const torque = engine ? peakTorque(power, redline, curve) : 0;

  const gripMul = parts.suspension?.gripMul ?? { clay: 1, asphalt: 1 };
  const tireGrip = parts.tires?.grip ?? { clay: 0, asphalt: 0 };
  const grip = {
    clay: +(tireGrip.clay * gripMul.clay).toFixed(2),
    asphalt: +(tireGrip.asphalt * gripMul.asphalt).toFixed(2),
  };
  const downforce = installed.reduce((sum, p) => sum + (p.downforce ?? 0), 0);

  // Прочность — по самой слабой детали; при равенстве — первая по порядку слотов.
  let weakestPart = null;
  for (const p of installed) {
    if (!weakestPart || p.durability < weakestPart.durability) weakestPart = p;
  }
  // Сильно побитая на колее машина теряет единицу прочности, пока её не подлатают.
  const worn = (condition.damage ?? 0) >= 0.5 ? 1 : 0;
  const durability = weakestPart ? Math.max(1, weakestPart.durability - worn) : 0;

  return {
    complete: missing.length === 0,
    missing,
    parts,
    mass,
    power,
    torque: Math.round(torque),
    redline,
    curve,
    ratios: parts.gearbox?.ratios ?? null,
    shiftSec: (parts.gearbox?.shiftMs ?? 250) / 1000,
    rimMass: parts.rims?.mass ?? 0,
    grip,
    downforce,
    impact: parts.suspension?.impact ?? 1,
    durability,
    weakestPart,
    /** Килограммов на лошадиную силу — главное число разгона. */
    kgPerHp: power ? +(mass / power).toFixed(2) : null,
  };
}

/** 12.649… → «12,65» (время до сотых). */
export function formatSeconds(sec) {
  return sec.toFixed(2).replace('.', ',');
}

export function format(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}
