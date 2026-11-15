import { describe, it, expect } from 'vitest';
import {
  createSuspension,
  stepSuspension,
  bodyPose,
  kick,
  wheelFrame,
  rollAngle,
  SUSPENSION,
} from '../src/systems/carPhysics.js';

const run = (s, seconds, accel = 0) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepSuspension(s, 1 / 60, accel);
  return s;
};

describe('подвеска', () => {
  it('после толчка успокаивается', () => {
    const s = createSuspension();
    kick(s, 60);
    run(s, 3);
    expect(Math.abs(s.rear.y)).toBeLessThan(0.05);
    expect(Math.abs(s.front.y)).toBeLessThan(0.05);
  });

  it('при разгоне зад приседает, нос поднимается', () => {
    const s = run(createSuspension(), 2, 3);
    expect(s.rear.y).toBeGreaterThan(0);
    expect(s.front.y).toBeLessThan(0);
    expect(bodyPose(s).pitch).toBeLessThan(0);
  });

  it('ход и наклон ограничены, чтобы пиксель-арт не ломался', () => {
    const s = createSuspension();
    kick(s, 5000, -5000);
    run(s, 0.05);
    expect(Math.abs(s.rear.y)).toBeLessThanOrEqual(SUSPENSION.maxTravel);
    expect(Math.abs(bodyPose(s).pitch)).toBeLessThanOrEqual(SUSPENSION.maxPitch);
  });

  it('большой шаг времени не разносит пружину', () => {
    const s = createSuspension();
    kick(s, 40);
    stepSuspension(s, 2);
    expect(Number.isFinite(s.rear.y)).toBe(true);
  });
});

describe('колёса', () => {
  it('кадр по углу: 16 кадров на оборот, отрицательные углы тоже', () => {
    expect(wheelFrame(0)).toBe(0);
    expect(wheelFrame(Math.PI)).toBe(8);
    expect(wheelFrame(Math.PI * 2)).toBe(0);
    expect(wheelFrame(-0.01)).toBe(15);
  });

  it('проезд длины окружности — ровно оборот', () => {
    const r = 20;
    expect(rollAngle(0, 2 * Math.PI * r, r)).toBeCloseTo(2 * Math.PI);
  });
});
