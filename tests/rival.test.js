import { describe, it, expect } from 'vitest';
import { rivalProfile } from '../src/systems/rival.js';

describe('разгон Палыча', () => {
  const p = rivalProfile({ distance: 400, time: 13, reaction: 0.3 });

  it('финиширует ровно за заданное время', () => {
    expect(p.at(13)).toBeCloseTo(400, 0);
  });

  it('до реакции стоит, потом только едет вперёд', () => {
    expect(p.at(0.2)).toBe(0);
    let prev = 0;
    for (let t = 0.3; t < 14; t += 0.25) {
      const x = p.at(t);
      expect(x).toBeGreaterThanOrEqual(prev);
      prev = x;
    }
  });

  it('правдоподобная скорость на финише (как у быстрой машины на 400 м)', () => {
    const kmh = p.speedAt(13) * 3.6;
    expect(kmh).toBeGreaterThan(140);
    expect(kmh).toBeLessThan(220);
  });
});
