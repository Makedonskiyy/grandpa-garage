#!/usr/bin/env node
/**
 * build-characters — генератор пиксельных портретов персонажей для сцен истории.
 *
 * Каждый персонаж — бюст по пояс в три четверти, лицом вправо, 120×160 пикселей арта.
 * Кадры в одной ленте: 0 — молчит, 1 — говорит (рот открыт), 2 — моргает.
 * Персонажа справа экрана игра отражает по горизонтали, чтобы он смотрел на собеседника.
 *
 * Порядок слоёв у всех одинаковый, чтобы ничего не «налезало»:
 *   задний ворот → туловище с руками → видимая в вороте одежда → шея → голова → волосы/шапка
 *   → передний ворот и отвороты.
 * Свет сверху справа: правые края светлее, дальняя (левая) сторона лица и тела в тени.
 *
 *   npm run characters              — собрать в public/assets/images/characters
 *   npm run characters -- --preview — плюс превью в art/preview/characters.png
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}public/assets/images/characters/`;
const W = 120;
const H = 160;
const FRAMES = ['idle', 'talk', 'blink'];
const OUTLINE = '#1c1512';

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${body}</svg>`;
const px = (x, y, w, h, fill) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
const shape = (d, fill, outline = true) =>
  `<path d="${d}" fill="${fill}"${outline ? ` stroke="${OUTLINE}" stroke-width="1"` : ''}/>`;
const line = (d, color) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="1"/>`;

// ---------- Каркас ----------

/** Туловище с руками: силуэт, тень дальней стороны, свет на ближнем плече, складки у подмышек. */
function torso(c) {
  let s = '';
  s += shape(
    'M 4 160 L 7 130 Q 9 111 22 104 Q 34 98 50 95 L 70 95 Q 86 98 98 105 Q 108 112 110 130 L 112 160 Z',
    c.base,
  );
  // Тень дальней (левой) стороны и руки.
  s += shape('M 5 160 L 8 130 Q 10 112 22 105 Q 28 102 32 101 L 27 116 L 24 160 Z', c.shade, false);
  // Свет на плече справа.
  s += shape(
    'M 70 96 Q 86 99 97 106 Q 106 112 108 126 L 104 127 Q 102 115 94 109 Q 84 102 70 99 Z',
    c.hi,
    false,
  );
  // Складки, отделяющие руки от туловища.
  s += line('M 27 114 Q 29 136 28 160', c.fold);
  s += line('M 95 113 Q 93 136 94 160', c.fold);
  // Складки у локтя.
  s += line('M 12 140 L 18 143', c.fold);
  s += line('M 101 141 L 106 139', c.fold);
  return s;
}

/** Голова в три четверти лицом вправо: нос лишь чуть выходит за контур. */
const HEAD =
  'M 64 16 Q 78 16 82 28 L 83 38 L 84 44 L 86 50 L 84 54 L 83 57 Q 83 62 81 66 Q 79 72 73 74 Q 63 76 55 71 Q 48 66 46 56 L 45 40 Q 47 20 64 16 Z';
const NECK = 'M 53 66 L 69 70 L 70 86 L 52 86 Z';
const EAR = 'M 46 44 Q 41 45 41 51 Q 42 57 47 57 Z';

