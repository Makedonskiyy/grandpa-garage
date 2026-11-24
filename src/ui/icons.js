/**
 * Иконки интерфейса — один набор: Phosphor (MIT), начертание regular.
 * SVG лежат в пакете @phosphor-icons/core и попадают в сборку как текст.
 * Цвет — currentColor, то есть цвет текста кнопки; размер задаёт CSS (.icon).
 *
 * Трёх нужных знаков в Phosphor нет (диск колеса, пружина подвески, антикрыло) — они
 * нарисованы ниже в той же сетке 256 и той же толщиной линии 16, что и regular.
 */
import play from '@phosphor-icons/core/assets/regular/play.svg?raw';
import bookOpen from '@phosphor-icons/core/assets/regular/book-open-text.svg?raw';
import sliders from '@phosphor-icons/core/assets/regular/sliders-horizontal.svg?raw';
import close from '@phosphor-icons/core/assets/regular/x.svg?raw';
import check from '@phosphor-icons/core/assets/regular/check.svg?raw';
import drop from '@phosphor-icons/core/assets/regular/drop.svg?raw';
import tire from '@phosphor-icons/core/assets/regular/tire.svg?raw';
import engine from '@phosphor-icons/core/assets/regular/engine.svg?raw';
import carProfile from '@phosphor-icons/core/assets/regular/car-profile.svg?raw';
import wind from '@phosphor-icons/core/assets/regular/wind.svg?raw';
import arrowsOut from '@phosphor-icons/core/assets/regular/arrows-out.svg?raw';
import monitor from '@phosphor-icons/core/assets/regular/monitor.svg?raw';
import mouse from '@phosphor-icons/core/assets/regular/mouse.svg?raw';
import pipe from '@phosphor-icons/core/assets/regular/pipe.svg?raw';
import cpu from '@phosphor-icons/core/assets/regular/cpu.svg?raw';
import gearFine from '@phosphor-icons/core/assets/regular/gear-fine.svg?raw';
import paintBucket from '@phosphor-icons/core/assets/regular/paint-bucket.svg?raw';
import headlights from '@phosphor-icons/core/assets/regular/headlights.svg?raw';
import lightbulb from '@phosphor-icons/core/assets/regular/lightbulb-filament.svg?raw';
import wrench from '@phosphor-icons/core/assets/regular/wrench.svg?raw';
import sprayBottle from '@phosphor-icons/core/assets/regular/spray-bottle.svg?raw';
import hammer from '@phosphor-icons/core/assets/regular/hammer.svg?raw';
import lightning from '@phosphor-icons/core/assets/regular/lightning.svg?raw';
import gauge from '@phosphor-icons/core/assets/regular/gauge.svg?raw';
import barbell from '@phosphor-icons/core/assets/regular/barbell.svg?raw';
import shield from '@phosphor-icons/core/assets/regular/shield.svg?raw';
import scales from '@phosphor-icons/core/assets/regular/scales.svg?raw';
import arrowDown from '@phosphor-icons/core/assets/regular/arrow-fat-lines-down.svg?raw';
import info from '@phosphor-icons/core/assets/regular/info.svg?raw';
import warning from '@phosphor-icons/core/assets/regular/warning.svg?raw';
import caretUp from '@phosphor-icons/core/assets/regular/caret-up.svg?raw';
import caretDown from '@phosphor-icons/core/assets/regular/caret-down.svg?raw';
import caretLeft from '@phosphor-icons/core/assets/regular/caret-left.svg?raw';
import flag from '@phosphor-icons/core/assets/regular/flag-checkered.svg?raw';
import timer from '@phosphor-icons/core/assets/regular/timer.svg?raw';
import heartbeat from '@phosphor-icons/core/assets/regular/heartbeat.svg?raw';
import eyedropper from '@phosphor-icons/core/assets/regular/eyedropper.svg?raw';
import speedometer from '@phosphor-icons/core/assets/regular/speedometer.svg?raw';
import githubLogo from '@phosphor-icons/core/assets/regular/github-logo.svg?raw';
import restart from '@phosphor-icons/core/assets/regular/arrow-counter-clockwise.svg?raw';

const line = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** Диск: обод, ступица и пять спиц. */
const rim = line(
  '<circle cx="128" cy="128" r="96"/><circle cx="128" cy="128" r="24"/>' +
    [0, 72, 144, 216, 288]
      .map((a) => {
        const r = ((a - 90) * Math.PI) / 180;
        const p = (d) =>
          `${(128 + d * Math.cos(r)).toFixed(1)} ${(128 + d * Math.sin(r)).toFixed(1)}`;
        return `<path d="M${p(24)} L${p(96)}"/>`;
      })
      .join(''),
);
/** Подвеска: пружина между двумя опорами. */
const spring = line(
  '<path d="M80 40h96M80 216h96"/><path d="M128 40v16l-48 20 96 24-96 24 96 24-96 24 48 20v24"/>',
);
/** Антикрыло: плоскость крыла на двух стойках. */
const wing = line(
  '<path d="M32 96h192l-24 24H56z"/><path d="M96 120l-16 80M160 120l16 80M56 200h48M152 200h48"/>',
);

/** Суппорт: тормозной диск и скоба поверх его края. */
const caliper = line(
  '<circle cx="128" cy="128" r="88"/><circle cx="128" cy="128" r="20"/>' +
    '<path d="M58 74a96 96 0 0 1 70-42v52a44 44 0 0 0-32 20z" fill="currentColor"/>',
);

const ICONS = {
  play,
  help: bookOpen,
  gear: sliders,
  close,
  check,
  fullscreen: arrowsOut,
  window: monitor,
  mouse,
  info,
  warning,
  back: caretLeft,
  github: githubLogo,
  restart,
  // группы и слоты тюнинга
  wheels: tire,
  tires: tire,
  rims: rim,
  engine,
  intake: wind,
  exhaust: pipe,
  ecu: cpu,
  drivetrain: gearFine,
  gearbox: gearFine,
  chassis: spring,
  suspension: spring,
  body: carProfile,
  spoiler: wing,
  // внешний вид
  looks: paintBucket,
  paint: paintBucket,
  rim,
  caliper,
  headlight: headlights,
  neon: lightbulb,
  custom: eyedropper,
  // обслуживание
  service: wrench,
  oil: drop,
  wash: sprayBottle,
  repair: hammer,
  // характеристики
  power: lightning,
  torque: gauge,
  mass: barbell,
  grip: tire,
  downforce: arrowDown,
  durability: shield,
  ratio: scales,
  condition: heartbeat,
  speed: speedometer,
  // заезд
  shiftUp: caretUp,
  shiftDown: caretDown,
  finish: flag,
  timer,
};

export function icon(name) {
  const span = document.createElement('span');
  span.className = `icon icon--${name}`;
  span.setAttribute('aria-hidden', 'true');
  if (ICONS[name]) span.innerHTML = ICONS[name];
  return span;
}
