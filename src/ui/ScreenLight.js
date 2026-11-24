/**
 * ScreenLight — стартовый светофор на экране, сверху по центру: горизонтальная плашка
 * с пятью лампами (красная, три жёлтые, зелёная). Тот же порядок и те же вызовы,
 * что у дорожного StartLight (run / foul / stop), но это слой интерфейса: его видно
 * на любой карте и при любом размере окна. После зелёного плавно уходит вверх.
 */
import { el } from './dom.js';

const COLORS = ['red', 'amber', 'amber', 'amber', 'green'];

export class ScreenLight {
  /**
   * @param {import('phaser').Scene & { ui: HTMLElement }} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.timers = [];
    this.lamps = COLORS.map((c) => el('span', { class: 'screen-light__lamp', 'data-color': c }));
    this.node = el(
      'div',
      { class: 'ui-abs screen-light', role: 'img', 'aria-label': 'Светофор' },
      this.lamps,
    );
    scene.ui.append(this.node);
  }

  /** Какие лампы горят: индексы 0 — красная, 1–3 — жёлтые, 4 — зелёная. */
  show(on = []) {
    this.lamps.forEach((l, i) => l.classList.toggle('is-on', on.includes(i)));
  }

  /**
   * Запуск: красный, через redHold — жёлтые по одной (или все сразу при ambers = 1),
   * затем случайная пауза и зелёный. После зелёного светофор уходит через hideSec.
   * @param {{ redHoldSec: number, intervalSec: number, ambers: number, randomSec?: number }} cfg
   * @param {{ onAmber?: () => void, onGreen: () => void, hideSec?: number }} cb
   */
  run(cfg, { onAmber, onGreen, hideSec = 1.4 }) {
    this.stop();
    this.node.classList.remove('is-gone');
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
        this.timers.push(s.time.delayedCall(hideSec * 1000, () => this.hide()));
      }),
    );
  }

  /** Плавно убрать с экрана. */
  hide() {
    this.node.classList.add('is-gone');
  }

  /** Фальстарт: всё гаснет, красная мигает. */
  foul() {
    this.stop();
    this.node.classList.remove('is-gone');
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

  setVisible(on) {
    this.node.style.visibility = on ? '' : 'hidden';
  }
}
