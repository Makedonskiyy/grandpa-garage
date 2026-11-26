import Phaser from 'phaser';
import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, SFX, AMB, WORLD } from '../config/constants.js';
import { buildCar } from '../systems/buildCar.js';
import { getTest } from '../systems/simulate.js';
import { createRun, stepRun, greenLight, runBot, summarize, segmentAt } from '../systems/drive.js';
import { ScreenLight } from '../ui/ScreenLight.js';
import { showRunOverlay, runOverText } from '../ui/RunOverlay.js';
import { icon } from '../ui/icons.js';
import { TireFx } from '../systems/TireFx.js';
import { audio } from '../systems/AudioManager.js';
import { gameState, recordResult } from '../gameState.js';
import { el } from '../ui/dom.js';
import { t } from '../systems/strings.js';
import { getSettings } from '../systems/settings.js';
import { getRenderZoom } from '../systems/scale.js';
import { backdrop, prop, roadsideProps, rng } from './scenery.js';
import { BypassWorld } from './bypassWorld.js';
import { TownWorld } from './townWorld.js';
import { DriveSounds } from '../systems/DriveSounds.js';
import { DriveHud } from '../ui/DriveHud.js';

/**
 * Весь пейзаж поднят на SHIFT, чтобы машина ехала над приборами (их верх — y ≈ 259).
 * Внутри контейнеров трассы земля — ROAD_Y, на экране — GROUND_Y.
 */