function head(p, frame) {
  const s = p.skin;
  let o = '';
  // Шея: тень от подбородка сверху, мягкий свет справа.
  o += shape(NECK, s.base);
  o += px(53, 70, 17, 6, s.shade);
  o += px(53, 76, 4, 10, s.shade);
  o += px(66, 76, 3, 10, s.hi);
  // Голова.
  o += shape(HEAD, s.base);
  // Дальняя щека и челюсть в тени.
  o += shape('M 46 40 Q 47 56 50 63 Q 54 69 62 73 Q 53 72 48 66 Q 45 58 46 40 Z', s.shade, false);
  // Свет на лбу и скуле.
  o += shape('M 66 18 Q 77 18 80 27 L 75 25 Q 71 21 66 20 Z', s.hi, false);
  o += px(75, 47, 3, 5, s.hi);
  // Под челюстью.
  o += shape('M 62 73 Q 70 73 77 69 L 79 68 Q 77 73 73 74 Q 66 75 62 73 Z', s.shade, false);
  // Ухо.
  o += shape(EAR, s.shade);
  o += px(43, 49, 2, 5, s.deep);
  // Нос: спинка со светом, тень с ближней стороны, ноздря и тень под носом.
  o += px(82, 43, 1, 7, s.hi);
  o += px(79, 46, 2, 6, s.shade);
  o += px(80, 52, 1, 1, s.deep);
  o += px(78, 55, 5, 1, s.shade);
  // Глаза: ближний шире, дальний у переносицы уже; верхнее веко.
  if (frame === 'blink') {
    o += px(60, 45, 6, 1, OUTLINE);
    o += px(74, 45, 4, 1, OUTLINE);
  } else {
    o += px(60, 43, 6, 3, '#efe8df');
    o += px(63, 43, 2, 3, p.eye);
    o += px(63, 43, 1, 1, '#ffffff');
    o += px(60, 42, 6, 1, OUTLINE);
    o += px(74, 43, 4, 3, '#efe8df');
    o += px(76, 43, 2, 3, p.eye);
    o += px(74, 42, 4, 1, OUTLINE);
  }
  o += px(60, 47, 6, 1, s.shade); // нижнее веко
  // Брови.
  o += px(59, p.browY, 8, p.browH ?? 2, p.brow);
  o += px(73, p.browY, 6, p.browH ?? 2, p.brow);
  // Рот.
  if (frame === 'talk') {
    o += px(72, 62, 7, 4, '#3a1e1a');
    o += px(73, 62, 5, 1, '#efe6dc');
    o += px(73, 65, 5, 1, '#8c4a42');
  } else {
    o += px(72, 63, 7, 1, s.lip);
    o += px(71, p.smile ? 62 : 63, 1, 1, s.deep);
    if (p.smile) o += px(79, 62, 1, 1, s.deep);
  }
  // Возраст.
  if (p.age === 'old') {
    o += px(66, 48, 1, 3, s.deep); // мешки под глазами
    o += px(78, 47, 2, 1, s.deep); // гусиные лапки
    o += px(78, 49, 2, 1, s.deep);
    o += px(69, 56, 1, 6, s.deep); // носогубка
    o += px(56, 47, 2, 1, s.deep);
  }
  return o;
}

// ---------- Персонажи ----------

/** Внук: ~25 лет, тёмные волосы, лёгкая щетина; чёрная кожанка нараспашку поверх серой толстовки. */
function grandson(frame) {
  const p = {
    skin: { base: '#d9a17e', shade: '#ba7f5f', hi: '#ecbd9c', deep: '#8e5a43', lip: '#a05e4d' },
    eye: '#3a2a20',
    brow: '#2a211c',
    browY: 39,
  };
  const jacket = { base: '#2a2830', shade: '#1b1a20', hi: '#403e49', fold: '#141318' };
  let o = '';
  // Капюшон толстовки за шеей.
  o += shape('M 44 97 Q 60 88 78 97 L 76 102 Q 60 96 46 102 Z', '#62646b');
  o += torso(jacket);
  // Толстовка в распахнутой куртке.
  o += shape('M 50 98 L 70 98 L 69 160 L 52 160 Z', '#6d6f76');
  o += px(53, 120, 14, 1, '#5d5f66'); // карман-кенгуру
  o += px(53, 120, 1, 14, '#5d5f66');
  o += px(66, 120, 1, 14, '#5d5f66');
  o += '<g transform="translate(0 12)">'; // голова на плечах
  o += head(p, frame);
  // Щетина.
  o += shape('M 60 71 Q 70 74 79 67 L 80 65 Q 78 72 72 74 Q 65 75 60 72 Z', '#a87b5f', false);
  // Волосы: короткие, взъерошенная чёлка, висок.
  o += shape(
    'M 45 44 Q 42 24 55 16 Q 70 10 82 18 Q 87 24 84 32 L 79 29 L 74 32 L 69 28 L 63 32 L 58 29 L 53 34 L 50 44 L 47 49 Z',
    '#2a211c',
  );
  o += shape('M 60 16 Q 72 13 80 19 L 74 21 Q 67 18 60 19 Z', '#3d3028', false);
  o += px(48, 42, 3, 10, '#2a211c');
  o += '</g>';
  // Передний ворот толстовки и шнурки.
  o += shape('M 50 98 Q 60 104 70 98 L 70 101 Q 60 108 50 101 Z', '#7b7d84');
  o += px(56, 103, 1, 9, '#c9cacd');
  o += px(64, 103, 1, 9, '#c9cacd');
  // Отвороты кожанки и молния по краям.
  o += shape('M 46 97 L 55 104 L 51 128 L 42 110 Z', '#34323c');
  o += shape('M 74 98 L 84 97 L 88 112 L 70 128 Z', '#34323c');
  o += px(76, 108, 6, 1, '#55525e'); // блик на коже
  o += line('M 51 129 L 53 160', '#8a8d94');
  o += line('M 70 129 L 69 160', '#8a8d94');
  return o;
}

