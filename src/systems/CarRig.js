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

/** Во сколько раз текстуры свечения детальнее мира: размытие остаётся мягким при любом зуме. */
const GLOW_K = 4;

/**
 * Текстура свечения, нарисованная на canvas с настоящим размытием (filter: blur).
 * Белая — цвет задаёт setTint, режим ADD складывает её со сценой как свет.
 */
function glowTexture(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * GLOW_K);
  canvas.height = Math.ceil(h * GLOW_K);
  const ctx = canvas.getContext('2d');
  ctx.scale(GLOW_K, GLOW_K);
  draw(ctx);
  scene.textures.addCanvas(key, canvas);
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

/** Неон под днищем: яркая трубка, мягкий ореол и световое пятно на земле. */
function neonTexture(scene) {
  const W2 = car.size.width + 60;
  return glowTexture(scene, 'fx_neon', W2, 40, (ctx) => {
    const x0 = 55;
    const x1 = W2 - 55;
    ctx.fillStyle = '#fff';
    ctx.filter = 'blur(9px)';
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(W2 / 2, 26, (x1 - x0) / 2 + 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.filter = 'blur(3px)';
    ctx.globalAlpha = 0.8;
    ctx.fillRect(x0, 17, x1 - x0, 4);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.fillRect(x0 + 2, 18, x1 - x0 - 4, 2);
  });
}

/** Луч фары: конус, гаснущий к концу, размытый по краям, и ореол у самой фары. */
function beamTexture(scene) {
  return glowTexture(scene, 'fx_beam', 200, 80, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 200, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.filter = 'blur(5px)';
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(4, 36);
    ctx.lineTo(196, 6);
    ctx.lineTo(196, 74);
    ctx.lineTo(4, 44);
    ctx.closePath();
    ctx.fill();
    ctx.filter = 'blur(4px)';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(8, 40, 6, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Размытый во вращении вариант листа колеса: все 16 кадров, сложенные с прозрачностью 1/16.
 * Нужен на скорости: за кадр экрана колесо проворачивается почти на период узора спиц,
 * и без размытия диск «стоит» или крутится назад (эффект колёс в кино).
 */
function spinBlurTexture(scene, key) {
  const blurKey = `${key}_blur`;
  if (scene.textures.exists(blurKey) || !scene.textures.exists(key)) return blurKey;
  const tex = scene.textures.get(key);
  const first = tex.get(0);
  const canvas = document.createElement('canvas');
  canvas.width = first.cutWidth;
  canvas.height = first.cutHeight;
  const ctx = canvas.getContext('2d');
  const n = car.wheelFrame.frames;
  for (let i = 0; i < n; i++) {
    const fr = tex.get(i);
    ctx.globalAlpha = i === 0 ? 1 : 1 / (i + 1); // накопительное среднее
    ctx.drawImage(
      fr.source.image,
      fr.cutX,
      fr.cutY,
      fr.cutWidth,
      fr.cutHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }
  scene.textures.addCanvas(blurKey, canvas);
  scene.textures.get(blurKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
  return blurKey;
}

/** Кадров листа за кадр экрана, после которых колесо рисуется размытым. */
const BLUR_FRAMES = 1.1;

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

    // Неон: трубка под порогом с размытым ореолом и пятном света на земле, медленно дышит.
    this.neon = scene.add
      .image(0, 2, neonTexture(scene))
      .setOrigin(0.5, 0.65)
      .setScale(1 / GLOW_K)
      .setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: this.neon,
      alpha: { from: 1, to: 0.72 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

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
      .image(car.headlight.x - AX - 6, car.headlight.y - AY - PIVOT_Y, beamTexture(scene))
      .setOrigin(0, 0.5)
      .setScale(1 / GLOW_K)
      .setAlpha(0.5)
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
    this.beam.setVisible(this.night).setTint(lightColor);

    const neon = colorOf('neon', looks.neon);
    this.neon.setVisible(neon !== null);
    if (neon !== null) this.neon.setTint(neon);

    L.dirt.setVisible(Boolean(dirty));

    // Колёса: без шин в сборке — спущенное дедово сзади и кирпичи спереди.
    const keys = wheelKeys(build);
    const rimColor = build.tires ? colorOf('rim', looks.rim) : OLD_RIM_COLOR;
    for (const w of [this.wheels.rear, this.wheels.front]) {
      for (const p of ['brake', 'tire', 'rim']) w[p].setTexture(keys[p], w[p].frame.name);
      w.keys = keys;
      w.blurred = false;
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
      const before = this.wheelAngle;
      this.wheelAngle = rollAngle(this.wheelAngle, distance / this.scaleX);
      // На скорости кадры листа мелькают быстрее экрана — колесо размывается во вращении.
      const framesPerTick =
        (Math.abs(this.wheelAngle - before) / (Math.PI * 2)) * car.wheelFrame.frames;
      const f = wheelFrame(this.wheelAngle);
      for (const w of [this.wheels.rear, this.wheels.front]) {
        // Порог с запасом: размытие включается от BLUR_FRAMES, гаснет ниже 0,8 — без мигания.
        const blur = w.blurred ? framesPerTick > 0.8 : framesPerTick > BLUR_FRAMES;
        if (blur !== w.blurred && w.keys) {
          w.blurred = blur;
          for (const p of ['brake', 'tire', 'rim']) {
            if (blur) w[p].setTexture(spinBlurTexture(this.scene, w.keys[p]));
            else w[p].setTexture(w.keys[p], f);
          }
        }
        if (!blur) {
          w.brake.setFrame(f);
          w.tire.setFrame(f);
          w.rim.setFrame(f);
        }
      }
    }
  }
}
