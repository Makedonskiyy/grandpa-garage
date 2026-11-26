import Phaser from 'phaser';
import { TireFx } from '../systems/TireFx.js';
import config from '../../data/config.json';
import car from '../../data/car.json';
import cosmetics from '../../data/cosmetics.json';
import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, SFX, AMB } from '../config/constants.js';
import { buildCar, buildRivalCar } from '../systems/buildCar.js';
import { garageExit } from '../ui/GarageExit.js';
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
import { DUEL_COUNTDOWN_MS, DUEL_DISTANCE, DUEL_SECONDS } from '../../server/duel-rules.js';
import { duelBuild, duelCondition, leaveLobby, lobbyRequest } from '../systems/multiplayer.js';

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
    this.enter({ steadyCamera: true });
    audio.playMusic(MUSIC.DRIVE);
    this.ambience = AMB.NIGHT;
    audio.playAmbience(this.ambience);

    this.test = getTest('race');
    this.duel = data.duel ? { ...data.duel } : null;
    const build = this.duel ? duelBuild : gameState.build;
    const condition = this.duel ? duelCondition : gameState.car;
    const auto = !this.duel && getSettings().gearbox === 'auto';
    this.run = createRun('race', build, { condition, auto });
    this.best = this.duel ? null : runBot('race', build, { condition });
    this.total = this.duel ? DUEL_DISTANCE : this.test.formula.distance;
    this.run.length = this.total;
    this.rivalName = this.duel?.rival ?? t('race.rival');
    this.rivalRun = rivalProfile({
      distance: this.total,
      time: this.test.rivalTime,
      reaction: this.run.ph.reaction.rival,
    });
    this.rivalDist = 0;
    this.said = new Set();
    this.viewDistance = 0;
    this.coastSpeed = 0;
    this.state = 'intro';

    this.world = new CityWorld(this, {
      seed: this.duel ? 1 : (gameState.flags.worldSeed ?? 1),
      ppm: PPM,
    });
    this.marks = this.#drawMarks(); // старт и финиш: полоса и арка над дорогой
    // Заглушка Палыча на дальней полосе в масштабе машины игрока.
    const rivalPose = {
      x: 0,
      y: cfg.rivalLaneY,
      scale: cfg.carScale,
    };
    this.rival = this.duel
      ? buildCar(
          this,
          build,
          { ...cosmetics.defaults, paint: 'blue' },
          { ...rivalPose, night: true },
        )
      : buildRivalCar(this, rivalPose);
    this.rival.front = cfg.playerFront * cfg.carScale;
    this.rival.plateOffset = 100 * cfg.carScale;
    this.player = buildCar(this, build, this.duel ? cosmetics.defaults : gameState.cosmetics, {
      x: cfg.playerX,
      y: cfg.playerLaneY,
      scale: cfg.carScale,
      night: true,
      dirty: condition.dirty && 'dust',
    });
    this.player.front = cfg.playerFront * cfg.carScale;
    this.player.plateOffset = 92 * cfg.carScale;
    this.frontX = cfg.playerX + this.player.front; // передний бампер игрока на экране
    this.marks.back.x = this.frontX;
    this.marks.front.x = this.frontX;
    // Ближняя стойка и перекладина арки — поверх машин.
    this.children.bringToTop(this.marks.front);
    this.#nameplate(this.rival, this.rivalName);
    this.#placeRival();
    this.fx = new TireFx(this, this.player); // дым из-под шин и след на асфальте

    this.#buildHud();
    // Светофор — на экране сверху; после зелёного уходит, на его место встаёт секундомер.
    this.light = new ScreenLight(this);
    this.light.setVisible(false);
    this.engine = audio.startEngine(build, this.run);
    this.sounds = new DriveSounds(this, build.tires);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.engine?.stop());

    this.hud.setVisible(false);
    this.$clock.style.visibility = 'hidden';
    this.hud.setEnabled(false);
    // «Попробовать снова» — сразу к старту, без реплик перед заездом.
    if (!this.duel && !data.retry) {
      await new StoryStage(this).play('preRace');
      // Пока шла сценка, игрок мог уйти из сцены.
      if (!this.scene.isActive() || this._leaving) return;
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
    if (this.duel) {
      const { token } = this.duel;
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => leaveLobby(token));
      this.duel.lastContact = performance.now();
      this.duel.nextPoll = 0;
      this.light.show([0]);
      return;
    }
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
    this.$progress = el('progress', {
      class: 'race-progress',
      max: this.total,
      value: 0,
      'aria-label': t('race.progress'),
    });
    this.$clock = el('div', { class: 'ui-abs race-clock' }, [
      el('div', { class: 'race-clock__label', text: t('race.timer') }),
      this.$time,
      this.$gap,
      this.$progress,
    ]);
    // Метка Палыча у края экрана, когда он ушёл из кадра.
    this.$edgeText = el('span');
    this.$edge = el('div', { class: 'ui-abs rival-edge', hidden: true }, [this.$edgeText]);
    this.ui.append(
      this.$clock,
      this.$edge,
      garageExit(() => {
        this.light.stop();
        this.hud.setEnabled(false);
        this.engine?.stop();
        this.sounds.stop();
        this.goTo(SCENES.GARAGE);
      }),
    );
    this.hud = new DriveHud(this, this.run, { className: 'dash--race' });
  }

  /** x на экране для метра трассы — по переднему бамперу игрока. */
  #x(m) {
    return this.frontX + (m - this.viewDistance) * PPM;
  }

  #scrollTrack() {
    const scroll = this.viewDistance * PPM;
    this.world.update(scroll);
    this.marks.back.x = this.frontX - scroll;
    this.marks.front.x = this.frontX - scroll;
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
    if (this.duel || this.said.has(key)) return;
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
    if (!this.hud || this._leaving) return;
    const dt = delta / 1000;
    const input = this.hud.input(dt);
    const run = this.run;
    if (this.duel) this.#updateDuel(dt);
    if (this.state === 'tree') {
      stepRun(run, input, dt); // мотор на нейтрали, до зелёного
      if (run.done) return this.#finish(); // тронулся раньше — фальстарт
    }
    if (this.state !== 'running') {
      // После финиша машина докатывается. Время и дистанция результата уже зафиксированы.
      const previousSpeed = this.coastSpeed;
      this.coastSpeed = Math.max(0, this.coastSpeed - dt * 22);
      const coast = (previousSpeed + this.coastSpeed) * 0.5 * dt;
      if (coast > 0) {
        this.viewDistance += coast;
        this.#scrollTrack();
        this.#placeRival();
      }
      this.player.step(dt, {
        distance: coast * (car.wheels.radius / run.ph.wheelRadius) * this.player.scaleX,
        accel: dt > 0 ? (this.coastSpeed - previousSpeed) / dt : 0,
      });
      this.#tireFx(dt, false);
      this.hud.render();
      this.engine?.update(run, input);
      return;
    }

    const prevX = run.x;
    stepRun(run, input, dt);
    if (!this.duel && prevX <= 20 && run.x > 20) this.player.setRoadDirt('dust');
    this.#hints(run);

    // Город, разметка и финиш едут навстречу; машина игрока стоит на месте.
    this.viewDistance = run.x;
    this.#scrollTrack();
    const toWheel = (car.wheels.radius / run.ph.wheelRadius) * this.player.scaleX;
    this.player.step(dt, {
      distance: (run.x - prevX) * toWheel * (1 + run.slip * 2) + run.slip * 3,
      accel: run.accel ?? 0,
      rearLocked: run.rearLocked,
    });
    if (!this.duel) this.rivalDist = this.rivalRun.at(run.t);
    this.#placeRival();
    this.#gap();

    this.#tireFx(dt, true);
    this.hud.render();
    this.sounds.update(run, input, 'asphalt');
    this.$time.textContent = formatSeconds(run.t);
    this.$progress.value = Math.min(this.total, run.x);
    this.engine?.update(run, input);

    if (run.done || (this.duel ? this.#duelElapsed() >= DUEL_SECONDS : run.t >= MAX_SEC))
      this.#finish();
  }

  #duelElapsed() {
    return (performance.now() + this.duel.clockOffset - this.duel.startAt) / 1000;
  }

  #updateDuel(dt) {
    const duel = this.duel;
    if (duel.closed) return;
    const now = performance.now();
    const elapsed = this.#duelElapsed();
    if (this.state === 'tree') {
      const phase = Math.min(3, Math.max(0, Math.floor(4 + elapsed / (DUEL_COUNTDOWN_MS / 4000))));
      if (elapsed >= 0) {
        this.light.show([4]);
        audio.playSfx(SFX.TREE_GO);
        greenLight(this.run);
        this.state = 'running';
        this.time.delayedCall(1400, () => {
          this.light.hide();
          this.$clock.classList.remove('is-hidden');
          this.hud.setHintSlot('clock');
        });
      } else if (duel.phase !== phase) {
        duel.phase = phase;
        this.light.show([0, 1, 2, 3].slice(0, phase + 1));
        if (phase > 0) audio.playSfx(SFX.TREE_BEEP);
      }
    }
    const previous = this.rivalDist;
    this.rivalDist += Math.max(0, (duel.peer?.distance ?? 0) - previous) * Math.min(1, dt * 12);
    if (duel.peer?.done && duel.peer.distance - this.rivalDist < 0.1) {
      this.rivalDist = duel.peer.distance;
    }
    this.rival.step(dt, { distance: (this.rivalDist - previous) * PPM });
    this.#placeRival();
    if (now - duel.lastContact > 12000) return this.#showDuelResult(null);
    if (duel.pending || now < duel.nextPoll) return;
    duel.pending = true;
    duel.nextPoll = now + 150;
    const state = duel.final ?? { distance: this.run.x, elapsed: Math.max(0, elapsed) };
    if (state.elapsed > DUEL_SECONDS && !duel.final) state.elapsed = DUEL_SECONDS;
    void lobbyRequest({ action: 'tick', id: duel.id, state }, duel.token)
      .then((next) => {
        if (!this.scene.isActive() || this._leaving || this.duel !== duel) return;
        duel.lastContact = performance.now();
        if (next.race?.id !== duel.id) return this.#showDuelResult(null);
        duel.peer = next.race.peer;
        if (next.race.result) this.#showDuelResult(next.race.result);
      })
      .catch((error) => {
        if (error.status === 401 && this.scene.isActive() && this.duel === duel && !this._leaving)
          this.#showDuelResult(null);
      })
      .finally(() => {
        duel.pending = false;
      });
  }

  #showDuelResult(result) {
    if (this.duel.closed) return;
    this.duel.closed = true;
    this.state = 'finished';
    this.coastSpeed = 0;
    this.hud.setEnabled(false);
    this.hud.setVisible(false);
    this.light.stop();
    this.light.setVisible(false);
    this.engine?.stop();
    this.sounds.stop();
    this.fx.stop();
    this.$clock.classList.add('is-hidden');
    this.$edge.hidden = true;
    const won = result?.winner === this.duel.playerId;
    const own = this.duel.final;
    const peer = this.duel.peer;
    const time = (state) =>
      state?.done === 'finish' ? formatSeconds(state.elapsed) + ' с' : 'нет финиша';
    const title = !result
      ? 'Связь с лобби потеряна'
      : result.reason === 'left'
        ? 'Соперник вышел'
        : result.winner === null
          ? 'Ничья'
          : won
            ? 'Вы выиграли'
            : 'Вы проиграли';
    const close = showRunOverlay(this.ui, {
      ok: won,
      title,
      text:
        result?.reason === 'finish'
          ? `Ваше время — ${time(own)}. ${this.rivalName} — ${time(peer)}.`
          : '',
      primaryIcon: 'garage',
      primary: { label: 'В гараж', onClick: () => this.goTo(SCENES.GARAGE) },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, close);
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
      this.$gap.textContent = this.duel
        ? `${this.rivalName} впереди на ${meters} м`
        : t('race.gapRival', { m: meters });
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
        off === 'right' ? `${this.rivalName} +${meters} м ▶` : `◀ ${this.rivalName} −${meters} м`;
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
    if (!run.auto && run.limiter && run.drive > 0)
      return this.hud.say(run.gear >= run.stats.ratios.length ? 'limiterTop' : 'limiter', 'warn');
    if (!run.auto && this.hud.inZone) return this.hud.say('shift');
    this.hud.quiet();
  }

  #finish() {
    if (this.state === 'finished') return;
    this.state = 'finished';
    this.coastSpeed = this.run.reasonKey === 'broken' ? 0 : this.run.v;
    if (this.run.reasonKey === 'jump') {
      this.light.foul();
      audio.playSfx(SFX.FOUL);
      this.hud.say('jump', 'warn');
    }
    this.hud.setEnabled(false);
    this.fx.stop();
    this.engine?.stop();
    this.sounds.stop();
    if (this.duel) {
      const distance = Math.min(this.total, this.run.x);
      const elapsed = Math.min(DUEL_SECONDS, Math.max(0, this.#duelElapsed()));
      this.duel.final = { distance, elapsed, done: distance >= this.total ? 'finish' : 'dnf' };
      this.$gap.textContent = 'Ждём результат соперника';
      return;
    }
    // Не доехал за отведённое время — итог по тому, что успел.
    if (!this.run.done) {
      this.run.done = true;
      this.run.reasonKey = 'slow';
    }
    this.result = summarize(this.run, this.best);
    if (this.run.reasonKey === 'broken') audio.playSfx(SFX.BREAK);
    this.$time.textContent = formatSeconds(this.run.t);
    if (this.result.ok) this.#taunt('lost');
    audio.playSfx(this.result.ok ? SFX.SUCCESS : SFX.FAIL);
    recordResult('race', this.result);
    this.time.delayedCall(cfg.finishHoldMs, () => {
      if (this._leaving) return;
      this.hud.setVisible(false);
      this.light.setVisible(false);
      this.$edge.hidden = true;
      this.$clock.classList.add('is-hidden');
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
