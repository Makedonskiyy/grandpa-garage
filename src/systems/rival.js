/**
 * rival — разгон Палыча на 400 м. Не физика мотора, а правдоподобная кривая скорости:
 * после реакции машина резко срывается, дальше прибавляет всё медленнее (сопротивление
 * воздуха), на переключениях передач скорость на миг проседает. Кривая подогнана так,
 * что финиш ровно в заданное время — честно и предсказуемо для баланса.
 */

const STEP = 1 / 120;
/** Моменты переключений после старта, с: на них скорость проседает. */
const SHIFTS = [1.5, 3.3, 5.8, 9.0];
const TAU = 4.4; // с — насколько быстро набирается скорость

/** Скорость (в долях максимальной) через t секунд после трогания. */
function shape(t) {
  if (t <= 0) return 0;
  let v = 1 - Math.exp(-t / TAU);
  for (const s of SHIFTS) v *= 1 - 0.06 * Math.exp(-(((t - s) / 0.14) ** 2));
  return v;
}

/**
 * Профиль заезда Палыча.
 * @param {{ distance: number, time: number, reaction: number }} o
 * @returns {{ at: (t: number) => number, speedAt: (t: number) => number, vmax: number }}
 *   at — пройденные метры через t секунд после зелёного, speedAt — скорость, м/с
 */
export function rivalProfile({ distance, time, reaction }) {
  // Путь при vmax = 1 за время до финиша — отсюда настоящая vmax.
  let unit = 0;
  for (let t = 0; t < time - reaction; t += STEP) unit += shape(t + STEP / 2) * STEP;
  const vmax = distance / unit;
  // Таблица пути по времени — интеграл скорости (без накопления ошибки по кадрам).
  const n = Math.ceil((time + 20) / STEP);
  const xs = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) {
    const t = (i - 0.5) * STEP - reaction;
    xs[i] = xs[i - 1] + vmax * shape(t) * STEP;
  }
  const at = (t) => {
    if (t <= 0) return 0;
    const f = t / STEP;
    const i = Math.min(n - 1, Math.floor(f));
    return xs[i] + (xs[i + 1] - xs[i]) * (f - i);
  };
  const speedAt = (t) => vmax * shape(t - reaction);
  return { at, speedAt, vmax };
}
