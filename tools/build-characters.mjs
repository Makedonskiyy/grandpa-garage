#!/usr/bin/env node
/**
 * build-characters — генератор пиксельных портретов персонажей для сцен истории.
 *
 * Каждый персонаж — бюст по пояс в три четверти, лицом вправо, 120×160 пикселей арта.
 * Кадры в одной ленте: 0 — молчит, 1 — говорит (рот открыт), 2 — моргает.
 * Персонажа справа экрана игра отражает по горизонтали, чтобы он смотрел на собеседника.
 * Растеризация без сглаживания (crispEdges): чистый пиксель-арт с обводкой.
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

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${body}</svg>`;
const rect = (x, y, w, h, fill) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
const path = (d, fill, stroke, sw = 1) =>
  `<path d="${d}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/>`;

const OUTLINE = '#1a1412';

// ---------- Общие части ----------

/** Голова в три четверти лицом вправо: овал, челюсть, нос выступает. */
const HEAD =
  'M 46 32 Q 48 18 63 16 Q 79 16 83 30 L 84 41 L 88 51 L 84 53 L 84 58 Q 83 60 81 61 L 81 64 Q 79 71 71 74 Q 61 76 53 72 Q 46 66 45 57 Z';
const NECK = 'M 51 66 L 68 70 L 69 88 L 50 88 Z';
const EAR = 'M 44 44 Q 40 46 41 52 Q 42 57 47 57 L 48 46 Z';

function face(p, frame) {
  const s = p.skin;
  let out = '';
  // Шея и тень от подбородка.
  out += path(NECK, s.shade, OUTLINE);
  out += rect(51, 74, 17, 4, s.deep);
  // Голова.
  out += path(HEAD, s.base, OUTLINE);
  // Объём: дальняя щека и челюсть в тени, свет сверху справа.
  out += path('M 46 34 Q 47 50 50 60 Q 53 68 60 73 Q 52 72 47 66 Q 45 56 46 34 Z', s.shade);
  out += path('M 66 18 Q 77 18 81 28 L 76 26 Q 72 21 66 20 Z', s.hi);
  out += rect(76, 44, 3, 8, s.hi); // скула
  out += path('M 60 72 Q 70 72 78 66 L 80 64 Q 78 71 71 74 Q 64 75 60 72 Z', s.shade); // под челюстью
  // Ухо.
  out += path(EAR, s.shade, OUTLINE);
  out += rect(43, 49, 2, 4, s.deep);
  // Нос: тень снизу, ноздря.
  out += path('M 84 53 L 88 51 L 85 55 L 81 56 Z', s.shade);
  out += rect(81, 54, 2, 1, s.deep);
  // Глаза: ближний (левее) и дальний у переносицы.
  if (frame === 'blink') {
    out += rect(59, 45, 6, 1, OUTLINE);
    out += rect(73, 45, 4, 1, OUTLINE);
  } else {
    out += rect(59, 43, 6, 3, '#f1ebe3');
    out += rect(62, 43, 3, 3, p.eye);
    out += rect(63, 43, 1, 1, '#ffffff');
    out += rect(59, 42, 6, 1, OUTLINE);
    out += rect(73, 43, 4, 3, '#f1ebe3');
    out += rect(75, 43, 2, 3, p.eye);
    out += rect(73, 42, 4, 1, OUTLINE);
  }
  // Брови.
  out += rect(57, p.browY ?? 39, 9, 2, p.brow);
  out += rect(72, (p.browY ?? 39) - 0, 6, 2, p.brow);
  // Рот.
  if (frame === 'talk') {
    out += rect(70, 63, 8, 4, '#3a1e1a');
    out += rect(71, 63, 6, 1, '#efe6dc');
    out += rect(71, 66, 6, 1, '#8c4a42');
  } else {
    out += rect(70, 64, 8, 1, s.lip);
    out += rect(69, 63, 1, 1, s.deep);
  }
  // Возраст: морщины, носогубка.
  if (p.age === 'old') {
    out += rect(66, 47, 1, 3, s.deep);
    out += rect(78, 47, 2, 1, s.deep);
    out += rect(67, 57, 1, 5, s.deep);
    out += rect(56, 48, 2, 1, s.deep);
  } else {
    out += rect(68, 59, 1, 3, s.shade);
  }
  return out;
}

// ---------- Персонажи ----------

