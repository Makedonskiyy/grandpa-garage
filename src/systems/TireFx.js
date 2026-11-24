/**
 * TireFx — дым из-под шин и чёрный след на асфальте.
 *
 * Дым идёт по физике заезда: при пробуксовке (run.slip — тяга сверх сцепления) и при
 * торможении у предела сцепления (run.lock). На грунте шины не дымят — там летит грязь,
 * её показывает сама сцена.
 *
 * Клубы и следы привязаны к земле, а не к экрану: каждый помнит метр трассы, где родился,
 * и сцена переводит метры в экран (toScreenX). Поэтому дым остаётся висеть там, где машина
 * буксовала, и уплывает назад, когда она уезжает, — и на бегущей дороге обкатки, и на
 * неподвижной улице заезда.
 */
import Phaser from 'phaser';
import car from '../../data/car.json';

const PUFF_KEYS = ['fx_smoke_0', 'fx_smoke_1', 'fx_smoke_2'];
const PUFF_SIZE = 64;
const MAX_PUFFS = 140;
const MARK_LIFE = 9; // с — след медленно бледнеет
const MAX_MARKS = 600;
const SMOKE_COLOR = 0xdcdee3;
const MARK_COLOR = 0x0b0b0c;

/** Мягкий комок дыма: несколько размытых пятен — у каждого варианта своя форма. */
function puffTextures(scene) {
  PUFF_KEYS.forEach((key, i) => {
    if (scene.textures.exists(key)) return;
    const c = document.createElement('canvas');
    c.width = PUFF_SIZE;
    c.height = PUFF_SIZE;
    const ctx = c.getContext('2d');
    let seed = 17 + i * 31;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const blob = (x, y, r, a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.55, `rgba(255,255,255,${a * 0.55})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const h = PUFF_SIZE / 2;
    blob(h, h, h * 0.95, 0.55);
    for (let k = 0; k < 6; k++) {
      const ang = rnd() * Math.PI * 2;
      const d = h * (0.2 + rnd() * 0.35);
      blob(h + Math.cos(ang) * d, h + Math.sin(ang) * d, h * (0.35 + rnd() * 0.25), 0.4);
    }
    scene.textures.addCanvas(key, c);
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
  });
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class TireFx {
  /**
   * @param {Phaser.Scene} scene
   * @param {import('./CarRig.js').CarRig} rig машина игрока: колёса, масштаб, слой
   */
  constructor(scene, rig) {
    this.scene = scene;
    this.rig = rig;
    puffTextures(scene);
    // След — на дороге, дым — за кузовом: клубы выползают из-под шин и поднимаются
    // вокруг машины, а колёса и кузов остаются читаемыми.
    this.marks = scene.add.graphics();
    scene.children.moveBelow(this.marks, rig);
    this.smokeLayer = scene.add.container(0, 0);
    scene.children.moveBelow(this.smokeLayer, rig);
    this.pool = [];
    this.puffs = [];
    this.markList = [];
    this.last = { rear: null, front: null }; // прошлая точка следа каждой оси
    this.carry = { rear: 0, front: 0 }; // дробная часть клубов, накопленная между кадрами
  }

  /** Клуб из пула. */
  #take() {
    const img = this.pool.pop() ?? this.scene.add.image(0, 0, PUFF_KEYS[0]);
    img.setTexture(Phaser.Utils.Array.GetRandom(PUFF_KEYS)).setVisible(true).setTint(SMOKE_COLOR);
    this.smokeLayer.add(img);
    return img;
  }

  /**
   * Кадр эффектов.
   * @param {number} dt секунды
   * @param {object} o
   * @param {object} o.run заезд (slip, lock, v, x)
   * @param {(m: number) => number} o.toScreenX метр трассы → x на экране (центр машины)
   * @param {number} o.groundY земля на экране
   * @param {boolean} o.asphalt дымят и оставляют след только шины на асфальте
   */
  update(dt, { run, toScreenX, groundY, asphalt }) {
    const k = this.rig.scaleX;
    const spin = asphalt ? clamp01((run.slip - 0.15) / 0.55) : 0;
    const lock = asphalt ? (run.lock ?? 0) * clamp01((run.v - 1) / 6) : 0;
    // Полный привод: в пробуксовке дымят обе оси, задняя сильнее; на торможении — передняя.
    const axles = {
      rear: { x: car.wheels.rear.x - car.anchor.x, power: Math.max(spin, lock * 0.7) },
      front: { x: car.wheels.front.x - car.anchor.x, power: Math.max(spin * 0.6, lock) },
    };
    for (const [id, a] of Object.entries(axles)) {
      const off = a.x * k;
      this.#emit(id, a.power, run, off, groundY, dt, k, spin >= lock);
      this.#mark(id, a.power, run.x, off);
    }
    this.#stepPuffs(dt, toScreenX, k);
    this.#drawMarks(dt, toScreenX, groundY, k);
  }

  #emit(id, power, run, off, groundY, dt, k, spinning) {
    if (power <= 0.02) {
      this.carry[id] = 0;
      return;
    }
    // Клубов в секунду: до ~36 на ось.
    this.carry[id] += power * 36 * dt;
    while (this.carry[id] >= 1 && this.puffs.length < MAX_PUFFS) {
      this.carry[id] -= 1;
      const img = this.#take();
      const size = (car.wheels.radius * 1.4 * k) / PUFF_SIZE;
      this.puffs.push({
        img,
        m: run.x,
        off: off - (6 + Math.random() * 10) * k, // из-за задней кромки шины
        y: groundY - (2 + Math.random() * 4) * k,
        // Пробуксовка выбрасывает дым назад, юз — тащит его чуть вперёд, за шиной.
        vx: (spinning ? -(30 + Math.random() * 50) : -(4 + Math.random() * 10)) * k,
        vy: -(8 + Math.random() * 16) * k,
        age: 0,
        life: 1.4 + Math.random() * 1.2,
        s0: size * (0.4 + Math.random() * 0.2),
        s1: size * (2.2 + Math.random() * 1.4),
        a0: 0.22 + 0.3 * power,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.8,
      });
    }
  }

  #stepPuffs(dt, toScreenX) {
    const drag = Math.exp(-1.6 * dt);
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.img.setVisible(false);
        this.smokeLayer.remove(p.img);
        this.pool.push(p.img);
        this.puffs.splice(i, 1);
        continue;
      }
      p.off += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy = p.vy * Math.exp(-0.6 * dt) - 4 * dt; // тёплый дым всплывает
      p.rot += p.vr * dt;
      // Быстро раздувается, потом медленно растекается и тает.
      const grow = 1 - (1 - t) * (1 - t);
      const fade = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
      p.img
        .setPosition(toScreenX(p.m) + p.off, p.y)
        .setScale(p.s0 + (p.s1 - p.s0) * grow)
        .setRotation(p.rot)
        .setAlpha(p.a0 * fade * fade);
    }
  }

  /** Отрезок следа от прошлой точки оси до нынешней. */
  #mark(id, power, m, off) {
    if (power < 0.12) {
      this.last[id] = null;
      return;
    }
    const prev = this.last[id];
    const here = { m, off };
    if (prev) {
      this.markList.push({ from: prev, to: here, a: 0.25 + 0.45 * power, age: 0 });
      if (this.markList.length > MAX_MARKS) this.markList.shift();
    }
    this.last[id] = here;
  }

  #drawMarks(dt, toScreenX, groundY, k) {
    const g = this.marks.clear();
    const h = Math.max(1, 2.2 * k);
    for (let i = this.markList.length - 1; i >= 0; i--) {
      const s = this.markList[i];
      s.age += dt;
      if (s.age >= MARK_LIFE) {
        this.markList.splice(i, 1);
        continue;
      }
      const x0 = toScreenX(s.from.m) + s.from.off;
      const x1 = toScreenX(s.to.m) + s.to.off;
      // Буксовка на месте даёт пятно шириной в пятно контакта, а не точку.
      const w = Math.max(Math.abs(x1 - x0), 3 * k);
      const a = s.a * (1 - s.age / MARK_LIFE);
      g.fillStyle(MARK_COLOR, a).fillRect(
        Math.min(x0, x1) - (w === 3 * k ? w / 2 : 0),
        groundY,
        w,
        h,
      );
    }
  }

  /** Сцена остановлена — новых клубов не будет, старые дотают. */
  stop() {
    this.carry.rear = 0;
    this.carry.front = 0;
    this.last.rear = null;
    this.last.front = null;
  }
}
