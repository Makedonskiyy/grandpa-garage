import { describe, it, expect } from 'vitest';
import { computeCanvasZoom, computeZoom } from '../src/systems/scale.js';

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

describe('computeCanvasZoom', () => {
  it('заполняет ширину окна на 1440p при видимых панелях браузера', () => {
    const uiZoom = computeZoom('auto', 2560, 1278);
    expect(uiZoom).toBeCloseTo(1278 / 360);
    expect(computeCanvasZoom('auto', 2560, uiZoom)).toBe(4);
  });

  it('сохраняет пропорции на телефоне и выбранный фиксированный масштаб', () => {
    expect(computeCanvasZoom('auto', 390, computeZoom('auto', 390, 844))).toBe(390 / 640);
    expect(computeCanvasZoom('3', 2560, 3)).toBe(3);
  });
});
