import { describe, it, expect } from 'vitest';
import { computeStats, getPartsBySlot, formatSeconds } from '../src/systems/simulate.js';
import {
  createRun,
  stepRun,
  startRun,
  shiftUp,
  runBot,
  predict,
  summarize,
  bestLaunchRpm,
  STEP,
} from '../src/systems/drive.js';
import parts from '../data/parts.json';

const BASE = { ...parts.initialBuild, tires: 'tires_stock' };
const ids = (slot) => getPartsBySlot(slot).map((p) => p.id);

/** Шины × моторы × кузова — основные сборки; остальное штатное. */
const CORE = ids('tires').flatMap((tires) =>
  ids('engine').flatMap((engine) => ids('body').map((body) => ({ ...BASE, tires, engine, body }))),
);
/** Те же сборки со всеми доработками мотора, короткой коробкой и крылом. */
const TUNED = CORE.map((b) => ({
  ...b,
  intake: 'intake_cold',
  exhaust: 'exhaust_straight',
  ecu: 'ecu_chip',
  gearbox: 'gearbox_close',
  spoiler: 'spoiler_wing',
}));
const key = (b) => `${b.tires}+${b.engine}+${b.body}`;

/** Прогон «игрока»: постоянный газ, переключения по правилу. */
function drive(testId, build, { gas = 1, shiftAt = 0.97, auto = false } = {}) {
  const run = createRun(testId, build, { auto });
  run.rpm = gas >= 1 ? run.stats.redline * 0.8 : bestLaunchRpm(run);
  startRun(run);
  while (!run.done && run.t < 120) {
    if (!auto && shiftAt && run.rpm >= run.stats.redline * shiftAt) shiftUp(run);
    stepRun(run, { gas }, STEP);
  }
  return run;
}

describe('характеристики сборки', () => {
  it('масса — сумма деталей, мощность — мотор с доработками', () => {
    const s = computeStats({ ...BASE, engine: 'engine_tuned', exhaust: 'exhaust_sport' });
    const sum = Object.values(s.parts)
      .filter(Boolean)
      .reduce((m, p) => m + p.mass, 0);
    expect(s.mass).toBe(sum);
    expect(s.power).toBe(Math.round(230 * 1.05));
    expect(s.complete).toBe(true);
  });

  it('старое масло отнимает мощность, побитый кузов — единицу прочности', () => {
    const fresh = computeStats(BASE);
    const old = computeStats(BASE, { oil: 'old', damage: 0.6 });
    expect(old.power).toBeLessThan(fresh.power);
    expect(old.durability).toBe(fresh.durability - 1);
  });

  it('без шин машина не готова, пустой спойлер — не ошибка', () => {
    const s = computeStats({ ...BASE, tires: null });
    expect(s.complete).toBe(false);
    expect(s.missing).toEqual(['tires']);
    expect(computeStats(BASE).missing).toEqual([]);
  });

  it('подвеска меняет сцепление шин по поверхностям', () => {
    const raised = computeStats({ ...BASE, suspension: 'suspension_raised' });
    const sport = computeStats({ ...BASE, suspension: 'suspension_sport' });
    expect(raised.grip.clay).toBeGreaterThan(sport.grip.clay);
    expect(sport.grip.asphalt).toBeGreaterThan(raised.grip.asphalt);
  });
});

