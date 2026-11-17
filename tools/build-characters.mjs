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
import { format } from 'prettier';

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

/**
 * Туловище с руками в три четверти: ближнее (левое) плечо шире дальнего, грудь развёрнута вправо.
 * c — цвета верхней одежды { base, shade, hi, fold }.
 */
function torso(c) {
  let s = '';
  s += shape(
    'M 2 160 L 4 138 Q 6 117 18 109 Q 31 102 49 99 L 77 99 Q 92 101 101 107 Q 109 114 111 131 L 113 160 Z',
    c.base,
  );
  // Ближняя рука и бок в тени (свет сверху справа).
  s += shape(
    'M 3 160 L 5 138 Q 7 118 18 110 Q 23 107 28 105 Q 25 116 24 130 L 23 160 Z',
    c.shade,
    false,
  );
  // Свет на дальнем плече и верхе груди.
  s += shape(
    'M 77 100 Q 91 102 100 108 Q 107 114 109 126 L 105 127 Q 102 116 95 111 Q 87 105 77 103 Z',
    c.hi,
    false,
  );
  s += shape('M 30 104 Q 40 101 49 100 L 48 103 Q 39 104 31 107 Z', c.hi, false);
  // Шов рукава и складки у подмышек — отделяют руки от груди.
  s += line('M 27 106 Q 24 118 24 130', c.fold);
  s += line('M 24 131 Q 22 146 23 160', c.fold);
  s += line('M 98 110 Q 96 128 97 160', c.fold);
  // Складки на локтях.
  s += line('M 9 146 L 15 149', c.fold);
  s += line('M 11 152 L 16 154', c.fold);
  s += line('M 104 146 L 109 144', c.fold);
  return s;
}

/**
 * Голова в три четверти лицом вправо. Нос — внутри лица, между глазами, как в портретах
 * визуальных новелл: контур справа — дальняя щека, нос лишь перекрывает её кончиком.
 * Боковая плоскость лица (от скулы к уху) в тени — так голова объёмная, а не плоский блин.
 */
const HEAD =
  'M 62 14 Q 78 13 84 26 Q 87 34 87 42 Q 87 50 85 57 Q 84 63 82 68 Q 80 73 76 75 L 66 75 Q 59 73 55 68 Q 49 62 47 53 L 45 40 Q 46 17 62 14 Z';
const SIDE_PLANE =
  'M 46 38 Q 49 31 54 28 Q 53 42 55 54 Q 56 63 59 71 Q 55 68 53 65 Q 48 60 47 53 Z';
const SIDE_SOFT =
  'M 54 28 Q 56 30 56 34 Q 55 44 57 54 Q 58 63 61 72 L 59 71 Q 56 63 55 54 Q 53 42 54 28 Z';
const JAW_SHADOW =
  'M 60 71 Q 66 74 76 74 Q 80 72 82 68 L 82 71 Q 80 75 76 76 L 66 76 Q 61 74 60 71 Z';
const NECK = 'M 54 60 L 72 68 L 73 92 L 51 92 Z';
const EAR = 'M 52 42 Q 45 41 44 47 Q 44 55 50 57 L 53 55 L 53 44 Z';

