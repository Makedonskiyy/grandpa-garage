#!/usr/bin/env node
/**
 * build-car — генератор модульной пиксельной машины игрока («дедова японка»).
 *
 * Машина описана здесь векторами (SVG) и растеризуется без сглаживания (crispEdges),
 * поэтому получается чистый пиксель-арт с ровной сеткой. Каждый слой — отдельный PNG
 * одного размера с общей точкой привязки (ТЗ 5.1), колёса — ленты кадров вращения.
 *
 * Слои, которые перекрашивает игра (setTint = умножение), нарисованы в оттенках серого:
 * краска кузова и спойлера, диски, стекло фар. Тени и блики при перекраске сохраняются.
 *
 * Силуэт — обобщённое японское купе конца 90-х без марок, шильдиков и названий (ТЗ 2.1).
 *
 *   npm run car              — собрать в public/assets/images/car и data/car.json
 *   npm run car -- --preview — плюс превью вариантов в art/preview/car.png
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}public/assets/images/car/`;
const PREVIEW = process.argv.includes('--preview');

// ---------- Геометрия: всё считается от этих опорных точек (машина смотрит вправо) ----------
const W = 288;
const H = 96;
const GROUND = 92;
const WHEEL_R = 20;
const WHEEL_Y = GROUND - WHEEL_R; // 72
const REAR_X = 62;
const FRONT_X = 222;
const ARCH_R = 24;
const SILL = 80; // низ порогов
const BELT = 45; // линия окон
const ROOF = 17;
const FRAME = 48; // кадр колеса 48×48
const FRAMES = 16; // кадров на оборот

const C = {
  outline: '#111216',
  well: '#0b0b0e',
  trim: '#1b1c21',
  trimHi: '#2c2e35',
  rubber: '#1f2024',
  rubberHi: '#3a3c43',
  glassDark: '#151c28',
  glass: '#253149',
  glassHi: '#4b5f7d',
  glassShine: '#8aa0c0',
  tail: '#a81f2a',
  tailHi: '#e2484f',
  marker: '#d98a2b',
  metal: '#6d7178',
  metalDark: '#45484f',
  brake: '#8a8d93',
  brick: '#8e4a33',
  brickDark: '#5e2f21',
  mortar: '#b9a48a',
};
// Серая шкала для перекрашиваемых слоёв (умножается на цвет).
const G = {
  hi: '#ffffff',
  light: '#eeeeee',
  base: '#d6d6d6',
  mid: '#b6b6b6',
  low: '#929292',
  dark: '#6e6e6e',
};

const archX = (cx, y) => Math.sqrt(ARCH_R * ARCH_R - (y - WHEEL_Y) ** 2);
const fdx = archX(FRONT_X, SILL).toFixed(2);
const rdx = archX(REAR_X, SILL).toFixed(2);

// Контур кузова по часовой: зад → багажник → стойка C → крыша → лобовое → капот → нос → низ с арками.
const BODY_PATH = [
  `M 6 ${SILL}`,
  'L 3 62',
  'L 4 50',
  `L 8 ${BELT - 1}`,
  `L 58 ${BELT - 2}`,
  'L 92 20',
  `L 100 ${ROOF}`,
  `L 146 ${ROOF}`,
  'L 153 20',
  `L 190 ${BELT}`,
  'L 248 48',
  'L 274 52',
  'L 281 57',
  'L 283 70',
  `L 280 ${SILL}`,
  `L ${(FRONT_X + +fdx).toFixed(2)} ${SILL}`,
  `A ${ARCH_R} ${ARCH_R} 0 1 0 ${(FRONT_X - fdx).toFixed(2)} ${SILL}`,
  `L ${(REAR_X + +rdx).toFixed(2)} ${SILL}`,
  `A ${ARCH_R} ${ARCH_R} 0 1 0 ${(REAR_X - rdx).toFixed(2)} ${SILL}`,
  'Z',
].join(' ');

// Стёкла: маленькая задняя форточка и дверное, между ними стойка B.
const B_PILLAR = { x: 116, w: 4 };
const QUARTER_GLASS = `M 82 ${BELT - 3} L 101 21 L ${B_PILLAR.x} 20 L ${B_PILLAR.x} ${BELT - 3} Z`;
const DOOR_GLASS = `M ${B_PILLAR.x + B_PILLAR.w} 20 L 145 20 L 150 22 L 180 ${BELT - 3} L ${B_PILLAR.x + B_PILLAR.w} ${BELT - 3} Z`;
const HEADLIGHT = 'M 258 50 L 274 53 L 280 58 L 260 58 Z';

const svg = (body, { w = W, h = H } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;

function rng(seed) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

const clipBody = `<clipPath id="body"><path d="${BODY_PATH}"/></clipPath>`;
const clipGlass = `<clipPath id="glass"><path d="${QUARTER_GLASS}"/><path d="${DOOR_GLASS}"/></clipPath>`;
const rect = (x, y, w, h, fill) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

// Всё «не краска» на кузове: стёкла, рамки, чёрные пороги, фонари. Одна функция и для
// основы, и для маски краски — так они никогда не разъедутся.
const NON_PAINT = (fill) => `
  <path d="${QUARTER_GLASS}" fill="${fill ?? C.glass}" stroke="${fill ?? C.trim}" stroke-width="2"/>
  <path d="${DOOR_GLASS}" fill="${fill ?? C.glass}" stroke="${fill ?? C.trim}" stroke-width="2"/>
  ${rect(B_PILLAR.x, 19, B_PILLAR.w, BELT - 21, fill ?? C.trim)}
  <path d="M 153 20 L 191 ${BELT} L 187 ${BELT} L 151 21 Z" fill="${fill ?? C.glassDark}"/>
  <path d="M 92 20 L 58 ${BELT - 2} L 63 ${BELT - 2} L 95 21 Z" fill="${fill ?? C.glassDark}"/>
  ${rect(0, SILL - 4, W, 10, fill ?? C.trim)}
  ${rect(262, 66, 21, 8, fill ?? C.trim)}
  ${rect(3, 49, 4, 8, fill ?? C.tail)}
  ${rect(244, 60, 5, 2, fill ?? C.marker)}
  ${rect(176, BELT - 6, 8, 5, fill ?? C.trim)}
  ${rect(182, BELT + 1, 1, SILL - BELT - 5, fill ?? C.outline)}
  ${rect(B_PILLAR.x + 1, BELT + 1, 1, SILL - BELT - 5, fill ?? C.outline)}
  ${rect(160, 52, 8, 2, fill ?? C.trim)}
  <path d="${HEADLIGHT}" fill="${fill ?? C.trim}"/>
`;

// ---------- Слои ----------

/** Ниши колёс — под колёсами, чтобы в пустой арке было темно, а не фон. */
function layerWells() {
  const well = (cx) => `<circle cx="${cx}" cy="${WHEEL_Y}" r="${ARCH_R - 1}" fill="${C.well}"/>`;
  return svg(`
    <defs><clipPath id="above"><rect x="0" y="0" width="${W}" height="${SILL}"/></clipPath></defs>
    <g clip-path="url(#above)">${well(REAR_X)}${well(FRONT_X)}</g>
  `);
}

