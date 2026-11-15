import { describe, it, expect } from 'vitest';
import {
  computeStats,
  evaluateTrial,
  evaluateRace,
  getPartsBySlot,
  raceTelemetry,
  formatSeconds,
} from '../src/systems/simulate.js';

/** Все 27 сборок: 3 колёс × 3 двигателя × 3 кузова. */
const ALL_BUILDS = getPartsBySlot('wheels').flatMap((w) =>
  getPartsBySlot('engine').flatMap((e) =>
    getPartsBySlot('body').map((b) => ({ wheels: w.id, engine: e.id, body: b.id })),
  ),
);

const key = (b) => `${b.wheels}+${b.engine}+${b.body}`;

// Ожидаемые проходящие сборки — таблицы ТЗ 4.2 и 4.3 (масса в кг, мощность в л.с., время в с).
const TRIAL_PASS = {
  'wheels_studded+engine_tuned+body_rusty': { kg: 900, hp: 140 },
  'wheels_studded+engine_tuned+body_cage': { kg: 1050, hp: 140 },
  'wheels_studded+engine_turbo+body_rusty': { kg: 950, hp: 180 },
  'wheels_studded+engine_turbo+body_cage': { kg: 1100, hp: 180 },
  'wheels_stock+engine_tuned+body_rusty': { kg: 900, hp: 140 },
  'wheels_stock+engine_turbo+body_rusty': { kg: 950, hp: 180 },
};

const RACE_PASS = {
  'wheels_slicks+engine_tuned+body_light': { kg: 700, time: '12,65' },
  'wheels_slicks+engine_turbo+body_rusty': { kg: 900, time: '12,65' },
  'wheels_slicks+engine_turbo+body_light': { kg: 750, time: '11,55' },
};

describe('все 27 сборок', () => {
  it('перебор даёт 27 уникальных сборок', () => {
    expect(new Set(ALL_BUILDS.map(key)).size).toBe(27);
  });

  it.each(ALL_BUILDS.map((b) => [key(b), b]))('%s: обкатка совпадает с таблицей ТЗ 4.2', (k, b) => {
    const r = evaluateTrial(b);
    expect(r.ok).toBe(k in TRIAL_PASS);
    if (r.ok) {
      expect(r.stats.display.kg).toBe(TRIAL_PASS[k].kg);
      expect(r.stats.display.hp).toBe(TRIAL_PASS[k].hp);
    } else {
      expect(r.reason).toBeTruthy();
    }
  });

  it.each(ALL_BUILDS.map((b) => [key(b), b]))('%s: заезд совпадает с таблицей ТЗ 4.3', (k, b) => {
    const r = evaluateRace(b);
    expect(r.ok).toBe(k in RACE_PASS);
    if (r.ok) {
      expect(r.stats.display.kg).toBe(RACE_PASS[k].kg);
      expect(formatSeconds(r.details.time)).toBe(RACE_PASS[k].time);
    } else {
      expect(r.reason).toBeTruthy();
    }
  });

  it('ни одна сборка не проходит оба заезда', () => {
    const both = ALL_BUILDS.filter((b) => evaluateTrial(b).ok && evaluateRace(b).ok);
    expect(both).toEqual([]);
  });

  it('на каждый заезд минимум две проходящие сборки', () => {
    expect(ALL_BUILDS.filter((b) => evaluateTrial(b).ok).length).toBeGreaterThanOrEqual(2);
    expect(ALL_BUILDS.filter((b) => evaluateRace(b).ok).length).toBeGreaterThanOrEqual(2);
  });

  it('расчёт детерминирован', () => {
    for (const b of ALL_BUILDS) {
      expect(evaluateRace(b)).toEqual(evaluateRace(b));
      expect(evaluateTrial(b)).toEqual(evaluateTrial(b));
    }
  });
});

