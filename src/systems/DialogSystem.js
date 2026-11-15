/**
 * DialogSystem — диалоговое окно (ТЗ 3.5, 7.5).
 * Читает story.json, печатает текст по буквам (~30 зн/с) со «щелчком» на каждые две буквы.
 * Клик / Пробел / Enter: первое нажатие допечатывает реплику, второе — следующая реплика.
 *
 * Виды реплик (поле kind):
 *   speech  — рамка внизу, портрет 64×64 слева, имя говорящего;
 *   note    — записка деда отдельным листком по центру;
 *   date    — текст на чёрном экране, держится и сменяется сам;
 *   caption — надпись по центру без портрета.
 */
import Phaser from 'phaser';
import story from '../../data/story.json';
import config from '../../data/config.json';
import { FONT_FAMILY, SFX } from '../config/constants.js';
import { audio } from './AudioManager.js';

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

const COLORS = {
  frame: 0xe8d9b0,
  frameShadow: 0x5a4a2a,
  fill: 0x15141a,
  paper: 0xefe4c4,
  ink: '#2b2418',
  text: '#f2ead6',
  name: '#e6b34a',
};

export class DialogSystem {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ depth?: number }} [opts]
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.depth = opts.depth ?? 1000;
    this.container = scene.add.container(0, 0).setDepth(this.depth).setVisible(false);
    this.line = null;
    this.shown = 0;
    this.typing = false;
    this.timer = null;
    this.resolve = null;
    this.holdTimer = null;

    this.#bindInput();
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
    this.container.removeAll(true).setVisible(false);
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
    this.scene.input?.keyboard?.off('keydown', this.onKey);
    this.container.destroy();
  }

  #bindInput() {
    this.onPointer = () => this.advance();
    this.onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') this.advance();
    };
    this.scene.input.on('pointerdown', this.onPointer);
    this.scene.input.keyboard?.on('keydown', this.onKey);
  }

  #next() {
    const nextId = this.line?.next ?? null;
    if (nextId === null) this.finish();
    else this.#show(nextId);
  }

  #show(id) {
    const line = byId.get(id);
    if (!line) throw new Error(`Нет реплики ${id}`);
    this.line = line;
    this.shown = 0;
    this.container.removeAll(true).setVisible(true);
    this.textObj = this.#layout(line);
    this.#startTyping();
  }

  #layout(line) {
    const { width, height } = this.scene.scale;
    const speaker = story.speakers[line.who];

    if (line.kind === 'date' || line.kind === 'caption') {
      if (line.kind === 'date') {
        this.container.add(this.scene.add.rectangle(0, 0, width, height, 0x000000).setOrigin(0));
      }
      const text = this.scene.add
        .text(width / 2, height / 2, '', {
          fontFamily: FONT_FAMILY,
          fontSize: '10px',
          color: COLORS.text,
          align: 'center',
          wordWrap: { width: width - 80 },
          lineSpacing: 6,
        })
        .setOrigin(0.5);
      this.container.add(text);
      return text;
    }

    if (line.kind === 'note') {
      const w = 360;
      const h = 150;
      const x = (width - w) / 2;
      const y = 50;
      const g = this.scene.add.graphics();
      g.fillStyle(0x000000, 0.35).fillRect(x + 4, y + 4, w, h);
      g.fillStyle(COLORS.paper, 1).fillRect(x, y, w, h);
      g.lineStyle(1, 0xc9b98f, 1);
      for (let ly = y + 30; ly < y + h - 10; ly += 18) g.lineBetween(x + 12, ly, x + w - 12, ly);
      this.container.add(g);
      const text = this.scene.add.text(x + 20, y + 20, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '10px',
        color: COLORS.ink,
        wordWrap: { width: w - 40 },
        lineSpacing: 8,
      });
      this.container.add(text);
      return text;
    }

    // speech
    const { x, y, width: w, height: h, portraitSize: p } = cfg.box;
    const g = this.scene.add.graphics();
    g.fillStyle(COLORS.frameShadow, 1).fillRect(x, y, w, h);
    g.fillStyle(COLORS.frame, 1).fillRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle(COLORS.fill, 0.96).fillRect(x + 3, y + 3, w - 6, h - 6);
    this.container.add(g);

    const px = x + 14;
    const py = y + (h - p) / 2;
    if (speaker.portrait && this.scene.textures.exists(speaker.portrait)) {
      this.container.add(this.scene.add.image(px, py, speaker.portrait).setOrigin(0));
    } else {
      // Заглушка портрета, пока нет арта: силуэт с первой буквой имени (ТЗ 6.3 запасной вариант).
      this.container.add(this.scene.add.rectangle(px, py, p, p, 0x2e2c36).setOrigin(0));
      this.container.add(
        this.scene.add
          .text(px + p / 2, py + p / 2, speaker.name.charAt(0), {
            fontFamily: FONT_FAMILY,
            fontSize: '24px',
            color: COLORS.name,
          })
          .setOrigin(0.5),
      );
    }

    const tx = px + p + 14;
    this.container.add(
      this.scene.add.text(tx, y + 12, speaker.name, {
        fontFamily: FONT_FAMILY,
        fontSize: '8px',
        color: COLORS.name,
      }),
    );
    const text = this.scene.add.text(tx, y + 30, '', {
      fontFamily: FONT_FAMILY,
      fontSize: '8px',
      color: COLORS.text,
      wordWrap: { width: x + w - tx - 14 },
      lineSpacing: 8,
    });
    this.container.add(text);
    return text;
  }

  #startTyping() {
    this.typing = true;
    this.timer = this.scene.time.addEvent({
      delay: 1000 / cfg.charsPerSecond,
      loop: true,
      callback: () => {
        this.shown += 1;
        this.textObj.setText(this.line.text.slice(0, this.shown));
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
    this.textObj.setText(this.line.text);
    if (this.line.kind === 'date') {
      this.holdTimer = this.scene.time.delayedCall(cfg.dateHoldMs, () => this.#next());
    }
  }
}