const mix = (a, b) => {
  const h = (c, i) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  return (
    '#' +
    [0, 1, 2]
      .map((i) =>
        Math.round((h(a, i) + h(b, i)) / 2)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
};

/**
 * p.brows — 'flat' | 'bushy' | 'low' (насупленные); p.mouth — 'neutral' | 'smirk' | 'smile'.
 */
function head(p, frame) {
  const s = { ...p.skin, mid: mix(p.skin.base, p.skin.shade) };
  let o = '';
  // Шея: тень от подбородка, свет справа.
  o += shape(NECK, s.base);
  o += shape('M 54 60 L 72 68 L 72 76 L 53 72 Z', s.shade, false);
  o += px(53, 72, 4, 20, s.shade);
  o += px(69, 78, 3, 14, s.hi);
  // Голова и объём.
  o += shape(HEAD, s.base);
  o += shape(SIDE_SOFT, s.mid, false);
  o += shape(SIDE_PLANE, s.shade, false);
  o += shape(JAW_SHADOW, s.shade, false);
  o += shape('M 64 16 Q 77 16 82 26 L 76 23 Q 70 19 64 18 Z', s.hi, false); // лоб
  o += px(80, 47, 3, 2, s.hi); // дальняя скула на свету
  o += px(65, 48, 3, 1, s.hi); // ближняя скула
  o += px(74, 70, 3, 2, s.hi); // подбородок
  // Ухо.
  o += shape(EAR, s.mid);
  o += px(46, 45, 1, 7, s.deep);
  o += px(47, 44, 3, 1, s.deep);
  o += px(48, 51, 2, 1, s.shade);
  o += px(49, 46, 1, 4, s.shade);
  // Глазницы: тень под бровью и у переносицы.
  o += shape('M 59 39 L 69 39 L 71 42 L 59 42 Z', s.mid, false);
  o += px(76, 39, 6, 2, s.mid);
  // Нос: ближний скат в тени, спинка и кончик на свету, ноздря, тень под носом.
  o += shape('M 72 41 L 74 48 L 73 52 L 70 52 L 71 47 Z', s.mid, false);
  o += shape('M 71 47 L 73 50 L 71 52 L 70 51 Z', s.shade, false);
  o += px(74, 42, 1, 6, s.hi); // спинка
  o += px(74, 48, 3, 2, s.hi); // кончик
  o += px(75, 50, 1, 1, s.hi);
  o += px(77, 49, 1, 3, s.mid); // кончик отделён от дальней щеки
  o += px(71, 52, 2, 1, s.deep); // ноздря
  o += px(73, 52, 4, 1, s.shade); // низ носа
  o += px(71, 54, 7, 1, s.mid); // тень от носа на губу
  o += px(74, 56, 1, 2, s.mid); // ложбинка над губой
  // Глаза: ближний крупнее, дальний уже; взгляд на собеседника (вправо).
  if (frame === 'blink') {
    o += px(60, 43, 8, 1, OUTLINE);
    o += px(61, 44, 6, 1, s.shade);
    o += px(77, 43, 5, 1, OUTLINE);
  } else {
    o += px(61, 42, 7, 3, '#f1ebe3');
    o += px(64, 42, 3, 3, p.eye);
    o += px(65, 43, 1, 1, '#120d0b'); // зрачок
    o += px(64, 42, 1, 1, '#ffffff'); // блик
    o += px(60, 41, 9, 1, OUTLINE); // верхнее веко
    o += px(60, 42, 1, 1, OUTLINE);
    o += px(77, 42, 5, 3, '#f1ebe3');
    o += px(79, 42, 2, 3, p.eye);
    o += px(80, 43, 1, 1, '#120d0b');
    o += px(79, 42, 1, 1, '#ffffff');
    o += px(77, 41, 6, 1, OUTLINE);
    o += px(82, 42, 1, 1, OUTLINE);
  }
  o += px(62, 45, 6, 1, s.mid); // нижнее веко
  o += px(78, 45, 4, 1, s.mid);
  // Брови.
  const brow = p.brow;
  if (p.brows === 'bushy') {
    o += shape('M 58 39 L 60 35 L 69 35 L 70 37 L 69 38 L 61 38 Z', brow, false);
    o += px(59, 39, 3, 1, brow); // свисают на внешнем краю
    o += shape('M 76 36 L 82 35 L 84 37 L 83 38 L 76 38 Z', brow, false);
    o += px(61, 36, 6, 1, p.browHi ?? brow);
  } else if (p.brows === 'low') {
    o += shape('M 59 38 L 61 36 L 69 37 L 70 39 L 61 38 Z', brow, false);
    o += shape('M 76 38 L 82 36 L 83 38 L 77 39 Z', brow, false);
  } else {
    o += shape('M 59 38 L 61 36 L 69 36 L 69 38 Z', brow, false);
    o += shape('M 76 37 L 82 36 L 83 38 L 76 38 Z', brow, false);
  }
  // Рот — под носом, по центру лица.
  if (frame === 'talk') {
    o += px(70, 59, 9, 4, '#3a1e1a');
    o += px(71, 59, 7, 1, '#efe6dc');
    o += px(71, 62, 7, 1, '#8c4a42');
    o += px(71, 63, 7, 1, s.lip);
    o += px(72, 64, 5, 1, s.shade);
  } else {
    o += px(70, 60, 9, 1, s.deep); // линия рта
    o += px(71, 59, 7, 1, s.lip); // верхняя губа
    o += px(71, 61, 7, 1, s.lipHi ?? s.base); // нижняя губа
    o += px(72, 62, 5, 1, s.shade); // тень под губой
    if (p.mouth === 'smile') {
      o += px(69, 59, 1, 1, s.deep);
      o += px(79, 59, 1, 1, s.deep);
      o += px(68, 58, 1, 1, s.shade); // ямочка щеки
    } else if (p.mouth === 'smirk') {
      o += px(69, 60, 1, 1, s.deep);
      o += px(79, 59, 1, 1, s.deep);
    } else {
      o += px(69, 60, 1, 1, s.deep);
    }
  }
  // Возраст.
  if (p.age === 'old') {
    o += px(63, 46, 4, 1, s.deep); // мешки под глазами
    o += px(58, 42, 1, 1, s.deep); // гусиные лапки
    o += px(57, 44, 2, 1, s.deep);
    o += px(58, 46, 1, 1, s.deep);
    o += px(69, 53, 1, 2, s.deep); // носогубные складки
    o += px(68, 55, 1, 3, s.deep);
    o += px(80, 54, 1, 3, s.shade);
    o += px(65, 28, 12, 1, s.shade); // морщины на лбу
    o += px(67, 31, 10, 1, s.shade);
  }
  return o;
}

// ---------- Персонажи ----------

/** Внук: ~25 лет, тёмные волосы, лёгкая щетина; чёрная кожанка нараспашку поверх серой толстовки. */
function grandson(frame) {
  const p = {
    skin: {
      base: '#d9a17e',
      shade: '#bb8061',
      hi: '#ecbd9c',
      deep: '#8e5a43',
      lip: '#a8655a',
      lipHi: '#c98a74',
    },
    eye: '#4a3426',
    brow: '#2a211c',
    mouth: 'smirk',
  };
  const jacket = { base: '#2b2a31', shade: '#1c1b21', hi: '#44424e', fold: '#131217' };
  let o = '';
  o += torso(jacket);
  // Толстовка в распахнутой куртке: дальше от света — темнее.
  o += shape('M 50 100 L 77 100 Q 78 130 81 160 L 55 160 Q 54 130 50 100 Z', '#6b6d75');
  o += shape('M 50 100 L 57 100 Q 59 130 61 160 L 55 160 Q 54 130 50 100 Z', '#585a62', false);
  o += px(60, 136, 18, 1, '#55575e'); // карман-кенгуру
  o += line('M 60 136 L 58 160', '#55575e');
  o += line('M 77 136 L 79 160', '#55575e');
  o += '<g transform="translate(0 17)">';
  o += head(p, frame);
  // Щетина по челюсти и над губой.
  o += shape(
    'M 59 66 Q 67 74 76 73 Q 80 71 81 67 L 82 63 Q 81 70 75 72 Q 67 73 60 67 Z',
    '#b48366',
    false,
  );
  o += px(71, 57, 7, 1, '#c28f72');
  // Волосы: короткая стрижка, чёлка набок, висок и затылок.
  o += shape(
    'M 45 44 Q 42 24 54 16 Q 68 9 81 16 Q 88 21 86 29 L 81 27 L 77 31 L 73 27 L 68 31 L 64 27 L 59 32 L 56 30 L 54 36 L 52 46 L 48 50 Z',
    '#2a211c',
  );
  o += shape('M 58 16 Q 70 12 80 18 L 75 21 Q 67 17 58 19 Z', '#43352b', false);
  o += px(51, 26, 2, 6, '#3a2e26');
  o += px(52, 38, 2, 9, '#2a211c'); // висок
  o += '</g>';
  // Ворот толстовки и шнурки.
  o += shape('M 51 99 Q 63 106 76 99 L 76 102 Q 63 110 51 102 Z', '#7b7d85');
  o += px(60, 105, 1, 9, '#bfc0c4');
  o += px(70, 105, 1, 9, '#bfc0c4');
  o += px(60, 114, 1, 1, '#8a8b90');
  o += px(70, 114, 1, 1, '#8a8b90');
  // Отвороты косухи и молнии по краям.
  o += shape('M 45 98 L 55 103 L 53 126 L 41 110 Z', '#36343e');
  o += shape('M 77 98 L 88 97 L 92 111 L 79 126 Z', '#36343e');
  o += px(80, 106, 7, 1, '#5a5764'); // блик на коже
  o += line('M 53 127 Q 55 145 55 160', '#4a4852');
  o += line('M 79 127 Q 79 145 81 160', '#4a4852');
  o += px(54, 128, 2, 3, '#8a8d94'); // бегунок молнии
  return o;
}

/** Палыч: ~60 лет, кепка, седые виски и пышные усы; синяя рабочая куртка, клетчатая рубашка в вороте. */
function palych(frame) {
  const p = {
    skin: { base: '#d69a7a', shade: '#b67858', hi: '#e8b394', deep: '#875440', lip: '#9a5a4c' },
    eye: '#34414c',
    brow: '#a8a196',
    brows: 'low',
    mouth: 'smile',
    age: 'old',
  };
  const jacket = { base: '#2f3b4c', shade: '#212a37', hi: '#45566f', fold: '#19212c' };
  let o = '';
  o += torso(jacket);
  // Клетчатая рубашка в V-вырезе куртки (куртка застёгнута до груди).
  o += shape('M 50 100 L 77 100 L 65 128 Z', '#7a4c3c');
  for (let y = 103; y < 126; y += 4) o += px(52, y, 24, 1, '#5e3a2e');
  for (let x = 55; x < 76; x += 4) o += px(x, 100, 1, 26, '#95614f');
  o += '<g transform="translate(0 17)">';
  o += head(p, frame);
  // Седые виски из-под кепки.
  o += shape('M 46 35 L 54 35 L 54 48 L 50 54 L 46 46 Z', '#b9b2a6');
  o += px(48, 39, 2, 9, '#9d968a');
  // Усы: густые, седые, свисают над губой.
  o += shape(
    'M 67 58 Q 73 54 81 56 L 82 59 L 80 61 Q 77 59 74 60 Q 71 60 69 62 L 67 60 Z',
    '#bcb5a9',
  );
  o += px(70, 56, 9, 1, '#dcd6cc');
  o += px(69, 60, 4, 1, '#9b9488');
  o += px(76, 59, 3, 1, '#9b9488');
  // Кепка-восьмиклинка с козырьком вправо.
  o += shape(
    'M 42 37 Q 41 20 57 14 Q 75 10 87 20 Q 91 25 89 30 L 99 32 Q 99 35 95 36 L 83 35 L 47 39 Z',
    '#4a4237',
  );
  o += shape('M 57 15 Q 70 12 82 19 L 76 22 Q 66 17 57 18 Z', '#615848', false);
  o += shape('M 83 31 L 99 32 Q 99 35 95 36 L 83 35 Z', '#38322a', false);
  o += px(65, 14, 2, 2, '#38322a');
  o += px(47, 36, 38, 1, '#38322a');
  o += '</g>';
  // Воротник рубашки, отвороты и молния куртки.
  o += shape('M 50 99 L 58 104 L 55 109 L 48 102 Z', '#8a5847');
  o += shape('M 77 99 L 69 104 L 72 109 L 79 102 Z', '#8a5847');
  o += shape('M 44 97 L 52 101 L 65 129 L 60 131 L 38 108 Z', '#3a4659');
  o += shape('M 78 98 L 89 96 L 92 110 L 66 130 Z', '#3a4659');
  o += line('M 65 131 Q 66 146 67 160', '#7d8797');
  o += px(64, 131, 3, 3, '#a0a8b5'); // бегунок молнии
  // Нагрудный карман с клапаном на дальней стороне груди.
  o += shape('M 80 132 L 92 130 L 93 142 L 81 143 Z', '#283240');
  o += px(80, 131, 12, 2, '#4a5a74');
  return o;
}

/** Дед: ~75 лет, лысина с седым венчиком, кустистые брови, очки-«браулайнеры», усы, добрая улыбка;
 *  вязаный свитер в вырезе застёгнутого пиджака, ворот рубашки. */
function grandpa(frame) {
  const p = {
    skin: { base: '#dca78a', shade: '#bc8568', hi: '#efc4a8', deep: '#8a5a45', lip: '#9c6152' },
    eye: '#5a4632',
    brow: '#e2ddd3',
    browHi: '#f4f1eb',
    brows: 'bushy',
    mouth: 'smile',
    age: 'old',
  };
  const coat = { base: '#5a5146', shade: '#463f36', hi: '#72685b', fold: '#3a342c' };
  let o = '';
  o += torso(coat);
  // Свитер в V-вырезе пиджака: вязка — косички и ряды.
  o += shape('M 49 100 L 77 100 L 63 136 Z', '#7a3a38');
  for (let y = 108; y < 132; y += 6) o += px(52, y, 24, 1, '#5f2c2b');
  for (let x = 57; x < 74; x += 5) o += px(x, 103, 1, 28, '#8e4a45');
  o += shape('M 50 100 Q 63 109 76 100 L 75 104 Q 63 113 51 104 Z', '#6a3030'); // резинка ворота
  o += '<g transform="translate(0 17)">';
  o += head(p, frame);
  // Лысина: блик на макушке.
  o += shape('M 59 18 Q 71 14 80 21 L 75 23 Q 68 18 59 20 Z', '#f6d6c0', false);
  o += px(64, 17, 4, 1, '#fbe4d3');
  // Седой пушистый венчик над ухом и на затылке.
  o += shape(
    'M 43 45 Q 42 38 45 33 L 48 32 L 47 35 L 51 36 L 48 38 L 52 40 L 49 42 L 52 44 Z',
    '#dcd7cd',
    false,
  );
  o += px(44, 36, 1, 7, '#bfb9ae');
  o += px(46, 34, 2, 1, '#f2efe9');
  o += px(48, 39, 2, 1, '#f2efe9');
  o += px(43, 46, 2, 7, '#cfc9be'); // на затылке за ухом
  o += px(43, 49, 1, 3, '#b3ada1');
  // Очки: верхняя оправа толстая, нижняя — тонкая проволока, линзы с бликом.
  const rim = '#3a2e25';
  const wire = '#8c7a62';
  o += px(59, 39, 11, 2, rim); // верх ближней линзы
  o += px(59, 41, 1, 4, wire);
  o += px(69, 41, 1, 4, wire);
  o += px(60, 45, 9, 1, wire);
  o += px(76, 39, 8, 2, rim); // верх дальней линзы
  o += px(76, 41, 1, 4, wire);
  o += px(83, 41, 1, 4, wire);
  o += px(77, 45, 6, 1, wire);
  o += px(70, 40, 6, 1, rim); // перемычка над переносицей
  o += px(52, 40, 7, 1, rim); // дужка к уху
  o += px(61, 41, 2, 1, '#ffffff'); // блики на стёклах
  o += px(67, 44, 1, 1, '#d8e4ea');
  o += px(81, 41, 1, 1, '#ffffff');
  // Усы — белые, мягкие, с тенью снизу.
  o += shape(
    'M 67 58 Q 73 54 81 56 L 82 59 L 80 61 Q 77 59 74 60 Q 71 60 69 62 L 67 60 Z',
    '#dedad2',
  );
  o += px(70, 56, 9, 1, '#f4f1eb');
  o += px(69, 60, 4, 1, '#b9b3a8');
  o += px(76, 59, 3, 1, '#b9b3a8');
  o += '</g>';
  // Ворот рубашки и отвороты пиджака.
  o += shape('M 49 99 L 57 104 L 54 108 L 47 101 Z', '#e6e0d2');
  o += shape('M 77 99 L 69 104 L 72 108 L 79 101 Z', '#e6e0d2');
  o += shape('M 43 97 L 51 101 L 63 137 L 58 139 L 37 110 Z', '#655b4f');
  o += shape('M 78 98 L 89 96 L 92 112 L 64 138 Z', '#655b4f');
  o += line('M 63 139 Q 64 150 65 160', '#3a342c'); // борт пиджака
  o += px(66, 143, 2, 2, '#b6a274'); // пуговицы
  o += px(67, 154, 2, 2, '#b6a274');
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
  writeFileSync(
    `${ROOT}data/characters.json`,
    await format(JSON.stringify(meta), { parser: 'json' }),
  );
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