/** Палыч: ~60 лет, кепка-восьмиклинка, седые виски и усы; синяя рабочая куртка, клетчатая рубашка. */
function palych(frame) {
  const p = {
    skin: { base: '#d69a7a', shade: '#b57759', hi: '#e8b394', deep: '#875440', lip: '#8f5246' },
    eye: '#2f3a44',
    brow: '#bdb6aa',
    browY: 39,
    age: 'old',
  };
  const jacket = { base: '#2f3a4a', shade: '#222b38', hi: '#425370', fold: '#1a222d' };
  let o = '';
  o += torso(jacket);
  // Клетчатая рубашка в вороте.
  o += shape('M 50 98 L 70 98 L 68 160 L 52 160 Z', '#7a4c3c');
  for (let y = 101; y < 160; y += 4) o += px(52, y, 16, 1, '#5e3a2e');
  for (let x = 54; x < 68; x += 4) o += px(x, 99, 1, 61, '#94604f');
  o += px(59, 104, 2, 56, '#5e3a2e'); // планка с пуговицами
  o += px(59, 110, 2, 2, '#d8c9b4');
  o += px(59, 122, 2, 2, '#d8c9b4');
  o += '<g transform="translate(0 12)">'; // голова на плечах
  o += head(p, frame);
  // Седые виски из-под кепки.
  o += shape('M 46 35 L 53 35 L 52 50 L 48 54 L 46 47 Z', '#bdb6aa');
  o += px(47, 40, 2, 8, '#a59e92');
  // Усы: густые, седые, свисают.
  o += shape('M 71 57 Q 77 55 84 58 L 84 61 Q 80 60 77 62 L 74 60 L 71 62 L 68 61 Z', '#cfc9be');
  o += px(73, 57, 8, 1, '#e4dfd6');
  // Кепка-восьмиклинка с козырьком вправо.
  o += shape(
    'M 42 37 Q 41 20 57 14 Q 75 10 87 20 Q 91 25 89 30 L 99 32 Q 99 35 95 36 L 83 35 L 47 39 Z',
    '#4a4237',
  );
  o += shape('M 57 15 Q 70 12 82 19 L 76 22 Q 66 17 57 18 Z', '#5f5647', false);
  o += shape('M 83 31 L 99 32 Q 99 35 95 36 L 83 35 Z', '#38322a', false);
  o += px(65, 14, 2, 2, '#38322a');
  o += px(47, 36, 38, 1, '#38322a');
  o += '</g>';
  // Воротник рубашки и куртки.
  o += shape('M 50 98 L 58 104 L 55 108 L 49 101 Z', '#8a5847');
  o += shape('M 70 98 L 62 104 L 65 108 L 71 101 Z', '#8a5847');
  o += shape('M 44 97 L 52 102 L 47 122 L 38 108 Z', '#3a4659');
  o += shape('M 76 98 L 86 96 L 90 110 L 73 122 Z', '#3a4659');
  // Нагрудный карман с клапаном.
  o += shape('M 78 128 L 90 127 L 90 138 L 78 138 Z', '#283240');
  o += px(78, 128, 12, 2, '#4a5a74');
  return o;
}

/** Дед: ~75 лет, лысина с седым венчиком, кустистые брови, круглые очки, усы, добрая улыбка;
 *  вязаный свитер с узором под старым пиджаком, ворот рубашки. */
