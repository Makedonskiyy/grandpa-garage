import { describe, it, expect } from 'vitest';
import { computeStats, getPartsBySlot, formatSeconds } from '../src/systems/simulate.js';
import {
  createRun,
  stepRun,
  startRun,
  greenLight,
  shiftUp,
  shiftDown,
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
function drive(testId, build, { gas = 1, shiftAt = 0.97, auto = false, wait = 0 } = {}) {
  const run = createRun(testId, build, { auto });
  run.rpm = gas >= 1 ? run.stats.redline * 0.8 : bestLaunchRpm(run);
  greenLight(run);
  while (run.t < wait) stepRun(run, { gas: 0.4 }, STEP);
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
    const turbo = { ...BASE, tires: 'tires_slicks', engine: 'engine_turbo', body: 'body_light' };
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
  it('на месте можно включить первую с нейтрали, а вторую — после начала движения', () => {
    const run = createRun('race', BASE);
    greenLight(run);
    expect(shiftUp(run)).toBe(true);
    expect(run.gear).toBe(1);
    expect(shiftUp(run)).toBe(false);

    expect(shiftDown(run)).toBe(true);
    expect(run.gear).toBe(0);
    while (run.shiftTimer > 0) stepRun(run);
    expect(shiftUp(run)).toBe(true);
    while (run.shiftTimer > 0) stepRun(run);
    expect(run.v).toBe(0);
    expect(shiftUp(run)).toBe(false);

    stepRun(run, { gas: 1 }, 0.1);
    expect(run.v).toBeGreaterThan(0);
    expect(shiftUp(run)).toBe(true);
    expect(run.gear).toBe(2);
  });

  it.each([2, 3, 4, 5, 6])('после остановки на передаче %i трогается только с первой', (gear) => {
    const run = createRun('trial_free', { ...BASE, gearbox: 'gearbox_close' });
    greenLight(run);
    startRun(run);
    run.v = 20;
    for (let next = 2; next <= gear; next++) {
      expect(shiftUp(run)).toBe(true);
      while (run.shiftTimer > 0) stepRun(run);
    }
    expect(run.gear).toBe(gear);
    while (run.v > 0 && run.t < 10) stepRun(run, { handbrake: true });
    expect(run.v).toBe(0);

    const stoppedAt = run.x;
    stepRun(run, { gas: 1 }, 0.1);
    expect(run.v).toBe(0);
    expect(run.x).toBe(stoppedAt);
    expect(run.drive).toBe(0);

    while (run.gear > 1) {
      expect(shiftDown(run)).toBe(true);
      while (run.shiftTimer > 0) stepRun(run);
    }
    stepRun(run, { gas: 1 }, 0.1);
    expect(run.v).toBeGreaterThan(0);
  });

  it('ручник быстрее обычного тормоза, даже если газ удерживают', () => {
    const initial = createRun('trial_free', BASE);
    greenLight(initial);
    startRun(initial);
    initial.v = 20;

    const stop = (input) => {
      const run = structuredClone(initial);
      while (run.v > 0 && run.t < 10) stepRun(run, input);
      expect(run.v).toBe(0);
      return run;
    };

    const normal = stop({ brake: 1 });
    const handbrake = stop({ handbrake: true, gas: 1 });
    const both = stop({ handbrake: true, brake: 1 });
    expect(handbrake.t).toBeLessThan(normal.t);
    expect(handbrake.x).toBeLessThan(normal.x);
    expect(both.x).toBe(handbrake.x);
    expect(handbrake.rearLocked).toBe(true);
    expect(handbrake.drive).toBe(0);
    expect(handbrake.lock).toBe(0);

    stepRun(handbrake, { gas: 0.5 });
    expect(handbrake.rearLocked).toBe(false);
    expect(handbrake.drive).toBeGreaterThan(0);
  });

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
    const auto = drive('race', fast, { auto: true, wait: 0.25 });
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

  it('фальстарт: в заезде — поражение, на обкатке машина просто ждёт зелёный', () => {
    const race = createRun('race', BASE);
    expect(startRun(race)).toBe(false);
    expect(race.done).toBe(true);
    expect(race.reasonKey).toBe('jump');
    const trial = createRun('trial', { ...BASE, tires: 'tires_studded' });
    expect(startRun(trial)).toBe(false);
    expect(trial.done).toBe(false);
    greenLight(trial);
    expect(startRun(trial)).toBe(true);
  });

  it('реакция идёт в зачёт: поздний старт — позже финиш', () => {
    const b = { ...BASE, tires: 'tires_slicks', engine: 'engine_turbo' };
    const go = (wait) => {
      const run = createRun('race', b);
      run.rpm = bestLaunchRpm(run);
      greenLight(run);
      while (run.t < wait) stepRun(run, { gas: 0.4 }, STEP);
      startRun(run);
      while (!run.done && run.t < 40) {
        if (run.rpm > run.stats.redline * 0.97) shiftUp(run);
        stepRun(run, { gas: 0.7 }, STEP);
      }
      return run;
    };
    const fast = go(0.2);
    const slow = go(1.2);
    expect(fast.reaction).toBeCloseTo(0.2, 1);
    expect(slow.t - fast.t).toBeGreaterThan(0.8);
  });

  it('время форматируется до сотых', () => {
    expect(formatSeconds(12.649)).toBe('12,65');
  });
});