/** Основа: обводка, стёкла, чёрные элементы, фонари — всё, что не перекрашивается. */
function layerBase() {
  return svg(`
    <defs>${clipBody}</defs>
    <path d="${BODY_PATH}" fill="${C.outline}"/>
    <g clip-path="url(#body)">
      ${NON_PAINT()}
      <!-- решётка в бампере и губа -->
      ${rect(264, 68, 17, 1, C.trimHi)}
      ${rect(264, 70, 17, 1, C.trimHi)}
      ${rect(266, SILL - 2, 16, 2, C.trimHi)}
      <!-- блик на фонаре -->
      ${rect(3, 50, 2, 2, C.tailHi)}
      <!-- блики и отражения в стёклах -->
      <path d="M 122 23 L 143 22 L 146 24 L 124 26 Z" fill="${C.glassHi}"/>
      <path d="M 126 ${BELT - 8} L 164 ${BELT - 11} L 168 ${BELT - 9} L 128 ${BELT - 6} Z" fill="${C.glassDark}"/>
      <path d="M 102 24 L 112 23 L 112 25 L 100 26 Z" fill="${C.glassHi}"/>
      <path d="M 155 21 L 166 27 L 165 28 L 154 22 Z" fill="${C.glassShine}"/>
      <!-- лючок бензобака -->
      <rect x="38" y="49" width="9" height="6" fill="none" stroke="${C.outline}" stroke-width="1"/>
      <!-- порог: рёбра -->
      ${rect(88, SILL - 3, 108, 1, C.trimHi)}
    </g>
    <!-- антенна -->
    ${rect(26, BELT - 9, 1, 8, C.trim)}
  `);
}

