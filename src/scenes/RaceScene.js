import Phaser from 'phaser';
import { TireFx } from '../systems/TireFx.js';
import config from '../../data/config.json';
import car from '../../data/car.json';
import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, SFX, AMB, WORLD } from '../config/constants.js';
import { buildCar, buildRivalCar, spinWheels } from '../systems/buildCar.js';
import { getTest, formatSeconds } from '../systems/simulate.js';
import { createRun, stepRun, greenLight, runBot, summarize } from '../systems/drive.js';
import { ScreenLight } from '../ui/ScreenLight.js';
import { showRunOverlay, runOverText } from '../ui/RunOverlay.js';
import { StoryStage } from '../systems/StoryStage.js';
import { audio } from '../systems/AudioManager.js';
import { getRenderZoom } from '../systems/scale.js';
import { getSettings } from '../systems/settings.js';
import { gameState, recordResult } from '../gameState.js';
import { el } from '../ui/dom.js';
import { t } from '../systems/strings.js';
import { DriveHud, DriveSounds } from '../ui/DriveHud.js';

const cfg = config.race;
/** Колесо «девятки»: 13 точек текстуры ≈ 0,29 м — точек на метр пути. */
const RIVAL_WHEEL_PX_PER_M = 13 / 0.29;
const MAX_SEC = 30; // дальше ждать нет смысла — Палыч давно на финише
/** Пустырь поднят над приборами: их верх — y ≈ 259 мира. */
const SHIFT = -40;

