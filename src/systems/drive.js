/**
 * drive.js — физика заезда по кадрам: от педалей и передач до времени на финише.
 *
 * Модель (единицы СИ, данные — data/physics.json и data/tests.json):
 *  - мотор: момент по кривой от оборотов (атмо ровный, турбо проваливается до наддува),
 *    пиковый момент подобран так, чтобы максимум мощности равнялся л.с. сборки;
 *  - коробка: передаточные числа сборки, переключение занимает время, на отсечке нет тяги;
 *  - сцепление: на старте сцепление пробуксовывает, пока колёса не догонят мотор;
 *  - шины: тяга не больше μ·(вес + прижим спойлера), лишний газ срывает колёса в пробуксовку,
 *    и тогда тяги меньше (μ скольжения ниже μ покоя) — газ надо дозировать;
 *  - сопротивление: воздух ∝ v², качение и грязь ∝ весу; в глубокой грязи машина
 *    вязнет, если скорость ниже нужной; удары на колее копят повреждения.
 *
 * Состояние — простой объект, шаг — чистая функция: заезд одинаков при одинаковом вводе.
 * runBot — «идеальный водитель» на той же модели: прогноз для гаража и тестов баланса.
 */
import {
  computeStats,
  getTest,
  curveAt,
  format,
  FRESH_CONDITION,
  defaultData,
} from './simulate.js';

export const STEP = 1 / 240;
const TAU = 2 * Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Участок трассы под передком машины. */
export function segmentAt(test, x) {
  const segs = test.track?.segments;
  if (!segs) return { type: test.surfaceType ?? 'asphalt', from: 0, to: test.formula.distance };
  // Бесконечная трасса: участки повторяются по кругу.
  const L = test.track.length;
  const at = test.track.loop ? ((x % L) + L) % L : x;
  return segs.find((s) => at < s.to) ?? segs[segs.length - 1];
}

/** Режим заезда: mud — грунтовка, track — автодром, free — бесконечная, drag — 400 м. */
export const modeOf = (run) => run.test.mode ?? 'drag';

/**
 * Новый заезд.
 * @param {'trial'|'race'} testId
 * @param {object} build
 * @param {{condition?: object, auto?: boolean}} [opts]
 */
export function createRun(testId, build, opts = {}, data = defaultData) {
  const test = getTest(testId, data);
  const stats = computeStats(build, opts.condition ?? FRESH_CONDITION, data);
  const ph = data.physics;
  return {
    testId,
    test,
    stats,
    ph,
    auto: Boolean(opts.auto),
    length: test.track?.length ?? test.formula.distance,
    mass: stats.mass + ph.driverMass,
    t: 0,
    x: 0,
    v: 0,
    gear: 1,
    rpm: ph.engine.idleRpm,
    slip: 0,
    shiftTimer: 0,
    /** Зелёный загорелся: время идёт с этого момента. До старта машина стоит. */
    green: false,
    started: false,
    reaction: null,
    done: false,
    ok: false,
    reasonKey: null,
    damage: 0,
    capacity: stats.durability * (test.damage?.perDurability ?? Infinity),
    sink: 0,
    stuckTimer: 0,
    launchRpm: 0,
    /** Последняя тяга и предел шин — для приборов и бота. */
    drive: 0,
    gripLimit: 0,
    limiter: false,
    log: { spin: 0, limiter: 0, shifts: 0, deepTraction: 0, deepPower: 0, topSpeed: 0 },
    events: [],
  };
}

/** Обороты колёс на передаче (об/мин). */
function wheelRpm(run, v, gear = run.gear) {
  return (v / run.ph.wheelRadius) * run.stats.ratios[gear - 1] * (60 / TAU);
}

/** Момент мотора на оборотах (Н·м) при полном газе. */
function torqueAt(run, rpm) {
  return run.stats.torque * curveAt(run.stats.curve, clamp(rpm / run.stats.redline, 0, 1));
}

/** Сила тяги на колёсах при полном газе на передаче и оборотах. */
function wheelForce(run, rpm, gear = run.gear) {
  const { wheelRadius, drivetrainEfficiency } = run.ph;
  return (torqueAt(run, rpm) * run.stats.ratios[gear - 1] * drivetrainEfficiency) / wheelRadius;
}

