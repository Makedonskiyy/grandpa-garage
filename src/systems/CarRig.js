/**
 * CarRig — машина игрока из пиксельных слоёв (ТЗ 5.1, 5.2) с простой физикой показа.
 * Один класс для всех сцен: гараж, обкатка, заезд, финал — машина выглядит одинаково.
 *
 * Порядок слоёв снизу вверх:
 *   тень → неон → ниши колёс → колёса (шина + диск) / кирпичи → стойки крыла →
 *   основа → краска → накладка кузова → спойлер → фара → грязь → свет фар (ночь).
 * Кузов (всё, кроме тени и колёс) качается на подвеске; колёса стоят на земле и крутятся.
 *
 * Точка (0, 0) контейнера — земля под серединой машины.
 */
import Phaser from 'phaser';
import car from '../../data/car.json';
import cosmetics from '../../data/cosmetics.json';
import {
  createSuspension,
  stepSuspension,
  bodyPose,
  kick,
  rollAngle,
  wheelFrame,
} from './carPhysics.js';

const PATH = 'assets/images/car/';
const AX = car.anchor.x;
const AY = car.anchor.y;
const PIVOT_Y = car.wheels.rear.y - AY; // кузов качается вокруг высоты осей
const TIRE_TYPES = [...new Set(Object.values(car.tires))];
const OLD_RIM_COLOR = 0x9a9ea6;
// Текстуры машины в DENSITY раз детальнее мира: показываем в масштабе 1/DENSITY.
const DENSITY = car.density ?? 1;
const TEX = 1 / DENSITY;

const IMAGES = [
  'car_wells',
  'car_base',
  'car_paint',
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
  for (const t of TIRE_TYPES) {
    scene.load.spritesheet(`wheel_tire_${t}`, `${PATH}wheel_tire_${t}.png`, frame);
    scene.load.spritesheet(`wheel_rim_${t}`, `${PATH}wheel_rim_${t}.png`, frame);
  }
  // Детальные текстуры сглаживаем при уменьшении: при любом размере окна машина остаётся
  // чёткой, а пиксельные фоны вокруг — крупными (у них остаётся фильтр NEAREST).
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
    const keys = [
      ...new Set(IMAGES),
      ...TIRE_TYPES.flatMap((t) => [`wheel_tire_${t}`, `wheel_rim_${t}`]),
    ];
    for (const key of keys) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
  });
}

const colorOf = (group, id) => {
  const c = cosmetics[group].find((x) => x.id === id) ?? cosmetics[group][0];
  return c.hex ? Phaser.Display.Color.HexStringToColor(c.hex).color : null;
};

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

    // Тень на земле.
    this.shadow = scene.add.ellipse(0, -1, car.size.width - 30, 8, 0x000000, 0.45);

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
        tire: scene.add.sprite(x, yy, 'wheel_tire_stock', 0).setScale(TEX),
        rim: scene.add.sprite(x, yy, 'wheel_rim_stock', 0).setScale(TEX),
      };
    };
    this.wheels = { rear: wheel(car.wheels.rear), front: wheel(car.wheels.front) };
    this.bricks = scene.add.image(-AX, -AY, 'car_bricks').setOrigin(0).setScale(TEX);

    this.add([
      this.shadow,
      this.neon,
      this.bodyBack,
      this.bricks,
      this.wheels.rear.tire,
      this.wheels.rear.rim,
      this.wheels.front.tire,
      this.wheels.front.rim,
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

    // Колёса: без колёс в сборке — спущенное дедово сзади и кирпичи спереди.
    const type = build.wheels ? car.tires[build.wheels] : car.tires.none;
    const rimColor = build.wheels ? colorOf('rim', looks.rim) : OLD_RIM_COLOR;
    for (const w of [this.wheels.rear, this.wheels.front]) {
      w.tire.setTexture(`wheel_tire_${type}`, w.tire.frame.name);
      w.rim.setTexture(`wheel_rim_${type}`, w.rim.frame.name).setTint(rimColor);
    }
    const hasWheels = Boolean(build.wheels);
    this.wheels.front.tire.setVisible(hasWheels);
    this.wheels.front.rim.setVisible(hasWheels);
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
    for (const k of ['rear', 'front']) {
      this.wheels[k].tire.setFrame(other.wheels[k].tire.frame.name);
      this.wheels[k].rim.setFrame(other.wheels[k].rim.frame.name);
    }
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
        w.tire.setFrame(f);
        w.rim.setFrame(f);
      }
    }
  }
}
