import { describe, it, expect } from 'vitest';
import parts from '../data/parts.json';
import car from '../data/car.json';
import strings from '../data/strings.json';
import { hsvToHex, hexToHsv } from '../src/ui/colorPicker.js';
import { buildRating } from '../src/systems/drive.js';
import { FRESH_CONDITION } from '../src/systems/simulate.js';

describe('детали ↔ спрайты машины', () => {
  it('у каждой шины и диска есть свой лист колеса', () => {
    for (const p of parts.parts.filter((x) => x.slot === 'tires')) {
      expect(car.tires, p.id).toContain(p.sprite);
    }
    for (const p of parts.parts.filter((x) => x.slot === 'rims')) {
      expect(Object.keys(car.rims), p.id).toContain(p.sprite);
    }
  });

  it('у каждого кузова и спойлера есть слой', () => {
    for (const p of parts.parts.filter((x) => x.slot === 'body')) {
      expect(car.overlays[p.id], p.id).toBeTruthy();
    }
    for (const p of parts.parts.filter((x) => x.slot === 'spoiler')) {
      expect(car.spoilers[p.id], p.id).toBeTruthy();
    }
  });

  it('у каждого раздела гаража есть подпись и подсказка', () => {
    for (const id of [...parts.groups.map((g) => g.id), 'looks', 'service']) {
      expect(strings.garage.tiles[id], id).toBeTruthy();
      expect(strings.garage.tileTips[id], id).toBeTruthy();
    }
  });
});

describe('свой цвет', () => {
  it('HSV и код цвета переводятся туда и обратно', () => {
    for (const hex of ['#8b1a2b', '#1f3f8f', '#e8e8e0', '#000000', '#ffffff', '#2fff6a']) {
      const { h, s, v } = hexToHsv(hex);
      expect(hsvToHex(h, s, v)).toBe(hex);
    }
    expect(hsvToHex(0, 1, 1)).toBe('#ff0000');
    expect(hsvToHex(120, 1, 1)).toBe('#00ff00');
  });
});

describe('плашка «Сборка»', () => {
  it('оценка 1–10 растёт с быстрой сборкой, без шин — нет оценки', () => {
    const base = { ...parts.initialBuild, tires: 'tires_stock' };
    const fast = { ...base, tires: 'tires_slicks', engine: 'engine_turbo', body: 'body_light' };
    const a = buildRating(base, FRESH_CONDITION);
    const b = buildRating(fast, FRESH_CONDITION);
    expect(a).toBeGreaterThanOrEqual(1);
    expect(b).toBeLessThanOrEqual(10);
    expect(b).toBeGreaterThan(a);
    expect(buildRating(parts.initialBuild, FRESH_CONDITION)).toBeNull();
  });
});