/** Краска кузова в серой шкале: свет сверху, тень снизу, рельеф по бокам. */
function layerPaint() {
  const bands = [
    [ROOF, 6, G.hi],
    [ROOF + 6, BELT - ROOF - 8, G.light],
    [BELT - 2, 2, G.hi],
    [BELT, 3, G.light],
    [BELT + 3, 9, G.base],
    [BELT + 12, 1, G.hi], // верхняя выштамповка
    [BELT + 13, 11, G.mid],
    [BELT + 24, 1, G.base], // нижняя выштамповка
    [BELT + 25, SILL - BELT - 25, G.low],
  ];
  return svg(`
    <defs>${clipBody}</defs>
    <g clip-path="url(#body)">
      ${bands.map(([y, h, f]) => rect(0, y, W, h, f)).join('')}
      <!-- торцы темнее: объём -->
      ${rect(0, BELT, 5, SILL - BELT, G.mid)}
      ${rect(278, 52, 10, SILL - 52, G.mid)}
      <!-- расширители арок: светлая кромка над колесом -->
      <circle cx="${REAR_X}" cy="${WHEEL_Y}" r="${ARCH_R + 2}" fill="none" stroke="${G.light}" stroke-width="1"/>
      <circle cx="${FRONT_X}" cy="${WHEEL_Y}" r="${ARCH_R + 2}" fill="none" stroke="${G.light}" stroke-width="1"/>
      <!-- капот: длинный блик -->
      <path d="M 192 ${BELT + 1} L 248 49 L 248 50 L 192 ${BELT + 2} Z" fill="${G.hi}"/>
    </g>
    <path d="${BODY_PATH}" fill="none" stroke="${C.outline}" stroke-width="2"/>
  `);
}

function layerPaintMask() {
  return svg(`<rect width="${W}" height="${H}" fill="#fff"/>${NON_PAINT('#000')}`);
}

/** Стекло фары (серое → цвет фар). */
function layerHeadlight() {
  return svg(`
    <path d="${HEADLIGHT}" fill="${G.base}"/>
    ${rect(268, 54, 6, 2, G.hi)}
    ${rect(262, 56, 4, 1, G.light)}
    <path d="${HEADLIGHT}" fill="none" stroke="${C.outline}" stroke-width="1"/>
  `);
}

/** Грязь: пыль на стёклах, грязь по низу и брызги у арок. */
function layerDirt() {
  const r = rng(7);
  const browns = ['#5b4a37', '#6e5a42', '#7d6a50', '#4a3d2e'];
  let dots = '';
  for (let i = 0; i < 480; i++) {
    const x = Math.floor(r() * W);
    const y = BELT + 6 + Math.floor(Math.pow(r(), 0.45) * (SILL - BELT - 6));
    if (r() < (y - BELT) / (SILL - BELT + 6)) {
      dots += rect(x, y, r() < 0.3 ? 2 : 1, 1, browns[Math.floor(r() * 4)]);
    }
  }
  for (const cx of [REAR_X, FRONT_X]) {
    for (let i = 0; i < 60; i++) {
      const a = Math.PI + r() * Math.PI;
      const d = ARCH_R + 2 + r() * 6;
      dots += rect(
        Math.round(cx + Math.cos(a) * d),
        Math.round(WHEEL_Y + Math.sin(a) * d),
        1,
        1,
        browns[Math.floor(r() * 4)],
      );
    }
  }
  let dust = '';
  for (let i = 0; i < 80; i++) {
    dust += rect(
      82 + Math.floor(r() * 100),
      21 + Math.floor(r() * 22),
      1 + Math.floor(r() * 3),
      1,
      '#8d8a80',
    );
  }
  for (let i = 0; i < 12; i++) {
    dust += rect(
      14 + Math.floor(r() * 262),
      BELT + 2 + Math.floor(r() * 8),
      1,
      4 + Math.floor(r() * 8),
      '#6e5a42',
    );
  }
  return svg(`
    <defs>${clipBody}${clipGlass}</defs>
    <g clip-path="url(#body)">${dots}</g>
    <g clip-path="url(#glass)">${dust}</g>
  `);
}

