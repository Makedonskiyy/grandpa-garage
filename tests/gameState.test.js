import { describe, it, expect, beforeEach } from 'vitest';
import {
  gameState,
  resetGame,
  togglePart,
  setCosmetic,
  recordResult,
  getCurrentTestId,
  shouldShowGrandpaHint,
  isGameComplete,
  washCar,
} from '../src/gameState.js';
import {
  sanitize,
  loadSettings,
  updateSettings,
  effectiveVolume,
} from '../src/systems/settings.js';

describe('gameState', () => {
  beforeEach(() => resetGame());

  it('клик по выбранной детали снимает её, по другой — заменяет', () => {
    togglePart('wheels_slicks');
    expect(gameState.build.wheels).toBe('wheels_slicks');
    togglePart('wheels_slicks');
    expect(gameState.build.wheels).toBeNull();
    togglePart('wheels_studded');
    togglePart('wheels_stock');
    expect(gameState.build.wheels).toBe('wheels_stock');
  });

  it('провал не сбрасывает сборку, третий провал подряд включает совет деда', () => {
    togglePart('engine_turbo');
    const build = { ...gameState.build };
    for (let i = 0; i < 3; i++) recordResult('trial', { ok: false, reason: 'x' });
    expect(gameState.build).toEqual(build);
    expect(gameState.attempts.trial).toBe(3);
    expect(shouldShowGrandpaHint('trial')).toBe(true);
  });

  it('после обкатки текущий заезд — с Палычем, после обоих игра пройдена', () => {
    expect(getCurrentTestId()).toBe('trial');
    recordResult('trial', { ok: true });
    expect(getCurrentTestId()).toBe('race');
    expect(shouldShowGrandpaHint('trial')).toBe(false);
    recordResult('race', { ok: true });
    expect(isGameComplete()).toBe(true);
  });

  it('старт: колёс нет, спойлера нет, машина грязная; «Помыть» её чистит', () => {
    expect(gameState.build.wheels).toBeNull();
    expect(gameState.build.spoiler).toBeNull();
    expect(gameState.car.dirty).toBe(true);
    washCar();
    expect(gameState.car.dirty).toBe(false);
    resetGame();
    expect(gameState.car.dirty).toBe(true);
  });

  it('косметика проверяет варианты, resetGame всё сбрасывает', () => {
    setCosmetic('neon', 'pink');
    expect(() => setCosmetic('neon', 'gold')).toThrow();
    resetGame();
    expect(gameState.cosmetics.neon).toBe('off');
  });
});

describe('settings', () => {
  const memoryStorage = () => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  };

  it('мусор из хранилища заменяется значениями по умолчанию', () => {
    expect(sanitize({ scale: '7', music: 500, sfx: 'abc', muted: 'yes' })).toEqual({
      scale: 'auto',
      music: 100,
      sfx: 80,
      muted: false,
    });
  });

  it('сломанное хранилище не роняет игру', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadSettings(broken).scale).toBe('auto');
    expect(updateSettings({ music: 10 }, broken).music).toBe(10);
  });

  it('настройки сохраняются и читаются обратно', () => {
    const s = memoryStorage();
    updateSettings({ scale: '2', muted: true }, s);
    expect(loadSettings(s)).toMatchObject({ scale: '2', muted: true });
    expect(effectiveVolume('music')).toBe(0);
  });
});
