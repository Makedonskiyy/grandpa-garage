import { describe, it, expect } from 'vitest';
import { saveGame, loadGame, hasSave, clearSave } from '../src/systems/save.js';
import { createInitialState } from '../src/gameState.js';

const memory = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};

describe('сохранение', () => {
  it('сборка, внешний вид и прогресс сохраняются и читаются обратно', () => {
    const store = memory();
    const s = createInitialState();
    s.build.tires = 'tires_slicks';
    s.cosmetics.paint = '#12ab34';
    s.passed.trial = true;
    s.flags.introSeen = true;
    saveGame(s, store);
    const back = loadGame(store);
    expect(back.build.tires).toBe('tires_slicks');
    expect(back.cosmetics.paint).toBe('#12ab34');
    expect(back.passed.trial).toBe(true);
    expect(hasSave(store)).toBe(true);
    clearSave(store);
    expect(hasSave(store)).toBe(false);
  });

  it('битое сохранение и детали, которых больше нет, не ломают игру', () => {
    const store = memory();
    store.setItem('dedov-garage:save', '{oops');
    expect(loadGame(store)).toBeNull();
    const s = createInitialState();
    s.build.engine = 'engine_from_old_version';
    saveGame(s, store);
    expect(loadGame(store).build.engine).toBeNull();
  });
});