/** Накладки кузовов: ржавчина, каркас, карбон. */
function layerOverlay(kind) {
  if (kind === 'rust') {
    const r = rng(21);
    const rust = ['#7a3a1c', '#93481f', '#b25b26', '#5c2c16'];
    const zones = [
      [REAR_X - 30, SILL - 14, 22, 10],
      [REAR_X + 10, SILL - 12, 20, 8],
      [FRONT_X - 32, SILL - 12, 22, 8],
      [FRONT_X + 12, SILL - 14, 20, 10],
      [92, SILL - 9, 90, 5],
      [6, BELT + 10, 16, 14],
    ];
    let spots = '';
    for (const [zx, zy, zw, zh] of zones) {
      for (let i = 0; i < zw * zh * 0.22; i++) {
        spots += rect(
          zx + Math.floor(r() * zw),
          zy + Math.floor(r() * zh),
          r() < 0.4 ? 2 : 1,
          1,
          rust[Math.floor(r() * 4)],
        );
      }
    }
    return svg(`<defs>${clipBody}</defs><g clip-path="url(#body)">${spots}</g>`);
  }
  if (kind === 'cage') {
    return svg(`
      <defs>${clipGlass}</defs>
      <g clip-path="url(#glass)">
        <path d="M 96 ${BELT - 3} L 132 21 L 136 21 L 100 ${BELT - 3} Z" fill="${C.metal}"/>
        ${rect(84, 28, 96, 2, C.metal)}
        ${rect(142, 20, 2, BELT - 22, C.metal)}
      </g>
      ${rect(90, SILL - 4, 106, 4, C.metalDark)}
      ${rect(90, SILL - 4, 106, 1, C.metal)}
      ${rect(282, 64, 3, 4, '#d14b2a')}
    `);
  }
  if (kind === 'light') {
    let weave = '';
    for (let y = BELT; y < 53; y++) {
      for (let x = 191; x < 274; x++) {
        const top = BELT + ((x - 190) * 7) / 84;
        if (y < top + 1) continue;
        weave += rect(x, y, 1, 1, (x + y) % 4 < 2 ? '#26272c' : '#34363c');
      }
    }
    return svg(`
      <defs>${clipBody}</defs>
      <g clip-path="url(#body)">${weave}${rect(191, 53, 83, 1, C.outline)}</g>
      <path d="${QUARTER_GLASS}" fill="#0e131b"/>
    `);
  }
  throw new Error(kind);
}

/** Спойлеры: краска (перекрашивается вместе с кузовом) и чёрные стойки. */
function layerSpoiler(kind, part) {
  if (kind === 'lip') {
    const lip = `M 7 ${BELT - 1} L 40 ${BELT - 3} L 46 ${BELT - 6} L 9 ${BELT - 4} Z`;
    return part === 'paint'
      ? svg(
          `<path d="${lip}" fill="${G.light}"/><path d="${lip}" fill="none" stroke="${C.outline}" stroke-width="1"/>`,
        )
      : svg('');
  }
  const blade = `M 2 31 L 50 28 L 52 32 L 4 35 Z`;
  if (part === 'base') {
    return svg(`
      <path d="M 16 ${BELT - 1} L 21 ${BELT - 1} L 23 33 L 19 33 Z" fill="${C.trim}"/>
      <path d="M 40 ${BELT - 2} L 45 ${BELT - 2} L 45 31 L 41 31 Z" fill="${C.trim}"/>
    `);
  }
  return svg(`
    <path d="${blade}" fill="${G.light}"/>
    ${rect(4, 33, 47, 1, G.mid)}
    <path d="${blade}" fill="none" stroke="${C.outline}" stroke-width="1"/>
    <rect x="1" y="27" width="3" height="10" fill="${G.base}" stroke="${C.outline}" stroke-width="1"/>
  `);
}

