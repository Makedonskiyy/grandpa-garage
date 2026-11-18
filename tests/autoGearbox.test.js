import { describe, it, expect } from 'vitest';
import { createGearbox, updateGearbox } from '../src/systems/autoGearbox.js';
import config from '../data/config.json';

const step = (state, speed01, input = {}, dt = 1 / 60) =>
  updateGearbox(state, { speed01, ...input }, dt);

describe('автоматическая коробка', () => {
  it('на старте включает первую передачу и холостые обороты', () => {
    const box = createGearbox();
    expect(box.gear).toBe(1);
    expect(box.rpm).toBe(config.gearbox.idleRpm);
    expect(box.shifting).toBe(false);
  });

  it('переключается вверх по мере роста скорости', () => {
    const box = createGearbox();
    step(box, 0.25);
    expect(box.gear).toBe(2);
    step(box, 0.45);
    expect(box.gear).toBe(3);
    step(box, 0.65);
    expect(box.gear).toBe(4);
    step(box, 0.85);
    expect(box.gear).toBe(5);
  });

  it('вниз переключается с гистерезисом и не прыгает через передачу', () => {
    const box = createGearbox();
    step(box, 1);
    expect(box.gear).toBe(5);

    step(box, 0.83);
    expect(box.gear).toBe(5);

    step(box, 0.79);
    expect(box.gear).toBe(4);

    for (let i = 0; i < 10; i++) step(box, 0);
    expect(box.gear).toBe(1);
  });

  it('газ поднимает обороты, тормоз опускает', () => {
    const base = createGearbox();
    step(base, 0.5);

    const gas = createGearbox();
    step(gas, 0.5, { gas: 1 });

    const brake = createGearbox();
    step(brake, 0.5, { brake: 1 });

    expect(gas.rpm).toBeGreaterThan(base.rpm);
    expect(brake.rpm).toBeLessThan(base.rpm);
  });

  it('не выпускает обороты за холостые и красную зону', () => {
    const box = createGearbox();
    step(box, 1, { gas: 1 });
    expect(box.rpm).toBeLessThanOrEqual(config.gearbox.redlineRpm);

    step(box, 0, { brake: 1 });
    expect(box.rpm).toBeGreaterThanOrEqual(config.gearbox.idleRpm);
  });

  it('показывает момент переключения и гасит его по таймеру', () => {
    const box = createGearbox();
    step(box, 0.25);
    expect(box.shifting).toBe(true);

    for (let i = 0; i < 12; i++) step(box, 0.25);
    expect(box.shifting).toBe(false);
  });

  it('всегда остаётся в диапазоне 1–5 передач', () => {
    const box = createGearbox();
    for (const speed of [-1, 0, 0.1, 0.5, 1, 2]) {
      step(box, speed);
      expect(box.gear).toBeGreaterThanOrEqual(1);
      expect(box.gear).toBeLessThanOrEqual(config.gearbox.gears);
    }
  });
});
