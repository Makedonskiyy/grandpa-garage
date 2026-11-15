import Phaser from 'phaser';
import config from '../../data/config.json';
import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, SFX, FONT_FAMILY } from '../config/constants.js';
import { buildCar, buildRivalCar, spinWheels } from '../systems/buildCar.js';
import { evaluateRace, getTest, raceTelemetry, formatSeconds } from '../systems/simulate.js';
import { DialogSystem } from '../systems/DialogSystem.js';
import { audio } from '../systems/AudioManager.js';
import { gameState, recordResult } from '../gameState.js';
import { el } from '../ui/dom.js';
import { t } from '../systems/strings.js';

const cfg = config.race;

/**
 * Заезд с Палычем (ТЗ 3.9): ночной пустырь, две машины, «ёлка» (3 жёлтых через 0,6 с → зелёный),
 * приборы: тахометр, секундомер, спидометр. Время и ускорение посчитаны до старта (ТЗ 4.4).
 */
export class RaceScene extends BaseScene {
  constructor() {
    super(SCENES.RACE);
  }

  async create() {
    this.enter();
    audio.playMusic(MUSIC.DRIVE);

    this.test = getTest('race');
    this.result = evaluateRace(gameState.build);
    this.state = 'intro';
    this.s = 0;

    this.#drawNight();
    this.player = buildCar(this, gameState.build, gameState.cosmetics, {
      x: cfg.trackStartX,
      y: cfg.playerLaneY,
      scale: 0.5,
      night: true,
    });
    this.rival = buildRivalCar(this, {
      x: cfg.trackStartX,
      y: cfg.rivalLaneY,
      scale: 0.5,
      night: true,
    });
    this.#nameplate(this.player, t('race.you'));
    this.#nameplate(this.rival, t('race.rival'));
    this.tree = this.#drawTree();

    this.$rpm = el('div', { class: 'gauge__value', text: '0' });
    this.$time = el('div', { class: 'gauge__value', text: '0,00' });
    this.$speed = el('div', { class: 'gauge__value', text: '0' });
    this.$hud = el('div', { class: 'ui-abs gauges' }, [
      el('div', { class: 'panel gauge' }, [
        this.$rpm,
        el('div', { class: 'muted', text: t('race.tacho') }),
      ]),
      el('div', { class: 'panel gauge' }, [
        this.$time,
        el('div', { class: 'muted', text: t('race.timer') }),
      ]),
      el('div', { class: 'panel gauge' }, [
        this.$speed,
        el('div', { class: 'muted', text: t('race.speedo') }),
      ]),
    ]);
    this.ui.append(this.$hud);

    this.engine = audio.loopSfx(SFX.ENGINE);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.engine?.destroy());

    this.$hud.style.visibility = 'hidden';
    await new DialogSystem(this).play('preRace');
    this.$hud.style.visibility = '';
    this.#runTree();
  }

  #drawNight() {
    const { width, height } = this.scale;
    const g = this.add.graphics();
    g.fillStyle(0x0b0d18).fillRect(0, 0, width, height);
    g.fillStyle(0x161a26).fillRect(0, 150, width, 30);
    g.fillStyle(0x1f2230).fillRect(0, 180, width, height - 180);
    g.fillStyle(0xd8d0bc).fillRect(cfg.trackStartX + 50, 180, 3, 140);
    g.fillStyle(0xffffff).fillRect(cfg.trackFinishX + 50, 180, 4, 140);
    const spot = this.add.ellipse(width / 2, 260, 420, 160, 0xfff2c0, 0.06);
    spot.setBlendMode(Phaser.BlendModes.ADD);
  }

  #nameplate(car, name) {
    const label = this.add
      .text(car.x, car.y - 46, name, { fontFamily: FONT_FAMILY, fontSize: '6px', color: '#e6b34a' })
      .setOrigin(0.5);
    car.nameplate = label;
  }

  #drawTree() {
    const x = this.scale.width - 24;
    this.add.rectangle(x, 120, 18, 100, 0x111111).setStrokeStyle(1, 0x444444);
    const ambers = [];
    for (let i = 0; i < this.test.christmasTree.ambers; i++) {
      ambers.push(this.add.circle(x, 84 + i * 20, 6, 0x3a2f10));
    }
    const green = this.add.circle(x, 84 + ambers.length * 20, 6, 0x10301a);
    return { ambers, green };
  }

  #runTree() {
    const step = this.test.christmasTree.intervalSec * 1000;
    this.tree.ambers.forEach((lamp, i) => {
      this.time.delayedCall(step * (i + 1), () => {
        lamp.setFillStyle(0xffc21a);
        audio.playSfx(SFX.TREE_BEEP);
      });
    });
    this.time.delayedCall(step * (this.tree.ambers.length + 1), () => {
      this.tree.green.setFillStyle(0x2fff6a);
      audio.playSfx(SFX.TREE_GO);
      this.state = 'running';
    });
  }

  #xFor(distance) {
    const { distance: total } = this.test.formula;
    return (
      cfg.trackStartX + (Math.min(distance, total) / total) * (cfg.trackFinishX - cfg.trackStartX)
    );
  }

  update(_time, delta) {
    if (this.state !== 'running') return;
    this.s += delta / 1000;

    const me = raceTelemetry(this.result.details.accel, this.s);
    const rival = raceTelemetry(this.result.details.rivalAccel, this.s);
    const brokenStop = !this.result.ok && this.result.reasonKey === 'broken';

    for (const [car, tel] of [
      [this.player, me],
      [this.rival, rival],
    ]) {
      const x = this.#xFor(
        brokenStop && car === this.player ? Math.min(tel.distance, 200) : tel.distance,
      );
      spinWheels(car, x - car.x);
      car.x = x;
      car.nameplate.x = x;
    }

    this.$rpm.textContent = String(Math.round(me.rpm / 10) * 10);
    this.$speed.textContent = String(Math.round(me.speedKmh));
    this.$time.textContent = formatSeconds(Math.min(this.s, me.finishTime));
    this.engine?.setRate?.(0.7 + (me.rpm / this.test.gauges.redlineRpm) * 0.8);

    if (me.finished && rival.finished) this.#finish();
  }

  #finish() {
    this.state = 'finished';
    this.engine?.stop();
    this.cameras.main.flash(250, 255, 255, 255);
    this.$time.textContent = formatSeconds(this.result.details.time);
    audio.playSfx(this.result.ok ? SFX.SUCCESS : SFX.FAIL);
    this.time.delayedCall(cfg.finishHoldMs, () => {
      recordResult('race', this.result);
      this.goTo(SCENES.RESULT);
    });
  }
}