describe('спойлер: 81 сборка (27 × без спойлера, лип, крыло)', () => {
  const SPOILERS = [null, ...getPartsBySlot('spoiler').map((p) => p.id)];
  const WITH_SPOILER = ALL_BUILDS.flatMap((b) => SPOILERS.map((s) => ({ ...b, spoiler: s })));
  const k4 = (b) => `${key(b)}+${b.spoiler ?? 'none'}`;

  // Пересчитано при вводе спойлера (лип +2, крыло +3 к сцеплению на асфальте, оба 2 очка массы).
  const RACE_PASS_4 = [
    'wheels_studded+engine_turbo+body_light+spoiler_wing',
    'wheels_stock+engine_turbo+body_light+spoiler_lip',
    'wheels_stock+engine_turbo+body_light+spoiler_wing',
    'wheels_slicks+engine_tuned+body_light+none',
    'wheels_slicks+engine_turbo+body_rusty+none',
    'wheels_slicks+engine_turbo+body_light+none',
    'wheels_slicks+engine_turbo+body_light+spoiler_lip',
    'wheels_slicks+engine_turbo+body_light+spoiler_wing',
  ];

  it('спойлер необязателен: без него сборка полная', () => {
    expect(computeStats({ ...ALL_BUILDS[0], spoiler: null }).complete).toBe(true);
  });

  it('прижимная сила добавляет сцепление на асфальте, но не на грунте', () => {
    const build = { wheels: 'wheels_stock', engine: 'engine_turbo', body: 'body_light' };
    const base = computeStats(build);
    const wing = computeStats({ ...build, spoiler: 'spoiler_wing' });
    expect(wing.grip.asphalt).toBe(base.grip.asphalt + 3);
    expect(wing.grip.clay).toBe(base.grip.clay);
    expect(wing.mass).toBe(base.mass + 2);
  });

  it('заезд проходят ровно ожидаемые сборки', () => {
    const passing = WITH_SPOILER.filter((b) => evaluateRace(b).ok).map(k4);
    expect(passing.sort()).toEqual([...RACE_PASS_4].sort());
  });

  it('ни одна из 81 сборки не проходит оба заезда, на каждый — минимум две', () => {
    expect(WITH_SPOILER.filter((b) => evaluateTrial(b).ok && evaluateRace(b).ok)).toEqual([]);
    expect(WITH_SPOILER.filter((b) => evaluateTrial(b).ok).length).toBeGreaterThanOrEqual(2);
    expect(WITH_SPOILER.filter((b) => evaluateRace(b).ok).length).toBeGreaterThanOrEqual(2);
  });

  it('нет пограничных результатов: время не ближе 0,05 с к Палычу', () => {
    for (const b of WITH_SPOILER) {
      expect(Math.abs(evaluateRace(b).details.time - 13), k4(b)).toBeGreaterThan(0.05);
    }
  });
});

describe('причины провала', () => {
  it('обкатка: облегчённый кузов ломается, называется самая хрупкая деталь', () => {
    const r = evaluateTrial({
      wheels: 'wheels_studded',
      engine: 'engine_tuned',
      body: 'body_light',
    });
    expect(r.reasonKey).toBe('broken');
    expect(r.reason).toContain('Облегчённый');
  });

  it('обкатка: родной 1.3 — не хватило мощности', () => {
    const r = evaluateTrial({ wheels: 'wheels_stock', engine: 'engine_stock', body: 'body_rusty' });
    expect(r.reasonKey).toBe('power');
  });

  it('обкатка: слики буксуют в грязи', () => {
    const r = evaluateTrial({
      wheels: 'wheels_slicks',
      engine: 'engine_turbo',
      body: 'body_rusty',
    });
    expect(r.reasonKey).toBe('traction');
  });

  it('заезд: шипы не держат асфальт, тяжёлая машина получает приписку', () => {
    const r = evaluateRace({ wheels: 'wheels_studded', engine: 'engine_turbo', body: 'body_cage' });
    expect(r.reasonKey).toBe('traction');
    expect(r.reason).toMatch(/тяжёлая$/);
    expect(r.details.diffText).toMatch(/^Медленнее Палыча на \d+,\d\d с$/);
  });

  it('заезд: слабый мотор — не хватает мощности', () => {
    const r = evaluateRace({ wheels: 'wheels_slicks', engine: 'engine_stock', body: 'body_light' });
    expect(r.reasonKey).toBe('power');
    expect(r.details.heavy).toBe(false);
  });

  it('успешный заезд показывает выигрыш у Палыча', () => {
    const r = evaluateRace({ wheels: 'wheels_slicks', engine: 'engine_turbo', body: 'body_light' });
    expect(r.details.diffText).toBe('Быстрее Палыча на 1,45 с');
  });
});

describe('неполная сборка', () => {
  it('пустые слоты перечисляются, заезд не считается', () => {
    const build = { wheels: 'wheels_stock', engine: null, body: null };
    expect(computeStats(build).missing).toEqual(['engine', 'body']);
    expect(evaluateTrial(build)).toMatchObject({ ok: false, reasonKey: 'incomplete' });
    expect(evaluateRace(build)).toMatchObject({ ok: false, reasonKey: 'incomplete' });
  });

  it('деталь не в свой слот — ошибка', () => {
    expect(() => computeStats({ wheels: 'engine_turbo' })).toThrow();
  });
});

describe('телеметрия приборов', () => {
  it('Палыч финиширует ровно за 13,0 с', () => {
    const a = (2 * 400) / 13 ** 2;
    const t = raceTelemetry(a, 13);
    expect(t.finished).toBe(true);
    expect(t.distance).toBeCloseTo(400, 6);
  });

  it('путь и скорость растут, передачи не выше пятой', () => {
    const a = evaluateRace({
      wheels: 'wheels_slicks',
      engine: 'engine_turbo',
      body: 'body_light',
    }).details.accel;
    const mid = raceTelemetry(a, 5);
    const end = raceTelemetry(a, 99);
    expect(end.distance).toBeGreaterThan(mid.distance);
    expect(end.speedKmh).toBeGreaterThan(mid.speedKmh);
    expect(end.gear).toBeLessThanOrEqual(5);
  });
});
