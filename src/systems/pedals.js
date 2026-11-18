/**
 * pedals — чистое состояние педалей газа и тормоза.
 *
 * Значения плавно нарастают и отпускаются, чтобы машина не дёргалась от одного кадра.
 * Сами педали не меняют расчёт заезда: они только дают input для тахометра, звука
 * и покачивания кузова.
 */
import config from '../../data/config.json';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function createPedalState() {
  return { gas: 0, brake: 0, gasTarget: false, brakeTarget: false };
}

/** Нажата ли педаль. */
export function setPedalTarget(state, pedal, pressed) {
  if (pedal === 'gas') state.gasTarget = Boolean(pressed);
  else if (pedal === 'brake') state.brakeTarget = Boolean(pressed);
  return state;
}

/** Код клавиши относится к педали? */
export function isPedalKey(code, pedal, cfg = config.pedals) {
  return (cfg.keys[pedal] ?? []).includes(code);
}

/**
 * Шаг сглаживания.
 * @param {ReturnType<typeof createPedalState>} state
 * @param {number} dt секунды
 */
export function stepPedals(state, dt, cfg = config.pedals) {
  const tick = (value, target, attack, release) => {
    const rate = target ? attack : release;
    const k = Math.min(1, Math.max(0, dt) * rate);
    return clamp(value + ((target ? 1 : 0) - value) * k, 0, 1);
  };

  state.gas = tick(state.gas, state.gasTarget, cfg.attackPerSec, cfg.releasePerSec);
  state.brake = tick(state.brake, state.brakeTarget, cfg.brakeAttackPerSec, cfg.brakeReleasePerSec);
  return state;
}
