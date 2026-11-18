/**
 * CarRig — машина игрока из пиксельных слоёв (ТЗ 5.1, 5.2) с простой физикой показа.
 * Один класс для всех сцен: гараж, обкатка, заезд, финал — машина выглядит одинаково.
 *
 * Порядок слоёв снизу вверх:
 *   тень → неон → ниши колёс → колёса (шина + диск) / кирпичи → стойки крыла →
 *   основа → краска → оттенки (холодный свет, тёплые тени — поверх любого цвета) →
 *   накладка кузова → спойлер → фара → грязь → свет фар (ночь).
 * Кузов (всё, кроме тени и колёс) качается на подвеске; колёса стоят на земле и крутятся.
 *
 * Точка (0, 0) контейнера — земля под серединой машины.
 */
import Phaser from 'phaser';
import car from '../../data/car.json';
import {
  createSuspension,
  stepSuspension,
  bodyPose,
  kick,
  rollAngle,
  wheelFrame,
} from './carPhysics.js';
import { getPart } from './simulate.js';
import { cosmeticHex } from '../gameState.js';

const PATH = 'assets/images/car/';
const AX = car.anchor.x;
const AY = car.anchor.y;
const PIVOT_Y = car.wheels.rear.y - AY; // кузов качается вокруг высоты осей
const SIZES = [...new Set(Object.values(car.rims))];
const RIM_TYPES = Object.keys(car.rims);
/** Все колёсные листы: шины под каждый размер диска, тормоза и диски. */
const WHEEL_SHEETS = [
  ...car.tires.flatMap((t) => SIZES.map((s) => `wheel_tire_${t}_${s}`)),
  ...RIM_TYPES.flatMap((r) => [`wheel_brake_${r}`, `wheel_rim_${r}`]),
];
const OLD_RIM_COLOR = 0x9a9ea6;
// Текстуры машины в DENSITY раз детальнее мира: показываем в масштабе 1/DENSITY.
const DENSITY = car.density ?? 1;
const TEX = 1 / DENSITY;

const IMAGES = [
  'car_shadow',
  'car_wells',
  'car_base',
  'car_paint',
  'car_tone',
  'car_headlight',
  'car_dirt',
  'car_bricks',
  ...Object.values(car.overlays).map((k) => `car_overlay_${k}`),
  ...Object.values(car.spoilers).flatMap((s) => Object.values(s)),
];

/** Ставит все слои машины в очередь загрузчика (вызывается в BootScene). */
export function preloadCar(scene) {
  for (const key of new Set(IMAGES)) scene.load.image(key, `${PATH}${key}.png`);
  const frame = {
    frameWidth: car.wheelFrame.width * DENSITY,
    frameHeight: car.wheelFrame.height * DENSITY,
  };
  for (const key of WHEEL_SHEETS) scene.load.spritesheet(key, `${PATH}${key}.png`, frame);
  // Детальные текстуры сглаживаем при уменьшении: при любом размере окна машина остаётся
  // чёткой, а пиксельные фоны вокруг — крупными (у них остаётся фильтр NEAREST).
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
    const keys = [...new Set(IMAGES), ...WHEEL_SHEETS];
    for (const key of keys) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
  });
}

/** Цвет варианта внешнего вида (готового или своего) числом для setTint; null — выключено. */
const colorOf = (group, value) => {
  const hex = cosmeticHex(group, value);
  return hex ? Phaser.Display.Color.HexStringToColor(hex).color : null;
};

/** Ключи листов колеса по сборке; без шин — спущенное дедово на старых штампах. */
export function wheelKeys(build) {
  const tire = build.tires ? getPart(build.tires)?.sprite : car.noTires.tire;
  const rim = build.tires ? (getPart(build.rims)?.sprite ?? 'six') : car.noTires.rim;
  return {
    brake: `wheel_brake_${rim}`,
    tire: `wheel_tire_${tire}_${car.rims[rim]}`,
    rim: `wheel_rim_${rim}`,
  };
}

