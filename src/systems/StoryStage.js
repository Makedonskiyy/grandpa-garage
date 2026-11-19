/**
 * StoryStage — сцены истории как в визуальной новелле (ТЗ 3.5, 7.5).
 *
 * Что на экране:
 *   • фон истории (Phaser) — сменяется плавным наплывом, камера медленно едет по нему
 *     (каждый новый фон — в другую сторону); поверх — атмосфера: снег на улице, пыль в луче
 *     света в гараже;
 *     у реплик без фона остаётся сцена, поверх которой идёт разговор (гараж, заезд);
 *   • персонажи (HTML) — слева и справа, по пояс; говорящий ярче и ближе, второй приглушён;
 *     выход на сцену, дыхание, моргание, рот двигается, пока печатается реплика;
 *     вступая в разговор, персонаж чуть подпрыгивает, пока говорит — покачивается;
 *     дед — старая выцветшая фотография в рамке (по ТЗ он уехал, его голос — записка);
 *   • окно реплики с именем говорящего; записка деда — бумага и почерк;
 *     дата — на чёрном экране, надпись — по центру.
 *
 * Сценарий — data/story.json: у реплики `bg` (фон), `cast` (кто слева и справа);
 * если поле не указано, остаётся как в предыдущей реплике.
 * Клик / Пробел / Enter: первое нажатие допечатывает реплику, второе — следующая.
 */
import Phaser from 'phaser';
import story from '../../data/story.json';
import config from '../../data/config.json';
import characters from '../../data/characters.json';
import storyBackgrounds from '../../data/story-backgrounds.json';
import { SFX, WORLD } from '../config/constants.js';
import { audio } from './AudioManager.js';
import { charDelayMs } from './settings.js';
import { createLayer } from '../ui/overlay.js';
import { el, clear } from '../ui/dom.js';
import { t } from './strings.js';

const cfg = config.dialog;
const byId = new Map(story.lines.map((l) => [l.id, l]));
const FRAME = Object.fromEntries(characters.frames.map((f, i) => [f, i]));
const MOUTH_MS = 110;
const BG_FADE_MS = 800;
const KEN_BURNS_MS = 18000;

export function getSequenceStart(name) {
  const id = story.sequences[name];
  if (id === undefined) throw new Error(`Нет последовательности диалога: ${name}`);
  return id;
}

/** Реплики последовательности по порядку. */
export function getSequenceLines(name) {
  const lines = [];
  let id = getSequenceStart(name);
  while (id !== null) {
    const line = byId.get(id);
    lines.push(line);
    id = line.next;
  }
  return lines;
}

/**
 * Временные фоны — пока для сцены нет своего (data/story-backgrounds.json → fallback).
 * Свой фон — пиксельная картинка story_<ключ>, её собирает npm run art.
 */
const FALLBACKS = {
  black: (scene, c) =>
    c.add(scene.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000).setOrigin(0)),
  // Гараж деда: машина под чехлом в свете лампы.
  garage_cover: (scene, c) => c.add(scene.add.image(0, 0, 'bg_menu').setOrigin(0)),
  // Тот же гараж общим планом.
  garage_room: (scene, c) => c.add(scene.add.image(0, 0, 'bg_garage').setOrigin(0)),
  // Верстак со стеллажом крупнее — здесь лежит записка.
  workbench: (scene, c) => {
    c.add(scene.add.image(0, 0, 'bg_garage').setOrigin(0).setScale(1.8));
    c.add(scene.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.25).setOrigin(0));
  },
};

