import { describe, it, expect } from 'vitest';
import { runBot, createRun, stepRun, greenLight, startRun } from '../src/systems/drive.js';

const GOOD = {
  tires: 'tires_sport',
  rims: 'rims_five',
  engine: 'engine_turbo',
  body: 'body_cage',
  spoiler: 'spoiler_wing',
  gearbox: 'gearbox_close',
  suspension: 'suspension_sport',
};

describe('площадка в городке (экзамен)', () => {
  it('идеальный водитель проходит: ямы, «40», разгон и стоп-линия', () => {
    const r = runBot('trial_track', GOOD);
    expect(r.reasonKey ?? null).toBe(null);
    expect(r.ok).toBe(true);
  });

  it('газ в пол без тормоза — превышение на знаке «40» или ямы разбивают', () => {
    const run = createRun('trial_track', GOOD);
    greenLight(run);
    startRun(run);
    for (let i = 0; i < 240 * 30 && !run.done; i++) {
      if (run.rpm > run.stats.redline * 0.95) run.gear = Math.min(run.gear + 1, run.stats.ratios.length);
      stepRun(run, { gas: 1 }, 1 / 240);
    }
    expect(run.ok).toBe(false);
    expect(['speeding', 'broken', 'overshoot']).toContain(run.reasonKey);
  });
});
