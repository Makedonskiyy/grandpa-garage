import { describe, it, expect } from 'vitest';
import { computeZoom } from '../src/systems/scale.js';

describe('computeZoom', () => {
  it('фиксированные режимы дают свой множитель', () => {
    expect(computeZoom('1', 3000, 3000)).toBe(1);
    expect(computeZoom('2', 3000, 3000)).toBe(2);
    expect(computeZoom('3', 100, 100)).toBe(3);
  });

  it('авто заполняет окно целиком — и в окне, и на весь экран', () => {
    expect(computeZoom('auto', 1920, 1080)).toBe(3);
    // Окно браузера на мониторе 1920×1080 ниже из-за панелей — игра всё равно занимает его целиком.
    expect(computeZoom('auto', 1920, 969)).toBeCloseTo(969 / 360);
    expect(computeZoom('auto', 1366, 768)).toBeCloseTo(768 / 360);
  });

  it('окно меньше 640×360 — дробный множитель', () => {
    expect(computeZoom('auto', 320, 360)).toBeCloseTo(0.5);
  });
});