function grandpa(frame) {
  const p = {
    skin: { base: '#dca78a', shade: '#bb8467', hi: '#efc4a8', deep: '#8a5a45', lip: '#955c4d' },
    eye: '#4a3a2e',
    brow: '#e9e5dd',
    browY: 38,
    browH: 3,
    age: 'old',
    smile: true,
  };
  const coat = { base: '#5a5146', shade: '#463f36', hi: '#70665a', fold: '#3a342c' };
  let o = '';
  o += torso(coat);
  // Вязаный свитер с узором ромбами.
  o += shape('M 49 97 L 71 97 L 70 160 L 51 160 Z', '#7a3a38');
  for (let y = 106; y < 160; y += 8) {
    o += px(52, y, 17, 1, '#5c2a29');
    for (let x = 54; x < 68; x += 5) o += px(x, y + 4, 1, 1, '#a8705a');
  }
  o += px(52, 100, 17, 3, '#6a3030'); // резинка ворота свитера
  o += '<g transform="translate(0 12)">'; // голова на плечах
  o += head(p, frame);
  // Лысина: блик на макушке.
  o += shape('M 60 18 Q 72 15 80 22 L 75 24 Q 68 19 60 21 Z', '#f5d3bc', false);
  // Седой венчик волос над ухом и на затылке — пушистый.
  o += shape('M 46 44 Q 44 38 47 33 L 50 34 L 49 40 L 48 44 Z', '#e9e5dd');
  o += px(47, 36, 1, 6, '#cfcac0');
  // Морщины на лбу.
  o += px(66, 29, 10, 1, p.skin.shade);
  o += px(68, 32, 8, 1, p.skin.shade);
  // Круглые очки на дужке.
  o += `<circle cx="63" cy="44.5" r="4.5" fill="none" stroke="#6b5a48" stroke-width="1"/>`;
  o += `<circle cx="76" cy="44.5" r="3.5" fill="none" stroke="#6b5a48" stroke-width="1"/>`;
  o += px(67, 44, 5, 1, '#6b5a48');
  o += px(47, 44, 12, 1, '#6b5a48');
  o += px(61, 41, 2, 1, '#ffffff');
  // Усы — белые, мягкие.
  o += shape('M 73 57 Q 78 56 83 58 L 82 60 Q 78 59 74 60 Z', '#efebe4');
  o += '</g>';
  // Ворот рубашки и отвороты пиджака.
  o += shape('M 50 97 L 58 103 L 55 107 L 48 100 Z', '#e6e0d2');
  o += shape('M 70 97 L 62 103 L 65 107 L 72 100 Z', '#e6e0d2');
  o += shape('M 44 97 L 52 101 L 48 128 L 38 110 Z', '#655b4f');
  o += shape('M 76 98 L 86 96 L 90 112 L 72 128 Z', '#655b4f');
  o += px(86, 132, 2, 2, '#b6a274'); // пуговица
  o += px(86, 146, 2, 2, '#b6a274');
  return o;
}

const CHARACTERS = { grandson, palych, grandpa };

// ---------- Сборка ----------

async function main() {
  mkdirSync(OUT, { recursive: true });
  const sheets = {};
  for (const [id, draw] of Object.entries(CHARACTERS)) {
    const frames = [];
    for (const f of FRAMES)
      frames.push(
        await sharp(Buffer.from(svg(draw(f))))
          .png()
          .toBuffer(),
      );
    const sheet = await sharp({
      create: {
        width: W * FRAMES.length,
        height: H,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(frames.map((input, i) => ({ input, left: i * W, top: 0 })))
      .png()
      .toBuffer();
    writeFileSync(`${OUT}${id}.png`, sheet);
    sheets[id] = sheet;
  }
  const meta = {
    $comment:
      'Сгенерировано tools/build-characters.mjs (npm run characters). Лента кадров слева направо.',
    frame: { width: W, height: H },
    frames: FRAMES,
    characters: Object.keys(CHARACTERS),
  };
  writeFileSync(`${ROOT}data/characters.json`, JSON.stringify(meta, null, 2) + '\n');
  console.log(`✓ ${Object.keys(sheets).length} персонажа в public/assets/images/characters`);

  if (process.argv.includes('--preview')) {
    mkdirSync(`${ROOT}art/preview`, { recursive: true });
    const rows = Object.values(sheets);
    const sheet = await sharp({
      create: {
        width: W * FRAMES.length,
        height: H * rows.length,
        channels: 4,
        background: '#2a2724',
      },
    })
      .composite(rows.map((input, i) => ({ input, left: 0, top: i * H })))
      .png()
      .toBuffer();
    await sharp(sheet)
      .resize(W * FRAMES.length * 3, H * rows.length * 3, { kernel: 'nearest' })
      .toFile(`${ROOT}art/preview/characters.png`);
    console.log('✓ превью art/preview/characters.png');
  }
}

await main();
