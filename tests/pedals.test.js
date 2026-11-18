import { describe, it, expect } from 'vitest';
import { createPedalState, setPedalTarget, stepPedals, isPedalKey } from '../src/systems/pedals.js';
import config from '../data/config.json';

describe('педали', () => {
  it('начинают с нуля и плавно нажимаются', () => {
    const state = createPedalState();
    expect(state.gas).toBe(0);
    expect(state.brake).toBe(0);

    setPedalTarget(state, 'gas', true);
    stepPedals(state, 0.05);
    expect(state.gas).toBeGreaterThan(0);
    expect(state.gas).toBeLessThan(1);

    stepPedals(state, 1);
    expect(state.gas).toBe(1);
  });

  it('плавно отпускаются после нажатия', () => {
    const state = createPedalState();
    setPedalTarget(state, 'gas', true);
    stepPedals(state, 1);

    setPedalTarget(state, 'gas', false);
    stepPedals(state, 0.05);
    expect(state.gas).toBeGreaterThan(0);
    expect(state.gas).toBeLessThan(1);

    stepPedals(state, 1);
    expect(state.gas).toBe(0);
  });

  it('тормоз работает отдельно от газа', () => {
    const state = createPedalState();
    setPedalTarget(state, 'brake', true);
    stepPedals(state, 0.05);

    expect(state.brake).toBeGreaterThan(0);
    expect(state.gas).toBe(0);
  });

  it('не выходит за границы 0–1', () => {
    const state = createPedalState();
    setPedalTarget(state, 'gas', true);
    setPedalTarget(state, 'brake', true);

    for (const dt of [0, 0.016, 1, 10]) {
      stepPedals(state, dt);
      expect(state.gas).toBeGreaterThanOrEqual(0);
      expect(state.gas).toBeLessThanOrEqual(1);
      expect(state.brake).toBeGreaterThanOrEqual(0);
      expect(state.brake).toBeLessThanOrEqual(1);
    }
  });

  it('узнаёт клавиши газа и тормоза из конфига', () => {
    for (const code of config.pedals.keys.gas) {
      expect(isPedalKey(code, 'gas')).toBe(true);
      expect(isPedalKey(code, 'brake')).toBe(false);
    }
    for (const code of config.pedals.keys.brake) {
      expect(isPedalKey(code, 'brake')).toBe(true);
      expect(isPedalKey(code, 'gas')).toBe(false);
    }
    expect(isPedalKey('Space', 'gas')).toBe(false);
    expect(isPedalKey('KeyQ', 'brake')).toBe(false);
  });
});