/** Кирпичи под передней ступицей и голый тормозной диск, пока колёс нет. */
function layerBricks() {
  const cx = FRONT_X;
  return svg(`
    <circle cx="${cx}" cy="${WHEEL_Y}" r="10" fill="${C.metalDark}"/>
    <circle cx="${cx}" cy="${WHEEL_Y}" r="9" fill="${C.brake}"/>
    <circle cx="${cx}" cy="${WHEEL_Y}" r="4" fill="${C.metal}"/>
    ${rect(cx - 1, WHEEL_Y - 1, 2, 2, C.metalDark)}
    ${rect(cx - 13, GROUND - 14, 26, 7, C.brick)}
    ${rect(cx - 13, GROUND - 7, 26, 7, C.brick)}
    ${rect(cx - 13, GROUND - 8, 26, 1, C.mortar)}
    ${rect(cx, GROUND - 14, 1, 6, C.mortar)}
    ${rect(cx - 7, GROUND - 7, 1, 7, C.mortar)}
    ${rect(cx + 6, GROUND - 7, 1, 7, C.mortar)}
    <rect x="${cx - 13}" y="${GROUND - 14}" width="26" height="14" fill="none" stroke="${C.brickDark}" stroke-width="1"/>
  `);
}

// ---------- Колёса: шина (не перекрашивается) + диск (серый). 16 кадров на оборот ----------

const TIRES = {
  stock: { r: WHEEL_R, rim: 12, spokes: 6, style: 'holes' },
  studded: { r: WHEEL_R, rim: 11, spokes: 8, style: 'steel', studs: true },
  slicks: { r: WHEEL_R, rim: 14, spokes: 5, style: 'sport' },
  old: { r: WHEEL_R, rim: 11, spokes: 4, style: 'steel', flat: true },
};

function tireSvg(t, angle) {
  const c = FRAME / 2;
  let marks = '';
  for (let i = 0; i < 4; i++) {
    const a = ((angle + i * 90) * Math.PI) / 180;
    const rr = (t.r + t.rim) / 2 + 1;
    marks += rect(
      Math.round(c + Math.cos(a) * rr - 1),
      Math.round(c + Math.sin(a) * rr - 1),
      2,
      2,
      C.rubberHi,
    );
  }
  let studs = '';
  if (t.studs) {
    for (let i = 0; i < 16; i++) {
      const a = ((angle + i * 22.5) * Math.PI) / 180;
      studs += rect(
        Math.round(c + Math.cos(a) * (t.r - 1)),
        Math.round(c + Math.sin(a) * (t.r - 1)),
        1,
        1,
        '#c9ced6',
      );
    }
  }
  // Спущенное колесо: низ сплющен.
  const squash = t.flat
    ? `<rect x="${c - t.r + 4}" y="${c + t.r - 2}" width="${t.r * 2 - 8}" height="2" fill="${C.rubber}"/>`
    : '';
  return svg(
    `
    <circle cx="${c}" cy="${c}" r="${t.r}" fill="${C.outline}"/>
    <circle cx="${c}" cy="${c}" r="${t.r - 1}" fill="${C.rubber}"/>
    ${squash}
    <circle cx="${c}" cy="${c}" r="${t.rim + 2}" fill="${C.outline}"/>
    ${marks}${studs}
  `,
    { w: FRAME, h: FRAME },
  );
}

