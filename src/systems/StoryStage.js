/**
 * StoryStage — сцены истории как в визуальной новелле (ТЗ 3.5, 7.5).
 *
 * Что на экране:
 *   • фон истории (Phaser) — сменяется плавно, медленно «дышит» камерой;
 *     у реплик без фона остаётся сцена, поверх которой идёт разговор (гараж, заезд);
 *   • персонажи (HTML) — слева и справа, по пояс; говорящий ярче и ближе, второй приглушён;
 *     выход на сцену, дыхание, моргание, рот двигается, пока печатается реплика;
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
import { createLayer } from '../ui/overlay.js';
import { el, clear } from '../ui/dom.js';

const cfg = config.dialog;
const byId = new Map(story.lines.map((l) => [l.id, l]));
const FRAME = Object.fromEntries(characters.frames.map((f, i) => [f, i]));
const MOUTH_MS = 110;
const BG_FADE_MS = 500;

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

export class StoryStage {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.layer = createLayer(scene);
    this.layer.classList.add('story-layer');
    this.line = null;
    this.bgKey = undefined;
    this.cast = { left: null, right: null };
    this.actors = { left: null, right: null };
    this.timers = [];
    this.resolve = null;

    this.$shade = el('div', { class: 'ui-abs story__shade' });
    this.$actors = el('div', { class: 'ui-abs story__actors' });
    this.$box = el('div', { class: 'ui-abs story__box' });
    this.$center = el('div', { class: 'ui-abs story__center' });
    this.$controls = el('div', { class: 'ui-abs story__controls' });
    this.layer.append(this.$shade, this.$actors, this.$box, this.$center, this.$controls);

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
    this.layer.classList.remove('is-open');
    for (const side of ['left', 'right']) this.#setActor(side, null);
    this.bg?.destroy();
    this.bg = null;
    this.bgKey = undefined;
    clear(this.$box);
    clear(this.$center);
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
    this.$box.className = `ui-abs story__box story__box--${side}${line.kind === 'note' ? ' is-note' : ''}`;
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
    const old = this.bg;
    const draw = this.#resolveBackground(key);
    if (draw === null) {
      // Без своего фона: разговор поверх сцены, сцена приглушена.
      this.bg = null;
      this.$shade.classList.add('is-on');
    } else {
      this.$shade.classList.remove('is-on');
      const c = this.scene.add.container(0, 0).setDepth(900).setAlpha(0);
      draw(this.scene, c);
      this.bg = c;
      this.scene.tweens.add({ targets: c, alpha: 1, duration: BG_FADE_MS, ease: 'Sine.easeOut' });
      // Медленный наезд камеры по фону — сцена живёт, пока идут реплики.
      c.setScale(1);
      this.scene.tweens.add({
        targets: c,
        scale: 1.04,
        x: -WORLD.width * 0.02,
        y: -WORLD.height * 0.02,
        duration: 14000,
        ease: 'Sine.easeInOut',
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
      a.root.classList.toggle('is-speaking', a.id === who);
      a.root.classList.toggle('is-listening', a.id !== who);
    }
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
      let open = false;
      this.mouth = setInterval(() => {
        open = !open;
        this.#frame(actor, open ? FRAME.talk : FRAME.idle);
      }, MOUTH_MS);
    }
    this.timer = this.scene.time.addEvent({
      delay: 1000 / cfg.charsPerSecond,
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