/** Внук: ~25 лет, тёмные волосы, лёгкая щетина, чёрная кожанка поверх серой толстовки. */
function grandson(frame) {
  const p = {
    skin: { base: '#d9a17e', shade: '#b97d5d', hi: '#ecbd9c', deep: '#8e5a43', lip: '#9e5a4a' },
    eye: '#3a2a20',
    brow: '#2a211c',
    browY: 39,
  };
  let out = '';
  // Куртка: плечи, рукава, молния, воротник.
  out += path(
    'M 6 160 L 10 118 Q 16 102 40 96 L 50 92 L 70 92 L 82 95 Q 104 102 110 120 L 114 160 Z',
    '#24222a',
    OUTLINE,
  );
  out += path('M 82 95 Q 104 102 110 120 L 112 140 L 100 118 Q 94 104 82 99 Z', '#3a3842'); // свет на плече
  out += path('M 10 118 Q 16 104 30 99 L 26 124 L 18 160 L 6 160 Z', '#16151a'); // тень дальнего плеча
  out += rect(30, 130, 2, 30, '#16151a'); // складка рукава
  // Толстовка и капюшон у шеи.
  out += path('M 44 92 Q 60 104 78 94 L 80 100 Q 62 114 44 100 Z', '#6d6f75', OUTLINE);
  out += path('M 52 100 L 66 102 L 64 160 L 54 160 Z', '#5d5f66'); // толстовка в распахнутой куртке
  out += rect(58, 104, 1, 56, '#4a4c52');
  // Отвороты кожанки.
  out += path('M 46 98 L 54 104 L 50 132 L 40 112 Z', '#2f2d36', OUTLINE);
  out += path('M 70 100 L 82 98 L 86 116 L 72 132 Z', '#2f2d36', OUTLINE);
  out += rect(74, 112, 6, 1, '#4a4852'); // блик на коже
  out += '<g transform="translate(0 7)">'; // голова ниже — короче шея
  out += face(p, frame);
  // Щетина.
  out += path('M 60 70 Q 70 73 79 66 L 80 64 Q 78 71 71 74 Q 64 75 60 72 Z', '#a77a5e');
  // Волосы: короткие, взъерошенная чёлка, висок.
  out += path(
    'M 44 44 Q 41 24 55 15 Q 70 10 82 18 Q 87 24 84 33 L 79 30 L 74 33 L 69 29 L 63 33 L 58 30 L 53 35 L 50 44 L 47 48 Z',
    '#2a211c',
    OUTLINE,
  );
  out += path('M 60 15 Q 72 13 80 19 L 74 21 Q 67 18 60 19 Z', '#3c2f27');
  out += rect(48, 42, 3, 10, '#2a211c'); // висок
  return out + '</g>';
}

/** Палыч: ~60 лет, кепка-восьмиклинка, седые усы и виски, синяя рабочая куртка, клетчатая рубашка. */
function palych(frame) {
  const p = {
    skin: { base: '#d69a7a', shade: '#b47658', hi: '#e8b394', deep: '#875440', lip: '#8f5246' },
    eye: '#2f3a44',
    brow: '#bdb6aa',
    browY: 39,
    age: 'old',
  };
  let out = '';
  // Широкие плечи, тёмно-синяя рабочая куртка с воротником.
  out += path(
    'M 2 160 L 6 116 Q 14 98 40 93 L 50 90 L 72 90 L 86 93 Q 110 100 116 118 L 118 160 Z',
    '#2f3a4a',
    OUTLINE,
  );
  out += path('M 86 93 Q 110 100 116 118 L 117 140 L 104 116 Q 98 102 86 97 Z', '#40506a');
  out += path('M 6 116 Q 14 100 30 96 L 24 124 L 14 160 L 2 160 Z', '#232c39');
  out += rect(28, 128, 2, 32, '#232c39');
  // Клетчатая рубашка в вороте.
  out += path('M 46 92 L 72 92 L 70 160 L 50 160 Z', '#7a4c3c', OUTLINE);
  for (let y = 94; y < 160; y += 4) out += rect(50, y, 20, 1, '#5e3a2e');
  for (let x = 52; x < 70; x += 4) out += rect(x, 94, 1, 66, '#956050');
  // Воротник куртки.
  out += path('M 40 94 L 52 100 L 48 120 L 36 106 Z', '#3a4659', OUTLINE);
  out += path('M 70 98 L 84 94 L 88 110 L 74 120 Z', '#3a4659', OUTLINE);
  out += rect(78, 126, 10, 8, '#28323f'); // карман
  out += rect(78, 126, 10, 1, '#4a5a74');
  out += '<g transform="translate(0 7)">'; // голова ниже — короче шея
  out += face(p, frame);
  // Седые виски под кепкой.
  out += path('M 45 34 L 52 34 L 52 50 L 47 54 L 45 46 Z', '#bdb6aa', OUTLINE);
  out += rect(46, 40, 2, 8, '#a59e92');
  // Усы: густые, седые, свисают.
  out += path(
    'M 69 58 Q 76 56 84 59 L 84 62 Q 80 61 77 63 L 74 61 L 70 63 L 67 62 Z',
    '#cfc9be',
    OUTLINE,
  );
  out += rect(72, 58, 8, 1, '#e4dfd6');
  // Кепка-восьмиклинка с козырьком вправо.
  out += path(
    'M 41 36 Q 40 20 56 14 Q 74 10 86 20 Q 90 25 88 30 L 98 32 Q 98 35 94 36 L 82 35 L 46 38 Z',
    '#4a4237',
    OUTLINE,
  );
  out += path('M 56 15 Q 70 12 82 19 L 76 22 Q 66 17 56 18 Z', '#5f5647');
  out += path('M 82 31 L 98 32 Q 98 35 94 36 L 82 35 Z', '#38322a'); // козырёк
  out += rect(64, 14, 2, 2, '#38322a'); // пуговка
  out += rect(46, 35, 38, 1, '#38322a'); // тень от кепки на лбу
  return out + '</g>';
}

