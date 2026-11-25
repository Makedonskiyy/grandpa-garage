import Phaser from 'phaser';
import { TireFx } from '../systems/TireFx.js';
import config from '../../data/config.json';
import car from '../../data/car.json';
import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, SFX, AMB } from '../config/constants.js';
import { buildCar, buildRivalCar, spinWheels } from '../systems/buildCar.js';
import { MARK2 } from '../systems/markII.js';
import { rivalProfile } from '../systems/rival.js';
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
import { DriveSounds } from '../systems/DriveSounds.js';
import { DriveHud } from '../ui/DriveHud.js';
import { CityWorld } from './cityWorld.js';

const cfg = config.race;
const MAX_SEC = 30; // дальше ждать нет смысла — Палыч давно на финише
/** Длина машины игрока, м (чертёж R34) — из неё масштаб метров на экране. */
const CAR_M = 4.6;
/** Точек мира на метр пути при масштабе машины игрока. */
const PPM = (car.size.width * cfg.carScale) / CAR_M;
const UI_K = 3; // слой интерфейса 1920×1080 = мир 640×360 × 3
const FONT = '"Onest Variable", Onest, system-ui, sans-serif';

/**
 * Заезд с Палычем (ТЗ 3.9): ночной проспект, 400 м по прямой. Камера едет за машиной
 * игрока — она стоит на месте, город бежит навстречу, Палыч на дальней полосе уходит
 * вперёд или отстаёт. Машину игрока ведёт физика drive.js; Палыч — кривая разгона
 * rival.js: реакция, срыв со старта, провалы на переключениях, финиш ровно за 13,0 с.
 * Сверху — секундомер и разрыв в метрах, Палыч за краем экрана — метка у края.
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
    this.total = this.test.formula.distance;
    this.rivalRun = rivalProfile({
      distance: this.total,
      time: this.test.rivalTime,
      reaction: this.run.ph.reaction.rival,
    });
    this.rivalDist = 0;
    this.said = new Set();
    this.shook = false;
    this.state = 'intro';

    this.world = new CityWorld(this, { seed: gameState.flags.worldSeed ?? 1, ppm: PPM });
    this.marks = this.#drawMarks(); // старт и финиш: полоса и арка над дорогой
    // Палыч — на дальней полосе, чуть меньше (дальше от зрителя).
    this.rival = buildRivalCar(this, {
      x: 0,
      y: cfg.rivalLaneY,
      scale: cfg.rivalScale,
      night: true,
    });
    this.rival.front = MARK2.front * cfg.rivalScale;
    this.rival.plateOffset = 100 * cfg.rivalScale;
    this.player = buildCar(this, gameState.build, gameState.cosmetics, {
      x: cfg.playerX,
      y: cfg.playerLaneY,
      scale: cfg.carScale,
      night: true,
      dirty: gameState.car.dirty,
    });
    this.player.front = cfg.playerFront * cfg.carScale;
    this.player.plateOffset = 92 * cfg.carScale;
    this.frontX = cfg.playerX + this.player.front; // передний бампер игрока на экране
    this.marks.back.x = this.frontX;
    this.marks.front.x = this.frontX;
    // Ближняя стойка и перекладина арки — поверх машин.
    this.children.bringToTop(this.marks.front);
    this.#nameplate(this.rival, t('race.rival'));
    this.#placeRival();
    this.fx = new TireFx(this, this.player); // дым из-под шин и след на асфальте

    this.#buildHud();
    // Светофор — на экране сверху; после зелёного уходит, на его место встаёт секундомер.
    this.light = new ScreenLight(this);
    this.light.setVisible(false);
    audio.playSfx(SFX.CAR_START);
    this.engine = audio.loopSfx(SFX.ENGINE);
    this.sounds = new DriveSounds(this, gameState.build.tires);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.engine?.destroy());

    this.hud.setVisible(false);
    this.$clock.style.visibility = 'hidden';
    this.hud.setEnabled(false);
    // «Попробовать снова» — сразу к старту, без реплик перед заездом.
    if (!data.retry) {
      await new StoryStage(this).play('preRace');
      // Пока шла сценка, игрок мог уйти из сцены.
      if (!this.scene.isActive()) return;
    }
    this.hud.setVisible(true);
    this.light.setVisible(true);
    this.$clock.style.visibility = '';
    this.$clock.classList.add('is-hidden');
    // Газ до старта уже работает: обороты набирают на красном и жёлтых.
    this.hud.setEnabled(true);
    this.state = 'tree';
    this.hud.setHintSlot('light');
    this.hud.say(this.run.auto ? 'launchAuto' : 'launch');
    this.#taunt('start');
    this.light.run(this.test.christmasTree, {
      onAmber: () => audio.playSfx(SFX.TREE_BEEP),
      onGreen: () => {
        if (this.state !== 'tree') return;
        audio.playSfx(SFX.TREE_GO);
        greenLight(this.run);
        this.state = 'running';
        this.hud.say(this.run.auto ? 'goAuto' : 'goManual', 'good');
      },
      // Светофор ушёл — на его месте секундомер, подсказки под ним.
      onHide: () => {
        this.$clock.classList.remove('is-hidden');
        this.hud.setHintSlot('clock');
      },
    });
  }

  #buildHud() {
    this.$time = el('div', { class: 'race-clock__value', text: '0,00' });
    this.$gap = el('div', { class: 'race-gap' });
    this.$clock = el('div', { class: 'ui-abs race-clock' }, [
      el('div', { class: 'race-clock__label', text: t('race.timer') }),
      this.$time,
      this.$gap,
    ]);
    // Метка Палыча у края экрана, когда он ушёл из кадра.
    this.$edgeText = el('span');
    this.$edge = el('div', { class: 'ui-abs rival-edge', hidden: true }, [this.$edgeText]);
    this.ui.append(this.$clock, this.$edge);
    this.hud = new DriveHud(this, this.run, { className: 'dash--race' });
  }

  /** x на экране для метра трассы — по переднему бамперу игрока. */
  #x(m) {
    return this.frontX + (m - this.run.x) * PPM;
  }

  /**
   * Старт и финиш на трассе (x — метры × PPM от старта): полоса поперёк обеих полос
   * и арка над дорогой. Полоса и дальняя стойка — под машинами, ближняя стойка
   * и перекладина с надписью — над ними: машины проезжают под аркой.
   */
  #drawMarks() {
    const back = this.add.container(0, 0);
    const front = this.add.container(0, 0);
    const g = this.add.graphics();
    back.add(g);
    const fg = this.add.graphics();
    front.add(fg);
    const fx = this.total * PPM;
    // Стартовая линия: широкая белая полоса с потёртостями; финиш — шахматка в три ряда.
    g.fillStyle(0xf2f0ea, 0.9).fillRect(-3, 162, 6, 140);
    for (let y = 164; y < 300; y += 9) g.fillStyle(0x2a2c30, 0.35).fillRect(-3, y, 6, 1);
    for (let y = 162, i = 0; y < 302; y += 4, i++)
      for (let k = 0; k < 3; k++)
        g.fillStyle((i + k) % 2 ? 0x111111 : 0xf4f4f0, 0.95).fillRect(fx - 6 + k * 4, y, 4, 4);
    const zoom = getRenderZoom();
    const arch = (x, text, finish) => {
      const L = x - 34;
      const R = x + 34;
      const top = 70;
      // Дальняя стойка у бордюра — за машинами, ближняя у края дороги — перед ними.
      g.fillStyle(0x2a2c30).fillRect(L - 2, top, 4, 160 - top);
      g.fillStyle(0x4a4d52).fillRect(L - 2, top, 1, 160 - top);
      fg.fillStyle(0x2a2c30).fillRect(R - 3, top, 6, 304 - top);
      fg.fillStyle(0x4a4d52).fillRect(R - 3, top, 2, 304 - top);
      fg.fillStyle(0x1a1b1e).fillRect(R - 6, 300, 12, 4);
      // Перекладина с баннером.
      fg.fillStyle(0x2a2c30).fillRect(L - 4, top - 4, R - L + 8, 4);
      if (finish) {
        for (let i = 0; i < (R - L) / 4; i++)
          for (let j = 0; j < 2; j++)
            fg.fillStyle((i + j) % 2 ? 0x111111 : 0xffffff).fillRect(L + i * 4, top, 4, 4);
      } else fg.fillStyle(0xc8202a).fillRect(L, top, R - L, 8);
      fg.fillStyle(finish ? 0x111111 : 0xf2f0ea).fillRect(L, top + 8, R - L, 13);
      front.add(
        this.add
          .text(x, top + 14.5, text, {
            fontFamily: FONT,
            fontSize: '10px',
            fontStyle: '800',
            color: finish ? '#ffffff' : '#c8202a',
          })
          .setOrigin(0.5)
          .setResolution(zoom),
      );
      // Лампы под перекладиной.
      for (const lx of [L + 8, x, R - 8]) fg.fillStyle(0xfff1c2).fillRect(lx - 1, top + 21, 2, 2);
    };
    arch(-6, t('race.startLine'), false);
    arch(fx, t('race.finishLine'), true);
    return { back, front };
  }

  #nameplate(carObj, name) {
    carObj.nameplate = this.add
      .text(carObj.x, carObj.y - carObj.plateOffset, name, {
        fontFamily: FONT,
        fontSize: '8px',
        fontStyle: '600',
        color: '#efe9de',
        backgroundColor: 'rgba(22, 21, 19, 0.85)',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setResolution(getRenderZoom());
  }

  /** Палыч на своей полосе — по его пройденным метрам относительно игрока. */
  #placeRival() {
    const x = this.#x(this.rivalDist) - this.rival.front;
    this.rival.x = x;
    this.rival.nameplate.setPosition(x, this.rival.y - this.rival.plateOffset);
    this.bubble?.setPosition(x, this.rival.y - this.rival.plateOffset - 10);
  }

  /** Реплика Палыча над его машиной — каждая не больше раза за заезд. */
  #taunt(key) {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.bubble?.destroy();
    const b = this.add
      .text(this.rival.x, this.rival.y - this.rival.plateOffset - 10, t(`race.taunts.${key}`), {
        fontFamily: FONT,
        fontSize: '8px',
        fontStyle: '600',
        color: '#1b1b1d',
        backgroundColor: '#f2efe6',
        padding: { x: 5, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setResolution(getRenderZoom())
      .setAlpha(0);
    this.bubble = b;
    this.tweens.add({ targets: b, alpha: 1, duration: 220 });
    this.time.delayedCall(2400, () => {
      if (!b.active) return;
      this.tweens.add({
        targets: b,
        alpha: 0,
        duration: 300,
        onComplete: () => {
          b.destroy();
          if (this.bubble === b) this.bubble = null;
        },
      });
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
      this.#tireFx(dt, false);
      this.hud.render();
      this.#sound();
      return;
    }

    const prevX = run.x;
    stepRun(run, input, dt);
    this.#hints(run);

    // Город, разметка и финиш едут навстречу; машина игрока стоит на месте.
    const scroll = run.x * PPM;
    this.world.update(scroll);
    this.marks.back.x = this.frontX - scroll;
    this.marks.front.x = this.frontX - scroll;
    const toWheel = (car.wheels.radius / run.ph.wheelRadius) * this.player.scaleX;
    this.player.step(dt, {
      distance: (run.x - prevX) * toWheel * (1 + run.slip * 2) + run.slip * 3,
      accel: run.accel ?? 0,
      rearLocked: run.rearLocked,
    });
    // Рывок камеры при срыве со старта.
    if (!this.shook && run.x > 0.3) {
      this.shook = true;
      this.cameras.main.shake(260, 0.004);
    }

    const prevRival = this.rivalDist;
    this.rivalDist = this.rivalRun.at(run.t);
    spinWheels(this.rival, (this.rivalDist - prevRival) * PPM);
    this.#placeRival();
    this.#gap();

    this.#tireFx(dt, true);
    this.hud.render();
    this.sounds.update(run, input, 'asphalt');
    this.$time.textContent = formatSeconds(run.t);
    this.#sound();

    const rivalDone = run.t >= this.test.rivalTime;
    if ((run.done && (rivalDone || run.reasonKey === 'jump')) || run.t > MAX_SEC) this.#finish();
  }

  /** Разрыв под секундомером, метка Палыча у края экрана, реплики по ходу. */
  #gap() {
    const d = Math.min(this.total, this.rivalDist) - Math.min(this.total, this.run.x);
    const m = Math.abs(d);
    const meters = m < 10 ? m.toFixed(1).replace('.', ',') : String(Math.round(m));
    if (m < 0.5) {
      this.$gap.textContent = t('race.gapEven');
      this.$gap.dataset.tone = '';
    } else if (d > 0) {
      this.$gap.textContent = t('race.gapRival', { m: meters });
      this.$gap.dataset.tone = 'bad';
    } else {
      this.$gap.textContent = t('race.gapYou', { m: meters });
      this.$gap.dataset.tone = 'good';
    }
    // Палыч за кадром — метка у края на высоте его полосы.
    const rx = this.rival.x;
    const half = this.rival.front;
    const off = rx - half > 640 ? 'right' : rx + half < 0 ? 'left' : null;
    this.$edge.hidden = !off;
    if (off) {
      this.$edge.dataset.side = off;
      this.$edge.style.top = `${(this.rival.y - 46) * UI_K}px`;
      this.$edgeText.textContent =
        off === 'right' ? `${t('race.rival')} +${meters} м ▶` : `◀ ${t('race.rival')} −${meters} м`;
    }
    if (this.run.x > 30) {
      if (d > 8) this.#taunt('ahead');
      if (d < -4) this.#taunt('behind');
    }
    if (this.rivalDist >= this.total && this.run.x < this.total) this.#taunt('won');
  }

  /** Дым и след шин; вне заезда новых клубов нет, старые дотаивают. */
  #tireFx(dt, live) {
    this.fx.update(dt, {
      run: this.run,
      toScreenX: (m) => cfg.playerX + (m - this.run.x) * PPM,
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
    if (this.result.ok) this.#taunt('lost');
    audio.playSfx(this.result.ok ? SFX.SUCCESS : SFX.FAIL);
    this.time.delayedCall(cfg.finishHoldMs, () => {
      recordResult('race', this.result);
      this.hud.setVisible(false);
      this.light.setVisible(false);
      this.$edge.hidden = true;
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