/** Детерминированный генератор: фон одинаков при каждом запуске. */
function rng(seed) {
  let v = seed;
  return () => (v = (v * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

/**
 * Заезд с Палычем (ТЗ 3.9): ночной пустырь за заводом, две машины, «ёлка» (3 жёлтых через
 * 0,6 с → зелёный). Машину игрока ведёт физика drive.js: газ, тормоз и передачи — от игрока;
 * до зелёного газ раскручивает мотор — обороты на старте решают, сорвутся ли колёса.
 * Палыч едет ровно за 13,0 с. Позиции машин — по переднему бамперу: обе пересекают одну линию.
 */
export class RaceScene extends BaseScene {
  constructor() {
    super(SCENES.RACE);
  }

  async create(data = {}) {
    this.enter();
    audio.playMusic(MUSIC.DRIVE);
    this.ambience = AMB.NIGHT;
    audio.playAmbience(this.ambience);

    this.test = getTest('race');
    const auto = getSettings().gearbox === 'auto';
    this.run = createRun('race', gameState.build, { condition: gameState.car, auto });
    this.best = runBot('race', gameState.build, { condition: gameState.car });
    // Палыч трогается с реакцией и всё равно финиширует ровно за 13,0 с от зелёного.
    this.rivalReaction = this.run.ph.reaction.rival;
    this.rivalAccel =
      (2 * this.test.formula.distance) / (this.test.rivalTime - this.rivalReaction) ** 2;
    this.state = 'intro';

    this.#drawNight();
    // Палыч — на дальней полосе, чуть меньше (дальше от зрителя): машины не сливаются.
    this.rival = buildRivalCar(this, {
      x: 0,
      y: cfg.rivalLaneY,
      scale: cfg.rivalScale,
      night: true,
    });
    this.rival.front = cfg.rivalFront * cfg.rivalScale;
    this.rival.plateOffset = 62 * cfg.rivalScale; // над крышей «девятки»
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
    this.fx = new TireFx(this, this.player); // дым из-под шин и след на асфальте

    this.#buildHud();
    // Светофор — на экране сверху; после зелёного уходит, на его место встаёт секундомер.
    this.light = new ScreenLight(this);
    this.light.setVisible(false);
    audio.playSfx(SFX.CAR_START);
    this.engine = audio.loopSfx(SFX.ENGINE);
    this.sounds = new DriveSounds(this, 'asphalt');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.engine?.destroy());

    this.hud.setVisible(false);
    this.$clock.style.visibility = 'hidden';
    this.hud.setEnabled(false);
    // «Попробовать снова» — сразу к старту, без реплик перед заездом.
    if (!data.retry) await new StoryStage(this).play('preRace');
    if (!this.scene.isActive()) return;
    this.hud.setVisible(true);
    this.light.setVisible(true);
    this.$clock.style.visibility = '';
    this.$clock.classList.add('is-hidden');
    // Газ до старта уже работает: обороты набирают на красном и жёлтых.
    this.hud.setEnabled(true);
    this.state = 'tree';
    this.hud.say(this.run.auto ? 'launchAuto' : 'launch');
    this.light.run(this.test.christmasTree, {
      onAmber: () => audio.playSfx(SFX.TREE_BEEP),
      onGreen: () => {
        if (this.state !== 'tree') return;
        audio.playSfx(SFX.TREE_GO);
        greenLight(this.run);
        this.state = 'running';
        this.hud.say(this.run.auto ? 'goAuto' : 'goManual', 'good');
        this.time.delayedCall(1500, () => this.$clock.classList.remove('is-hidden'));
      },
    });
  }

  #buildHud() {
    this.$time = el('div', { class: 'race-clock__value', text: '0,00' });
    this.$clock = el('div', { class: 'ui-abs race-clock' }, [
      el('div', { class: 'race-clock__label', text: t('race.timer') }),
      this.$time,
    ]);
    this.ui.append(this.$clock);
    this.hud = new DriveHud(this, this.run, { className: 'dash--race' });
  }

  /**
   * Ночной город: улица на окраине. Тёмное небо со звёздами и луной, панельные девятиэтажки
   * с горящими окнами и антеннами, ларёк «Продукты 24 часа» с вывеской, остановка,
   * троллейбусные провода, натриевые фонари с оранжевыми пятнами света, мокрый асфальт
   * с бликами, две полосы — дальняя для Палыча и ближняя для игрока, бордюр между ними.
   */
  #drawNight() {
    const { width, height } = WORLD;
    const r = rng(41);
    const g = this.add.graphics();
    // Небо ступенями, звёзды, луна.
    [0x05060c, 0x080a13, 0x0b0e19, 0x10131f, 0x161a27].forEach((c, i) =>
      g.fillStyle(c).fillRect(0, i * 30, width, 31),
    );
    for (let i = 0; i < 50; i++)
      g.fillStyle(0xcfd6ff, 0.6).fillRect(Math.floor(r() * width), Math.floor(r() * 90), 1, 1);
    g.fillStyle(0xe9e4cf).fillCircle(520, 34, 9);
    g.fillStyle(0x0b0e19).fillCircle(524, 31, 8);
    // Дальние панельки — силуэты с редкими окнами.
    let x = -10;
    while (x < width) {
      const w = 40 + Math.floor(r() * 50);
      const h = 50 + Math.floor(r() * 50);
      g.fillStyle(0x0e1019).fillRect(x, 150 - h, w, h + 10);
      for (let wy = 150 - h + 5; wy < 148; wy += 6)
        for (let wx = x + 3; wx < x + w - 4; wx += 5)
          if (r() < 0.14) g.fillStyle(r() < 0.8 ? 0xd9b56a : 0x8fb3ff, 0.75).fillRect(wx, wy, 2, 3);
      x += w + Math.floor(r() * 16);
    }
    // Ближние девятиэтажки: торцы с антеннами, балконы, окна (тёплые и «телевизорные»).
    x = 0;
    while (x < width) {
      const w = 90 + Math.floor(r() * 40);
      const top = 40 + Math.floor(r() * 30);
      g.fillStyle(0x161925).fillRect(x, top, w, 160 - top);
      g.fillStyle(0x1c2030).fillRect(x, top, w, 3);
      g.fillStyle(0x0f111a).fillRect(x + w - 4, top, 4, 160 - top);
      for (let k = 0; k < 3; k++) {
        const ax = x + 10 + Math.floor(r() * (w - 20));
        g.fillStyle(0x2a2e3a).fillRect(ax, top - 10, 1, 10);
        g.fillRect(ax - 4, top - 8, 9, 1);
      }
      for (let wy = top + 8; wy < 150; wy += 9)
        for (let wx = x + 6; wx < x + w - 10; wx += 11) {
          const v = r();
          const c = v < 0.22 ? 0xe8b864 : v < 0.27 ? 0x9ab8ff : 0x232838;
          g.fillStyle(c).fillRect(wx, wy, 6, 5);
          g.fillStyle(0x10121b).fillRect(wx - 1, wy + 5, 8, 1); // балконная плита
        }
      x += w + 14 + Math.floor(r() * 30);
    }
    // Ларёк «Продукты 24 часа» и остановка — на тротуаре за дальней полосой.
    const kx = 300;
    g.fillStyle(0x2c3a4a).fillRect(kx, 128, 64, 32);
    g.fillStyle(0xe8b864, 0.85).fillRect(kx + 6, 136, 52, 16);
    g.fillStyle(0x7c2a2a).fillRect(kx - 2, 122, 68, 8);
    const sign = this.add
      .text(kx + 32, 126, 'ПРОДУКТЫ 24', {
        fontFamily: '"Onest Variable", Onest, system-ui, sans-serif',
        fontSize: '6px',
        fontStyle: '700',
        color: '#ffe9b0',
      })
      .setOrigin(0.5)
      .setResolution(getRenderZoom());
    const bx = 120;
    g.fillStyle(0x3a3f4a).fillRect(bx, 130, 56, 3);
    g.fillStyle(0x3a3f4a).fillRect(bx + 2, 133, 2, 27);
    g.fillStyle(0x3a3f4a).fillRect(bx + 52, 133, 2, 27);
    g.fillStyle(0x5d7a92, 0.35).fillRect(bx + 4, 135, 48, 18);
    g.fillStyle(0x2f5fb4).fillRect(bx + 58, 128, 10, 8);
    g.fillStyle(0xffffff).fillRect(bx + 60, 131, 6, 1);
    // Тротуар, бордюры, асфальт; троллейбусные провода.
    g.fillStyle(0x2a2c33).fillRect(0, 160, width, 12);
    g.fillStyle(0x6a6c72).fillRect(0, 171, width, 2);
    g.fillStyle(0x1c1d24).fillRect(0, 173, width, height - 173 - SHIFT);
    for (let lx = 0; lx < width; lx += 32) g.fillStyle(0xd8d0bc, 0.7).fillRect(lx, 214, 16, 2);
    g.fillStyle(0x6a6c72).fillRect(0, 262, width, 2);
    for (let i = 0; i < 50; i++)
      g.fillStyle(0x2b2d36).fillRect(
        Math.floor(r() * width),
        176 + Math.floor(r() * 150),
        6 + Math.floor(r() * 10),
        1,
      );
    for (let wx = 0; wx < width; wx += 2) {
      const sag = Math.sin((wx / width) * Math.PI * 3) * 3;
      g.fillStyle(0x0a0b10).fillRect(wx, 92 + sag, 2, 1);
      g.fillRect(wx, 97 + sag, 2, 1);
    }
    // Старт и финиш (по переднему бамперу), обе полосы.
    g.fillStyle(0xd8d0bc).fillRect(cfg.startX, 176, 2, 112);
    for (let fy = 176; fy < 288; fy += 4) {
      g.fillStyle((fy / 4) % 2 ? 0xffffff : 0x111111).fillRect(cfg.finishX, fy, 2, 4);
      g.fillStyle((fy / 4) % 2 ? 0x111111 : 0xffffff).fillRect(cfg.finishX + 2, fy, 2, 4);
    }
    // Натриевые фонари: столбы, лампы, оранжевые пятна света ступенями (режим ADD).
    const light = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    for (const lx of [70, 250, 430, 610]) {
      g.fillStyle(0x0c0d13).fillRect(lx, 74, 3, 98);
      g.fillStyle(0x0c0d13).fillRect(lx, 74, 16, 3);
      g.fillStyle(0xffb259).fillRect(lx + 12, 77, 6, 2);
      for (const [w, a] of [
        [110, 0.03],
        [80, 0.035],
        [50, 0.04],
      ])
        light
          .fillStyle(0xffa040, a)
          .fillTriangle(lx + 15, 79, lx + 15 - w / 2, 262, lx + 15 + w / 2, 262);
      for (const [w, h, a] of [
        [150, 22, 0.04],
        [90, 12, 0.05],
      ])
        light.fillStyle(0xffa040, a).fillEllipse(lx + 15, 236, w, h);
    }
    // Мокрый асфальт: отражения фонарей и окон полосками.
    for (const lx of [70, 250, 430, 610])
      for (let y = 240; y < 320; y += 6)
        light.fillStyle(0xffa040, 0.05).fillRect(lx + 10, y, 10, 2);
    g.y = SHIFT;
    light.y = SHIFT;
    sign.y += SHIFT;
  }

  #nameplate(car, name) {
    const zoom = getRenderZoom();
    car.nameplate = this.add
      .text(car.x, car.y - car.plateOffset, name, {
        fontFamily: '"Onest Variable", Onest, system-ui, sans-serif',
        fontSize: '8px',
        fontStyle: '600',
        color: '#efe9de',
        backgroundColor: 'rgba(22, 21, 19, 0.85)',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setResolution(zoom);
  }

  /** Положение передка по пройденному пути → координата центра машины. */
  #xFor(car, distance) {
    const { distance: total } = this.test.formula;
    const front = cfg.startX + (Math.min(distance, total) / total) * (cfg.finishX - cfg.startX);
    return front - car.front;
  }

  update(_time, delta) {
    if (!this.hud) return;
    const dt = delta / 1000;
    const input = this.hud.input(dt);
    const run = this.run;
    if (this.state === 'tree') {
      stepRun(run, input, dt); // мотор на нейтрали, до зелёного
      if (run.done) return this.#finish(); // тронулся раньше — фальстарт
    }
    if (this.state !== 'running') {
      // Подвеска успокаивается до старта и после финиша; перегазовка чуть приседает.
      const rev = this.state === 'tree' ? input.gas * 0.8 : 0;
      this.player.step(dt, { accel: rev - input.brake * 2 });
      this.#tireFx(dt, false);
      this.hud.render();
      this.#sound();
      return;
    }

    const prevX = run.x;
    stepRun(run, input, dt);
    this.#hints(run);
    const s = run.t;
    const rs = Math.max(0, s - this.rivalReaction);
    const rivalDist = Math.min(this.test.formula.distance, (this.rivalAccel * rs * rs) / 2);

    // Колёса крутятся по реальным метрам, а не по сжатой на экране дистанции:
    // 400 м — это ~400 точек, и по экрану диски почти стояли бы. При пробуксовке — быстрее.
    const meX = this.#xFor(this.player, run.x);
    const toWheel = (car.wheels.radius / run.ph.wheelRadius) * this.player.scaleX;
    this.player.step(dt, {
      distance: (run.x - prevX) * toWheel * (1 + run.slip * 2) + run.slip * 3,
      accel: run.accel ?? 0,
    });
    this.player.x = meX;
    this.player.nameplate.x = meX;
    const rx = this.#xFor(this.rival, rivalDist);
    spinWheels(this.rival, (rivalDist - (this.rivalPrev ?? 0)) * RIVAL_WHEEL_PX_PER_M);
    this.rivalPrev = rivalDist;
    this.rival.x = rx;
    this.rival.nameplate.x = rx;

    this.#tireFx(dt, true);

    this.hud.render();
    this.sounds.update(run);
    this.$time.textContent = formatSeconds(run.t);
    this.#sound();

    const rivalDone = s >= this.test.rivalTime;
    if ((run.done && (rivalDone || run.reasonKey === 'jump')) || s > MAX_SEC) this.#finish();
  }

  /** Дым и след шин; вне заезда новых клубов нет, старые дотаивают. */
  #tireFx(dt, live) {
    this.fx.update(dt, {
      run: this.run,
      toScreenX: (m) => this.#xFor(this.player, m),
      groundY: cfg.playerLaneY,
      asphalt: live,
    });
  }

  /** Подсказка по ситуации: пробуксовка, отсечка, пора переключаться. */
  #hints(run) {
    for (const e of run.events.splice(0)) if (e.type === 'overrev') this.hud.say('overrev', 'warn');
    if (run.done) return this.hud.say('finish', 'good');
    if (!run.started)
      return run.t > 1.2 ? this.hud.say(run.auto ? 'goAuto' : 'goManual', 'warn') : null;
    if (run.slip > 0.5) return this.hud.say('spin', 'warn');
    if (!run.auto && run.limiter)
      return this.hud.say(run.gear >= run.stats.ratios.length ? 'limiterTop' : 'limiter', 'warn');
    if (!run.auto && this.hud.inZone) return this.hud.say('shift');
    this.hud.quiet();
  }

  #sound() {
    this.engine?.setRate?.(0.6 + (this.run.rpm / this.run.stats.redline) * 0.9);
  }

  #finish() {
    if (this.state === 'finished') return;
    this.state = 'finished';
    if (this.run.reasonKey === 'jump') {
      this.light.foul();
      audio.playSfx(SFX.FOUL);
      this.hud.say('jump', 'warn');
    }
    this.hud.setEnabled(false);
    this.fx.stop();
    this.engine?.stop();
    this.sounds.stop();
    // Не доехал за отведённое время — итог по тому, что успел.
    if (!this.run.done) {
      this.run.done = true;
      this.run.reasonKey = 'slow';
    }
    this.result = summarize(this.run, this.best);
    this.$time.textContent = formatSeconds(this.run.t);
    audio.playSfx(this.result.ok ? SFX.SUCCESS : SFX.FAIL);
    this.time.delayedCall(cfg.finishHoldMs, () => {
      recordResult('race', this.result);
      this.hud.setVisible(false);
      this.light.setVisible(false);
      const ok = this.result.ok;
      const close = showRunOverlay(this.ui, {
        ok,
        title: ok ? t('runOver.raceWin') : t('runOver.lose'),
        text: runOverText(gameState.lastResult),
        primary: ok
          ? { label: t('runOver.next'), onClick: () => this.goTo(SCENES.ENDING) }
          : { label: t('runOver.retry'), onClick: () => this.goTo(SCENES.RACE, { retry: true }) },
        details: { label: t('runOver.details'), onClick: () => this.goTo(SCENES.RESULT) },
      });
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, close);
    });
  }
}
