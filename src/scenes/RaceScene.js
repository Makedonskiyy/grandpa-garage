import Phaser from 'phaser';
import config from '../../data/config.json';
import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, SFX, WORLD } from '../config/constants.js';
import { buildCar, buildRivalCar, spinWheels } from '../systems/buildCar.js';
import { evaluateRace, getTest, raceTelemetry, formatSeconds } from '../systems/simulate.js';
import { StoryStage } from '../systems/StoryStage.js';
import { audio } from '../systems/AudioManager.js';
import { getRenderZoom } from '../systems/scale.js';
import { gameState, recordResult } from '../gameState.js';
import { el } from '../ui/dom.js';
import { t } from '../systems/strings.js';
import { createGearbox, updateGearbox } from '../systems/autoGearbox.js';
import { PedalControls } from '../ui/PedalControls.js';
import { createTacho } from '../ui/tacho.js';

const cfg = config.race;

/** Детерминированный генератор: фон одинаков при каждом запуске. */
function rng(seed) {
  let v = seed;
  return () => (v = (v * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

/**
 * Заезд с Палычем (ТЗ 3.9): ночной пустырь за заводом, две машины, «ёлка» (3 жёлтых через 0,6 с →
 * зелёный), приборы: тахометр, секундомер, спидометр. Время и ускорение посчитаны до старта (ТЗ 4.4).
 * Позиции машин считаются по переднему бамперу: обе пересекают одну линию финиша.
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
    this.gearbox = createGearbox();
    this.tacho = createTacho();
    this.pedals = new PedalControls(this, { className: 'pedals--corner' });
    this.pedals.setEnabled(false);

    this.#drawNight();
    this.rival = buildRivalCar(this, { x: 0, y: cfg.rivalLaneY, scale: cfg.carScale, night: true });
    this.rival.front = cfg.rivalFront * cfg.carScale;
    this.rival.plateOffset = 72 * cfg.carScale; // над крышей «девятки»
    this.player = buildCar(this, gameState.build, gameState.cosmetics, {
      x: 0,
      y: cfg.playerLaneY,
      scale: cfg.carScale,
      night: true,
      dirty: gameState.car.dirty,
    });
    this.player.front = cfg.playerFront * cfg.carScale;
    this.player.plateOffset = 92 * cfg.carScale; // над крышей японки
    for (const car of [this.rival, this.player]) car.x = cfg.startX - car.front;
    this.#nameplate(this.player, t('race.you'));
    this.#nameplate(this.rival, t('race.rival'));
    this.tree = this.#drawTree();

    this.#buildHud();
    this.engine = audio.loopSfx(SFX.ENGINE);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.engine?.destroy());

    this.$hud.style.visibility = 'hidden';
    this.pedals.node.style.visibility = 'hidden';
    await new StoryStage(this).play('preRace');
    this.$hud.style.visibility = '';
    this.pedals.node.style.visibility = '';
    this.#runTree();
  }

  #buildHud() {
    this.$speed = el('span', { text: '0' });
    this.$time = el('div', { class: 'race-hud__value', text: '0,00' });
    this.$hud = el('div', { class: 'ui-abs surface race-hud' }, [
      this.tacho.node,
      el('div', { class: 'race-hud__time' }, [
        this.$time,
        el('div', { class: 'race-hud__label', text: t('race.timer') }),
      ]),
      el('div', { class: 'race-hud__gauge' }, [
        el('div', { class: 'race-hud__value' }, [
          this.$speed,
          el('span', { class: 'race-hud__unit', text: t('race.kmh') }),
        ]),
      ]),
    ]);
    this.ui.append(this.$hud, this.pedals.node);
    this.tacho.render({
      rpm: config.gearbox.idleRpm,
      gear: 1,
      redline: config.gearbox.redlineRpm,
    });
  }

  /** Ночной пустырь за заводом: небо, корпуса с окнами, прожектор, мокрый асфальт. */
  #drawNight() {
    const { width, height } = WORLD;
    const r = rng(41);
    const g = this.add.graphics();
    // Небо ступенями: к горизонту светлее от городского зарева.
    [0x07080f, 0x0a0c15, 0x0e111b, 0x131622, 0x1a1c27].forEach((c, i) =>
      g.fillStyle(c).fillRect(0, i * 30, width, 31),
    );
    // Заводские корпуса и трубы.
    let x = 0;
    while (x < width) {
      const w = 50 + Math.floor(r() * 70);
      const h = 30 + Math.floor(r() * 40);
      g.fillStyle(0x0c0d13).fillRect(x, 170 - h, w, h + 20);
      for (let wy = 170 - h + 6; wy < 166; wy += 8) {
        for (let wx = x + 4; wx < x + w - 6; wx += 7) {
          if (r() < 0.12) g.fillStyle(0xd9b56a, 0.8).fillRect(wx, wy, 3, 2);
        }
      }
      if (r() < 0.4) g.fillStyle(0x0c0d13).fillRect(x + w / 2, 170 - h - 40, 6, 40);
      x += w + Math.floor(r() * 20);
    }
    // Бетонный забор и асфальт.
    g.fillStyle(0x15161c).fillRect(0, 170, width, 20);
    for (let fx = 0; fx < width; fx += 24) g.fillStyle(0x101116).fillRect(fx, 170, 1, 20);
    g.fillStyle(0x1c1d24).fillRect(0, 190, width, height - 190);
    // Разметка полос и мокрые отблески.
    for (let lx = 0; lx < width; lx += 32) g.fillStyle(0x3a3a40).fillRect(lx, 262, 16, 2);
    for (let i = 0; i < 40; i++) {
      g.fillStyle(0x2b2d36).fillRect(
        Math.floor(r() * width),
        200 + Math.floor(r() * 150),
        6 + Math.floor(r() * 10),
        1,
      );
    }
    // Старт и финиш (по переднему бамперу).
    g.fillStyle(0xd8d0bc).fillRect(cfg.startX, 196, 2, 112);
    for (let fy = 196; fy < 308; fy += 4) {
      g.fillStyle((fy / 4) % 2 ? 0xffffff : 0x111111).fillRect(cfg.finishX, fy, 2, 4);
      g.fillStyle((fy / 4) % 2 ? 0x111111 : 0xffffff).fillRect(cfg.finishX + 2, fy, 2, 4);
    }
    // Прожектор слева и пятно света на асфальте — ступенями, режим ADD.
    g.fillStyle(0x0c0d13).fillRect(36, 70, 3, 120);
    g.fillStyle(0x2a2c35).fillRect(30, 64, 16, 8);
    const light = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    for (const [w, a] of [
      [260, 0.025],
      [200, 0.03],
      [140, 0.035],
    ]) {
      light.fillStyle(0xfff0c8, a).fillTriangle(38, 70, 38 + w, 300, 38 + w * 0.2, 300);
    }
    for (const [w, h, a] of [
      [420, 60, 0.03],
      [300, 40, 0.035],
    ]) {
      light.fillStyle(0xfff0c8, a).fillEllipse(220, 280, w, h);
    }
  }

  #nameplate(car, name) {
    const zoom = getRenderZoom();
    car.nameplate = this.add
      .text(car.x, car.y - car.plateOffset, name, {
        fontFamily: '"Literata Variable", Literata, Georgia, serif',
        fontSize: '8px',
        color: '#efe9de',
        backgroundColor: 'rgba(22, 21, 19, 0.85)',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setResolution(zoom);
  }

  /** «Ёлка» на правом краю: три жёлтых и зелёный, горящие лампы светятся. */
  #drawTree() {
    const x = WORLD.width - 22;
    this.add.rectangle(x, 150, 3, 120, 0x0c0d13);
    this.add.rectangle(x, 104, 22, 92, 0x111218).setStrokeStyle(1, 0x2a2c35);
    const lamp = (y, off) => {
      const glow = this.add.circle(x, y, 10, 0xffffff, 0).setBlendMode(Phaser.BlendModes.ADD);
      return { core: this.add.circle(x, y, 6, off), glow };
    };
    const ambers = [];
    for (let i = 0; i < this.test.christmasTree.ambers; i++)
      ambers.push(lamp(70 + i * 22, 0x3a2f10));
    const green = lamp(70 + ambers.length * 22, 0x10301a);
    return { ambers, green };
  }

  #runTree() {
    const step = this.test.christmasTree.intervalSec * 1000;
    const light = (l, color) => {
      l.core.setFillStyle(color);
      l.glow.setFillStyle(color, 0.35);
    };
    this.tree.ambers.forEach((l, i) => {
      this.time.delayedCall(step * (i + 1), () => {
        light(l, 0xffc21a);
        audio.playSfx(SFX.TREE_BEEP);
      });
    });
    this.time.delayedCall(step * (this.tree.ambers.length + 1), () => {
      light(this.tree.green, 0x2fff6a);
      audio.playSfx(SFX.TREE_GO);
      this.state = 'running';
      this.pedals.setEnabled(true);
    });
  }

  /** Положение передка по пройденному пути → координата центра машины. */
  #xFor(car, distance) {
    const { distance: total } = this.test.formula;
    const front = cfg.startX + (Math.min(distance, total) / total) * (cfg.finishX - cfg.startX);
    return front - car.front;
  }

  update(_time, delta) {
    const input = this.pedals.update(delta / 1000);
    if (this.state !== 'running') {
      // Подвеска успокаивается до старта и после финиша.
      this.player.step(delta / 1000, { accel: -input.brake * 2 });
      return;
    }
    this.s += delta / 1000;

    const me = raceTelemetry(this.result.details.accel, this.s);
    const rival = raceTelemetry(this.result.details.rivalAccel, this.s);
    const brokenStop = !this.result.ok && this.result.reasonKey === 'broken';
    const topSpeed = Math.max(0.001, this.result.details.accel * me.finishTime);
    const gb = updateGearbox(
      this.gearbox,
      { speed01: me.speed / topSpeed, gas: input.gas, brake: input.brake },
      delta / 1000,
    );

    for (const [car, tel] of [
      [this.player, me],
      [this.rival, rival],
    ]) {
      const dist = brokenStop && car === this.player ? Math.min(tel.distance, 200) : tel.distance;
      const x = this.#xFor(car, dist);
      if (car === this.player) {
        // Пока разгоняется — приседает на задние колёса (ускорение из расчёта заезда).
        car.step(delta / 1000, {
          distance: x - car.x,
          accel:
            (tel.finished ? 0 : this.result.details.accel) + input.gas * 1.2 - input.brake * 2.5,
        });
      } else {
        spinWheels(car, x - car.x);
      }
      car.x = x;
      car.nameplate.x = x;
    }

    this.tacho.render({
      rpm: gb.rpm,
      gear: gb.gear,
      redline: config.gearbox.redlineRpm,
      shifting: gb.shifting,
    });
    this.$speed.textContent = String(Math.round(me.speedKmh));
    this.$time.textContent = formatSeconds(Math.min(this.s, me.finishTime));
    this.engine?.setRate?.(0.7 + (gb.rpm / config.gearbox.redlineRpm) * 0.8);

    if (me.finished && rival.finished) this.#finish();
  }

  #finish() {
    this.state = 'finished';
    this.pedals.setEnabled(false);
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