function surfaceOf(run) {
  // Покрытие участка (бесконечная трасса чередует грунт и асфальт), иначе — покрытие заезда.
  const seg = segmentAt(run.test, run.x);
  return run.test.surfaces?.[seg.type]?.grip ?? run.test.surface;
}

/** Предел сцепления шин (Н): полный привод, вес + прижим спойлера на скорости. */
function gripLimit(run, v) {
  const ph = run.ph;
  const mu = run.stats.grip[surfaceOf(run)] * ph.muPerGrip[surfaceOf(run)];
  const load = run.mass * ph.g + run.stats.downforce * ph.downforcePerPoint * v * v;
  return mu * load;
}

export function shiftUp(run) {
  // На ручной коробке старт — включить первую передачу.
  if (!run.started && !run.done) return startRun(run);
  if (!run.started || run.done || run.shiftTimer > 0 || run.gear >= run.stats.ratios.length) {
    return false;
  }
  run.gear += 1;
  run.shiftTimer = run.stats.shiftSec + (run.auto ? run.ph.gearbox.autoShiftExtraMs / 1000 : 0);
  run.log.shifts += 1;
  run.events.push({ type: 'shift', gear: run.gear });
  return true;
}

export function shiftDown(run) {
  if (!run.started || run.done || run.shiftTimer > 0 || run.gear <= 1) return false;
  // Защита от перекрута: если на низшей мотор уйдёт за отсечку — не включаем.
  if (wheelRpm(run, run.v, run.gear - 1) > run.stats.redline * 0.98) {
    run.events.push({ type: 'overrev' });
    return false;
  }
  run.gear -= 1;
  run.shiftTimer = run.stats.shiftSec;
  run.log.shifts += 1;
  run.events.push({ type: 'shift', gear: run.gear });
  return true;
}

/** Загорелся зелёный: с этого момента идёт время, реакция игрока — в зачёт. */
export function greenLight(run) {
  run.green = true;
}

/**
 * Трогание: сцепление схватывает на набранных оборотах. До зелёного — фальстарт:
 * в заезде это поражение, на обкатке машина просто не трогается (событие early).
 * @returns {boolean} тронулась ли машина
 */
export function startRun(run) {
  if (run.started || run.done) return false;
  if (!run.green) {
    if (run.test.jumpStartFails) {
      run.events.push({ type: 'jump' });
      finish(run, false, 'jump');
    } else run.events.push({ type: 'early' });
    return false;
  }
  run.started = true;
  run.reaction = run.t;
  run.launchRpm = Math.max(run.rpm, run.ph.clutch.launchMinRpm);
  // Автомат трогается мягко, как с гидротрансформатором: не выше лучших оборотов старта.
  if (run.auto) run.launchRpm = Math.min(run.launchRpm, bestLaunchRpm(run));
  run.events.push({ type: 'start', rpm: run.rpm });
  return true;
}

function finish(run, ok, reasonKey = null) {
  run.done = true;
  run.ok = ok;
  run.reasonKey = reasonKey;
  run.events.push({ type: ok ? 'finish' : 'fail', reasonKey });
}

/**
 * Шаг физики.
 * @param {ReturnType<typeof createRun>} run
 * @param {{gas?: number, brake?: number}} input педали 0–1
 * @param {number} dt секунды (внутри дробится на шаги STEP)
 */
export function stepRun(run, input = {}, dt = STEP) {
  let left = Math.min(dt, 0.1);
  while (left > 1e-9 && !run.done) {
    const h = Math.min(STEP, left);
    tick(run, clamp(input.gas ?? 0, 0, 1), clamp(input.brake ?? 0, 0, 1), h);
    left -= h;
  }
  return run;
}