describe('баланс: идеальный водитель', () => {
  const trialOk = [...CORE, ...TUNED].filter((b) => runBot('trial', b).ok);
  const raceOk = [...CORE, ...TUNED].filter((b) => runBot('race', b).ok);

  it('каждый заезд проходят минимум две разные сборки', () => {
    expect(new Set(trialOk.map(key)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(raceOk.map(key)).size).toBeGreaterThanOrEqual(2);
  });

  it('ни одна сборка не проходит оба заезда — между ними нужно пересобрать', () => {
    const both = [...CORE, ...TUNED].filter((b) => runBot('trial', b).ok && runBot('race', b).ok);
    expect(both).toEqual([]);
  });

  it('на обкатке встречаются все три причины провала', () => {
    const reasons = new Set(CORE.map((b) => runBot('trial', b).reasonKey).filter(Boolean));
    expect([...reasons].sort()).toEqual(['broken', 'power', 'traction']);
  });

  it('обкатка: для грунта нужны шипы или грязевая, лёгкий кузов разбивается', () => {
    for (const b of trialOk) expect(['tires_studded', 'tires_mud']).toContain(b.tires);
    expect(runBot('trial', { ...BASE, tires: 'tires_studded', body: 'body_light' }).reasonKey).toBe(
      'broken',
    );
    expect(
      runBot('trial', {
        ...BASE,
        tires: 'tires_studded',
        engine: 'engine_stock',
        body: 'body_cage',
      }).reasonKey,
    ).toBe('power');
  });

  it('заезд: Палыча обгоняют только с асфальтовой резиной', () => {
    for (const b of raceOk) expect(['tires_sport', 'tires_slicks']).toContain(b.tires);
    const turbo = { ...BASE, tires: 'tires_slicks', engine: 'engine_turbo' };
    expect(runBot('race', turbo).ok).toBe(true);
    expect(runBot('race', { ...turbo, tires: 'tires_studded' }).ok).toBe(false);
  });

  it('мощность, масса и сцепление меняют время заезда в ожидаемую сторону', () => {
    const t = (b) => runBot('race', b).t;
    const turbo = { ...BASE, tires: 'tires_slicks', engine: 'engine_turbo' };
    expect(t(turbo)).toBeLessThan(t({ ...turbo, engine: 'engine_tuned' }));
    expect(t({ ...turbo, body: 'body_light' })).toBeLessThan(t({ ...turbo, body: 'body_cage' }));
    expect(t(turbo)).toBeLessThan(t({ ...turbo, tires: 'tires_stock' }));
  });

  it('расчёт детерминирован', () => {
    const b = TUNED[40];
    expect(runBot('race', b).t).toBe(runBot('race', b).t);
    expect(runBot('trial', b).damage).toBe(runBot('trial', b).damage);
  });
});

describe('езда игрока', () => {
  const fast = {
    ...BASE,
    tires: 'tires_slicks',
    engine: 'engine_turbo',
    intake: 'intake_cold',
    exhaust: 'exhaust_straight',
    ecu: 'ecu_chip',
  };

  it('газ в пол на мощной машине срывает колёса и проигрывает чистой езде', () => {
    const floored = drive('race', { ...fast, tires: 'tires_stock' });
    const best = runBot('race', { ...fast, tires: 'tires_stock' });
    expect(floored.log.spin).toBeGreaterThan(0.5);
    expect(floored.t).toBeGreaterThan(best.t);
  });

  it('без переключений мотор упирается в отсечку и машина не обгоняет Палыча', () => {
    const run = drive('race', fast, { shiftAt: 0 });
    expect(run.log.limiter).toBeGreaterThan(2);
    expect(run.ok).toBe(false);
  });

  it('автомат доезжает, но медленнее лучшей ручной езды', () => {
    const auto = drive('race', fast, { auto: true });
    expect(auto.done).toBe(true);
    expect(auto.log.shifts).toBeGreaterThanOrEqual(2);
    expect(auto.t).toBeGreaterThan(runBot('race', fast).t);
  });

  it('на колее скорость ломает детали, медленная езда — нет', () => {
    const b = { ...BASE, tires: 'tires_studded', engine: 'engine_tuned', spoiler: 'spoiler_wing' };
    expect(runBot('trial', b).ok).toBe(true);
    const reckless = drive('trial', b, { gas: 1 });
    expect(reckless.reasonKey).toBe('broken');
  });

  it('итог отличает «сборка слабая» от «ехал плохо»', () => {
    const b = { ...BASE, tires: 'tires_studded', engine: 'engine_tuned', spoiler: 'spoiler_wing' };
    const r = summarize(drive('trial', b, { gas: 1 }), runBot('trial', b));
    expect(r.reasonKey).toBe('rough');
    expect(r.hint).toBeTruthy();
    const weak = predict('race', BASE);
    expect(weak.ok).toBe(false);
    expect(weak.reasonKey).toBe('slow');
    expect(weak.reason).toBeTruthy();
    expect(weak.details.diffText).toMatch(/Медленнее Палыча/);
  });

  it('время форматируется до сотых', () => {
    expect(formatSeconds(12.649)).toBe('12,65');
  });
});