const SHIFT = -34;
const ROAD_Y = 288;
const GROUND_Y = ROAD_Y + SHIFT;
const CAR_X = 250; // машина стоит, дорога едет под ней
const PPM = 62; // точек мира на метр: машина 288 точек ≈ 4,6 м
const WARN_M = 28; // за сколько метров предупреждать об участке
const SEG_COLORS = {
  mud: '#6b5236',
  ruts: '#a0703c',
  deep: '#2c2117',
  asphalt: '#55585e',
  pothole: '#3a3b3e',
  limit: '#c62828',
};
/** Участки, о которых предупреждаем знаком и подсказкой. */
const HAZARDS = ['ruts', 'deep', 'pothole', 'limit'];

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
    this.ambience = AMB.ROAD;
    audio.playAmbience(this.ambience);

    // Карта из выбора в гараже: грунтовка, автодром или бесконечная объездная.
    this.test = getTest(gameState.trialMap ?? 'trial');
    this.theme = this.test.mode;
    this.loop = Boolean(this.test.track.loop);
    const auto = getSettings().gearbox === 'auto';
    this.run = createRun(this.test.id, gameState.build, { condition: gameState.car, auto });
    this.best = this.test.practice
      ? null
      : runBot(this.test.id, gameState.build, { condition: gameState.car });
    this.done = false;
    this.spin = 0;

    if (this.theme === 'free') {
      // Объездная — свой бесконечный лес у каждого игрока.
      this.world = new BypassWorld(this, { seed: gameState.flags.worldSeed ?? 1, ppm: PPM });
    } else if (this.theme === 'track') {
      // Площадка в городке — дневной городок с хрущёвками, тоже свой у каждого игрока.
      this.world = new TownWorld(this, { seed: gameState.flags.worldSeed ?? 1, ppm: PPM });
    } else this.#createParallax();
    this.track = this.#drawTrack();
    this.car = buildCar(this, gameState.build, gameState.cosmetics, {
      x: CAR_X,
      y: GROUND_Y,
      // На асфальте машина не пачкается: грязная, только если такой приехала из гаража.
      dirty: gameState.car.dirty || this.test.surface !== 'asphalt',
    });
    this.cover = this.#drawMudCover(); // грязь поверх колёс в глубоких участках
    this.mud = this.#makeMud();
    this.fx = new TireFx(this, this.car); // дым и след шин на асфальте
    audio.playSfx(SFX.CAR_START);
    this.engine = audio.startEngine(gameState.build);
    this.sounds = new DriveSounds(this, gameState.build.tires);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.engine?.stop());

    this.#buildHud();
    // Светофор — на экране сверху: трогается игрок сам, на зелёный.
    this.startBox = this.add.container(CAR_X, SHIFT);
    this.light = new ScreenLight(this);
    if (this.test.practice) {
      this.ui.append(
        el(
          'button',
          {
            class: 'ui-abs garage-exit',
            type: 'button',
            onclick: () => this.#finish(true),
          },
          [icon('garage'), t('trial.toGarage')],
        ),
      );
    }
    // Первый раз на площадке — брифинг: что нужно сделать. Светофор ждёт «Понятно».
    const brief = this.test.brief && !gameState.flags[`brief_${this.test.id}`];
    if (brief) {
      this.light.setVisible(false);
      this.hud.setEnabled(false);
      this.hud.setVisible(false);
      const close = showRunOverlay(this.ui, {
        ok: true,
        tone: 'is-info',
        badge: 'info',
        title: this.test.brief.title,
        items: this.test.brief.items,
        primaryIcon: 'check',
        primary: {
          label: t('trial.briefGo'),
          onClick: () => {
            close();
            gameState.flags[`brief_${this.test.id}`] = true;
            this.light.setVisible(true);
            this.hud.setVisible(true);
            this.hud.setEnabled(true);
            this.#startLight(auto);
          },
        },
      });
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, close);
      return;
    }
    this.#startLight(auto);
  }

  /** Светофор на старте: красный, жёлтые, зелёный — тронуться можно на зелёный. */
  #startLight(auto) {
    this.hud.setHintSlot('light');
    this.hud.say(auto ? 'launchAuto' : 'launch');
    this.light.run(this.test.christmasTree, {
      onAmber: () => audio.playSfx(SFX.TREE_BEEP),
      onGreen: () => {
        audio.playSfx(SFX.TREE_GO);
        greenLight(this.run);
        this.hud.say(auto ? 'goAuto' : 'goManual', 'good');
      },
      // Светофор ушёл — подсказки встают на его место сверху.
      onHide: () => this.hud.setHintSlot('top'),
    });
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
    if (this.test.trap) {
      const { trap, zone } = this.test;
      map.append(
        el('span', { class: 'trackmap__trap', style: { left: `${(trap.at / len) * 100}%` } }),
        el('span', {
          class: 'trackmap__zone',
          style: {
            left: `${(zone.from / len) * 100}%`,
            width: `${((zone.to - zone.from) / len) * 100}%`,
          },
        }),
      );
    }
    // Строка карточки: значок, крупное число, мелкая подпись справа, под ней — тонкая полоса.
    const stat = (name, value, sub, body) =>
      el('div', { class: 'hud-stat' }, [
        el('div', { class: 'hud-stat__row' }, [icon(name), value, sub]),
        body,
      ]);
    this.$pathSub = el('span', { class: 'hud-stat__sub' });
    this.$pathValue.className = 'hud-stat__value';
    this.$durValue.className = 'hud-stat__value';
    this.$durStat = null;
    this.hud = new DriveHud(this, this.run, {
      className: 'dash--trial',
      middle: [
        el('div', { class: 'dash-info__map', text: this.test.map.name }),
        stat('finish', this.$pathValue, this.$pathSub, this.loop ? null : map),
        (this.$durStat = stat(
          'durability',
          this.$durValue,
          el('span', { class: 'hud-stat__sub', text: t('trial.durability') }),
          el('div', { class: 'meter' }, this.$dur),
        )),
      ],
    });
  }

  /** Параллакс в 3 слоя по теме карты (scenes/scenery.js), поднят на SHIFT. */
  #createParallax() {
    const { width, height } = WORLD;
    this.layers = backdrop(this, this.theme).map(({ key, k }) => ({
      sprite: this.add.tileSprite(0, SHIFT, width, height, key).setOrigin(0),
      k,
    }));
    // Под поднятой дорогой — то же покрытие до края экрана.
    const under = this.theme === 'mud' ? 0x4a3827 : 0x3d3f44;
    this.add.rectangle(0, height + SHIFT, width, -SHIFT, under).setOrigin(0);
  }

  /**
   * Участки трассы поверх дороги, в метрах трассы (контейнер едет вместе с дорогой):
   * колея — гребни и рытвины, глубокая грязь — тёмная жижа с бликами; у начала каждого
   * участка — знак на столбике, на финише — флаг.
   */
  #drawTrack() {
    const box = this.add.container(CAR_X, SHIFT);
    const L = this.test.track.length;
    const copies = this.loop ? [0, 1, 2] : [0];
    for (const k of copies) this.#drawPattern(box, k * L * PPM);
    if (!this.loop) this.#drawFinish(box);
    return box;
  }

  #drawPattern(box, ox) {
    const g = this.add.graphics();
    const r = rng(7);
    box.add(g);
    for (const s of this.test.track.segments) {
      const x0 = ox + s.from * PPM;
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
      } else if (s.type === 'asphalt' && this.theme === 'free' && !this.world) {
        // Кусок трассы: асфальт с осевой и обочиной из щебня.
        g.fillStyle(0x45474c).fillRect(x0, 264, w, 96);
        g.fillStyle(0x7a7468).fillRect(x0, 264, w, 3);
        for (let x = x0; x < x0 + w; x += 40) g.fillStyle(0xe8e6dc).fillRect(x, 312, 22, 2);
      } else if (s.type === 'pothole') {
        // Ямы на обеих полосах: тёмные выбоины с рваным краем и светлой кромкой.
        for (const y of [282, 318]) {
          g.fillStyle(0x1e1f22).fillEllipse(x0 + w / 2, y, w * 0.9, 9);
          g.fillStyle(0x2c2d31).fillEllipse(x0 + w / 2 + 3, y + 1, w * 0.6, 5);
          g.fillStyle(0x6c6d70, 0.8).fillRect(x0 + w * 0.1, y - 5, w * 0.8, 1);
        }
      } else if (s.type === 'limit') {
        // Конец ограничения — знак «40» с чертой в конце участка.
        this.#limitSign(box, x0 + w, true);
      }
      if (HAZARDS.includes(s.type)) {
        if (s.type === 'limit') this.#limitSign(box, x0, false);
        else if (s.type === 'pothole') this.#ruSign(box, x0 - 3 * PPM, 'rough');
        else this.#sign(box, x0 - 2 * PPM, t(`trial.signs.${s.type}`), s.type);
      }
    }
    const props = this.world ? [] : roadsideProps(this.theme, this.test.track.length);
    for (const [m, name, y] of props) {
      box.add(this.add.image(ox + m * PPM, y, prop(this, name)).setOrigin(0, 1));
    }
    if (this.test.trap) this.#drawBrakeTest(box, g);
  }

  /** Автодром: отметка «100» с клетчатой линией и зона остановки между конусами. */
  #drawBrakeTest(box, g) {
    const { trap, zone } = this.test;
    const tx = trap.at * PPM;
    for (let y = 266; y < 360; y += 4) {
      g.fillStyle((y / 4) % 2 ? 0x111111 : 0xffffff).fillRect(tx, y, 3, 4);
      g.fillStyle((y / 4) % 2 ? 0xffffff : 0x111111).fillRect(tx + 3, y, 3, 4);
    }
    this.#sign(box, tx, t('trial.signs.trap'), 'trap');
    const z0 = zone.from * PPM;
    const z1 = zone.to * PPM;
    // Зона остановки — разметка как на экзаменационной площадке: рамка и стоп-линия.
    g.fillStyle(0xe8e8e2, 0.18).fillRect(z0, 266, z1 - z0, 94);
    g.fillStyle(0xe8e8e2).fillRect(z0, 266, 2, 94);
    g.fillStyle(0xe8e8e2).fillRect(z1 - 5, 266, 5, 94); // стоп-линия
    box.add(
      this.add
        .text((z0 + z1) / 2, 300, 'СТОП', {
          fontFamily: '"Onest Variable", Onest, system-ui, sans-serif',
          fontSize: '14px',
          fontStyle: '800',
          color: 'rgba(232,232,226,0.85)',
        })
        .setOrigin(0.5)
        .setAngle(-90)
        .setResolution(getRenderZoom()),
    );
    this.#ruSign(box, z1 + 6, 'stop');
  }

  /** Знак «40» на столбике у обочины; end — конец ограничения (серый с чертой). */
  /**
   * Знаки ПДД на стойке: rough — 1.16 «Неровная дорога» (треугольник с красной каймой),
   * stop — 2.5 «Движение без остановки запрещено» (красный восьмиугольник STOP).
   */
  #ruSign(box, x, kind) {
    const g = this.add.graphics();
    g.fillStyle(0x7d8084).fillRect(x - 1, 196, 2, 70);
    if (kind === 'rough') {
      g.fillStyle(0xc8202a).fillTriangle(x, 172, x + 14, 196, x - 14, 196);
      g.fillStyle(0xf2f0ea).fillTriangle(x, 177, x + 10, 193.5, x - 10, 193.5);
      // Две «горки» неровности.
      g.fillStyle(0x1b1b1d);
      g.fillTriangle(x - 7, 191, x - 3.5, 186, x, 191);
      g.fillTriangle(x, 191, x + 3.5, 186, x + 7, 191);
    } else {
      const pts = [];
      for (let i = 0; i < 8; i++) {
        const a = Math.PI / 8 + (i * Math.PI) / 4;
        pts.push({ x: x + Math.cos(a) * 13, y: 184 + Math.sin(a) * 13 });
      }
      g.fillStyle(0xf2f0ea).fillPoints(pts, true);
      g.fillStyle(0xc8202a).fillPoints(
        pts.map((p) => ({ x: x + (p.x - x) * 0.86, y: 184 + (p.y - 184) * 0.86 })),
        true,
      );
      box.add(g);
      box.add(
        this.add
          .text(x, 184, 'STOP', {
            fontFamily: '"Onest Variable", Onest, system-ui, sans-serif',
            fontSize: '7px',
            fontStyle: '800',
            color: '#ffffff',
          })
          .setOrigin(0.5)
          .setResolution(getRenderZoom()),
      );
      return;
    }
    box.add(g);
  }

  #limitSign(box, x, end) {
    const g = this.add.graphics();
    g.fillStyle(0x7d8084).fillRect(x - 1, 206, 2, 60);
    g.fillStyle(end ? 0x9a9da2 : 0xc8202a).fillCircle(x, 198, 11);
    g.fillStyle(0xf2f0ea).fillCircle(x, 198, end ? 10 : 8);
    if (end) g.lineStyle(1.4, 0x3a3c40).lineBetween(x - 7, 205, x + 7, 191);
    box.add(g);
    box.add(
      this.add
        .text(x, 198, '40', {
          fontFamily: '"Onest Variable", Onest, system-ui, sans-serif',
          fontSize: '10px',
          fontStyle: '800',
          color: end ? '#5a5c60' : '#1b1b1d',
        })
        .setOrigin(0.5)
        .setResolution(getRenderZoom()),
    );
  }

  /** Финиш: столбик с клетчатым флажком. */
  #drawFinish(box) {
    const g = this.add.graphics();
    box.add(g);
    const fx = this.test.track.length * PPM;
    g.fillStyle(0xe9e4da).fillRect(fx, 220, 3, 70);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 3; j++)
        g.fillStyle((i + j) % 2 ? 0x111111 : 0xffffff).fillRect(fx + 3 + i * 5, 220 + j * 5, 5, 5);
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
        backgroundColor: { deep: '#e8b84a', trap: '#ffffff', zone: '#f0d36a' }[kind] ?? '#f0d36a',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setResolution(getRenderZoom());
    box.add([g, label]);
  }

  /** Полоса жижи перед колёсами: в глубокой грязи колёса утопают. */
  #drawMudCover() {
    const g = this.add.graphics();
    const box = this.add.container(CAR_X, SHIFT, [g]);
    const L = this.test.track.length;
    for (const k of this.loop ? [0, 1, 2] : [0])
      for (const s of this.test.track.segments) {
        if (s.type !== 'deep') continue;
        const x0 = (k * L + s.from) * PPM;
        const w = (s.to - s.from) * PPM;
        g.fillStyle(0x2c2117).fillRect(x0, ROAD_Y - 5, w, 6);
        for (let x = x0; x < x0 + w; x += 6) g.fillStyle(0x3d2e1f).fillRect(x, ROAD_Y - 6, 3, 1);
      }
    return box;
  }

  #tireFx(dt, asphalt) {
    const run = this.run;
    this.fx.update(dt, {
      run,
      toScreenX: (m) => CAR_X + (m - run.x) * PPM,
      groundY: GROUND_Y,
      asphalt,
    });
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
      this.#tireFx(dt, false);
      return;
    }
    const prevX = run.x;
    stepRun(run, input, dt);
    const moved = (run.x - prevX) * PPM;

    for (const l of this.layers ?? []) l.sprite.tilePositionX += moved * l.k;
    this.world?.update(run.x * PPM);
    const L = this.test.track.length;
    this.track.x = this.loop ? CAR_X - (L + (run.x % L)) * PPM : CAR_X - run.x * PPM;
    this.cover.x = this.track.x;
    this.startBox.x = CAR_X - run.x * PPM;
    const seg = segmentAt(this.test, run.x);
    if (seg.type === 'pothole' && this.lastSeg !== 'pothole' && run.v > 0.5) {
      this.car.bump(14 + run.v * 6);
      audio.playSfx(SFX.BUMP, { volume: Math.min(1, 0.4 + run.v / 10) });
    }
    this.lastSeg = seg.type;
    if (seg.type === 'ruts' && Math.random() < dt * (1 + run.v * 0.9)) {
      this.car.bump(10 + run.v * 4);
      audio.playSfx(SFX.BUMP, { volume: Math.min(1, 0.3 + run.v / 12) });
    }
    this.car.y = GROUND_Y + run.sink * 7;
    this.car.step(dt, {
      distance: moved * (1 + run.slip * 2) + run.slip * 4,
      accel: run.accel ?? 0,
      rearLocked: run.rearLocked,
    });

    // Асфальт: шины дымят и чернят дорогу; грунт: из-под колёс летит грязь.
    const asphalt = (this.test.surfaces?.[seg.type]?.grip ?? this.test.surface) === 'asphalt';
    this.#tireFx(dt, asphalt);
    const splash = !asphalt && (run.slip > 0.25 || (seg.type === 'deep' && run.v > 1));
    this.mud.setPosition(CAR_X - 80, GROUND_Y - 6);
    if (splash && !this.mud.emitting) this.mud.start();
    else if (!splash && this.mud.emitting) this.mud.stop();

    this.engine?.update(run, input);
    this.hud.render();
    this.sounds.update(run, input, seg.type);
    this.#renderMeters();
    this.#hints(run, seg);

    if (run.done) this.#finish();
  }

  #renderMeters() {
    const run = this.run;
    const len = this.test.track.length;
    const pos = this.loop ? run.x % len : Math.min(run.x, len);
    this.$marker.style.left = `${(pos / len) * 100}%`;
    if (this.loop) {
      // Объездная: путь крупно, справа — максимум заезда и рекорд.
      this.$pathValue.textContent = `${Math.round(run.x)} м`;
      const v = Math.round(run.log.topSpeed * 3.6);
      const best = Math.round(Math.max(gameState.flags.freeTopSpeed ?? 0, v));
      this.$pathSub.textContent = t('trial.freeSub', { v, best });
    } else {
      this.$pathValue.textContent = `${Math.round(pos)} м`;
      this.$pathSub.textContent = t('trial.ofTotal', { total: len });
    }
    const left = Math.max(0, 1 - run.damage / run.capacity);
    this.$dur.style.transform = `scaleX(${left})`;
    this.$dur.classList.toggle('is-bad', left < 0.35);
    this.$durValue.textContent = `${Math.round(left * 100)}%`;
    this.$durStat.classList.toggle('is-bad', left < 0.35);
  }

  /** Подсказка: что впереди и что делать прямо сейчас. */
  #hints(run, seg) {
    for (const e of run.events.splice(0)) {
      if (e.type === 'overrev') this.hud.say('overrev', 'warn');
      if (e.type === 'early') this.hud.say('early', 'warn');
    }
    if (!run.started) {
      if (run.green && run.t > 1.2) this.hud.say(run.auto ? 'goAuto' : 'goManual', 'warn');
      return;
    }
    if (run.sink > 0.25) return this.hud.say('sinking', 'warn');
    if (run.slip > 0.5) return this.hud.say('spin', 'warn');
    if (!run.auto && run.limiter && seg.type !== 'ruts')
      return this.hud.say(run.gear >= run.stats.ratios.length ? 'limiterTop' : 'limiter', 'warn');
    if (seg.type === 'deep') return this.hud.say('deepIn');
    if (seg.type === 'ruts') {
      return run.v > 6 ? this.hud.say('ruts', 'warn') : this.hud.say('rutsIn');
    }
    if (seg.type === 'limit' || this.#nextHazard(run)?.type === 'limit')
      if (run.v > 9 || seg.type !== 'limit')
        return this.hud.say('limit', run.v > 11 ? 'warn' : 'info');
    if (
      seg.type === 'pothole' ||
      (this.#nextHazard(run)?.type === 'pothole' &&
        this.#nextHazard(run).from - this.#local(run) < WARN_M)
    ) {
      return this.hud.say('bump', run.v > 5 ? 'warn' : 'info');
    }
    if (this.test.trap) {
      if (run.trapSpeed === undefined && this.test.trap.at - run.x < 60)
        return this.hud.say('trap');
      if (run.trapSpeed !== undefined) return this.hud.say('brakeZone', 'warn');
    }
    const next = this.#nextHazard(run);
    if (next && next.from - this.#local(run) < WARN_M) {
      return this.hud.say(next.type === 'deep' ? 'deep' : 'ruts');
    }
    this.hud.quiet();
  }

  /** Положение на рисунке трассы (на объездной — по кругу). */
  #local(run) {
    return this.loop ? run.x % this.test.track.length : run.x;
  }

  #nextHazard(run) {
    const x = this.#local(run);
    return this.test.track.segments.find((s) => s.from > x && HAZARDS.includes(s.type));
  }

  /** @param {boolean} [quit] объездная: «В гараж» */
  #finish(quit = false) {
    if (this.done) return;
    this.done = true;
    this.hud.setEnabled(false);
    this.mud.stop();
    this.engine?.stop();
    this.sounds.stop();
    this.result = summarize(this.run, this.best);
    const { reasonKey } = this.run;
    if (reasonKey === 'broken') {
      audio.playSfx(SFX.BREAK);
      this.car.drop(60);
      this.#puff(0x777777, this.car.x + 110, this.car.y - 50);
    } else if (reasonKey === 'traction') {
      this.spin = 1;
      this.#puff(0x5a4630, this.car.x - 82, this.car.y - 6);
    } else if (reasonKey === 'power') {
      this.#puff(0x5a4630, this.car.x - 82, this.car.y - 6);
    }
    if (this.run.ok) this.hud.say('finish', 'good');
    if (!quit) audio.playSfx(this.result.ok ? SFX.SUCCESS : SFX.FAIL);

    // Объездная — практика: не засчитывается, только рекорд дистанции.
    if (this.test.practice) {
      const m = Math.round(this.run.x);
      gameState.flags.freeBest = Math.max(gameState.flags.freeBest ?? 0, m);
      gameState.flags.freeTopSpeed = Math.max(
        gameState.flags.freeTopSpeed ?? 0,
        Math.round(this.run.log.topSpeed * 3.6),
      );
      if (!quit) this.hud.say('freeEnd', 'warn');
      this.time.delayedCall(quit ? 200 : 1600, () => this.goTo(SCENES.GARAGE));
      return;
    }
    this.time.delayedCall(1400, () => {
      recordResult('trial', { ...this.result, map: this.test.id });
      this.hud.setVisible(false);
      this.light.setVisible(false);
      const ok = this.result.ok;
      const close = showRunOverlay(this.ui, {
        ok,
        title: ok ? t('runOver.trialWin') : t('runOver.lose'),
        text: runOverText(gameState.lastResult),
        primary: ok
          ? { label: t('runOver.next'), onClick: () => this.goTo(SCENES.PALYCH) }
          : { label: t('runOver.retry'), onClick: () => this.goTo(SCENES.TRIAL) },
        details: { label: t('runOver.details'), onClick: () => this.goTo(SCENES.RESULT) },
      });
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, close);
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
