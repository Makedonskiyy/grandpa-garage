import Phaser from 'phaser';
import config from '../../data/config.json';
import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, SFX, WORLD } from '../config/constants.js';
import { buildCar } from '../systems/buildCar.js';
import { evaluateTrial, getTest } from '../systems/simulate.js';
import { audio } from '../systems/AudioManager.js';
import { gameState, recordResult } from '../gameState.js';
import { el } from '../ui/dom.js';
import { button } from '../ui/components.js';
import { t } from '../systems/strings.js';

const GROUND_Y = 300;
const CAR_START_X = 170; // машина почти в центре, дорога едет под ней
const CAR_TRAVEL = 300;
const BUMPS_PER_SEC = 2.5; // кочки грунтовки

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

    this.#createParallax();
    this.car = buildCar(this, gameState.build, gameState.cosmetics, {
      x: CAR_START_X,
      y: GROUND_Y,
      dirty: gameState.car.dirty,
    });
    this.spinInPlace = false;
    this.engine = audio.loopSfx(SFX.ENGINE);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.engine?.destroy());

    this.$path = el('div', { class: 'bar__fill' });
    this.$dur = el('div', { class: 'bar__fill', style: { width: '100%' } });
    this.ui.append(
      el('div', { class: 'ui-abs hud-bottom panel' }, [
        t('trial.distance'),
        el('div', { class: 'bar' }, this.$path),
        t('trial.durability'),
        el('div', { class: 'bar', style: { flex: '0 0 240px' } }, this.$dur),
        button(t('trial.speedUp'), (e) => {
          this.speed = this.speed === 1 ? config.trial.speedUpFactor : 1;
          e.currentTarget.classList.toggle('btn--primary', this.speed !== 1);
        }),
      ]),
    );
  }

  /** Заглушка параллакса до арта: 3 слоя, сгенерированные текстуры. */
  #createParallax() {
    const { width, height } = WORLD;
    const make = (key, draw) => {
      if (this.textures.exists(key)) return;
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      draw(g);
      g.generateTexture(key, width, height);
      g.destroy();
    };
    make('trial_far', (g) => {
      g.fillStyle(0xbfc8d2).fillRect(0, 0, width, height);
      g.fillStyle(0x8e98a3);
      for (let x = 0; x < width; x += 80) g.fillRect(x, 150, 60, 80);
    });
    make('trial_mid', (g) => {
      g.fillStyle(0x5d6168);
      for (let x = 0; x < width; x += 64) g.fillRect(x, 200, 50, 60);
      g.fillStyle(0xf2f2f2).fillRect(0, 255, width, 10);
    });
    make('trial_road', (g) => {
      g.fillStyle(0x5a4630).fillRect(0, 265, width, 95);
      g.fillStyle(0x3d2f20);
      for (let x = 0; x < width; x += 40) g.fillRect(x, 290 + (x % 3) * 6, 26, 3);
      g.fillStyle(0x6b7f99, 0.7);
      for (let x = 20; x < width; x += 150) g.fillEllipse(x, 320, 40, 8);
    });
    this.layers = [
      { sprite: this.add.tileSprite(0, 0, width, height, 'trial_far').setOrigin(0), k: 0.1 },
      { sprite: this.add.tileSprite(0, 0, width, height, 'trial_mid').setOrigin(0), k: 0.4 },
      { sprite: this.add.tileSprite(0, 0, width, height, 'trial_road').setOrigin(0), k: 1 },
    ];
  }

  update(_time, delta) {
    if (this.done) {
      // После остановки подвеска успокаивается; при пробуксовке колёса крутятся на месте.
      this.car.step(delta / 1000, { distance: this.spinInPlace ? delta * 0.5 : 0 });
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
    this.car.step(dt / 1000, {
      distance: roadShift + (this.car.x - prevX),
      accel: progress < 0.12 ? 2.5 : 0,
    });
    this.engine?.setRate?.(0.8 + progress * 0.6);

    this.$path.style.width = `${progress * 100}%`;
    if (!this.result.ok && this.result.reasonKey === 'broken') {
      this.$dur.style.width = `${Math.max(0, 100 - (progress / this.stopAt) * 100)}%`;
    }

    if (progress >= this.stopAt) this.#finish();
  }

  #finish() {
    this.done = true;
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
