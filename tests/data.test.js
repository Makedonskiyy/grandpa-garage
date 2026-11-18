import { describe, it, expect } from 'vitest';
import parts from '../data/parts.json';
import tests from '../data/tests.json';
import story from '../data/story.json';
import cosmetics from '../data/cosmetics.json';
import characters from '../data/characters.json';
import storyBackgrounds from '../data/story-backgrounds.json';

const MAX_LINE = 90; // ТЗ 2.3: реплика влезает в две строки диалогового окна

describe('parts.json', () => {
  it('в каждом слоте хотя бы две детали, у необязательных — описание штатной', () => {
    for (const slot of parts.slots) {
      const count = parts.parts.filter((p) => p.slot === slot.id).length;
      expect(count, slot.id).toBeGreaterThanOrEqual(slot.required === false ? 1 : 2);
      if (slot.required === false) expect(slot.none?.name, slot.id).toBeTruthy();
    }
  });

  it('каждый слот входит ровно в одну группу меню', () => {
    const inGroups = parts.groups.flatMap((g) => g.slots);
    expect([...inGroups].sort()).toEqual(parts.slots.map((s) => s.id).sort());
  });

  it('прижимная сила есть только у спойлеров, сцепление — только у шин', () => {
    for (const p of parts.parts) {
      if (p.slot === 'spoiler') expect(p.downforce).toBeGreaterThan(0);
      else expect(p.downforce ?? 0).toBe(0);
      if (p.slot === 'tires') expect(typeof p.grip.clay).toBe('number');
      else expect(p.grip).toBeUndefined();
    }
  });

  it('id уникальны, у каждой детали имя, короткая строка и описание', () => {
    const ids = parts.parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of parts.parts) {
      expect(p.id).toMatch(/^[a-z0-9_]+$/);
      expect(p.name.length, p.id).toBeGreaterThan(2);
      expect(p.short.length, p.id).toBeLessThanOrEqual(40);
      expect(p.description.length, p.id).toBeGreaterThan(40);
      expect(p.durability, p.id).toBeGreaterThanOrEqual(1);
      expect(p.durability, p.id).toBeLessThanOrEqual(10);
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

  it('трасса обкатки непрерывна, все участки известны', () => {
    const { track, surfaces } = tests.tests[0];
    let x = 0;
    for (const s of track.segments) {
      expect(s.from).toBe(x);
      expect(surfaces[s.type], s.type).toBeTruthy();
      x = s.to;
    }
    expect(x).toBe(track.length);
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
  const BACKGROUNDS = Object.keys(storyBackgrounds.backgrounds);
  const byId = new Map(story.lines.map((l) => [l.id, l]));

  it('фоны и персонажи из известного списка', () => {
    for (const l of story.lines) {
      if ('bg' in l) expect(BACKGROUNDS, `фон реплики ${l.id}`).toContain(l.bg);
      for (const id of Object.values(l.cast ?? {})) {
        if (id !== null) expect(characters.characters, `персонаж реплики ${l.id}`).toContain(id);
      }
    }
  });

  it('временные фоны и атмосфера — из известных, у каждого фона есть описание для генерации', () => {
    const FALLBACKS = ['black', 'garage_cover', 'garage_room', 'workbench', null];
    for (const [key, bg] of Object.entries(storyBackgrounds.backgrounds)) {
      expect(FALLBACKS, key).toContain(bg.fallback);
      expect([undefined, 'snow', 'dust'], key).toContain(bg.ambience);
      if (bg.ambienceArea) expect(bg.ambienceArea[0], key).toBeLessThan(bg.ambienceArea[1]);
      expect(bg.description.length, key).toBeGreaterThan(20);
      expect(bg.prompt.length, key).toBeGreaterThan(20);
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