function rimSvg(t, angle) {
  const c = FRAME / 2;
  const R = t.rim;
  let spokes = '';
  const step = 360 / t.spokes;
  for (let i = 0; i < t.spokes; i++) {
    const a = angle + i * step;
    if (t.style === 'sport') {
      spokes += `<g transform="rotate(${a} ${c} ${c})"><path d="M ${c - 1.5} ${c - 3} L ${c + 1.5} ${c - 3} L ${c + 3} ${c - R + 1} L ${c - 3} ${c - R + 1} Z" fill="${G.light}"/>${rect(c - 1, c - R + 2, 1, R - 5, G.hi)}</g>`;
    } else if (t.style === 'holes') {
      spokes += `<g transform="rotate(${a} ${c} ${c})"><circle cx="${c}" cy="${c - R * 0.6}" r="2.6" fill="${C.outline}"/></g>`;
    } else {
      spokes += `<g transform="rotate(${a} ${c} ${c})">${rect(c - 1, c - R + 3, 2, 3, C.outline)}</g>`;
    }
  }
  const face = t.style === 'sport' ? C.outline : G.base;
  return svg(
    `
    <circle cx="${c}" cy="${c}" r="${R}" fill="${G.mid}"/>
    <circle cx="${c}" cy="${c}" r="${R - 1}" fill="${face}"/>
    ${spokes}
    <circle cx="${c}" cy="${c}" r="${t.style === 'sport' ? 3 : 4}" fill="${G.low}"/>
    ${rect(c - 1, c - 1, 2, 2, G.hi)}
    <path d="M ${c - R + 2} ${c - 4} A ${R - 2} ${R - 2} 0 0 1 ${c - 4} ${c - R + 2}" fill="none" stroke="${G.hi}" stroke-width="1"/>
  `,
    { w: FRAME, h: FRAME },
  );
}

// ---------- Растеризация ----------

const render = (text) => sharp(Buffer.from(text), { density: 72 }).png().toBuffer();

async function applyMask(png, maskSvg) {
  const mask = await sharp(Buffer.from(maskSvg), { density: 72 }).greyscale().raw().toBuffer();
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < info.width * info.height; i++) if (mask[i] < 128) data[i * 4 + 3] = 0;
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