export class CarRig extends Phaser.GameObjects.Container {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y земля
   * @param {{ build: object, looks: object, dirty?: boolean, night?: boolean, scale?: number }} opts
   */
  constructor(scene, x, y, opts) {
    super(scene, x, y);
    scene.add.existing(this);
    this.night = Boolean(opts.night);
    this.suspension = createSuspension();
    this.wheelAngle = 0;

    const img = (key) =>
      scene.add
        .image(-AX, -AY - PIVOT_Y, key)
        .setOrigin(0)
        .setScale(TEX);

    // Тень на земле — пиксельный слой (car.shadow.above — сколько его лежит выше земли).
    this.shadow = scene.add.image(-AX, -car.shadow.above, 'car_shadow').setOrigin(0).setScale(TEX);

    // Неон: свечение под днищем.
    this.neon = scene.add
      .ellipse(0, -3, car.size.width - 50, 10, 0xffffff, 0.75)
      .setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: this.neon, alpha: 0.4, duration: 1100, yoyo: true, repeat: -1 });

    // Кузов делится на две группы: «за колёсами» (ниши) и «перед колёсами» (всё остальное).
    this.bodyBack = scene.add.container(0, PIVOT_Y, [img('car_wells')]);
    this.layers = {
      wingBase: img('car_spoiler_wing_base'),
      base: img('car_base'),
      paint: img('car_paint'),
      tone: img('car_tone'),
      overlay: img('car_overlay_rust'),
      spoiler: img('car_spoiler_lip_paint'),
      headlight: img('car_headlight'),
      dirt: img('car_dirt'),
    };
    this.beam = scene.add
      .triangle(
        car.headlight.x - AX,
        car.headlight.y - AY - PIVOT_Y,
        0,
        0,
        170,
        -28,
        170,
        28,
        0xffffff,
        0.07,
      )
      .setOrigin(0, 0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.bodyFront = scene.add.container(0, PIVOT_Y, [...Object.values(this.layers), this.beam]);

    // Колёса и кирпичи — на земле, кузов над ними качается.
    const wheel = (w) => {
      const x = w.x - AX;
      const yy = w.y - AY;
      return {
        brake: scene.add.sprite(x, yy, 'wheel_brake_six', 0).setScale(TEX),
        tire: scene.add.sprite(x, yy, 'wheel_tire_stock_m', 0).setScale(TEX),
        rim: scene.add.sprite(x, yy, 'wheel_rim_six', 0).setScale(TEX),
      };
    };
    this.wheels = { rear: wheel(car.wheels.rear), front: wheel(car.wheels.front) };
    this.bricks = scene.add.image(-AX, -AY, 'car_bricks').setOrigin(0).setScale(TEX);

    this.add([
      this.shadow,
      this.neon,
      this.bodyBack,
      this.bricks,
      ...['rear', 'front'].flatMap((k) => ['brake', 'tire', 'rim'].map((p) => this.wheels[k][p])),
      this.bodyFront,
    ]);

    this.setScale(opts.scale ?? 1);
    this.apply(opts.build, opts.looks, opts.dirty);
  }

  /** Применяет сборку, внешний вид и грязь — без пересоздания объектов. */
  apply(build, looks, dirty = false) {
    const L = this.layers;
    const paint = colorOf('paint', looks.paint);

    L.paint.setTint(paint);

    const overlayKind = car.overlays[build.body];
    L.overlay.setVisible(Boolean(overlayKind));
    if (overlayKind) L.overlay.setTexture(`car_overlay_${overlayKind}`);

    const spoiler = build.spoiler ? car.spoilers[build.spoiler] : null;
    L.spoiler.setVisible(Boolean(spoiler)).setTint(paint);
    if (spoiler) L.spoiler.setTexture(spoiler.paint);
    L.wingBase.setVisible(Boolean(spoiler?.base));

    const lightColor = colorOf('headlight', looks.headlight);
    L.headlight.setTint(lightColor);
    this.beam.setVisible(this.night).setFillStyle(lightColor, 0.07);

    const neon = colorOf('neon', looks.neon);
    this.neon.setVisible(neon !== null);
    if (neon !== null) this.neon.setFillStyle(neon, 0.75);

    L.dirt.setVisible(Boolean(dirty));

    // Колёса: без шин в сборке — спущенное дедово сзади и кирпичи спереди.
    const keys = wheelKeys(build);
    const rimColor = build.tires ? colorOf('rim', looks.rim) : OLD_RIM_COLOR;
    for (const w of [this.wheels.rear, this.wheels.front]) {
      for (const p of ['brake', 'tire', 'rim']) w[p].setTexture(keys[p], w[p].frame.name);
      w.rim.setTint(rimColor);
    }
    const hasWheels = Boolean(build.tires);
    for (const p of ['brake', 'tire', 'rim']) this.wheels.front[p].setVisible(hasWheels);
    this.bricks.setVisible(!hasWheels);
    this.build = build;
    return this;
  }

  /** Повторяет позу кузова и кадр колёс другой машины (отражение на полу гаража). */
  syncFrom(other) {
    this.bodyBack.y = other.bodyBack.y;
    this.bodyBack.rotation = other.bodyBack.rotation;
    this.bodyFront.y = other.bodyFront.y;
    this.bodyFront.rotation = other.bodyFront.rotation;
    for (const k of ['rear', 'front'])
      for (const p of ['brake', 'tire', 'rim'])
        this.wheels[k][p].setFrame(other.wheels[k][p].frame.name);
  }

  /** Блик по свежей краске: светлая копия слоя краски быстро гаснет. */
  shine() {
    if (!this.gloss) {
      this.gloss = this.scene.add
        .image(this.layers.paint.x, this.layers.paint.y, 'car_paint')
        .setOrigin(0)
        .setScale(this.layers.paint.scaleX)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0);
      this.bodyFront.addAt(this.gloss, this.bodyFront.getIndex(this.layers.tone) + 1);
    }
    this.scene.tweens.killTweensOf(this.gloss);
    this.gloss.setAlpha(0.55);
    this.scene.tweens.add({ targets: this.gloss, alpha: 0, duration: 520, ease: 'Sine.easeOut' });
  }

  /** «Посадка» после установки детали: кузов слегка подпрыгивает на подвеске. */
  drop(strength = 40) {
    kick(this.suspension, strength, strength * 0.8);
  }

  /** Кочка под одной из осей (обкатка по грязи). */
  bump(strength = 30) {
    if (Math.random() < 0.5) kick(this.suspension, strength, 0);
    else kick(this.suspension, 0, strength);
  }

  /**
   * Шаг физики показа.
   * @param {number} dt секунды
   * @param {{ distance?: number, accel?: number }} motion путь за шаг (px в масштабе машины) и ускорение, м/с²
   */
  step(dt, { distance = 0, accel = 0 } = {}) {
    stepSuspension(this.suspension, dt, accel);
    const pose = bodyPose(this.suspension);
    for (const g of [this.bodyBack, this.bodyFront]) {
      g.y = PIVOT_Y + pose.y;
      g.rotation = pose.pitch;
    }
    if (distance) {
      this.wheelAngle = rollAngle(this.wheelAngle, distance / this.scaleX);
      const f = wheelFrame(this.wheelAngle);
      for (const w of [this.wheels.rear, this.wheels.front]) {
        w.brake.setFrame(f);
        w.tire.setFrame(f);
        w.rim.setFrame(f);
      }
    }
  }
}