function tick(run, gas, brake, h) {
  const { ph, stats } = run;
  const { idleRpm } = ph.engine;
  const redline = stats.redline;

  // До старта: мотор на нейтрали, газ раскручивает его до отсечки; после зелёного идёт время.
  if (!run.started) {
    if (run.green) run.t += h;
    const target = idleRpm + gas * (redline - idleRpm);
    const rate = target > run.rpm ? ph.engine.revUpPerSec : ph.engine.revDownPerSec;
    run.rpm += clamp(target - run.rpm, -rate * h, rate * h);
    run.limiter = run.rpm >= redline * 0.995;
    return;
  }

  run.t += h;
  const v = run.v;
  const limit = gripLimit(run, v);
  run.gripLimit = limit;

  // Автомат: вверх у отсечки, вниз при провале оборотов под газом.
  if (run.auto && run.shiftTimer <= 0) {
    // По оборотам колёс, а не мотора: на старте мотор раскручен, но машина ещё стоит.
    if (wheelRpm(run, v) >= redline * ph.gearbox.autoUpshift) shiftUp(run);
    else if (gas > 0.3 && run.gear > 1 && run.rpm < redline * ph.gearbox.autoDownshift) {
      shiftDown(run);
    }
  }

  // Обороты мотора: от колёс (с пробуксовкой), на старте не ниже оборотов сцепления.
  const fromWheels = wheelRpm(run, v) * (1 + run.slip * ph.slip.rpmFlare);
  // Сцепление на первой пробуксовывает и держит обороты старта, пока колёса их не догонят:
  // обороты задаёт газ (больше газа — ближе к оборотам, набранным перед стартом).
  const clutchFloor = run.gear === 1 ? idleRpm + (run.launchRpm - idleRpm) * gas : idleRpm;
  let rpm = Math.max(fromWheels, clutchFloor, idleRpm);

  // Тяга мотора.
  let drive = 0;
  const shifting = run.shiftTimer > 0;
  if (shifting) run.shiftTimer = Math.max(0, run.shiftTimer - h);
  run.limiter = rpm >= redline;
  if (run.limiter) run.log.limiter += h;
  if (!shifting && !run.limiter) drive = gas * wheelForce(run, rpm);
  else if (!shifting) drive = gas * wheelForce(run, rpm) * (1 - ph.engine.limiterCut);
  run.drive = drive;

  // Пробуксовка: лишняя тяга сверх предела шин срывает колёса.
  const over = limit > 0 ? drive / limit - 1 : 0;
  if (over > 0) run.slip = Math.min(1, run.slip + ph.slip.rise * over * h + 0.6 * h);
  else run.slip = Math.max(0, run.slip - ph.slip.fall * h * (1 - over));
  if (run.slip > ph.slip.smokeAt) run.log.spin += h;
  const traction = Math.min(drive, limit * (1 - (1 - ph.slip.kinetic) * run.slip));

  // Сопротивление: воздух, качение, грязь трассы.
  const seg = segmentAt(run.test, run.x);
  const surf = run.test.surfaces?.[seg.type] ?? {};
  const spoilerDrag = stats.downforce * ph.spoilerDragPerPoint;
  const air = 0.5 * ph.airDensity * (ph.dragArea + spoilerDrag) * v * v;
  const ground =
    run.mass *
    ph.g *
    (ph.rollingResistance +
      (surf.resistance ?? 0) +
      (surf.resistancePerSpeed ?? 0) * v +
      run.sink * (surf.sinkResistance ?? 0));
  const brakeForce = brake * Math.min(limit, ph.brakeMu * run.mass * ph.g);
  const resist = air + ground + brakeForce;

  // Колёса и диски раскручиваются вместе с машиной: тяжёлые диски — больше инерции.
  const effMass = run.mass + stats.rimMass * ph.rimInertia;
  const a = (traction - resist) / effMass;
  run.v = Math.max(0, v + a * h);
  run.x += run.v * h;
  run.accel = a;
  run.log.topSpeed = Math.max(run.log.topSpeed, run.v);

  rpm = Math.max(wheelRpm(run, run.v) * (1 + run.slip * ph.slip.rpmFlare), clutchFloor, idleRpm);
  if (shifting) rpm = Math.max(idleRpm, run.rpm + (rpm - run.rpm) * Math.min(1, h * 14));
  run.rpm = Math.min(rpm, redline * 1.01);

  if (modeOf(run) !== 'drag') trialHazards(run, seg, surf, gas, drive, limit, h);
  else if (run.x >= run.length) {
    const broken = stats.durability < run.test.minDurability;
    finish(
      run,
      !broken && run.t < run.test.rivalTime,
      broken ? 'broken' : run.t < run.test.rivalTime ? null : 'slow',
    );
  }
}