/** Жёсткая альфа: без полупрозрачных краёв, чтобы пиксели оставались чёткими. */
async function hardAlpha(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] < 110 ? 0 : 255;
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function strip(makeSvg) {
  const frames = [];
  for (let i = 0; i < FRAMES; i++) frames.push(await render(makeSvg((i * 360) / FRAMES)));
  return sharp({
    create: {
      width: FRAME * FRAMES,
      height: FRAME,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(frames.map((input, i) => ({ input, left: i * FRAME, top: 0 })))
    .png()
    .toBuffer();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const files = {};
  const save = async (name, buf) => {
    const out = await hardAlpha(buf);
    writeFileSync(`${OUT}${name}.png`, out);
    files[name] = out;
  };

  await save('car_wells', await render(layerWells()));
  await save('car_base', await render(layerBase()));
  await save('car_paint', await applyMask(await render(layerPaint()), layerPaintMask()));
  await save('car_headlight', await render(layerHeadlight()));
  await save('car_dirt', await render(layerDirt()));
  for (const k of ['rust', 'cage', 'light'])
    await save(`car_overlay_${k}`, await render(layerOverlay(k)));
  await save('car_spoiler_lip_paint', await render(layerSpoiler('lip', 'paint')));
  await save('car_spoiler_wing_paint', await render(layerSpoiler('wing', 'paint')));
  await save('car_spoiler_wing_base', await render(layerSpoiler('wing', 'base')));
  await save('car_bricks', await render(layerBricks()));
  for (const [id, t] of Object.entries(TIRES)) {
    await save(`wheel_tire_${id}`, await strip((a) => tireSvg(t, a)));
    await save(`wheel_rim_${id}`, await strip((a) => rimSvg(t, a)));
  }

  const meta = {
    $comment:
      'Сгенерировано tools/build-car.mjs (npm run car) — не править руками. Пиксели спрайта; привязка — середина низа (земля).',
    size: { width: W, height: H },
    anchor: { x: W / 2, y: GROUND },
    wheels: {
      rear: { x: REAR_X, y: WHEEL_Y },
      front: { x: FRONT_X, y: WHEEL_Y },
      radius: WHEEL_R,
    },
    wheelFrame: { width: FRAME, height: FRAME, frames: FRAMES },
    headlight: { x: 280, y: 55 },
    tires: {
      wheels_stock: 'stock',
      wheels_studded: 'studded',
      wheels_slicks: 'slicks',
      none: 'old',
    },
    overlays: { body_rusty: 'rust', body_cage: 'cage', body_light: 'light' },
    spoilers: {
      spoiler_lip: { paint: 'car_spoiler_lip_paint' },
      spoiler_wing: { paint: 'car_spoiler_wing_paint', base: 'car_spoiler_wing_base' },
    },
  };
  writeFileSync(`${ROOT}data/car.json`, JSON.stringify(meta, null, 2) + '\n');
  console.log(`✓ ${Object.keys(files).length} файлов в public/assets/images/car, data/car.json`);
  if (PREVIEW) await preview(files);
}

/** Превью: несколько сборок и цветов рядом, увеличено ×3. */
async function preview(files) {
  const tint = async (buf, hex) => {
    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const n = parseInt(hex.slice(1), 16);
    const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    for (let i = 0; i < data.length; i += 4) {
      for (let k = 0; k < 3; k++) data[i + k] = (data[i + k] * rgb[k]) / 255;
    }
    return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toBuffer();
  };
  const frame0 = (buf) =>
    sharp(buf).extract({ left: 0, top: 0, width: FRAME, height: FRAME }).png().toBuffer();
  const wheel = async (type, rimHex) => [
    await frame0(files[`wheel_tire_${type}`]),
    await tint(await frame0(files[`wheel_rim_${type}`]), rimHex),
  ];

  const variants = [
    { paint: '#a8adb3', tire: null, overlay: 'rust', dirt: true },
    { paint: '#a8adb3', tire: 'studded', overlay: 'rust', rim: '#c0c4c8', spoiler: 'lip' },
    { paint: '#1f3f8f', tire: 'slicks', overlay: 'light', rim: '#c9a23a', spoiler: 'wing' },
    { paint: '#8b1a2b', tire: 'stock', overlay: 'cage', rim: '#1c1c1f' },
    { paint: '#e8e8e0', tire: 'slicks', overlay: 'light', rim: '#c0c4c8', spoiler: 'wing' },
  ];
  const rows = [];
  for (const v of variants) {
    const layers = [];
    const add = (input, left = 0, top = 0) => layers.push({ input, left, top });
    add(files.car_wells);
    const at = (x) => [x - FRAME / 2, WHEEL_Y - FRAME / 2];
    if (v.tire) {
      for (const x of [REAR_X, FRONT_X])
        for (const b of await wheel(v.tire, v.rim)) add(b, ...at(x));
    } else {
      for (const b of await wheel('old', '#7a7f86')) add(b, ...at(REAR_X));
      add(files.car_bricks);
    }
    if (v.spoiler === 'wing') add(files.car_spoiler_wing_base);
    add(files.car_base);
    add(await tint(files.car_paint, v.paint));
    add(files[`car_overlay_${v.overlay}`]);
    if (v.spoiler === 'lip') add(await tint(files.car_spoiler_lip_paint, v.paint));
    if (v.spoiler === 'wing') add(await tint(files.car_spoiler_wing_paint, v.paint));
    add(await tint(files.car_headlight, '#ffe8b0'));
    if (v.dirt) add(files.car_dirt);
    rows.push(
      await sharp({ create: { width: W, height: H, channels: 4, background: '#2a2724' } })
        .composite(layers)
        .png()
        .toBuffer(),
    );
  }
  mkdirSync(`${ROOT}art/preview`, { recursive: true });
  const sheet = await sharp({
    create: { width: W, height: H * rows.length, channels: 4, background: '#2a2724' },
  })
    .composite(rows.map((input, i) => ({ input, left: 0, top: i * H })))
    .png()
    .toBuffer();
  await sharp(sheet)
    .resize(W * 3, H * rows.length * 3, { kernel: 'nearest' })
    .toFile(`${ROOT}art/preview/car.png`);
  console.log('✓ превью art/preview/car.png');
}

await main();
