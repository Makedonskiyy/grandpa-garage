import Phaser from 'phaser';
import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, SFX, WORLD } from '../config/constants.js';
import { buildCar } from '../systems/buildCar.js';
import { getTest } from '../systems/simulate.js';
import { createRun, stepRun, startRun, runBot, summarize, segmentAt } from '../systems/drive.js';
import { audio } from '../systems/AudioManager.js';
import { gameState, recordResult } from '../gameState.js';
import { el } from '../ui/dom.js';
import { t } from '../systems/strings.js';
import { getSettings } from '../systems/settings.js';
import { getRenderZoom } from '../systems/scale.js';
import { DriveHud } from '../ui/DriveHud.js';

const GROUND_Y = 288; // колёса над панелью приборов (верх панели — y 306)
const CAR_X = 250; // машина стоит, дорога едет под ней
const PPM = 62; // точек мира на метр: машина 288 точек ≈ 4,6 м
const WARN_M = 28; // за сколько метров предупреждать об участке
const SEG_COLORS = { mud: '#6b5236', ruts: '#a0703c', deep: '#2c2117' };

/** Детерминированный генератор: фон одинаков при каждом запуске. */
function rng(seed) {
  let v = seed;
  return () => (v = (v * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

/**
 * Обкатка (ТЗ 3.7): раскисшая грунтовка за гаражами, параллакс в 3 слоя. Машину ведёт физика
 * drive.js: на колее удары копят повреждения (быстрее — больнее), в глубокой грязи машина
 * вязнет, если сбросить скорость. Перед каждым участком — знак и подсказка, внизу — карта
 * трассы с участками, прочность и приборы.
 */
export class TrialScene extends BaseScene {
  constructor() {
    super(SCENES.TRIAL);
  }

  create() {
    this.enter();
    audio.playMusic(MUSIC.DRIVE);

    this.test = getTest('trial');
    const auto = getSettings().gearbox === 'auto';
    this.run = createRun('trial', gameState.build, { condition: gameState.car, auto });
    this.best = runBot('trial', gameState.build, { condition: gameState.car });
    this.done = false;
    this.spin = 0;

    this.#createParallax();
    this.track = this.#drawTrack();
    this.car = buildCar(this, gameState.build, gameState.cosmetics, {
      x: CAR_X,
      y: GROUND_Y,
      dirty: true,
    });
    this.cover = this.#drawMudCover(); // грязь поверх колёс в глубоких участках
    this.mud = this.#makeMud();
    this.engine = audio.loopSfx(SFX.ENGINE);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.engine?.destroy());

    this.#buildHud();
    startRun(this.run);
    this.hud.say(auto ? 'startAuto' : 'start');
  }

  #buildHud() {
    const segs = this.test.track.segments;
    const len = this.test.track.length;
    this.$marker = el('span', { class: 'trackmap__marker' });
    const map = el('div', { class: 'trackmap', 'aria-hidden': 'true' }, [
      ...segs.map((s) =>
        el('span', {
          class: `trackmap__seg is-${s.type}`,
          style: {
            left: `${(s.from / len) * 100}%`,
            width: `${((s.to - s.from) / len) * 100}%`,
            background: SEG_COLORS[s.type],
          },
        }),
      ),
      this.$marker,
    ]);
    this.$dur = el('div', { class: 'meter__fill is-good', style: { transform: 'scaleX(1)' } });
    this.$durValue = el('span', { text: '100%' });
    this.$pathValue = el('span', { text: '0 м' });
    const block = (label, value, body) =>
      el('div', { class: 'drive-hud__block' }, [
        el('div', { class: 'hud-meter__head' }, [el('span', { text: label }), value]),
        body,
      ]);
    this.hud = new DriveHud(this, this.run, {
      className: 'drive-hud--trial',
      middle: [
        block(t('trial.distance'), this.$pathValue, map),
        block(t('trial.durability'), this.$durValue, el('div', { class: 'meter' }, this.$dur)),
      ],
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

  /**
   * Участки трассы поверх дороги, в метрах трассы (контейнер едет вместе с дорогой):
   * колея — гребни и рытвины, глубокая грязь — тёмная жижа с бликами; у начала каждого
   * участка — знак на столбике, на финише — флаг.
   */
  #drawTrack() {
    const box = this.add.container(CAR_X, 0);
    const g = this.add.graphics();
    const r = rng(7);
    box.add(g);
    for (const s of this.test.track.segments) {
      const x0 = s.from * PPM;
      const w = (s.to - s.from) * PPM;
      if (s.type === 'ruts') {
        g.fillStyle(0x3e2f20).fillRect(x0, 266, w, 94);
        for (let x = x0; x < x0 + w; x += 14) {
          const h = 3 + Math.floor(r() * 4);
          g.fillStyle(0x6e5538).fillRect(x, 280 - h, 8, h);
          g.fillStyle(0x2b2016).fillRect(x + 8, 280, 6, 4);
          g.fillStyle(0x6e5538).fillRect(x + 4, 298 - h, 9, h);
          g.fillStyle(0x2b2016).fillRect(x, 298, 5, 3);
        }
      } else if (s.type === 'deep') {
        g.fillStyle(0x2c2117).fillRect(x0, 265, w, 95);
        g.fillStyle(0x3a2c1e).fillRect(x0, 265, w, 3);
        for (let x = x0 + 6; x < x0 + w - 20; x += 26 + Math.floor(r() * 30)) {
          g.fillStyle(0x6d6a66, 0.5).fillRect(x, 272 + Math.floor(r() * 30), 10 + r() * 14, 1);
        }
      }
      if (s.type !== 'mud') this.#sign(box, x0 - 2 * PPM, t(`trial.signs.${s.type}`), s.type);
    }
    // Финиш: столбик с клетчатым флажком.
    const fx = this.test.track.length * PPM;
    g.fillStyle(0xe9e4da).fillRect(fx, 220, 3, 70);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 3; j++)
        g.fillStyle((i + j) % 2 ? 0x111111 : 0xffffff).fillRect(fx + 3 + i * 5, 220 + j * 5, 5, 5);
    return box;
  }

  /** Знак на столбике у обочины: жёлтая табличка с надписью. */
  #sign(box, x, text, kind) {
    const g = this.add.graphics();
    g.fillStyle(0x3a3a3a).fillRect(x, 214, 2, 52);
    const label = this.add
      .text(x + 1, 216, text, {
        fontFamily: '"Onest Variable", Onest, system-ui, sans-serif',
        fontSize: '8px',
        fontStyle: '700',
        color: '#1f1b16',
        backgroundColor: kind === 'deep' ? '#e8b84a' : '#f0d36a',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setResolution(getRenderZoom());
    box.add([g, label]);
  }

  /** Полоса жижи перед колёсами: в глубокой грязи колёса утопают. */
  #drawMudCover() {
    const g = this.add.graphics();
    const box = this.add.container(CAR_X, 0, [g]);
    for (const s of this.test.track.segments) {
      if (s.type !== 'deep') continue;
      const x0 = s.from * PPM;
      const w = (s.to - s.from) * PPM;
      g.fillStyle(0x2c2117).fillRect(x0, GROUND_Y - 5, w, 6);
      for (let x = x0; x < x0 + w; x += 6) g.fillStyle(0x3d2e1f).fillRect(x, GROUND_Y - 6, 3, 1);
    }
    return box;
  }

  /** Брызги грязи из-под задних колёс. */
  #makeMud() {
    if (!this.textures.exists('mud_px')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff).fillRect(0, 0, 3, 3);
      g.generateTexture('mud_px', 3, 3);
      g.destroy();
    }
    return this.add.particles(0, 0, 'mud_px', {
      speedX: { min: -140, max: -40 },
      speedY: { min: -120, max: -30 },
      gravityY: 380,
      lifespan: 700,
      tint: [0x4a3827, 0x5f4a35, 0x3b2d1f],
      frequency: 30,
      emitting: false,
    });
  }

  update(_time, delta) {
    if (!this.hud) return;
    const dt = delta / 1000;
    const run = this.run;
    const input = this.hud.input(dt);
    if (this.done) {
      // После остановки подвеска успокаивается; при пробуксовке колёса крутятся на месте.
      this.car.step(dt, { distance: this.spin * delta * 0.4, accel: -input.brake * 2 });
      return;
    }
    const prevX = run.x;
    stepRun(run, input, dt);
    const moved = (run.x - prevX) * PPM;

    for (const l of this.layers) l.sprite.tilePositionX += moved * l.k;
    this.track.x = CAR_X - run.x * PPM;
    this.cover.x = this.track.x;
    const seg = segmentAt(this.test, run.x);
    if (seg.type === 'ruts' && Math.random() < dt * (1 + run.v * 0.9)) {
      this.car.bump(10 + run.v * 4);
      if (run.v > 6 && getSettings().shake) this.cameras.main.shake(80, 0.002 * run.v);
    }
    this.car.y = GROUND_Y + run.sink * 7;
    this.car.step(dt, {
      distance: moved * (1 + run.slip * 2) + run.slip * 4,
      accel: run.accel ?? 0,
    });

    const splash = run.slip > 0.25 || (seg.type === 'deep' && run.v > 1);
    this.mud.setPosition(CAR_X - 80, GROUND_Y - 6);
    if (splash && !this.mud.emitting) this.mud.start();
    else if (!splash && this.mud.emitting) this.mud.stop();

    this.engine?.setRate?.(0.6 + (run.rpm / run.stats.redline) * 0.9);
    this.hud.render();
    this.#renderMeters();
    this.#hints(run, seg);

    if (run.done) this.#finish();
  }

  #renderMeters() {
    const run = this.run;
    const len = this.test.track.length;
    this.$marker.style.left = `${Math.min(100, (run.x / len) * 100)}%`;
    this.$pathValue.textContent = `${Math.round(Math.min(run.x, len))} м`;
    const left = Math.max(0, 1 - run.damage / run.capacity);
    this.$dur.style.transform = `scaleX(${left})`;
    this.$dur.classList.toggle('is-bad', left < 0.35);
    this.$durValue.textContent = `${Math.round(left * 100)}%`;
  }

  /** Подсказка: что впереди и что делать прямо сейчас. */
  #hints(run, seg) {
    for (const e of run.events.splice(0)) if (e.type === 'overrev') this.hud.say('overrev', 'warn');
    if (run.sink > 0.25) return this.hud.say('sinking', 'warn');
    if (run.slip > 0.5) return this.hud.say('spin', 'warn');
    if (!run.auto && run.limiter && seg.type !== 'ruts') return this.hud.say('limiter', 'warn');
    if (seg.type === 'deep') return this.hud.say('deepIn');
    if (seg.type === 'ruts') {
      return run.v > 6 ? this.hud.say('ruts', 'warn') : this.hud.say('rutsIn');
    }
    const next = this.test.track.segments.find((s) => s.from > run.x && s.type !== 'mud');
    if (next && next.from - run.x < WARN_M) {
      return this.hud.say(next.type === 'deep' ? 'deep' : 'ruts');
    }
    this.hud.quiet();
  }

  #finish() {
    this.done = true;
    this.hud.setEnabled(false);
    this.mud.stop();
    this.engine?.stop();
    this.result = summarize(this.run, this.best);
    const { reasonKey } = this.run;
    if (reasonKey === 'broken') {
      if (getSettings().shake) this.cameras.main.shake(400, 0.01);
      this.car.drop(60);
      this.#puff(0x777777, this.car.x + 110, this.car.y - 50);
    } else if (reasonKey === 'traction') {
      this.spin = 1;
      this.#puff(0x5a4630, this.car.x - 82, this.car.y - 6);
    } else if (reasonKey === 'power') {
      this.#puff(0x5a4630, this.car.x - 82, this.car.y - 6);
    }
    if (this.run.ok) this.hud.say('finish', 'good');
    audio.playSfx(this.result.ok ? SFX.SUCCESS : SFX.FAIL);

    this.time.delayedCall(1400, () => {
      recordResult('trial', this.result);
      this.goTo(SCENES.RESULT);
    });
  }

  /** Клубы дыма или грязи. */
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