/** Обкатка: вязкая грязь, удары колеи, финиш. */
function trialHazards(run, seg, surf, gas, drive, limit, h) {
  const test = run.test;
  if (seg.type === 'deep') {
    if (run.v < surf.minSpeed)
      run.sink = Math.min(1, run.sink + surf.sinkPerSec * (1 - run.v / surf.minSpeed) * h);
    else run.sink = Math.max(0, run.sink - surf.sinkPerSec * 0.5 * h);
    if (gas > 0.5) {
      if (drive >= limit * 0.97 || run.slip > 0.3) run.log.deepTraction += h;
      else run.log.deepPower += h;
    }
  } else {
    run.sink = Math.max(0, run.sink - h);
  }
  if (surf.impact) {
    const d = test.damage;
    const vv = run.v * run.v + d.baseSpeed * d.baseSpeed;
    if (run.v > 0.3)
      run.damage += surf.impact * run.stats.impact * (vv / (d.refSpeed * d.refSpeed)) * h;
  }
  if (run.damage >= run.capacity) return finish(run, false, 'broken');
  // Завяз: в глубокой грязи — когда засосало, в любом месте — если долго стоит на газу.
  if (run.v < 0.25 && gas > 0.5) run.stuckTimer += h;
  else run.stuckTimer = 0;
  if (run.sink >= 1 || run.stuckTimer > 2.5) {
    const traction = run.log.deepTraction >= run.log.deepPower || run.slip > 0.3;
    return finish(run, false, traction ? 'traction' : 'power');
  }
  const mode = modeOf(run);
  if (mode === 'mud' && run.x >= run.length) finish(run, true);
  if (mode === 'track') trackRules(run);
}

/**
 * Автодром: к отметке trap.at нужно разогнаться до trap.minSpeed, затем остановиться
 * между конусами зоны. Проехал зону — «не успел оттормозиться», встал раньше — «рано».
 */
function trackRules(run) {
  const { trap, zone } = run.test;
  if (run.trapSpeed === undefined && run.x >= trap.at) {
    run.trapSpeed = run.v;
    run.events.push({ type: 'trap', v: run.v });
    if (run.v < trap.minSpeed) return finish(run, false, 'slow');
  }
  if (run.x > zone.to) return finish(run, false, 'overshoot');
  if (run.trapSpeed !== undefined && run.v < 0.05) {
    finish(run, run.x >= zone.from, run.x >= zone.from ? null : 'short');
  }
}

// ---------- Идеальный водитель ----------

/**
 * Обороты, на которых выгодно переключиться вверх: дальше тяга на следующей передаче
 * при той же скорости уже не меньше. На последней передаче — null.
 */
export function shiftPoint(run, gear = run.gear) {
  const { ratios, redline } = run.stats;
  if (gear >= ratios.length) return null;
  const idle = run.ph.engine.idleRpm;
  for (let r = idle * 2; r <= redline; r += 50) {
    const next = (r * ratios[gear]) / ratios[gear - 1];
    if (wheelForce(run, next, gear + 1) >= wheelForce(run, r, gear))
      return Math.min(r, redline * 0.97);
  }
  return redline * 0.97;
}

/** Зелёная зона тахометра: до старта — обороты старта, в движении — где переключаться. */
export function greenZone(run) {
  const redline = run.stats.redline;
  if (!run.started) {
    const best = bestLaunchRpm(run);
    return [Math.max(run.ph.clutch.launchMinRpm, best - 600), Math.min(redline * 0.95, best + 400)];
  }
  const at = shiftPoint(run);
  return at === null ? null : [Math.max(at - 350, run.ph.engine.idleRpm), redline];
}

/** Обороты старта: самые высокие, при которых тяга на первой не срывает колёса. */
export function bestLaunchRpm(run) {
  const limit = gripLimit(run, 0) * 0.985;
  let best = run.ph.clutch.launchMinRpm;
  let bestForce = 0;
  for (let r = run.ph.clutch.launchMinRpm; r <= run.stats.redline * 0.95; r += 100) {
    const f = Math.min(wheelForce(run, r, 1), limit);
    if (f > bestForce + 1) {
      bestForce = f;
      best = r;
    }
  }
  return best;
}

/** Газ, при котором тяга чуть ниже предела шин (без пробуксовки). */
function cleanGas(run) {
  const full = wheelForce(run, Math.max(run.rpm, run.ph.engine.idleRpm));
  if (full <= 0) return 1;
  return clamp((gripLimit(run, run.v) * 0.985) / full, 0, 1);
}

