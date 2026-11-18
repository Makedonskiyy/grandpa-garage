import Phaser from 'phaser';
import config from '../../data/config.json';
import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, SFX, WORLD } from '../config/constants.js';
import { buildCar } from '../systems/buildCar.js';
import { evaluateTrial, getTest } from '../systems/simulate.js';
import { audio } from '../systems/AudioManager.js';
import { gameState, recordResult } from '../gameState.js';
import { el } from '../ui/dom.js';
import { webButton } from '../ui/components.js';
import { t } from '../systems/strings.js';
import { createGearbox, updateGearbox } from '../systems/autoGearbox.js';
import { PedalControls } from '../ui/PedalControls.js';
import { createTacho } from '../ui/tacho.js';

const GROUND_Y = 300;
const CAR_START_X = 170; // машина почти в центре, дорога едет под ней
const CAR_TRAVEL = 300;
const BUMPS_PER_SEC = 2.5; // кочки грунтовки

/** Детерминированный генератор: фон одинаков при каждом запуске. */
function rng(seed) {
  let v = seed;
  return () => (v = (v * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

/**
 * Обкатка (ТЗ 3.7): днём, раскисшая грунтовка, параллакс в 3 слоя, 12–15 с,
 * шкала пути и прочности, «Ускорить ×2». Результат считается до старта — анимация его только показывает.
 */
export class TrialScene extends BaseScene {
  constructor() {
    super(SCENES.TRIAL);
  }

  create() {
    this.enter();
    audio.playMusic(MUSIC.DRIVE);

    this.test = getTest('trial');
    this.result = evaluateTrial(gameState.build);
    const { min, max } = this.test.durationSec;
    this.duration = ((min + max) / 2) * 1000;
    this.stopAt = this.result.ok ? 1 : config.trial.failStopAt[this.result.reasonKey];
    this.elapsed = 0;
    this.speed = 1;
    this.done = false;
    this.gearbox = createGearbox();
    this.pedals = new PedalControls(this, { compact: true });
    this.tacho = createTacho({ compact: true });

    this.#createParallax();
    this.car = buildCar(this, gameState.build, gameState.cosmetics, {
      x: CAR_START_X,
      y: GROUND_Y,
      dirty: gameState.car.dirty,
    });
    this.spinInPlace = false;
    this.engine = audio.loopSfx(SFX.ENGINE);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.engine?.destroy());

    // Панель внизу: педали, путь, прочность, тахометр и ускорение — в стиле гаража.
    this.$path = el('div', { class: 'meter__fill' });
    this.$pathValue = el('span', { text: '0%' });
    this.$dur = el('div', { class: 'meter__fill is-good', style: { transform: 'scaleX(1)' } });
    this.$durValue = el('span', { text: String(this.result.stats.durability) });
    const meter = (label, value, fill) =>
      el('div', {}, [
        el('div', { class: 'hud-meter__head' }, [el('span', { text: label }), value]),
        el('div', { class: 'meter' }, fill),
      ]);
    const speedUp = webButton(t('trial.speedUp'), () => {
      this.speed = this.speed === 1 ? config.trial.speedUpFactor : 1;
      speedUp.classList.toggle('is-on', this.speed !== 1);
    });
    this.ui.append(
      el('div', { class: 'ui-abs surface trial-hud' }, [
        this.pedals.node,
        meter(t('trial.distance'), this.$pathValue, this.$path),
        meter(t('trial.durability'), this.$durValue, this.$dur),
        this.tacho.node,
        speedUp,
      ]),
    );
    this.tacho.render({
      rpm: config.gearbox.idleRpm,
      gear: 1,
      redline: config.gearbox.redlineRpm,
    });
  }

  /**
   * Параллакс в 3 слоя (ТЗ 3.7), нарисован кодом в пикселях мира: ноябрьское небо и панельки
   * вдали, ряд гаражей со снегом на крышах, раскисшая колея с лужами. Слои бесшовные по ширине.
   */
  #createParallax() {
    const { width, height } = WORLD;
    const make = (key, draw) => {
      if (this.textures.exists(key)) return;
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      draw(g, rng(key.length * 97));
      g.generateTexture(key, width, height);
      g.destroy();
    };
    make('trial_far', (g, r) => {
      // Пасмурное небо ступенями к светлому горизонту.
      const sky = [0xaeb7c1, 0xb7bfc8, 0xc0c7ce, 0xc9ced3, 0xd1d4d6];
      sky.forEach((c, i) => g.fillStyle(c).fillRect(0, i * 34, width, 35));
      g.fillStyle(0xd6d8d8).fillRect(0, 170, width, 60);
      // Панельные дома вдали с редкими горящими окнами.
      let x = 0;
      while (x < width) {
        const w = 36 + Math.floor(r() * 40);
        const h = 34 + Math.floor(r() * 30);
        g.fillStyle(0x9aa3ad).fillRect(x, 196 - h, w, h + 40);
        g.fillStyle(0x8c96a1).fillRect(x + w - 4, 196 - h, 4, h + 40);
        for (let wy = 196 - h + 4; wy < 196; wy += 6) {
          for (let wx = x + 3; wx < x + w - 6; wx += 5) {
            g.fillStyle(r() < 0.18 ? 0xe9d7a8 : 0x7f8994).fillRect(wx, wy, 2, 2);
          }
        }
        x += w + 6 + Math.floor(r() * 30);
      }
      // Голые деревья полосой.
      for (let tx = 0; tx < width; tx += 3) {
        const h = 10 + Math.floor(r() * 16);
        g.fillStyle(0x7d7f7e).fillRect(tx, 216 - h, 1, h);
      }
      g.fillStyle(0x8a8c8a).fillRect(0, 212, width, 20);
    });
    make('trial_mid', (g, r) => {
      // Ряд гаражей кооператива: кирпич, крашеные ворота, снег на крышах.
      const gates = [0x4f5d52, 0x5b5f66, 0x6b5a48, 0x4b5866, 0x5f5246];
      for (let gx = 0, i = 0; gx < width; gx += 64, i++) {
        g.fillStyle(0x7a6f66).fillRect(gx, 200, 64, 58);
        for (let by = 202; by < 256; by += 4) g.fillStyle(0x6e645c).fillRect(gx, by, 64, 1);
        g.fillStyle(0x5d544d).fillRect(gx, 200, 2, 58);
        g.fillStyle(gates[i % gates.length]).fillRect(gx + 10, 214, 44, 44);
        g.fillStyle(0x000000, 0.2).fillRect(gx + 31, 214, 2, 44);
        g.fillStyle(0xffffff, 0.08).fillRect(gx + 10, 214, 44, 2);
        g.fillStyle(0xeef1f3).fillRect(gx - 2, 196, 68, 5);
        g.fillStyle(0xd9dee2).fillRect(gx - 2, 200, 68, 2);
        if (r() < 0.5) g.fillStyle(0xe8e3d6).fillRect(gx + 14, 208, 8, 4);
      }
      // Сугробы у стены.
      for (let sx = 0; sx < width; sx += 4) {
        const h = 2 + Math.floor(r() * 5);
        g.fillStyle(0xe4e8eb).fillRect(sx, 262 - h, 4, h);
      }
      g.fillStyle(0xd3d9dd).fillRect(0, 260, width, 3);
    });
    make('trial_road', (g, r) => {
      // Раскисшая грунтовка: колеи, лужи с отражением неба, комья грязи, снег по кромке.
      const mud = [0x5f4a35, 0x584430, 0x513e2b, 0x4a3827];
      mud.forEach((c, i) => g.fillStyle(c).fillRect(0, 263 + i * 24, width, 25));
      for (const y of [284, 304, 324]) {
        for (let rx = 0; rx < width; rx += 2) {
          if (r() < 0.8) g.fillStyle(0x3b2d1f).fillRect(rx, y + Math.floor(r() * 2), 2, 2);
        }
      }
      for (let i = 0; i < 6; i++) {
        const px = Math.floor(r() * width);
        const py = 290 + Math.floor(r() * 50);
        const w = 24 + Math.floor(r() * 30);
        g.fillStyle(0x3b2d1f).fillEllipse(px, py + 1, w + 4, 8);
        g.fillStyle(0x8f9ba6).fillEllipse(px, py, w, 6);
        g.fillStyle(0xb7c0c8).fillRect(px - w / 4, py - 1, w / 3, 1);
      }
      for (let i = 0; i < 220; i++) {
        g.fillStyle(r() < 0.5 ? 0x6e5840 : 0x433323).fillRect(
          Math.floor(r() * width),
          266 + Math.floor(r() * 94),
          2,
          1,
        );
      }
      for (let sx = 0; sx < width; sx += 5) {
        g.fillStyle(0xcfd5d8).fillRect(sx, 263, 5, 1 + Math.floor(r() * 3));
      }
    });
    this.layers = [
      { sprite: this.add.tileSprite(0, 0, width, height, 'trial_far').setOrigin(0), k: 0.1 },
      { sprite: this.add.tileSprite(0, 0, width, height, 'trial_mid').setOrigin(0), k: 0.4 },
      { sprite: this.add.tileSprite(0, 0, width, height, 'trial_road').setOrigin(0), k: 1 },
    ];
  }

  update(_time, delta) {
    const input = this.pedals.update(delta / 1000);
    if (this.done) {
      // После остановки подвеска успокаивается; при пробуксовке колёса крутятся на месте.
      this.#renderTacho(0, input, delta / 1000);
      this.car.step(delta / 1000, {
        distance: this.spinInPlace ? delta * 0.5 : 0,
        accel: -input.brake * 2,
      });
      return;
    }
    const dt = delta * this.speed;
    this.elapsed += dt;
    const progress = Math.min(this.elapsed / this.duration, this.stopAt);

    const dx = dt * 0.08 * (progress < this.stopAt ? 1 : 0);
    const roadShift = dx * 3;
    for (const l of this.layers) l.sprite.tilePositionX += roadShift * l.k;
    const prevX = this.car.x;
    this.car.x = CAR_START_X + progress * CAR_TRAVEL;
    if (Math.random() < (dt / 1000) * BUMPS_PER_SEC) this.car.bump(20 + Math.random() * 20);
    const gb = this.#renderTacho(progress, input, delta / 1000);
    this.car.step(dt / 1000, {
      distance: roadShift + (this.car.x - prevX),
      accel: (progress < 0.12 ? 2.5 : 0) + input.gas * 1.5 - input.brake * 3,
    });
    this.engine?.setRate?.(0.7 + (gb.rpm / config.gearbox.redlineRpm) * 0.8);

    this.$path.style.transform = `scaleX(${progress})`;
    this.$pathValue.textContent = `${Math.round(progress * 100)}%`;
    if (!this.result.ok && this.result.reasonKey === 'broken') {
      const left = Math.max(0, 1 - progress / this.stopAt);
      this.$dur.style.transform = `scaleX(${left})`;
      this.$dur.classList.toggle('is-bad', left < 0.35);
    }

    if (progress >= this.stopAt) this.#finish();
  }

  /** Шаг автомата и отрисовка тахометра; возвращает состояние коробки. */
  #renderTacho(speed01, input, dt) {
    const gb = updateGearbox(this.gearbox, { speed01, gas: input.gas, brake: input.brake }, dt);
    this.tacho.render({
      rpm: gb.rpm,
      gear: gb.gear,
      redline: config.gearbox.redlineRpm,
      shifting: gb.shifting,
    });
    return gb;
  }

  #finish() {
    this.done = true;
    this.pedals.setEnabled(false);
    this.engine?.stop();
    const { reasonKey } = this.result;
    if (reasonKey === 'broken') {
      this.cameras.main.shake(400, 0.01);
      this.car.drop(60);
      this.#puff(0x777777, this.car.x + 110, this.car.y - 50);
    } else if (reasonKey === 'traction') {
      this.spinInPlace = true;
      this.#puff(0x5a4630, this.car.x - 82, this.car.y - 6);
    } else if (this.result.ok) {
      this.add.rectangle(this.car.x + 160, GROUND_Y - 30, 4, 60, 0xffffff);
      this.add.rectangle(this.car.x + 172, GROUND_Y - 52, 20, 14, 0xd9533f);
    }
    audio.playSfx(this.result.ok ? SFX.SUCCESS : SFX.FAIL);

    this.time.delayedCall(1200, () => {
      recordResult('trial', this.result);
      this.goTo(SCENES.RESULT);
    });
  }

  /** Клубы дыма или грязи (заглушка вместо частиц). */
  #puff(color, x, y) {
    for (let i = 0; i < 8; i++) {
      const c = this.add.circle(x, y, 4 + i, color, 0.8);
      this.tweens.add({
        targets: c,
        x: x - 20 - i * 6,
        y: y - 10 - i * 4,
        alpha: 0,
        scale: 2,
        duration: 900 + i * 60,
      });
    }
  }
}
