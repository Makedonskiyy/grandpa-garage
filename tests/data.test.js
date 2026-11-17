import { describe, it, expect } from 'vitest';
import parts from '../data/parts.json';
import tests from '../data/tests.json';
import story from '../data/story.json';
import cosmetics from '../data/cosmetics.json';
import characters from '../data/characters.json';

const MAX_LINE = 90; // ТЗ 2.3: реплика влезает в две строки диалогового окна

describe('parts.json', () => {
  it('в обязательных слотах ровно три детали, в необязательных — хотя бы одна', () => {
    for (const slot of parts.slots) {
      const count = parts.parts.filter((p) => p.slot === slot.id).length;
      if (slot.required === false) expect(count).toBeGreaterThan(0);
      else expect(count).toBe(3);
    }
  });

  it('прижимная сила есть только у спойлеров', () => {
    for (const p of parts.parts) {
      if (p.slot === 'spoiler') expect(p.downforce).toBeGreaterThan(0);
      else expect(p.downforce ?? 0).toBe(0);
    }
  });

  it('id уникальны, ассеты названы латиницей через подчёркивание', () => {
    const ids = parts.parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of parts.parts) {
      expect(p.id).toMatch(/^[a-z0-9_]+$/);
      expect(p.icon).toMatch(/^[a-z0-9_]+\.png$/);
    }
  });

  it('стартовая сборка ссылается на существующие детали своих слотов', () => {
    for (const [slot, id] of Object.entries(parts.initialBuild)) {
      if (id === null) continue;
      expect(parts.parts.find((p) => p.id === id)?.slot).toBe(slot);
    }
  });
});

describe('tests.json', () => {
  it('два заезда: обкатка и заезд с Палычем', () => {
    expect(tests.tests.map((t) => t.id)).toEqual(['trial', 'race']);
  });

  it('у колёс есть сцепление для поверхности каждого заезда', () => {
    for (const t of tests.tests) {
      for (const w of parts.parts.filter((p) => p.slot === 'wheels')) {
        expect(typeof w.grip[t.surface]).toBe('number');
      }
    }
  });

  it('подсказки деда влезают в окно', () => {
    for (const t of tests.tests) expect(t.grandpaHint.length).toBeLessThanOrEqual(MAX_LINE);
  });
});

describe('story.json', () => {
  const byId = new Map(story.lines.map((l) => [l.id, l]));

  it('реплики не длиннее 90 знаков', () => {
    for (const l of story.lines)
      expect(l.text.length, `реплика ${l.id}`).toBeLessThanOrEqual(MAX_LINE);
  });

  it('все next и начала последовательностей существуют, циклов нет', () => {
    for (const start of Object.values(story.sequences)) {
      const seen = new Set();
      let id = start;
      while (id !== null) {
        expect(byId.has(id), `нет реплики ${id}`).toBe(true);
        expect(seen.has(id), `цикл на ${id}`).toBe(false);
        seen.add(id);
        id = byId.get(id).next;
      }
    }
  });

  it('у каждой реплики известный говорящий', () => {
    for (const l of story.lines) expect(story.speakers).toHaveProperty(l.who);
  });
});

describe('story.json: постановка сцен', () => {
  const BACKGROUNDS = ['black', 'garage_cover', 'garage_room', 'workbench', null];
  const byId = new Map(story.lines.map((l) => [l.id, l]));

  it('фоны и персонажи из известного списка', () => {
    for (const l of story.lines) {
      if ('bg' in l) expect(BACKGROUNDS, `фон реплики ${l.id}`).toContain(l.bg);
      for (const id of Object.values(l.cast ?? {})) {
        if (id !== null) expect(characters.characters, `персонаж реплики ${l.id}`).toContain(id);
      }
    }
  });

  it('каждая последовательность начинается с фона и состава', () => {
    for (const [name, start] of Object.entries(story.sequences)) {
      const first = byId.get(start);
      expect('bg' in first, name).toBe(true);
      expect(first.cast, name).toBeTruthy();
    }
  });

  it('говорящий в реплике речи стоит на сцене', () => {
    for (const [, start] of Object.entries(story.sequences)) {
      const cast = { left: null, right: null };
      let id = start;
      while (id !== null) {
        const l = byId.get(id);
        Object.assign(cast, l.cast ?? {});
        if (l.kind === 'speech' || l.kind === 'note') {
          expect(Object.values(cast), `реплика ${l.id}`).toContain(l.who);
        }
        id = l.next;
      }
    }
  });
});

describe('cosmetics.json', () => {
  it('количество вариантов по ТЗ 5 и корректные defaults', () => {
    expect(cosmetics.paint).toHaveLength(8);
    expect(cosmetics.rim).toHaveLength(6);
    expect(cosmetics.headlight).toHaveLength(5);
    expect(cosmetics.neon).toHaveLength(6);
    for (const [group, id] of Object.entries(cosmetics.defaults)) {
      expect(cosmetics[group].some((c) => c.id === id)).toBe(true);
    }
  });
});
