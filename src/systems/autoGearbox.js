/**
 * autoGearbox — автоматическая коробка для показа (ТЗ 4.4: приборы не влияют на результат).
 *
 * Физика заезда не меняется: скорость и время по-прежнему считает simulate.js.
 * Коробка только раскладывает уже готовую скорость на пять передач, считает обороты
 * и даёт HUD событие «переключились». Педали газа/тормоза двигают стрелку в рамках передачи.
 *
 * Чистые функции без Phaser: состояние можно проверить тестами.
 */
import config from '../../data/config.json';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/** Новое состояние коробки: первая передача, холостые обороты. */
export function createGearbox(cfg = config.gearbox) {
  return { gear: 1, rpm: cfg.idleRpm, shifting: false, shiftTimer: 0, speed01: 0 };
}

/**
 * Шаг коробки.
 * @param {{gear:number,rpm:number,shifting:boolean,shiftTimer:number}} state
 * @param {{speed01?:number, gas?:number, brake?:number}} input
 * @param {number} dt секунды
 */
export function updateGearbox(state, input = {}, dt = 0, cfg = config.gearbox) {
  const speed = clamp(input.speed01 ?? 0, 0, 1);
  const gas = clamp(input.gas ?? 0, 0, 1);
  const brake = clamp(input.brake ?? 0, 0, 1);
  const maxSpeed = cfg.gearMaxSpeed;

  let gear = clamp(state.gear || 1, 1, cfg.gears);

  // Целевая передача по скорости. Вверх можно перескочить сразу, вниз — по одной
  // с запасом, чтобы на границе не мигали две передачи.
  let target = 1;
  while (target < cfg.gears && speed > maxSpeed[target - 1]) target += 1;

  if (target > gear) {
    gear = target;
  } else if (gear > 1 && target < gear) {
    const lower = maxSpeed[gear - 2];
    if (speed < lower - cfg.downshiftHysteresis) gear -= 1;
  }

  if (gear !== state.gear) {
    state.gear = gear;
    state.shiftTimer = cfg.shiftTimeMs / 1000;
  }

  state.shiftTimer = Math.max(0, state.shiftTimer - Math.max(0, dt));
  state.shifting = state.shiftTimer > 0;

  const lower = state.gear === 1 ? 0 : maxSpeed[state.gear - 2];
  const upper = maxSpeed[state.gear - 1];
  const inGear = upper > lower ? clamp((speed - lower) / (upper - lower), 0, 1) : 0;

  let rpm = cfg.idleRpm + (cfg.redlineRpm - cfg.idleRpm) * inGear;
  rpm += gas * cfg.throttleRpm - brake * cfg.brakeRpm;

  // В момент переключения обороты на мгновение проседают — как на настоящем автомате.
  if (state.shifting) rpm *= cfg.shiftRpmFactor;

  state.rpm = clamp(rpm, cfg.idleRpm, cfg.redlineRpm);
  state.speed01 = speed;
  return state;
}
