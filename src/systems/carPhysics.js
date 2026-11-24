/**
 * carPhysics — простая «физика» машины для показа (на результат заездов не влияет).
 * Чистые функции без Phaser: подвеска на двух пружинах и вращение колёс по пути.
 *
 * Подвеска: у каждой оси смещение y (вниз — плюс) и скорость. Пружина возвращает к нулю,
 * демпфер гасит качание. Разгон приседает зад и поднимает нос, торможение — наоборот.
 */
import car from '../../data/car.json';

export const SUSPENSION = Object.freeze({
  stiffness: 140, // 1/с² — жёсткость пружины
  damping: 11, // 1/с — демпфер
  squat: 0.25, // px на 1 м/с² продольного ускорения: полное торможение ≈ ход подвески, без удара в отбойник
  maxTravel: 4, // px — ход подвески вверх
  // px — вниз не дальше зазора арки: крыло не наезжает на шину, диск не «съезжает» в ней
  maxDrop: Math.max(0.3, (car.archGap ?? 1.3) - 0.2),
  maxPitch: 0.025, // рад — больше пиксель-арт «ломается» при повороте
});

export function createSuspension() {
  return { rear: { y: 0, v: 0 }, front: { y: 0, v: 0 } };
}

/**
 * Шаг пружин.
 * @param {ReturnType<typeof createSuspension>} s
 * @param {number} dt секунды
 * @param {number} accel продольное ускорение, м/с² (плюс — разгон)
 */
export function stepSuspension(s, dt, accel = 0, p = SUSPENSION) {
  const h = Math.min(dt, 1 / 30); // большие шаги разносят пружину
  const load = accel * p.squat;
  const axle = (a, rest) => {
    const force = -p.stiffness * (a.y - rest) - p.damping * a.v;
    a.v += force * h;
    a.y += a.v * h;
    if (a.y > p.maxDrop) {
      a.y = p.maxDrop; // отбойник
      a.v = Math.min(a.v, 0);
    } else if (a.y < -p.maxTravel) {
      a.y = -p.maxTravel;
      a.v = Math.max(a.v, 0);
    }
  };
  axle(s.rear, load);
  axle(s.front, -load);
  return s;
}

/** Толчок в ось: кочка, падение после установки детали. Скорость в px/с, вниз — плюс. */
export function kick(s, rear, front = rear) {
  s.rear.v += rear;
  s.front.v += front;
}

/** Положение кузова: среднее смещение осей и наклон (плюс — нос вниз). */
export function bodyPose(s, p = SUSPENSION) {
  const wheelbase = car.wheels.front.x - car.wheels.rear.x;
  const pitch = Math.atan2(s.front.y - s.rear.y, wheelbase);
  return {
    y: (s.rear.y + s.front.y) / 2,
    // Мягкий предел: кузов плавно упирается в ход подвески, а не встаёт колом.
    pitch: p.maxPitch * Math.tanh(pitch / p.maxPitch),
  };
}

/** Кадр колеса по углу поворота (рад): 16 кадров на оборот, по часовой стрелке. */
export function wheelFrame(angle, frames = car.wheelFrame.frames) {
  const step = (Math.PI * 2) / frames;
  return ((Math.floor(angle / step) % frames) + frames) % frames;
}

/** Угол поворота колеса после проезда пути dist (px) колесом радиуса r (px). */
export function rollAngle(angle, dist, r = car.wheels.radius) {
  return angle + dist / r;
}
