/**
 * DialogSystem — диалоговое окно (ТЗ 3.5, 7.5) в веб-стиле интерфейса.
 * Читает story.json, печатает текст по буквам (~30 зн/с) со «щелчком» на каждые две буквы.
 * Клик / Пробел / Enter: первое нажатие допечатывает реплику, второе — следующая реплика.
 *
 * Виды реплик (поле kind):
 *   speech  — панель внизу ~592×96: портрет 64×64 слева, имя, текст;
 *   note    — записка деда листком бумаги, почерк Caveat;
 *   date    — текст на чёрном экране, держится и сменяется сам;
 *   caption — надпись по центру на затемнении.
 *
 * Окно живёт в собственном HTML-слое поверх интерфейса сцены. Слой пропускает клики,
 * поэтому кнопки сцены («Пропустить») остаются доступны.
 */
import Phaser from 'phaser';
import story from '../../data/story.json';
import config from '../../data/config.json';
import { SFX } from '../config/constants.js';
import { audio } from './AudioManager.js';
import { createLayer } from '../ui/overlay.js';
import { el, clear } from '../ui/dom.js';

const cfg = config.dialog;
const byId = new Map(story.lines.map((l) => [l.id, l]));

export function getSequenceStart(name) {
  const id = story.sequences[name];
  if (id === undefined) throw new Error(`Нет последовательности диалога: ${name}`);
  return id;
}

/** Реплики последовательности по порядку (удобно для тестов и пропуска). */
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

export class DialogSystem {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.layer = createLayer(scene);
    this.layer.classList.add('dialog-layer');
    this.line = null;
    this.shown = 0;
    this.typing = false;
    this.timer = null;
    this.holdTimer = null;
    this.resolve = null;

    this.onPointer = () => this.advance();
    this.onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        this.advance();
      }
    };
    scene.input.on('pointerdown', this.onPointer);
    window.addEventListener('keydown', this.onKey);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /** Проигрывает последовательность из story.sequences; промис завершается после последней реплики. */
  play(sequenceName) {
    this.finish(false);
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.#show(getSequenceStart(sequenceName));
    });
  }

  /** Обработчик клика/клавиши. */
  advance() {
    if (!this.line) return;
    if (this.typing) {
      this.#completeTyping();
      return;
    }
    if (this.line.kind === 'date') return; // дата сменяется сама
    this.#next();
  }

  /** Немедленно закрывает диалог (кнопка «Пропустить»). */
  finish(callResolve = true) {
    this.timer?.remove();
    this.holdTimer?.remove();
    this.timer = null;
    this.holdTimer = null;
    this.line = null;
    this.typing = false;
    clear(this.layer);
    const r = this.resolve;
    this.resolve = null;
    if (callResolve) r?.();
  }

  get isActive() {
    return this.line !== null;
  }

  destroy() {
    this.finish(false);
    this.scene.input?.off('pointerdown', this.onPointer);
    window.removeEventListener('keydown', this.onKey);
    this.layer.remove();
  }

  #next() {
    const nextId = this.line?.next ?? null;
    if (nextId === null) this.finish();
    else this.#show(nextId);
  }

  #show(id) {
    const line = byId.get(id);
    if (!line) throw new Error(`Нет реплики ${id}`);
    const sameKind = this.line?.kind === line.kind && this.line?.who === line.who;
    this.line = line;
    this.shown = 0;
    clear(this.layer);
    this.$text = this.#layout(line, sameKind);
    this.#startTyping();
  }

  #layout(line, sameKind) {
    const speaker = story.speakers[line.who];
    const $text = el('div', { class: 'dlg__text' });
    // Анимация появления — только когда меняется вид окна или говорящий.
    const enter = sameKind ? '' : ' dlg--enter';

    if (line.kind === 'date') {
      this.layer.append(el('div', { class: `ui-abs dlg-date${enter}` }, $text));
    } else if (line.kind === 'caption') {
      this.layer.append(el('div', { class: `ui-abs dlg-caption${enter}` }, $text));
    } else if (line.kind === 'note') {
      this.layer.append(
        el('div', { class: `ui-abs dlg-note${enter}` }, [
          el('div', { class: 'dlg-note__sheet' }, [$text, this.#hint()]),
        ]),
      );
    } else {
      this.layer.append(
        el('div', { class: `ui-abs dlg${enter}`, onclick: () => this.advance() }, [
          this.#portrait(speaker),
          el('div', { class: 'dlg__body' }, [
            el('div', { class: 'dlg__name', text: speaker.name }),
            $text,
          ]),
          this.#hint(),
        ]),
      );
    }
    return $text;
  }

  /** Портрет 64×64: пиксельный арт из assets/images/portraits, пока его нет — инициал. */
  #portrait(speaker) {
    const box = el('div', { class: 'dlg__portrait' });
    if (speaker.portrait && this.scene.textures.exists(speaker.portrait)) {
      const src = this.scene.textures.get(speaker.portrait).getSourceImage().src;
      box.append(el('img', { src, alt: speaker.name }));
    } else {
      box.append(el('span', { text: speaker.name.charAt(0) }));
    }
    return box;
  }

  /** Маленький значок «дальше» — виден, когда реплика допечатана. */
  #hint() {
    return el('div', { class: 'dlg__next', 'aria-hidden': 'true' });
  }

  #startTyping() {
    this.typing = true;
    this.layer.classList.remove('dialog-layer--done');
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

  #completeTyping() {
    this.timer?.remove();
    this.timer = null;
    this.typing = false;
    this.shown = this.line.text.length;
    this.$text.textContent = this.line.text;
    this.layer.classList.add('dialog-layer--done');
    if (this.line.kind === 'date') {
      this.holdTimer = this.scene.time.delayedCall(cfg.dateHoldMs, () => this.#next());
    }
  }
}
