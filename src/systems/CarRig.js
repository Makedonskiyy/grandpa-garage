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
/** Все колёсные листы: шины под каждый размер диска, тормозные диски и колёсные диски. */
const WHEEL_SHEETS = [
  ...car.tires.flatMap((t) => SIZES.map((s) => `wheel_tire_${t}_${s}`)),
  ...SIZES.map((s) => `wheel_disc_${s}`),
  ...RIM_TYPES.map((r) => `wheel_rim_${r}`),
];
/** Суппорты — по одному на размер диска, не крутятся. */
const CALIPERS = SIZES.map((s) => `wheel_caliper_${s}`);
const OLD_RIM_COLOR = 0x9a9ea6;
const OLD_CALIPER_COLOR = 0x6a6e75;
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
  ...CALIPERS,
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
  const size = car.rims[rim];
  return {
    disc: `wheel_disc_${size}`,
    caliper: `wheel_caliper_${size}`,
    tire: `wheel_tire_${tire}_${size}`,
    rim: `wheel_rim_${rim}`,
    spokes: car.spokes[rim] ?? 6,
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

/** Размытие в единицах мира: canvas размывает в пикселях холста, а он в GLOW_K раз детальнее. */
const blur = (v) => `blur(${v * GLOW_K}px)`;

/**
 * Неон под днищем: широкое мягкое пятно на земле, ореол вокруг трубки и сама трубка,
 * которая к концам плавно гаснет — без резких обрезанных краёв.
 */
function neonTexture(scene) {
  const W2 = car.size.width + 80;
  const H2 = 48;
  return glowTexture(scene, 'fx_neon', W2, H2, (ctx) => {
    const x0 = 70;
    const x1 = W2 - 70;
    const len = x1 - x0;
    const fade = (a) => {
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, `rgba(255,255,255,0)`);
      g.addColorStop(0.12, `rgba(255,255,255,${a})`);
      g.addColorStop(0.88, `rgba(255,255,255,${a})`);
      g.addColorStop(1, `rgba(255,255,255,0)`);
      return g;
    };
    // Свет на земле: широкий, очень мягкий.
    ctx.filter = blur(10);
    ctx.fillStyle = fade(0.5);
    ctx.beginPath();
    ctx.ellipse(W2 / 2, 30, len / 2 + 20, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ореол вокруг трубки.
    ctx.filter = blur(4);
    ctx.fillStyle = fade(0.75);
    ctx.beginPath();
    ctx.ellipse(W2 / 2, 22, len / 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Трубка: тонкая и яркая, к концам гаснет.
    ctx.filter = blur(0.8);
    ctx.fillStyle = fade(1);
    ctx.fillRect(x0, 21, len, 2);
  });
}

/**
 * Луч фары: направленный конус вперёд — узкое яркое ядро внутри широкого тусклого,
 * оба гаснут к концу и сильно размыты по краям. Без пятна-ореола у самой фары.
 */
function beamTexture(scene) {
  const L = 220;
  const H2 = 96;
  const c = H2 / 2;
  return glowTexture(scene, 'fx_beam', L, H2, (ctx) => {
    const cone = (spread, a, b) => {
      const g = ctx.createLinearGradient(0, 0, L, 0);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.4, `rgba(255,255,255,${a * 0.45})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.filter = blur(b);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(2, c - 1.5);
      ctx.lineTo(L - 10, c - spread);
      ctx.lineTo(L - 10, c + spread);
      ctx.lineTo(2, c + 1.5);
      ctx.closePath();
      ctx.fill();
    };
    cone(34, 0.35, 9); // широкий тусклый
    cone(16, 0.6, 5); // ядро
  });
}

/**
 * Размытый во вращении вариант листа колеса: среднее всех кадров по каждому пикселю.
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
  // Честное среднее всех кадров по каждому пикселю (с учётом прозрачности):
  // спицы размазываются в равномерный диск, а не остаются резкими поверх.
  const w = canvas.width;
  const h = canvas.height;
  const sum = new Float32Array(w * h * 4);
  for (let i = 0; i < n; i++) {
    const fr = tex.get(i);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(fr.source.image, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    for (let p = 0; p < d.length; p += 4) {
      const a = d[p + 3] / 255;
      sum[p] += d[p] * a;
      sum[p + 1] += d[p + 1] * a;
      sum[p + 2] += d[p + 2] * a;
      sum[p + 3] += a;
    }
  }
  const out = ctx.createImageData(w, h);
  for (let p = 0; p < sum.length; p += 4) {
    const a = sum[p + 3];
    if (a <= 0) continue;
    out.data[p] = sum[p] / a;
    out.data[p + 1] = sum[p + 1] / a;
    out.data[p + 2] = sum[p + 2] / a;
    out.data[p + 3] = (a / n) * 255;
  }
  ctx.putImageData(out, 0, 0);
  scene.textures.addCanvas(blurKey, canvas);
  scene.textures.get(blurKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
  return blurKey;
}

/** Шаг листа колеса, рад: 32 кадра на оборот. */
const FRAME_STEP = (Math.PI * 2) / car.wheelFrame.frames;
/**
 * Видимый поворот за кадр экрана — не больше этой доли периода спиц. Шаг больше половины
 * периода глаз читает как стоп или вращение назад (эффект колёс в кино), поэтому быстрее
 * диск не поворачиваем, а на скорости спицы плавно уходят в размытие.
 */
const TURN_OF_PERIOD = 0.45;
/** Размытие спиц: от какой и до какой доли периода за кадр, и насколько сильное в пределе. */
const BLUR_FROM = 0.2;
const BLUR_FULL = 0.55;
const BLUR_MAX = 0.55;

/** Слои колеса снизу вверх. */
const WHEEL_LAYERS = ['disc', 'caliper', 'tire', 'rim', 'rimBlur'];

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
    this.wheelAngle = 0; // видимый угол колёс, рад

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
      .setAlpha(0.6)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.bodyFront = scene.add.container(0, PIVOT_Y, [...Object.values(this.layers), this.beam]);

    // Колёса и кирпичи — на земле, кузов над ними качается.
    const wheel = (w) => {
      const x = w.x - AX;
      const yy = w.y - AY;
      // Снизу вверх: тормозной диск (крутится) → суппорт (стоит) → шина → диск колеса и его
      // размытая копия. Все крутящиеся слои берут один и тот же кадр листа — никаких поворотов
      // спрайта, поэтому шина и диск всегда совпадают до точки.
      return {
        disc: scene.add.sprite(x, yy, 'wheel_disc_m', 0).setScale(TEX),
        caliper: scene.add.image(x, yy, 'wheel_caliper_m').setScale(TEX),
        tire: scene.add.sprite(x, yy, 'wheel_tire_stock_m', 0).setScale(TEX),
        rim: scene.add.sprite(x, yy, 'wheel_rim_six', 0).setScale(TEX),
        rimBlur: scene.add.image(x, yy, 'wheel_rim_six').setScale(TEX).setAlpha(0),
      };
    };
    this.wheels = { rear: wheel(car.wheels.rear), front: wheel(car.wheels.front) };
    this.bricks = scene.add.image(-AX, -AY, 'car_bricks').setOrigin(0).setScale(TEX);

    this.add([
      this.shadow,
      this.neon,
      this.bodyBack,
      this.bricks,
      ...['rear', 'front'].flatMap((k) => WHEEL_LAYERS.map((p) => this.wheels[k][p])),
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
    const caliperColor = build.tires
      ? (colorOf('caliper', looks.caliper) ?? OLD_CALIPER_COLOR)
      : OLD_CALIPER_COLOR;
    this.spokes = keys.spokes;
    for (const w of [this.wheels.rear, this.wheels.front]) {
      for (const p of ['disc', 'tire', 'rim']) w[p].setTexture(keys[p], w[p].frame.name);
      w.caliper.setTexture(keys.caliper).setTint(caliperColor);
      w.rimBlur.setTexture(spinBlurTexture(this.scene, keys.rim)).setTint(rimColor);
      w.rim.setTint(rimColor);
    }
    this.spins = Boolean(build.tires); // спущенное дедово колесо стоит — у него плоский низ
    const hasWheels = Boolean(build.tires);
    for (const p of WHEEL_LAYERS) this.wheels.front[p].setVisible(hasWheels);
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
      for (const p of ['disc', 'tire', 'rim'])
        this.wheels[k][p].setFrame(other.wheels[k][p].frame.name);
      this.wheels[k].rim.setAlpha(other.wheels[k].rim.alpha);
      this.wheels[k].rimBlur.setAlpha(other.wheels[k].rimBlur.alpha);
    }
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
    // Нагрузка на подвеску копится плавно: кузов не дёргается от рывка педали и в момент остановки.
    this.load = (this.load ?? 0) + (accel - (this.load ?? 0)) * Math.min(1, dt * 6);
    stepSuspension(this.suspension, dt, this.load);
    const pose = bodyPose(this.suspension);
    for (const g of [this.bodyBack, this.bodyFront]) {
      g.y = PIVOT_Y + pose.y;
      g.rotation = pose.pitch;
    }
    if (!this.spins) return;
    // Настоящий поворот колеса за кадр по пройденному пути (катится без проскальзывания).
    const real = rollAngle(0, distance / this.scaleX);
    const period = (Math.PI * 2) / this.spokes;
    // Видимый поворот: целыми кадрами листа и не больше TURN_OF_PERIOD периода спиц.
    const cap = Math.max(1, Math.floor((period * TURN_OF_PERIOD) / FRAME_STEP)) * FRAME_STEP;
    this.wheelAngle += Math.max(-cap, Math.min(cap, real));
    const f = wheelFrame(this.wheelAngle);
    // Чем ближе поворот за кадр к половине периода, тем сильнее спицы уходят в размытие.
    const spin = Math.abs(real) / period;
    const blur = BLUR_MAX * Math.max(0, Math.min(1, (spin - BLUR_FROM) / (BLUR_FULL - BLUR_FROM)));
    for (const w of [this.wheels.rear, this.wheels.front]) {
      w.disc.setFrame(f);
      w.tire.setFrame(f);
      w.rim.setFrame(f).setAlpha(1 - blur);
      w.rimBlur.setAlpha(blur);
    }
  }
}