/** Переключиться вверх выгодно: на следующей передаче тяга не меньше или мотор у отсечки. */
function wantsUpshift(run) {
  if (run.gear >= run.stats.ratios.length || run.shiftTimer > 0) return false;
  const now = wheelForce(run, run.rpm);
  const nextRpm = wheelRpm(run, run.v, run.gear + 1);
  if (nextRpm < run.ph.engine.idleRpm * 1.5) return false;
  return wheelForce(run, nextRpm, run.gear + 1) >= now || run.rpm >= run.stats.redline * 0.985;
}

/** Целевая скорость бота на обкатке: тише на колее, разгон перед глубокой грязью. */
function trialTarget(run) {
  const test = run.test;
  const d = test.damage;
  const decel = 0.6 * run.ph.g * Math.min(1, run.stats.grip.clay * run.ph.muPerGrip.clay + 0.1);
  let target = test.bot.cruise;
  for (const s of test.track.segments) {
    if (s.to <= run.x) continue;
    const surf = test.surfaces[s.type];
    const want = surf.impact
      ? d.baseSpeed * test.bot.rutsFactor
      : s.type === 'deep'
        ? 99
        : test.bot.cruise;
    const dist = Math.max(0, s.from - run.x);
    // Скорость, с которой ещё успеем оттормозиться до участка.
    target = Math.min(target, Math.sqrt(want * want + 2 * decel * dist));
    if (s.from <= run.x) target = Math.min(target, want);
    if (dist > 60) break;
  }
  // Глубокая грязь впереди или под колёсами: только газ в пол.
  const seg = segmentAt(test, run.x);
  const next = test.track.segments.find((s) => s.from > run.x);
  if (seg.type === 'deep' || (next?.type === 'deep' && next.from - run.x < test.bot.runUp))
    return 99;
  return target;
}

/**
 * Прогон идеального водителя: старт на нужных оборотах, газ без пробуксовки,
 * переключения в лучший момент; на обкатке — тише на колее и с разгоном в грязь.
 */
export function runBot(testId, build, opts = {}, data = defaultData) {
  const run = createRun(testId, build, { condition: opts.condition, auto: false }, data);
  if (!run.stats.complete) return run;
  // Обороты старта держит газом, на зелёный трогается с реакцией хорошего водителя.
  const best = bestLaunchRpm(run);
  const { idleRpm } = run.ph.engine;
  run.rpm = best;
  greenLight(run);
  const hold = (best - idleRpm) / (run.stats.redline - idleRpm);
  while (run.t < run.ph.reaction.bot) stepRun(run, { gas: hold }, STEP);
  startRun(run);
  const maxT = 90;
  while (!run.done && run.t < maxT) {
    if (wantsUpshift(run)) shiftUp(run);
    let gas = cleanGas(run);
    let brake = 0;
    if (modeOf(run) === 'track') {
      const { zone } = run.test;
      const stopAt = (zone.from + zone.to) / 2;
      const mu = run.stats.grip.asphalt * run.ph.muPerGrip.asphalt;
      const decel = Math.min(run.ph.brakeMu, mu) * run.ph.g * 0.97;
      const need = (run.v * run.v) / (2 * decel);
      const bump = run.test.track.segments.find(
        (s) => run.test.surfaces[s.type]?.impact && s.to > run.x && s.from - run.x < 25,
      );
      // Держит скорость, с которой ещё успеет встать в середине зоны.
      if (run.x + need >= stopAt) {
        gas = 0;
        brake = 1;
      } else if (bump && run.v > run.test.bot.bumpSpeed) {
        gas = 0;
        brake = clamp((run.v - run.test.bot.bumpSpeed) / 3, 0, 1);
      }
    } else if (modeOf(run) !== 'drag') {
      const target = trialTarget(run);
      if (run.v > target + 0.4) {
        gas = 0;
        brake = clamp((run.v - target) / 3, 0, 1);
      } else if (run.v > target - 0.3) gas = Math.min(gas, 0.35);
      // На первой передаче на колее мотор не нужен на отсечке.
      if (run.gear > 1 && run.rpm < run.stats.redline * 0.3 && run.v < 8) shiftDown(run);
    }
    stepRun(run, { gas, brake }, STEP);
  }
  if (!run.done) finish(run, false, modeOf(run) === 'mud' ? 'power' : 'slow');
  return run;
}

