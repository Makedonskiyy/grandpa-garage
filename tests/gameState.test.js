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
  changeOil,
  repairBody,
  conditionScore,
  cosmeticHex,
} from '../src/gameState.js';
import {
  sanitize,
  loadSettings,
  updateSettings,
  effectiveVolume,
  charDelayMs,
} from '../src/systems/settings.js';

describe('gameState', () => {
  beforeEach(() => resetGame());

  it('клик по выбранной детали снимает её, по другой — заменяет', () => {
    togglePart('tires_slicks');
    expect(gameState.build.tires).toBe('tires_slicks');
    togglePart('tires_slicks');
    expect(gameState.build.tires).toBeNull();
    togglePart('tires_studded');
    togglePart('tires_stock');
    expect(gameState.build.tires).toBe('tires_stock');
  });

  it('обязательную деталь повторный клик не снимает, необязательную — снимает', () => {
    togglePart('engine_stock');
    expect(gameState.build.engine).toBe('engine_stock');
    togglePart('exhaust_sport');
    expect(gameState.build.exhaust).toBe('exhaust_sport');
    togglePart('exhaust_sport');
    expect(gameState.build.exhaust).toBeNull();
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
    expect(gameState.build.tires).toBeNull();
    expect(gameState.build.spoiler).toBeNull();
    expect(gameState.car.dirty).toBe(true);
    washCar();
    expect(gameState.car.dirty).toBe(false);
    resetGame();
    expect(gameState.car.dirty).toBe(true);
  });

  it('обслуживание: масло, ремонт и мойка поднимают состояние машины', () => {
    const before = conditionScore().score;
    changeOil();
    washCar();
    recordResult('trial', { ok: false, details: { damage: 6, capacity: 10 } });
    expect(gameState.car.damage).toBeCloseTo(0.6);
    expect(gameState.car.dirty).toBe(true);
    repairBody();
    washCar();
    expect(gameState.car.oil).toBe('fresh');
    expect(conditionScore().score).toBeGreaterThan(before);
    expect(conditionScore().score).toBe(10);
  });

  it('свой цвет краски, дисков и неона; фары — только готовые', () => {
    setCosmetic('paint', '#12AB34');
    expect(gameState.cosmetics.paint).toBe('#12ab34');
    expect(cosmeticHex('paint', gameState.cosmetics.paint)).toBe('#12ab34');
    expect(cosmeticHex('paint', 'cherry')).toBe('#8b1a2b');
    expect(() => setCosmetic('headlight', '#ffffff')).toThrow();
    expect(() => setCosmetic('paint', 'red')).toThrow();
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
    expect(
      sanitize({
        scale: '7',
        display: 'big',
        music: 500,
        sfx: 'abc',
        muted: 'yes',
        textSpeed: 'warp',
        shake: 1,
      }),
    ).toEqual({
      scale: 'auto',
      display: 'ask',
      music: 100,
      sfx: 80,
      muted: false,
      textSpeed: 'normal',
      shake: true,
      gearbox: 'manual',
    });
  });

  it('старое «На весь экран» в масштабе становится режимом экрана', () => {
    const s = sanitize({ scale: 'fullscreen' });
    expect(s.scale).toBe('auto');
    expect(s.display).toBe('fullscreen');
  });

  it('скорость текста задаёт задержку между буквами, «Сразу» — без задержки', () => {
    expect(charDelayMs(sanitize({ textSpeed: 'normal' }))).toBeCloseTo(1000 / 30);
    expect(charDelayMs(sanitize({ textSpeed: 'fast' }))).toBeLessThan(
      charDelayMs(sanitize({ textSpeed: 'slow' })),
    );
    expect(charDelayMs(sanitize({ textSpeed: 'instant' }))).toBe(0);
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
