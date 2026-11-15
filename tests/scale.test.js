import { describe, it, expect } from 'vitest';
import { computeZoom } from '../src/systems/scale.js';

describe('computeZoom', () => {
  it('фиксированные режимы дают свой множитель', () => {
    expect(computeZoom('1', 3000, 3000)).toBe(1);
    expect(computeZoom('2', 3000, 3000)).toBe(2);
    expect(computeZoom('3', 100, 100)).toBe(3);
  });

  it('авто берёт наибольший целый множитель, который влезает', () => {
    expect(computeZoom('auto', 1920, 1080)).toBe(3);
    expect(computeZoom('auto', 1366, 768)).toBe(2);
    expect(computeZoom('fullscreen', 1280, 1024)).toBe(2);
  });

  it('окно меньше 640×360 — дробный множитель', () => {
    expect(computeZoom('auto', 320, 360)).toBeCloseTo(0.5);
  });
});
