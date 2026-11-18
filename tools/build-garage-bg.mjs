#!/usr/bin/env node
/**
 * build-garage-bg — фон гаража для тюнинга, результата и финала из фото
 * art/source/garage_tuning.jpg (кирпичная стена, лампа дневного света, бетонный пол).
 *
 * 1. Компоновка под игру (мир 640×360, машина стоит на земле y = 248 над лотком интерфейса):
 *    низ стены на фото — y 1262 из 1536, это 82 % кадра — машина оказалась бы под лотком.
 *    Поэтому из глухого куска стены (ниже надписей, выше пола) вырезаются ровно 9 рядов кирпича
 *    (шаг кладки 37 px, стык не виден), а низ кадра достраивается зеркалом бетонного пола —
 *    он всё равно уходит под лоток. Низ стены встаёт на y ≈ 216, машина стоит на полу перед ней.
 *    Потолок и лампа остаются.
 * 2. Пиксели — функциями скилла codixel (P.resize усреднением, P.quantize с дизерингом
 *    на стыках тонов, P.cleanup одиночных точек), арт 320×180, в игре точка = 2×2 единицы мира.
 *
 *   npm run garage-bg
 * Нужен установленный скилл codixel (.claude/skills/codixel). Результат лежит в git.
 */
import sharp from 'sharp';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = `${ROOT}art/source/garage_tuning.jpg`;
const OUT = `${ROOT}public/assets/images/bg/garage_room.png`;
const CODIXEL = `${ROOT}.claude/skills/codixel/core/pixel.js`;
if (!existsSync(CODIXEL)) throw new Error('Нужен скилл codixel: .claude/skills/codixel');
// Файл codixel — обычный скрипт (CommonJS), а пакет проекта — ES-модули: запускаем его в vm.
const codixelModule = { exports: {} };
const codixelSource = `(function (module, require) {\n${readFileSync(CODIXEL, 'utf8')}\n})`;
vm.runInThisContext(codixelSource, { filename: CODIXEL })(
  codixelModule,
  createRequire(import.meta.url),
);
const P = codixelModule.exports;

// Разметка фото (px исходника 2752×1536).
const CUT_FROM = 820; // ниже надписей на стене
const BRICK = 37; // шаг кладки
const CUT = BRICK * 9; // 333 — девять рядов
const FLOOR_FROM = 1262; // низ стены
const ART = { w: 320, h: 180 };
const GRADE = { brightness: 0.86, saturation: 1.22, warm: 0.05 };
const COLORS = 48;

const img = sharp(SRC);
const { width: W, height: H } = await img.metadata();
const canvasH = Math.round((W * 9) / 16); // 1548 — кадр 16:9
const top = await sharp(SRC).extract({ left: 0, top: 0, width: W, height: CUT_FROM }).toBuffer();
const rest = await sharp(SRC)
  .extract({ left: 0, top: CUT_FROM + CUT, width: W, height: H - CUT_FROM - CUT })
  .toBuffer();
const joinedH = H - CUT;
const extra = canvasH - joinedH;
// Зеркало низа пола — продолжение бетона под лотком интерфейса.
const floor = await sharp(SRC)
  .extract({ left: 0, top: H - extra, width: W, height: extra })
  .flip()
  .toBuffer();
const composed = await sharp({
  create: { width: W, height: canvasH, channels: 3, background: '#000' },
})
  .composite([
    { input: top, left: 0, top: 0 },
    { input: rest, left: 0, top: CUT_FROM },
    { input: floor, left: 0, top: joinedH },
  ])
  .modulate({ brightness: GRADE.brightness, saturation: GRADE.saturation })
  // Тёплый свет: синий и немного зелёный канал чуть ниже (tint переводит в серое — не он).
  .linear([1, 1 - GRADE.warm / 2, 1 - GRADE.warm], [0, 0, 0])
  .raw()
  .ensureAlpha()
  .toBuffer({ resolveWithObject: true });

// codixel: буфер — Uint32 ABGR, как у RGBA-байтов в little-endian.
const src = new P.Buf(composed.info.width, composed.info.height);
src.px.set(
  new Uint32Array(composed.data.buffer, composed.data.byteOffset, composed.data.length / 4),
);
const small = P.resize(src, ART.w, ART.h);
const { buf: quant } = P.quantize(small, COLORS, { dither: true });
const clean = P.cleanup(quant, { tol: 20 });

const raw = Buffer.from(clean.px.buffer, clean.px.byteOffset, clean.px.byteLength);
await sharp(raw, { raw: { width: ART.w, height: ART.h, channels: 4 } })
  .resize(ART.w * 2, ART.h * 2, { kernel: 'nearest' })
  .png()
  .toFile(OUT);

// Где на фоне низ стены — по этой линии ставится машина (data/config.json → garage.wallY).
const wallY = +(((FLOOR_FROM - CUT) / canvasH) * 360).toFixed(1);
const cfgPath = `${ROOT}data/config.json`;
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
cfg.garage.wallY = wallY;
writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
console.log(
  `✓ ${OUT.replace(ROOT, '')}: арт ${ART.w}×${ART.h}, ${COLORS} цветов; низ стены y = ${wallY}`,
);
