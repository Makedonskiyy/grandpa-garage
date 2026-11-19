import Phaser from 'phaser';
import config from '../../data/config.json';
import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, SFX, AMB, WORLD } from '../config/constants.js';
import { buildCar, buildRivalCar, spinWheels } from '../systems/buildCar.js';
import { getTest, formatSeconds } from '../systems/simulate.js';
import { createRun, stepRun, greenLight, runBot, summarize } from '../systems/drive.js';
import { StartLight } from '../systems/StartLight.js';
import { StoryStage } from '../systems/StoryStage.js';
import { audio } from '../systems/AudioManager.js';
import { getRenderZoom } from '../systems/scale.js';
import { getSettings } from '../systems/settings.js';
import { gameState, recordResult } from '../gameState.js';
import { el } from '../ui/dom.js';
import { t } from '../systems/strings.js';
import { DriveHud, DriveSounds } from '../ui/DriveHud.js';

const cfg = config.race;
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

  async create() {
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
    this.light = new StartLight(this, WORLD.width - 26, 34, { scale: 1.25, pole: 76 });
    this.smoke = this.#makeSmoke();

    this.#buildHud();
    audio.playSfx(SFX.CAR_START);
    this.engine = audio.loopSfx(SFX.ENGINE);
    this.sounds = new DriveSounds(this, 'asphalt');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.engine?.destroy());

    this.hud.setVisible(false);
    this.$clock.style.visibility = 'hidden';
    this.hud.setEnabled(false);
    await new StoryStage(this).play('preRace');
    if (!this.scene.isActive()) return;
    this.hud.setVisible(true);
    this.$clock.style.visibility = '';
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
    g.fillStyle(0x1c1d24).fillRect(0, 190, width, height - 190 - SHIFT);
    // Разметка полос и мокрые отблески.
    for (let lx = 0; lx < width; lx += 32) g.fillStyle(0x3a3a40).fillRect(lx, 250, 16, 2);
    for (let i = 0; i < 40; i++) {
      g.fillStyle(0x2b2d36).fillRect(
        Math.floor(r() * width),
        200 + Math.floor(r() * 150),
        6 + Math.floor(r() * 10),
        1,
      );
    }
    // Старт и финиш (по переднему бамперу).
    g.fillStyle(0xd8d0bc).fillRect(cfg.startX, 190, 2, 106);
    for (let fy = 190; fy < 296; fy += 4) {
      g.fillStyle((fy / 4) % 2 ? 0xffffff : 0x111111).fillRect(cfg.finishX, fy, 2, 4);
      g.fillStyle((fy / 4) % 2 ? 0x111111 : 0xffffff).fillRect(cfg.finishX + 2, fy, 2, 4);
    }
    // Прожектор слева и пятно света на асфальте — ступенями, режим ADD.
    g.fillStyle(0x0c0d13).fillRect(36, 70, 3, 120);
    g.fillStyle(0x2a2c35).fillRect(30, 64, 16, 8);
    const light = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    g.y = SHIFT;
    light.y = SHIFT;
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

  /** Дым из-под задних колёс при пробуксовке. */
  #makeSmoke() {
    if (!this.textures.exists('smoke_px')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff).fillRect(0, 0, 4, 4);
      g.generateTexture('smoke_px', 4, 4);
      g.destroy();
    }
    return this.add.particles(0, 0, 'smoke_px', {
      speedX: { min: -60, max: -20 },
      speedY: { min: -18, max: -4 },
      scale: { start: 1.2, end: 4 },
      alpha: { start: 0.35, end: 0 },
      tint: 0xb8bcc4,
      lifespan: 900,
      frequency: 40,
      emitting: false,
    });
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

    // Колёса крутятся быстрее пути, когда буксуют.
    const px = (m) => (m / this.test.formula.distance) * (cfg.finishX - cfg.startX);
    const meX = this.#xFor(this.player, run.x);
    this.player.step(dt, {
      distance: px(run.x - prevX) * (1 + run.slip * 2) + run.slip * 3,
      accel: run.accel ?? 0,
    });
    this.player.x = meX;
    this.player.nameplate.x = meX;
    const rx = this.#xFor(this.rival, rivalDist);
    spinWheels(this.rival, rx - this.rival.x);
    this.rival.x = rx;
    this.rival.nameplate.x = rx;

    const spinning = run.slip > run.ph.slip.smokeAt;
    this.smoke.setPosition(this.player.x - 70 * cfg.carScale, cfg.playerLaneY - 4);
    if (spinning && !this.smoke.emitting) this.smoke.start();
    else if (!spinning && this.smoke.emitting) this.smoke.stop();

    this.hud.render();
    this.sounds.update(run);
    this.$time.textContent = formatSeconds(run.t);
    this.#sound();

    const rivalDone = s >= this.test.rivalTime;
    if ((run.done && (rivalDone || run.reasonKey === 'jump')) || s > MAX_SEC) this.#finish();
  }

  /** Подсказка по ситуации: пробуксовка, отсечка, пора переключаться. */
  #hints(run) {
    for (const e of run.events.splice(0)) if (e.type === 'overrev') this.hud.say('overrev', 'warn');
    if (run.done) return this.hud.say('finish', 'good');
    if (!run.started)
      return run.t > 1.2 ? this.hud.say(run.auto ? 'goAuto' : 'goManual', 'warn') : null;
    if (run.slip > 0.5) return this.hud.say('spin', 'warn');
    if (!run.auto && run.limiter) return this.hud.say('limiter', 'warn');
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
    this.smoke.stop();
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
      this.goTo(SCENES.RESULT);
    });
  }
}
