/**
 * StartLight — стартовый светофор обкатки и заезда (пиксель-арт из tools/build-start-light.py).
 * Корпус с погашенными лампами и зажжённые лампы поверх: красная, три жёлтых, зелёная.
 *
 * Последовательность: красный (приготовиться) → жёлтые по одной → зелёный. Зелёный — момент,
 * с которого идёт время; тронулся раньше — фальстарт, и красная лампа мигает.
 */
import Phaser from 'phaser';
import layout from '../../data/start-light.json';

const PATH = 'assets/images/race/';
const KEYS = ['start_light', 'start_lamp_red', 'start_lamp_amber', 'start_lamp_green'];

export function preloadStartLight(scene) {
  for (const k of KEYS) scene.load.image(k, `${PATH}${k}.png`);
}

export class StartLight extends Phaser.GameObjects.Container {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x середина корпуса
   * @param {number} y верх корпуса
   * @param {{ scale?: number, pole?: number }} [opts] pole — длина столба вниз, единиц мира
   */
  constructor(scene, x, y, { scale = 1, pole = 0 } = {}) {
    super(scene, x, y);
    scene.add.existing(this);
    const [w, h] = layout.size;
    if (pole > 0) {
      this.add(scene.add.rectangle(0, h, 4, pole, 0x15161a).setOrigin(0.5, 0));
      this.add(scene.add.rectangle(-1, h, 1, pole, 0x2c2e34).setOrigin(0.5, 0));
    }
    this.add(scene.add.image(-w / 2, 0, 'start_light').setOrigin(0));
    this.lamps = layout.lamps.map(([lx, ly, kind]) =>
      scene.add
        .image(lx - w / 2, ly, `start_lamp_${kind}`)
        .setOrigin(0)
        .setVisible(false),
    );
    this.add(this.lamps);
    this.setScale(scale);
    this.timers = [];
  }

  /** Какие лампы горят: индексы 0 — красная, 1–3 — жёлтые, 4 — зелёная. */
  show(on = []) {
    this.lamps.forEach((l, i) => l.setVisible(on.includes(i)));
  }

  /**
   * Запуск: красный, через redHold — жёлтые по одной (или все сразу при ambers = 1),
   * затем случайная пауза и зелёный.
   * @param {{ redHoldSec: number, intervalSec: number, ambers: number, randomSec?: number }} cfg
   * @param {{ onAmber?: () => void, onGreen: () => void }} cb
   */
  run(cfg, { onAmber, onGreen }) {
    this.stop();
    const s = this.scene;
    this.show([0]);
    const ambers = cfg.ambers >= 3 ? [[1], [1, 2], [1, 2, 3]] : [[1, 2, 3]];
    let t = cfg.redHoldSec * 1000;
    ambers.forEach((lit) => {
      this.timers.push(
        s.time.delayedCall(t, () => {
          this.show([0, ...lit]);
          onAmber?.();
        }),
      );
      t += cfg.intervalSec * 1000;
    });
    t += Math.random() * (cfg.randomSec ?? 0) * 1000;
    this.timers.push(
      s.time.delayedCall(t, () => {
        this.show([4]);
        onGreen();
      }),
    );
  }

  /** Фальстарт: гаснет всё, красная мигает. */
  foul() {
    this.stop();
    this.show([0]);
    let on = true;
    this.timers.push(
      this.scene.time.addEvent({
        delay: 160,
        repeat: 9,
        callback: () => {
          on = !on;
          this.show(on ? [0] : []);
        },
      }),
    );
  }

  stop() {
    for (const tm of this.timers) tm.remove(false);
    this.timers = [];
  }
}