// ---------- Итог заезда для сцен и гаража ----------

/**
 * Итог по завершённому заезду: успех, причина простыми словами, подсказка, числа.
 * @param {ReturnType<typeof createRun>} run
 * @param {ReturnType<typeof runBot>} [best] прогон бота — чтобы отличить «сборка» от «езда»
 */
export function summarize(run, best = null) {
  const { test, stats } = run;
  if (!stats.complete) {
    return { ok: false, reasonKey: 'incomplete', reason: null, hint: null, stats, details: null };
  }
  let reasonKey = run.ok ? null : run.reasonKey;
  // Сборка позволяла, а не вышло — значит, дело в езде.
  const buildCould = best?.ok;
  if (!run.ok && buildCould && !['broken', 'jump'].includes(reasonKey)) reasonKey = 'driving';
  if (!run.ok && buildCould && reasonKey === 'broken' && modeOf(run) !== 'drag')
    reasonKey = 'rough';

  let reason = null;
  if (reasonKey === 'broken')
    reason = format(test.reasons.broken, { part: stats.weakestPart?.name });
  else if (reasonKey === 'slow') {
    reason = test.reasons[raceWeakness(run, best)];
    if (stats.mass >= test.heavyMass) reason += test.reasons.heavySuffix;
  } else if (reasonKey) reason = test.reasons[reasonKey];

  const details = {
    time: run.t,
    distance: Math.min(run.x, run.length),
    length: run.length,
    topSpeedKmh: run.log.topSpeed * 3.6,
    spin: run.log.spin,
    limiter: run.log.limiter,
    shifts: run.log.shifts,
    damage: run.damage,
    capacity: run.capacity,
    bestTime: best?.ok ? best.t : null,
    reaction: run.reaction,
  };
  if (modeOf(run) === 'drag') {
    details.rivalTime = test.rivalTime;
    details.diff = run.t - test.rivalTime;
    details.diffText = format(details.diff >= 0 ? test.reasons.slower : test.reasons.faster, {
      diff: Math.abs(details.diff).toFixed(2).replace('.', ','),
    });
  }

  let hint = reasonKey
    ? test.resultHints[reasonKey === 'slow' ? raceWeakness(run, best) : reasonKey]
    : null;
  if (reasonKey === 'driving' || reasonKey === 'rough') hint = drivingHint(run);
  return { ok: run.ok, reasonKey, reason, hint, stats, details };
}

/** Почему сборка медленная: колёса срываются или мотор не тянет. */
function raceWeakness(run, best) {
  const r = best ?? run;
  return r.log.spin > 1.2 ? 'traction' : 'power';
}

/** Совет по езде: что именно стоило сделать иначе. */
function drivingHint(run) {
  const h = run.test.drivingHints;
  if (modeOf(run) === 'track') {
    if (run.reasonKey === 'broken') return h.bumps;
    return h[run.reasonKey] ?? h.brake;
  }
  if (modeOf(run) !== 'drag') {
    if (run.reasonKey === 'broken') return h.ruts;
    return run.slip > 0.3 || run.log.deepTraction > run.log.deepPower ? h.spin : h.momentum;
  }
  if (run.log.spin > 1) return format(h.spin, { sec: run.log.spin.toFixed(1).replace('.', ',') });
  if (run.log.limiter > 0.8)
    return format(h.limiter, { sec: run.log.limiter.toFixed(1).replace('.', ',') });
  return h.launch;
}

/** Прогноз для гаража: что будет у идеального водителя. */
export function predict(testId, build, condition) {
  const stats = computeStats(build, condition);
  if (!stats.complete) return summarize(createRun(testId, build, { condition }));
  const best = runBot(testId, build, { condition });
  return summarize(best, null);
}

/**
 * Оценка сборки 1–10 для плашки в гараже — по лучшему времени на 400 м:
 * 17,5 с и медленнее — 1, 11,5 с и быстрее — 10. Палыч (13,0 с) — около 8.
 */
export function buildRating(build, condition) {
  const stats = computeStats(build, condition);
  if (!stats.complete) return null;
  const t = runBot('race', build, { condition }).t;
  return clamp(Math.round(1 + (9 * (17.5 - t)) / (17.5 - 11.5)), 1, 10);
}