/** Текстуры частиц атмосферы — один раз на игру. */
function ensureFxTextures(scene) {
  if (scene.textures.exists('fx_snow')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
  g.generateTexture('fx_snow', 2, 2);
  g.clear().fillStyle(0xffffff, 1).fillRect(0, 0, 1, 1);
  g.generateTexture('fx_dust', 1, 1);
  g.destroy();
}

/**
 * Снег или пыль поверх фона; эмиттер живёт в контейнере фона и исчезает вместе с ним.
 * Второй аргумент — полоса по горизонтали в координатах мира (ambienceArea фона), например
 * проём ворот, если снаружи идёт снег, а камера в гараже.
 */
const AMBIENCE = {
  snow: (scene, [x0, x1] = [-60, WORLD.width + 20]) =>
    scene.add.particles(0, -6, 'fx_snow', {
      x: { min: x0, max: x1 },
      lifespan: 11000,
      speedY: { min: 14, max: 34 },
      speedX: { min: 2, max: 14 },
      scale: { min: 0.75, max: 1.5 },
      alpha: { min: 0.35, max: 0.85 },
      frequency: 32,
    }),
  dust: (scene, [x0, x1] = [120, 520]) =>
    scene.add.particles(0, 0, 'fx_dust', {
      x: { min: x0, max: x1 },
      y: { min: 30, max: 300 },
      lifespan: { min: 5000, max: 9000 },
      speedX: { min: -4, max: 4 },
      speedY: { min: -3, max: 2 },
      tint: 0xffe2b0,
      blendMode: 'ADD',
      alpha: { onEmit: () => 0, onUpdate: (p, k, t) => Math.sin(t * Math.PI) * 0.75 },
      frequency: 140,
    }),
};

export class StoryStage {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.layer = createLayer(scene);
    this.layer.classList.add('story-layer');
    this.line = null;
    this.bgKey = undefined;
    this.panDir = 1;
    this.cast = { left: null, right: null };
    this.actors = { left: null, right: null };
    this.timers = [];
    this.resolve = null;

    this.$shade = el('div', { class: 'ui-abs story__shade' });
    this.$actors = el('div', { class: 'ui-abs story__actors' });
    this.$box = el('div', { class: 'ui-abs story__box' });
    this.$center = el('div', { class: 'ui-abs story__center' });
    this.$controls = el('div', { class: 'ui-abs story__controls' });
    // Записка деда: сложенный листок на верстаке — игрок сам его разворачивает.
    this.$note = el('div', { class: 'ui-abs story-note', hidden: true });
    this.$note.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.advance();
    });
    this.note = null;
    this.layer.append(
      this.$shade,
      this.$actors,
      this.$box,
      this.$center,
      this.$note,
      this.$controls,
    );

    this.onPointer = () => this.advance();
    this.onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        this.advance();
      }
    };
    this.$box.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.advance();
    });
    scene.input.on('pointerdown', this.onPointer);
    window.addEventListener('keydown', this.onKey);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /** Кнопка управления в правом верхнем углу сцены (например, «Пропустить»). */
  addControl(node) {
    this.$controls.append(node);
    return node;
  }

  /** Проигрывает последовательность; промис завершается после последней реплики. */
  play(sequenceName) {
    this.finish(false);
    this.layer.classList.add('is-open');
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.#show(getSequenceStart(sequenceName));
    });
  }

  advance() {
    if (!this.line) return;
    if (this.note) return this.#advanceNote();
    if (this.typing) {
      this.#completeTyping();
      return;
    }
    if (this.line.kind === 'date') return; // дата сменяется сама
    const next = this.line.next;
    if (next === null) this.finish();
    else this.#show(next);
  }

  /** Немедленно закрывает историю (кнопка «Пропустить»). */
  finish(callResolve = true) {
    this.#stopTyping();
    this.holdTimer?.remove();
    this.line = null;
    this.note = null;
    this.$note.hidden = true;
    this.layer.classList.remove('is-open');
    for (const side of ['left', 'right']) this.#setActor(side, null);
    // После истории — снова атмосфера самой сцены.
    if (this.bgKey !== undefined) audio.playAmbience(this.scene.ambience ?? null);
    this.bg?.destroy();
    this.bg = null;
    this.bgKey = undefined;
    clear(this.$box);
    clear(this.$center);
    this.boxLook = null;
    const r = this.resolve;
    this.resolve = null;
    if (callResolve) r?.();
  }

  destroy() {
    this.finish(false);
    for (const t of this.timers) clearInterval(t);
    this.scene.input?.off('pointerdown', this.onPointer);
    window.removeEventListener('keydown', this.onKey);
    this.layer.remove();
  }

  // ---------- Реплика ----------

  #show(id) {
    const line = byId.get(id);
    if (!line) throw new Error(`Нет реплики ${id}`);
    this.line = line;
    if (line.kind === 'note') return this.#openNoteGroup(line);
    audio.playSfx(SFX.DLG_NEXT, { volume: 0.6 });
    if (line.sfx) audio.playSfx(line.sfx);
    if (line.bg !== undefined) this.#setBackground(line.bg);
    if (line.cast) {
      for (const side of ['left', 'right']) {
        if (side in line.cast) this.#setActor(side, line.cast[side]);
      }
    }
    this.#focus(line.who);
    this.layer.dataset.kind = line.kind;
    this.#layout(line);
    this.#startTyping();
  }

  // ---------- Записка ----------

  /**
   * Подряд идущие реплики-записки — один листок. Сначала он лежит сложенным на верстаке
   * (фон остаётся прежним), по клику разворачивается; каждый следующий клик дописывает
   * строку почерком деда, после последней листок складывается и история идёт дальше.
   */
  #openNoteGroup(first) {
    const lines = [];
    for (let l = first; l && l.kind === 'note'; l = byId.get(l.next)) lines.push(l);
    this.note = { lines, shown: 0, phase: 'folded' };
    this.#stopTyping();
    clear(this.$box);
    this.$box.className = 'ui-abs story__box is-hidden';
    this.layer.dataset.kind = 'note';
    this.layer.classList.add('is-done');
    this.$note.className = 'ui-abs story-note is-folded';
    this.$note.hidden = false;
    clear(this.$note).append(
      el('div', { class: 'story-note__folded', 'aria-label': t('story.noteOpen') }, [
        el('span', { class: 'story-note__seal', text: t('story.noteFrom') }),
      ]),
      el('div', { class: 'story-note__hint', text: t('story.noteOpen') }),
    );
    audio.playSfx(SFX.NOTE_APPEAR, { volume: 0.7 });
  }

  #advanceNote() {
    const n = this.note;
    if (n.phase === 'folded') {
      n.phase = 'open';
      this.$note.className = 'ui-abs story-note is-open';
      this.$paper = el('div', { class: 'story-note__paper' });
      clear(this.$note).append(
        this.$paper,
        el('div', { class: 'story-note__hint', text: t('story.noteNext') }),
      );
      audio.playSfx(SFX.NOTE_UNFOLD);
      this.#noteLine();
      return;
    }
    if (n.phase === 'open' && n.shown < n.lines.length) return this.#noteLine();
    if (n.phase === 'open') {
      n.phase = 'closing';
      this.$note.classList.add('is-closing');
      audio.playSfx(SFX.NOTE_FOLD);
      const next = n.lines[n.lines.length - 1].next;
      this.scene.time.delayedCall(420, () => {
        this.note = null;
        this.$note.hidden = true;
        if (next === null) this.finish();
        else this.#show(next);
      });
    }
  }

  #noteLine() {
    const n = this.note;
    const line = n.lines[n.shown];
    n.shown += 1;
    this.line = line;
    if (line.cast)
      for (const side of ['left', 'right'])
        if (side in line.cast) this.#setActor(side, line.cast[side]);
    this.$paper.append(el('p', { class: 'story-note__line', text: line.text }));
    this.$note.classList.toggle('is-last', n.shown >= n.lines.length);
    audio.playSfx(SFX.NOTE_WRITE, { volume: 0.6 });
  }

  #layout(line) {
    clear(this.$box);
    clear(this.$center);
    this.$text = el('div', { class: 'story__text' });
    if (line.kind === 'date' || line.kind === 'caption') {
      this.$center.append(el('div', { class: `story__${line.kind}` }, this.$text));
      return;
    }
    const speaker = story.speakers[line.who];
    const side = this.#sideOf(line.who) ?? 'left';
    const look = `${side}:${line.kind}`;
    this.$box.className = `ui-abs story__box story__box--${side}${line.kind === 'note' ? ' is-note' : ''}`;
    if (look !== this.boxLook) {
      // Другой говорящий или вид реплики — окно въезжает заново.
      this.$box.style.animation = 'none';
      void this.$box.offsetWidth;
      this.$box.style.animation = '';
      this.boxLook = look;
    }
    this.$box.append(
      el('div', {
        class: 'story__name',
        text: line.kind === 'note' ? (speaker.noteTitle ?? speaker.name) : speaker.name,
      }),
      this.$text,
      el('div', { class: 'story__next', 'aria-hidden': 'true' }),
    );
  }

  // ---------- Фон ----------

  /** Как нарисовать фон: своя картинка, иначе временный фон, иначе null — поверх сцены. */
  #resolveBackground(key) {
    if (key === null) return null;
    const own = `story_${key}`;
    if (this.scene.textures.exists(own)) {
      return (scene, c) => c.add(scene.add.image(0, 0, own).setOrigin(0));
    }
    const def = storyBackgrounds.backgrounds[key];
    if (!def) throw new Error(`Нет фона истории: ${key}`);
    return def.fallback === null ? null : FALLBACKS[def.fallback];
  }

  #setBackground(key) {
    if (key === this.bgKey) return;
    this.bgKey = key;
    // Атмосфера фона (птицы, ветер, гул лампы) — из data/story-backgrounds.json.
    const sound = storyBackgrounds.backgrounds[key]?.sound;
    if (sound) audio.playAmbience(sound);
    const old = this.bg;
    const draw = this.#resolveBackground(key);
    if (draw === null) {
      // Без своего фона: разговор поверх сцены, сцена приглушена.
      this.bg = null;
      this.$shade.classList.add('is-on');
    } else {
      this.$shade.classList.remove('is-on');
      const c = this.scene.add.container(0, 0).setDepth(900).setAlpha(0);
      const art = this.scene.add.container(0, 0);
      draw(this.scene, art);
      c.add(art);
      const { ambience, ambienceArea } = storyBackgrounds.backgrounds[key] ?? {};
      if (ambience) {
        ensureFxTextures(this.scene);
        const fx = AMBIENCE[ambience](this.scene, ambienceArea);
        fx.fastForward(8000); // снег уже идёт, а не начинается с верхнего края
        c.add(fx);
      }
      this.bg = c;
      this.scene.tweens.add({ targets: c, alpha: 1, duration: BG_FADE_MS, ease: 'Sine.easeOut' });
      // Камера медленно наезжает и едет вбок — каждый новый фон в другую сторону.
      const dir = (this.panDir = -this.panDir);
      const pan = { t: 0 };
      const place = () => {
        const scale = 1.08 - 0.05 * pan.t;
        const drift = (pan.t - 0.5) * 0.04 * dir;
        art.setScale(scale);
        art.x = -((scale - 1) * WORLD.width) / 2 + drift * WORLD.width;
        art.y = -((scale - 1) * WORLD.height) / 2;
      };
      place();
      this.scene.tweens.add({
        targets: pan,
        t: 1,
        duration: KEN_BURNS_MS,
        ease: 'Sine.easeOut',
        onUpdate: place,
      });
    }
    if (old) {
      this.scene.tweens.add({
        targets: old,
        alpha: 0,
        duration: BG_FADE_MS,
        delay: draw === null ? 0 : BG_FADE_MS / 2,
        onComplete: () => old.destroy(),
      });
    }
  }

  // ---------- Персонажи ----------

  #sideOf(who) {
    if (this.cast.left === who) return 'left';
    if (this.cast.right === who) return 'right';
    return null;
  }

  #setActor(side, id) {
    if (this.cast[side] === id) return;
    const prev = this.actors[side];
    if (prev) {
      prev.root.classList.add('is-leaving');
      clearInterval(prev.blink);
      setTimeout(() => prev.root.remove(), 400);
    }
    this.cast[side] = id;
    this.actors[side] = null;
    if (!id) return;

    const sprite = el('div', {
      class: 'story__sprite',
      style: { backgroundImage: `url(assets/images/characters/${id}.png)` },
    });
    const isPhoto = story.speakers[id]?.photo === true;
    // Корень — выход на сцену, тело — фокус говорящего, спрайт — дыхание.
    const body = el(
      'div',
      { class: 'story__body' },
      isPhoto ? el('div', { class: 'story__photo' }, sprite) : sprite,
    );
    const root = el(
      'div',
      { class: `story__actor story__actor--${side}${isPhoto ? ' is-photo' : ''}` },
      body,
    );
    this.$actors.append(root);
    // Выход на сцену: со своей стороны, после кадра — чтобы сработал переход.
    requestAnimationFrame(() => root.classList.add('is-in'));
    const actor = { id, root, sprite, frame: FRAME.idle };
    // Моргание раз в несколько секунд.
    actor.blink = setInterval(
      () => {
        if (actor.talking) return;
        this.#frame(actor, FRAME.blink);
        setTimeout(() => !actor.talking && this.#frame(actor, FRAME.idle), 130);
      },
      2800 + Math.random() * 2400,
    );
    this.timers.push(actor.blink);
    this.actors[side] = actor;
  }

  #focus(who) {
    for (const side of ['left', 'right']) {
      const a = this.actors[side];
      if (!a) continue;
      const speaking = a.id === who;
      if (speaking && !a.root.classList.contains('is-speaking')) this.#hop(a);
      a.root.classList.toggle('is-speaking', speaking);
      a.root.classList.toggle('is-listening', !speaking);
    }
  }

  /** Короткий подскок — персонаж вступил в разговор. */
  #hop(actor) {
    if (!actor.root.classList.contains('is-in')) return; // только что вышел — ему хватит выхода
    const body = actor.root.firstChild;
    body.classList.remove('is-hop');
    void body.offsetWidth; // перезапуск анимации
    body.classList.add('is-hop');
  }

  #frame(actor, index) {
    actor.frame = index;
    actor.sprite.style.backgroundPositionX = `${(index / (characters.frames.length - 1)) * 100}%`;
  }

  #speaker() {
    const side = this.#sideOf(this.line?.who);
    return side ? this.actors[side] : null;
  }

  // ---------- Печать ----------

  #startTyping() {
    this.typing = true;
    this.shown = 0;
    this.layer.classList.remove('is-done');
    const actor = this.#speaker();
    if (actor && this.line.kind === 'speech') {
      actor.talking = true;
      actor.root.classList.add('is-talking');
      let open = false;
      this.mouth = setInterval(() => {
        open = !open;
        this.#frame(actor, open ? FRAME.talk : FRAME.idle);
      }, MOUTH_MS);
    }
    // Скорость печати — из настроек; «Сразу» — реплика появляется целиком.
    const delay = charDelayMs();
    if (!delay) {
      this.#completeTyping();
      return;
    }
    this.timer = this.scene.time.addEvent({
      delay,
      loop: true,
      callback: () => {
        this.shown += 1;
        this.$text.textContent = this.line.text.slice(0, this.shown);
        if (this.shown % cfg.clickEveryChars === 0) audio.playSfx(SFX.TYPE, { volume: 0.5 });
        if (this.shown >= this.line.text.length) this.#completeTyping();
      },
    });
  }

  #stopTyping() {
    this.timer?.remove();
    this.timer = null;
    clearInterval(this.mouth);
    this.mouth = null;
    for (const a of Object.values(this.actors)) {
      if (!a) continue;
      a.talking = false;
      a.root.classList.remove('is-talking');
      this.#frame(a, FRAME.idle);
    }
    this.typing = false;
  }

  #completeTyping() {
    this.#stopTyping();
    this.$text.textContent = this.line.text;
    this.layer.classList.add('is-done');
    if (this.line.kind === 'date') {
      this.holdTimer = this.scene.time.delayedCall(cfg.dateHoldMs, () => this.#afterDate());
    }
  }

  #afterDate() {
    const next = this.line?.next ?? null;
    if (next === null) this.finish();
    else this.#show(next);
  }
}