/** Дед: ~75 лет, ушанка со звездой (как на логотипе), очки, добрые морщины, старое пальто. */
function grandpa(frame) {
  const p = {
    skin: { base: '#d6a283', shade: '#b47f62', hi: '#e8bb9c', deep: '#865843', lip: '#8f5a4c' },
    eye: '#3a3a3a',
    brow: '#d8d3ca',
    browY: 40,
    age: 'old',
  };
  let out = '';
  // Пальто с меховым воротником.
  out += path(
    'M 4 160 L 8 118 Q 16 100 40 94 L 50 90 L 70 90 L 84 94 Q 108 100 114 118 L 116 160 Z',
    '#4b3f33',
    OUTLINE,
  );
  out += path('M 84 94 Q 108 100 114 118 L 115 140 L 102 116 Q 96 102 84 98 Z', '#5e5040');
  out += path('M 8 118 Q 16 102 30 97 L 24 124 L 16 160 L 4 160 Z', '#382f26');
  out += path('M 38 92 Q 60 108 84 94 L 86 104 Q 60 120 36 104 Z', '#8a7a68', OUTLINE); // мех
  for (let x = 40; x < 84; x += 3) out += rect(x, 100 + ((x * 7) % 5), 1, 2, '#a59482');
  out += rect(58, 108, 3, 52, '#382f26'); // борт
  out += rect(64, 120, 2, 2, '#c9b47a'); // пуговица
  out += rect(64, 136, 2, 2, '#c9b47a');
  out += '<g transform="translate(0 7)">'; // голова ниже — короче шея
  out += face(p, frame);
  // Седые усы и очки.
  out += path('M 69 58 Q 76 57 83 59 L 82 61 L 76 62 L 70 62 Z', '#e4dfd6', OUTLINE);
  out += `<rect x="57" y="41" width="10" height="7" fill="none" stroke="#5a4a3a" stroke-width="1"/>`;
  out += `<rect x="71" y="41" width="8" height="7" fill="none" stroke="#5a4a3a" stroke-width="1"/>`;
  out += rect(67, 43, 4, 1, '#5a4a3a');
  out += rect(50, 43, 7, 1, '#5a4a3a');
  out += rect(58, 42, 3, 1, '#ffffff');
  // Ушанка: макушка, отворот со звездой, уши опущены.
  out += path('M 40 40 Q 38 18 58 12 Q 78 8 88 22 L 88 32 L 42 36 Z', '#eea45a', OUTLINE);
  out += path('M 40 30 L 88 26 L 88 34 L 42 38 Z', '#d48a42', OUTLINE); // отворот
  out += path(
    'M 66 24 L 68 28 L 72 28 L 69 31 L 70 35 L 66 33 L 62 35 L 63 31 L 60 28 L 64 28 Z',
    '#1a1412',
  ); // звезда
  out += path('M 40 36 L 48 38 L 48 58 Q 44 62 40 58 Z', '#d48a42', OUTLINE); // ухо шапки
  out += path('M 58 14 Q 70 11 80 16 L 74 19 Q 66 15 58 17 Z', '#f6c08a');
  return out + '</g>';
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
  console.log(
    `✓ ${Object.keys(sheets).length} персонажа в public/assets/images/characters, data/characters.json`,
  );

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
